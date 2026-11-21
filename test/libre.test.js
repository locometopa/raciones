// Cliente LibreLinkUp con respuestas simuladas (sin red).
const assert = require('assert');
const crypto = require('crypto');
const Libre = require('../www/js/libre.js');

let queue = [], calls = [];
global.fetch = async (url, opt) => {
  calls.push({ url, opt });
  const next = queue.shift();
  assert.ok(next, 'petición inesperada: ' + url);
  const r = typeof next === 'function' ? next(url, opt) : next;
  return { status: r.http || 200, json: async () => r.body };
};
const okLogin = { body: { status: 0, data: { user: { id: 'abc' }, authTicket: { token: 'tok', expires: Math.floor(Date.now() / 1000) + 3600 } } } };
const gm = (v, ts, trend) => ({ ValueInMgPerDl: v, TrendArrow: trend || 3, FactoryTimestamp: ts, Timestamp: ts });
const cfg = { email: 'a@b.c', password: 'x' };

(async () => {
  // Fechas
  assert.strictEqual(Libre.parseLLU('11/21/2026 4:26:03 AM', true), Date.UTC(2026, 10, 21, 4, 26, 3));
  assert.strictEqual(Libre.parseLLU('11/21/2026 12:05:00 AM', true), Date.UTC(2026, 10, 21, 0, 5, 0));
  assert.strictEqual(Libre.parseLLU('11/21/2026 12:05:00 PM', true), Date.UTC(2026, 10, 21, 12, 5, 0));
  assert.strictEqual(Libre.parseLLU('11/21/2026 16:05:00', true), Date.UTC(2026, 10, 21, 16, 5, 0));
  assert.strictEqual(Libre.parseLLU('basura', true), null);

  // Flujo completo: redirección de región → login → conexiones → gráfica
  queue = [
    { body: { status: 0, data: { redirect: true, region: 'eu' } } },
    okLogin,
    { body: { status: 0, data: [{ patientId: 'p1', glucoseMeasurement: gm(168, '11/21/2026 4:26:03 AM', 1) }] } },
    { body: { status: 0, data: { connection: { glucoseMeasurement: gm(168, '11/21/2026 4:26:03 AM', 1) }, graphData: [
      gm(250, '11/21/2026 4:00:00 AM'), gm(210, '11/21/2026 4:10:00 AM'), gm(180, '11/21/2026 4:20:00 AM')] } } }
  ];
  calls = [];
  let out = await Libre.read(cfg);
  assert.strictEqual(out.reading.mgdl, 168);
  assert.strictEqual(out.reading.trend, 1);
  assert.strictEqual(out.reading.t, Date.UTC(2026, 10, 21, 4, 26, 3));
  assert.strictEqual(out.graph.length, 4, 'gráfica + lectura actual');
  assert.strictEqual(out.graph[0].v, 250);
  assert.strictEqual(out.session.host, 'api-eu.libreview.io');
  assert.ok(calls[1].url.startsWith('https://api-eu.libreview.io/llu/auth/login'));
  assert.ok(calls[3].url.endsWith('/llu/connections/p1/graph'));
  const h = calls[2].opt.headers;
  assert.strictEqual(h['account-id'], crypto.createHash('sha256').update('abc').digest('hex'));
  assert.strictEqual(h['authorization'], 'Bearer tok');
  assert.strictEqual(h['product'], 'llu.android');

  // Con sesión válida no vuelve a iniciar sesión; si la gráfica falla, sigue la lectura
  queue = [
    { body: { status: 0, data: [{ patientId: 'p1', glucoseMeasurement: gm(120, '11/21/2026 5:00:00 AM') }] } },
    { http: 500, body: null }
  ];
  calls = [];
  out = await Libre.read(Object.assign({}, cfg, { session: out.session }));
  assert.strictEqual(calls.length, 2); assert.strictEqual(out.reading.mgdl, 120); assert.strictEqual(out.graph.length, 1);

  // Sesión caducada en el servidor (401): vuelve a entrar una vez
  queue = [
    { http: 401, body: {} }, okLogin,
    { body: { status: 0, data: [{ glucoseMeasurement: gm(99, '11/21/2026 5:00:00 AM') }] } }
  ];
  out = await Libre.read(Object.assign({}, cfg, { session: { host: 'api-eu.libreview.io', version: '5.0.1', token: 'viejo', accountId: 'x', expires: Date.now() + 3600e3 } }));
  assert.strictEqual(out.reading.mgdl, 99);

  // Errores con mensaje claro
  const fails = async (resp, code) => { queue = resp; await assert.rejects(Libre.read(cfg), (e) => e.code === code); };
  await fails([{ body: { status: 2 } }], 'auth');
  await fails([{ body: { status: 4, data: { step: { type: 'tou' }, authTicket: { token: 't' } } } }], 'step');
  await fails([{ body: { status: 429 } }], 'rate');
  await fails([okLogin, { body: { status: 0, data: [] } }], 'noconn');
  await assert.rejects(Libre.read({ email: '', password: '' }), (e) => e.code === 'cfg');
  // Versión mínima exigida: reintenta con la que pide
  queue = [{ http: 403, body: { status: 920, data: { minimumVersion: '5.1.0' } } }, okLogin, { body: { status: 0, data: [{ glucoseMeasurement: gm(140, '11/21/2026 5:00:00 AM') }] } }];
  calls = [];
  out = await Libre.read(cfg);
  assert.strictEqual(calls[1].opt.headers.version, '5.1.0'); assert.strictEqual(out.session.version, '5.1.0');

  console.log('libre: todas las pruebas pasan');
})().catch((e) => { console.error(e); process.exit(1); });
