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
    return { g2: nearest(win, entry.t + 2 * H, 20 * 60000), g3: g3, max: Math.max.apply(null, vals), min: Math.min.apply(null, vals) };
  }

  /* Rellena e.post en las comidas que ya tienen 3 h y datos. Devuelve cuántas ha cambiado. */
  function update(log, graph, now) {
    var changed = 0;
    (log || []).forEach(function (e) {
      if (e.post || !isRapid(e) || !(e.carbs > 0)) return;
      if (now - e.t < 3.25 * H) return;
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

  var api = { outcome: outcome, update: update, summary: summary };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  return api;
})();
