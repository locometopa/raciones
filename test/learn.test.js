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
