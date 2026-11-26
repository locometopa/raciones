// Prueba de la interfaz con jsdom: ahora → ajustes → comida → cálculo → registro.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const www = path.join(__dirname, '..', 'www');
const html = fs.readFileSync(path.join(www, 'index.html'), 'utf8').replace(/<script src="[^"]+"><\/script>/g, '');

function boot(stored, pre) {
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://localhost/', pretendToBeVisual: true });
  const w = dom.window;
  if (pre) pre(w);
  w.scrollTo = () => {};
  w.HTMLElement.prototype.scrollIntoView = () => {};
  if (stored) w.localStorage.setItem('raciones.v1', JSON.stringify(stored));
  ['calc', 'foods', 'libre', 'vision', 'chart', 'learn', 'report', 'guides', 'measures', 'pdf', 'reportpdf', 'coach', 'app'].forEach((f) => w.eval(fs.readFileSync(path.join(www, 'js', f + '.js'), 'utf8')));
  return w;
}
let w = boot(), d = w.document;
const $ = (s) => d.querySelector(s);
const click = (el) => { assert.ok(el, 'falta un elemento para pulsar'); el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); };
const type = (el, v) => { assert.ok(el, 'falta un campo'); el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); };
const act = (a) => $('[data-act="' + a + '"]');
const text = () => $('#view').textContent;
const S = () => w.__raciones.state();
const setGlucose = (v, trend) => {
  click(act('editg')); $('#gi').value = String(v);
  if (trend !== undefined) click($('#gtr [data-v="' + trend + '"]'));
  click(act('gsave'));
};

// Versión coherente con package.json
assert.strictEqual(w.__raciones.version, require('../package.json').version);

// Primer arranque: se abre el asistente
assert.ok($('#dlg').textContent.includes('Vamos a dejar la app lista'));
const wzset = (p, v) => click($('[data-act="wzset"][data-p="' + p + '"][data-v="' + v + '"]'));
click(act('wznext'));
wzset('cfg.rapid', 'Fiasp'); wzset('cfg.basal', 'Tresiba'); wzset('cfg.step', '0.5');
assert.ok($('[data-act="wzset"][data-v="Fiasp"]').classList.contains('on'));
click(act('wznext'));
type($('[data-s="cfg.ratioAll"]'), '1,5');
click(act('wznext'));
type($('[data-s="cfg.target"]'), '100'); type($('[data-s="cfg.isf"]'), '40');
click(act('wznext'));
assert.ok($('#dlg').textContent.includes('entre 3 y 5 horas'), 'nota de Fiasp');
wzset('cfg.dia', '4');
click(act('wznext')); assert.ok($('#dlg').textContent.includes('LibreLinkUp')); click(act('wznext')); assert.ok(act('wzback')); click(act('wznext'));
assert.ok($('#dlg').textContent.includes('Resumen'));
assert.strictEqual($('#dlg').querySelectorAll('b').length - Array.from($('#dlg').querySelectorAll('b')).filter((b) => b.textContent === 'falta').length, 4, 'insulinas, ratio, corrección y duración hechos');
click(act('wznext'));
assert.strictEqual(S().cfg.setup, 'ok'); assert.strictEqual(S().cfg.ratios.cena, '1,5'); assert.strictEqual(S().cfg.rapid, 'Fiasp');

// Inicio: pantalla Ahora, sin glucosa ni gráfica
assert.ok($('[data-tab="ahora"]').classList.contains('on'));
assert.ok($('.gcard.none')); assert.ok(text().includes('Toca para escribirla'));
assert.ok(text().includes('Sin lecturas'));
assert.ok($('#sum').textContent.includes('Plato vacío') || $('#sum').hidden);

// Glucosa a mano desde la tarjeta → color según rango
setGlucose(150, 3);
assert.ok($('.gcard.in'), 'verde dentro de rango'); assert.ok(text().includes('150'));
setGlucose(200); assert.ok($('.gcard.high'));
setGlucose(300); assert.ok($('.gcard.vhigh'));
setGlucose(60); assert.ok($('.gcard.low'));
// Valor imposible: no se guarda
click(act('editg')); $('#gi').value = '1800'; click(act('gsave'));
assert.strictEqual(S().now.v, '60'); click(act('close'));

// Tresiba: se apunta desde Ahora y no cuenta como insulina activa
assert.ok(text().includes('Tresiba (lenta)')); assert.ok(text().includes('sin apuntar'));
click(act('basal')); $('#bu').value = '14'; click(act('basalsave'));
assert.ok(text().includes('14 U · hace 0 min'));
assert.ok(text().includes('Fiasp activa')); assert.ok($('.kv b').textContent.startsWith('0 U'), 'la lenta no suma: ' + $('.kv b').textContent);

// Ahora → botón grande «Voy a comer»
click($('[data-tab="ahora"]'));
click($('.qa.main[data-act="goto"]'));
assert.ok($('[data-tab="comida"]').classList.contains('on'));
assert.ok($('.gstrip'));

// Búsqueda en línea: arroz cocido 200 g = 56 g
type($('#qi'), 'arroz blanco coc');
assert.ok($('#qr button[data-act="pick"]')); assert.ok(act('newfood'));
click($('#qr button[data-act="pick"]'));
// Se pregunta la cantidad, con la ración normal puesta y el cálculo al momento
assert.ok($('#dlg').textContent.includes('¿Cuánto vas a tomar?')); assert.strictEqual($('#qn').value, '150'); assert.strictEqual(d.activeElement, $('#qn'));
assert.ok($('#qprev').textContent.includes('42 g'));
type($('#qn'), '200'); assert.ok($('#qprev').textContent.includes('56 g'));
click(act('qadd'));
assert.strictEqual(S().meal.items.length, 1); assert.strictEqual(S().meal.items[0].grams, '200');
assert.ok(text().includes('56 g'), 'hidratos del arroz');
assert.ok(text().includes('5,6 raciones'));
// Glucosa 60: hipoglucemia, sin dosis; la barra fija lo dice
assert.ok(text().includes('No se sugiere dosis')); assert.ok(!$('.dose'));
assert.ok($('#sum').textContent.includes('Siguiente')); click(act('mnext')); assert.ok($('#sum').textContent.includes('Ver mi dosis')); click(act('mnext'));
assert.ok(!$('#sum').hidden); assert.ok($('#sum').textContent.includes('Glucosa baja'));
// Glucosa 180 bajando: 8,4 + 2 = 10,4 → 10,5 y aviso de flecha
setGlucose(180, 2);
assert.ok($('.dose b').textContent.startsWith('10,5'), 'dosis con corrección: ' + $('.dose b').textContent);
assert.ok($('#sum').textContent.includes('10,5 U'));
assert.ok(text().includes('bajando'));
assert.ok(text().includes('su prospecto permite pincharla'));
assert.ok($('[data-tab="comida"]').classList.contains('on'), 'tras escribir la glucosa sigue en Comida');

