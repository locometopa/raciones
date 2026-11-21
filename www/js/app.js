(function () {
  'use strict';
  var VERSION = '0.4.1';
  var KEY = 'raciones.v1';
  var SLOTS = [['desayuno', 'Desayuno'], ['comida', 'Comida'], ['merienda', 'Merienda'], ['cena', 'Cena']];
  var TREND = { 0: ['', 'Sin flecha'], 1: ['↓', 'Bajando rápido'], 2: ['↘', 'Bajando'], 3: ['→', 'Estable'], 4: ['↗', 'Subiendo'], 5: ['↑', 'Subiendo rápido'] };
  var STALE_MS = 15 * 60000;
  var ICON = {
    barcode: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 5v14M7.5 5v14M10.5 5v14M14 5v14M17 5v14M20 5v14"/></svg>',
    pencil: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
    camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>'
  };
  var native = !!(window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform());
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var view = $('#view'), dlg = $('#dlg'), sumBar = $('#sum');
  var num = Calc.num;
  var tab = 'ahora';
  var pending = null, bcProduct = null, estimate = null, stream = null, scanTimer = null;
  var lastLibreTry = 0, libreBusy = false, libreErr = '', libreStep = null, dlgTrend = 0;

  // ---------- estado ----------
  function defaults() {
    return {
      cfg: { ratioMode: 'r', ratios: { desayuno: '', comida: '', merienda: '', cena: '' }, isf: '', target: '', dia: '', iobMode: 'total', step: '1', maxBolus: '', hypo: '70', rangeLow: '70', rangeHigh: '180', alto: '250' },
      libre: { email: '', password: '', version: Libre.DEFAULT_VERSION, session: null, graph: [] },
      ai: { on: '0', provider: 'claude', keys: {}, models: {}, url: '' },
      now: { v: '', trend: 0, t: null, src: '' },
      custom: [], plates: [], log: [],
      meal: { items: [], slot: '' }
    };
  }
  function merge(d, j) {
    if (!j || typeof j !== 'object') return d;
    var ratios = Object.assign({}, d.cfg.ratios, j.cfg && j.cfg.ratios);
    ['cfg', 'libre', 'ai', 'now', 'meal'].forEach(function (k) { if (j[k] && typeof j[k] === 'object') Object.assign(d[k], j[k]); });
    d.cfg.ratios = ratios;
    ['custom', 'plates', 'log'].forEach(function (k) { if (Array.isArray(j[k])) d[k] = j[k]; });
    if (!Array.isArray(d.meal.items)) d.meal.items = [];
    ['keys', 'models'].forEach(function (k) { if (!d.ai[k] || typeof d.ai[k] !== 'object') d.ai[k] = {}; });
    if (!Vision.PROVIDERS[d.ai.provider]) d.ai.provider = 'claude';
    // 0.2–0.3 guardaban una sola clave, de Claude
    if (j.ai && j.ai.key && !d.ai.keys.claude) d.ai.keys.claude = j.ai.key;
    if (j.ai && j.ai.model && !d.ai.models.claude && j.ai.model !== 'claude-sonnet-5-5') d.ai.models.claude = j.ai.model;
    delete d.ai.key; delete d.ai.model;
    if (!Array.isArray(d.libre.graph)) d.libre.graph = [];
    // 0.2 guardaba la glucosa dentro de la comida
    if (j.meal && j.meal.glucose && !(j.now && j.now.v)) d.now = { v: String(j.meal.glucose), trend: +j.meal.trend || 0, t: j.meal.gt || null, src: j.meal.gsrc || 'manual' };
    ['glucose', 'trend', 'gt', 'gsrc'].forEach(function (k) { delete d.meal[k]; });
    return d;
  }
  function load() { try { return merge(defaults(), JSON.parse(localStorage.getItem(KEY) || 'null')); } catch (e) { return defaults(); } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* sin almacenamiento */ } }
  var S = load();

  // ---------- utilidades ----------
  function esc(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(n, d) { return (Math.round(n * Math.pow(10, d)) / Math.pow(10, d)).toString().replace('.', ','); }
  function fu(n) { return fmt(n, 2) + ' U'; }
  function norm(s) { return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function hm(t) { return new Date(t).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }); }
  function slotName(k) { for (var i = 0; i < SLOTS.length; i++) if (SLOTS[i][0] === k) return SLOTS[i][1]; return k; }
  function curSlot() { return S.meal.slot || Calc.slotFor(new Date()); }
  function toast(msg) { var t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(function () { t.classList.remove('on'); }, 2600); }
  function openDlg(html) { dlg.innerHTML = html; if (dlg.showModal) { if (!dlg.open) dlg.showModal(); } else dlg.setAttribute('open', ''); }
  function closeDlg() { stopScan(); if (dlg.close && dlg.open) dlg.close(); else dlg.removeAttribute('open'); dlg.innerHTML = ''; }
  function msgDlg(title, text) { openDlg('<h3>' + esc(title) + '</h3><p>' + esc(text) + '</p><div class="acts"><button class="pri" data-act="close">Vale</button></div>'); }
  function confirmDlg(text, fn) { pending = fn; openDlg('<h3>Confirmar</h3><p>' + esc(text) + '</p><div class="acts"><button data-act="close">Cancelar</button><button class="pri" data-act="yes">Sí</button></div>'); }
  function setPath(path, v) { var p = path.split('.'), o = S; for (var i = 0; i < p.length - 1; i++) o = o[p[i]]; o[p[p.length - 1]] = v; }
  function getPath(path) { return path.split('.').reduce(function (o, k) { return o == null ? o : o[k]; }, S); }
  function copyText(text, okMsg) {
    var fallback = function () { openDlg('<h3>Copiar</h3><p class="mut">Mantén pulsado sobre el texto para copiarlo.</p><textarea rows="8" readonly>' + esc(text) + '</textarea><div class="acts"><button class="pri" data-act="close">Cerrar</button></div>'); };
    try { navigator.clipboard.writeText(text).then(function () { toast(okMsg); }, fallback); } catch (e) { fallback(); }
  }
  function aiCfg() { var p = S.ai.provider; return { provider: p, key: S.ai.keys[p] || '', model: S.ai.models[p] || Vision.PROVIDERS[p].model, url: S.ai.url }; }
  function aiOn() { var c = aiCfg(); return S.ai.on === '1' && (Vision.PROVIDERS[c.provider].needsUrl ? !!c.url && !!c.model : !!c.key); }
  function libreOn() { return native && !!S.libre.email && !!S.libre.password; }

  // ---------- glucosa actual ----------
  function gNow() {
    var g = num(S.now.v);
    if (g === null) return { v: null, bad: false };
    if (g < 20 || g > 600) return { v: null, bad: true };
    return { v: g, bad: false };
  }
  function gClass(v) {
    if (v === null) return 'none';
    var lo = num(S.cfg.rangeLow) || 70, hi = num(S.cfg.rangeHigh) || 180, al = num(S.cfg.alto) || 250;
    if (v < lo) return 'low';
    if (v > al) return 'vhigh';
    if (v > hi) return 'high';
    return 'in';
  }
  function gView() {
    var g = gNow(), old = !!(S.now.t && Date.now() - S.now.t > STALE_MS);
    return { g: g, old: old, cls: g.v === null ? 'none' : (old ? 'old' : gClass(g.v)), arrow: g.v !== null && TREND[S.now.trend] ? TREND[S.now.trend][0] : '' };
  }
  function ageText() {
    if (!S.now.t) return '';
    var a = Math.max(0, Math.round((Date.now() - S.now.t) / 60000));
    return (S.now.src === 'libre' ? 'Libre' : 'A mano') + ' · ' + (a < 1 ? 'ahora mismo' : a < 120 ? 'hace ' + a + ' min' : 'a las ' + hm(S.now.t));
  }

  // ---------- cálculo ----------
  function activeInsulin() { return Calc.iob(S.log, Date.now(), S.cfg.dia); }
  function compute() {
    var slot = curSlot(), g = gNow();
    var carbs = Calc.mealCarbs(S.meal.items);
    var gpu = Calc.gramsPerUnit(S.cfg.ratioMode, S.cfg.ratios[slot]);
    var r = Calc.bolus({ carbs: carbs, glucose: g.v, gPerU: gpu, isf: S.cfg.isf, target: S.cfg.target, iob: activeInsulin(), iobMode: S.cfg.iobMode, step: S.cfg.step, maxBolus: S.cfg.maxBolus, hypo: S.cfg.hypo });
    return { slot: slot, carbs: carbs, gpu: gpu, g: g, r: r };
  }

  // ---------- vista: ahora ----------
  function vNow() {
    var x = gView(), h = '';
    h += '<button class="gcard gc ' + x.cls + '" data-act="' + (libreOn() ? 'libre' : 'editg') + '">' +
      '<span class="gl">Glucosa</span><span class="gv"><span class="num">' + (x.g.v !== null ? fmt(x.g.v, 0) : '—') + '</span>' +
      (x.arrow ? '<span class="arr">' + x.arrow + '</span>' : '') + '<span class="un">mg/dL</span></span>' +
      '<span class="gage" id="gage">' + (x.g.v !== null ? esc(ageText()) + (x.old ? ' · lectura antigua' : '') : (libreOn() ? 'Toca para leer el Libre' : 'Toca para escribirla')) + '</span></button>';
    h += '<div class="subrow"><span class="mut">' + (x.g.v !== null && TREND[S.now.trend] && S.now.trend ? esc(TREND[S.now.trend][1]) : '') + '</span>' +
      (libreOn() ? '<button class="ghost" data-act="editg">Escribir a mano</button>' : native ? '<button class="ghost" data-act="goto" data-v="ajustes">Conectar el Libre</button>' : '<button class="ghost" data-act="editg">Escribir glucosa</button>') + '</div>';
    if (libreErr) h += '<p class="lerr">Libre: ' + esc(libreErr) + (libreStep ? ' <button class="ghost" data-act="librestep">Resolver</button>' : '') + '</p>';

    var now = Date.now(), dots = [];
    S.log.forEach(function (e) { if (e.glucose != null) dots.push({ t: e.t, v: e.glucose }); });
    if (S.now.src === 'manual' && x.g.v !== null && S.now.t) dots.push({ t: S.now.t, v: x.g.v });
    h += '<section class="card chartc">' + Chart.svg({
      now: now, hours: 12, points: S.libre.graph, dots: S.libre.graph.length ? [] : dots,
      marks: S.log.map(function (e) { return { t: e.t, u: e.u }; }),
      low: num(S.cfg.rangeLow) || 70, high: num(S.cfg.rangeHigh) || 180, hypo: num(S.cfg.hypo) || 70, alto: num(S.cfg.alto) || 250, cls: x.cls
    }) + '</section>';

    var last = S.log.filter(function (e) { return e.u > 0; }).sort(function (a, b) { return b.t - a.t; })[0];
    h += '<section class="card"><div class="kv"><span>Insulina activa</span><b>' + (num(S.cfg.dia) > 0 ? fu(activeInsulin()) : '—') + '</b></div>' +
      (last ? '<div class="kv"><span>Última dosis</span><b>' + fu(last.u) + ' · ' + hm(last.t) + '</b></div>' : '') +
      (num(S.cfg.dia) > 0 ? '' : '<p class="fine">Pon la duración de tu insulina en Ajustes para ver la insulina activa.</p>') + '</section>';
    h += '<button class="pri big" data-act="goto" data-v="comida">' + (S.meal.items.length ? 'Seguir con la comida (' + S.meal.items.length + ')' : 'Calcular comida') + '</button>';
    view.innerHTML = h;
  }

  // ---------- vista: comida ----------
  function stripHTML() {
    var x = gView();
    return '<button class="gstrip gc ' + x.cls + '" data-act="editg"><span><b>' + (x.g.v !== null ? fmt(x.g.v, 0) : '—') + '</b>' +
      (x.arrow ? ' <span class="sarr">' + x.arrow + '</span>' : '') + ' <small>mg/dL</small></span><span class="sage">' +
      (x.g.v !== null ? esc(ageText()) + (x.old ? ' · antigua' : '') : 'Sin glucosa · toca para escribirla') + '</span></button>';
  }
  function vMeal() {
    var m = S.meal, slot = curSlot(), h = stripHTML();
    h += '<div class="chips slots">' + SLOTS.map(function (s) { return '<button class="chip' + (s[0] === slot ? ' on' : '') + '" data-act="slot" data-v="' + s[0] + '">' + s[1] + '</button>'; }).join('') + '</div>';
    h += '<section class="card"><h2>Qué vas a comer</h2><input id="qi" data-f="qi" placeholder="Buscar alimento: arroz, pan, manzana…" autocomplete="off" enterkeyhint="search"><div id="qr" class="list"></div>' +
      '<div class="tools"><button data-act="barcode">' + ICON.barcode + 'Código</button><button data-act="manual">' + ICON.pencil + 'HC a mano</button>' +
      (aiOn() ? '<button data-act="photo">' + ICON.camera + 'Foto</button>' : '') + '</div>';
    if (S.plates.length) h += '<div class="lab">Mis platos</div><div class="chips">' + S.plates.map(function (p, i) { return '<button class="chip" data-act="useplate" data-i="' + i + '">' + esc(p.name) + ' · ' + fmt(Calc.mealCarbs(p.items), 0) + ' g</button>'; }).join('') + '</div>';
    h += '<div id="items" style="margin-top:12px">';
    m.items.forEach(function (it, i) {
      var direct = it.hcDirect !== undefined && it.hcDirect !== null;
      h += '<div class="item"><div class="nm"><b>' + esc(it.name) + '</b><small>' +
        (direct ? 'hidratos a mano' : fmt(num(it.hc100) || 0, 1) + ' g HC/100 g') + (it.est ? ' · <span style="color:var(--warn)">estimado por foto</span>' : '') + '</small></div>' +
        '<input class="n" inputmode="decimal" data-f="' + (direct ? 'hcDirect' : 'grams') + '" data-i="' + i + '" value="' + esc(direct ? it.hcDirect : it.grams) + '" placeholder="' + (direct ? 'g HC' : (it.portion ? 'p. ej. ' + it.portion : 'gramos')) + '" aria-label="' + (direct ? 'Gramos de hidratos' : 'Gramos de alimento') + '">' +
        '<span class="hc" id="hc' + i + '"></span><button class="x" data-act="del" data-i="' + i + '" aria-label="Quitar">✕</button></div>';
    });
    h += '</div></section><section class="card" id="res"></section>';
    view.innerHTML = h;
    renderRes();
  }

  function renderRes() {
    var c = compute();
    renderSum(c);
    var res = $('#res'); if (!res) return;
    var r = c.r, h = '';
    S.meal.items.forEach(function (it, i) { var el = $('#hc' + i); if (el) el.textContent = fmt(Calc.carbsOf(it), 1) + ' g'; });
    var st = $('.gstrip'); if (st) st.outerHTML = stripHTML();

    h += '<h2>Resultado · ' + esc(slotName(c.slot)) + '</h2>';
    h += '<div class="tot"><span>Hidratos</span><span><b>' + fmt(c.carbs, 1) + '</b> g · ' + fmt(c.carbs / Calc.RACION, 1) + ' raciones</span></div>';
    if (c.g.bad) h += '<div class="note warn">La glucosa guardada no parece un valor válido (20–600 mg/dL). No se usa en el cálculo.</div>';

    if (!r.ok && r.reason === 'hypo') {
      h += '<div class="note bad">Glucosa ' + fmt(r.glucose, 0) + ' mg/dL, por debajo de ' + fmt(r.hypo, 0) + '. Trata primero la bajada como te hayan indicado. No se sugiere dosis.</div>';
    } else if (!r.ok) {
      h += '<div class="note info">Para calcular la dosis faltan tus pautas: ratio de ' + esc(slotName(c.slot).toLowerCase()) + ', factor de sensibilidad y glucosa objetivo.</div><button data-act="goto" data-v="ajustes">Ir a Ajustes</button>';
    } else {
      h += '<table class="bk">' +
        '<tr><td>Comida<small>' + fmt(c.carbs, 1) + ' g ÷ ' + fmt(c.gpu, 1) + ' g por unidad</small></td><td>' + fu(r.food) + '</td></tr>' +
        '<tr><td>Corrección<small>' + (r.hasGlucose ? '(' + fmt(c.g.v, 0) + ' − ' + fmt(num(S.cfg.target), 0) + ') ÷ ' + fmt(num(S.cfg.isf), 0) : 'sin glucosa') + '</small></td><td>' + (r.hasGlucose ? (r.corr > 0 ? '+' : '') + fu(r.corr) : '—') + '</td></tr>' +
        '<tr><td>Insulina activa<small>' + (num(S.cfg.dia) > 0 ? 'quedan ' + fu(r.iob) + ' de dosis registradas' : 'duración de la insulina sin configurar') + '</small></td><td>' + (r.iobUsed > 0 ? '−' + fu(r.iobUsed) : '—') + '</td></tr></table>';
      h += '<div class="dose"><span class="mut">Sugerencia</span><b>' + fu(r.total) + '</b><span class="mut">sin redondear: ' + fmt(r.raw, 2) + '</span></div>';
      if (S.meal.items.some(function (x) { return x.est; })) h += '<div class="note warn">Hay cantidades estimadas por foto. Revísalas antes de fiarte del resultado.</div>';
      if (r.capped) h += '<div class="note warn">El cálculo supera tu dosis máxima configurada (' + fu(num(S.cfg.maxBolus)) + '); se ha limitado a ese tope.</div>';
      if (!r.hasGlucose && !c.g.bad) h += '<div class="note warn">Sin glucosa: solo se ha calculado la parte de la comida.</div>';
      var tr = +S.now.trend;
      if (r.hasGlucose && (tr === 1 || tr === 2)) h += '<div class="note warn">La flecha indica que la glucosa está ' + TREND[tr][1].toLowerCase() + '. El cálculo no lo tiene en cuenta: valora poner menos según tus pautas.</div>';
      if (r.hasGlucose && (tr === 4 || tr === 5)) h += '<div class="note warn">La flecha indica que la glucosa está ' + TREND[tr][1].toLowerCase() + '. El cálculo no lo tiene en cuenta.</div>';
      if (r.hasGlucose && S.now.t && Date.now() - S.now.t > STALE_MS) h += '<div class="note warn">La glucosa es de hace ' + Math.round((Date.now() - S.now.t) / 60000) + ' min. Vuelve a medirla antes de decidir.</div>';
    }
    h += '<div class="row" style="margin-top:10px"><button class="pri" data-act="log">Registrar</button><button data-act="saveplate"' + (S.meal.items.length ? '' : ' disabled') + '>Guardar como plato</button><button class="ghost" data-act="clear">Vaciar</button></div>';
    h += '<details class="how"><summary>¿Cómo se calcula?</summary><ol>' +
      '<li><b>Hidratos</b>: gramos de cada alimento × sus hidratos por 100 g ÷ 100. Una ración son 10 g de hidratos.</li>' +
      '<li><b>Comida</b>: ' + (S.cfg.ratioMode === 'r' ? 'raciones × tu ratio de la franja (unidades por ración)' : 'hidratos ÷ los gramos que cubre 1 unidad en esa franja') + '.</li>' +
      '<li><b>Corrección</b>: (glucosa − objetivo) ÷ factor de sensibilidad. Si estás por debajo del objetivo sale negativa y resta.</li>' +
      '<li><b>Insulina activa</b>: lo que queda de las dosis registradas aquí, bajando en línea recta durante la duración de tu insulina. Se resta ' + (S.cfg.iobMode === 'corr' ? 'solo de la corrección' : 'de toda la dosis') + '.</li>' +
      '<li><b>Ajustes finales</b>: se redondea a lo que dosifica tu pluma, nunca sale negativa, no pasa de tu tope y no se sugiere nada por debajo de ' + fmt(num(S.cfg.hypo) || 70, 0) + ' mg/dL.</li></ol>' +
      '<p>No tiene en cuenta la flecha, la grasa o proteína de la comida, el ejercicio ni la insulina que no hayas registrado aquí.</p></details>';
    h += '<p class="fine">Cálculo orientativo hecho con las pautas que tú has puesto. La decisión de la dosis es tuya y de tu equipo de diabetes.</p>';
    res.innerHTML = h;
  }

  function renderSum(c) {
    if (!sumBar) return;
    var show = tab === 'comida' && S.meal.items.length > 0;
    sumBar.hidden = !show;
    document.body.classList.toggle('hassum', show);
    if (!show) return;
    c = c || compute();
    sumBar.innerHTML = '<span><b>' + fmt(c.carbs, 1) + ' g</b> · ' + fmt(c.carbs / Calc.RACION, 1) + ' rac.</span><span class="sd">' +
      (c.r.ok ? fu(c.r.total) : c.r.reason === 'hypo' ? 'Glucosa baja' : 'Faltan pautas') + '</span>';
  }

  // ---------- búsqueda y alimentos ----------
  function renderSearch(q) {
    var box = $('#qr'); if (!box) return;
    var n = norm(q.trim());
    if (!n) { box.innerHTML = ''; return; }
    var out = [], byCat = [];
    S.custom.forEach(function (f, i) { if (norm(f.name).indexOf(n) >= 0) out.push('<button data-act="pick" data-src="c" data-k="' + i + '"><span>' + esc(f.name) + ' <small class="mut">· propio</small></span><span>' + fmt(num(f.hc100) || 0, 1) + ' g/100 g</span></button>'); });
    FOODS.forEach(function (f, i) {
      var row = '<button data-act="pick" data-src="b" data-k="' + i + '"><span>' + esc(f[0]) + '</span><span>' + fmt(f[1], 1) + ' g/100 g</span></button>';
      if (norm(f[0]).indexOf(n) >= 0) out.push(row); else if (norm(f[2]).indexOf(n) >= 0) byCat.push(row);
    });
    out = out.concat(byCat).slice(0, 8);
    out.push('<button data-act="newfood"><span>+ Crear «' + esc(q.trim()) + '» como alimento propio</span><span></span></button>');
    box.innerHTML = out.join('');
  }
  function addItem(it) {
    S.meal.items.push(it); save(); closeDlg(); tab = 'comida'; render();
    var ins = view.querySelectorAll('#items input.n');
    if (ins.length) { var el = ins[ins.length - 1]; el.focus(); if (el.scrollIntoView) el.scrollIntoView({ block: 'center' }); }
  }
  function dlgNewFood(name, hc, code) {
    openDlg('<h3>Alimento propio</h3><label>Nombre</label><input id="nfn" value="' + esc(name || '') + '"><label>Gramos de hidratos por 100 g (de la etiqueta)</label><input id="nfh" inputmode="decimal" value="' + esc(hc || '') + '">' +
      '<input type="hidden" id="nfc" value="' + esc(code || '') + '"><div class="acts"><button data-act="close">Cancelar</button><button class="pri" data-act="nfsave">Guardar y añadir</button></div>');
  }
  function dlgManual() {
    openDlg('<h3>Hidratos a mano</h3><label>Descripción (opcional)</label><input id="mhn" placeholder="Menú del bar, postre…"><label>Gramos de hidratos</label><input id="mhg" inputmode="decimal">' +
      '<div class="acts"><button data-act="close">Cancelar</button><button class="pri" data-act="mhsave">Añadir</button></div>');
  }
  function dlgGlucose() {
    dlgTrend = S.now.src === 'manual' ? +S.now.trend || 0 : 0;
    var chips = [5, 4, 3, 2, 1, 0].map(function (k) { return '<button class="chip' + (k === dlgTrend ? ' on' : '') + '" data-act="gtrend" data-v="' + k + '" aria-label="' + TREND[k][1] + '" title="' + TREND[k][1] + '">' + (TREND[k][0] || '–') + '</button>'; }).join('');
    openDlg('<h3>Glucosa ahora</h3><div class="row"><input class="big" id="gi" inputmode="numeric" placeholder="—"><span class="mut">mg/dL</span></div>' +
      '<label>Tendencia (opcional)</label><div class="chips" id="gtr">' + chips + '</div>' +
      '<div class="acts"><button data-act="close">Cancelar</button><button class="pri" data-act="gsave">Guardar</button></div>');
    var gi = $('#gi'); if (gi) gi.focus();
  }

  // ---------- código de barras ----------
  function dlgBarcode() {
    var canScan = ('BarcodeDetector' in window) && navigator.mediaDevices && navigator.mediaDevices.getUserMedia;
    bcProduct = null;
    openDlg('<h3>Código de barras</h3><div class="row"><input class="grow" id="bc" inputmode="numeric" placeholder="Número bajo las barras"><button class="pri" data-act="bcfind">Buscar</button></div>' +
      (canScan ? '<div class="row" style="margin-top:8px"><button data-act="bcscan">Escanear con la cámara</button></div>' : '') +
      '<div id="bcout" style="margin-top:10px"></div><p class="fine">Datos de Open Food Facts, una base colaborativa: comprueba que coinciden con la etiqueta.</p><div class="acts"><button data-act="close">Cerrar</button></div>');
  }
  async function findCode() {
    var out = $('#bcout'), code = ($('#bc').value || '').replace(/\D/g, '');
    if (code.length < 8 || code.length > 14) { out.innerHTML = '<div class="note warn">Escribe el número completo del código (8 a 14 cifras).</div>'; return; }
    var own = S.custom.filter(function (f) { return f.code === code; })[0];
    if (own) { addItem({ name: own.name, hc100: own.hc100, grams: '' }); return; }
    out.innerHTML = '<p class="mut">Buscando…</p>';
    try {
      var res = await fetch('https://world.openfoodfacts.org/api/v2/product/' + code + '.json?fields=product_name,product_name_es,brands,nutriments');
      var j = await res.json();
      if (!$('#bcout')) return;
      if (!j || j.status !== 1 || !j.product) { out.innerHTML = '<div class="note warn">Ese código no está en la base. Puedes crearlo como alimento propio.</div><button data-act="bcnew">Crear alimento propio</button>'; bcProduct = { code: code }; return; }
      var p = j.product, name = (p.product_name_es || p.product_name || 'Producto ' + code) + (p.brands ? ' (' + String(p.brands).split(',')[0] + ')' : '');
      var hc = p.nutriments ? num(p.nutriments.carbohydrates_100g) : null;
      bcProduct = { code: code, name: name, hc100: hc };
      if (hc === null) { out.innerHTML = '<div class="note warn"><b>' + esc(name) + '</b>: está en la base pero sin dato de hidratos. Míralo en la etiqueta.</div><button data-act="bcnew">Completar a mano</button>'; return; }
      out.innerHTML = '<div class="note info"><b>' + esc(name) + '</b><br>' + fmt(hc, 1) + ' g de hidratos por 100 g</div><button class="pri" data-act="bcadd">Añadir a la comida</button>';
    } catch (e) {
      if ($('#bcout')) out.innerHTML = '<div class="note warn">No se pudo consultar la base de productos (sin conexión, o esta vista previa no tiene acceso a internet).</div>';
    }
  }
  async function startScan() {
    var out = $('#bcout');
    try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }); }
    catch (e) { out.innerHTML = '<div class="note warn">No hay acceso a la cámara. Escribe el número a mano.</div>'; return; }
    out.innerHTML = '<video id="vid" playsinline muted></video>';
    var v = $('#vid'); v.srcObject = stream;
    try { await v.play(); } catch (e) { /* sigue */ }
    var det;
    try { det = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] }); }
    catch (e) { stopScan(); out.innerHTML = '<div class="note warn">Este dispositivo no puede leer códigos con la cámara. Escribe el número a mano.</div>'; return; }
    scanTimer = setInterval(async function () {
      try { var c = await det.detect(v); if (c.length) { stopScan(); $('#bc').value = c[0].rawValue; findCode(); } } catch (e) { /* siguiente fotograma */ }
    }, 350);
  }
  function stopScan() { clearInterval(scanTimer); scanTimer = null; if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; } }

  // ---------- foto del plato (opcional) ----------
  function dlgPhoto() {
    estimate = null;
    openDlg('<h3>Foto del plato</h3><p class="mut">La IA propone alimentos y gramos <b>aproximados</b>; después los revisas tú. Ayuda que se vea el plato entero y algo de referencia (un cubierto).</p>' +
      '<label>Pistas (opcional)</label><input id="phint" placeholder="Plato llano grande, es arroz con pollo…">' +
      '<div class="acts"><button data-act="close">Cancelar</button><button data-act="photogal">Galería</button><button class="pri" data-act="photocam">Hacer foto</button></div>');
  }
  async function analyzePhoto(file) {
    var hint = ($('#phint') || {}).value || '';
    openDlg('<h3>Foto del plato</h3><p class="mut">Analizando la foto…</p>');
    try {
      var b64 = await Vision.fileToJpegBase64(file);
      showEstimate(await Vision.estimate(b64, hint, aiCfg()));
    } catch (e) { msgDlg('No se pudo analizar la foto', e && e.message ? e.message : 'Error desconocido'); }
  }
  function showEstimate(est) {
    estimate = est;
    if (!est.items.length) { msgDlg('Foto del plato', 'La IA no ha reconocido alimentos en la foto.' + (est.notes ? ' ' + est.notes : '')); estimate = null; return; }
    var total = Calc.mealCarbs(est.items);
    openDlg('<h3>Propuesta de la IA</h3><div>' + est.items.map(function (it) {
      return '<div class="item"><div class="nm"><b>' + esc(it.name) + '</b><small>≈ ' + it.grams + ' g · ' + fmt(it.hc100, 1) + ' g HC/100 g · confianza ' + esc(it.conf) + '</small></div><span class="hc">' + fmt(Calc.carbsOf(it), 1) + ' g</span></div>';
    }).join('') + '</div><div class="tot" style="margin-top:8px"><span>Total estimado</span><span><b>' + fmt(total, 1) + '</b> g</span></div>' +
      (est.notes ? '<div class="note info">' + esc(est.notes) + '</div>' : '') +
      '<div class="note warn">Es una estimación a ojo: los gramos pueden desviarse bastante. Al añadirla podrás corregir cada cantidad.</div>' +
      '<div class="acts"><button data-act="close">Descartar</button><button class="pri" data-act="photoadd">Añadir a la comida</button></div>');
  }

  // ---------- platos ----------
  function plateSummary(p) { return p.items.map(function (it) { return it.name + (it.hcDirect != null ? '' : ' ' + (it.grams || '?') + ' g'); }).join(' · '); }
  function usePlate(i) {
    var p = S.plates[i]; if (!p) return;
    p.items.forEach(function (it) { var c = JSON.parse(JSON.stringify(it)); delete c.est; S.meal.items.push(c); });
    save(); closeDlg(); tab = 'comida'; render(); toast('Plato añadido: revisa las cantidades');
  }

  // ---------- vista: registro ----------
  function vLog() {
    var h = '<section class="card"><div class="kv"><span>Insulina activa ahora</span><b>' + (num(S.cfg.dia) > 0 ? fu(activeInsulin()) : '—') + '</b></div>' +
      (num(S.cfg.dia) > 0 ? '' : '<p class="fine">Pon la duración de tu insulina rápida en Ajustes para calcularla.</p>') + '</section>';
    if (!S.log.length) h += '<section class="card"><p class="mut">Cuando registres una comida o una dosis aparecerá aquí.</p></section>';
    else h += '<div class="row" style="margin-bottom:4px"><button data-act="csv">Copiar registro (CSV)</button></div>';
    var lastDay = '';
    S.log.slice().sort(function (x, y) { return y.t - x.t; }).forEach(function (e) {
      var d = new Date(e.t), day = d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
      if (day !== lastDay) { h += '<div class="day">' + esc(day) + '</div>'; lastDay = day; }
      h += '<section class="card" style="padding:6px 14px"><div class="item" style="border:none"><div class="nm"><b>' + hm(e.t) + ' · ' + esc(slotName(e.slot)) + '</b><small>' +
        fmt(e.carbs || 0, 1) + ' g HC' + (e.glucose != null ? ' · ' + fmt(e.glucose, 0) + ' mg/dL ' + (TREND[e.trend] ? TREND[e.trend][0] : '') : '') + (e.sug != null ? ' · sugerido ' + fu(e.sug) : '') +
        (e.items ? '<br>' + esc(e.items) : '') + '</small></div><span class="hc">' + fu(e.u || 0) + '</span><button class="x" data-act="dellog" data-t="' + e.t + '" aria-label="Borrar">✕</button></div></section>';
    });
    view.innerHTML = h;
  }
  function csv() {
    var rows = ['fecha;hora;franja;hidratos_g;glucosa_mgdl;tendencia;sugerido_U;puesto_U;alimentos'];
    S.log.slice().sort(function (x, y) { return x.t - y.t; }).forEach(function (e) {
      var d = new Date(e.t);
      rows.push([d.toLocaleDateString('es-ES'), hm(e.t), e.slot, fmt(e.carbs || 0, 1), e.glucose != null ? e.glucose : '', TREND[e.trend] ? TREND[e.trend][1] : '', e.sug != null ? fmt(e.sug, 2) : '', fmt(e.u || 0, 2), '"' + String(e.items || '').replace(/"/g, '""') + '"'].join(';'));
    });
    return rows.join('\n');
  }

  // ---------- vista: ajustes ----------
  function field(label, path, attrs) { return '<label>' + label + '</label><input data-s="' + path + '" value="' + esc(getPath(path)) + '" ' + (attrs === undefined ? 'inputmode="decimal"' : attrs) + '>'; }
  function sel(label, path, opts) { var v = String(getPath(path)); return '<label>' + label + '</label><select data-s="' + path + '">' + opts.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === v ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>'; }
  function vSettings() {
    var h = '<section class="card"><h2>Tus pautas</h2><div class="note info">Pon aquí los valores que te ha dado tu equipo de diabetes. La app no trae ninguno puesto, y sin ellos no calcula dosis.</div>' +
      sel('Cómo te han dado el ratio', 'cfg.ratioMode', [['r', 'Unidades de insulina por ración (10 g)'], ['g', 'Gramos de hidratos que cubre 1 unidad']]) +
      '<div class="grid2">' + SLOTS.map(function (s) { return '<div>' + field('Ratio ' + s[1].toLowerCase(), 'cfg.ratios.' + s[0]) + '</div>'; }).join('') + '</div>' +
      field('Factor de sensibilidad (mg/dL que te baja 1 unidad)', 'cfg.isf') +
      field('Glucosa objetivo (mg/dL)', 'cfg.target') +
      field('Duración de tu insulina rápida (horas)', 'cfg.dia') +
      sel('La insulina activa se descuenta…', 'cfg.iobMode', [['total', 'de toda la dosis (más prudente)'], ['corr', 'solo de la parte de corrección']]) +
      sel('Tu pluma dosifica de…', 'cfg.step', [['1', '1 en 1 unidad'], ['0.5', '0,5 en 0,5 unidades']]) +
      field('Dosis máxima por inyección (tope de seguridad, opcional)', 'cfg.maxBolus') +
      field('Por debajo de esta glucosa no sugerir dosis (mg/dL) · línea roja', 'cfg.hypo') + '</section>';
    h += '<section class="card"><h2>Colores y gráfica</h2><p class="mut">La tarjeta de glucosa sale verde dentro de tu rango, amarilla por encima, naranja por encima del aviso de alta y roja por debajo.</p>' +
      '<div class="grid2"><div>' + field('Rango: desde (mg/dL)', 'cfg.rangeLow') + '</div><div>' + field('Rango: hasta (mg/dL)', 'cfg.rangeHigh') + '</div></div>' +
      field('Aviso de glucosa alta (mg/dL) · línea naranja', 'cfg.alto') + '</section>';
    h += '<section class="card"><h2>Sensor Libre (LibreLinkUp)</h2><p class="mut">La app lee tu glucosa y la gráfica a través de LibreLinkUp, la función de compartir de Abbott. Necesitas una cuenta de LibreLinkUp con <b>otro correo</b> distinto al de tu LibreLink, invitada desde LibreLink → Aplicaciones conectadas → LibreLinkUp. La app LibreLinkUp solo hace falta para crear esa cuenta y aceptar la invitación; después puedes desinstalarla y, si Abbott pide aceptar condiciones nuevas, Raciones te deja hacerlo desde aquí. No es una vía oficial: puede dejar de funcionar si Abbott la cambia.</p>' +
      field('Correo de la cuenta LibreLinkUp', 'libre.email', 'type="email" autocomplete="off"') +
      field('Contraseña', 'libre.password', 'type="password" autocomplete="off"') +
      field('Versión que se anuncia a LibreLinkUp (avanzado)', 'libre.version', '') +
      (native ? '<div class="row" style="margin-top:10px"><button data-act="libretest">Probar lectura</button></div>' : '<p class="fine">La lectura solo funciona en la app instalada; desde un navegador no es posible.</p>') +
      '<p class="fine">El correo y la contraseña se guardan solo en este dispositivo.</p></section>';
    var pv = S.ai.provider, P = Vision.PROVIDERS[pv];
    h += '<section class="card"><h2>Foto del plato con IA (opcional)</h2><p class="mut">Si lo activas, aparece el botón «Foto» en Comida. La foto se envía al servicio que elijas, que propone alimentos y gramos aproximados para que los revises. Necesita internet y una clave de ese servicio.</p>' +
      sel('Estimación por foto', 'ai.on', [['0', 'Desactivada'], ['1', 'Activada']]) +
      sel('Servicio', 'ai.provider', Object.keys(Vision.PROVIDERS).map(function (k) { return [k, Vision.PROVIDERS[k].name]; })) +
      '<div class="note info"><b>Cómo conseguir la clave</b><ol style="margin:6px 0 0;padding-left:20px">' + P.steps.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ol>' +
      '<p style="margin:8px 0 0"><a href="' + esc(P.keyUrl) + '" target="_blank" rel="noopener" style="color:var(--acc)">' + esc(P.keyUrl.replace('https://', '')) + '</a></p></div>' +
      (P.needsUrl ? field('Dirección del servicio', 'ai.url', 'type="url" autocomplete="off" placeholder="https://openrouter.ai/api/v1"') : '') +
      field('Clave de ' + esc(P.name) + (P.needsUrl ? ' (si hace falta)' : ''), 'ai.keys.' + pv, 'type="password" autocomplete="off"') +
      field('Modelo' + (P.model ? ' (vacío = ' + esc(P.model) + ')' : ''), 'ai.models.' + pv, 'autocomplete="off" placeholder="' + esc(P.model || 'nombre del modelo') + '"') +
      '<p class="fine">Cada servicio guarda su propia clave, solo en este dispositivo, y no entran en la copia de seguridad. Los modelos cambian a menudo: si uno deja de existir, pon el nombre del nuevo.</p></section>';
    h += '<section class="card"><h2>Mis platos</h2>' + (S.plates.length ? S.plates.map(function (p, i) { return '<div class="item"><div class="nm"><b>' + esc(p.name) + '</b><small>' + fmt(Calc.mealCarbs(p.items), 1) + ' g HC · ' + esc(plateSummary(p)) + '</small></div><button class="x" data-act="delplate" data-i="' + i + '" aria-label="Borrar">✕</button></div>'; }).join('') : '<p class="mut">Monta una comida y pulsa «Guardar como plato» para tenerla a un toque.</p>') + '</section>';
    h += '<section class="card"><h2>Mis alimentos propios</h2>' + (S.custom.length ? S.custom.map(function (f, i) { return '<div class="item"><div class="nm"><b>' + esc(f.name) + '</b><small>' + fmt(num(f.hc100) || 0, 1) + ' g de HC por 100 g' + (f.code ? ' · código ' + esc(f.code) : '') + '</small></div><button class="x" data-act="delcustom" data-i="' + i + '" aria-label="Borrar">✕</button></div>'; }).join('') : '<p class="mut">Los que crees o escanees se guardan aquí.</p>') + '</section>';
    h += '<section class="card"><h2>Copia de seguridad</h2><p class="mut">Los datos viven solo en este dispositivo. Guarda una copia de vez en cuando.</p><div class="row"><button data-act="backup">Copiar copia de seguridad</button><button data-act="restore">Restaurar…</button></div></section>';
    h += '<p class="fine" style="padding:0 6px">Raciones ' + VERSION + ' · Ayuda de cálculo personal, no un producto sanitario. Los valores de la tabla de alimentos son aproximados; manda la etiqueta.</p>';
    view.innerHTML = h;
  }

  // ---------- Libre ----------
  function refreshGlucoseUI() {
    if (dlg.open) return;
    if (tab === 'ahora') render(); else if (tab === 'comida') renderRes();
  }
  async function readLibre(silent) {
    if (!native) { if (!silent) toast('La lectura del Libre solo funciona en la app instalada'); return; }
    if (silent && !libreOn()) return;
    if (libreBusy) return;
    libreBusy = true; lastLibreTry = Date.now();
    var card = $('.gcard'); if (card) card.classList.add('busy');
    try {
      var out = await Libre.read(S.libre);
      S.libre.session = out.session;
      var cut = Date.now() - 24 * 3600e3;
      if (out.graph && out.graph.length) S.libre.graph = out.graph.filter(function (p) { return p.t > cut; });
      var manualFresh = S.now.src === 'manual' && S.now.t && Date.now() - S.now.t < STALE_MS && !(out.reading.t > S.now.t);
      if (!silent || !manualFresh) S.now = { v: String(out.reading.mgdl), trend: out.reading.trend, t: out.reading.t || Date.now(), src: 'libre' };
      libreErr = ''; libreStep = null; save();
      if (!silent && tab === 'ajustes') msgDlg('Libre', 'Lectura correcta: ' + out.reading.mgdl + ' mg/dL ' + (TREND[out.reading.trend] ? TREND[out.reading.trend][0] : '') + ' · ' + out.graph.length + ' puntos en la gráfica.');
      else refreshGlucoseUI();
    } catch (e) {
      S.libre.session = null; save();
      libreErr = e && e.message ? e.message : 'Error desconocido';
      libreStep = e && e.code === 'step' && e.step && e.step.ticket ? e.step : null;
      if (!silent) { if (libreStep) dlgStep(); else msgDlg('No se pudo leer el Libre', libreErr); }
      else if (tab === 'ahora') refreshGlucoseUI();
    } finally {
      libreBusy = false;
      card = $('.gcard'); if (card) card.classList.remove('busy');
    }
  }
  function dlgStep() {
    openDlg('<h3>LibreLinkUp pide aceptar algo</h3><p>' + esc(libreErr) + '</p>' +
      '<p class="mut">Normalmente se acepta abriendo la app LibreLinkUp. Si no la tienes instalada, Raciones puede aceptarlo por ti: es lo mismo que pulsar «Aceptar» en su app. Puedes leer ' + esc(Libre.stepName(libreStep.type)) + ' en la web de Abbott (LibreView) antes de decidir.</p>' +
      '<div class="acts"><button data-act="close">Ahora no</button><button class="pri" data-act="libreaccept">Aceptar y conectar</button></div>');
  }
  async function acceptLibreStep() {
    var st = libreStep; if (!st) { closeDlg(); return; }
    openDlg('<h3>LibreLinkUp</h3><p class="mut">Aceptando…</p>');
    try {
      await Libre.acceptStep(st);
      libreStep = null; libreErr = ''; closeDlg();
      lastLibreTry = 0; readLibre(false);
    } catch (e) { msgDlg('No se pudo aceptar', e && e.message ? e.message : 'Error desconocido'); }
  }
  function autoLibre() {
    if (!native || document.hidden || (tab !== 'ahora' && tab !== 'comida') || Date.now() - lastLibreTry < 60000) return;
    readLibre(true);
  }

  // ---------- render y eventos ----------
  function render() {
    Array.prototype.forEach.call(document.querySelectorAll('#nav button'), function (b) { b.classList.toggle('on', b.dataset.tab === tab); });
    if (tab === 'ahora') vNow(); else if (tab === 'comida') vMeal(); else if (tab === 'registro') vLog(); else vSettings();
    if (tab !== 'comida') renderSum();
  }

  document.addEventListener('input', function (e) {
    var t = e.target; if (!t.dataset) return;
    if (t.dataset.s) {
      setPath(t.dataset.s, t.value.trim ? t.value.trim() : t.value);
      if (t.dataset.s.indexOf('libre.') === 0) S.libre.session = null;
      save();
      if (t.dataset.s === 'ai.provider') { var y = window.scrollY; render(); window.scrollTo(0, y); }
      return;
    }
    var f = t.dataset.f; if (!f) return;
    if (f === 'grams' || f === 'hcDirect') { var it = S.meal.items[+t.dataset.i]; if (it) { it[f] = t.value; save(); renderRes(); } }
    else if (f === 'qi') renderSearch(t.value);
  });

  document.addEventListener('click', function (e) {
    var navb = e.target.closest && e.target.closest('#nav button');
    if (navb) { tab = navb.dataset.tab; render(); window.scrollTo(0, 0); autoLibre(); return; }
    var b = e.target.closest && e.target.closest('[data-act]'); if (!b) return;
    var a = b.dataset.act, i = +b.dataset.i;
    switch (a) {
      case 'close': closeDlg(); break;
      case 'yes': { var fn = pending; pending = null; closeDlg(); if (fn) fn(); break; }
      case 'goto': tab = b.dataset.v; render(); window.scrollTo(0, 0); break;
      case 'tores': { var r = $('#res'); if (r && r.scrollIntoView) r.scrollIntoView({ behavior: 'smooth', block: 'start' }); break; }
      case 'slot': S.meal.slot = b.dataset.v; save(); render(); break;
      case 'del': S.meal.items.splice(i, 1); save(); render(); break;
      case 'clear': if (S.meal.items.length) confirmDlg('¿Vaciar la comida actual?', function () { S.meal = { items: [], slot: '' }; save(); render(); }); break;
      case 'pick': {
        var f = b.dataset.src === 'c' ? S.custom[+b.dataset.k] : null, base = b.dataset.src === 'b' ? FOODS[+b.dataset.k] : null;
        if (f) addItem({ name: f.name, hc100: f.hc100, grams: '' });
        else if (base) addItem({ name: base[0], hc100: base[1], grams: '', portion: base[3] || null });
        break;
      }
      case 'newfood': dlgNewFood(($('#qi') || {}).value ? $('#qi').value.trim() : ''); break;
      case 'nfsave': {
        var nm = $('#nfn').value.trim(), hc = num($('#nfh').value), code = $('#nfc').value;
        if (!nm || hc === null || hc < 0 || hc > 100) { toast('Pon un nombre y los hidratos por 100 g (0 a 100)'); break; }
        var nf = { name: nm, hc100: hc }; if (code) nf.code = code;
        S.custom.push(nf); addItem({ name: nm, hc100: hc, grams: '' }); break;
      }
      case 'manual': dlgManual(); break;
      case 'mhsave': { var g = num($('#mhg').value); if (g === null || g < 0) { toast('Pon los gramos de hidratos'); break; } addItem({ name: $('#mhn').value.trim() || 'Hidratos a mano', hcDirect: String(g).replace('.', ',') }); break; }
      case 'editg': dlgGlucose(); break;
      case 'gtrend': dlgTrend = +b.dataset.v; Array.prototype.forEach.call(document.querySelectorAll('#gtr .chip'), function (c) { c.classList.toggle('on', +c.dataset.v === dlgTrend); }); break;
      case 'gsave': {
        var gv = num($('#gi').value);
        if (gv === null || gv < 20 || gv > 600) { toast('Escribe una glucosa entre 20 y 600 mg/dL'); break; }
        S.now = { v: String(Math.round(gv)), trend: dlgTrend, t: Date.now(), src: 'manual' };
        save(); closeDlg(); render(); break;
      }
      case 'barcode': dlgBarcode(); break;
      case 'bcfind': stopScan(); findCode(); break;
      case 'bcscan': startScan(); break;
      case 'bcadd': if (bcProduct && bcProduct.hc100 !== null) { if (!S.custom.some(function (x) { return x.code === bcProduct.code; })) S.custom.push({ name: bcProduct.name, hc100: bcProduct.hc100, code: bcProduct.code }); addItem({ name: bcProduct.name, hc100: bcProduct.hc100, grams: '' }); } break;
      case 'bcnew': dlgNewFood(bcProduct && bcProduct.name || '', '', bcProduct && bcProduct.code || ''); break;
      case 'photo': dlgPhoto(); break;
      case 'photocam': $('#cam').click(); break;
      case 'photogal': $('#gal').click(); break;
      case 'photoadd':
        if (estimate) { estimate.items.forEach(function (it) { S.meal.items.push({ name: it.name, hc100: it.hc100, grams: String(it.grams), est: true }); }); estimate = null; save(); closeDlg(); tab = 'comida'; render(); toast('Añadido: revisa los gramos'); }
        break;
      case 'useplate': usePlate(i); break;
      case 'saveplate': openDlg('<h3>Guardar como plato</h3><label>Nombre del plato</label><input id="pn" placeholder="Desayuno de diario…"><div class="acts"><button data-act="close">Cancelar</button><button class="pri" data-act="platesave">Guardar</button></div>'); break;
      case 'platesave': { var pn = $('#pn').value.trim(); if (!pn) { toast('Ponle un nombre'); break; } S.plates.push({ name: pn, items: JSON.parse(JSON.stringify(S.meal.items)) }); save(); closeDlg(); render(); toast('Plato guardado'); break; }
      case 'delplate': confirmDlg('¿Borrar el plato «' + S.plates[i].name + '»?', function () { S.plates.splice(i, 1); save(); render(); }); break;
      case 'log': {
        var c = compute();
        openDlg('<h3>Registrar</h3><p class="mut">' + fmt(c.carbs, 1) + ' g de hidratos' + (c.r.ok ? ' · sugerencia ' + fu(c.r.total) : '') + '</p><label>Unidades que te has puesto de verdad</label><input id="ru" inputmode="decimal" value="' + (c.r.ok ? fmt(c.r.total, 2) : '') + '"><div class="acts"><button data-act="close">Cancelar</button><button class="pri" data-act="logsave">Guardar</button></div>');
        break;
      }
      case 'logsave': {
        var u = num($('#ru').value); if (u === null) u = 0;
        if (u < 0 || u > 100) { toast('Revisa las unidades'); break; }
        var cc = compute();
        S.log.push({ t: Date.now(), slot: cc.slot, carbs: Math.round(cc.carbs * 10) / 10, glucose: cc.g.v, trend: +S.now.trend || 0, sug: cc.r.ok ? cc.r.total : null, u: u, items: S.meal.items.map(function (x) { return x.name; }).join(', ') });
        S.meal = { items: [], slot: '' }; save(); closeDlg(); tab = 'ahora'; render(); window.scrollTo(0, 0); toast('Registrado'); break;
      }
      case 'dellog': confirmDlg('¿Borrar este registro? Dejará de contar como insulina activa.', function () { S.log = S.log.filter(function (x) { return String(x.t) !== b.dataset.t; }); save(); render(); }); break;
      case 'csv': copyText(csv(), 'Registro copiado'); break;
      case 'delcustom': confirmDlg('¿Borrar «' + S.custom[i].name + '» de tus alimentos?', function () { S.custom.splice(i, 1); save(); render(); }); break;
      case 'backup': { var copy = JSON.parse(JSON.stringify(S)); copy.libre.password = ''; copy.libre.session = null; copy.ai.keys = {}; copyText(JSON.stringify(copy), 'Copia de seguridad copiada (sin contraseñas ni claves)'); break; }
      case 'restore': openDlg('<h3>Restaurar copia</h3><p class="mut">Pega aquí el texto de una copia de seguridad. Sustituye a los datos actuales.</p><textarea id="rs" rows="6"></textarea><div class="acts"><button data-act="close">Cancelar</button><button class="pri" data-act="restoredo">Restaurar</button></div>'); break;
      case 'restoredo': {
        try {
          var j = JSON.parse($('#rs').value); if (!j || typeof j !== 'object' || !j.cfg) throw 0;
          var pw = S.libre.password, ak = S.ai.keys; S = merge(defaults(), j); if (!S.libre.password) S.libre.password = pw; Object.keys(ak).forEach(function (k) { if (!S.ai.keys[k]) S.ai.keys[k] = ak[k]; }); S.libre.session = null;
          save(); closeDlg(); render(); toast('Copia restaurada');
        } catch (err) { toast('Ese texto no es una copia válida'); }
        break;
      }
      case 'libre': readLibre(false); break;
      case 'librestep': if (libreStep) dlgStep(); else readLibre(false); break;
      case 'libreaccept': acceptLibreStep(); break;
      case 'libretest': readLibre(false); break;
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target && e.target.id === 'gi') { e.preventDefault(); var b = $('[data-act="gsave"]'); if (b) b.click(); }
  });
  ['cam', 'gal'].forEach(function (id) {
    var inp = $('#' + id); if (!inp) return;
    inp.addEventListener('change', function () { var f = inp.files && inp.files[0]; inp.value = ''; if (f) analyzePhoto(f); });
  });
  dlg.addEventListener('close', stopScan);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { autoLibre(); refreshGlucoseUI(); } });
  setInterval(function () { if (document.hidden) return; autoLibre(); refreshGlucoseUI(); }, 30000);

  render();
  autoLibre();
  window.__raciones = { state: function () { return S; }, showEstimate: showEstimate, version: VERSION, render: render };
})();
