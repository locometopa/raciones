/* Gráfica de glucosa en SVG (sin librerías). Función pura: devuelve el SVG como texto. */
var Chart = (function () {
  'use strict';
  function n1(v) { return (Math.round(v * 10) / 10).toString().replace('.', ','); }

  /* o: {points:[{t,v}], dots:[{t,v}], marks:[{t,u}], now, hours, low, high, hypo, alto, cls} */
  function svg(o) {
    o = o || {};
    var W = 340, H = 230, L = 34, R = 12, T = 10, B = 24, pw = W - L - R, ph = H - T - B;
    var hours = o.hours || 12, now = o.now || Date.now(), span = hours * 3600e3, t0 = now - span;
    function inWin(p) { return p && p.t >= t0 && p.t <= now + 5 * 60000 && p.v > 0; }
    var pts = (o.points || []).filter(inWin).sort(function (a, b) { return a.t - b.t; });
    var dots = (o.dots || []).filter(inWin).sort(function (a, b) { return a.t - b.t; });
    var vals = pts.concat(dots).map(function (p) { return p.v; });
    var mx = vals.length ? Math.max.apply(null, vals) : 0;
    var ymin = 40, ymax = Math.min(500, Math.max(300, Math.ceil((mx + 10) / 50) * 50));
    function x(t) { return L + Math.max(0, Math.min(1, (t - t0) / span)) * pw; }
    function y(v) { v = Math.max(ymin, Math.min(ymax, v)); return T + (ymax - v) / (ymax - ymin) * ph; }
    function f(v) { return v.toFixed(1); }

    var s = ['<svg viewBox="0 0 ' + W + ' ' + H + '" class="gchart" role="img" aria-label="Glucosa de las últimas ' + hours + ' horas">'];
    var lo = +o.low, hi = +o.high;
    if (lo > 0 && hi > lo) s.push('<rect class="band" x="' + L + '" y="' + f(y(hi)) + '" width="' + pw + '" height="' + f(y(lo) - y(hi)) + '"/>');
    for (var g = 50; g <= ymax; g += 50) {
      s.push('<line class="grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + f(y(g)) + '" y2="' + f(y(g)) + '"/>');
      s.push('<text class="yl" x="' + (L - 6) + '" y="' + f(y(g) + 4) + '" text-anchor="end">' + g + '</text>');
    }
    if (+o.alto > ymin && +o.alto < ymax) s.push('<line class="alto" x1="' + L + '" x2="' + (W - R) + '" y1="' + f(y(+o.alto)) + '" y2="' + f(y(+o.alto)) + '"/>');
    if (+o.hypo > ymin) s.push('<line class="hypo" x1="' + L + '" x2="' + (W - R) + '" y1="' + f(y(+o.hypo)) + '" y2="' + f(y(+o.hypo)) + '"/>');

    var d = new Date(t0); d.setMinutes(0, 0, 0);
    for (var tt = d.getTime() + 3600e3; tt <= now; tt += 3600e3) {
      var hh = new Date(tt).getHours(), xx = f(x(tt));
      if (hh % 3 === 0) {
        s.push('<line class="tick" x1="' + xx + '" x2="' + xx + '" y1="' + (T + ph + 3) + '" y2="' + (T + ph + 8) + '"/>');
        s.push('<text class="xl" x="' + xx + '" y="' + (H - 3) + '" text-anchor="middle">' + (hh < 10 ? '0' : '') + hh + ':00</text>');
      } else s.push('<circle class="tickd" cx="' + xx + '" cy="' + (T + ph + 6) + '" r="1.3"/>');
    }

    var segs = [], seg = [];
    pts.forEach(function (p, i) {
      if (i && p.t - pts[i - 1].t > 20 * 60000) { segs.push(seg); seg = []; }
      seg.push(f(x(p.t)) + ',' + f(y(p.v)));
    });
    if (seg.length) segs.push(seg);
    segs.forEach(function (sg) {
      if (sg.length > 1) s.push('<polyline class="gline" points="' + sg.join(' ') + '"/>');
      else { var c = sg[0].split(','); s.push('<circle class="gpt" cx="' + c[0] + '" cy="' + c[1] + '" r="2.5"/>'); }
    });
    dots.forEach(function (p) { s.push('<circle class="mdot" cx="' + f(x(p.t)) + '" cy="' + f(y(p.v)) + '" r="4"/>'); });

    (o.marks || []).forEach(function (m) {
      if (!m || !(m.u > 0) || m.t < t0 || m.t > now + 60000) return;
      var mx2 = x(m.t), my = T + ph - 6, right = mx2 < L + pw - 34;
      s.push('<circle class="dose" cx="' + f(mx2) + '" cy="' + my + '" r="4.5"/><text class="dl" x="' + f(right ? mx2 + 7 : mx2 - 7) + '" y="' + (my + 3.5) + '" text-anchor="' + (right ? 'start' : 'end') + '">' + n1(m.u) + ' U</text>');
    });

    var all = pts.concat(dots).sort(function (a, b) { return a.t - b.t; });
    if (all.length) {
      var last = all[all.length - 1];
      s.push('<circle class="cur ' + (o.cls || 'in') + '" cx="' + f(x(last.t)) + '" cy="' + f(y(last.v)) + '" r="7"/>');
    } else {
      s.push('<text class="empty" x="' + (L + pw / 2) + '" y="' + (T + ph / 2) + '" text-anchor="middle">Sin lecturas en las últimas ' + hours + ' h</text>');
    }
    s.push('</svg>');
    return s.join('');
  }

  var api = { svg: svg };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  return api;
})();
