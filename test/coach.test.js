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
// Previsión: bajando 1,5 por minuto desde 100 → en 20 min por debajo de 70
const falling = []; for (let k = 15; k >= 0; k--) falling.push([now - k * 60000, 100 - (15 - k) * 1.5 + 22.5]);
const pr = C.predict(falling, now); assert.ok(Math.abs(pr.slope + 1.5) < 0.01); assert.strictEqual(pr.now, 100 - 22.5 + 22.5);
const ls = C.lowSoon(falling.map((p) => [p[0], p[1] - 20]), now, 70); assert.ok(ls && ls.in20 < 70);
assert.strictEqual(C.lowSoon(falling, now, 70), null, '100 bajando a 70 justo: aún no');
assert.strictEqual(C.lowSoon(series(now - 20 * 60000, now, () => 90), now, 70), null, 'estable');
assert.ok(C.message({ g: 80, lowSoon: { in20: 55 }, stats: {}, now }).text.includes('20 min'));
// Resumen semanal y patrones
const wh = []; for (let t = now - 14 * D; t <= now; t += 5 * 60000) { const h = new Date(t).getHours(); wh.push([t, h >= 3 && h < 6 ? 175 : h >= 0 && h < 2 ? 120 : (t > now - 7 * D ? 130 : 200)]); }
const wl = []; for (let d = 1; d <= 6; d++) { wl.push({ t: now - d * D, ins: 'rapida', slot: 'cena', carbs: 50, u: 5, glucose: 120, post: { g2: 220 } }); wl.push({ t: now - d * D - 5 * H, ins: 'rapida', slot: 'comida', carbs: 50, u: 5, glucose: 120, post: { g2: 140 } }); }
const wr = C.weekly({ hist: wh, log: wl, now });
assert.ok(wr.tir > wr.tirPrev); assert.ok(wr.patterns.some((p) => p.k === 'trend' && p.x.includes('mejorado')));
assert.ok(wr.patterns.some((p) => p.k === 'meal' && p.x.includes('la cena'))); assert.ok(wr.patterns.some((p) => p.k === 'dawn'));
assert.ok(C.weeklyText(wr).includes('% en rango'));
console.log('coach: todas las pruebas pasan');
