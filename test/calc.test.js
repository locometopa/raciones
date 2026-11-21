const assert = require('assert');
const C = require('../www/js/calc.js');
const near = (a, b, m) => assert.ok(Math.abs(a - b) < 1e-6, `${m || ''} esperado ${b}, sale ${a}`);

// Hidratos
near(C.carbsOf({ grams: 200, hc100: 28 }), 56, 'arroz');
near(C.carbsOf({ grams: '80,5', hc100: 52 }), 41.86, 'coma decimal');
near(C.carbsOf({ hcDirect: 15 }), 15);
near(C.mealCarbs([{ grams: 200, hc100: 28 }, { grams: 150, hc100: 12 }, { hcDirect: 6 }]), 80);
near(C.mealCarbs([{ grams: '', hc100: 28 }]), 0);

// Ratio
near(C.gramsPerUnit('r', 1.5), 10 / 1.5);
near(C.gramsPerUnit('g', 12), 12);
assert.strictEqual(C.gramsPerUnit('r', ''), null);
assert.strictEqual(C.gramsPerUnit('g', 0), null);

// Insulina activa
const H = 3600e3, now = 1e12;
near(C.iob([{ t: now - 2 * H, u: 4 }], now, 4), 2);
near(C.iob([{ t: now - 5 * H, u: 4 }], now, 4), 0);
near(C.iob([{ t: now - 1 * H, u: 4 }, { t: now - 3 * H, u: 2 }], now, 4), 3.5);
near(C.iob([{ t: now - 1 * H, u: 4 }], now, ''), 0, 'sin duración configurada');

// Bolo: 60 g, 1 U cada 10 g, glucosa 180, objetivo 100, sensibilidad 40 → 6 + 2 = 8
let r = C.bolus({ carbs: 60, glucose: 180, gPerU: 10, isf: 40, target: 100, iob: 0, step: 1 });
assert.ok(r.ok); near(r.food, 6); near(r.corr, 2); near(r.total, 8);

// Con insulina activa 1,5 U → 6,5 → redondeo a 0,5
r = C.bolus({ carbs: 60, glucose: 180, gPerU: 10, isf: 40, target: 100, iob: 1.5, step: 0.5 });
near(r.total, 6.5);
// Modo 'corr': la activa solo descuenta de la corrección (2 U como máximo)
r = C.bolus({ carbs: 60, glucose: 180, gPerU: 10, isf: 40, target: 100, iob: 3, iobMode: 'corr', step: 0.5 });
near(r.iobUsed, 2); near(r.total, 6);
r = C.bolus({ carbs: 60, glucose: 180, gPerU: 10, isf: 40, target: 100, iob: 3, iobMode: 'total', step: 0.5 });
near(r.total, 5);

// Glucosa por debajo del objetivo: corrección negativa reduce la dosis
r = C.bolus({ carbs: 40, glucose: 80, gPerU: 10, isf: 40, target: 100, step: 0.5 });
near(r.corr, -0.5); near(r.total, 3.5);

// Nunca negativo
r = C.bolus({ carbs: 0, glucose: 90, gPerU: 10, isf: 40, target: 100, iob: 2, step: 1 });
near(r.total, 0);

// Hipoglucemia: no se sugiere dosis
r = C.bolus({ carbs: 60, glucose: 65, gPerU: 10, isf: 40, target: 100 });
assert.strictEqual(r.ok, false); assert.strictEqual(r.reason, 'hypo');

// Sin glucosa: solo parte de comida
r = C.bolus({ carbs: 45, glucose: '', gPerU: 15, isf: 40, target: 100, step: 1 });
near(r.total, 3); assert.strictEqual(r.hasGlucose, false);

// Tope máximo
r = C.bolus({ carbs: 200, glucose: 300, gPerU: 10, isf: 40, target: 100, step: 1, maxBolus: 15 });
near(r.total, 15); assert.ok(r.capped);

// Sin pautas: no calcula
assert.strictEqual(C.bolus({ carbs: 60, glucose: 180, gPerU: null, isf: 40, target: 100 }).reason, 'config');
assert.strictEqual(C.bolus({ carbs: 60, glucose: 180, gPerU: 10, isf: '', target: 100 }).reason, 'config');

// Franja horaria
assert.strictEqual(C.slotFor(new Date(2026, 10, 21, 8, 0)), 'desayuno');
assert.strictEqual(C.slotFor(new Date(2026, 10, 21, 14, 30)), 'comida');
assert.strictEqual(C.slotFor(new Date(2026, 10, 21, 18, 0)), 'merienda');
assert.strictEqual(C.slotFor(new Date(2026, 10, 21, 22, 0)), 'cena');
assert.strictEqual(C.slotFor(new Date(2026, 10, 21, 2, 0)), 'cena');

console.log('calc: todas las pruebas pasan');

// Unidades y mililitros
near(C.carbsOf({ grams: '2', hc100: 8, unit: 'ud' }), 16, 'dos sobres de azúcar');
near(C.carbsOf({ grams: 200, hc100: 3.4, unit: 'ml' }), 6.8, 'café con leche');
console.log('calc (unidades): todas las pruebas pasan');

// Flecha (regla 50/75/100 del PDF): ejemplo del PDF — 150 ↗ (+50) con objetivo 100, FC 40, 30 g, 1 U/10 g y 1 U activa = 4,5 U
let rf = C.bolus({ carbs: 30, glucose: 150, trendAdj: 50, gPerU: 10, isf: 40, target: 100, iob: 1, step: 0.5 });
near(rf.corr, 2.5); near(rf.total, 4.5); near(rf.trendAdj, 50);
// Bajando rápido resta; nunca sale negativa
rf = C.bolus({ carbs: 10, glucose: 120, trendAdj: -100, gPerU: 10, isf: 40, target: 100, step: 0.5 });
near(rf.corr, -2); near(rf.total, 0);
// La hipoglucemia se mira con la glucosa real, no con la ajustada
assert.strictEqual(C.bolus({ carbs: 30, glucose: 65, trendAdj: 75, gPerU: 10, isf: 40, target: 100 }).reason, 'hypo');
console.log('calc (flechas): todas las pruebas pasan');
