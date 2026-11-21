/* Cálculo puro (sin interfaz). Se prueba con: npm test */
(function (root) {
  'use strict';
  var RACION = 10; // 1 ración = 10 g de hidratos de carbono

  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = parseFloat(String(v).replace(',', '.'));
    return isFinite(n) ? n : null;
  }

  function roundStep(n, step) {
    step = step > 0 ? step : 1;
    return Math.round(n / step + 1e-9) * step;
  }

  function carbsOf(item) {
    if (item.hcDirect !== undefined && item.hcDirect !== null) return Math.max(0, num(item.hcDirect) || 0);
    var g = num(item.grams) || 0, hc = num(item.hc100) || 0;
    if (item.unit === 'ud') return Math.max(0, g * hc); // hc100 = hidratos por unidad
    return Math.max(0, g * hc / 100); // por 100 g o por 100 ml
  }

  function mealCarbs(items) {
    return (items || []).reduce(function (s, i) { return s + carbsOf(i); }, 0);
  }

  /* Devuelve gramos de HC que cubre 1 unidad.
     modo 'r': el valor son unidades por ración (10 g). modo 'g': gramos por unidad. */
  function gramsPerUnit(mode, value) {
    var v = num(value);
    if (!(v > 0)) return null;
    return mode === 'r' ? RACION / v : v;
  }

  /* Insulina activa con descenso lineal durante durH horas. boluses: [{t (ms), u}] */
  function iob(boluses, now, durH) {
    var d = (num(durH) || 0) * 3600e3;
    if (!(d > 0)) return 0;
    return (boluses || []).reduce(function (s, b) {
      var e = now - b.t, u = num(b.u) || 0;
      if (e < 0 || e >= d || u <= 0) return s;
      return s + u * (1 - e / d);
    }, 0);
  }

  function slotFor(date) {
    var h = date.getHours() + date.getMinutes() / 60;
    if (h >= 6 && h < 11.5) return 'desayuno';
    if (h >= 11.5 && h < 16.5) return 'comida';
    if (h >= 16.5 && h < 20) return 'merienda';
    return 'cena';
  }

  /* p: {carbs, glucose|null, gPerU, isf, target, iob, iobMode:'total'|'corr', step, maxBolus|null, hypo} */
  function bolus(p) {
    var glucose = num(p.glucose);
    var hypo = num(p.hypo) || 70;
    // La hipoglucemia se comprueba antes que nada: con glucosa baja nunca se sugiere dosis.
    if (glucose !== null && glucose < hypo) return { ok: false, reason: 'hypo', glucose: glucose, hypo: hypo };
    var gPerU = num(p.gPerU), isf = num(p.isf), target = num(p.target);
    if (!(gPerU > 0) || !(isf > 0) || !(target > 0)) return { ok: false, reason: 'config' };

    var carbs = Math.max(0, num(p.carbs) || 0);
    var food = carbs / gPerU;
    var corr = glucose === null ? 0 : (glucose - target) / isf;
    var active = Math.max(0, num(p.iob) || 0);
    var iobUsed = p.iobMode === 'corr' ? Math.min(active, Math.max(corr, 0)) : active;
    var raw = food + corr - iobUsed;
    var total = Math.max(0, roundStep(raw, num(p.step) || 1));
    var max = num(p.maxBolus), capped = false;
    if (max > 0 && total > max) { total = max; capped = true; }
    return { ok: true, carbs: carbs, food: food, corr: corr, iob: active, iobUsed: iobUsed, raw: raw, total: total, capped: capped, hasGlucose: glucose !== null };
  }

  var api = { RACION: RACION, num: num, roundStep: roundStep, carbsOf: carbsOf, mealCarbs: mealCarbs, gramsPerUnit: gramsPerUnit, iob: iob, slotFor: slotFor, bolus: bolus };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Calc = api;
})(typeof self !== 'undefined' ? self : this);
