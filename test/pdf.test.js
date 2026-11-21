const assert = require('assert');
const PDF = require('../www/js/pdf.js');
const Report = require('../www/js/report.js');
const V = require('../www/js/vision.js');
// PDF con dos páginas: estructura y tabla xref coherentes
const fake = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]).toString('base64');
const b64 = PDF.fromJpegs([{ b64: fake, w: 10, h: 10 }, { b64: fake, w: 10, h: 10 }], 'Prueba (x)');
const s = Buffer.from(b64, 'base64').toString('latin1');
assert.ok(s.startsWith('%PDF-1.4')); assert.ok(s.trim().endsWith('%%EOF'));
assert.ok(s.includes('/Count 2')); assert.strictEqual((s.match(/\/Type \/Page /g) || []).length, 2);
const sx = +s.match(/startxref\n(\d+)/)[1]; assert.ok(s.slice(sx).startsWith('xref'));
const offs = s.slice(sx).split('\n').slice(3, 9).map((l) => +l.slice(0, 10));
offs.forEach((o, i) => assert.ok(s.slice(o).startsWith((i + 1) + ' 0 obj'), 'offset del objeto ' + (i + 1)));
assert.ok(s.includes('/Title (Prueba x)'));
// AGP: percentiles por media hora
const now = new Date(2026, 10, 21, 23, 59).getTime(), hist = [];
for (let d = 0; d < 14; d++) for (let m = 0; m < 1440; m += 15) { const t = now - 14 * 864e5 + d * 864e5 + m * 60000; hist.push([t, 100 + d * 5]); }
const a = Report.agp(hist, now, 14);
assert.strictEqual(a.length, 48); assert.ok(a[10].n >= 20); assert.ok(a[10].p5 <= a[10].p50 && a[10].p50 <= a[10].p95);
const dl = Report.daily(hist, now, 14); assert.strictEqual(dl.length, 14); assert.ok(dl[13].pts.length > 50);
// Etiqueta
let l = V.parseLabelText('```json {"nombre":"Galletas","hc_por_100":"68,5","unidad":"g","racion":30,"notas":""} ```');
assert.deepStrictEqual([l.name, l.hc100, l.unit, l.portion], ['Galletas', 68.5, 'g', 30]);
l = V.cleanLabel({ nombre: 'Zumo', hc_por_100: 10.2, unidad: 'ml' }); assert.strictEqual(l.unit, 'ml');
assert.strictEqual(V.cleanLabel({ nombre: 'X', hc_por_100: 250 }).hc100, null);
console.log('pdf: todas las pruebas pasan');
