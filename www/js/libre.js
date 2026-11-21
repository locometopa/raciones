/* Lectura de glucosa por LibreLinkUp (la función de «compartir» de Abbott).
   NO es una API oficial para programas propios: Abbott la cambia sin avisar.
   Solo funciona dentro de la app instalada (en un navegador normal lo bloquea CORS). */
var Libre = (function () {
  'use strict';
  var DEFAULT_VERSION = '5.0.1';
  var DEFAULT_HOST = 'api.libreview.io';

  function LibreError(code, msg) { var e = new Error(msg); e.code = code; return e; }

  async function sha256hex(s) {
    var buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return Array.from(new Uint8Array(buf)).map(function (x) { return x.toString(16).padStart(2, '0'); }).join('');
  }

  function headers(version, sess) {
    var h = {
      'accept': 'application/json',
      'content-type': 'application/json',
      'cache-control': 'no-cache',
      'product': 'llu.android',
      'version': version,
      'user-agent': 'LibreLinkUp/' + version
    };
    if (sess) { h['authorization'] = 'Bearer ' + sess.token; h['account-id'] = sess.accountId; }
    return h;
  }

  async function request(host, path, opt) {
    var res;
    try { res = await fetch('https://' + host + path, opt); }
    catch (e) { throw LibreError('net', 'No se pudo conectar con LibreLinkUp (¿sin internet?).'); }
    var body = null;
    try { body = await res.json(); } catch (e) { /* sin cuerpo JSON */ }
    return { http: res.status, body: body || {} };
  }

  async function login(cfg) {
    if (!cfg.email || !cfg.password) throw LibreError('cfg', 'Falta el correo o la contraseña de LibreLinkUp en Ajustes.');
    var host = (cfg.session && cfg.session.host) || DEFAULT_HOST;
    var version = cfg.version || DEFAULT_VERSION;
    for (var i = 0; i < 4; i++) {
      var r = await request(host, '/llu/auth/login', {
        method: 'POST', headers: headers(version), body: JSON.stringify({ email: cfg.email, password: cfg.password })
      });
      var b = r.body, d = b.data || {};
      if (d.redirect && d.region) { host = 'api-' + d.region + '.libreview.io'; continue; }
      if ((b.status === 920 || r.http === 403) && d.minimumVersion && d.minimumVersion !== version) { version = d.minimumVersion; continue; }
      if (b.status === 2) throw LibreError('auth', 'Correo o contraseña de LibreLinkUp incorrectos.');
      if (b.status === 4) {
        var type = (d.step && d.step.type) || '';
        var e4 = LibreError('step', 'LibreLinkUp pide aceptar ' + stepName(type) + ' antes de dejar leer la glucosa.');
        e4.step = { type: type, ticket: d.authTicket && d.authTicket.token, host: host, version: version };
        throw e4;
      }
      if (b.status === 429 || b.status === 430 || r.http === 429 || r.http === 430) throw LibreError('rate', 'LibreLinkUp ha bloqueado temporalmente el acceso por demasiados intentos. Espera unos minutos.');
      if (b.status === 0 && d.authTicket && d.authTicket.token && d.user && d.user.id) {
        var exp = Number(d.authTicket.expires) || 0;
        return {
          host: host, version: version, token: d.authTicket.token,
          expires: exp > 1e12 ? exp : exp * 1000,
          accountId: await sha256hex(d.user.id)
        };
      }
      throw LibreError('proto', 'Respuesta inesperada de LibreLinkUp (HTTP ' + r.http + ', estado ' + b.status + '). Puede que Abbott haya cambiado el servicio.');
    }
    throw LibreError('proto', 'No se pudo iniciar sesión en LibreLinkUp.');
  }

  function stepName(type) {
    return type === 'tou' ? 'las nuevas condiciones de uso' : type === 'pp' ? 'la nueva política de privacidad' : 'un documento nuevo' + (type ? ' (' + type + ')' : '');
  }

  /* Acepta el paso pendiente (condiciones, privacidad) igual que la app LibreLinkUp.
     Solo se llama cuando el usuario lo pide expresamente. */
  async function acceptStep(step) {
    if (!step || !step.type || !step.ticket || !/^[a-z0-9_-]+$/i.test(step.type)) throw LibreError('proto', 'No hay ningún paso pendiente que aceptar.');
    var h = headers(step.version || DEFAULT_VERSION);
    h['authorization'] = 'Bearer ' + step.ticket;
    var r = await request(step.host || DEFAULT_HOST, '/auth/continue/' + step.type, { method: 'POST', headers: h });
    if (r.http >= 400 || (r.body.status !== undefined && r.body.status !== 0 && r.body.status !== 4)) throw LibreError('proto', 'LibreLinkUp no ha aceptado el paso (HTTP ' + r.http + '). Prueba a hacerlo desde la app LibreLinkUp.');
    return true;
  }

  /* Fechas de LibreLinkUp: "11/21/2026 4:26:03 AM". FactoryTimestamp va en UTC; Timestamp en hora local. */
  function parseLLU(s, utc) {
    var m = /^(\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{1,2}):(\d{2}):(\d{2})(?: ?([AP]M))?$/i.exec(String(s || '').trim());
    if (!m) return null;
    var h = +m[4];
    if (m[7]) { var pm = m[7].toUpperCase() === 'PM'; if (h === 12) h = pm ? 12 : 0; else if (pm) h += 12; }
    var a = [+m[3], +m[1] - 1, +m[2], h, +m[5], +m[6]];
    return utc ? Date.UTC(a[0], a[1], a[2], a[3], a[4], a[5]) : new Date(a[0], a[1], a[2], a[3], a[4], a[5]).getTime();
  }
  function parseTime(gm) {
    var t = parseLLU(gm.FactoryTimestamp, true);
    if (t === null) t = parseLLU(gm.Timestamp, false);
    if (t === null && gm.Timestamp) { t = Date.parse(gm.Timestamp); if (isNaN(t)) t = null; }
    return t;
  }
  function toPoint(gm) {
    if (!gm) return null;
    var v = Number(gm.ValueInMgPerDl), t = parseTime(gm);
    return v > 0 && t ? { t: t, v: Math.round(v) } : null;
  }
  function toReading(gm) {
    var p = toPoint(gm);
    return p ? { mgdl: p.v, trend: Number(gm.TrendArrow) || 0, t: p.t } : null;
  }

  /* cfg: {email, password, version, session}.
     Devuelve {reading:{mgdl,trend,t}, graph:[{t,v}], session}. La gráfica es opcional: si falla, sigue la lectura. */
  async function read(cfg) {
    var sess = cfg.session;
    for (var attempt = 0; attempt < 2; attempt++) {
      if (!sess || !sess.token || (sess.expires && sess.expires < Date.now() + 60000)) sess = await login(cfg);
      var hdr = headers(sess.version, sess);
      var r = await request(sess.host, '/llu/connections', { method: 'GET', headers: hdr });
      if (r.http === 401 || r.http === 403) { sess = null; cfg = Object.assign({}, cfg, { session: null }); continue; }
      var list = r.body.data;
      if (r.body.status !== 0 || !Array.isArray(list)) throw LibreError('proto', 'Respuesta inesperada de LibreLinkUp (HTTP ' + r.http + ').');
      if (!list.length) throw LibreError('noconn', 'La cuenta de LibreLinkUp no sigue a nadie. Desde la app LibreLink, invita a ese correo en «Aplicaciones conectadas → LibreLinkUp».');
      var conn = list[0];
      var reading = toReading(conn.glucoseMeasurement), graph = [];
      if (conn.patientId) {
        try {
          var gr = await request(sess.host, '/llu/connections/' + encodeURIComponent(conn.patientId) + '/graph', { method: 'GET', headers: hdr });
          var gd = gr.body && gr.body.data;
          if (gr.body.status === 0 && gd) {
            if (Array.isArray(gd.graphData)) graph = gd.graphData.map(toPoint).filter(Boolean);
            var r2 = gd.connection && toReading(gd.connection.glucoseMeasurement);
            if (r2 && (!reading || r2.t >= reading.t)) reading = r2;
          }
        } catch (e) { /* sin gráfica: seguimos con la lectura actual */ }
      }
      if (!reading) throw LibreError('nodata', 'LibreLinkUp no tiene ninguna lectura reciente del sensor.');
      graph.sort(function (a, b) { return a.t - b.t; });
      if (!graph.length || graph[graph.length - 1].t < reading.t) graph.push({ t: reading.t, v: reading.mgdl });
      return { reading: reading, graph: graph, session: sess };
    }
    throw LibreError('auth', 'LibreLinkUp rechaza la sesión. Revisa correo y contraseña.');
  }

  var api = { read: read, acceptStep: acceptStep, stepName: stepName, parseLLU: parseLLU, DEFAULT_VERSION: DEFAULT_VERSION };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  return api;
})();