// HC a mano: +14 g → 70 g
click(act('manual')); $('#mhg').value = '14'; click(act('mhsave'));
assert.ok(text().includes('7 raciones'));
// Alimento propio desde la búsqueda
type($('#qi'), 'Tarta de la abuela'); click(act('newfood'));
assert.strictEqual($('#nfn').value, 'Tarta de la abuela'); $('#nfh').value = '40'; click(act('nfsave'));
assert.strictEqual(S().custom.length, 1);
const dels = d.querySelectorAll('[data-act="del"]'); click(dels[dels.length - 1]);
assert.strictEqual(S().meal.items.length, 2);
// Lo encuentra después como propio
type($('#qi'), 'tarta de la'); assert.ok($('#qr').textContent.includes('propio')); type($('#qi'), '');
assert.strictEqual($('#qr').innerHTML, '');

// Guardar plato y registrar 12 U → vuelve a Ahora
click(act('saveplate')); $('#pn').value = 'Arroz de prueba'; click(act('platesave'));
click(act('log')); assert.ok($('#dlg').textContent.includes('Unidades de Fiasp')); $('#ru').value = '12'; click(act('logsave'));
assert.strictEqual(S().log.length, 2); assert.strictEqual(S().log[1].u, 12); assert.strictEqual(S().log[1].carbs, 70);
const meal = S().log.find((e) => e.ins === 'rapida');
assert.strictEqual(meal.glucose, 180); assert.strictEqual(meal.trend, 2);
assert.strictEqual(S().lastQty['Arroz blanco cocido'], 200); assert.strictEqual(S().recent[0].name, 'Arroz blanco cocido');
assert.strictEqual(S().meal.items.length, 0);
assert.ok($('[data-tab="ahora"]').classList.contains('on'));
assert.ok(text().includes('Fiasp activa')); assert.ok(text().includes('Última dosis'));
assert.ok($('.gchart .dose'), 'la dosis sale marcada en la gráfica');
assert.ok($('.gchart .gpt') || $('.gchart polyline'), 'la glucosa a mano sale en la gráfica');

// La insulina activa descuenta en la siguiente comida
click($('[data-tab="comida"]'));
click(act('manual')); $('#mhg').value = '20'; click(act('mhsave'));
assert.ok($('.dose b').textContent.startsWith('0'), 'con insulina activa: ' + $('.dose b').textContent);
click(act('del'));
assert.ok($('#sum').hidden || $('#sum').textContent.includes('Plato vacío'), 'sin alimentos no se puede seguir');
assert.ok(text().includes('Aún está vacío'));
assert.ok(!act('describe'), 'sin IA no sale Describir'); assert.ok(text().includes('Activa la IA'));
// Ración normal de un toque
type($('#qi'), 'manzana'); click($('#qr button[data-act="pick"]'));
click($('[data-act="qset"][data-v="180"]')); click(act('qadd')); assert.strictEqual(S().meal.items[0].grams, '180'); assert.ok(text().includes('= 21,6 g HC'));
click(act('del'));

// Recientes con la cantidad de la última vez
click(act('recent')); assert.ok($('#dlg').textContent.includes('Como la última vez')); assert.strictEqual($('#qn').value, '200'); click(act('qadd'));
const arroz = S().meal.items.find((x) => x.name === 'Arroz blanco cocido'); assert.strictEqual(arroz.grams, '200');
const dd = d.querySelectorAll('[data-act="del"]'); click(dd[dd.length - 1]);
// Bebidas en ml y cosas por unidades
type($('#qi'), 'cafe con leche'); assert.ok($('#qr').textContent.includes('g/100 ml')); click($('#qr button[data-act="pick"]')); assert.ok($('#dlg').textContent.includes('mililitros')); click(act('qadd'));
assert.ok(text().includes('ml')); assert.ok(text().includes('= 6,8 g HC'), 'taza de 200 ml');
type($('#qi'), 'sobre de azucar'); assert.ok($('#qr').textContent.includes('g HC/ud')); click($('#qr button[data-act="pick"]'));
assert.ok($('#dlg').textContent.includes('unidades')); type($('#qn'), '2'); click(act('qadd')); assert.ok(text().includes('= 16 g HC'));
assert.ok(text().includes('unidades'));
d.querySelectorAll('[data-act="del"]').forEach(() => click($('[data-act="del"]')));
assert.strictEqual(S().meal.items.length, 0);

// Platos a un toque
assert.ok(text().includes('Arroz de prueba'));
click(act('useplate')); assert.strictEqual(S().meal.items.length, 2);

// Registro
click($('[data-tab="registro"]')); assert.ok(text().includes('12 U')); assert.ok($('#sum').hidden);
assert.ok(text().includes('Lenta')); assert.ok($('.hc.lenta'));
click($('[data-act="logseg"][data-v="analisis"]')); assert.ok(text().includes('Aprendizaje')); assert.ok(act('report'));
click($('[data-act="logseg"][data-v="diario"]'));

// Foto con IA: desactivada de serie
click($('[data-tab="comida"]')); assert.ok(!act('photo'));
click($('[data-tab="ajustes"]')); type($('[data-s="ai.on"]'), '1');
// Cambiar de servicio cambia la ayuda y la clave que se pide
type($('[data-s="ai.provider"]'), 'gemini');
assert.ok(text().includes('aistudio.google.com')); assert.ok($('[data-s="ai.keys.gemini"]'));
click($('[data-tab="comida"]')); assert.ok(!act('photo'), 'sin clave no sale'); click($('[data-tab="ajustes"]'));
type($('[data-s="ai.provider"]'), 'custom'); assert.ok($('[data-s="ai.url"]'));
type($('[data-s="ai.provider"]'), 'deepseek'); assert.ok(text().includes('platform.deepseek.com'));
type($('[data-s="ai.keys.deepseek"]'), 'clave-de-prueba');
assert.ok(text().includes('Arroz de prueba'), 'platos en Ajustes');
click($('[data-tab="comida"]')); assert.ok(act('photo'));
const est = w.Vision.parse({ content: [{ type: 'tool_use', input: { notas: 'No se ve si hay salsa', alimentos: [
  { nombre: 'Arroz blanco cocido', gramos: 180, hc_por_100g: 28, confianza: 'media' },
  { nombre: '<b>Pollo</b>', gramos: 120, hc_por_100g: 0, confianza: 'alta' },
  { nombre: 'Imposible', gramos: 99999, hc_por_100g: 28, confianza: 'alta' } ] } }] });
assert.strictEqual(est.items.length, 2);
const before = S().meal.items.length;
w.__raciones.showEstimate(est);
assert.ok($('#dlg').textContent.includes('50,4 g'));
assert.ok(!$('#dlg b b'), 'HTML del nombre escapado');
click(act('photoadd'));
assert.strictEqual(S().meal.items.length, before + 2);
assert.ok(text().includes('estimado por IA')); assert.ok(text().includes('Revísalas antes'));
// Describir sin foto: botón visible con la IA activada y diálogo con texto
assert.ok(act('describe')); click(act('describe')); assert.ok($('#dtext'));
click(act('describego')); assert.ok($('#dtext'), 'sin texto no envía'); click(act('close'));

// Nombres con HTML no se interpretan
click(act('manual')); $('#mhn').value = '<img src=x onerror=alert(1)>'; $('#mhg').value = '1'; click(act('mhsave'));
assert.ok(!$('#view img'));

