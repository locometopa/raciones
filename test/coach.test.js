const assert = require('assert');
const C = require('../www/js/coach.js');
const H = 3600e3, D = 24 * H, M = 60000;
const now = new Date(2026, 10, 21, 18, 0).getTime();
function series(fromT, toT, f) { const h = []; for (let t = fromT; t <= toT; t += 15 * M) h.push([t, f(t)]); return h; }

// 5 días anteriores enteros al 100 % en rango + hoy: alto hasta hace 30 min y en rango desde entonces
const day0 = new Date(now); day0.setHours(0, 0, 0, 0);
let hist = series(day0.getTime() - 5 * D, now, (t) => (t > now - 3.5 * H && t < now - 30 * M ? 230 : 120));
let s = C.stats({ hist, now });
assert.strictEqual(s.streak, 5); assert.strictEqual(s.noLow, 5);
assert.ok(s.justBack, 'acaba de volver al rango'); assert.ok(s.run >= 15 * M && s.run <= 45 * M);
assert.strictEqual(s.week.length, 7); assert.strictEqual(Math.round(s.week[5].tir), 100);
let m = C.message({ g: 120, trend: 3, stats: s, now });
assert.strictEqual(m.tone, 'ok'); assert.ok(/vuelto al rango|De vuelta/.test(m.text)); assert.ok(m.text.includes('5 días seguidos'));

// Largo rato en rango
hist = series(now - 5 * H, now, () => 110);
s = C.stats({ hist, now }); assert.ok(s.run >= 4.9 * H);
assert.ok(/en rango/.test(C.message({ g: 110, trend: 3, stats: s, now }).text));

// Bajo, bajando, alto mantenido, después de comer
assert.strictEqual(C.message({ g: 62, stats: {}, now }).tone, 'bad');
assert.ok(C.message({ g: 82, trend: 2, stats: {}, now }).text.includes('azúcar a mano'));
hist = series(now - 2 * H, now, () => 280);
s = C.stats({ hist, now }); assert.ok(s.highFor >= 1.9 * H);
assert.ok(C.message({ g: 280, stats: s, now }).text.includes('por encima de 250'));
assert.ok(C.message({ g: 200, trend: 4, ateRecently: true, stats: {}, now }).text.includes('después de comer'));
assert.strictEqual(C.message({ g: null, stats: {}, now }).tone, 'info');

// Trucos: primero los que encajan contigo, sin repetir
const unlocked = [];
let t1 = C.nextTip(unlocked, { rapid: 'Fiasp', basal: 'Tresiba', recentLow: true });
assert.ok(t1.ctx, 'prioriza uno contextual'); unlocked.push(t1.id);
const ids = new Set(C.TIPS.map((t) => t.id)); assert.strictEqual(ids.size, C.TIPS.length, 'ids únicos');
for (let i = 0; i < C.TIPS.length + 2; i++) { const n = C.nextTip(unlocked, {}); if (!n) break; assert.ok(unlocked.indexOf(n.id) < 0); unlocked.push(n.id); }
assert.strictEqual(unlocked.length, C.TIPS.length); assert.strictEqual(C.nextTip(unlocked, {}), null);

// Logros
const a = C.achievements({ meals: 12, plates: 0, daysUsed: 2, basalStreak: 7, stats: { streak: 3, noLow: 1 }, reportShared: false });
const ok = a.filter((x) => x.ok).map((x) => x.id);
assert.deepStrictEqual(ok.sort(), ['comidas10', 'dia70', 'lenta7', 'primera', 'racha3'].sort());

// Infografías
assert.ok(C.infographics().length >= 5);
C.infographics().forEach((i) => { const g = C.infographic(i.id); assert.ok(g.svg.startsWith('<svg') && g.svg.endsWith('</svg>'), i.id); });
assert.ok(C.donut(82).includes('82 %')); assert.ok(C.weekBars(s.week).includes('<rect'));
// Ánimo
assert.strictEqual(C.moodReply({ mood: 2, g: 60 }).tone, 'bad');
assert.ok(C.moodReply({ mood: 1, g: 290 }).text.includes('alto'));
assert.ok(C.moodReply({ mood: 2, g: 120, tags: ['Estresado'] }).text.includes('respiración'));
assert.strictEqual(C.moodReply({ mood: 5, g: 120 }).tone, 'ok');
const ml = [];
for (let i = 0; i < 4; i++) ml.push({ t: now - i * D, ins: 'animo', mood: 4, glucose: 120 });
for (let i = 0; i < 3; i++) ml.push({ t: now - i * D - H, ins: 'animo', mood: 2, glucose: 240, tags: ['Cansado'] });
const ms = C.moodStats(ml, 70, 180, now, 30);
assert.strictEqual(ms.n, 7); assert.strictEqual(ms.rango.avg, 4); assert.strictEqual(ms.alto.avg, 2); assert.strictEqual(ms.tags[0][0], 'Cansado');
assert.ok(!C.lowStreak(ml, now));
const bad = []; for (let i = 0; i < 5; i++) bad.push({ t: now - i * D, ins: 'animo', mood: 1 });
assert.ok(C.lowStreak(bad, now));
// Muchos trucos, sin repetir ids, y los de ánimo salen primero si estás de bajón
assert.ok(C.TIPS.length >= 90);
assert.strictEqual(C.nextTip([], { lowMood: true }).k, 'Ánimo');
console.log('coach: todas las pruebas pasan');
