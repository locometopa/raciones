const assert = require('assert');
const Learn = require('../www/js/learn.js');
const H = 3600e3, M = 60000;
const now = Date.UTC(2026, 10, 21, 22, 0);

// Gráfica sintética: cada 15 min, sube 60 mg/dL tras cada comida y vuelve
function graphFor(meals, base, rise) {
  const g = [];
  for (let t = now - 24 * H; t <= now; t += 15 * M) {
    let v = base;
    meals.forEach((m) => { const d = (t - m) / H; if (d >= 0 && d <= 4) v += rise * Math.sin(Math.PI * d / 4) + (d >= 2.5 ? rise * 0.3 : 0); });
    g.push({ t, v: Math.round(v) });
  }
  return g;
}

// outcome
const m1 = now - 10 * H;
let g = graphFor([m1], 120, 80);
let o = Learn.outcome({ t: m1 }, g);
assert.ok(o && o.g3 > 120 && o.max > o.g3 - 1 && o.min >= 120);
assert.strictEqual(Learn.outcome({ t: m1 }, []), null);

// update: rellena solo comidas rápidas con más de 3 h; la lenta y las recientes no
const log = [
  { t: m1, slot: 'cena', carbs: 60, u: 6, glucose: 120, items: 'Pasta, Pan' },
  { t: now - 1 * H, slot: 'cena', carbs: 40, u: 4, glucose: 130, items: 'Pan' },
  { t: now - 5 * H, ins: 'basal', u: 14, carbs: 0 }
];
assert.strictEqual(Learn.update(log, g, now), 1);
assert.ok(log[0].post && !log[1].post && !log[2].post);
assert.ok(log[0].post.g4 != null && log[0].post.g1 != null);
// Sin datos y más de 26 h: se marca para no volver a mirar
const old = [{ t: now - 30 * H, slot: 'comida', carbs: 50, u: 5 }];
assert.strictEqual(Learn.update(old, [], now), 1); assert.ok(old[0].post.none);

// summary: 6 cenas que acaban altas → «alto»; 6 comidas con bajadas → «bajo»
const big = [];
for (let d = 1; d <= 6; d++) big.push({ t: now - d * 24 * H, slot: 'cena', carbs: 70, u: 6, glucose: 140, items: 'Pizza (ya horneada)', post: { g2: 230, g3: 220, max: 240, min: 140 } });
for (let d = 1; d <= 6; d++) big.push({ t: now - d * 24 * H - 6 * H, slot: 'comida', carbs: 50, u: 6, glucose: 110, items: 'Arroz blanco cocido', post: { g2: 90, g3: 80, max: 130, min: d <= 2 ? 62 : 75 } });
for (let d = 1; d <= 2; d++) big.push({ t: now - d * 24 * H - 12 * H, slot: 'desayuno', carbs: 40, u: 4, glucose: 100, items: 'Pan', post: { g2: 150, g3: 130, max: 160, min: 100 } });
let s = Learn.summary(big, { now, days: 30, low: 70, high: 180, target: 100 });
assert.strictEqual(s.slots.cena.level, 'alto'); assert.ok(s.slots.cena.text.includes('220'));
assert.strictEqual(s.slots.comida.level, 'bajo'); assert.ok(s.slots.comida.text.includes('2 de 6'));
assert.strictEqual(s.slots.desayuno.level, 'pocos');
assert.strictEqual(s.foods[0].name, 'Pizza (ya horneada)'); assert.strictEqual(s.foods[0].rise, 80);
// Una corrección en las 3 h siguientes anula esa comida para aprender
big.push({ t: now - 1 * 24 * H + 1 * H, slot: 'cena', carbs: 0, u: 2 });
s = Learn.summary(big, { now, days: 30 });
assert.strictEqual(s.slots.cena.n, 5);
// La lenta no anula nada
big.push({ t: now - 2 * 24 * H + 1 * H, ins: 'basal', u: 14, carbs: 0 });
assert.strictEqual(Learn.summary(big, { now, days: 30 }).slots.cena.n, 5);
console.log('learn: todas las pruebas pasan');