// Persistencia
const saved = JSON.parse(w.localStorage.getItem('raciones.v1'));
assert.strictEqual(saved.plates.length, 1); assert.strictEqual(saved.now.v, '180');
assert.strictEqual(saved.ai.provider, 'deepseek'); assert.strictEqual(saved.ai.keys.deepseek, 'clave-de-prueba');
// Explicación del cálculo visible en el resultado
click($('[data-tab="comida"]')); assert.ok($('details.how')); assert.ok($('details.how').textContent.includes('factor de sensibilidad'));
w.close();

// Gráfica del Libre guardada y migración desde 0.2
const now = Date.now(), graph = [];
for (let i = 0; i < 40; i++) graph.push({ t: now - (40 - i) * 15 * 60000, v: 120 + i * 3 });
w = boot({ cfg: {}, libre: { graph }, now: { v: '168', trend: 1, t: now - 2 * 60000, src: 'libre' } });
d = w.document;
assert.ok(d.querySelector('.gchart polyline.gline'));
assert.ok(d.querySelector('.gcard.in')); assert.ok(d.querySelector('#view').textContent.includes('Libre · hace 2 min'));
assert.ok(d.querySelector('#view').textContent.includes('Bajando rápido'));
w.close();
w = boot({ cfg: {}, meal: { items: [], glucose: '140', trend: 3, gt: now - 60000, gsrc: 'manual' }, ai: { on: '1', key: 'vieja', model: 'claude-sonnet-5-5' } });
assert.strictEqual(w.__raciones.state().now.v, '140'); assert.strictEqual(w.__raciones.state().meal.glucose, undefined);
assert.strictEqual(w.__raciones.state().ai.keys.claude, 'vieja'); assert.strictEqual(w.__raciones.state().ai.provider, 'claude'); assert.strictEqual(w.__raciones.state().ai.key, undefined);
// Lectura antigua: gris
w.close();
w = boot({ cfg: {}, now: { v: '140', trend: 3, t: now - 3 * 3600e3, src: 'manual' } });
assert.ok(w.document.querySelector('.gcard.old'));
w.close();

// ---- 0.7: flecha, asesor de ratios y guía ----
{
  const H = 3600e3, D = 24 * H, t0 = Date.now();
  const cfg = { ratioMode: 'r', ratios: { desayuno: '1', comida: '1', merienda: '1', cena: '1' }, isf: '40', target: '100', dia: '4', iobMode: 'total', step: '0.5', hypo: '70', rapid: 'Fiasp', basal: 'Tresiba', setup: 'ok', useTrend: '1' };
  const log = [{ t: t0 - 2 * H - 60000, ins: 'rapida', slot: 'comida', carbs: 20, u: 2, glucose: 110 }];
  for (let i = 1; i <= 6; i++) log.push({ t: t0 - i * D, ins: 'rapida', slot: 'cena', carbs: 60, u: 6, glucose: 120, iob: 0, items: 'Pizza', post: { g1: 220, g2: 240, g3: 250, max: 260, min: 115 } });
  w = boot({ cfg, log, now: { v: '150', trend: 4, t: t0 - 60000, src: 'libre' }, meal: { items: [{ name: 'Hidratos a mano', hcDirect: '30' }], slot: 'comida' } });
  d = w.document;
  const q = (sel) => d.querySelector(sel), vt = () => q('#view').textContent;
  const k = (el) => { assert.ok(el); el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); };
  assert.ok(!q('#dlg').textContent.includes('Vamos'), 'ya configurado: sin asistente');
  // Guía desde Aprende
  k(q('[data-tab="aprende"]')); k(q('[data-act="guide"]')); assert.ok(q('#dlg').textContent.includes('Guía fácil')); assert.ok(q('#dlg').textContent.includes('regla del 1700')); assert.ok(q('#dlg').textContent.includes('Fiasp')); k(q('[data-act="close"]'));
  // Ejemplo del PDF: 150 ↗ (+50), objetivo 100, FC 40, 30 g, 1 U/ración, ~1 U activa → 4,5 U
  k(q('[data-tab="comida"]'));
  assert.ok(q('.dose b').textContent.startsWith('4,5'), 'ejemplo del PDF: ' + q('.dose b').textContent);
  assert.ok(vt().includes('+ 50 por la flecha')); assert.ok(vt().includes('esperar 5–10 minutos'));
  // Sin la opción de flecha: 3 + 1,25 − 1 = 3,25 → 3,5
  w.__raciones.state().cfg.useTrend = '0'; w.__raciones.render();
  assert.ok(q('.dose b').textContent.startsWith('3,5'), 'sin flecha: ' + q('.dose b').textContent);
  // Asesor: propone +10 % en la cena, se aplica con confirmación y se puede deshacer
  k(q('[data-tab="registro"]')); k(q('[data-act="logseg"][data-v="analisis"]'));
  assert.ok(vt().includes('Tus ratios')); assert.ok(vt().includes('un 10 % más de insulina'));
  assert.ok(vt().includes('Aprendiendo: 0 de 5'), 'la comida aún sin datos');
  k(q('[data-act="ratioapply"][data-slot="cena"]')); assert.ok(q('#dlg').textContent.includes('de 1 U/ración a 1,1 U/ración'));
  k(q('[data-act="yes"]'));
  assert.strictEqual(w.__raciones.state().cfg.ratios.cena, '1,1'); assert.strictEqual(w.__raciones.state().cfg.ratioLog.length, 1);
  assert.ok(vt().includes('Lo cambiaste'), 'tras el cambio, espera');
  k(q('[data-act="ratioundo"]')); k(q('[data-act="yes"]'));
  assert.strictEqual(w.__raciones.state().cfg.ratios.cena, '1'); assert.strictEqual(w.__raciones.state().cfg.ratioLog.length, 0);
  // Registrar guarda la insulina activa del momento
  k(q('[data-tab="comida"]')); k(q('[data-act="log"]')); q('#ru').value = '3'; k(q('[data-act="logsave"]'));
  const last = w.__raciones.state().log.slice(-1)[0]; assert.ok(last.iob > 0.9 && last.iob < 1.01, 'iob ' + last.iob);
  w.close();
}

