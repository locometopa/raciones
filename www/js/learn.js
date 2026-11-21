/* Aprendizaje: mira cómo acabó la glucosa después de cada comida registrada (con la gráfica del Libre)
   y saca patrones por franja y por alimento. Solo OBSERVA: nunca cambia las pautas. */
var Learn = (function () {
  'use strict';
  var H = 3600e3;

  function nearest(graph, t, tol) {
    var best = null, bd = Infinity;
    for (var i = 0; i < graph.length; i++) { var d = Math.abs(graph[i].t - t); if (d < bd) { bd = d; best = graph[i]; } }
    return best && bd <= tol ? best.v : null;
  }
  function isRapid(e) { return e && e.ins !== 'basal'; }

  /* Resultado de una comida: glucosa a las 2 y 3 h, máximo y mínimo en 4 h. null si no hay datos. */
  function outcome(entry, graph) {
    var win = (graph || []).filter(function (p) { return p.t >= entry.t && p.t <= entry.t + 4 * H; });
    if (win.length < 6) return null;
    var g3 = nearest(win, entry.t + 3 * H, 20 * 60000);
    if (g3 === null) return null;
    var vals = win.map(function (p) { return p.v; });
    return { g1: nearest(win, entry.t + 1 * H, 20 * 60000), g2: nearest(win, entry.t + 2 * H, 20 * 60000), g3: g3, g4: nearest(win, entry.t + 4 * H, 20 * 60000), max: Math.max.apply(null, vals), min: Math.min.apply(null, vals) };
  }

  /* Rellena e.post en las comidas que ya tienen 3 h y datos. Devuelve cuántas ha cambiado. */
  function update(log, graph, now) {
    var changed = 0;
    (log || []).forEach(function (e) {
      if (e.post || !isRapid(e) || !(e.carbs > 0)) return;
      if (now - e.t < 4.25 * H) return;
      var o = outcome(e, graph);
      if (o) { e.post = o; changed++; }
      else if (now - e.t > 26 * H) { e.post = { none: true }; changed++; }
    });
    return changed;
  }

  function avg(a) { return a.length ? a.reduce(function (s, x) { return s + x; }, 0) / a.length : null; }

  /* o: {now, days, low, high, target}. Devuelve {n, slots:{franja:{n,avg3,lows,highs,level,text}}, foods:[{name,n,rise}]} */
  function summary(log, o) {
    o = o || {};
    var now = o.now || Date.now(), since = now - (o.days || 30) * 24 * H;
    var low = o.low || 70, high = o.high || 180, target = o.target || 100;
    var meals = (log || []).filter(function (e) {
      if (!isRapid(e) || !(e.carbs > 0) || !e.post || e.post.none || e.t < since) return false;
      // Si hubo otra dosis rápida en las 3 h siguientes (corrección), la comida no sirve para aprender
      return !log.some(function (x) { return x !== e && isRapid(x) && x.u > 0 && x.t > e.t && x.t < e.t + 3 * H; });
    });
    var slots = {};
    ['desayuno', 'comida', 'merienda', 'cena'].forEach(function (k) {
      var m = meals.filter(function (e) { return e.slot === k; });
      var r = { n: m.length, avg3: avg(m.map(function (e) { return e.post.g3; })), lows: m.filter(function (e) { return e.post.min < low; }).length, highs: m.filter(function (e) { return e.post.g3 > high; }).length };
      if (r.n < 5) { r.level = 'pocos'; r.text = 'Aún pocos datos (' + r.n + ' de 5 comidas).'; }
      else if (r.lows / r.n >= 0.2) { r.level = 'bajo'; r.text = 'En ' + r.lows + ' de ' + r.n + ' comidas bajaste de ' + low + ' en las 4 h siguientes. Puede que en esta franja te sobre insulina.'; }
      else if (r.avg3 > high) { r.level = 'alto'; r.text = 'A las 3 h sueles estar en ~' + Math.round(r.avg3) + ' mg/dL. Puede que en esta franja te quedes corto de insulina.'; }
      else if (r.avg3 < target - 25) { r.level = 'bajo'; r.text = 'A las 3 h sueles estar en ~' + Math.round(r.avg3) + ' mg/dL, por debajo de tu objetivo. Puede que en esta franja te sobre insulina.'; }
      else { r.level = 'bien'; r.text = 'A las 3 h sueles estar en ~' + Math.round(r.avg3) + ' mg/dL. Va bien.'; }
      slots[k] = r;
    });
    // Subida media (glucosa a las 3 h − glucosa al comer) en las comidas donde aparece cada alimento
    var by = {};
    meals.forEach(function (e) {
      if (e.glucose == null) return;
      var names = String(e.items || '').split(', ').filter(Boolean);
      names.forEach(function (nm) { (by[nm] = by[nm] || []).push(e.post.g3 - e.glucose); });
    });
    var foods = Object.keys(by).filter(function (k) { return by[k].length >= 3; })
      .map(function (k) { return { name: k, n: by[k].length, rise: Math.round(avg(by[k])) }; })
      .sort(function (a, b) { return b.rise - a.rise; });
    return { n: meals.length, slots: slots, foods: foods };
  }

  function median(a) {
    if (!a.length) return null;
    var s = a.slice().sort(function (x, y) { return x - y; }), m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }
  function numv(v) { var n = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isFinite(n) ? n : null; }
  /* Ratio en unidades por ración (10 g) a partir de la configuración ('r' = U/ración, 'g' = g por unidad). */
  function toUpr(mode, v) { var n = numv(v); if (!(n > 0)) return null; return mode === 'r' ? n : 10 / n; }
  function fromUpr(mode, u) { return mode === 'r' ? Math.round(u * 20) / 20 : Math.round(10 / u * 2) / 2; }

  /* Asesor de ratios. Para cada comida válida estima la insulina que habría dejado la glucosa donde empezó:
       necesaria ≈ puesta + activa al comer + (glucosa a las 3 h − glucosa al comer) / FSI − lo que aún queda por actuar a las 3 h
     y la divide por las raciones. Con 5 o más comidas compara la mediana con el ratio actual y propone ±10 %.
     Si hubo 2 o más bajadas de 70 desde el último cambio, propone bajar. Nunca aplica nada.
     o: {now, days, mode, ratios, isf, dia, low, changes:[{t, slot}]} */
  function ratios(log, o) {
    var now = o.now || Date.now(), since = now - (o.days || 30) * 24 * H, isf = numv(o.isf), dia = numv(o.dia) || 4, low = o.low || 70;
    var frem = Math.max(0, 1 - 3 / dia), out = {};
    ['desayuno', 'comida', 'merienda', 'cena'].forEach(function (k) {
      var cur = toUpr(o.mode, o.ratios && o.ratios[k]);
      var changedAt = (o.changes || []).filter(function (c) { return c.slot === k; }).reduce(function (m, c) { return Math.max(m, c.t); }, 0);
      var from = Math.max(since, changedAt);
      var all = (log || []).filter(function (e) { return isRapid(e) && e.slot === k && e.carbs > 0 && e.post && !e.post.none && e.t >= from; });
      var clean = all.filter(function (e) { return !log.some(function (x) { return x !== e && isRapid(x) && x.u > 0 && x.t > e.t && x.t < e.t + 3 * H; }); });
      var lows = all.filter(function (e) { return e.post.min < low; }).length;
      var est = [];
      if (isf > 0) clean.forEach(function (e) {
        if (!(e.carbs >= 20) || e.glucose == null || !(e.u > 0)) return;
        // Glucosa al final: a las 4 h si la hay (casi sin insulina por actuar); si no, a las 3 h descontando lo que queda
        var at4 = e.post.g4 != null, gEnd = at4 ? e.post.g4 : e.post.g3 != null ? e.post.g3 : e.post.g2; if (gEnd == null) return;
        var rem = at4 ? Math.max(0, 1 - 4 / dia) : frem;
        var needed = e.u + (e.iob || 0) + (gEnd - e.glucose) / isf - e.u * rem;
        var r = needed / (e.carbs / 10);
        if (r > 0.1 && r < 5) est.push(r);
      });
      var good = clean.filter(function (e) { return e.carbs >= 20 && e.u > 0 && e.glucose >= 80 && e.glucose <= 120 && (e.post.g1 == null || e.post.g1 < 180) && e.post.g2 != null && e.post.g2 < 140; })
        .map(function (e) { return e.u / (e.carbs / 10); });
      var r = { cur: cur, n: est.length, lows: lows, med: median(est), good: good.length, goodMed: median(good), changedAt: changedAt || null };
      if (!cur) r.action = 'sin';
      else if (lows >= 2) r.action = 'menos-hipo';
      else if (changedAt && now - changedAt < 5 * 24 * H) r.action = 'esperar';
      else if (r.n < 5) r.action = 'datos';
      // Si la mayoría de las comidas ya salen como pide el documento, no se toca
      else if (r.good >= 3 && r.good / clean.length >= 0.6) { r.action = 'ok'; r.okBy = 'pdf'; r.clean = clean.length; }
      else { var d = r.med / cur - 1; r.action = d > 0.1 ? 'mas' : d < -0.1 ? 'menos' : 'ok'; }
      if (r.action === 'mas' || r.action === 'menos' || r.action === 'menos-hipo') {
        r.newUpr = cur * (r.action === 'mas' ? 1.1 : 0.9);
        r.newVal = fromUpr(o.mode, r.newUpr);
      }
      out[k] = r;
    });
    return out;
  }

  /* Insulina total diaria (rápida + lenta) de media en los últimos 7 días con lenta y rápida apuntadas. */
  function tdd(log, now) {
    var days = [];
    for (var d = 1; d <= 7; d++) {
      var a = now - d * 24 * H, b = a + 24 * H;
      var es = (log || []).filter(function (e) { return e.t >= a && e.t < b && e.u > 0; });
      if (es.some(function (e) { return e.ins === 'basal'; }) && es.some(isRapid)) days.push(es.reduce(function (s, e) { return s + e.u; }, 0));
    }
    return days.length >= 3 ? { tdd: avg(days), days: days.length } : null;
  }

  var api = { outcome: outcome, update: update, summary: summary, ratios: ratios, tdd: tdd, toUpr: toUpr, fromUpr: fromUpr };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  return api;
})();
