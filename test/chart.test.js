const assert = require('assert');
const Chart = require('../www/js/chart.js');
const now = new Date(2026, 10, 21, 5, 30).getTime(), M = 60000;

let s = Chart.svg({ now, points: [], low: 70, high: 180, hypo: 70, alto: 250 });
assert.ok(s.includes('Sin lecturas'));
assert.ok(s.includes('class="band"') && s.includes('class="hypo"') && s.includes('class="alto"'));

const pts = [];
for (let i = 0; i < 12 * 4; i++) pts.push({ t: now - 12 * 60 * M + i * 15 * M, v: 100 + i * 5 });
s = Chart.svg({ now, points: pts, low: 70, high: 180, hypo: 70, alto: 250, cls: 'high', marks: [{ t: now - 60 * M, u: 6.5 }] });
assert.ok(s.includes('<polyline class="gline"'));
assert.ok(s.includes('class="cur high"'));
assert.ok(s.includes('6,5 U'));
assert.ok(s.includes('03:00'), 'marcas cada 3 horas');
assert.ok(!s.includes('Sin lecturas'));
// Hueco de más de 20 min parte la línea en dos
s = Chart.svg({ now, points: [{ t: now - 120 * M, v: 120 }, { t: now - 110 * M, v: 125 }, { t: now - 30 * M, v: 140 }, { t: now - 20 * M, v: 150 }] });
assert.strictEqual((s.match(/<polyline/g) || []).length, 2);
// Valores fuera de la ventana no cuentan; escala crece con valores altos
s = Chart.svg({ now, points: [{ t: now - 13 * 60 * M, v: 400 }] });
assert.ok(s.includes('Sin lecturas'));
s = Chart.svg({ now, points: [{ t: now - 10 * M, v: 420 }, { t: now - 5 * M, v: 410 }] });
assert.ok(s.includes('>450<'));
console.log('chart: todas las pruebas pasan');