// ---- 0.8: Tresiba con dosis fija y aviso diario ----
{
  const calls = { schedule: [], cancel: 0, actions: null, listener: null };
  const fake = {
    registerActionTypes: async (o) => { calls.actions = o; },
    addListener: (ev, fn) => { calls.listener = fn; return Promise.resolve({ remove() {} }); },
    cancel: async () => { calls.cancel++; },
    checkPermissions: async () => ({ display: 'granted' }),
    requestPermissions: async () => ({ display: 'granted' }),
    schedule: async (o) => { calls.schedule.push(o.notifications); }
  };
  const cfg = { ratioMode: 'r', ratios: { desayuno: '1', comida: '1', merienda: '1', cena: '1' }, isf: '24', target: '100', dia: '4', rapid: 'Fiasp', basal: 'Tresiba', setup: 'ok', basalDose: '30', basalTime: '23:59', basalRemind: '1' };
  w = boot({ cfg, log: [] }, (win) => { win.Capacitor = { isNativePlatform: () => true, registerPlugin: () => fake }; });
  d = w.document;
  const q = (sel) => d.querySelector(sel), vt = () => q('#view').textContent;
  const k = (el) => { assert.ok(el); el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); };
  const tick = () => new Promise((r) => setTimeout(r, 30));
  (async () => {
    await tick();
    assert.ok(calls.actions.types[0].actions[0].id === 'apuntar');
    let last = calls.schedule[calls.schedule.length - 1];
    assert.ok(last.length >= 6 && last.length <= 7, 'avisos de 7 días: ' + last.length);
    assert.strictEqual(new Date(last[0].schedule.at).getHours(), 23); assert.ok(last[0].body.includes('30 U'));
    assert.strictEqual(last[0].actionTypeId, 'BASAL');
    // Un toque apunta 30 U y el aviso de hoy desaparece
    assert.ok(vt().includes('Apuntar 30 U')); k(q('[data-act="basalquick"]')); await tick();
    const lb = w.__raciones.state().log.filter((e) => e.ins === 'basal');
    assert.strictEqual(lb.length, 1); assert.strictEqual(lb[0].u, 30);
    assert.ok(vt().includes('✓ hoy')); assert.ok(!q('[data-act="basalquick"]'));
    last = calls.schedule[calls.schedule.length - 1];
    assert.ok(new Date(last[0].schedule.at).getDate() !== new Date().getDate(), 'hoy ya está: empieza mañana');
    // Desde el aviso con «Apuntar» otra vez: pregunta para no duplicar
    calls.listener({ actionId: 'apuntar', notification: { extra: { kind: 'basal' } } });
    assert.ok(q('#dlg').textContent.includes('Ya apuntaste')); k(q('[data-act="close"]'));
    assert.strictEqual(w.__raciones.state().log.filter((e) => e.ins === 'basal').length, 1);
    // Ajustes: campos de dosis fija, hora y aviso
    k(q('[data-tab="ajustes"]')); assert.ok(q('[data-s="cfg.basalDose"]')); assert.ok(q('[data-s="cfg.basalTime"]')); assert.ok(q('[data-s="cfg.basalRemind"]'));
    const before = calls.cancel; q('[data-s="cfg.basalRemind"]').value = '0'; q('[data-s="cfg.basalRemind"]').dispatchEvent(new w.Event('input', { bubbles: true })); await tick();
    assert.ok(calls.cancel > before);
    w.close();
    await v09();
    v010();
    await v011();
    await v022();
    v023();
    console.log('interfaz: todas las pruebas pasan');
  })().catch((e) => { console.error(e); process.exit(1); });
}

// ---- 0.9: iocrino, dosis olvidada, «Estoy bajo», informe y copias ----
async function v09() {
  const H = 3600e3, M = 60000, t0 = Date.now();
  const sched = [], puts = [];
  const notif = { registerActionTypes: async () => {}, addListener: () => Promise.resolve({ remove() {} }), cancel: async () => {}, checkPermissions: async () => ({ display: 'granted' }), requestPermissions: async () => ({ display: 'granted' }), schedule: async (o) => { sched.push(...o.notifications); } };
  // Subida de 100 en 2 h sin Fiasp apuntada
  const hist = []; for (let k = 0; k <= 8; k++) hist.push([t0 - (120 - k * 15) * M, 120 + k * 12.5]);
  const cfg = { ratioMode: 'r', ratios: { desayuno: '1', comida: '1', merienda: '1', cena: '1' }, isf: '24', target: '100', dia: '4', rapid: 'Fiasp', basal: 'Tresiba', setup: 'ok' };
  const w = boot({ cfg, log: [{ t: t0 - 5 * H, ins: 'rapida', slot: 'comida', carbs: 50, u: 5 }], hist, now: { v: '220', trend: 4, t: t0 - M, src: 'libre' }, backup: { url: 'http://192.168.1.150:5005/home/iocrino', user: 'yo', pass: 'secreta', auto: '0' } }, (win) => {
    win.Capacitor = { isNativePlatform: () => true, registerPlugin: (n) => (n === 'LocalNotifications' ? notif : null) };
    win.fetch = async (url, opt) => { puts.push({ url, opt }); return { status: 201, json: async () => ({}) }; };
  });
  const d = w.document, q = (s) => d.querySelector(s), vt = () => q('#view').textContent;
  const k = (el) => { assert.ok(el); el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); };
  const tick = () => new Promise((r) => setTimeout(r, 30));
  await tick();
  // Nombre y logo
  assert.ok(q('header').textContent.includes('iocrino')); assert.ok(q('header svg.logo'));
  // ¿Te has pinchado?
  assert.ok(vt().includes('¿Te has pinchado?'), 'aviso de dosis olvidada'); assert.ok(vt().includes('subido 100'));
  k(q('[data-act="dose"]')); q('#du').value = '3'; k(q('[data-act="dosekind"][data-v="comida"]')); k(q('[data-act="dosesave"]'));
  const dose = w.__raciones.state().log.slice(-1)[0];
  assert.strictEqual(dose.u, 3); assert.strictEqual(dose.kind, 'comida'); assert.strictEqual(dose.carbs, 0);
  assert.ok(!vt().includes('¿Te has pinchado?'), 'con la dosis apuntada desaparece');
  // «Estoy bajo»: apunta, programa el aviso a los 15 min y lo muestra
  k(q('[data-act="hipo"]')); assert.strictEqual(q('#hg').value, '', 'con 220 no se rellena'); q('#hg').value = '62'; k(q('[data-act="hipowhat"][data-i="0"]'));
  assert.strictEqual(q('#hgr').value, '20');
  k(q('[data-act="hiposave"]')); await tick();
  const hp = w.__raciones.state().log.slice(-1)[0];
  assert.strictEqual(hp.ins, 'hipo'); assert.strictEqual(hp.glucose, 62); assert.strictEqual(hp.what, 'Zumo (200 ml)');
  const s15 = sched.find((n) => n.id === 7100); assert.ok(s15 && Math.abs(new Date(s15.schedule.at).getTime() - (hp.t + 15 * M)) < 2000);
  assert.ok(vt().includes('Vuelve a mirar tu glucosa en')); assert.ok(!q('.lowbtn'));
  w.__raciones.state().hipoCheck = Date.now() - 1000; w.__raciones.render();
  assert.ok(vt().includes('Han pasado 15 minutos')); k(q('[data-act="hipook"]')); assert.strictEqual(w.__raciones.state().hipoCheck, 0); assert.ok(q('[data-act="hipo"]'));
  // La bajada no es una comida ni insulina
  assert.ok(vt().includes('Fiasp activa'));
  // Informe
  k(q('[data-tab="registro"]')); assert.ok(vt().includes('Bajada')); assert.ok(vt().includes('Comida sin apuntar'));
  k(q('[data-act="logseg"][data-v="analisis"]')); k(q('[data-act="report"]')); assert.ok(q('#dlg').textContent.includes('Informe para el endocrino')); assert.ok(q('#dlg').textContent.includes('En rango (70–180)'));
  assert.ok(q('#dlg').textContent.includes('Bajadas apuntadas1'));
  k(q('[data-act="repdays"][data-v="7"]')); assert.ok(q('[data-act="repdays"][data-v="7"]').classList.contains('on'));
  k(q('[data-act="close"]'));
  // Copia en el NAS: PUT con usuario y sin la contraseña dentro
  k(q('[data-tab="ajustes"]')); assert.ok(vt().includes('Guardar copia en Drive'));
  await w.__raciones.nasBackup(false);
  assert.strictEqual(puts.length, 2); assert.strictEqual(puts[0].url, 'http://192.168.1.150:5005/home/iocrino/iocrino-ultima.json');
  assert.strictEqual(puts[0].opt.method, 'PUT'); assert.ok(puts[0].opt.headers.authorization.startsWith('Basic '));
  const saved = JSON.parse(puts[0].opt.body); assert.strictEqual(saved.backup.pass, ''); assert.strictEqual(saved.app, 'iocrino'); assert.ok(saved.hist.length > 5);
  assert.ok(w.__raciones.state().backup.last > 0);
  // Restaurar desde archivo (Drive): mantiene la contraseña del NAS de este móvil
  const file = new w.File([JSON.stringify(Object.assign({}, saved, { cfg: Object.assign({}, saved.cfg, { isf: '30' }) }))], 'copia.json', { type: 'application/json' });
  const rf = q('#rfile'); Object.defineProperty(rf, 'files', { value: [file], configurable: true }); rf.dispatchEvent(new w.Event('change'));
  await new Promise((r) => setTimeout(r, 80));
  assert.ok(q('#dlg').textContent.includes('Restaurar la copia')); k(q('[data-act="yes"]'));
  assert.strictEqual(w.__raciones.state().cfg.isf, '30'); assert.strictEqual(w.__raciones.state().backup.pass, 'secreta');
  // Error del NAS: mensaje claro
  w.fetch = async () => ({ status: 401, json: async () => ({}) });
  await w.__raciones.nasBackup(true); assert.ok(w.__raciones.state().backup.err.includes('usuario o la contraseña'));
  w.close();
}

