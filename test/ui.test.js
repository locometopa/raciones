// Prueba de la interfaz con jsdom: ahora → ajustes → comida → cálculo → registro.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const www = path.join(__dirname, '..', 'www');
const html = fs.readFileSync(path.join(www, 'index.html'), 'utf8').replace(/<script src="[^"]+"><\/script>/g, '');

function boot(stored) {
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://localhost/', pretendToBeVisual: true });
  const w = dom.window;
  w.scrollTo = () => {};
  w.HTMLElement.prototype.scrollIntoView = () => {};
  if (stored) w.localStorage.setItem('raciones.v1', JSON.stringify(stored));
  ['calc', 'foods', 'libre', 'vision', 'chart', 'app'].forEach((f) => w.eval(fs.readFileSync(path.join(www, 'js', f + '.js'), 'utf8')));
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

// Inicio: pantalla Ahora, sin glucosa ni gráfica
assert.ok($('[data-tab="ahora"]').classList.contains('on'));
assert.ok($('.gcard.none')); assert.ok(text().includes('Toca para escribirla'));
assert.ok(text().includes('Sin lecturas'));
assert.ok($('#sum').hidden);

// Glucosa a mano desde la tarjeta → color según rango
setGlucose(150, 3);
assert.ok($('.gcard.in'), 'verde dentro de rango'); assert.ok(text().includes('150'));
setGlucose(200); assert.ok($('.gcard.high'));
setGlucose(300); assert.ok($('.gcard.vhigh'));
setGlucose(60); assert.ok($('.gcard.low'));
// Valor imposible: no se guarda
click(act('editg')); $('#gi').value = '1800'; click(act('gsave'));
assert.strictEqual(S().now.v, '60'); click(act('close'));

// Ajustes: 1,5 U por ración en todas las franjas, sensibilidad 40, objetivo 100, 4 h, pluma de 0,5
click($('[data-tab="ajustes"]'));
['desayuno', 'comida', 'merienda', 'cena'].forEach((s) => type($('[data-s="cfg.ratios.' + s + '"]'), '1,5'));
type($('[data-s="cfg.isf"]'), '40'); type($('[data-s="cfg.target"]'), '100'); type($('[data-s="cfg.dia"]'), '4');
type($('[data-s="cfg.step"]'), '0.5');

// Ahora → botón grande «Calcular comida»
click($('[data-tab="ahora"]'));
click($('button.big[data-act="goto"]'));
assert.ok($('[data-tab="comida"]').classList.contains('on'));
assert.ok($('.gstrip'));

// Búsqueda en línea: arroz cocido 200 g = 56 g
type($('#qi'), 'arroz blanco coc');
assert.ok($('#qr button[data-act="pick"]')); assert.ok(act('newfood'));
click($('#qr button[data-act="pick"]'));
assert.strictEqual(S().meal.items.length, 1);
assert.strictEqual(d.activeElement, $('#items input.n'), 'el foco va a los gramos');
type($('#items input.n'), '200');
assert.ok(text().includes('56 g'), 'hidratos del arroz');
assert.ok(text().includes('5,6 raciones'));
// Glucosa 60: hipoglucemia, sin dosis; la barra fija lo dice
assert.ok(text().includes('No se sugiere dosis')); assert.ok(!$('.dose'));
assert.ok(!$('#sum').hidden); assert.ok($('#sum').textContent.includes('Glucosa baja'));
// Glucosa 180 bajando: 8,4 + 2 = 10,4 → 10,5 y aviso de flecha
setGlucose(180, 2);
assert.ok($('.dose b').textContent.startsWith('10,5'), 'dosis con corrección: ' + $('.dose b').textContent);
assert.ok($('#sum').textContent.includes('10,5 U'));
assert.ok(text().includes('bajando'));
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
click(act('log')); $('#ru').value = '12'; click(act('logsave'));
assert.strictEqual(S().log.length, 1); assert.strictEqual(S().log[0].u, 12); assert.strictEqual(S().log[0].carbs, 70);
assert.strictEqual(S().log[0].glucose, 180); assert.strictEqual(S().log[0].trend, 2);
assert.strictEqual(S().meal.items.length, 0);
assert.ok($('[data-tab="ahora"]').classList.contains('on'));
assert.ok(text().includes('Insulina activa')); assert.ok(text().includes('Última dosis'));
assert.ok($('.gchart .dose'), 'la dosis sale marcada en la gráfica');
assert.ok($('.gchart .mdot'), 'la glucosa a mano sale como punto');

// La insulina activa descuenta en la siguiente comida
click($('[data-tab="comida"]'));
click(act('manual')); $('#mhg').value = '20'; click(act('mhsave'));
assert.ok($('.dose b').textContent.startsWith('0'), 'con insulina activa: ' + $('.dose b').textContent);
click(act('del'));
assert.ok($('#sum').hidden, 'sin alimentos no hay barra');

// Platos a un toque
assert.ok(text().includes('Arroz de prueba'));
click(act('useplate')); assert.strictEqual(S().meal.items.length, 2);

// Registro
click($('[data-tab="registro"]')); assert.ok(text().includes('12 U')); assert.ok($('#sum').hidden);

// Foto con IA: desactivada de serie
click($('[data-tab="comida"]')); assert.ok(!act('photo'));
click($('[data-tab="ajustes"]')); type($('[data-s="ai.on"]'), '1'); type($('[data-s="ai.key"]'), 'clave-de-prueba');
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
assert.ok(text().includes('estimado por foto')); assert.ok(text().includes('Revísalas antes'));

// Nombres con HTML no se interpretan
click(act('manual')); $('#mhn').value = '<img src=x onerror=alert(1)>'; $('#mhg').value = '1'; click(act('mhsave'));
assert.ok(!$('#view img'));

// Persistencia
const saved = JSON.parse(w.localStorage.getItem('raciones.v1'));
assert.strictEqual(saved.plates.length, 1); assert.strictEqual(saved.now.v, '180');
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
w = boot({ cfg: {}, meal: { items: [], glucose: '140', trend: 3, gt: now - 60000, gsrc: 'manual' } });
assert.strictEqual(w.__raciones.state().now.v, '140'); assert.strictEqual(w.__raciones.state().meal.glucose, undefined);
// Lectura antigua: gris
w.close();
w = boot({ cfg: {}, now: { v: '140', trend: 3, t: now - 3 * 3600e3, src: 'manual' } });
assert.ok(w.document.querySelector('.gcard.old'));
w.close();

console.log('interfaz: todas las pruebas pasan');
