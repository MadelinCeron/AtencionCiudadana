// Prueba explícita: crea UN reporte ficticio persistente en Firestore real.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {initializeApp, deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {readFile, writeFile} from 'node:fs/promises';

const app = initializeApp({projectId:process.env.FIREBASE_PROJECT_ID});
const db = getFirestore(app);
const port = 3011;
const base = 'http://127.0.0.1:' + port;
const headers = {Authorization:'Bearer ' + process.env.ADMIN_KEY};
let child;
async function start() {
  child = spawn(process.execPath, ['--env-file=.env', 'server.js'], {
    env:{...process.env, PORT:String(port)}, stdio:['ignore','pipe','pipe']
  });
  child.stderr.on('data', data => process.stderr.write(data));
  await Promise.race([
    once(child.stdout, 'data'),
    once(child, 'exit').then(() => {throw new Error('El servidor terminó antes de iniciar.');}),
    new Promise((_, reject) => {const timer = setTimeout(() => reject(new Error('Tiempo de inicio agotado.')), 10000); timer.unref();})
  ]);
}
async function stop() {
  if (child && child.exitCode === null) {const exited = once(child, 'exit'); child.kill(); await exited;}
}
async function find(id) {
  let cursor = '';
  do {
    const res = await fetch(base + '/api/reportes' + (cursor ? '?desde=' + cursor : ''), {headers});
    assert.equal(res.status, 200);
    const data = await res.json();
    const found = data.reportes.find(report => report.id === id);
    if (found) return found;
    cursor = data.siguiente;
  } while (cursor);
  throw new Error('No aparece el reporte en el panel/API.');
}
try {
  const before = await db.collection('reportes').limit(1).get();
  console.log('Lectura real de Firestore correcta; muestra de documentos previos:', before.size);
  await start();
  for (const path of ['/', '/admin', '/app.js', '/style.css']) assert.equal((await fetch(base + path)).status, 200);
  assert.equal((await fetch(base + '/api/reportes', {headers:{Authorization:'Bearer incorrecta'}})).status, 401);
  const report = {categoria:'Alumbrado', ubicacion:'Lugar ficticio — demostración académica',
    descripcion:'  PRUEBA ACADÉMICA: lámpara ficticia apagada.\nDescripción original con tildes y saltos de línea.  ',
    foto:'data:image/jpeg;base64,' + (await readFile(new URL('./fixture.jpg', import.meta.url))).toString('base64')};
  const invalid = await fetch(base + '/api/reportes', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({...report, foto:undefined})});
  assert.equal(invalid.status, 400);
  const response = await fetch(base + '/api/reportes', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(report)});
  assert.equal(response.status, 201);
  const {id} = await response.json();
  assert.match(id, /^[A-Za-z0-9]{20}$/);
  const stored = (await db.collection('reportes').doc(id).get()).data();
  assert.equal(stored.descripcion, report.descripcion);
  assert.equal(stored.foto, report.foto);
  assert.ok(stored.fecha.toDate() instanceof Date);
  // Cálculo del tamaño según campos, valores, nombre del documento y 32 bytes adicionales.
  const utf8 = value => Buffer.byteLength(value, 'utf8') + 1;
  const documentBytes = utf8('reportes') + utf8(id) + 16 + 32 + Object.entries(stored).reduce((sum, [key,value]) => sum + utf8(key) + (typeof value === 'string' ? utf8(value) : 8), 0);
  assert.ok(documentBytes < 1048576);
  let listed = await find(id);
  assert.equal(listed.descripcion, report.descripcion);
  assert.equal(listed.foto, report.foto);
  for (const previous of before.docs) assert.deepEqual((await previous.ref.get()).data(), previous.data());
  await stop();
  await start();
  listed = await find(id);
  assert.equal(listed.descripcion, report.descripcion);
  assert.equal(listed.foto, report.foto);
  const result = {id, fecha:stored.fecha.toDate().toISOString(), documentBytes, lecturaReal:true, escrituraReal:true,
    apiPanel:true, persistenciaTrasReinicio:true, sinFoto:400, claveIncorrecta:401,
    navegadorReal:false, nota:'Envío por HTTP; la interfaz se prueba por separado. Reporte ficticio conservado para demostración.'};
  await writeFile('test/last-firestore-result.json', JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
} finally {
  await stop();
  await db.terminate();
  await deleteApp(app);
}