// ---- 0.10: ánimos, trucos, logros, infografías y reloj ----
function v010() {
  const H = 3600e3, M = 60000, t0 = Date.now();
  const hist = []; for (let t = t0 - 4 * H; t <= t0 - M; t += 15 * M) hist.push([t, 115]);
  const cfg = { ratioMode: 'r', ratios: { desayuno: '1', comida: '1', merienda: '1', cena: '1' }, isf: '24', target: '100', dia: '4', rapid: 'Fiasp', basal: 'Tresiba', setup: 'ok', basalDose: '30' };
  const log = []; for (let k = 0; k < 9; k++) log.push({ t: t0 - (k + 1) * 6 * H, ins: 'rapida', slot: 'comida', carbs: 40, u: 4 });
  const w = boot({ cfg, log, hist, now: { v: '115', trend: 3, t: t0 - M, src: 'libre' } });
  const q = (s) => w.document.querySelector(s), vt = () => q('#view').textContent;
  const k = (el) => { assert.ok(el); el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); };
  const st = w.__raciones.state();
  // Ánimo en rango y truco del día (contextual: Fiasp/Tresiba)
  assert.ok(q('.coach.ok'), 'mensaje de ánimo en rango'); assert.ok(/rango/.test(q('.coach').textContent));
  assert.strictEqual(st.coach.unlocked.length, 1); assert.ok(q('.tipline'));
  assert.strictEqual(st.coach.used.length, 1);
  // Logros ya conseguidos al instalar: se marcan sin felicitar
  assert.ok(st.coach.ach.includes('primera')); assert.ok(!st.coach.ach.includes('comidas10'));
  // El décimo registro da logro y un truco extra
  w.__raciones.state().meal.items = [{ name: 'Pan', hc100: 50, grams: '40' }];
  k(q('[data-tab="comida"]')); k(q('[data-act="log"]')); q('#ru').value = '2'; k(q('[data-act="logsave"]'));
  assert.ok(st.coach.ach.includes('comidas10')); assert.strictEqual(st.coach.unlocked.length, 2);
  // Pestaña Aprende
  k(q('[data-tab="aprende"]'));
  assert.ok(vt().includes('Infografías')); assert.ok(vt().includes('Trucos y curiosidades · 2 de')); assert.ok(vt().includes('GlucoDataHandler'));
  assert.ok(q('svg.ig'), 'donut de hoy'); assert.ok(vt().includes('Logros · '));
  k(q('[data-act="ig"][data-v="racion"]')); assert.ok(q('#dlg').textContent.includes('¿Qué es una ración?')); assert.ok(q('#dlg svg.ig'));
  k(q('[data-act="close"]'));
  // Glucosa baja: primero tratar
  st.now = { v: '62', trend: 2, t: Date.now(), src: 'manual' }; k(q('[data-tab="ahora"]'));
  assert.ok(q('.coach.bad'), q('.coach') && q('.coach').outerHTML + vt().slice(0,300)); assert.ok(/trata la bajada|azúcar/.test(q('.coach').textContent));
  w.close();
}

