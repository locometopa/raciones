const assert = require('assert');
const Report = require('../www/js/report.js');
const H = 3600e3, D = 24 * H, M = 60000;
const now = new Date(2026, 10, 21, 12, 0).getTime();

// 14 días, un punto cada 15 min: 60 % en rango (120), 20 % a 220, 10 % a 300, 6 % a 60, 4 % a 45
const hist = [];
let i = 0;
for (let t = now - 14 * D + 15 * M; t <= now; t += 15 * M, i++) {
  const k = i % 50;
  const v = k < 30 ? 120 : k < 40 ? 220 : k < 45 ? 300 : k < 48 ? 60 : 45;
  hist.push([t, v]);
}
const log = [
  { t: now - 2 * D, ins: 'basal', u: 30 }, { t: now - 2 * D + 5 * H, ins: 'rapida', slot: 'comida', carbs: 60, u: 6, glucose: 110, post: { g2: 150 } },
  { t: now - 2 * D + 9 * H, ins: 'rapida', slot: 'cena', carbs: 40, u: 4, glucose: 130, post: { g2: 170 } },
  { t: now - 2 * D + 11 * H, ins: 'rapida', u: 2, carbs: 0, kind: 'correccion' },
  { t: now - 1 * D, ins: 'hipo', glucose: 62, what: 'Zumo (200 ml)', carbs: 0 },
  { t: now - 20 * D, ins: 'rapida', slot: 'cena', carbs: 99, u: 9 } // fuera del periodo
];
const cfg = { rapid: 'Fiasp', basal: 'Tresiba', ratioMode: 'r', ratios: { desayuno: '1,5', comida: '1', merienda: '1', cena: '1' }, isf: '24', target: '100', dia: '4', ratioLog: [{ t: now - 3 * D, slot: 'cena', from: '1', to: '1,1' }] };
const r = Report.build({ hist, log, cfg, now, days: 14 });
const near = (a, b, tol, m) => assert.ok(Math.abs(a - b) <= tol, (m || '') + ' ' + a + ' vs ' + b);
near(r.glucose.inr, 60, 0.5, 'en rango'); near(r.glucose.high, 20, 0.5); near(r.glucose.vhigh, 10, 0.5); near(r.glucose.low, 6, 0.5); near(r.glucose.vlow, 4, 0.5);
assert.ok(r.glucose.coverage >= 99, 'cobertura ' + r.glucose.coverage);
near(r.glucose.gmi, 3.31 + 0.02392 * r.glucose.mean, 1e-9);
assert.ok(r.glucose.lowEpisodes > 20);
assert.strictEqual(r.meals.comida.n, 1); assert.strictEqual(r.meals.cena.n, 1, 'la cena de hace 20 días no cuenta');
assert.strictEqual(r.meals.comida.post2, 150);
assert.strictEqual(r.insulin.tdd, 42); assert.strictEqual(r.insulin.basal, 30); assert.strictEqual(r.insulin.corrections, 1);
assert.strictEqual(r.hipos.length, 1); assert.strictEqual(r.changes.length, 1);
const t = Report.text(r, 'iocrino');
['Tiempo en rango 70–180: 60 %', 'Fiasp (rápida), Tresiba (lenta)', 'BAJADAS APUNTADAS: 1', 'Zumo (200 ml)', 'cena de 1 a 1,1', 'GMI'].forEach((s) => assert.ok(t.includes(s), 'falta: ' + s));
// Sin datos
const e = Report.build({ hist: [], log: [], cfg: {}, now, days: 7 });
assert.strictEqual(e.glucose.n, 0); assert.ok(Report.text(e).includes('Sin datos del sensor'));
console.log('report: todas las pruebas pasan');
