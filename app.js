const byId = id => document.getElementById(id);
const isAdmin = location.pathname === '/admin';
byId(isAdmin ? 'admin' : 'portal').hidden = false;
document.querySelector('nav a[href="' + location.pathname + '"]')?.setAttribute('aria-current', 'page');

function message(id, text, error = false) {
  const element = byId(id);
  element.textContent = text;
  element.toggleAttribute('data-error', error);
}
async function api(path, options) {
  let response;
  try { response = await fetch('/api/reportes' + path, options); }
  catch { throw new Error('No hay conexión con el servidor.'); }
  const data = await response.json();
  if (!response.ok) throw new Error(data.error);
  return data;
}
async function photoData(file) {
  if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 12000000) {
    throw new Error('Selecciona un archivo JPG, PNG o WebP de hasta 12 MB.');
  }
  let bitmap;
  try { bitmap = await createImageBitmap(file); }
  catch { throw new Error('No se pudo abrir la fotografía.'); }
  try {
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d', {alpha:false});
    context.fillStyle = 'white';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const jpeg = canvas.toDataURL('image/jpeg', 0.72);
    if (jpeg.length <= 720000) return jpeg;
    throw new Error('La fotografía es demasiado grande. Prueba con otra.');
  } finally { bitmap.close(); }
}
byId('report').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button');
  button.disabled = true;
  message('notice', 'Enviando reporte…');
  try {
    const {categoria, ubicacion, descripcion, foto} = Object.fromEntries(new FormData(form));
    const {id} = await api('', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({categoria, ubicacion, descripcion, foto:await photoData(foto)})
    });
    form.reset();
    message('notice', 'Reporte registrado. Código: ' + id);
  } catch (error) {
    message('notice', error.message, true);
  } finally { button.disabled = false; }
});

let nextPage = null;
let activeKey = '';
const access = byId('access');
const next = byId('next');
const records = byId('records');
const dateFormat = new Intl.DateTimeFormat('es-GT', {
  dateStyle:'medium', timeStyle:'short', timeZone:'America/Guatemala'
});

function reportCard(report) {
  const card = document.createElement('article');
  const heading = document.createElement('h2');
  heading.textContent = report.categoria + ' · ' + report.ubicacion;
  const meta = document.createElement('p');
  meta.textContent = dateFormat.format(new Date(report.fecha)) + ' · Código: ' + report.id;
  const description = document.createElement('p');
  description.className = 'description';
  description.textContent = report.descripcion;
  const photo = document.createElement('img');
  photo.src = report.foto;
  photo.loading = 'lazy';
  photo.alt = 'Fotografía adjunta al reporte';
  card.append(heading, meta, description, photo);
  return card;
}
async function loadReports(cursor) {
  const button = access.querySelector('button');
  button.disabled = next.disabled = true;
  message('adminNotice', 'Cargando reportes…');
  try {
    const query = cursor ? '?' + new URLSearchParams({desde:cursor}) : '';
    const {reportes, siguiente} = await api(query, {headers:{Authorization:'Bearer ' + activeKey}});
    records.append(...reportes.map(reportCard));
    nextPage = siguiente;
    next.hidden = !siguiente;
    message('adminNotice', records.childElementCount ? records.childElementCount + ' reportes mostrados.' : 'Todavía no hay reportes registrados.');
  } catch (error) {
    message('adminNotice', error.message, true);
  } finally { button.disabled = next.disabled = false; }
}
access.addEventListener('submit', event => {
  event.preventDefault();
  activeKey = new FormData(access).get('key');
  access.reset();
  records.replaceChildren();
  next.hidden = true;
  nextPage = null;
  loadReports(null);
});
next.addEventListener('click', () => loadReports(nextPage));