// ---- 0.11: grasa, ejercicio, material y parte nativa ----
async function v011() {
  const H = 3600e3, D = 864e5, t0 = Date.now(), sched = [], calls = []; let getN = 0;
  const notif = { registerActionTypes: async () => {}, addListener: () => Promise.resolve({ remove() {} }), cancel: async () => {}, checkPermissions: async () => ({ display: 'granted' }), requestPermissions: async () => ({ display: 'granted' }), schedule: async (o) => { o.notifications.forEach((n) => sched.push(n)); } };
  const iocr = { setData: async (o) => { calls.push(['set', JSON.parse(o.json), o.last]); }, getData: async () => ({ hist: JSON.stringify([[t0 - 20 * 60000, 150], [t0 - 5 * 60000, 160]]), trend: 4, session: '', persistSet: getN++ ? '' : '1' }), runNow: async () => { calls.push(['run']); } };
  const cfg = { ratioMode: 'r', ratios: { desayuno: '1', comida: '1', merienda: '1', cena: '1' }, isf: '24', target: '100', dia: '4', rapid: 'Fiasp', basal: 'Tresiba', setup: 'ok' };
  const w = boot({ cfg, libre: { email: 'a@b.es', password: 'x' }, kit: { sensorT: t0 - 13.2 * D, sensorDays: '14', rapidT: 0, basalT: 0 }, bg: { on: '1', missed: '1', low: '0' } }, (win) => {
    win.Capacitor = { isNativePlatform: () => true, registerPlugin: (n) => (n === 'LocalNotifications' ? notif : n === 'Iocrino' ? iocr : null) };
  });
  const tick = () => new Promise((r) => setTimeout(r, 60));
  await tick(); await tick();
  const q = (s) => w.document.querySelector(s), vt = () => q('#view').textContent, st = w.__raciones.state();
  const k = (el) => { assert.ok(el); el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); };
  // Lo leído con la app cerrada entra en el historial; y se manda la config a la parte nativa
  assert.ok(st.hist.some((p) => p[1] === 160)); assert.strictEqual(st.now.v, '160');
  const set = calls.find((c) => c[0] === 'set'); assert.ok(set && set[1].on === true && set[1].email === 'a@b.es' && set[1].missed === true && set[1].persist === true && set[1].predict === true && set[1].xdrip === false && Array.isArray(set[1].mealTimes)); assert.strictEqual(st.bg.persist, '1');
  st.bg.persist = '0';
  // Sensor a punto de acabar: aviso en Ahora y avisos programados
  assert.ok(vt().includes('Sensor')); assert.ok(sched.some((n) => n.id === 7301));
  // Comida grasa detectada sola + aviso a las 3 h
  st.now = { v: '120', trend: 3, t: Date.now(), src: 'manual' };
  st.meal.items = [{ name: 'Pizza margarita', hc100: 30, grams: '200' }];
  k(q('[data-tab="comida"]')); assert.ok(vt().includes('unidades grasa-proteína'));
  k(q('[data-act="log"]')); q('#ru').value = '6'; k(q('[data-act="logsave"]')); await tick();
  assert.ok(st.log.slice(-1)[0].fat); assert.ok(sched.some((n) => n.id === 7200));
  // Ejercicio
  k(q('[data-tab="registro"]')); k(q('[data-act="exmenu"]')); k(q('[data-act="exercise"]')); k(q('#exw [data-act="exwhat"]:nth-child(2)')); q('#exm').value = '50'; k(q('[data-act="exsave"]'));
  const ex = st.log.find((e) => e.ins === 'ejercicio'); assert.ok(ex && ex.what === 'Correr' && ex.min === 50);
  assert.ok(q('#dlg').textContent.includes('antes de dormir')); k(q('[data-act="close"]'));
  assert.ok(vt().includes('Ejercicio'));
  st.meal.items = [{ name: 'Pan', hc100: 50, grams: '40' }]; k(q('[data-tab="comida"]')); assert.ok(vt().includes('Hiciste ejercicio'));
  // Ajustes: material y segundo plano
  k(q('[data-tab="registro"]')); k(q('[data-act="logseg"][data-v="analisis"]')); assert.ok(vt().includes('Tus últimos 7 días')); k(q('[data-act="logseg"][data-v="diario"]'));
  k(q('[data-tab="ajustes"]')); assert.ok(vt().includes('Material: sensor y plumas')); assert.ok(vt().includes('xDrip+')); assert.ok(vt().includes('Avisos y lectura automática'));
  k(q('[data-act="kitnew"][data-v="rapidT"]')); k(q('[data-act="yes"]')); assert.ok(st.kit.rapidT > 0); await tick(); assert.ok(sched.some((n) => n.id === 7310));
  const ps = q('[data-s="bg.persist"]'); ps.value = '1'; ps.dispatchEvent(new w.Event('input', { bubbles: true })); await tick();
  assert.ok(calls.filter((c) => c[0] === 'set').pop()[1].persist === true); assert.ok(vt().includes('LockStar'));
  k(q('[data-act="bgtest"]')); await tick(); assert.ok(calls.some((c) => c[0] === 'run'));
  // Ajustes plegados: se abren y recuerdan
  assert.ok(q('details.sec')); assert.ok(!q('details.sec[open]'));
  const sec = q('details.sec[data-sec="s1"]'); sec.open = true; sec.dispatchEvent(new w.Event('toggle')); w.__raciones.render(); assert.ok(q('details.sec[data-sec="s1"]').open);
  // Enviamos las últimas horas al widget
  assert.ok(calls.filter((c) => c[0] === 'set').length >= 2);
  // Corrección sugerida con la flecha: (260 + 50 − 100) ÷ 24 = 8,75 U, menos la insulina activa
  st.cfg.night = '0'; st.cfg.isf = '24'; st.cfg.target = '100'; st.cfg.step = '0.5'; st.cfg.maxBolus = '';
  st.log = st.log.filter((e) => !(e.ins === 'rapida' || !e.ins) || Date.now() - e.t > 6 * H);
  st.now = { v: '260', trend: 4, t: Date.now(), src: 'libre' };
  k(q('[data-tab="ahora"]')); assert.ok(q('.corr'), 'tarjeta de corrección'); assert.ok(q('.corr').textContent.includes('por la flecha ↗'));
  assert.ok(q('.corr .cu').textContent.includes('8,5') || q('.corr .cu').textContent.includes('9'), q('.corr .cu').textContent); assert.ok(q('.corr').textContent.includes('corrección grande'));
  k(q('[data-act="corrlog"]')); assert.ok(q('#du').value.length > 0); k(q('[data-act="dosesave"]')); await tick();
  assert.ok(sched.some((n) => n.id === 7700), 'recordatorio a las 2 h');
  w.__raciones.render(); assert.ok(!q('.corr')); assert.ok(vt().includes('aún está actuando'));
  st.now = { v: '150', trend: 3, t: Date.now(), src: 'libre' }; w.__raciones.render(); assert.ok(!vt().includes('aún está actuando'));
  // Tema claro y modo noche
  st.cfg.night = '0'; st.cfg.theme = 'light'; w.__raciones.render(); assert.ok(w.document.documentElement.classList.contains('light'));
  st.cfg.night = '1'; st.cfg.nightFrom = '00:00'; st.cfg.nightTo = '23:59'; w.__raciones.render(); assert.ok(w.document.documentElement.classList.contains('night')); assert.ok(!w.document.documentElement.classList.contains('light'));
  st.cfg.night = '0'; st.cfg.theme = 'dark'; w.__raciones.render(); assert.ok(!w.document.documentElement.classList.contains('night'));
  // Botones del widget y atajos del icono
  w.__raciones.doAction('comida'); assert.ok(q('[data-tab="comida"]').classList.contains('on'));
  w.__raciones.doAction('bajo'); assert.ok(q('#dlg').textContent.includes('Estoy bajo')); k(q('[data-act="close"]'));
  st.cfg.basalDose = '30'; w.__raciones.doAction('lenta'); assert.ok(q('#dlg').textContent.includes('Tresiba')); k(q('[data-act="yes"]'));
  assert.ok(st.log.some((e) => e.ins === 'basal'));
  // Ánimo: apuntar con la glucosa, respuesta según el azúcar, y aparece en Aprende y en el registro
  st.now = { v: '60', trend: 3, t: Date.now(), src: 'manual' };
  w.__raciones.render(); k(q('[data-tab="aprende"]')); assert.ok(vt().includes('Tu ánimo'));
  k(q('[data-act="mood"]')); k(q('#mf [data-v="2"]')); k(q('[data-act="moodtag"][data-v="Irritable"]')); k(q('[data-act="moodsave"]'));
  const me = st.log.find((e) => e.ins === 'animo'); assert.ok(me && me.mood === 2 && me.glucose === 60 && me.tags[0] === 'Irritable');
  assert.ok(q('#dlg').textContent.includes('primero trátala')); assert.ok(q('#dlg [data-act="hipo"]')); k(q('#dlg [data-act="close"]'));
  k(q('[data-act="breathe"]')); assert.ok(q('.bcirc')); k(q('[data-act="close"]'));
  for (let i = 1; i <= 5; i++) st.log.push({ t: t0 - i * D, ins: 'animo', carbs: 0, mood: 1, glucose: 130 });
  w.__raciones.render(); assert.ok(vt().includes('024')); assert.ok(vt().includes('Ánimo medio'));
  k(q('[data-act="tipmore"]')); assert.ok(st.coach.extraN === 1);
  // Registro: 7 días y «ver más»
  for (let d = 1; d <= 12; d++) st.log.push({ t: t0 - d * D, ins: 'basal', u: 30, carbs: 0, name: 'Tresiba' });
  k(q('[data-tab="registro"]')); assert.ok(q('[data-act="logmore"]')); const n1 = w.document.querySelectorAll('.day').length; k(q('[data-act="logmore"]'));
  assert.ok(w.document.querySelectorAll('.day').length > n1);
  w.close();
}

