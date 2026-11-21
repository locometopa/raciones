// Prueba de humo de la interfaz con jsdom: ajustes → comida → cálculo → registro → historial.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const www = path.join(__dirname, '..', 'www');
const html = fs.readFileSync(path.join(www, 'index.html'), 'utf8').replace(/<script src="[^"]+"><\/script>/g, '');
const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://localhost/', pretendToBeVisual: true });
const w = dom.window, d = w.document;
w.scrollTo = () => {};
['calc', 'foods', 'libre', 'vision', 'app'].forEach((f) => w.eval(fs.readFileSync(path.join(www, 'js', f + '.js'), 'utf8')));

const $ = (s) => d.querySelector(s);
const click = (el) => { assert.ok(el, 'falta un elemento para pulsar'); el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); };
const type = (el, v) => { assert.ok(el, 'falta un campo'); el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); };
const act = (a) => $('[data-act="' + a + '"]');
const text = () => $('#view').textContent;

// Sin pautas no hay dosis
assert.ok(text().includes('faltan tus pautas'));
assert.ok(!$('.dose'));

// Ajustes: 1,5 U por ración en todas las franjas, sensibilidad 40, objetivo 100, 4 h
click($('[data-tab="ajustes"]'));
['desayuno', 'comida', 'merienda', 'cena'].forEach((s) => type($('[data-s="cfg.ratios.' + s + '"]'), '1,5'));
type($('[data-s="cfg.isf"]'), '40'); type($('[data-s="cfg.target"]'), '100'); type($('[data-s="cfg.dia"]'), '4');
type($('[data-s="cfg.step"]'), '0.5');

// Comida: 200 g de arroz cocido (28 %) = 56 g
click($('[data-tab="comida"]'));
click(act('add')); type($('#q'), 'arroz blanco coc');
click($('#ql button')); 
type($('input[data-f="grams"]'), '200');
assert.ok(text().includes('56 g'), 'hidratos del arroz');
assert.ok(text().includes('5,6 raciones'));
// Sin glucosa: 56 / (10/1,5) = 8,4 → 8,5
assert.ok($('.dose b').textContent.startsWith('8,5'), 'dosis sin glucosa: ' + $('.dose b').textContent);
// Glucosa 180 → +2 → 10,4 → 10,5
type($('[data-f="glucose"]'), '180');
assert.ok($('.dose b').textContent.startsWith('10,5'), 'dosis con corrección: ' + $('.dose b').textContent);
// Flecha bajando: aviso
type($('[data-f="trend"]'), '2');
assert.ok(text().includes('bajando'));
// Hipoglucemia: sin dosis
type($('[data-f="glucose"]'), '62');
assert.ok(!$('.dose')); assert.ok(text().includes('No se sugiere dosis'));
// Valor imposible: se ignora
type($('[data-f="glucose"]'), '1800');
assert.ok(text().includes('no parece un valor válido'));
type($('[data-f="glucose"]'), '180');

// HC a mano: +14 g → 70 g
click(act('manual')); $('#mhg').value = '14'; click(act('mhsave'));
assert.ok(text().includes('7 raciones'));

// Guardar plato
click(act('saveplate')); $('#pn').value = 'Arroz de prueba'; click(act('platesave'));

// Registrar 12 U
click(act('log')); $('#ru').value = '12'; click(act('logsave'));
const S = w.__raciones.state();
assert.strictEqual(S.log.length, 1); assert.strictEqual(S.log[0].u, 12); assert.strictEqual(S.log[0].carbs, 70);
assert.strictEqual(S.meal.items.length, 0);

// La insulina activa descuenta en la siguiente comida: 20 g → 3 U − ~12 U → 0
click(act('manual')); $('#mhg').value = '20'; click(act('mhsave'));
assert.ok($('.dose b').textContent.startsWith('0'), 'con insulina activa: ' + $('.dose b').textContent);

// Historial y platos
click($('[data-tab="historial"]')); assert.ok(text().includes('12 U')); assert.ok(text().includes('Insulina activa ahora'));
click($('[data-tab="platos"]')); assert.ok(text().includes('Arroz de prueba'));
click(act('useplate')); assert.strictEqual(w.__raciones.state().meal.items.length, 3);

// Persistencia
assert.ok(JSON.parse(w.localStorage.getItem('raciones.v1')).plates.length === 1);
// Nombres con HTML no se interpretan
click(act('manual')); $('#mhn').value = '<img src=x onerror=alert(1)>'; $('#mhg').value = '1'; click(act('mhsave'));
assert.ok(!$('#view img'));

// Foto con IA: desactivada de serie, sin botón
click($('[data-tab="comida"]')); assert.ok(!act('photo'), 'el botón de foto no debe salir desactivado');
click($('[data-tab="ajustes"]')); type($('[data-s="ai.on"]'), '1'); type($('[data-s="ai.key"]'), 'clave-de-prueba');
click($('[data-tab="comida"]')); assert.ok(act('photo'), 'el botón de foto sale al activarlo');
// Respuesta del modelo: se limpian valores imposibles y el HTML no se interpreta
const est = w.Vision.parse({ content: [{ type: 'tool_use', input: { notas: 'No se ve si hay salsa', alimentos: [
  { nombre: 'Arroz blanco cocido', gramos: 180, hc_por_100g: 28, confianza: 'media' },
  { nombre: '<b>Pollo</b>', gramos: 120, hc_por_100g: 0, confianza: 'alta' },
  { nombre: 'Imposible', gramos: 99999, hc_por_100g: 28, confianza: 'alta' },
  { nombre: 'Otro imposible', gramos: 50, hc_por_100g: 250, confianza: 'alta' } ] } }] });
assert.strictEqual(est.items.length, 2);
assert.throws(() => w.Vision.parse({ content: [{ type: 'text', text: 'hola' }] }));
const before = w.__raciones.state().meal.items.length;
w.__raciones.showEstimate(est);
assert.ok($('#dlg').textContent.includes('50,4 g'), 'total estimado');
assert.ok(!$('#dlg b b'), 'HTML del nombre escapado');
click(act('photoadd'));
const items = w.__raciones.state().meal.items;
assert.strictEqual(items.length, before + 2); assert.ok(items[items.length - 1].est);
assert.ok(text().includes('estimado por foto')); assert.ok(text().includes('Revísalas antes'));
// La clave no sale en la copia de seguridad (se comprueba el estado que se copiaría)
assert.strictEqual(w.__raciones.state().ai.key, 'clave-de-prueba');

console.log('interfaz: todas las pruebas pasan');
w.close();
