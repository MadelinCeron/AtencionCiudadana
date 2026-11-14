import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

async function frontend(path = '/') {
  class Element {
    hidden = true;
    children = [];
    handlers = {};
    textContent = '';
    disabled = false;
    value = '';
    addEventListener(name, callback) {this.handlers[name] = callback;}
    querySelector() {return this.button ??= new Element();}
    toggleAttribute(name, value) {this[name] = value;}
    setAttribute(name, value) {this[name] = value;}
    append(...children) {this.children.push(...children);}
    replaceChildren(...children) {this.children = children;}
    get childElementCount() {return this.children.length;}
    reset() {this.resetCalled = true;}
  }
  const elements = new Map();
  const get = id => {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id);
  };
  const state = {requests:[], bitmapClosed:false};
  const jpeg = 'data:image/jpeg;base64,/9j/AAAA';
  const context = vm.createContext({
    location:{pathname:path}, Intl, URLSearchParams,
    document:{getElementById:get, querySelector:() => new Element(), createElement:tag => {
      if (tag !== 'canvas') return new Element();
      return state.canvas = {getContext:() => ({fillRect(){}, drawImage(){}}), toDataURL:(type, quality) => {
        assert.equal(type, 'image/jpeg'); assert.equal(quality, 0.72); return jpeg;
      }};
    }},
    createImageBitmap:async () => ({width:2400, height:1200, close(){state.bitmapClosed = true;}}),
    FormData:class {constructor(form){this.form = form;} [Symbol.iterator](){return Object.entries(this.form.fields)[Symbol.iterator]();} get(key){return this.form.fields[key];}},
    fetch:async (url, options) => {
      state.requests.push({url, options});
      return state.response ?? {ok:true, json:async () => ({id:'codigo-prueba'})};
    }
  });
  vm.runInContext(await readFile(new URL('../app.js', import.meta.url), 'utf8'), context);
  return {context, get, state, jpeg};
}

test('portal: compresión JPEG, fetch y código de confirmación', async () => {
  const {get, state, jpeg} = await frontend();
  const form = get('report');
  form.fields = {categoria:'Alumbrado', ubicacion:'Lugar ficticio', descripcion:'  Descripción original.\nCon tildes.  ', foto:{type:'image/png', size:1000}};
  await form.handlers.submit({preventDefault(){}, currentTarget:form});
  assert.equal(get('portal').hidden, false);
  assert.equal(state.canvas.width, 1200);
  assert.equal(state.canvas.height, 600);
  assert.equal(state.bitmapClosed, true);
  assert.equal(state.requests[0].url, '/api/reportes');
  assert.equal(state.requests[0].options.method, 'POST');
  const payload = JSON.parse(state.requests[0].options.body);
  assert.equal(payload.descripcion, form.fields.descripcion);
  assert.equal(payload.foto, jpeg);
  assert.equal(get('notice').textContent, 'Reporte registrado. Código: codigo-prueba');
  assert.equal(form.resetCalled, true);
  assert.equal(form.button.disabled, false);
});

test('panel: mismo código, descripción literal y foto sin insertar HTML', async () => {
  const {context, get, state, jpeg} = await frontend('/admin');
  const report = {id:'codigo-prueba', categoria:'Alumbrado', ubicacion:'Lugar ficticio', descripcion:'<script>texto literal</script>\nOriginal', fecha:'2026-11-14T12:00:00Z', foto:jpeg};
  state.response = {ok:true, json:async () => ({reportes:[report], siguiente:null})};
  await context.loadReports(null);
  assert.equal(get('admin').hidden, false);
  const card = get('records').children[0];
  assert.match(card.children[1].textContent, /codigo-prueba/);
  assert.equal(card.children[2].textContent, report.descripcion);
  assert.equal(card.children[3].src, report.foto);
  assert.equal(get('next').hidden, true);
});

test('interfaz: error de clave y foto ausente no se presentan como éxito', async () => {
  const {context, get, state} = await frontend('/admin');
  state.response = {ok:false, json:async () => ({error:'Clave municipal incorrecta.'})};
  await context.loadReports(null);
  assert.equal(get('adminNotice').textContent, 'Clave municipal incorrecta.');
  assert.equal(get('adminNotice')['data-error'], true);
  const form = get('report');
  form.fields = {categoria:'Agua', ubicacion:'Lugar ficticio', descripcion:'Descripción ficticia', foto:{type:'', size:0}};
  await form.handlers.submit({preventDefault(){}, currentTarget:form});
  assert.match(get('notice').textContent, /Selecciona un archivo/);
  assert.equal(form.resetCalled, undefined);
});
