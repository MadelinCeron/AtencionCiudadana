import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createHash, timingSafeEqual} from 'node:crypto';
import {initializeApp} from 'firebase-admin/app';
import {FieldValue, getFirestore} from 'firebase-admin/firestore';

const {FIREBASE_PROJECT_ID, ADMIN_KEY, PORT = 3000} = process.env;
if (!FIREBASE_PROJECT_ID || !ADMIN_KEY || ADMIN_KEY.length < 16 || /\s/.test(ADMIN_KEY)) {
  throw new Error('Configura FIREBASE_PROJECT_ID y ADMIN_KEY (mínimo 16 caracteres) en .env');
}
initializeApp({projectId: FIREBASE_PROJECT_ID});
const reports = getFirestore().collection('reportes');
const assets = {
  '/': ['index.html', 'text/html'],
  '/admin': ['index.html', 'text/html'],
  '/app.js': ['app.js', 'text/javascript'],
  '/style.css': ['style.css', 'text/css']
};
const digest = value => createHash('sha256').update(value).digest();
const keyHash = digest('Bearer ' + ADMIN_KEY);
const categories = ['Alumbrado', 'Calles', 'Limpieza', 'Agua', 'Otro'];
function send(res, status, data) {
  res.writeHead(status, {'Content-Type': 'application/json; charset=utf-8'});
  res.end(JSON.stringify(data));
}

createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && Object.hasOwn(assets, url.pathname)) {
      const [file, type] = assets[url.pathname];
      const contents = await readFile(new URL(file, import.meta.url));
      res.writeHead(200, {'Content-Type': type + '; charset=utf-8'});
      return res.end(contents);
    }
    if (url.pathname !== '/api/reportes') return send(res, 404, {error:'Ruta desconocida.'});
    if (req.method === 'POST') {
      let body = '';
      for await (const chunk of req.setEncoding('utf8')) {
        body += chunk;
        if (body.length > 740000) return send(res, 413, {error:'La solicitud supera el tamaño permitido.'});
      }
      let input;
      try { input = JSON.parse(body); } catch { return send(res, 400, {error:'La solicitud no es válida.'}); }
      const {categoria, ubicacion, descripcion, foto} = input ?? {};
      if (!categories.includes(categoria) ||
          typeof ubicacion !== 'string' || ubicacion.trim().length < 3 || ubicacion.length > 150 ||
          typeof descripcion !== 'string' || descripcion.trim().length < 10 || descripcion.length > 1500 ||
          typeof foto !== 'string' || foto.length > 720000 ||
          !/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]*={0,2}$/.test(foto)) {
        return send(res, 400, {error:'Revisa la categoría, ubicación, descripción y fotografía.'});
      }
      const data = {
        categoria, ubicacion: ubicacion.trim(), descripcion,
        foto, fecha: FieldValue.serverTimestamp()
      };
      // Margen conservador de 16 KiB para nombres y metadatos de Firestore.
      if (Buffer.byteLength(JSON.stringify(data), 'utf8') + 16384 >= 1048576) return send(res, 413, {error:'El documento supera el tamaño permitido.'});
      const doc = await reports.add(data);
      return send(res, 201, {id:doc.id});
    }
    if (req.method === 'GET') {
      if (!timingSafeEqual(keyHash, digest(req.headers.authorization ?? ''))) {
        return send(res, 401, {error:'Clave municipal incorrecta.'});
      }
      let query = reports.orderBy('fecha', 'desc').orderBy('__name__', 'desc').limit(11);
      const cursor = url.searchParams.get('desde');
      if (cursor !== null) {
        if (!/^[A-Za-z0-9]{20}$/.test(cursor)) return send(res, 400, {error:'Página inválida.'});
        const previous = await reports.doc(cursor).get();
        if (!previous.exists) return send(res, 404, {error:'Página no disponible.'});
        query = query.startAfter(previous);
      }
      const {docs} = await query.get();
      const page = docs.slice(0, 10);
      return send(res, 200, {
        reportes: page.map(doc => {
          const {fecha, ...data} = doc.data();
          return {...data, id:doc.id, fecha:fecha?.toDate?.().toISOString() ?? null};
        }),
        siguiente: docs.length > 10 ? page.at(-1).id : null
      });
    }
    return send(res, 405, {error:'Método no permitido.'});
  } catch (error) {
    console.error(error.code ?? error.name);
    if (!res.headersSent) send(res, 503, {error:'El servicio no está disponible. Intenta de nuevo.'});
  }
}).listen(Number(PORT), '127.0.0.1', () => console.log('Portal disponible en http://127.0.0.1:' + PORT));