// ---- 0.22: botones de inicio, modo enfermo, ejercicio y red de seguridad ----
async function v022() {
  const t0 = Date.now(), sched = [];
  const notif = { registerActionTypes: async () => {}, addListener: () => Promise.resolve({ remove() {} }), cancel: async () => {}, checkPermissions: async () => ({ display: 'granted' }), requestPermissions: async () => ({ display: 'granted' }), schedule: async (o) => { o.notifications.forEach((n) => sched.push(n)); } };
  const cfg = { ratioMode: 'g', ratios: { desayuno: '10', comida: '10', merienda: '10', cena: '10' }, isf: '50', target: '100', dia: '4', rapid: 'Fiasp', basal: 'Tresiba', basalDose: '30', setup: 'ok', night: '0', step: '0.5' };
  const w = boot({ cfg, now: { v: '110', trend: 3, t: t0 - 60000, src: 'libre' } }, (win) => { win.Capacitor = { isNativePlatform: () => true, registerPlugin: (n) => (n === 'LocalNotifications' ? notif : null) }; });
  const tick = () => new Promise((r) => setTimeout(r, 40));
  const q = (s) => w.document.querySelector(s), vt = () => q('#view').textContent, st = w.__raciones.state();
  const k = (el) => { assert.ok(el); el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); };
  // Botones de «¿Qué quieres hacer?»
  assert.ok(vt().includes('¿Qué quieres hacer?')); ['goto', 'hipo', 'basalquick', 'exmenu', 'sickon'].forEach((a) => assert.ok(q('.qgrid [data-act="' + a + '"]'), a));
  // Modo enfermo
  k(q('[data-act="sickon"]')); assert.ok(q('#dlg').textContent.includes('modo enfermo')); k(q('[data-act="sickyes"]')); await tick();
  assert.ok(st.sick.on); assert.ok(q('.sick')); assert.ok(vt().includes('Nunca dejes la lenta')); assert.ok(sched.filter((n) => n.id >= 7800 && n.id < 7808).length === 8);
  k(q('[data-act="keto"]')); q('#kv').value = '1,8'; q('#kv').dispatchEvent(new w.Event('input', { bubbles: true })); assert.ok(q('#kprev').textContent.includes('Llama hoy'));
  k(q('[data-act="ketosave"]')); assert.ok(st.log.some((e) => e.ins === 'cetonas' && e.mmol === 1.8)); k(q('[data-act="close"]'));
  assert.ok(vt().includes('Cetonas: 1,8'));
  k(q('[data-act="sickhelp"]')); assert.ok(q('#dlg').textContent.includes('112')); k(q('[data-act="close"]'));
  k(q('[data-act="sickoff"]')); k(q('[data-act="yes"]')); assert.ok(!st.sick.on); assert.ok(!q('.sick'));
  // Ejercicio: plan antes, con la comida
  k(q('[data-act="exmenu"]')); k(q('[data-act="explan"]'));
  assert.ok(q('#dlg').textContent.includes('Entre 90 y 125'));
  k(q('[data-act="exsel"][data-k="min"][data-v="60"]')); k(q('[data-act="exsel"][data-k="when"][data-v="60"]'));
  assert.ok(q('#dlg').textContent.includes('75 %'));
  k(q('[data-act="explansave"]')); assert.strictEqual(st.exPlan.cut, 75);
  assert.ok(vt().includes('Plan para las'));
  st.meal.items = [{ name: 'Pan', hc100: 50, grams: '80' }]; k(q('[data-tab="comida"]'));
  assert.ok(vt().includes('Vas a hacer ejercicio')); k(q('[data-act="useex"]')); assert.ok(q('#ru').value === '1'); k(q('[data-act="close"]'));
  // Ajustes agrupados y red de seguridad
  k(q('[data-tab="ajustes"]')); assert.ok(w.document.querySelectorAll('.grp').length >= 4); assert.ok(vt().includes('Si algo falla'));
  w.dispatchEvent(new w.ErrorEvent('error', { message: 'fallo de prueba', filename: 'x/app.js', lineno: 7 }));
  assert.ok(st.errs.some((e) => e.m.includes('fallo de prueba')));
  w.__raciones.render(); assert.ok(vt().includes('fallo de prueba'));
  // Si una pantalla falla, no se queda en blanco
  st.log.push({ t: Date.now(), ins: 'ejercicio', what: null, level: null, min: null, carbs: 0 });
  const bad = st.coach; st.coach = null; k(q('[data-tab="aprende"]')); assert.ok(vt().includes('Algo ha fallado en esta pantalla')); st.coach = bad;
  k(q('[data-act="goto"][data-v="ahora"]')); assert.ok(vt().includes('¿Qué quieres hacer?'));
  w.close();
}

