/* Informe en PDF con gráficas: se dibuja cada página en un canvas A4 y se mete como imagen en el PDF. */
var ReportPDF = (function () {
  'use strict';
  var W = 1240, Hp = 1754, M = 70; // A4 a 150 ppp
  var C = { ink: '#1b1f27', mut: '#5d6675', line: '#d7dbe2', band: '#e9f6ee', vlow: '#a3121b', low: '#e5484d', inr: '#3fa34d', high: '#f0b429', vhigh: '#f5873b', acc: '#2f9f91', p95: '#c9e7e2', p75: '#7cc8bd', med: '#1d6f66' };
  var SLOTS = [['desayuno', 'Desayuno'], ['comida', 'Comida'], ['merienda', 'Merienda'], ['cena', 'Cena']];

  function f(n, d) { return n == null || isNaN(n) ? '—' : Number(n).toLocaleString('es-ES', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }
  function dstr(t, o) { return new Date(t).toLocaleDateString('es-ES', o || { day: 'numeric', month: 'short', year: 'numeric' }); }

  function page() {
    var cv = document.createElement('canvas'); cv.width = W; cv.height = Hp;
    var x = cv.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, W, Hp); x.textBaseline = 'alphabetic';
    return { cv: cv, x: x };
  }
  function font(x, size, weight) { x.font = (weight || 400) + ' ' + size + 'px "Inter", "Roboto", "Segoe UI", Arial, sans-serif'; }
  function text(x, s, px, py, size, col, weight, align) { font(x, size, weight); x.fillStyle = col || C.ink; x.textAlign = align || 'left'; x.fillText(s, px, py); }
  function wrap(x, s, px, py, maxW, size, col, lh) {
    font(x, size); x.fillStyle = col || C.ink; x.textAlign = 'left';
    var words = String(s).split(' '), line = '', y = py;
    words.forEach(function (w) { var t = line ? line + ' ' + w : w; if (x.measureText(t).width > maxW && line) { x.fillText(line, px, y); y += lh || size * 1.35; line = w; } else line = t; });
    if (line) { x.fillText(line, px, y); y += lh || size * 1.35; }
    return y;
  }
  function header(x, title, r, n, total) {
    x.fillStyle = C.acc; x.beginPath(); x.arc(M + 22, 72, 22, 0, 7); x.fill();
    x.fillStyle = '#fff'; x.beginPath(); x.moveTo(M + 22, 58); x.lineTo(M + 31, 76); x.arc(M + 22, 78, 9.5, 0.1, Math.PI - 0.1); x.closePath(); x.fill();
    text(x, title, M + 60, 84, 34, C.ink, 700);
    text(x, 'Del ' + dstr(r.from) + ' al ' + dstr(r.to) + ' · ' + r.days + ' días · mg/dL', W - M, 84, 20, C.mut, 400, 'right');
    x.strokeStyle = C.line; x.lineWidth = 2; x.beginPath(); x.moveTo(M, 110); x.lineTo(W - M, 110); x.stroke();
    text(x, 'Generado con iocrino el ' + dstr(Date.now()) + '. Datos del sensor FreeStyle Libre (LibreLinkUp) y de lo registrado en la app. Página ' + n + ' de ' + total + '.', M, Hp - 40, 16, C.mut);
  }
  function section(x, s, y) { text(x, s.toUpperCase(), M, y, 20, C.acc, 700); return y + 14; }

  /* Barra apilada de tiempo en rangos con sus objetivos. */
  function tirBlock(x, g, px, py) {
    var bh = 420, bw = 80, rows = [['vhigh', 'Muy alto', '> 250', g.vhigh, '< 5 %'], ['high', 'Alto', '181–250', g.high, ''], ['inr', 'En rango', '70–180', g.inr, '> 70 %'], ['low', 'Bajo', '54–69', g.low, '< 4 %'], ['vlow', 'Muy bajo', '< 54', g.vlow, '< 1 %']];
    var y = py;
    rows.forEach(function (r) { var h = Math.max(r[3] > 0 ? 3 : 0, bh * r[3] / 100); x.fillStyle = C[r[0]]; x.fillRect(px, y, bw, h); y += h; });
    var ly = py + 20;
    rows.forEach(function (r) {
      text(x, r[1] + ' ' + r[2], px + bw + 24, ly, 20, C.ink, 600);
      text(x, f(r[3], r[3] < 10 ? 1 : 0) + ' %', px + bw + 300, ly, 24, C[r[0]] === C.high ? '#b07d00' : C[r[0]], 800, 'right');
      if (r[4]) text(x, 'objetivo ' + r[4], px + bw + 24, ly + 24, 16, C.mut);
      ly += 84;
    });
  }
  function metric(x, label, val, note, px, py) {
    text(x, label, px, py, 18, C.mut);
    text(x, val, px, py + 40, 34, C.ink, 800);
    if (note) text(x, note, px, py + 66, 15, C.mut);
  }

  /* AGP: bandas 5–95 y 25–75, mediana, y rango objetivo. */
  function agpChart(x, a, px, py, w, h, lo, hi) {
    var vmin = 40, vmax = 350;
    var Y = function (v) { return py + h - (Math.max(vmin, Math.min(vmax, v)) - vmin) / (vmax - vmin) * h; };
    var X = function (m) { return px + m / 1440 * w; };
    x.fillStyle = '#f7f9fb'; x.fillRect(px, py, w, h);
    x.fillStyle = C.band; x.fillRect(px, Y(hi), w, Y(lo) - Y(hi));
    x.strokeStyle = C.line; x.lineWidth = 1;
    [54, 70, 180, 250].forEach(function (v) { x.beginPath(); x.moveTo(px, Y(v)); x.lineTo(px + w, Y(v)); x.stroke(); text(x, String(v), px - 10, Y(v) + 6, 15, C.mut, 400, 'right'); });
    for (var hh = 0; hh <= 24; hh += 3) { x.beginPath(); x.moveTo(X(hh * 60), py); x.lineTo(X(hh * 60), py + h); x.stroke(); text(x, (hh < 10 ? '0' : '') + hh + ':00', X(hh * 60), py + h + 24, 15, C.mut, 400, 'center'); }
    var pts = a.filter(function (b) { return b.n >= 3; }).map(function (b) { b.x = X(b.m + 15); return b; });
    if (pts.length < 4) { text(x, 'No hay suficientes datos para el perfil', px + w / 2, py + h / 2, 22, C.mut, 400, 'center'); return; }
    function band(k1, k2, col) { x.fillStyle = col; x.beginPath(); pts.forEach(function (b, i) { if (i) x.lineTo(b.x, Y(b[k2])); else x.moveTo(b.x, Y(b[k2])); }); pts.slice().reverse().forEach(function (b) { x.lineTo(b.x, Y(b[k1])); }); x.closePath(); x.fill(); }
    band('p5', 'p95', C.p95); band('p25', 'p75', C.p75);
    x.strokeStyle = C.med; x.lineWidth = 4; x.lineJoin = 'round'; x.beginPath(); pts.forEach(function (b, i) { if (i) x.lineTo(b.x, Y(b.p50)); else x.moveTo(b.x, Y(b.p50)); }); x.stroke();
    x.strokeStyle = '#9aa3b0'; x.lineWidth = 1.5; x.setLineDash([6, 6]);
    ['p5', 'p95'].forEach(function (k) { x.beginPath(); pts.forEach(function (b, i) { if (i) x.lineTo(b.x, Y(b[k])); else x.moveTo(b.x, Y(b[k])); }); x.stroke(); });
    x.setLineDash([]);
  }
  function dayChart(x, d, px, py, w, h, lo, hi) {
    var vmin = 40, vmax = 350, Y = function (v) { return py + h - (Math.max(vmin, Math.min(vmax, v)) - vmin) / (vmax - vmin) * h; };
    x.fillStyle = '#f7f9fb'; x.fillRect(px, py, w, h); x.fillStyle = C.band; x.fillRect(px, Y(hi), w, Y(lo) - Y(hi));
    text(x, dstr(d.day, { weekday: 'short', day: 'numeric', month: 'short' }), px + 6, py + 20, 15, C.mut, 600);
    if (!d.pts.length) return;
    x.strokeStyle = C.ink; x.lineWidth = 2; x.beginPath();
    var prev = null;
    d.pts.forEach(function (p) { var px2 = px + (p[0] - d.day) / 864e5 * w, py2 = Y(p[1]); if (prev && p[0] - prev < 40 * 60000) x.lineTo(px2, py2); else x.moveTo(px2, py2); prev = p[0]; });
    x.stroke();
    d.pts.forEach(function (p) { if (p[1] < 70) { x.fillStyle = C.low; x.beginPath(); x.arc(px + (p[0] - d.day) / 864e5 * w, Y(p[1]), 3.5, 0, 7); x.fill(); } });
  }
  function table(x, cols, rows, px, py, widths) {
    var y = py;
    font(x, 17, 700); x.fillStyle = C.mut;
    var cx = px; cols.forEach(function (c, i) { text(x, c, cx + (i ? widths[i] - 8 : 0), y, 17, C.mut, 700, i ? 'right' : 'left'); cx += widths[i]; });
    y += 12; x.strokeStyle = C.line; x.beginPath(); x.moveTo(px, y); x.lineTo(px + widths.reduce(function (s, v) { return s + v; }, 0), y); x.stroke(); y += 34;
    rows.forEach(function (r) { var cx2 = px; r.forEach(function (c, i) { text(x, c, cx2 + (i ? widths[i] - 8 : 0), y, 20, C.ink, i ? 400 : 600, i ? 'right' : 'left'); cx2 += widths[i]; }); y += 40; });
    return y;
  }

  /* o: {r (Report.build), agp, daily, cfg, rapid, basal, mood} → páginas JPEG */
  function render(o) {
    var r = o.r, g = r.glucose, cfg = o.cfg || {}, lo = 70, hi = 180, out = [];
    // ----- Página 1 -----
    var p1 = page(), x = p1.x;
    header(x, 'Informe de glucosa', r, 1, 2);
    var y = section(x, 'Tiempo en rangos', 170);
    if (g.n) {
      tirBlock(x, g, M, y + 10);
      var mx = 760;
      metric(x, 'Glucosa media', f(g.mean) + ' mg/dL', '', mx, y + 30);
      metric(x, 'HbA1c estimada (GMI)', f(g.gmi, 1) + ' %', '', mx, y + 140);
      metric(x, 'Variabilidad (CV)', f(g.cv) + ' %', 'objetivo ≤ 36 %', mx, y + 250);
      metric(x, 'Datos del sensor · bajadas', g.coverage + ' % · ' + g.lowEpisodes, 'episodios por debajo de 70', mx, y + 360);
    } else text(x, 'No hay lecturas del sensor en este periodo.', M, y + 40, 22, C.mut);
    y = section(x, 'Perfil de glucosa ambulatorio (AGP)', 690);
    text(x, 'Mediana (línea), 25–75 % (banda oscura) y 5–95 % (banda clara) de cada media hora del día. Franja verde: 70–180.', M, y + 22, 16, C.mut);
    agpChart(x, o.agp, M + 40, y + 50, W - 2 * M - 40, 420, lo, hi);
    y = section(x, 'Cada día', 1250);
    var days = o.daily.slice(-14), cw = (W - 2 * M - 6 * 14) / 7, ch = 170;
    days.forEach(function (d, i) { dayChart(x, d, M + (i % 7) * (cw + 14), y + 16 + Math.floor(i / 7) * (ch + 22), cw, ch, lo, hi); });
    out.push(p1);
    // ----- Página 2 -----
    var p2 = page(); x = p2.x;
    header(x, 'Comidas e insulina', r, 2, 2);
    y = section(x, 'Comidas por franja (medias)', 170);
    var unit = cfg.ratioMode === 'r' ? 'U/ración' : 'g/U';
    y = table(x, ['Franja', 'Comidas', 'Hidratos', 'Dosis', 'Antes', 'A las 2 h', 'Ratio (' + unit + ')'],
      SLOTS.map(function (s) { var m = r.meals[s[0]]; return [s[1], String(m.n), m.n ? f(m.carbs) + ' g' : '—', m.n ? f(m.u, 1) + ' U' : '—', f(m.pre), f(m.post2), m.ratio ? String(m.ratio).replace('.', ',') : '—']; }),
      M, y + 30, [220, 130, 150, 130, 130, 150, 190]);
    y = section(x, 'Insulina', y + 40);
    var ins = r.insulin;
    y = table(x, ['', 'Media al día'], [
      ['Rápida (' + (o.rapid || 'rápida') + ')', ins.rapid != null ? f(ins.rapid, 1) + ' U' : '—'],
      ['Lenta (' + (o.basal || 'lenta') + ')', ins.basal != null ? f(ins.basal, 1) + ' U' : '—'],
      ['Total diaria', ins.tdd != null ? f(ins.tdd, 1) + ' U' : '—'],
      ['Correcciones sueltas en el periodo', String(ins.corrections)]
    ], M, y + 30, [700, 400]);
    y = section(x, 'Pautas configuradas en la app', y + 40);
    y = table(x, ['', ''], [
      ['Factor de sensibilidad', cfg.isf ? cfg.isf + ' mg/dL por unidad' : '—'],
      ['Glucosa objetivo', cfg.target ? cfg.target + ' mg/dL' : '—'],
      ['Duración de la insulina', cfg.dia ? cfg.dia + ' h' : '—'],
      ['Cambios de ratio en el periodo', r.changes.length ? r.changes.map(function (c) { return dstr(c.t, { day: 'numeric', month: 'short' }); }).join(', ') : 'ninguno']
    ], M, y + 30, [700, 400]);
    y = section(x, 'Bajadas apuntadas (' + r.hipos.length + ')', y + 40);
    if (r.hipos.length) {
      y = table(x, ['Fecha', 'Glucosa', 'Tratamiento'], r.hipos.slice(-10).reverse().map(function (h) {
        return [dstr(h.t, { weekday: 'short', day: 'numeric', month: 'short' }) + ' ' + new Date(h.t).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }), h.glucose ? h.glucose + ' mg/dL' : '—', h.treat ? h.treat + ' g de hidratos' + (h.what ? ' (' + h.what + ')' : '') : (h.what || '—')];
      }), M, y + 30, [460, 220, 420]);
    } else y = wrap(x, 'Ninguna en este periodo.', M, y + 40, W - 2 * M, 20, C.mut);
    if (o.mood && o.mood.n >= 5) {
      y = section(x, 'Ánimo (1 a 5) según la glucosa', y + 30);
      y = table(x, ['', 'Notas', 'Ánimo medio'], [['Bajo', String(o.mood.bajo.n), f(o.mood.bajo.avg, 1)], ['En rango', String(o.mood.rango.n), f(o.mood.rango.avg, 1)], ['Alto', String(o.mood.alto.n), f(o.mood.alto.avg, 1)]], M, y + 30, [500, 260, 340]);
    }
    wrap(x, 'Cálculos orientativos hechos con las pautas que la persona ha puesto en la app. No sustituyen el criterio del equipo de diabetes.', M, Hp - 90, W - 2 * M, 16, C.mut);
    out.push(p2);
    return out.map(function (p) { return { b64: p.cv.toDataURL('image/jpeg', 0.88).split(',')[1], w: W, h: Hp }; });
  }

  var api = { render: render };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  return api;
})();
