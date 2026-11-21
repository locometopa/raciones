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
      if (b.status === 4) throw LibreError('step', 'LibreLinkUp pide un paso pendiente (' + ((d.step && d.step.type) || 'aceptar condiciones') + '). Abre la app LibreLinkUp, acéptalo y vuelve a probar.');
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

  function parseTime(gm) {
    var t = gm.FactoryTimestamp ? Date.parse(gm.FactoryTimestamp + ' UTC') : NaN;
    if (isNaN(t) && gm.Timestamp) t = Date.parse(gm.Timestamp);
    return isNaN(t) ? null : t;
  }

  /* cfg: {email, password, version, session}. Devuelve {reading:{mgdl,trend,t}, session} */
  async function read(cfg) {
    var sess = cfg.session;
    for (var attempt = 0; attempt < 2; attempt++) {
      if (!sess || !sess.token || (sess.expires && sess.expires < Date.now() + 60000)) sess = await login(cfg);
      var r = await request(sess.host, '/llu/connections', { method: 'GET', headers: headers(sess.version, sess) });
      if (r.http === 401 || r.http === 403) { sess = null; cfg = Object.assign({}, cfg, { session: null }); continue; }
      var list = r.body.data;
      if (r.body.status !== 0 || !Array.isArray(list)) throw LibreError('proto', 'Respuesta inesperada de LibreLinkUp (HTTP ' + r.http + ').');
      if (!list.length) throw LibreError('noconn', 'La cuenta de LibreLinkUp no sigue a nadie. Desde la app LibreLink, invita a ese correo en «Aplicaciones conectadas → LibreLinkUp».');
      var gm = list[0].glucoseMeasurement;
      if (!gm) throw LibreError('nodata', 'LibreLinkUp no tiene ninguna lectura reciente del sensor.');
      var mgdl = Number(gm.ValueInMgPerDl);
      if (!(mgdl > 0)) throw LibreError('nodata', 'Lectura del sensor no válida.');
      return { reading: { mgdl: Math.round(mgdl), trend: Number(gm.TrendArrow) || 0, t: parseTime(gm) }, session: sess };
    }
    throw LibreError('auth', 'LibreLinkUp rechaza la sesión. Revisa correo y contraseña.');
  }

  return { read: read, DEFAULT_VERSION: DEFAULT_VERSION };
})();
