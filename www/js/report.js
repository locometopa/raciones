/* Informe para el endocrino: resume glucosa (del historial del Libre), comidas, insulina y bajadas de un periodo.
   Función pura: build() devuelve los datos y text() un resumen en texto para compartir. */
var Report = (function () {
  'use strict';
  var H = 3600e3, D = 24 * H;
  var SLOTS = [['desayuno', 'Desayuno'], ['comida', 'Comida'], ['merienda', 'Merienda'], ['cena', 'Cena']];
  function isRapid(e) { return !e.ins || e.ins === 'rapida'; }
  function avg(a) { return a.length ? a.reduce(function (s, x) { return s + x; }, 0) / a.length : null; }
  function r1(n) { return n == null ? null : Math.round(n * 10) / 10; }

  /* o: {hist:[[t,v]], log, cfg, now, days} */
  function build(o) {
    var now = o.now || Date.now(), days = o.days || 14, from = now - days * D;
    var pts = (o.hist || []).filter(function (p) { return p[0] >= from && p[0] <= now; }).sort(function (a, b) { return a[0] - b[0]; });
    var vals = pts.map(function (p) { return p[1]; }), n = vals.length;
    var g = { n: n, coverage: Math.min(100, Math.round(n * 15 / (days * 24 * 60) * 100)) };
    if (n) {
      g.mean = avg(vals);
      g.sd = Math.sqrt(avg(vals.map(function (v) { return (v - g.mean) * (v - g.mean); })));
      g.cv = g.sd / g.mean * 100;
      g.gmi = 3.31 + 0.02392 * g.mean; // GMI (Bergenstal 2018): HbA1c estimada a partir de la media
      var pct = function (f) { return vals.filter(f).length / n * 100; };
      g.vlow = pct(function (v) { return v < 54; });
      g.low = pct(function (v) { return v >= 54 && v < 70; });
      g.inr = pct(function (v) { return v >= 70 && v <= 180; });
      g.high = pct(function (v) { return v > 180 && v <= 250; });
      g.vhigh = pct(function (v) { return v > 250; });
      // Episodios por debajo de 70 (puntos seguidos; un hueco de más de 30 min o volver a 70 cierra el episodio)
      var ep = 0, inEp = false, lastT = 0;
      pts.forEach(function (p) {
        if (p[1] < 70) { if (!inEp || p[0] - lastT > 30 * 60000) ep++; inEp = true; } else inEp = false;
        lastT = p[0];
      });
      g.lowEpisodes = ep;
    }
    var log = (o.log || []).filter(function (e) { return e.t >= from && e.t <= now; });
    var meals = {};
    SLOTS.forEach(function (s) {
      var m = log.filter(function (e) { return isRapid(e) && e.slot === s[0] && e.carbs > 0; });
      meals[s[0]] = {
        n: m.length,
        carbs: avg(m.map(function (e) { return e.carbs; })),
        u: avg(m.map(function (e) { return e.u || 0; })),
        pre: avg(m.filter(function (e) { return e.glucose != null; }).map(function (e) { return e.glucose; })),
        post2: avg(m.filter(function (e) { return e.post && e.post.g2 != null; }).map(function (e) { return e.post.g2; })),
        ratio: o.cfg && o.cfg.ratios ? o.cfg.ratios[s[0]] : ''
      };
    });
    // Insulina por día
    var byDay = {};
    log.forEach(function (e) {
      if (!(e.u > 0) || e.ins === 'hipo') return;
      var k = new Date(e.t); k.setHours(0, 0, 0, 0); k = k.getTime();
      var d = byDay[k] = byDay[k] || { rapid: 0, basal: 0 };
      if (e.ins === 'basal') d.basal += e.u; else d.rapid += e.u;
    });
    var dk = Object.keys(byDay).map(function (k) { return byDay[k]; });
    var full = dk.filter(function (d) { return d.rapid > 0 && d.basal > 0; });
    var ins = {
      daysRapid: dk.filter(function (d) { return d.rapid > 0; }).length,
      rapid: avg(dk.filter(function (d) { return d.rapid > 0; }).map(function (d) { return d.rapid; })),
      basal: avg(dk.filter(function (d) { return d.basal > 0; }).map(function (d) { return d.basal; })),
      tdd: full.length ? avg(full.map(function (d) { return d.rapid + d.basal; })) : null,
      corrections: log.filter(function (e) { return isRapid(e) && e.u > 0 && !(e.carbs > 0); }).length
    };
    var hipos = log.filter(function (e) { return e.ins === 'hipo'; });
    var changes = ((o.cfg && o.cfg.ratioLog) || []).filter(function (c) { return c.t >= from; });
    return { from: from, to: now, days: days, glucose: g, meals: meals, insulin: ins, hipos: hipos, changes: changes, cfg: o.cfg || {} };
  }

  function f(n, d) { return n == null ? '—' : (Math.round(n * Math.pow(10, d || 0)) / Math.pow(10, d || 0)).toString().replace('.', ','); }
  function day(t) { return new Date(t).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }); }

  function text(r, appName) {
    var g = r.glucose, c = r.cfg, L = [];
    L.push('Informe de ' + (appName || 'iocrino') + ' · del ' + day(r.from) + ' al ' + day(r.to) + ' (' + r.days + ' días)');
    L.push('');
    L.push('PAUTAS ACTUALES');
    L.push('Insulinas: ' + (c.rapid || '—') + ' (rápida)' + (c.basal && c.basal !== 'Ninguna' ? ', ' + c.basal + ' (lenta)' : ''));
    L.push('Ratio ' + (c.ratioMode === 'g' ? '(g de HC por unidad)' : '(U por ración de 10 g)') + ': ' + SLOTS.map(function (s) { return s[1].toLowerCase() + ' ' + ((c.ratios || {})[s[0]] || '—'); }).join(', '));
    L.push('Factor de sensibilidad: ' + (c.isf || '—') + ' mg/dL · objetivo: ' + (c.target || '—') + ' mg/dL · duración de la rápida: ' + (c.dia || '—') + ' h');
    L.push('');
    L.push('GLUCOSA (sensor)');
    if (!g.n) L.push('Sin datos del sensor en este periodo.');
    else {
      L.push('Datos del sensor: ' + g.coverage + ' % del tiempo');
      L.push('Media: ' + f(g.mean) + ' mg/dL · GMI (HbA1c estimada): ' + f(g.gmi, 1) + ' % · variabilidad (CV): ' + f(g.cv) + ' %');
      L.push('Tiempo en rango 70–180: ' + f(g.inr) + ' %');
      L.push('Por encima de 250: ' + f(g.vhigh) + ' % · 181–250: ' + f(g.high) + ' %');
      L.push('54–69: ' + f(g.low) + ' % · por debajo de 54: ' + f(g.vlow) + ' %');
      L.push('Episodios por debajo de 70: ' + g.lowEpisodes);
    }
    L.push('');
    L.push('INSULINA');
    L.push('Rápida: ' + f(r.insulin.rapid, 1) + ' U/día de media (' + r.insulin.daysRapid + ' días apuntados) · correcciones sueltas: ' + r.insulin.corrections);
    L.push('Lenta: ' + f(r.insulin.basal, 1) + ' U/día · total diario: ' + f(r.insulin.tdd, 1) + ' U');
    L.push('');
    L.push('COMIDAS (medias)');
    SLOTS.forEach(function (s) {
      var m = r.meals[s[0]];
      if (!m.n) { L.push(s[1] + ': sin registros'); return; }
      L.push(s[1] + ': ' + m.n + ' comidas · ' + f(m.carbs) + ' g HC · ' + f(m.u, 1) + ' U · glucosa antes ' + f(m.pre) + ' → a las 2 h ' + f(m.post2) + ' mg/dL');
    });
    L.push('');
    L.push('BAJADAS APUNTADAS: ' + r.hipos.length);
    r.hipos.slice(-10).forEach(function (h) { L.push('· ' + day(h.t) + ' ' + new Date(h.t).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) + (h.glucose != null ? ' · ' + h.glucose + ' mg/dL' : '') + (h.what ? ' · tomó ' + h.what : '')); });
    if (r.changes.length) {
      L.push('');
      L.push('CAMBIOS DE RATIO');
      r.changes.forEach(function (ch) { L.push('· ' + day(ch.t) + ': ' + ch.slot + ' de ' + ch.from + ' a ' + ch.to); });
    }
    return L.join('\n');
  }

  var api = { build: build, text: text };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  return api;
})();