// ---- Asesor de ratios ----
{
  const D = 24 * H;
  const cfg = (extra) => Object.assign({ now, days: 30, mode: 'r', ratios: { desayuno: '1,5', comida: '1', merienda: '1', cena: '1' }, isf: '40', dia: '4', low: 70 }, extra || {});
  // 6 cenas de 60 g con 6 U, empezando en 120 y acabando en 200 a las 3 h → hacía falta más
  const mk = (slot, n, o) => Array.from({ length: n }, (_, i) => Object.assign({ t: now - (i + 1) * D, ins: 'rapida', slot, carbs: 60, u: 6, glucose: 120, iob: 0, items: 'x', post: { g1: 190, g2: 200, g3: 200, max: 210, min: 115 } }, o || {}));
  let R = Learn.ratios(mk('cena', 6), cfg());
  // necesaria = 6 + (200−120)/40 − 6·0,25 = 6,5 U → 1,083 U/ración frente a 1 → +8 %: no llega al 10 %
  assert.strictEqual(R.cena.action, 'ok'); assert.ok(Math.abs(R.cena.med - 6.5 / 6) < 1e-9);
  R = Learn.ratios(mk('cena', 6, { post: { g1: 220, g2: 240, g3: 250, max: 260, min: 115 } }), cfg());
  // 6 + 130/40 − 1,5 = 7,75 → 1,29 → propone +10 % = 1,1
  assert.strictEqual(R.cena.action, 'mas'); assert.strictEqual(R.cena.newVal, 1.1);
  // En modo gramos por unidad: 10 g/U → 1 U/ración; +10 % de insulina → 9 g/U
  R = Learn.ratios(mk('cena', 6, { post: { g1: 220, g2: 240, g3: 250, max: 260, min: 115 } }), cfg({ mode: 'g', ratios: { cena: '10' } }));
  assert.strictEqual(R.cena.newVal, 9);
  // Acabar muy por debajo de donde empezó → menos
  R = Learn.ratios(mk('cena', 6, { glucose: 150, post: { g1: 120, g2: 90, g3: 80, max: 150, min: 78 } }), cfg());
  assert.strictEqual(R.cena.action, 'menos'); assert.strictEqual(R.cena.newVal, 0.9);
  // Dos bajadas de 70 → bajar, aunque falten datos
  R = Learn.ratios(mk('cena', 2, { post: { g1: 150, g2: 90, g3: 75, max: 150, min: 62 } }), cfg());
  assert.strictEqual(R.cena.action, 'menos-hipo'); assert.strictEqual(R.cena.newVal, 0.9);
  // Pocos datos
  assert.strictEqual(Learn.ratios(mk('cena', 3), cfg()).cena.action, 'datos');
  // Tras un cambio reciente: esperar, y solo cuentan las comidas posteriores
  R = Learn.ratios(mk('cena', 6, { post: { g1: 220, g2: 240, g3: 250, max: 260, min: 115 } }), cfg({ changes: [{ t: now - 1.5 * D, slot: 'cena' }] }));
  assert.strictEqual(R.cena.action, 'esperar'); assert.strictEqual(R.cena.n, 1);
  // Comidas «buenas» según el PDF: empieza 80–120, a la hora < 180 y a las 2 h < 140
  R = Learn.ratios(mk('comida', 5, { glucose: 100, u: 6, post: { g1: 160, g2: 130, g3: 110, max: 165, min: 95 } }), cfg());
  assert.strictEqual(R.comida.good, 5); assert.strictEqual(R.comida.goodMed, 1);
  // Si la mayoría salen bien según el PDF, no propone aunque la estimación diga otra cosa
  R = Learn.ratios(mk('comida', 6, { glucose: 105, post: { g1: 165, g2: 135, g3: 115, max: 170, min: 100 } }), cfg());
  assert.strictEqual(R.comida.action, 'ok'); assert.ok(R.comida.med < 0.9);
  // Con la glucosa a las 4 h no se descuenta insulina pendiente: 6 + (160−120)/40 = 7 → 1,167 (+17 %) → más
  R = Learn.ratios(mk('cena', 6, { post: { g1: 190, g2: 200, g3: 180, g4: 160, max: 210, min: 115 } }), cfg());
  assert.ok(Math.abs(R.cena.med - 7 / 6) < 1e-9); assert.strictEqual(R.cena.action, 'mas');
  // Sin ratio puesto
  assert.strictEqual(Learn.ratios([], cfg({ ratios: {} })).desayuno.action, 'sin');
  // Insulina total diaria
  const tl = [];
  for (let d = 1; d <= 5; d++) { tl.push({ t: now - d * D + H, ins: 'basal', u: 14 }); tl.push({ t: now - d * D + 5 * H, ins: 'rapida', u: 8, carbs: 50 }); tl.push({ t: now - d * D + 10 * H, ins: 'rapida', u: 6, carbs: 40 }); }
  const T = Learn.tdd(tl, now); assert.strictEqual(T.tdd, 28); assert.strictEqual(T.days, 5);
  assert.strictEqual(Learn.tdd(tl.filter((e) => e.ins !== 'basal'), now), null);
  console.log('learn (asesor): todas las pruebas pasan');
}