// ---- 0.23: comida de cada día en pocos toques ----
function v023() {
  const H = 3600e3, D = 864e5, now = Date.now();
  const slotNow = 'comida';
  const cfg = { ratioMode: 'g', ratios: { desayuno: '10', comida: '10', merienda: '10', cena: '10' }, isf: '50', target: '100', dia: '4', setup: 'ok', night: '0', step: '0.5' };
  const log = [];
  for (let d = 1; d <= 3; d++) log.push({ t: now - d * D, ins: 'rapida', slot: slotNow, carbs: 40, u: 4, items: [{ name: 'Pan blanco', hc100: 50, grams: '40' }, { name: 'Manzana', hc100: 12, grams: '150', portion: 150 }] });
  const w = boot({ cfg, log, meal: { items: [], slot: 'comida' }, lastQty: { 'Pan blanco': 40, Manzana: 150 }, now: { v: '120', trend: 3, t: now - 60000, src: 'manual' } });
  const q = (s) => w.document.querySelector(s), vt = () => q('#view').textContent, st = w.__raciones.state();
  const k = (el) => { assert.ok(el); el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); };
  k(q('[data-tab="comida"]'));
  assert.ok(vt().includes('Lo de siempre')); assert.ok(q('[data-act="repeat"]'));
  // Un toque: repetir lo de la última vez
  k(q('[data-act="repeat"]')); assert.strictEqual(st.meal.items.length, 2);
  // Cantidades con − y +
  const iPan = st.meal.items.findIndex((x) => x.name === 'Pan blanco');
  k(q('[data-act="qplus"][data-i="' + iPan + '"]')); assert.strictEqual(st.meal.items[iPan].grams, '45');
  k(q('[data-act="qminus"][data-i="' + iPan + '"]')); k(q('[data-act="qminus"][data-i="' + iPan + '"]')); assert.strictEqual(st.meal.items[iPan].grams, '35');
  // Un toque: me pongo lo sugerido y queda registrado
  const n0 = st.log.length; assert.ok(q('[data-act="logquick"]').textContent.includes('Me pongo'));
  k(q('[data-act="logquick"]')); assert.strictEqual(st.log.length, n0 + 1); assert.strictEqual(st.meal.items.length, 0);
  const e = st.log[st.log.length - 1]; assert.ok(e.u > 0 && e.carbs === 35.5, String(e.carbs));
  // Favoritos: añadir sin preguntar
  k(q('[data-tab="comida"]')); k(q('[data-act="fav"]')); assert.strictEqual(st.meal.items.length, 1); assert.ok(!q('#dlg').open);
  // Medidas de casa: al elegir leche salen vaso, taza…; y en el plato, «Medidas de casa»
  const qi = q('#qi'); qi.value = 'leche'; qi.dispatchEvent(new w.Event('input', { bubbles: true }));
  const btn = Array.from(w.document.querySelectorAll('#qr button[data-act="pick"]')).find((b) => /^Leche/.test(b.textContent)); k(btn);
  assert.ok(q('#dlg').textContent.includes('Taza de desayuno250 ml'));
  k(q('[data-act="qset"][data-v="250"]')); k(q('[data-act="qadd"]'));
  const li = st.meal.items.findIndex((x) => /^Leche/.test(x.name)); assert.strictEqual(st.meal.items[li].grams, '250');
  k(q('[data-act="measure"][data-i="' + li + '"]')); assert.ok(q('#dlg').textContent.includes('Tazón grande'));
  k(q('[data-act="mpick"][data-v="200"]')); assert.strictEqual(st.meal.items[li].grams, '200');
  // Con práctica (10 comidas) se ofrece el modo rápido; nunca cambia solo
  for (let j = 0; j < 10; j++) st.log.push({ t: Date.now() - j * 3600000, ins: 'rapida', u: 2, carbs: 30, items: 'Pan' });
  w.__raciones.render(); assert.ok(q('[data-act="mfast"]'), 'ofrece modo rápido'); assert.ok(!w.document.querySelector('#view').classList.contains('mfast'));
  k(q('[data-act="mfast"]')); assert.strictEqual(st.cfg.mealMode, 'rapido');
  assert.ok(w.document.querySelector('#view').classList.contains('mfast'), 'todo en una pantalla'); assert.ok(q('#sum [data-act="tores"]'), 'barra de resumen');
  assert.ok(!q('[data-act="mfast"]'), 'ya no lo vuelve a ofrecer');
  w.close();
}

// ---------- IA: ¿por qué?, permiso de datos, grasa y proteína, revisión semanal ----------
(async () => {
  const now = Date.now(), H = 3600e3;
  const cfg = { ratioMode: 'g', ratios: { desayuno: '10', comida: '10', merienda: '10', cena: '10' }, isf: '50', target: '100', dia: '4', setup: 'ok', night: '0', step: '0.5', rangeLow: '70', rangeHigh: '180' };
  const log = [{ t: now - 3 * H, ins: 'rapida', slot: 'comida', carbs: 90, u: 6, items: 'Pizza, Coca-Cola', fat: true, glucose: 130 }];
  const hist = []; for (let m = 8 * 60; m >= 0; m -= 5) hist.push([now - m * 60000, 130 + Math.round((8 * 60 - m) / 6)]);
  const calls = [];
  const w = boot({ cfg, log, hist, now: { v: '250', trend: 4, t: now - 60000, src: 'manual' }, meal: { items: [], slot: 'comida' }, ai: { on: '1', provider: 'deepseek', keys: { deepseek: 'k' }, models: {}, url: '' } }, (win) => {
    win.fetch = async (url, opt) => {
      const b = JSON.parse(opt.body); calls.push({ url, b });
      const sys = b.messages[0].content;
      const out = /grasa y de proteína por 100 g, tal como/.test(sys) ? { alimentos: [{ nombre: 'Pizza', grasa_por_100g: 10, proteina_por_100g: 11 }], notas: '' }
        : { resumen: 'La pizza tenía mucha grasa. Pon 2 U más.', puntos: ['Subida 3 h después de una comida grasa'], probar: ['Mira la glucosa a las 3 h'], medico: ['¿Reparto la dosis en comidas grasas?'] };
      return { status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify(out) } }] }) };
    };
  });
  const q = (s) => w.document.querySelector(s), st = w.__raciones.state(), dt = () => q('#dlg').textContent;
  const k = (el) => { assert.ok(el, 'falta elemento'); el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); };
  const tick = () => new Promise((r) => setTimeout(r, 20));
  assert.ok(q('[data-act="aiwhy"]').textContent.includes('¿Por qué estoy alto?'));
  k(q('[data-act="aiwhy"]')); assert.ok(dt().includes('No se envía tu nombre') || dt().includes('No</b> se envía') || dt().includes('se envía'), 'pide permiso'); assert.strictEqual(calls.length, 0);
  k(q('[data-act="aiok"]')); await tick();
  assert.strictEqual(st.ai.dataOk, '1');
  const ctx = calls[0].b.messages[1].content;
  assert.ok(ctx.includes('Glucosa actual: 250') && ctx.includes('comida de 90 g de hidratos (Pizza, Coca-Cola), con mucha grasa'), ctx.slice(0, 300));
  assert.ok(!ctx.includes('@') && !/password|contraseña/i.test(ctx), 'sin datos personales');
  assert.ok(dt().includes('Subida 3 h después') && dt().includes('Pregunta a tu médico'));
  assert.ok(!dt().includes('2 U'), 'sin dosis'); assert.ok(dt().includes('He quitado 1 frase'));
  k(q('[data-act="close"]'));
  // Grasa y proteína con IA en el resultado de la comida
  k(q('[data-tab="comida"]'));
  w.__raciones.state().meal.items.push({ name: 'Pizza', hc100: 30, grams: '300' }); w.__raciones.render();
  k(q('[data-act="mnext"]')); k(q('[data-act="mnext"]'));
  k(q('[data-act="aimacro"]')); await tick();
  assert.strictEqual(st.meal.items[0].fat100, 10);
  assert.ok(q('#res').textContent.includes('Grasa · proteína') && q('#res').textContent.includes('30 g · 33 g · alta'), q('#res').textContent);
  assert.ok(q('#res [data-act="fat"]').textContent.startsWith('✓'), 'marca comida grasa sola');
  // Revisión semanal: ya no vuelve a pedir permiso y se guarda
  k(q('[data-tab="registro"]')); k(q('[data-act="logseg"][data-v="analisis"]'));
  k(q('[data-act="aiweek"]')); await tick();
  assert.ok(dt().includes('Tu semana, explicada')); assert.ok(st.coach.aiReview && st.coach.aiReview.res.points.length === 1);
  assert.ok(calls[calls.length - 1].b.messages[1].content.includes('Informe de 7 días'));
  k(q('[data-act="close"]')); assert.ok(q('[data-act="aiweeklast"]'));
  // Carta del restaurante: botón disponible
  k(q('[data-tab="comida"]')); assert.ok(q('[data-act="menu"]'));
  w.close();
  console.log('ui IA: pasan');
})().catch((e) => { console.error(e); process.exit(1); });
