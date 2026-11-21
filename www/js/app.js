(function () {
  'use strict';
  var VERSION = '0.14.0';
  var KEY = 'raciones.v1';
  var SLOTS = [['desayuno', 'Desayuno'], ['comida', 'Comida'], ['merienda', 'Merienda'], ['cena', 'Cena']];
  var TREND = { 0: ['', 'Sin flecha'], 1: ['↓', 'Bajando rápido'], 2: ['↘', 'Bajando'], 3: ['→', 'Estable'], 4: ['↗', 'Subiendo'], 5: ['↑', 'Subiendo rápido'] };
  var STALE_MS = 15 * 60000;
  // Regla 50/75/100 (documento de la Dra. Barrio). Libre: ↗↘ 1–2 mg/dL/min, ↑↓ más de 2. Al bajar se usa 100 (lo prudente).
  var TREND_ADJ = { 1: -100, 2: -50, 3: 0, 4: 50, 5: 75 };
  var RAPIDS = ['Fiasp', 'NovoRapid', 'Humalog', 'Lyumjev', 'Apidra', 'Otra'];
  var BASALS = ['Tresiba', 'Lantus', 'Toujeo', 'Levemir', 'Abasaglar', 'Otra', 'Ninguna'];
  var ICON = {
    barcode: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 5v14M7.5 5v14M10.5 5v14M14 5v14M17 5v14M20 5v14"/></svg>',
    pencil: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
    camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
    spark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/></svg>',
    run: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="14" cy="4.5" r="2"/><path d="M7 21l3-6 3 2v5M10 15l1-6 4 3 3 1M11 9l-3 1-2 3"/></svg>',
    pen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 4l5 5-9 9H6v-5zM4 20h4"/></svg>',
    smile: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8.5 14.5c1.8 2 5.2 2 7 0M9 9.5h.01M15 9.5h.01"/></svg>',
    wind: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h7"/></svg>',
    share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>'
  };
  var native = !!(window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform());
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var view = $('#view'), dlg = $('#dlg'), sumBar = $('#sum');
  var num = Calc.num;
  var tab = 'ahora';
  var pending = null, bcProduct = null, estimate = null, stream = null, scanTimer = null;
  var lastLibreTry = 0, libreBusy = false, libreErr = '', libreStep = null, dlgTrend = 0, wz = 0, wzOpen = false;

  // ---------- estado ----------
  function defaults() {
    return {
      cfg: { ratioMode: 'r', ratios: { desayuno: '', comida: '', merienda: '', cena: '' }, isf: '', target: '', dia: '', iobMode: 'total', step: '1', maxBolus: '', hypo: '70', rangeLow: '70', rangeHigh: '180', alto: '250', rapid: '', basal: '', sameRatio: '1', ratioAll: '', setup: '', useTrend: '0', ratioLog: [], basalDose: '', basalTime: '', basalRemind: '1' },
      libre: { email: '', password: '', version: Libre.DEFAULT_VERSION, session: null, graph: [] },
      ai: { on: '0', provider: 'claude', keys: {}, models: {}, url: '' },
      now: { v: '', trend: 0, t: null, src: '' },
      custom: [], plates: [], log: [], recent: [], lastQty: {}, hist: [], hipoCheck: 0, missedOff: 0,
      backup: { url: '', user: '', pass: '', auto: '1', last: 0, err: '' },
      kit: { sensorT: 0, sensorDays: '14', rapidT: 0, basalT: 0 },
      bg: { on: '0', missed: '1', low: '0', persist: '0' },
      coach: { used: [], unlocked: [], tipDate: '', tipId: '', ach: [], reportShared: 0, newTip: 0 },
      meal: { items: [], slot: '' }
    };
  }
  function merge(d, j) {
    if (!j || typeof j !== 'object') return d;
    var ratios = Object.assign({}, d.cfg.ratios, j.cfg && j.cfg.ratios);
    ['cfg', 'libre', 'ai', 'now', 'meal', 'backup', 'coach', 'kit', 'bg'].forEach(function (k) { if (j[k] && typeof j[k] === 'object') Object.assign(d[k], j[k]); });
    d.cfg.ratios = ratios;
    ['custom', 'plates', 'log', 'recent', 'hist'].forEach(function (k) { if (Array.isArray(j[k])) d[k] = j[k]; });
    if (j.lastQty && typeof j.lastQty === 'object') d.lastQty = j.lastQty;
    ['hipoCheck', 'missedOff'].forEach(function (k) { if (typeof j[k] === 'number') d[k] = j[k]; });
    if (!Array.isArray(d.meal.items)) d.meal.items = [];
    ['used', 'unlocked', 'ach'].forEach(function (k) { if (!Array.isArray(d.coach[k])) d.coach[k] = []; });
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
  function closeDlg() { wzOpen = false; stopScan(); if (dlg.close && dlg.open) dlg.close(); else dlg.removeAttribute('open'); dlg.innerHTML = ''; }
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
  function agoText(t) {
    var m = Math.round((Date.now() - t) / 60000);
    if (m < 60) return 'hace ' + Math.max(0, m) + ' min';
    var h = Math.floor(m / 60);
    return 'hace ' + h + ' h' + (h < 48 ? '' : ' (' + new Date(t).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) + ')');
  }
  function ageText() {
    if (!S.now.t) return '';
    var a = Math.max(0, Math.round((Date.now() - S.now.t) / 60000));
    return (S.now.src === 'libre' ? 'Libre' : 'A mano') + ' · ' + (a < 1 ? 'ahora mismo' : a < 120 ? 'hace ' + a + ' min' : 'a las ' + hm(S.now.t));
  }

  // ---------- cálculo ----------
  function rapidLog() { return S.log.filter(function (e) { return !e.ins || e.ins === 'rapida'; }); }
  function activeInsulin() { return Calc.iob(rapidLog(), Date.now(), S.cfg.dia); }
  function rapidName() { return S.cfg.rapid && S.cfg.rapid !== 'Otra' ? S.cfg.rapid : 'insulina rápida'; }
  function hasBasal() { return S.cfg.basal && S.cfg.basal !== 'Ninguna'; }
  function basalName() { return S.cfg.basal && S.cfg.basal !== 'Otra' ? S.cfg.basal : 'insulina lenta'; }
  function configured() { return !!Calc.gramsPerUnit(S.cfg.ratioMode, S.cfg.ratios[curSlot()]) && num(S.cfg.isf) > 0 && num(S.cfg.target) > 0; }
  function compute() {
    var slot = curSlot(), g = gNow();
    var carbs = Calc.mealCarbs(S.meal.items);
    var gpu = Calc.gramsPerUnit(S.cfg.ratioMode, S.cfg.ratios[slot]);
    var fresh = S.now.t && Date.now() - S.now.t <= STALE_MS;
    var adj = S.cfg.useTrend === '1' && g.v !== null && fresh ? (TREND_ADJ[+S.now.trend] || 0) : 0;
    var r = Calc.bolus({ carbs: carbs, glucose: g.v, trendAdj: adj, gPerU: gpu, isf: S.cfg.isf, target: S.cfg.target, iob: activeInsulin(), iobMode: S.cfg.iobMode, step: S.cfg.step, maxBolus: S.cfg.maxBolus, hypo: S.cfg.hypo });
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
    var lowish = x.g.v !== null && !x.old && (x.g.v < 80 || (x.g.v < 110 && (+S.now.trend === 1 || +S.now.trend === 2)));
    h += hipoCardHTML();
    if (!S.hipoCheck && lowish) h += '<button class="lowbtn hot" data-act="hipo">Estoy bajo</button>';
    var md = missedDose();
    if (md) h += '<div class="note warn"><b>¿Te has pinchado?</b> Tu glucosa ha subido ' + fmt(md.rise, 0) + ' mg/dL en las últimas 2 horas y no hay ' + esc(rapidName()) + ' apuntada.<div class="row"><button class="pri" data-act="goto" data-v="comida">He comido: calcular</button><button data-act="dose">Ya me la puse</button><button class="ghost" data-act="missedoff">No, ignorar</button></div></div>';
    if (libreErr) h += '<p class="lerr">Libre: ' + esc(libreErr) + (libreStep ? ' <button class="ghost" data-act="librestep">Resolver</button>' : '') + '</p>';
    h += kitDueHTML();
    if (!configured()) h += '<div class="note info">Faltan tus pautas para calcular la dosis. <button class="ghost" data-act="wizard">Configurar en 2 minutos</button></div>';
    h += coachHTML(x) + moodCardHTML() + supportHTML();

    var now = Date.now(), dots = [];
    S.log.forEach(function (e) { if (e.glucose != null) dots.push({ t: e.t, v: e.glucose }); });
    if (S.now.src === 'manual' && x.g.v !== null && S.now.t) dots.push({ t: S.now.t, v: x.g.v });
    h += '<section class="card chartc">' + Chart.svg({
      now: now, hours: 12, points: S.hist.filter(function (p) { return p[0] > now - 13 * 3600e3; }).map(function (p) { return { t: p[0], v: p[1] }; }).concat(S.hist.length ? [] : S.libre.graph), dots: S.hist.length || S.libre.graph.length ? [] : dots,
      marks: S.log.filter(function (e) { return e.ins !== 'hipo' && e.ins !== 'ejercicio' && e.ins !== 'animo'; }).map(function (e) { return { t: e.t, u: e.u, kind: e.ins === 'basal' ? 'basal' : '' }; }),
      low: num(S.cfg.rangeLow) || 70, high: num(S.cfg.rangeHigh) || 180, hypo: num(S.cfg.hypo) || 70, alto: num(S.cfg.alto) || 250, cls: x.cls
    }) + '</section>';
    h += '<button class="pri big" data-act="goto" data-v="comida">' + (S.meal.items.length ? 'Seguir con la comida (' + S.meal.items.length + ')' : 'Calcular comida') + '</button>';
    if (!S.hipoCheck && !lowish) h += '<button class="lowbtn" data-act="hipo">Estoy bajo</button>';
    var last = rapidLog().filter(function (e) { return e.u > 0; }).sort(function (a, b) { return b.t - a.t; })[0];
    var lastB = S.log.filter(function (e) { return e.ins === 'basal'; }).sort(function (a, b) { return b.t - a.t; })[0];
    h += '<section class="card"><div class="kv"><span>' + esc(S.cfg.rapid && S.cfg.rapid !== 'Otra' ? S.cfg.rapid + ' activa' : 'Insulina activa') + '</span><b>' + (num(S.cfg.dia) > 0 ? fu(activeInsulin()) : '—') + '</b></div>' +
      (last ? '<div class="kv"><span>Última dosis</span><b>' + fu(last.u) + ' · ' + hm(last.t) + '</b></div>' : '') +
      (hasBasal() ? '<div class="kv basalrow' + (basalDoneToday() ? ' hecha' : '') + '"><span>' + esc(basalName()) + ' (lenta)<small>' + (lastB ? fu(lastB.u) + ' · ' + agoText(lastB.t) : 'sin apuntar') + (num(S.cfg.basalDose) > 0 && S.cfg.basalTime ? ' · aviso a las ' + esc(S.cfg.basalTime) : '') + '</small></span>' +
        (basalDoneToday() ? '<span class="ok">✓ hoy</span>' : '<button class="chip mini' + (num(S.cfg.basalDose) > 0 ? ' pri' : '') + '" data-act="' + (num(S.cfg.basalDose) > 0 ? 'basalquick' : 'basal') + '">Apuntar' + (num(S.cfg.basalDose) > 0 ? ' ' + fmt(num(S.cfg.basalDose), 1) + ' U' : '') + '</button>') + '</div>' : '') +
      (num(S.cfg.dia) > 0 ? '' : '<p class="fine">Pon la duración de tu insulina en Ajustes para ver la insulina activa.</p>') + '</section>';
    h += tipHTML();
    view.innerHTML = h;
  }

  // ---------- vista: comida ----------
  function stripHTML() {
    var x = gView();
    return '<button class="gstrip gc ' + x.cls + '" data-act="editg"><span><b>' + (x.g.v !== null ? fmt(x.g.v, 0) : '—') + '</b>' +
      (x.arrow ? ' <span class="sarr">' + x.arrow + '</span>' : '') + ' <small>mg/dL</small></span><span class="sage">' +
      (x.g.v !== null ? esc(ageText()) + (x.old ? ' · antigua' : '') : 'Sin glucosa · toca para escribirla') + '</span></button>';
  }
  function unitOf(it) { return it.unit === 'ml' ? 'ml' : it.unit === 'ud' ? 'ud' : 'g'; }
  function qtyWord(u) { return u === 'ml' ? 'ml' : u === 'ud' ? 'unidades' : 'gramos'; }
  function hcText(hc, u) { return u === 'ud' ? fmt(hc, 1) + ' g HC/ud' : fmt(hc, 1) + ' g/100 ' + (u === 'ml' ? 'ml' : 'g'); }
  function portionText(p, u) { return u === 'ud' ? p + (p == 1 ? ' unidad' : ' unidades') : p + ' ' + (u === 'ml' ? 'ml' : 'g'); }
  function way(act, icon, title, sub) { return '<button class="way" data-act="' + act + '">' + icon + '<span><b>' + title + '</b><small>' + sub + '</small></span></button>'; }
  function vMeal() {
    var m = S.meal, slot = curSlot(), h = stripHTML();
    h += '<div class="chips slots">' + SLOTS.map(function (s) { return '<button class="chip' + (s[0] === slot ? ' on' : '') + '" data-act="slot" data-v="' + s[0] + '">' + s[1] + '</button>'; }).join('') + '</div>';
    h += '<section class="card"><h2>¿Qué vas a comer?</h2>' +
      '<div class="sbox">' + ICON.search + '<input id="qi" data-f="qi" type="search" placeholder="Busca: arroz, pan, manzana…" autocomplete="off" enterkeyhint="search"></div><div id="qr" class="list"></div>' +
      '<div class="lab">O añádelo de otra forma</div><div class="ways">' +
      (aiOn() ? way('describe', ICON.spark, 'Describir', 'Cuéntale a la IA qué es') + way('photo', ICON.camera, 'Foto', 'La IA mira el plato') : '') +
      way('barcode', ICON.barcode, 'Código', 'Producto envasado') + way('manual', ICON.pencil, 'Hidratos', 'Ya sé los gramos de HC') + '</div>' +
      (aiOn() ? '' : '<p class="fine">Activa la IA en Ajustes para describir lo que vas a comer o hacerle una foto.</p>');
    if (S.recent.length) h += '<div class="lab">Lo último que has tomado</div><div class="chips">' + S.recent.slice(0, 8).map(function (r, i) { return '<button class="chip" data-act="recent" data-i="' + i + '">' + esc(r.name) + '</button>'; }).join('') + '</div>';
    if (S.plates.length) h += '<div class="lab">Repetir un plato guardado</div><div class="chips">' + S.plates.map(function (p, i) { return '<button class="chip" data-act="useplate" data-i="' + i + '">' + esc(p.name) + ' · ' + fmt(Calc.mealCarbs(p.items), 0) + ' g</button>'; }).join('') + '</div>';
    h += '</section>';
    h += '<section class="card"><h2>En tu plato' + (m.items.length ? ' · ' + m.items.length : '') + '</h2><div id="items">';
    if (!m.items.length) h += '<p class="mut" style="margin:0">Aún está vacío. Busca un alimento arriba o usa uno de los botones.</p>';
    m.items.forEach(function (it, i) {
      var direct = it.hcDirect !== undefined && it.hcDirect !== null;
      h += '<div class="item2"><div class="it-top"><div class="nm"><b>' + esc(it.name) + '</b><small>' +
        (direct ? 'hidratos que has puesto tú' : unitOf(it) === 'ud' ? fmt(num(it.hc100) || 0, 1) + ' g de HC por unidad' : fmt(num(it.hc100) || 0, 1) + ' g de HC por cada 100 ' + (unitOf(it) === 'ml' ? 'ml' : 'g')) +
        (it.est ? ' · <span class="estm">estimado por IA</span>' : '') + (it.pre ? ' · <span class="estm">' + (it.pre === 'last' ? 'cantidad de la última vez' : 'ración normal') + ', cámbiala si no es así</span>' : '') + '</small></div>' +
        '<button class="x" data-act="del" data-i="' + i + '" aria-label="Quitar ' + esc(it.name) + '">✕</button></div>' +
        '<div class="it-qty"><label class="qty"><input class="n" inputmode="decimal" data-f="' + (direct ? 'hcDirect' : 'grams') + '" data-i="' + i + '" value="' + esc(direct ? it.hcDirect : it.grams) + '" placeholder="0" aria-label="' + (direct ? 'Gramos de hidratos' : 'Cantidad de ' + esc(it.name)) + '"><span>' + (direct ? 'g de HC' : qtyWord(unitOf(it))) + '</span></label>' +
        (!direct && it.portion ? '<button class="chip mini" data-act="portion" data-i="' + i + '">' + (unitOf(it) === 'ud' ? 'Normal: ' : 'Ración ') + portionText(it.portion, unitOf(it)) + '</button>' : '') +
        '<span class="hc" id="hc' + i + '"></span></div></div>';
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
    S.meal.items.forEach(function (it, i) { var el = $('#hc' + i); if (el) el.textContent = '= ' + fmt(Calc.carbsOf(it), 1) + ' g HC'; });
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
        '<tr><td>Corrección<small>' + (r.hasGlucose ? '(' + fmt(c.g.v, 0) + (r.trendAdj ? ' ' + (r.trendAdj > 0 ? '+' : '−') + ' ' + Math.abs(r.trendAdj) + ' por la flecha' : '') + ' − ' + fmt(num(S.cfg.target), 0) + ') ÷ ' + fmt(num(S.cfg.isf), 0) : 'sin glucosa') + '</small></td><td>' + (r.hasGlucose ? (r.corr > 0 ? '+' : '') + fu(r.corr) : '—') + '</td></tr>' +
        '<tr><td>Insulina activa<small>' + (num(S.cfg.dia) > 0 ? 'quedan ' + fu(r.iob) + ' de dosis registradas' : 'duración de la insulina sin configurar') + '</small></td><td>' + (r.iobUsed > 0 ? '−' + fu(r.iobUsed) : '—') + '</td></tr></table>';
      h += '<div class="dose"><span class="mut">Sugerencia</span><b>' + fu(r.total) + '</b><span class="mut">sin redondear: ' + fmt(r.raw, 2) + '</span></div>';
      if (S.cfg.rapid === 'Fiasp') h += '<p class="fine">Fiasp: su prospecto permite pincharla desde 2 minutos antes de empezar a comer hasta 20 minutos después; el documento de la Dra. Barrio aconseja esperar 5–10 minutos entre el pinchazo y la comida.</p>';
      var lastR = rapidLog().filter(function (e) { return e.u > 0; }).sort(function (a, b) { return b.t - a.t; })[0];
      if (r.hasGlucose && r.corr > 0 && lastR && Date.now() - lastR.t < 2 * 3600e3) h += '<div class="note warn">Tu última dosis fue hace ' + Math.round((Date.now() - lastR.t) / 60000) + ' min. Se aconseja no poner corrección hasta pasadas 2 horas: lo que queda activo ya se descuenta, pero vigila.</div>';
      var ex = lastExercise(); if (ex && Date.now() - ex.t < 6 * 3600e3) h += '<div class="note warn">Hiciste ejercicio ' + agoText(ex.t) + ' (' + esc(ex.what) + ', ' + ex.min + ' min). Puede que la glucosa baje más de lo normal durante horas, incluso por la noche. El cálculo no lo tiene en cuenta: si tu equipo te dijo cuánto reducir, aplícalo.</div>';
      h += fatHTML();
      if (S.meal.items.some(function (x) { return x.est; })) h += '<div class="note warn">Hay cantidades estimadas por la IA. Revísalas antes de fiarte del resultado.</div>';
      if (r.capped) h += '<div class="note warn">El cálculo supera tu dosis máxima configurada (' + fu(num(S.cfg.maxBolus)) + '); se ha limitado a ese tope.</div>';
      if (!r.hasGlucose && !c.g.bad) h += '<div class="note warn">Sin glucosa: solo se ha calculado la parte de la comida.</div>';
      var tr = +S.now.trend;
      if (r.trendAdj) h += '<p class="fine">Se ha tenido en cuenta la flecha (' + TREND[tr][0] + '): la glucosa en 30 min sería unos ' + fmt(c.g.v + r.trendAdj, 0) + ' mg/dL.</p>';
      else if (r.hasGlucose && (tr === 1 || tr === 2)) h += '<div class="note warn">La flecha indica que la glucosa está ' + TREND[tr][1].toLowerCase() + '. El cálculo no lo tiene en cuenta: valora poner menos según tus pautas.</div>';
      else if (r.hasGlucose && (tr === 4 || tr === 5)) h += '<div class="note warn">La flecha indica que la glucosa está ' + TREND[tr][1].toLowerCase() + '. El cálculo no lo tiene en cuenta.</div>';
      if (r.hasGlucose && S.now.t && Date.now() - S.now.t > STALE_MS) h += '<div class="note warn">La glucosa es de hace ' + Math.round((Date.now() - S.now.t) / 60000) + ' min. Vuelve a medirla antes de decidir.</div>';
    }
    h += '<button class="pri big" data-act="log" style="margin-top:12px">Registrar lo que me pongo</button><div class="row" style="justify-content:space-between"><button data-act="saveplate"' + (S.meal.items.length ? '' : ' disabled') + '>Guardar como plato</button><button class="ghost" data-act="clear">Vaciar plato</button></div>';
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
    S.custom.forEach(function (f, i) { if (norm(f.name).indexOf(n) >= 0) out.push('<button data-act="pick" data-src="c" data-k="' + i + '"><span>' + esc(f.name) + ' <small class="mut">· propio</small></span><span>' + hcText(num(f.hc100) || 0, f.unit || 'g') + '</span></button>'); });
    FOODS.forEach(function (f, i) {
      var row = '<button data-act="pick" data-src="b" data-k="' + i + '"><span>' + esc(f[0]) + '</span><span>' + hcText(f[1], f[4] || 'g') + '</span></button>';
      if (norm(f[0]).indexOf(n) >= 0) out.push(row); else if (norm(f[2]).indexOf(n) >= 0) byCat.push(row);
    });
    out = out.concat(byCat).slice(0, 8);
    out.push('<button data-act="newfood"><span>+ Crear «' + esc(q.trim()) + '» como alimento propio</span><span></span></button>');
    box.innerHTML = out.join('');
  }
  /* Añade un alimento con la cantidad de la última vez (o la ración normal) ya puesta. */
  function addFood(f) {
    var it = { name: f.name, hc100: f.hc100, grams: '', portion: f.portion || null };
    if (f.unit && f.unit !== 'g') it.unit = f.unit;
    if (S.lastQty[f.name]) { it.grams = String(S.lastQty[f.name]); it.pre = 'last'; }
    else if (f.portion) { it.grams = String(f.portion); it.pre = 'portion'; }
    addItem(it);
  }
  function remember(items) {
    items.forEach(function (it) {
      if (it.hcDirect != null || !it.name) return;
      var q = num(it.grams); if (q > 0) S.lastQty[it.name] = q;
      S.recent = S.recent.filter(function (r) { return r.name !== it.name; });
      S.recent.unshift({ name: it.name, hc100: it.hc100, unit: it.unit || 'g', portion: it.portion || null });
    });
    S.recent = S.recent.slice(0, 12);
    var keys = Object.keys(S.lastQty); if (keys.length > 300) delete S.lastQty[keys[0]];
  }
  function addItem(it) {
    S.meal.items.push(it); save(); closeDlg(); tab = 'comida'; render();
    var ins = view.querySelectorAll('#items input.n');
    if (ins.length) { var el = ins[ins.length - 1]; el.focus(); if (el.select) el.select(); if (el.scrollIntoView) el.scrollIntoView({ block: 'center' }); }
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
  function dlgDescribe() {
    estimate = null;
    openDlg('<h3>Describe lo que vas a comer</h3><p class="mut">Escríbelo como se lo dirías a alguien (también puedes dictarlo con el micrófono del teclado). Si sabes cantidades, dilas.</p>' +
      '<textarea id="dtext" rows="4" placeholder="Ej.: un plato de lentejas con chorizo, un trozo de pan y una manzana de postre"></textarea>' +
      '<div class="acts"><button data-act="close">Cancelar</button><button class="pri" data-act="describego">Calcular con IA</button></div>');
    var t = $('#dtext'); if (t) t.focus();
  }
  async function analyzeText(text) {
    openDlg('<h3>Calculando…</h3><p class="mut">La IA está estimando los alimentos y las cantidades.</p>');
    try { showEstimate(await Vision.describe(text, aiCfg())); }
    catch (e) { msgDlg('No se pudo calcular', e && e.message ? e.message : 'Error desconocido'); }
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
    if (!est.items.length) { msgDlg('Sin alimentos', 'La IA no ha encontrado alimentos.' + (est.notes ? ' ' + est.notes : '')); estimate = null; return; }
    var total = Calc.mealCarbs(est.items);
    openDlg('<h3>Propuesta de la IA</h3><div>' + est.items.map(function (it) {
      return '<div class="item"><div class="nm"><b>' + esc(it.name) + '</b><small>≈ ' + it.grams + ' g · ' + fmt(it.hc100, 1) + ' g HC/100 g · confianza ' + esc(it.conf) + '</small></div><span class="hc">' + fmt(Calc.carbsOf(it), 1) + ' g</span></div>';
    }).join('') + '</div><div class="tot" style="margin-top:8px"><span>Total estimado</span><span><b>' + fmt(total, 1) + '</b> g</span></div>' +
      (est.notes ? '<div class="note info">' + esc(est.notes) + '</div>' : '') +
      '<div class="note warn">Es una estimación: los gramos pueden desviarse bastante. Al añadirla podrás corregir cada cantidad.</div>' +
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
  var logSeg = 'diario', logDays = 7;
  function segHTML() { return '<div class="seg"><button class="' + (logSeg === 'diario' ? 'on' : '') + '" data-act="logseg" data-v="diario">Diario</button><button class="' + (logSeg === 'analisis' ? 'on' : '') + '" data-act="logseg" data-v="analisis">Análisis</button></div>'; }
  function vAnalysis() {
    var h = segHTML();
    h += '<button class="pri big" data-act="report">Informe para el endocrino</button>';
    h += advisorHTML() + learnHTML() + moodStatsHTML();
    if (S.log.length) h += '<div class="row"><button data-act="csv">Copiar registro (CSV)</button><button data-act="repcsv">Compartir CSV</button></div>';
    view.innerHTML = h;
  }
  function vLog() {
    if (logSeg === 'analisis') return vAnalysis();
    var h = segHTML() + '<div class="ways3"><button data-act="dose">' + ICON.pencil + 'Dosis suelta</button><button data-act="exercise">' + ICON.run + 'Ejercicio</button>' + (hasBasal() ? '<button data-act="basal">' + ICON.pen + 'Lenta</button>' : '') + '</div>';
    if (!S.log.length) h += '<section class="card"><p class="mut">Cuando registres una comida o una dosis aparecerá aquí.</p></section>';
    var lastDay = '', cutDay = new Date(); cutDay.setHours(0, 0, 0, 0); cutDay = cutDay.getTime() - (logDays - 1) * 864e5;
    var more = S.log.some(function (e) { return e.t < cutDay; });
    S.log.filter(function (e) { return e.t >= cutDay; }).sort(function (x, y) { return y.t - x.t; }).forEach(function (e) {
      var d = new Date(e.t), day = d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
      if (day !== lastDay) { h += '<div class="day">' + esc(day) + '</div>'; lastDay = day; }
      if (e.ins === 'animo') {
        h += '<section class="card" style="padding:6px 14px"><div class="item" style="border:none"><div class="nm"><b>' + hm(e.t) + ' · ' + Coach.moodFace(e.mood) + ' Ánimo</b><small>' + esc(Coach.MOODS[e.mood - 1][2]) + ((e.tags || []).length ? ' · ' + esc(e.tags.join(', ')) : '') + (e.glucose != null ? ' · ' + fmt(e.glucose, 0) + ' mg/dL' : '') + '</small></div><button class="x" data-act="dellog" data-t="' + e.t + '" aria-label="Borrar">✕</button></div></section>';
        return;
      }
      if (e.ins === 'ejercicio') {
        h += '<section class="card" style="padding:6px 14px"><div class="item" style="border:none"><div class="nm"><b>' + hm(e.t) + ' · Ejercicio</b><small>' + esc(e.what) + ' · ' + e.min + ' min · ' + esc(e.level) + '</small></div><button class="x" data-act="dellog" data-t="' + e.t + '" aria-label="Borrar">✕</button></div></section>';
        return;
      }
      if (e.ins === 'hipo') {
        h += '<section class="card" style="padding:6px 14px"><div class="item" style="border:none"><div class="nm"><b>' + hm(e.t) + ' · Bajada</b><small>' + (e.glucose != null ? fmt(e.glucose, 0) + ' mg/dL' : 'sin glucosa') + (e.what ? ' · tomó ' + esc(e.what) : '') + (e.treat ? ' · ' + fmt(e.treat, 0) + ' g HC' : '') + '</small></div><span class="hc" style="color:var(--lo-b)">↓</span><button class="x" data-act="dellog" data-t="' + e.t + '" aria-label="Borrar">✕</button></div></section>';
        return;
      }
      if (!(e.carbs > 0) && e.ins !== 'basal') {
        h += '<section class="card" style="padding:6px 14px"><div class="item" style="border:none"><div class="nm"><b>' + hm(e.t) + ' · ' + (e.kind === 'comida' ? 'Comida sin apuntar' : 'Corrección') + '</b><small>' + (e.glucose != null ? fmt(e.glucose, 0) + ' mg/dL' : '') + '</small></div><span class="hc">' + fu(e.u || 0) + '</span><button class="x" data-act="dellog" data-t="' + e.t + '" aria-label="Borrar">✕</button></div></section>';
        return;
      }
      if (e.ins === 'basal') {
        h += '<section class="card" style="padding:6px 14px"><div class="item" style="border:none"><div class="nm"><b>' + hm(e.t) + ' · Lenta</b><small>' + esc(e.name || 'insulina lenta') + '</small></div><span class="hc lenta">' + fu(e.u || 0) + '</span><button class="x" data-act="dellog" data-t="' + e.t + '" aria-label="Borrar">✕</button></div></section>';
        return;
      }
      var pg = e.post && !e.post.none ? (e.post.g3 != null ? ['3', e.post.g3] : e.post.g2 != null ? ['2', e.post.g2] : null) : null;
      var post = pg ? 'a las ' + pg[0] + ' h: ' + fmt(pg[1], 0) + ' mg/dL' + (e.post.min != null && e.post.min < (num(S.cfg.hypo) || 70) ? ' (bajó a ' + fmt(e.post.min, 0) + ')' : '') : '';
      h += '<section class="card" style="padding:6px 14px"><div class="item" style="border:none"><div class="nm"><b>' + hm(e.t) + ' · ' + esc(slotName(e.slot)) + '</b><small>' +
        fmt(e.carbs || 0, 1) + ' g HC' + (e.glucose != null ? ' · ' + fmt(e.glucose, 0) + ' mg/dL ' + (TREND[e.trend] ? TREND[e.trend][0] : '') : '') + (e.sug != null ? ' · sugerido ' + fu(e.sug) : '') +
        (e.items ? '<br>' + esc(e.items) : '') + (post ? '<br><span class="estm">' + post + '</span>' : '') + '</small></div><span class="hc">' + fu(e.u || 0) + '</span><button class="x" data-act="dellog" data-t="' + e.t + '" aria-label="Borrar">✕</button></div></section>';
    });
    if (more) h += '<button class="big" data-act="logmore">Ver 7 días más</button>';
    view.innerHTML = h;
  }
  function learnHTML() {
    var s = Learn.summary(S.log, { now: Date.now(), days: 30, low: num(S.cfg.hypo) || 70, high: num(S.cfg.rangeHigh) || 180, target: num(S.cfg.target) || 110 });
    var h = '<section class="card"><h2>Aprendizaje · últimos 30 días</h2>';
    if (!s.n) return h + '<p class="mut" style="margin:0">Cuando registres comidas con el Libre conectado, aquí verás cómo te dejan la glucosa 2–3 horas después, por franja y por alimento. Necesita la gráfica del Libre y abrir la app al menos una vez al día.</p></section>';
    SLOTS.forEach(function (x) {
      var r = s.slots[x[0]]; if (!r.n) return;
      h += '<div class="lrow ' + r.level + '"><b>' + x[1] + ' · ' + r.n + ' comidas</b><span>' + esc(r.text) + '</span></div>';
    });
    if (s.foods.length) h += '<div class="lab">Lo que más te sube (de la glucosa al comer a la de 3 h después)</div>' + s.foods.slice(0, 5).map(function (f) { return '<div class="kv"><span>' + esc(f.name) + ' <small class="mut">· ' + f.n + ' veces</small></span><b>' + (f.rise > 0 ? '+' : '') + f.rise + '</b></div>'; }).join('');
    return h + '<p class="fine">Son observaciones de tus propios datos y no cambian tus pautas. Si ves un patrón que se repite, coméntalo con tu endocrino antes de tocar ratios o dosis. Las comidas con otra dosis de rápida en las 3 h siguientes no cuentan.</p></section>';
  }
  function csv() {
    var rows = ['fecha;hora;tipo;franja;hidratos_g;glucosa_mgdl;tendencia;sugerido_U;puesto_U;glucosa_3h;alimentos'];
    S.log.slice().sort(function (x, y) { return x.t - y.t; }).forEach(function (e) {
      var d = new Date(e.t);
      rows.push([d.toLocaleDateString('es-ES'), hm(e.t), e.ins === 'basal' ? 'lenta' : e.ins === 'hipo' ? 'bajada' : e.ins === 'ejercicio' ? 'ejercicio' : e.ins === 'animo' ? 'animo' : 'rapida', e.slot || '', fmt(e.carbs || 0, 1), e.glucose != null ? e.glucose : '', TREND[e.trend] ? TREND[e.trend][1] : '', e.sug != null ? fmt(e.sug, 2) : '', fmt(e.u || 0, 2), e.post && !e.post.none ? e.post.g3 : '', '"' + String(e.items || e.name || '').replace(/"/g, '""') + '"'].join(';'));
    });
    return rows.join('\n');
  }

  // ---------- vista: ajustes ----------
  function field(label, path, attrs) { return '<label>' + label + '</label><input data-s="' + path + '" value="' + esc(getPath(path)) + '" ' + (attrs === undefined ? 'inputmode="decimal"' : attrs) + '>'; }
  function sel(label, path, opts) { var v = String(getPath(path)); return '<label>' + label + '</label><select data-s="' + path + '">' + opts.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === v ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>'; }
  /* Ajustes en bloques plegables; se recuerda cuáles tienes abiertos. */
  var openSecs = {};
  function collapse(h) {
    var n = 0;
    return h.replace(/<section class="card"><h2>([^<]*)<\/h2>/g, function (m0, t) { var id = 's' + (n++); return '<details class="card sec" data-sec="' + id + '"' + (openSecs[id] ? ' open' : '') + '><summary>' + t + '</summary>'; })
      .replace(/<\/section>/g, '</details>');
  }
  function vSettings() {
    var h = '<button class="pri big" data-act="wizard">Asistente de configuración</button>' +
      '<section class="card"><h2>Tus insulinas</h2>' + sel('Rápida (comidas)', 'cfg.rapid', [['', '—']].concat(RAPIDS.map(function (x) { return [x, x]; }))) + sel('Lenta', 'cfg.basal', [['', '—']].concat(BASALS.map(function (x) { return [x, x]; }))) +
      (hasBasal() ? '<div class="grid2"><div>' + field('Dosis fija de lenta (U)', 'cfg.basalDose') + '</div><div>' + field('Hora a la que te la pones', 'cfg.basalTime', 'type="time"') + '</div></div>' +
        sel('Aviso diario si no la has apuntado', 'cfg.basalRemind', [['1', 'Sí, avisarme a esa hora'], ['0', 'No']]) +
        '<p class="fine">Con dosis fija, «Apuntar» en Ahora es un solo toque, y el aviso trae un botón para apuntarla sin abrir la app.' + (native ? '' : ' Los avisos solo funcionan en la app instalada.') + '</p>' : '') + '</section>' +
      '<section class="card"><h2>Tus pautas</h2><div class="note info">Pon aquí los valores que te ha dado tu equipo de diabetes. La app no trae ninguno puesto, y sin ellos no calcula dosis.</div>' +
      sel('Cómo te han dado el ratio', 'cfg.ratioMode', [['r', 'Unidades de insulina por ración (10 g)'], ['g', 'Gramos de hidratos que cubre 1 unidad']]) +
      '<div class="grid2">' + SLOTS.map(function (s) { return '<div>' + field('Ratio ' + s[1].toLowerCase(), 'cfg.ratios.' + s[0]) + '</div>'; }).join('') + '</div>' +
      field('Factor de sensibilidad (mg/dL que te baja 1 unidad)', 'cfg.isf') +
      field('Glucosa objetivo (mg/dL)', 'cfg.target') +
      field('Duración de tu insulina rápida (horas)', 'cfg.dia') +
      sel('La insulina activa se descuenta…', 'cfg.iobMode', [['total', 'de toda la dosis (más prudente)'], ['corr', 'solo de la parte de corrección']]) +
      sel('Tu pluma dosifica de…', 'cfg.step', [['1', '1 en 1 unidad'], ['0.5', '0,5 en 0,5 unidades']]) +
      field('Dosis máxima por inyección (tope de seguridad, opcional)', 'cfg.maxBolus') +
      field('Por debajo de esta glucosa no sugerir dosis (mg/dL) · línea roja', 'cfg.hypo') +
      sel('Tener en cuenta la flecha del sensor', 'cfg.useTrend', [['0', 'No, solo avisar'], ['1', 'Sí: ±50 / 75 / 100 mg/dL (regla del documento de la Dra. Barrio)']]) + '</section>';
    h += '<section class="card"><h2>Sensor Libre (LibreLinkUp)</h2><p class="mut">La app lee tu glucosa y la gráfica a través de LibreLinkUp, la función de compartir de Abbott. Necesitas una cuenta de LibreLinkUp con <b>otro correo</b> distinto al de tu LibreLink, invitada desde LibreLink → Aplicaciones conectadas → LibreLinkUp. La app LibreLinkUp solo hace falta para crear esa cuenta y aceptar la invitación; después puedes desinstalarla y, si Abbott pide aceptar condiciones nuevas, iocrino te deja hacerlo desde aquí. No es una vía oficial: puede dejar de funcionar si Abbott la cambia.</p>' +
      field('Correo de la cuenta LibreLinkUp', 'libre.email', 'type="email" autocomplete="off"') +
      field('Contraseña', 'libre.password', 'type="password" autocomplete="off"') +
      field('Versión que se anuncia a LibreLinkUp (avanzado)', 'libre.version', '') +
      (native ? '<div class="row" style="margin-top:10px"><button data-act="libretest">Probar lectura</button></div>' : '<p class="fine">La lectura solo funciona en la app instalada; desde un navegador no es posible.</p>') +
      '<p class="fine">El correo y la contraseña se guardan solo en este dispositivo.</p></section>';
    h += kitSettingsHTML() + bgSettingsHTML();
    var pv = S.ai.provider, P = Vision.PROVIDERS[pv];
    h += '<section class="card"><h2>Foto del plato con IA (opcional)</h2><p class="mut">Si lo activas, en Comida aparecen «Describir» y «Foto». Lo que escribas o la foto se envía al servicio que elijas, que propone alimentos y gramos aproximados para que los revises. Necesita internet y una clave de ese servicio.</p>' +
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
    h += '<section class="card"><h2>Colores y gráfica</h2><p class="mut">La tarjeta de glucosa sale verde dentro de tu rango, amarilla por encima, naranja por encima del aviso de alta y roja por debajo.</p>' +
      '<div class="grid2"><div>' + field('Rango: desde (mg/dL)', 'cfg.rangeLow') + '</div><div>' + field('Rango: hasta (mg/dL)', 'cfg.rangeHigh') + '</div></div>' +
      field('Aviso de glucosa alta (mg/dL) · línea naranja', 'cfg.alto') + '</section>';
    h += backupHTML();
    h += '<p class="fine" style="padding:0 6px">iocrino ' + VERSION + ' · Ayuda de cálculo personal, no un producto sanitario. Los valores de la tabla de alimentos son aproximados; manda la etiqueta.</p>';
    view.innerHTML = collapse(h);
  }

  // ---------- historial de glucosa (para el informe y los avisos) ----------
  function addHist(points) {
    if (!points || !points.length) return;
    var cut = Date.now() - 90 * 24 * 3600e3, m = {};
    S.hist.concat(points).forEach(function (p) { if (p && p[0] > cut && p[1] > 0) m[Math.round(p[0] / 300000)] = [p[0], Math.round(p[1])]; });
    S.hist = Object.keys(m).map(function (k) { return m[k]; }).sort(function (a, b) { return a[0] - b[0]; });
  }

  // ---------- plugins nativos ----------
  var plugCache = {};
  function plug(name) {
    if (!native || !window.Capacitor) return null;
    if (plugCache[name]) return plugCache[name];
    try { plugCache[name] = Capacitor.registerPlugin ? Capacitor.registerPlugin(name) : (Capacitor.Plugins || {})[name] || null; } catch (e) { plugCache[name] = null; }
    return plugCache[name];
  }
  async function shareText(title, text) {
    var sh = plug('Share');
    if (sh) { try { await sh.share({ title: title, text: text, dialogTitle: title }); return; } catch (e) { if (e && /cancel/i.test(e.message || '')) return; } }
    copyText(text, 'Copiado');
  }
  async function shareFile(name, content, title) {
    var fs = plug('Filesystem'), sh = plug('Share');
    if (fs && sh) {
      try {
        var w = await fs.writeFile({ path: name, data: content, directory: 'CACHE', encoding: 'utf8' });
        await sh.share({ title: title, files: [w.uri], dialogTitle: title });
        return true;
      } catch (e) { if (e && /cancel/i.test(e.message || '')) return false; }
    }
    copyText(content, 'Copiado al portapapeles');
    return false;
  }
  function today() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }

  // ---------- «¿Te has pinchado?» ----------
  function missedDose() {
    var now = Date.now();
    if (S.missedOff && now - S.missedOff < 3 * 3600e3) return null;
    var h = S.hist; if (h.length < 4) return null;
    var last = h[h.length - 1]; if (now - last[0] > 20 * 60000) return null;
    var win = h.filter(function (p) { return p[0] >= last[0] - 2 * 3600e3; });
    var mn = Math.min.apply(null, win.map(function (p) { return p[1]; })), rise = last[1] - mn;
    if (rise < 60 || last[1] < 180) return null;
    if (S.log.some(function (e) { return isRapidE(e) && e.u > 0 && e.t > now - 3 * 3600e3; })) return null;
    return { rise: rise, v: last[1] };
  }
  function isRapidE(e) { return !e.ins || e.ins === 'rapida'; }
  function dlgDose() {
    openDlg('<h3>Apuntar ' + esc(rapidName()) + '</h3><p class="mut">Para una dosis sin calcular comida: una corrección, o una comida que no has apuntado.</p><label>Unidades</label><input id="du" inputmode="decimal">' +
      '<label>Motivo</label><div class="chips" id="dk"><button class="chip on" data-act="dosekind" data-v="correccion">Corrección</button><button class="chip" data-act="dosekind" data-v="comida">Comida sin apuntar</button></div>' +
      '<div class="acts"><button data-act="close">Cancelar</button><button class="pri" data-act="dosesave">Guardar</button></div>');
    var du = $('#du'); if (du) du.focus();
  }

  // ---------- «Estoy bajo» ----------
  var HIPO_OPTS = [['Zumo (200 ml)', 20], ['Refresco normal (200 ml)', 21], ['2 sobres de azúcar', 16], ['Pastillas de glucosa', null], ['Otra cosa', null]];
  function dlgHipo() {
    var g = gNow();
    openDlg('<h3>Estoy bajo</h3><div class="note bad" style="font-weight:400">Trátala como te enseñó tu equipo. Lo habitual es tomar hidratos de absorción rápida y volver a mirar la glucosa a los 15 minutos.</div>' +
      '<label>Glucosa ahora (mg/dL)</label><input id="hg" inputmode="numeric" value="' + (g.v !== null && g.v < 100 && S.now.t && Date.now() - S.now.t < STALE_MS ? fmt(g.v, 0) : '') + '">' +
      '<label>¿Qué has tomado? (opcional)</label><div class="chips" id="hw">' + HIPO_OPTS.map(function (o, i) { return '<button class="chip" data-act="hipowhat" data-i="' + i + '">' + esc(o[0]) + '</button>'; }).join('') + '</div>' +
      '<label>Gramos de hidratos que has tomado (opcional)</label><input id="hgr" inputmode="decimal">' +
      '<div class="acts"><button data-act="close">Cancelar</button><button class="pri" data-act="hiposave">Guardar y avisarme en 15 min</button></div>');
  }
  var hipoWhat = '';
  async function scheduleHipo(at) {
    var n = notifPlugin(); if (!n) return;
    try {
      await n.cancel({ notifications: [{ id: 7100 }] });
      if (!at) return;
      var perm = await n.checkPermissions(); if (perm.display !== 'granted') perm = await n.requestPermissions();
      if (perm.display !== 'granted') return;
      await n.schedule({ notifications: [{ id: 7100, title: 'Vuelve a mirar tu glucosa', body: 'Han pasado 15 minutos desde la bajada. ¿Cómo estás?', schedule: { at: new Date(at), allowWhileIdle: true }, extra: { kind: 'hipo' } }] });
    } catch (e) { /* sin aviso */ }
  }
  function hipoCardHTML() {
    if (!S.hipoCheck) return '';
    var left = Math.ceil((S.hipoCheck - Date.now()) / 60000);
    if (left > 0) return '<div class="note bad hipo">Bajada apuntada. Vuelve a mirar tu glucosa en <b>' + left + ' min</b>.<div class="row"><button data-act="hipook">Ya estoy bien</button></div></div>';
    var g = gView();
    return '<div class="note bad hipo"><b>Han pasado 15 minutos.</b> ¿Cómo estás?' + (g.g.v !== null && !g.old ? ' Tu glucosa ahora: <b>' + fmt(g.g.v, 0) + ' mg/dL</b>.' : '') +
      '<div class="row"><button class="pri" data-act="hipook">Ya estoy bien</button><button data-act="hipo">Sigo bajo</button></div></div>';
  }

  // ---------- informe para el endocrino ----------
  var repDays = 14;
  function pct(v) { return v == null ? '—' : fmt(v, 0) + ' %'; }
  function dlgReport() {
    var r = Report.build({ hist: S.hist, log: S.log, cfg: S.cfg, now: Date.now(), days: repDays }), g = r.glucose, h = '';
    h += '<h3>Informe para el endocrino</h3><div class="chips">' + [7, 14, 30].map(function (d) { return '<button class="chip' + (d === repDays ? ' on' : '') + '" data-act="repdays" data-v="' + d + '">' + d + ' días</button>'; }).join('') + '</div>';
    if (!g.n) h += '<p class="mut">Aún no hay datos del sensor en este periodo. Con el Libre conectado, la app guarda tu glucosa (hasta 90 días) cada vez que la abres.</p>';
    else {
      var bar = [['vlow', g.vlow, 'var(--lo-b)'], ['low', g.low, '#ff8a8a'], ['in', g.inr, 'var(--in-b)'], ['high', g.high, 'var(--hi-b)'], ['vhigh', g.vhigh, 'var(--vhi-b)']];
      h += '<div class="tir">' + bar.map(function (b) { return '<span style="width:' + b[1].toFixed(2) + '%;background:' + b[2] + '"></span>'; }).join('') + '</div>' +
        '<div class="kv"><span>En rango (70–180)</span><b>' + pct(g.inr) + '</b></div><p class="fine" style="margin:0">Objetivo general: más del 70 %.</p>' +
        '<div class="kv"><span>Por encima de 180 / de 250</span><b>' + pct(g.high + g.vhigh) + ' / ' + pct(g.vhigh) + '</b></div>' +
        '<div class="kv"><span>Por debajo de 70 / de 54</span><b>' + pct(g.low + g.vlow) + ' / ' + pct(g.vlow) + '</b></div>' +
        '<div class="kv"><span>Media · HbA1c estimada (GMI)</span><b>' + fmt(g.mean, 0) + ' · ' + fmt(g.gmi, 1) + ' %</b></div>' +
        '<div class="kv"><span>Variabilidad (CV)</span><b>' + fmt(g.cv, 0) + ' %</b></div>' +
        '<div class="kv"><span>Datos del sensor</span><b>' + g.coverage + ' %</b></div>';
    }
    h += '<div class="lab">Insulina</div><div class="kv"><span>Rápida / lenta al día</span><b>' + (r.insulin.rapid != null ? fmt(r.insulin.rapid, 1) : '—') + ' / ' + (r.insulin.basal != null ? fmt(r.insulin.basal, 1) : '—') + ' U</b></div>' +
      '<div class="kv"><span>Bajadas apuntadas</span><b>' + r.hipos.length + '</b></div>';
    h += '<div class="lab">Comidas (medias)</div>' + SLOTS.map(function (s) { var m = r.meals[s[0]]; return '<div class="kv"><span>' + s[1] + ' <small class="mut">· ' + m.n + '</small></span><b>' + (m.n ? fmt(m.carbs, 0) + ' g · ' + fmt(m.u, 1) + ' U · ' + (m.pre != null ? fmt(m.pre, 0) : '—') + '→' + (m.post2 != null ? fmt(m.post2, 0) : '—') : '—') + '</b></div>'; }).join('') +
      '<p class="fine">Comidas: hidratos · unidades · glucosa antes → 2 h después.</p>';
    h += '<div class="acts"><button data-act="close">Cerrar</button><button data-act="repcsv">Compartir datos (CSV)</button><button class="pri" data-act="repshare">Compartir informe</button></div>';
    openDlg(h);
  }

  // ---------- copias de seguridad ----------
  function backupData() {
    var c = JSON.parse(JSON.stringify(S));
    c.libre.password = ''; c.libre.session = null; c.ai.keys = {}; c.backup.pass = '';
    c.app = 'iocrino'; c.version = VERSION; c.saved = Date.now();
    return JSON.stringify(c);
  }
  function restoreFrom(j) {
    if (!j || typeof j !== 'object' || !j.cfg) throw new Error('no válida');
    var keep = { pw: S.libre.password, keys: S.ai.keys, bk: S.backup };
    S = merge(defaults(), j);
    if (!S.libre.password) S.libre.password = keep.pw;
    Object.keys(keep.keys).forEach(function (k) { if (!S.ai.keys[k]) S.ai.keys[k] = keep.keys[k]; });
    S.backup = Object.assign({}, keep.bk, { last: keep.bk.last });
    S.libre.session = null; save(); render(); scheduleBasal();
  }
  function davBase() { var u = String(S.backup.url || '').trim(); return u ? u.replace(/\/*$/, '/') : ''; }
  function davHeaders() {
    var h = { 'content-type': 'application/json' };
    if (S.backup.user) h.authorization = 'Basic ' + btoa(unescape(encodeURIComponent(S.backup.user + ':' + (S.backup.pass || ''))));
    return h;
  }
  function davError(status) {
    if (status === 401 || status === 403) return 'El NAS rechaza el usuario o la contraseña.';
    if (status === 404 || status === 409) return 'No existe esa carpeta en el NAS. Créala primero (por ejemplo con File Station).';
    return 'El NAS respondió con un error (' + status + ').';
  }
  var nasBusy = false;
  async function nasBackup(silent) {
    var base = davBase(); if (!base || nasBusy) return;
    nasBusy = true;
    try {
      var body = backupData();
      for (var name of ['iocrino-ultima.json', 'iocrino-' + today() + '.json']) {
        var res = await fetch(base + name, { method: 'PUT', headers: davHeaders(), body: body });
        if (!(res.status >= 200 && res.status < 300)) throw new Error(davError(res.status));
      }
      S.backup.last = Date.now(); S.backup.err = ''; save();
      if (!silent) toast('Copia guardada en el NAS');
    } catch (e) {
      S.backup.err = e && e.message && !/fetch|network|Failed/i.test(e.message) ? e.message : 'No se pudo conectar con el NAS (¿estás en casa o con Tailscale?).';
      save(); if (!silent) msgDlg('No se pudo hacer la copia', S.backup.err);
    } finally { nasBusy = false; if (tab === 'ajustes' && !dlg.open) render(); }
  }
  async function nasRestore() {
    var base = davBase(); if (!base) { toast('Pon antes la dirección del NAS'); return; }
    try {
      var res = await fetch(base + 'iocrino-ultima.json', { headers: davHeaders() });
      if (!(res.status >= 200 && res.status < 300)) throw new Error(davError(res.status));
      var j = await res.json();
      confirmDlg('Restaurar la copia del NAS' + (j.saved ? ' del ' + new Date(j.saved).toLocaleString('es-ES') : '') + '? Sustituye a los datos actuales.', function () { restoreFrom(j); toast('Copia restaurada'); });
    } catch (e) { msgDlg('No se pudo restaurar', e && e.message ? e.message : 'Error desconocido'); }
  }
  function autoBackup() {
    if (S.backup.auto === '1' && davBase() && Date.now() - (S.backup.last || 0) > 20 * 3600e3) nasBackup(true);
  }
  function backupHTML() {
    var b = S.backup;
    return '<section class="card"><h2>Copias de seguridad</h2><p class="mut">Los datos viven en este móvil. Las copias no llevan contraseñas ni claves.</p>' +
      '<div class="lab">Google Drive (u otro sitio)</div><p class="fine" style="margin-top:0">Pulsa el botón y en el menú elige «Drive» (o «Guardar en Drive»). Para restaurar, elige el archivo desde Drive.</p>' +
      '<div class="row"><button class="pri" data-act="bkshare">Guardar copia en Drive…</button><button data-act="bkfile">Restaurar desde archivo</button></div>' +
      '<div class="lab">NAS o servidor de casa (automática)</div><p class="fine" style="margin-top:0">Por WebDAV, una vez al día al abrir la app. En el Synology: Centro de paquetes → WebDAV Server, crea una carpeta (p. ej. «iocrino») y pon su dirección, por ejemplo http://192.168.1.150:5005/home/iocrino/ (o la IP de Tailscale para hacerlo desde fuera).</p>' +
      field('Dirección WebDAV de la carpeta', 'backup.url', 'type="url" autocomplete="off" placeholder="http://192.168.1.150:5005/home/iocrino/"') +
      '<div class="grid2"><div>' + field('Usuario', 'backup.user', 'autocomplete="off"') + '</div><div>' + field('Contraseña', 'backup.pass', 'type="password" autocomplete="off"') + '</div></div>' +
      sel('Copia automática diaria', 'backup.auto', [['1', 'Sí'], ['0', 'No']]) +
      '<p class="fine">' + (b.last ? 'Última copia: ' + new Date(b.last).toLocaleString('es-ES') + '.' : 'Aún no se ha hecho ninguna copia en el NAS.') + (b.err ? ' <span style="color:var(--warn)">' + esc(b.err) + '</span>' : '') + '</p>' +
      '<div class="row"><button data-act="bknas">Hacer copia ahora</button><button data-act="bknasrestore">Restaurar desde el NAS</button></div>' +
      '<details class="how"><summary>Copiar o pegar como texto</summary><div class="row"><button data-act="backup">Copiar copia</button><button data-act="restore">Pegar copia…</button></div></details></section>';
  }

  // ---------- lenta: dosis fija y aviso diario ----------
  function lastBasal() { return S.log.filter(function (e) { return e.ins === 'basal'; }).sort(function (a, b) { return b.t - a.t; })[0]; }
  function basalDoneToday() { var lb = lastBasal(), d = new Date(); d.setHours(0, 0, 0, 0); return !!(lb && lb.t >= d.getTime()); }
  function logBasal(u) {
    S.log.push({ t: Date.now(), ins: 'basal', u: u, carbs: 0, name: basalName() });
    save(); render(); scheduleBasal(); toast(basalName() + ' apuntada: ' + fu(u)); checkAch(false);
  }
  /* Un toque: apunta la dosis fija. Si ya hay una en las últimas 12 h, pregunta antes para no duplicar. */
  function quickBasal(fromNotif) {
    var dose = num(S.cfg.basalDose); if (!(dose > 0)) { tab = 'ahora'; render(); $('[data-act="basal"]') && $('[data-act="basal"]').click(); return; }
    var lb = lastBasal();
    if (lb && Date.now() - lb.t < 12 * 3600e3) {
      tab = 'ahora'; render();
      confirmDlg('Ya apuntaste ' + basalName() + ' ' + agoText(lb.t) + ' (' + fu(lb.u) + '). ¿Apuntar otra vez ' + fu(dose) + '?', function () { logBasal(dose); });
      return;
    }
    if (fromNotif) { tab = 'ahora'; }
    logBasal(dose);
  }
  var LN = null, lnReady = false;
  function notifPlugin() {
    if (!native || !window.Capacitor) return null;
    if (LN) return LN;
    try { LN = Capacitor.registerPlugin ? Capacitor.registerPlugin('LocalNotifications') : (Capacitor.Plugins || {}).LocalNotifications || null; } catch (e) { LN = null; }
    return LN;
  }
  async function initNotifications() {
    var n = notifPlugin(); if (!n || lnReady) return;
    lnReady = true;
    try {
      await n.registerActionTypes({ types: [{ id: 'BASAL', actions: [{ id: 'apuntar', title: 'Apuntar' }] }] });
      n.addListener('localNotificationActionPerformed', function (ev) {
        var x = ev && ev.notification && ev.notification.extra;
        if (x && x.kind !== 'basal') { tab = 'ahora'; render(); return; }
        if (!x || x.kind !== 'basal') return;
        if (ev.actionId === 'apuntar') quickBasal(true);
        else { tab = 'ahora'; render(); if (!basalDoneToday()) quickBasalAsk(); }
      });
    } catch (e) { /* sin avisos */ }
    scheduleBasal();
  }
  function quickBasalAsk() {
    var dose = num(S.cfg.basalDose);
    if (dose > 0) confirmDlg('¿Apuntar ' + fu(dose) + ' de ' + basalName() + ' ahora?', function () { logBasal(dose); });
    else { var b = $('[data-act="basal"]'); if (b) b.click(); }
  }
  /* Programa los avisos de los próximos 7 días a la hora elegida (saltando hoy si ya está apuntada). */
  async function scheduleBasal() {
    var n = notifPlugin(); if (!n) return;
    try {
      var ids = []; for (var i = 0; i < 8; i++) ids.push({ id: 7000 + i });
      await n.cancel({ notifications: ids });
      var tm = /^(\d{1,2}):(\d{2})$/.exec(S.cfg.basalTime || '');
      if (S.cfg.basalRemind === '0' || !hasBasal() || !tm) return;
      var perm = await n.checkPermissions();
      if (perm.display !== 'granted') { perm = await n.requestPermissions(); if (perm.display !== 'granted') { toast('Sin permiso de notificaciones: no podré avisarte'); return; } }
      var dose = num(S.cfg.basalDose), list = [], start = basalDoneToday() ? 1 : 0;
      for (var d = start, k = 0; k < 7; d++, k++) {
        var at = new Date(); at.setDate(at.getDate() + d); at.setHours(+tm[1], +tm[2], 0, 0);
        if (at.getTime() <= Date.now() + 30000) continue;
        list.push({ id: 7000 + k, title: 'Hora de la ' + basalName(), body: dose > 0 ? '¿Te la has puesto? Pulsa «Apuntar» para guardar ' + fu(dose) + '.' : '¿Te la has puesto? Toca para apuntarla.',
          schedule: { at: at, allowWhileIdle: true }, actionTypeId: dose > 0 ? 'BASAL' : undefined, extra: { kind: 'basal' } });
      }
      if (list.length) await n.schedule({ notifications: list });
    } catch (e) { /* sin avisos */ }
  }

  // ---------- guía fácil ----------
  var GUIDE = [
    ['Lo básico', '<p>La <b>glucosa</b> es el azúcar que llevas en la sangre. Los <b>hidratos de carbono</b> (pan, arroz, pasta, fruta, leche, azúcar…) la suben; la <b>insulina</b> la baja.</p><p>Usas dos insulinas: la <b>lenta</b> (' + '{basal}' + ') hace de «fondo» todo el día, y la <b>rápida</b> (' + '{rapid}' + ') es la de las comidas y la que corrige cuando vas alto. Esta app solo calcula la rápida.</p>'],
    ['Hidratos y raciones', '<p>Una <b>ración</b> son 10 g de hidratos. Ejemplo: 200 g de arroz cocido tienen unos 56 g de hidratos, o sea 5,6 raciones.</p><p>No tienes que sumar nada: tú dices qué y cuánto comes y la app lo cuenta. Lo importante es acertar con la cantidad; pesar de vez en cuando ayuda a calcular a ojo.</p>'],
    ['El ratio', '<p>El <b>ratio</b> dice cuánta insulina necesitas por cada ración. Con 1,5 unidades por ración, 4 raciones son 6 unidades.</p><p>Hay quien lo tiene al revés: «1 unidad cubre 8 g de hidratos». Es lo mismo dicho de otra forma.</p><p>Suele cambiar según la hora: en general hace falta más en el desayuno, después en merienda y cena, y menos en la comida, aunque cada persona es distinta y cambia con el tiempo.</p>'],
    ['El factor de sensibilidad (la corrección)', '<p>Dice <b>cuánto te baja la glucosa 1 unidad</b>. Con un factor de 40, si llegas a comer con 180 y tu objetivo es 100, te sobran 80: 80 ÷ 40 = 2 unidades más.</p><p>Si llegas por debajo del objetivo, la cuenta sale negativa y te quita insulina.</p><p>Una forma de estimarlo es la «regla del 1700»: 1700 ÷ toda la insulina que te pones en un día (lenta + rápida). Si en un día te pones 40 unidades, 1700 ÷ 40 ≈ 42.</p>'],
    ['Las metas', '<p>Como orientación general (tu endocrino puede ponerte otras):</p><ul><li>Antes de comer: entre 80 y 120.</li><li>Una hora después: por debajo de 160–180.</li><li>Dos horas después: por debajo de 140.</li></ul>'],
    ['La insulina activa', '<p>La rápida no actúa de golpe: tarda unas horas. Si te pinchaste hace poco, parte de esa insulina todavía está bajándote la glucosa. La app lo resta para que no «dupliques».</p><p>Como idea: a las 3 horas queda alrededor de un 30 % y a las 4 horas un 10 %. Por eso no conviene poner una corrección antes de que pasen 2 horas de la dosis anterior.</p>'],
    ['Las flechas del sensor', '<p>La flecha dice hacia dónde va tu glucosa: → estable, ↗ o ↘ cambia 1–2 mg/dL por minuto, ↑ o ↓ más de 2 por minuto.</p><p>Una forma de usarlas (la del documento de la Dra. Barrio) es sumar o restar a tu glucosa lo que habrá subido o bajado en 30 minutos: 50 con ↗ o ↘, 75 o 100 con ↑ o ↓. Ejemplo: 140 con ↗ se calcula como 190.</p><p>Se activa en Ajustes → «Tener en cuenta la flecha». Si no lo activas, la app solo te avisa.</p>'],
    ['Grasas y proteínas', '<p>Una pizza o una comida con mucha grasa sube la glucosa <b>más tarde</b>, a partir de las 3 horas, y durante varias horas. Al principio puede incluso darte una bajada.</p><p>La app aún no calcula esa parte. Si te pasa a menudo con ciertas comidas, coméntalo con tu equipo: hay formas de cubrirlo con un poco más de insulina más tarde.</p>'],
    ['Cómo aprende la app y te propone ratios', '<p>Cada vez que registras una comida, la app mira en la gráfica del Libre cómo acabaste 1, 2 y 3 horas después.</p><p>Con eso calcula cuánta insulina te habría dejado bien en cada comida. Cuando tiene al menos 5 comidas de una franja (por ejemplo, cenas), compara con tu ratio:</p><ul><li>Si te habría hecho falta bastante más, te propone <b>subir un 10 %</b>.</li><li>Si te sobraba, te propone <b>bajar un 10 %</b>.</li><li>Si has bajado de 70 dos veces, te propone bajar aunque falten datos.</li></ul><p>Los cambios son siempre pequeños, de uno en uno, y después espera unos días para ver el efecto. <b>Nunca cambia nada sola</b>: tú decides, y lo ideal es hacerlo de acuerdo con tu endocrino.</p><p>No cuentan las comidas sin glucosa antes, sin datos del Libre después, o con otra dosis de rápida en las 3 horas siguientes.</p>'],
    ['Si bajas de 70', '<p>Eso es una hipoglucemia. Trátala como te haya enseñado tu equipo y vuelve a medir. Con la glucosa por debajo de 70 la app no te sugiere ninguna dosis.</p>']
  ];
  function dlgGuide() {
    var sub = function (s) { return s.replace('{basal}', esc(hasBasal() ? basalName() : 'por ejemplo Tresiba')).replace('{rapid}', esc(S.cfg.rapid && S.cfg.rapid !== 'Otra' ? S.cfg.rapid : 'por ejemplo Fiasp')); };
    openDlg('<h3>Guía fácil</h3><p class="mut">Lo necesario para entender la app, explicado desde cero.</p>' +
      GUIDE.map(function (g, i) { return '<details class="gd"' + (i === 0 ? ' open' : '') + '><summary>' + g[0] + '</summary>' + sub(g[1]) + '</details>'; }).join('') +
      '<p class="fine">Basado en «Ajuste de la dosis de insulina para cubrir la ingesta» (Dra. Raquel Barrio y Lourdes Cartaya, 2020) y en la guía del Ministerio de Sanidad. Es información general: tus pautas te las da tu equipo de diabetes.</p>' +
      '<div class="acts"><button class="pri" data-act="close">Cerrar</button></div>');
  }

  // ---------- asesor de ratios ----------
  function uprText(u) { return S.cfg.ratioMode === 'r' ? fmt(u, 2) + ' U/ración' : fmt(10 / u, 1) + ' g por unidad'; }
  function advisorHTML() {
    var R = Learn.ratios(S.log, { now: Date.now(), days: 30, mode: S.cfg.ratioMode, ratios: S.cfg.ratios, isf: S.cfg.isf, dia: S.cfg.dia, low: num(S.cfg.hypo) || 70, changes: S.cfg.ratioLog || [] });
    var h = '<section class="card"><h2>Tus ratios · asesor</h2>';
    SLOTS.forEach(function (x) {
      var r = R[x[0]], txt = '', btn = '';
      if (r.action === 'sin') txt = 'Sin ratio puesto.';
      else if (r.action === 'datos') txt = 'Aprendiendo: ' + r.n + ' de 5 comidas válidas.';
      else if (r.action === 'esperar') txt = 'Lo cambiaste ' + agoText(r.changedAt) + '. Espera unos días con el ratio nuevo (' + r.n + ' comidas desde entonces).';
      else if (r.okBy === 'pdf') txt = 'Va bien: en ' + r.good + ' de tus ' + r.clean + ' comidas empezaste entre 80 y 120 y a las 2 h estabas por debajo de 140, como pide el documento. Con ' + uprText(r.goodMed) + ' de media.';
      else if (r.action === 'ok') txt = 'Va bien: con tus ' + r.n + ' comidas, lo que habría hecho falta (' + uprText(r.med) + ') está cerca de lo que usas.';
      else if (r.action === 'menos-hipo') { txt = 'Has bajado de ' + fmt(num(S.cfg.hypo) || 70, 0) + ' en ' + r.lows + ' comidas desde el último cambio. Propuesta: <b>un 10 % menos de insulina</b>, ' + uprText(r.newUpr) + '.'; }
      else { txt = 'Con tus ' + r.n + ' comidas, lo que te habría dejado bien sale de media ' + uprText(r.med) + '. Propuesta: <b>un 10 % ' + (r.action === 'mas' ? 'más' : 'menos') + ' de insulina</b>, ' + uprText(r.newUpr) + '.'; }
      if (r.newVal) btn = '<button class="chip mini" data-act="ratioapply" data-slot="' + x[0] + '">Aplicar</button>';
      if (r.good && r.action !== 'sin' && !r.okBy) txt += ' <span class="mut">En ' + r.good + ' comidas te salió como pide el PDF (80–120 antes y &lt;140 a las 2 h), con ' + uprText(r.goodMed) + ' de media.</span>';
      h += '<div class="adv ' + r.action + '"><div class="kv"><b>' + x[1] + '</b><span>' + (r.cur ? uprText(r.cur) : '—') + btn + '</span></div><p>' + txt + '</p></div>';
    });
    var T = Learn.tdd(S.log, Date.now());
    if (T) h += '<div class="adv"><div class="kv"><b>Factor de sensibilidad</b><span>' + (num(S.cfg.isf) ? fmt(num(S.cfg.isf), 0) : '—') + '</span></div><p>Te pones de media ' + fmt(T.tdd, 0) + ' unidades al día (' + T.days + ' días con lenta y rápida apuntadas). La regla del 1700 daría unos ' + fmt(Math.round(1700 / T.tdd / 5) * 5, 0) + '. Solo como referencia para hablarlo con tu endocrino.</p></div>';
    var lc = (S.cfg.ratioLog || []).slice(-1)[0];
    h += '<div class="row" style="margin-top:6px"><button class="ghost" data-act="guide">¿Cómo decide esto?</button>' + (lc ? '<button class="ghost" data-act="ratioundo">Deshacer último cambio (' + esc(slotName(lc.slot).toLowerCase()) + ')</button>' : '') + '</div>';
    return h + '<p class="fine">Las propuestas salen de tus datos con el método del documento de la Dra. Barrio y se dan de un 10 % en un 10 %, como recomienda la guía del Ministerio de Sanidad. Lo ideal es aplicarlas de acuerdo con tu endocrino.</p></section>';
  }

  // ---------- asistente de configuración ----------
  function wchips(path, opts) {
    var cur = getPath(path), v = String(cur == null ? '' : cur);
    return '<div class="chips">' + opts.map(function (o) {
      var val = Array.isArray(o) ? o[0] : o, lab = Array.isArray(o) ? o[1] : o;
      return '<button class="chip' + (String(val) === v ? ' on' : '') + '" data-act="wzset" data-p="' + path + '" data-v="' + esc(val) + '">' + esc(lab) + '</button>';
    }).join('') + '</div>';
  }
  var WZ = [
    { t: 'Vamos a dejar la app lista', b: function () { return '<p>Te hago unas preguntas para que la app haga casi todo sola. Lo que no sepas, sáltalo: se puede poner luego en Ajustes.</p><p class="mut">Ten a mano lo que te dio tu endocrino: ratio, factor de sensibilidad y glucosa objetivo.</p>'; } },
    { t: 'Tus insulinas', b: function () {
      return '<label>Rápida (la de las comidas)</label>' + wchips('cfg.rapid', RAPIDS) + '<label>Lenta</label>' + wchips('cfg.basal', BASALS) +
        (hasBasal() ? '<div class="grid2"><div>' + field('Si es siempre la misma: unidades', 'cfg.basalDose') + '</div><div>' + field('Hora a la que te la pones', 'cfg.basalTime', 'type="time"') + '</div></div><p class="fine" style="margin-top:4px">Con la hora, la app te avisa cada día si aún no la has apuntado.</p>' : '') +
        '<label>Tu pluma de rápida pincha de…</label>' + wchips('cfg.step', [['1', '1 en 1 unidad'], ['0.5', '0,5 en 0,5']]);
    } },
    { t: 'Cuánta insulina por comida', b: function () {
      var same = S.cfg.sameRatio !== '0', lab = S.cfg.ratioMode === 'r' ? 'Unidades por ración (10 g de hidratos)' : 'Gramos de hidratos que cubre 1 unidad';
      return '<label>Tu endocrino te lo dio como…</label>' + wchips('cfg.ratioMode', [['r', 'Unidades por ración'], ['g', 'Gramos por unidad']]) +
        '<label>¿Es el mismo en todas las comidas?</label>' + wchips('cfg.sameRatio', [['1', 'Sí, el mismo'], ['0', 'No, cambia']]) +
        (same ? field(lab, 'cfg.ratioAll') : '<p class="fine">' + lab + ':</p><div class="grid2">' + SLOTS.map(function (x) { return '<div>' + field(x[1], 'cfg.ratios.' + x[0]) + '</div>'; }).join('') + '</div>');
    } },
    { t: 'Corrección', b: function () {
      return '<p class="mut">Para cuando llegas a comer por encima o por debajo de tu objetivo.</p>' + field('Glucosa objetivo (mg/dL)', 'cfg.target') + field('Factor de sensibilidad: cuántos mg/dL te baja 1 unidad', 'cfg.isf') +
        '<label>¿Tener en cuenta la flecha del sensor?</label><p class="fine" style="margin-top:0">Suma o resta lo que subirá o bajará tu glucosa en 30 minutos (50, 75 o 100), como explica el documento de la Dra. Barrio.</p>' + wchips('cfg.useTrend', [['0', 'No, solo avisar'], ['1', 'Sí']]);
    } },
    { t: 'Cuánto dura la rápida', b: function () {
      return '<p class="mut">Sirve para descontar la insulina que todavía te hace efecto.' + (S.cfg.rapid === 'Fiasp' ? ' Según el prospecto de Fiasp, su efecto dura entre 3 y 5 horas; elige la que te indique tu endocrino.' : ' Pon la que te indique tu endocrino.') + '</p>' +
        wchips('cfg.dia', [['3', '3 horas'], ['4', '4 horas'], ['5', '5 horas']]) + field('Otra (horas)', 'cfg.dia');
    } },
    { t: 'Sensor Libre', b: function () {
      return '<p class="mut">Opcional. Con una cuenta de LibreLinkUp la glucosa y la gráfica entran solas, y la app puede aprender de tus comidas.</p>' +
        field('Correo de LibreLinkUp', 'libre.email', 'type="email" autocomplete="off"') + field('Contraseña', 'libre.password', 'type="password" autocomplete="off"');
    } },
    { t: 'IA para describir o fotografiar', b: function () {
      var h = '<p class="mut">Opcional. Para decir «lentejas con pan» o hacer una foto y que la IA calcule los hidratos.</p>' + wchips('ai.on', [['0', 'Ahora no'], ['1', 'Sí, activarla']]);
      if (S.ai.on === '1') {
        var P = Vision.PROVIDERS[S.ai.provider];
        h += sel('Servicio', 'ai.provider', Object.keys(Vision.PROVIDERS).map(function (k) { return [k, Vision.PROVIDERS[k].name]; })) +
          '<div class="note info"><ol style="margin:0;padding-left:20px">' + P.steps.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ol></div>' +
          (P.needsUrl ? field('Dirección del servicio', 'ai.url', 'type="url" autocomplete="off"') : '') + field('Clave', 'ai.keys.' + S.ai.provider, 'type="password" autocomplete="off"');
      }
      return h;
    } },
    { t: 'Resumen', b: function () {
      function line(ok, txt) { return '<div class="kv"><span>' + txt + '</span><b style="color:' + (ok ? 'var(--in-b)' : 'var(--warn)') + '">' + (ok ? '✓' : 'falta') + '</b></div>'; }
      var ratios = SLOTS.every(function (x) { return Calc.gramsPerUnit(S.cfg.ratioMode, S.cfg.ratios[x[0]]); });
      return line(!!S.cfg.rapid, 'Insulinas' + (S.cfg.rapid ? ': ' + esc(S.cfg.rapid) + (hasBasal() ? ' y ' + esc(S.cfg.basal) : '') : '')) +
        line(ratios, 'Ratio de las comidas') + line(num(S.cfg.target) > 0 && num(S.cfg.isf) > 0, 'Objetivo y sensibilidad') + line(num(S.cfg.dia) > 0, 'Duración de la rápida') +
        line(!!(S.libre.email && S.libre.password), 'Sensor Libre') + line(aiOn(), 'IA') +
        '<p class="fine">Lo que falte lo puedes completar cuando quieras desde Ajustes → Asistente de configuración.</p>';
    } }
  ];
  function renderWz() {
    var st = WZ[wz];
    openDlg('<div class="wz"><div class="wzdots">' + WZ.map(function (x, i) { return '<span' + (i <= wz ? ' class="on"' : '') + '></span>'; }).join('') + '</div><h3>' + esc(st.t) + '</h3>' + st.b() +
      '<div class="acts">' + (wz > 0 ? '<button data-act="wzback">Atrás</button>' : '<button data-act="wzlater">Más tarde</button>') +
      '<button class="pri" data-act="wznext">' + (wz === WZ.length - 1 ? 'Empezar' : wz === 0 ? 'Vamos' : 'Siguiente') + '</button></div></div>');
    wzOpen = true;
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
      Learn.update(S.log, out.graph || [], Date.now());
      var cut = Date.now() - 24 * 3600e3;
      if (out.graph && out.graph.length) S.libre.graph = out.graph.filter(function (p) { return p.t > cut; });
      addHist((out.graph || []).map(function (p) { return [p.t, p.v]; }));
      var manualFresh = S.now.src === 'manual' && S.now.t && Date.now() - S.now.t < STALE_MS && !(out.reading.t > S.now.t);
      if (!silent || !manualFresh) S.now = { v: String(out.reading.mgdl), trend: out.reading.trend, t: out.reading.t || Date.now(), src: 'libre' };
      libreErr = ''; libreStep = null; save(); nativeSync();
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
      '<p class="mut">Normalmente se acepta abriendo la app LibreLinkUp. Si no la tienes instalada, iocrino puede aceptarlo por ti: es lo mismo que pulsar «Aceptar» en su app. Puedes leer ' + esc(Libre.stepName(libreStep.type)) + ' en la web de Abbott (LibreView) antes de decidir.</p>' +
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

  // ---------- avisos sueltos ----------
  async function notifyAt(id, at, title, body, kind) {
    var n = notifPlugin(); if (!n) return;
    try {
      await n.cancel({ notifications: [{ id: id }] });
      if (!at || at < Date.now() + 60000) return;
      var perm = await n.checkPermissions(); if (perm.display !== 'granted') perm = await n.requestPermissions();
      if (perm.display !== 'granted') return;
      await n.schedule({ notifications: [{ id: id, title: title, body: body, schedule: { at: new Date(at), allowWhileIdle: true }, extra: { kind: kind || 'aviso' }, smallIcon: 'ic_stat_iocrino' }] });
    } catch (e) { /* sin aviso */ }
  }

  // ---------- comidas grasas ----------
  var FATTY = /pizza|hamburgues|frit|croquet|lasa[nñ]a|kebab|churro|porra|bolleri|croissant|cruas[aá]n|donut|nachos|empanad|canelon|carbonara|queso|chorizo|panceta|bacon|tarta|pastel|helado|chocolate|fabada|cocido|paella/;
  function fatAuto() { return S.meal.items.some(function (x) { return FATTY.test(norm(x.name)); }); }
  function isFatty() { return S.meal.fat === '1' || (S.meal.fat !== '0' && fatAuto()); }
  function fatHTML() {
    if (!S.meal.items.length) return '';
    var on = isFatty();
    return '<button class="chip mini' + (on ? ' on' : '') + '" data-act="fat" style="margin:6px 0">' + (on ? '✓ ' : '') + 'Comida con mucha grasa o proteína</button>' +
      (on ? '<div class="note info">La grasa y la proteína retrasan la subida: a veces llega 3 a 5 horas después (pizza, fritos, carne con salsa…). La dosis no cambia; al registrarla te aviso a las 3 h para que mires la glucosa. Si te pasa a menudo, pregunta a tu equipo por las <b>unidades grasa-proteína</b> o por repartir la dosis.</div>' : '');
  }

  // ---------- ejercicio ----------
  function lastExercise() { return S.log.filter(function (e) { return e.ins === 'ejercicio'; }).sort(function (a, b) { return b.t - a.t; })[0]; }
  function dlgExercise() {
    var ch = function (id, act, opts, on) { return '<div class="chips" id="' + id + '">' + opts.map(function (o) { return '<button class="chip' + (o === on ? ' on' : '') + '" data-act="' + act + '">' + o + '</button>'; }).join('') + '</div>'; };
    openDlg('<h3>Apuntar ejercicio</h3><label>¿Qué has hecho?</label>' + ch('exw', 'exwhat', ['Caminar', 'Correr', 'Bici', 'Gimnasio', 'Nadar', 'Fútbol', 'Otro'], 'Caminar') +
      '<label>Intensidad</label>' + ch('exl', 'exlevel', ['Suave', 'Moderado', 'Intenso'], 'Moderado') +
      '<div class="grid2"><div><label>Minutos</label><input id="exm" inputmode="numeric" value="30"></div><div><label>Terminaste hace (min)</label><input id="exa" inputmode="numeric" value="0"></div></div>' +
      '<p class="fine">Al calcular la siguiente comida verás un aviso: con ejercicio reciente suele hacer falta menos insulina. Cuánto menos, te lo dice tu equipo.</p>' +
      '<div class="acts"><button data-act="close">Cancelar</button><button class="pri" data-act="exsave">Guardar</button></div>');
  }

  // ---------- material: sensor y plumas ----------
  var PEN_DAYS = { Fiasp: 28, NovoRapid: 28, Humalog: 28, Lyumjev: 28, Apidra: 28, Tresiba: 56, Lantus: 28, Toujeo: 56, Levemir: 42, Abasaglar: 28 };
  var KIT_Q = { sensorT: '¿Te has puesto un sensor nuevo hoy?', rapidT: '¿Has empezado hoy una pluma nueva de rápida?', basalT: '¿Has empezado hoy una pluma nueva de lenta?' };
  function kitItems() {
    var out = [], D1 = 864e5;
    var sd = num(S.kit.sensorDays) || 14;
    out.push({ k: 'sensorT', name: 'Sensor', days: sd, t: S.kit.sensorT });
    out.push({ k: 'rapidT', name: 'Pluma de ' + rapidName(), days: PEN_DAYS[S.cfg.rapid] || 28, t: S.kit.rapidT });
    if (hasBasal()) out.push({ k: 'basalT', name: 'Pluma de ' + basalName(), days: PEN_DAYS[S.cfg.basal] || 28, t: S.kit.basalT });
    out.forEach(function (x) { x.end = x.t ? x.t + x.days * D1 : 0; x.left = x.t ? (x.end - Date.now()) / D1 : null; });
    return out;
  }
  function leftText(x) {
    if (x.left == null) return 'sin apuntar';
    if (x.left <= 0) return 'caducado ' + (x.k === 'sensorT' ? '' : '(' + x.days + ' días) ') + 'hace ' + Math.max(1, Math.round(-x.left)) + ' d';
    if (x.left < 1) return 'se acaba hoy, a las ' + hm(x.end);
    return 'quedan ' + Math.floor(x.left) + ' d · hasta el ' + new Date(x.end).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  }
  function kitDueHTML() {
    var due = kitItems().filter(function (x) { return x.left != null && x.left < 1.5; });
    if (!due.length) return '';
    return '<div class="note warn">' + due.map(function (x) { return '<div class="kv"><span><b>' + esc(x.name) + '</b> · ' + esc(leftText(x)) + '</span><button class="chip mini" data-act="kitnew" data-v="' + x.k + '">Nuevo hoy</button></div>'; }).join('') + '</div>';
  }
  function kitSettingsHTML() {
    return '<section class="card"><h2>Material: sensor y plumas</h2><p class="mut">Apunta el día que te pones un sensor o empiezas una pluma y te aviso antes de que se acabe. Las plumas: Fiasp y casi todas, 4 semanas abiertas; Tresiba y Toujeo, 8; Levemir, 6.</p>' +
      kitItems().map(function (x) { return '<div class="kv"><span>' + esc(x.name) + '<small style="display:block;color:var(--mut)">' + esc(leftText(x)) + '</small></span><button class="chip mini" data-act="kitnew" data-v="' + x.k + '">Nuevo hoy</button></div>'; }).join('') +
      sel('Días que dura tu sensor', 'kit.sensorDays', [['14', '14 días (Libre 2 y Libre 3)'], ['15', '15 días (Libre 3 Plus)'], ['10', '10 días']]) + '</section>';
  }
  /* Aviso la víspera a las 20:00 y 2 h antes para el sensor; la mañana del último día para las plumas. */
  function scheduleKit() {
    var it = kitItems(), ids = { sensorT: [7300, 7301], rapidT: [7310], basalT: [7311] };
    it.forEach(function (x) {
      var id = ids[x.k];
      if (!x.t) { id.forEach(function (i) { notifyAt(i, 0); }); return; }
      if (x.k === 'sensorT') {
        var eve = new Date(x.end - 864e5); eve.setHours(20, 0, 0, 0);
        notifyAt(7300, eve.getTime(), 'Mañana se acaba tu sensor', 'Se acaba mañana a las ' + hm(x.end) + '. Ten uno nuevo preparado.', 'kit');
        notifyAt(7301, x.end - 2 * 3600e3, 'Tu sensor se acaba en 2 horas', 'Cuando te pongas el nuevo, apúntalo en iocrino.', 'kit');
      } else {
        var mo = new Date(x.end); mo.setHours(10, 0, 0, 0); if (mo.getTime() > x.end) mo.setDate(mo.getDate() - 1);
        notifyAt(id[0], mo.getTime(), x.name + ': cámbiala hoy', 'Hoy cumple ' + x.days + ' días abierta. A partir de ahí puede perder eficacia.', 'kit');
      }
    });
  }

  // ---------- lectura en segundo plano, widget y aviso de dosis olvidada (nativo) ----------
  var NB = null;
  function nativeBg() { if (!native || !window.Capacitor || !Capacitor.registerPlugin) return null; if (!NB) { try { NB = Capacitor.registerPlugin('Iocrino'); } catch (e) { NB = null; } } return NB; }
  function lastRapidT() { var l = rapidLog().filter(function (e) { return e.u > 0; }).sort(function (a, b) { return b.t - a.t; })[0]; return l ? l.t : 0; }
  async function nativeSync() {
    var nb = nativeBg(); if (!nb) return;
    var cfg = { on: S.bg.on === '1' && libreOn(), persist: S.bg.persist === '1', missed: S.bg.missed === '1', low: S.bg.low === '1', email: S.libre.email, password: S.libre.password, version: S.libre.version || Libre.DEFAULT_VERSION,
      session: S.libre.session || null, lastRapid: lastRapidT(), missedOff: S.missedOff || 0, lo: num(S.cfg.rangeLow) || 70, hi: num(S.cfg.rangeHigh) || 180, hypo: num(S.cfg.hypo) || 70, alto: num(S.cfg.alto) || 250 };
    var last = gNow().v !== null && S.now.src === 'libre' ? { v: gNow().v, trend: +S.now.trend || 0, t: S.now.t } : null;
    var h6 = S.hist.filter(function (p) { return p[0] > Date.now() - 6 * 3600e3; });
    try { await nb.setData({ json: JSON.stringify(cfg), last: last ? JSON.stringify(last) : '', hist: JSON.stringify(h6) }); } catch (e) { /* versión sin parte nativa */ }
  }
  /* Recoge lo que se leyó con la app cerrada. */
  async function nativePull() {
    var nb = nativeBg(); if (!nb) return;
    try {
      var r = await nb.getData(), h = JSON.parse(r.hist || '[]'), ss = r.session ? JSON.parse(r.session) : null;
      if (h.length) { addHist(h); var l = h[h.length - 1]; if (!S.now.t || l[0] > S.now.t) S.now = { v: String(l[1]), trend: +r.trend || 0, t: l[0], src: 'libre' }; }
      if (ss && ss.token && (!S.libre.session || ss.token !== S.libre.session.token)) S.libre.session = ss;
      save();
      if (r.action) doAction(r.action);
    } catch (e) { /* nada */ }
  }
  /* Botones del widget grande y atajos del icono. */
  function doAction(a) {
    closeDlg();
    if (a === 'comida') { tab = 'comida'; render(); window.scrollTo(0, 0); }
    else if (a === 'lenta') { tab = 'ahora'; render(); if (basalDoneToday()) toast(basalName() + ' ya está apuntada hoy'); else quickBasalAsk(); }
    else if (a === 'bajo') { tab = 'ahora'; render(); hipoWhat = ''; dlgHipo(); }
  }
  async function bgTest() {
    var nb = nativeBg(); if (!nb) { toast('Solo en la app instalada'); return; }
    await nativeSync();
    try { await nb.runNow(); toast('Lectura en segundo plano lanzada. El widget se actualizará en unos segundos.'); } catch (e) { msgDlg('Segundo plano', 'Esta instalación no tiene la parte nativa: ' + (e && e.message || e)); }
  }
  function bgSettingsHTML() {
    return '<section class="card"><h2>Con la app cerrada</h2><p class="mut">Si lo activas, el móvil lee el Libre cada 15 minutos aproximadamente aunque no abras iocrino. Sirve para el <b>widget</b> de la pantalla de inicio y para los avisos de abajo. Android puede retrasarlo un poco con el ahorro de batería.</p>' +
      sel('Leer el Libre con la app cerrada', 'bg.on', [['0', 'No'], ['1', 'Sí']]) +
      sel('Avisar si parece que se te olvidó la rápida', 'bg.missed', [['1', 'Sí (sube mucho y no hay dosis apuntada)'], ['0', 'No']]) +
      sel('Avisar si bajas de tu límite de hipo', 'bg.low', [['0', 'No (ya avisa la app del Libre)'], ['1', 'Sí']]) +
      sel('Glucosa fija en las notificaciones', 'bg.persist', [['0', 'No'], ['1', 'Sí: en la pantalla de bloqueo y con el número arriba']]) +
      (libreOn() ? '' : '<p class="fine">Necesita el Libre conectado (correo y contraseña arriba).</p>') +
      (native ? '<div class="row" style="margin-top:10px"><button data-act="bgtest">Probar ahora</button></div>' : '') +
      '<details class="how"><summary>Poner el widget en la pantalla de inicio</summary><ol><li>Mantén pulsado un hueco vacío de la pantalla de inicio.</li><li>Toca <b>Widgets</b>.</li><li>Busca <b>iocrino</b> y arrastra «Glucosa» a la pantalla.</li></ol><p>Hay cinco: 1x1, 2x1, 2x1 con minigráfica, 1x2 vertical y 4x2 con gráfica y botones. Muestran la última glucosa, la flecha y la hora; tócalos para abrir la app.</p></details>' +
      '<details class="how"><summary>Ver la glucosa con el móvil bloqueado (Samsung)</summary><p>Los widgets de la pantalla de bloqueo de Samsung («Añadir widgets») solo admiten apps de Samsung. Tienes dos caminos:</p><ol>' +
      '<li><b>Glucosa fija</b> (arriba, «Sí»): sale como notificación en la pantalla de bloqueo y en la Always On Display, y con el número en la barra de estado. Se actualiza con cada lectura.</li>' +
      '<li><b>Good Lock → LockStar</b> (gratis, de Samsung, en Galaxy Store): permite poner cualquier widget en la pantalla de bloqueo, también los de iocrino.</li></ol>' +
      '<p>Para que la notificación se vea completa con el móvil bloqueado: Ajustes → Pantalla de bloqueo → Notificaciones → «Mostrar contenido».</p></details>' +
      '<details class="how"><summary>Si no lee con la app cerrada</summary><p>En Ajustes de Android → Aplicaciones → iocrino → Batería, elige <b>Sin restricciones</b>. En Samsung, quítala también de «Aplicaciones en suspensión».</p></details></section>';
  }

  // ---------- ánimo ----------
  var moodSel = 0, moodTags = [], breathTimer = null;
  var MOOD_SHARE = 'Tengo diabetes tipo 1. Cuando el azúcar me baja o me sube puedo estar irritable, triste, nervioso o muy cansado sin un motivo claro, y no es por ti.\n\nSi me notas raro, pregúntame con cariño: «¿miramos la glucosa?». Si estoy bajo, lo primero es tomar azúcar (zumo, azúcar o pastillas de glucosa); si no puedo tomar nada, llama al 112.\n\nGracias por estar ahí.';
  function moodToday() { var d0 = new Date(); d0.setHours(0, 0, 0, 0); return S.log.some(function (e) { return e.ins === 'animo' && e.t >= d0.getTime(); }); }
  function moodCardHTML() {
    if (moodToday() || S.coach.moodSkip === dayKey() || new Date().getHours() < 10) return '';
    return '<div class="moodc"><div class="mq">¿Cómo te sientes hoy?<button class="x" data-act="moodlater" aria-label="Hoy no">✕</button></div><div class="faces">' +
      Coach.MOODS.map(function (m) { return '<button class="face" data-act="mood" data-v="' + m[0] + '" aria-label="' + m[2] + '">' + m[1] + '</button>'; }).join('') + '</div></div>';
  }
  function dlgMood() {
    openDlg('<h3>¿Cómo te sientes?</h3><div class="faces" id="mf">' + Coach.MOODS.map(function (m) { return '<button class="face' + (m[0] === moodSel ? ' on' : '') + '" data-act="moodpick" data-v="' + m[0] + '"><span>' + m[1] + '</span><small>' + m[2] + '</small></button>'; }).join('') + '</div>' +
      '<label>¿Algo más? (opcional)</label><div class="chips">' + Coach.FEEL.map(function (f) { return '<button class="chip" data-act="moodtag" data-v="' + f + '">' + f + '</button>'; }).join('') + '</div>' +
      '<p class="fine">Se guarda con tu glucosa de ahora, solo en este móvil.</p><div class="acts"><button data-act="close">Cancelar</button><button class="pri" data-act="moodsave">Guardar</button></div>');
  }
  function saveMood() {
    if (!moodSel) { toast('Elige una cara'); return; }
    var x = gView(), g = x.g.v !== null && !x.old ? x.g.v : null;
    S.log.push({ t: Date.now(), ins: 'animo', carbs: 0, mood: moodSel, tags: moodTags.slice(), glucose: g });
    save();
    var r = Coach.moodReply({ mood: moodSel, g: g, lo: num(S.cfg.hypo) || 70, hi: num(S.cfg.rangeHigh) || 180, alto: num(S.cfg.alto) || 250, tags: moodTags });
    var stressy = moodSel <= 3 && (moodTags.indexOf('Estresado') >= 0 || moodTags.indexOf('Nervioso') >= 0 || moodSel <= 2) && !(g != null && g < (num(S.cfg.hypo) || 70));
    var low = g != null && g < (num(S.cfg.hypo) || 70);
    render();
    openDlg('<h3>' + Coach.moodFace(moodSel) + ' Apuntado</h3><div class="coach ' + r.tone + '"><span class="ci">' + ({ ok: '★', info: 'i', warn: '!', bad: '!' }[r.tone]) + '</span><span>' + esc(r.text) + '</span></div><div class="acts">' +
      (low ? '<button class="pri" data-act="hipo">Estoy bajo</button>' : stressy ? '<button data-act="breathe">Respirar 1 minuto</button>' : '') + '<button class="' + (low ? '' : 'pri') + '" data-act="close">Vale</button></div>');
    checkAch(false);
  }
  function moodStatsInner() {
    var m = Coach.moodStats(S.log, num(S.cfg.rangeLow) || 70, num(S.cfg.rangeHigh) || 180, Date.now(), 30);
    if (m.n < 5) return '<p class="fine">' + (m.n ? 'Llevas ' + m.n + ' de 5 notas de ánimo para ver tu relación con la glucosa.' : 'Con 5 notas de ánimo verás si tu humor va de la mano de la glucosa.') + '</p>';
    var row = function (lab, b, cls) { return b.n ? '<div class="kv"><span>' + lab + ' <small class="mut">(' + b.n + ')</small></span><b class="' + cls + '">' + Coach.moodFace(Math.round(b.avg)) + ' ' + fmt(b.avg, 1) + '</b></div>' : ''; };
    var txt = '';
    if (m.rango.n >= 2 && m.alto.n >= 2 && m.rango.avg - m.alto.avg >= 0.7) txt = 'Cuando estás alto te sueles sentir peor que en rango. Es el azúcar, no tú.';
    else if (m.rango.n >= 2 && m.bajo.n >= 1 && m.rango.avg - m.bajo.avg >= 0.7) txt = 'En las bajadas tu ánimo cae. Tratarlas pronto también te ayuda a sentirte mejor.';
    else if (m.rango.n >= 3) txt = 'Tu ánimo no parece depender mucho de la glucosa: también cuentan el sueño, el trabajo y la gente.';
    return '<div class="lab">Ánimo medio (1 a 5) según tu glucosa · 30 días</div>' + row('Bajo', m.bajo, 'lo') + row('En rango', m.rango, 'in') + row('Alto', m.alto, 'hi') +
      (txt ? '<p style="font-size:14px;margin:8px 0 0">' + txt + '</p>' : '') + (m.tags.length ? '<p class="fine">Lo que más apuntas: ' + esc(m.tags.slice(0, 3).map(function (t) { return t[0].toLowerCase(); }).join(', ')) + '.</p>' : '');
  }
  function moodStatsHTML() { return '<section class="card"><h2>Ánimo y glucosa</h2>' + moodStatsInner() + '<div class="row"><button data-act="mood">Apuntar cómo me siento</button></div></section>'; }
  /* Si llevas varios días sintiéndote mal, un mensaje con apoyo (como mucho cada 3 días en Ahora). */
  function supportHTML(always) {
    if (!Coach.lowStreak(S.log, Date.now())) return '';
    if (!always && S.coach.supportSeen && Date.now() - S.coach.supportSeen < 3 * 864e5) return '';
    return '<section class="card support"><h2>Llevas unos días regular</h2><p>Cansarse de la diabetes es muy común: le pasa a muchísima gente en algún momento y no es falta de voluntad. No tienes que poder con todo tú solo.</p><ul>' +
      '<li>Cuéntaselo a tu equipo de diabetes o a tu médico de cabecera: pueden ayudarte y derivarte a apoyo psicológico.</li>' +
      '<li>Habla con alguien de confianza, o con otras personas con diabetes (las asociaciones de tu zona tienen grupos).</li>' +
      '<li>Afloja el listón unos días: céntrate en lo básico (la lenta, la rápida con las comidas) y deja lo demás.</li></ul>' +
      '<p class="fine">Si alguna vez lo pasas muy mal o piensas en hacerte daño, llama al <b>024</b> (gratis y a cualquier hora). En una urgencia, el 112.</p>' +
      (always ? '' : '<div class="row"><button data-act="supportok">Gracias</button></div>') + '</section>';
  }
  function dlgBreathe() {
    clearInterval(breathTimer);
    openDlg('<h3>Respira conmigo</h3><div class="breath"><div class="bcirc"></div><div class="btxt" id="btxt">Coge aire…</div></div><p class="mut" style="text-align:center" id="bleft">60 s</p><div class="acts"><button class="pri" data-act="close">Terminar</button></div>');
    var t0 = Date.now();
    breathTimer = setInterval(function () {
      var el = $('#btxt'); if (!el || !dlg.open) { clearInterval(breathTimer); return; }
      var s2 = (Date.now() - t0) / 1000, left = Math.max(0, 60 - Math.floor(s2));
      el.textContent = left <= 0 ? '¡Muy bien!' : (Math.floor(s2 / 4) % 2 ? 'Suelta despacio…' : 'Coge aire…');
      $('#bleft').textContent = left > 0 ? left + ' s' : 'Hecho. ¿Mejor?';
      if (left <= 0) clearInterval(breathTimer);
    }, 250);
  }
  function extraLeft() { return S.coach.extraDate === dayKey() ? Math.max(0, 3 - (S.coach.extraN || 0)) : 3; }

  // ---------- ánimos, trucos y logros ----------
  function dayKey(t) { var d = new Date(t || Date.now()); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  function histPairs() { return S.hist; }
  function coachStats() { return Coach.stats({ hist: histPairs(), now: Date.now(), lo: num(S.cfg.rangeLow) || 70, hi: num(S.cfg.rangeHigh) || 180 }); }
  function mealsCount() { return S.log.filter(function (e) { return e.ins !== 'basal' && e.ins !== 'hipo' && e.carbs > 0; }).length; }
  function basalStreak() {
    var days = {}, n = 0, d = new Date(); d.setHours(0, 0, 0, 0);
    S.log.forEach(function (e) { if (e.ins === 'basal') days[dayKey(e.t)] = 1; });
    if (!days[dayKey(d.getTime())]) d.setDate(d.getDate() - 1);
    while (days[dayKey(d.getTime())] && n < 400) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }
  function tipCtx() {
    var now = Date.now(), lo = num(S.cfg.hypo) || 70, hi = num(S.cfg.rangeHigh) || 180;
    var recentLow = S.log.some(function (e) { return e.ins === 'hipo' && now - e.t < 7 * 864e5; }) || S.hist.some(function (p) { return now - p[0] < 3 * 864e5 && p[1] < lo; });
    var highAfter = S.log.filter(function (e) { return e.post && !e.post.none && now - e.t < 14 * 864e5 && e.post.g2 > hi; }).length >= 2;
    var lm = S.log.filter(function (e) { return e.ins === 'animo' && now - e.t < 2 * 864e5; }).sort(function (a, b) { return b.t - a.t; })[0];
    return { lowMood: !!(lm && lm.mood <= 2), rapid: S.cfg.rapid, basal: S.cfg.basal, recentLow: recentLow, highAfterMeals: highAfter, meals: mealsCount(), plates: S.plates.length };
  }
  function unlockTip(why) {
    var t = Coach.nextTip(S.coach.unlocked, tipCtx()); if (!t) return null;
    S.coach.unlocked.push(t.id); S.coach.tipId = t.id; S.coach.newTip = 1; save();
    if (why) toast('💡 ' + why + ': ' + (t.k === 'Curiosidad' ? 'nueva curiosidad' : 'nuevo truco') + ' en Aprende');
    return t;
  }
  /* Cada día que abres la app se desbloquea un truco o curiosidad nuevo. */
  function coachDaily() {
    var k = dayKey();
    if (S.coach.used.indexOf(k) < 0) { S.coach.used.push(k); if (S.coach.used.length > 400) S.coach.used = S.coach.used.slice(-400); }
    if (S.coach.tipDate !== k) { S.coach.tipDate = k; unlockTip(''); }
    save(); checkAch(true);
  }
  function achState() { return { moods: S.log.filter(function (e) { return e.ins === 'animo'; }).length, meals: mealsCount(), plates: S.plates.length, daysUsed: S.coach.used.length, basalStreak: basalStreak(), stats: coachStats(), reportShared: S.coach.reportShared }; }
  /* Avisa de los logros nuevos (la primera vez solo los marca, sin felicitar por lo que ya había). */
  function checkAch(quiet) {
    var got = Coach.achievements(achState()).filter(function (a) { return a.ok && S.coach.ach.indexOf(a.id) < 0; });
    if (!got.length) return;
    var first = !S.coach.achInit;
    got.forEach(function (a) { S.coach.ach.push(a.id); });
    S.coach.achInit = 1; save();
    if (!first || !quiet) { var a = got[got.length - 1]; setTimeout(function () { toast('🏅 Logro: ' + a.t); }, 400); if (!quiet) unlockTip(''); }
  }
  function ateRecently() { return S.log.some(function (e) { return e.carbs > 0 && Date.now() - e.t < 2 * 3600e3; }); }
  function coachMsg(x) { return Coach.message({ g: x.g.v, trend: +S.now.trend || 0, old: x.old, stats: coachStats(), ateRecently: ateRecently(), now: Date.now() }); }
  function coachHTML(x) {
    var m = coachMsg(x);
    return '<div class="coach ' + m.tone + '"><span class="ci">' + ({ ok: '★', info: 'i', warn: '!', bad: '!' }[m.tone] || 'i') + '</span><span>' + esc(m.text) + '</span></div>';
  }
  function tipHTML() {
    var t = S.coach.tipId ? Coach.tip(S.coach.tipId) : null;
    return t ? '<button class="tipline" data-act="goto" data-v="aprende"><span class="tk">' + (S.coach.newTip ? 'Nuevo · ' : '') + esc(t.k) + ' del día</span><span class="tx">' + esc(t.x) + '</span></button>' : '';
  }
  var WATCH = '<details class="how"><summary>Ver la glucosa en tu Galaxy Watch</summary><p>iocrino no puede pintar en la esfera del reloj, pero hay una app gratuita que lo hace muy bien leyendo de LibreLinkUp: <b>GlucoDataHandler</b>.</p><ol>' +
    '<li>En el móvil, instala <b>GlucoDataHandler</b> desde Google Play.</li>' +
    '<li>Ábrela y en <b>Fuentes</b> activa <b>LibreLinkUp</b> con el mismo correo y contraseña que usas en iocrino.</li>' +
    '<li>En el reloj, abre Play Store, busca <b>GlucoDataHandler</b> e instálala (se empareja sola con la del móvil).</li>' +
    '<li>En el reloj, mantén pulsada la esfera → <b>Personalizar</b> → toca un hueco de complicación y elige <b>GlucoDataHandler</b> (glucosa, flecha o glucosa + hora).</li>' +
    '<li>Si quieres, activa en GlucoDataHandler las alarmas de bajada y subida: vibran en la muñeca.</li></ol>' +
    '<p>Funciona en los Galaxy Watch con Wear OS (Watch4 y posteriores). Los modelos antiguos con Tizen (Watch3, Active2 y anteriores) no son compatibles.</p>' +
    '<p>Además, los avisos de iocrino (la lenta, «vuelve a mirar en 15 minutos») ya te llegan al reloj solos si tienes activadas las notificaciones del móvil en la app Galaxy Wearable.</p></details>';
  function vLearn() {
    var x = gView(), st = coachStats(), m = coachMsg(x), h = '';
    S.coach.newTip = 0; save();
    h += '<div class="coach big ' + m.tone + '"><span class="ci">' + ({ ok: '★', info: 'i', warn: '!', bad: '!' }[m.tone] || 'i') + '</span><span>' + esc(m.text) + '</span></div>';
    h += '<section class="card"><h2>Tu día y tu semana</h2>' + (st.today.n >= 4 ? Coach.donut(st.today.tir, 'Hoy') : '<p class="mut">Cuando haya lecturas del Libre de hoy verás aquí tu tiempo en rango.</p>') +
      (st.week.some(function (d) { return d.tir != null; }) ? '<div class="lab">Últimos 7 días · % en rango</div>' + Coach.weekBars(st.week) : '') +
      (st.streak ? '<p class="fine">Racha: ' + st.streak + (st.streak === 1 ? ' día' : ' días') + ' seguidos por encima del 70 %.</p>' : '') + '</section>';
    var t = S.coach.tipId ? Coach.tip(S.coach.tipId) : null;
    if (t) h += '<section class="card"><h2>' + esc(t.k) + ' del día</h2><p style="margin:0;font-size:16px;line-height:1.5">' + esc(t.x) + '</p><p class="fine">Cada día que abres iocrino se desbloquea uno nuevo. Llevas ' + S.coach.unlocked.length + ' de ' + Coach.TIPS.length + '.</p>' + (extraLeft() > 0 && S.coach.unlocked.length < Coach.TIPS.length ? '<button data-act="tipmore">Descubrir otro (' + extraLeft() + ' hoy)</button>' : '') + '</section>';
    h += '<section class="card"><h2>Tu ánimo</h2><p class="mut" style="margin-top:0">Las subidas y bajadas de azúcar también mueven el humor: una bajada puede traer tristeza o nervios de golpe, y estar alto, cansancio e irritabilidad. Apuntarlo ayuda a separar lo que es azúcar de lo que no.</p>' +
      '<div class="ways3"><button data-act="mood">' + ICON.smile + 'Cómo me siento</button><button data-act="breathe">' + ICON.wind + 'Respirar 1 min</button><button data-act="moodshare">' + ICON.share + 'Explicárselo a los míos</button></div>' + moodStatsInner() + '</section>';
    h += supportHTML(true);
    h += '<button class="big" data-act="guide">Guía fácil: cómo funciona todo esto</button>';
    h += '<section class="card"><h2>Infografías</h2><div class="igl">' + Coach.infographics().map(function (g) { return '<button data-act="ig" data-v="' + g.id + '">' + esc(g.t) + '</button>'; }).join('') + '</div></section>';
    var tips = S.coach.unlocked.map(Coach.tip).filter(Boolean).reverse();
    h += '<section class="card"><h2>Trucos y curiosidades · ' + tips.length + ' de ' + Coach.TIPS.length + '</h2>' +
      (tips.length ? tips.map(function (q) { return '<div class="tipi"><span class="tk">' + esc(q.k) + '</span>' + esc(q.x) + '</div>'; }).join('') : '<p class="mut">Aún ninguno.</p>') +
      (tips.length < Coach.TIPS.length ? '<p class="fine">Siguen saliendo con el uso: uno cada día, y otro extra con cada logro.</p>' : '') + '</section>';
    var ach = Coach.achievements(achState());
    h += '<section class="card"><h2>Logros · ' + ach.filter(function (a) { return a.ok; }).length + ' de ' + ach.length + '</h2><div class="achs">' +
      ach.map(function (a) { return '<div class="ach' + (a.ok ? ' ok' : '') + '"><span class="am">' + (a.ok ? '🏅' : '○') + '</span><b>' + esc(a.t) + '</b><small>' + esc(a.d) + '</small></div>'; }).join('') + '</div></section>';
    h += '<section class="card"><h2>En tu reloj</h2>' + WATCH + '</section>';
    h += '<p class="fine" style="text-align:center">Consejos generales para animarte. No sustituyen lo que te diga tu equipo de diabetes.</p>';
    view.innerHTML = h;
  }
  function dlgIg(id) {
    var g = id === 'hoy' ? null : Coach.infographic(id); if (!g) return;
    openDlg('<h3>' + esc(g.t) + '</h3>' + g.svg + '<p class="mut" style="font-size:14px">' + esc(g.c) + '</p><div class="acts"><button class="pri" data-act="close">Vale</button></div>');
  }

  // ---------- render y eventos ----------
  function render() {
    Array.prototype.forEach.call(document.querySelectorAll('#nav button'), function (b) { b.classList.toggle('on', b.dataset.tab === tab); });
    if (tab === 'ahora') vNow(); else if (tab === 'comida') vMeal(); else if (tab === 'registro') vLog(); else if (tab === 'aprende') vLearn(); else vSettings();
    if (tab !== 'comida') renderSum();
  }

  document.addEventListener('input', function (e) {
    var t = e.target; if (!t.dataset) return;
    if (t.dataset.s === 'cfg.ratioAll') { S.cfg.ratioAll = t.value.trim(); SLOTS.forEach(function (x) { S.cfg.ratios[x[0]] = S.cfg.ratioAll; }); save(); return; }
    if (t.dataset.s) {
      setPath(t.dataset.s, t.value.trim ? t.value.trim() : t.value);
      if (t.dataset.s.indexOf('libre.') === 0) S.libre.session = null;
      save();
      if (/^cfg\.(basal|basalDose|basalTime|basalRemind)$/.test(t.dataset.s)) scheduleBasal();
      if (/^(bg\.|libre\.(email|password)|cfg\.(rangeLow|rangeHigh|hypo))/.test(t.dataset.s)) nativeSync();
      if (t.dataset.s === 'bg.persist' && S.bg.persist === '1') { var np = notifPlugin(); if (np) np.requestPermissions().catch(function () {}); if (S.bg.on !== '1') toast('Activa también «Leer el Libre con la app cerrada» para que se actualice sola'); }
      if (t.dataset.s === 'kit.sensorDays') scheduleKit();
      if (t.dataset.s === 'ai.provider') { if (wzOpen) renderWz(); else { var y = window.scrollY; render(); window.scrollTo(0, y); } }
      return;
    }
    var f = t.dataset.f; if (!f) return;
    if (f === 'grams' || f === 'hcDirect') { var it = S.meal.items[+t.dataset.i]; if (it) { it[f] = t.value; delete it.pre; save(); renderRes(); } }
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
        if (f) addFood({ name: f.name, hc100: f.hc100, unit: f.unit || 'g', portion: null });
        else if (base) addFood({ name: base[0], hc100: base[1], unit: base[4] || 'g', portion: base[3] || null });
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
        addHist([[S.now.t, Math.round(gv)]]);
        save(); closeDlg(); render(); break;
      }
      case 'barcode': dlgBarcode(); break;
      case 'bcfind': stopScan(); findCode(); break;
      case 'bcscan': startScan(); break;
      case 'bcadd': if (bcProduct && bcProduct.hc100 !== null) { if (!S.custom.some(function (x) { return x.code === bcProduct.code; })) S.custom.push({ name: bcProduct.name, hc100: bcProduct.hc100, code: bcProduct.code }); addItem({ name: bcProduct.name, hc100: bcProduct.hc100, grams: '' }); } break;
      case 'bcnew': dlgNewFood(bcProduct && bcProduct.name || '', '', bcProduct && bcProduct.code || ''); break;
      case 'photo': dlgPhoto(); break;
      case 'describe': dlgDescribe(); break;
      case 'describego': { var dt = ($('#dtext') || {}).value || ''; if (!dt.trim()) { toast('Escribe qué vas a comer'); break; } analyzeText(dt.trim()); break; }
      case 'portion': { var pi = S.meal.items[i]; if (pi && pi.portion) { pi.grams = String(pi.portion); save(); render(); } break; }
      case 'photocam': $('#cam').click(); break;
      case 'photogal': $('#gal').click(); break;
      case 'photoadd':
        if (estimate) { tab = 'comida'; estimate.items.forEach(function (it) { S.meal.items.push({ name: it.name, hc100: it.hc100, grams: String(it.grams), est: true }); }); estimate = null; save(); closeDlg(); tab = 'comida'; render(); toast('Añadido: revisa las cantidades'); }
        break;
      case 'useplate': usePlate(i); break;
      case 'saveplate': openDlg('<h3>Guardar como plato</h3><label>Nombre del plato</label><input id="pn" placeholder="Desayuno de diario…"><div class="acts"><button data-act="close">Cancelar</button><button class="pri" data-act="platesave">Guardar</button></div>'); break;
      case 'platesave': { var pn = $('#pn').value.trim(); if (!pn) { toast('Ponle un nombre'); break; } S.plates.push({ name: pn, items: JSON.parse(JSON.stringify(S.meal.items)) }); save(); closeDlg(); render(); toast('Plato guardado'); checkAch(false); break; }
      case 'delplate': confirmDlg('¿Borrar el plato «' + S.plates[i].name + '»?', function () { S.plates.splice(i, 1); save(); render(); }); break;
      case 'log': {
        var c = compute();
        openDlg('<h3>Registrar</h3><p class="mut">' + fmt(c.carbs, 1) + ' g de hidratos' + (c.r.ok ? ' · sugerencia ' + fu(c.r.total) : '') + '</p><label>Unidades de ' + esc(rapidName()) + ' que te has puesto de verdad</label><input id="ru" inputmode="decimal" value="' + (c.r.ok ? fmt(c.r.total, 2) : '') + '"><div class="acts"><button data-act="close">Cancelar</button><button class="pri" data-act="logsave">Guardar</button></div>');
        break;
      }
      case 'logsave': {
        var u = num($('#ru').value); if (u === null) u = 0;
        if (u < 0 || u > 100) { toast('Revisa las unidades'); break; }
        var cc = compute(), iob0 = activeInsulin();
        S.log.push({ t: Date.now(), ins: 'rapida', iob: Math.round(iob0 * 100) / 100, slot: cc.slot, carbs: Math.round(cc.carbs * 10) / 10, glucose: cc.g.v, trend: +S.now.trend || 0, sug: cc.r.ok ? cc.r.total : null, u: u, items: S.meal.items.map(function (x) { return x.name; }).join(', ') });
        if (isFatty()) { S.log[S.log.length - 1].fat = true; notifyAt(7200, Date.now() + 3 * 3600e3, 'Mira tu glucosa', 'Han pasado 3 horas de una comida con mucha grasa. Es cuando suele subir.', 'fat'); }
        remember(S.meal.items);
        S.meal = { items: [], slot: '' }; save(); nativeSync(); closeDlg(); tab = 'ahora'; render(); window.scrollTo(0, 0); toast('Registrado'); checkAch(false); break;
      }
      case 'basalquick': quickBasal(false); break;
      case 'basal': {
        var lb = S.log.filter(function (e) { return e.ins === 'basal'; }).sort(function (a, b) { return b.t - a.t; })[0];
        openDlg('<h3>Apuntar ' + esc(basalName()) + '</h3><label>Unidades</label><input id="bu" inputmode="decimal" value="' + (lb ? fmt(lb.u, 1) : '') + '">' +
          (lb ? '<p class="fine">La última vez: ' + fu(lb.u) + ', ' + agoText(lb.t) + '.</p>' : '') + '<div class="acts"><button data-act="close">Cancelar</button><button class="pri" data-act="basalsave">Guardar</button></div>');
        var bu = $('#bu'); if (bu) { bu.focus(); bu.select(); }
        break;
      }
      case 'basalsave': {
        var bv = num($('#bu').value);
        if (!(bv > 0) || bv > 200) { toast('Revisa las unidades'); break; }
        logBasal(bv); closeDlg(); break;
      }
      case 'guide': dlgGuide(); break;
      case 'ig': dlgIg(b.dataset.v); break;
      case 'tipmore': if (extraLeft() > 0) { S.coach.extraDate = dayKey(); S.coach.extraN = (S.coach.extraDate === dayKey() ? (S.coach.extraN || 0) : 0) + 1; unlockTip(''); S.coach.newTip = 0; save(); render(); } break;
      case 'mood': moodSel = +b.dataset.v || 0; moodTags = []; dlgMood(); break;
      case 'moodpick': moodSel = +b.dataset.v; Array.prototype.forEach.call(document.querySelectorAll('#mf .face'), function (c) { c.classList.toggle('on', c === b); }); break;
      case 'moodtag': { var tg = b.dataset.v, ix = moodTags.indexOf(tg); if (ix < 0) moodTags.push(tg); else moodTags.splice(ix, 1); b.classList.toggle('on', ix < 0); break; }
      case 'moodsave': saveMood(); break;
      case 'moodlater': S.coach.moodSkip = dayKey(); save(); render(); break;
      case 'breathe': dlgBreathe(); break;
      case 'moodshare': shareText('Mi diabetes y mi humor', MOOD_SHARE); break;
      case 'supportok': S.coach.supportSeen = Date.now(); save(); render(); break;
      case 'logseg': logSeg = b.dataset.v; render(); window.scrollTo(0, 0); break;
      case 'logmore': logDays += 7; render(); break;
      case 'fat': S.meal.fat = S.meal.fat === '1' ? '0' : '1'; save(); renderRes(); break;
      case 'kitnew': { var kk = b.dataset.v; confirmDlg(KIT_Q[kk], function () { S.kit[kk] = Date.now(); save(); scheduleKit(); render(); toast('Apuntado'); }); break; }
      case 'exercise': dlgExercise(); break;
      case 'exwhat': case 'exlevel': Array.prototype.forEach.call(b.parentNode.querySelectorAll('.chip'), function (c) { c.classList.toggle('on', c === b); }); break;
      case 'exsave': {
        var mn = num($('#exm').value); if (!(mn > 0) || mn > 600) { toast('Pon los minutos'); break; }
        var ago = num($('#exa').value) || 0;
        S.log.push({ t: Date.now() - Math.max(0, ago) * 60000, ins: 'ejercicio', carbs: 0, what: ($('#exw .chip.on') || {}).textContent || 'Ejercicio', level: ($('#exl .chip.on') || {}).textContent || 'Moderado', min: Math.round(mn) });
        save(); closeDlg(); render(); toast('Ejercicio apuntado');
        if (mn >= 45 || ($('#exl .chip.on') || {}).textContent === 'Intenso') msgDlg('Buen trabajo', 'Después de un ejercicio largo o intenso la glucosa puede bajar horas después, también de noche. Mira tu glucosa antes de dormir y ten azúcar a mano.');
        break;
      }
      case 'bgtest': bgTest(); break;
      case 'ratioapply': {
        var sl = b.dataset.slot, R = Learn.ratios(S.log, { now: Date.now(), days: 30, mode: S.cfg.ratioMode, ratios: S.cfg.ratios, isf: S.cfg.isf, dia: S.cfg.dia, low: num(S.cfg.hypo) || 70, changes: S.cfg.ratioLog || [] })[sl];
        if (!R || !R.newVal) break;
        var nv = String(R.newVal).replace('.', ',');
        confirmDlg('Cambiar el ratio de ' + slotName(sl).toLowerCase() + ' de ' + uprText(R.cur) + ' a ' + uprText(R.newUpr) + ' (' + (R.newUpr > R.cur ? 'un 10 % más' : 'un 10 % menos') + ' de insulina). Si tu equipo no te ha dicho que puedes ajustarlo tú, coméntaselo antes. Después vigila las próximas comidas de esa franja; si bajas de 70, puedes deshacerlo desde aquí.', function () {
          S.cfg.ratioLog = (S.cfg.ratioLog || []).concat([{ t: Date.now(), slot: sl, from: S.cfg.ratios[sl], to: nv }]);
          S.cfg.ratios[sl] = nv; S.cfg.sameRatio = '0';
          save(); render(); toast('Ratio de ' + slotName(sl).toLowerCase() + ' cambiado');
        });
        break;
      }
      case 'ratioundo': {
        var lc = (S.cfg.ratioLog || []).slice(-1)[0]; if (!lc) break;
        confirmDlg('Volver el ratio de ' + slotName(lc.slot).toLowerCase() + ' a ' + lc.from + '?', function () { S.cfg.ratios[lc.slot] = lc.from; S.cfg.ratioLog = S.cfg.ratioLog.slice(0, -1); save(); render(); toast('Cambio deshecho'); });
        break;
      }
      case 'recent': { var rc = S.recent[i]; if (rc) addFood(rc); break; }
      case 'wizard': wz = 0; renderWz(); break;
      case 'wzset': { setPath(b.dataset.p, b.dataset.v); if (b.dataset.p === 'cfg.sameRatio' && b.dataset.v === '1' && S.cfg.ratioAll) SLOTS.forEach(function (x) { S.cfg.ratios[x[0]] = S.cfg.ratioAll; }); save(); renderWz(); break; }
      case 'wznext': if (wz >= WZ.length - 1) { S.cfg.setup = 'ok'; save(); closeDlg(); render(); toast('Listo'); } else { wz++; renderWz(); } break;
      case 'wzback': if (wz > 0) { wz--; renderWz(); } break;
      case 'wzlater': S.cfg.setup = S.cfg.setup || 'later'; save(); closeDlg(); render(); break;
      case 'dellog': confirmDlg('¿Borrar este registro? Dejará de contar como insulina activa.', function () { S.log = S.log.filter(function (x) { return String(x.t) !== b.dataset.t; }); save(); render(); }); break;
      case 'csv': copyText(csv(), 'Registro copiado'); break;
      case 'delcustom': confirmDlg('¿Borrar «' + S.custom[i].name + '» de tus alimentos?', function () { S.custom.splice(i, 1); save(); render(); }); break;
      case 'backup': copyText(backupData(), 'Copia de seguridad copiada (sin contraseñas ni claves)'); break;
      case 'bkshare': shareFile('iocrino-copia-' + today() + '.json', backupData(), 'Copia de seguridad de iocrino'); break;
      case 'bkfile': $('#rfile').click(); break;
      case 'bknas': nasBackup(false); break;
      case 'bknasrestore': nasRestore(); break;
      case 'report': repDays = 14; dlgReport(); break;
      case 'repdays': repDays = +b.dataset.v; dlgReport(); break;
      case 'repshare': S.coach.reportShared = 1; save(); checkAch(false); shareText('Informe de iocrino', Report.text(Report.build({ hist: S.hist, log: S.log, cfg: S.cfg, now: Date.now(), days: repDays }), 'iocrino')); break;
      case 'repcsv': shareFile('iocrino-registro-' + today() + '.csv', csv(), 'Registro de iocrino'); break;
      case 'dose': dlgDose(); break;
      case 'dosekind': Array.prototype.forEach.call(document.querySelectorAll('#dk .chip'), function (c) { c.classList.toggle('on', c === b); }); break;
      case 'dosesave': {
        var dv = num($('#du').value); if (!(dv > 0) || dv > 100) { toast('Revisa las unidades'); break; }
        var kind = ($('#dk .chip.on') || {}).dataset ? $('#dk .chip.on').dataset.v : 'correccion';
        S.log.push({ t: Date.now(), ins: 'rapida', u: dv, carbs: 0, kind: kind, slot: curSlot(), glucose: gNow().v, iob: Math.round(activeInsulin() * 100) / 100 });
        S.missedOff = 0; save(); nativeSync(); closeDlg(); render(); toast(rapidName() + ' apuntada'); break;
      }
      case 'missedoff': S.missedOff = Date.now(); save(); render(); break;
      case 'hipo': hipoWhat = ''; dlgHipo(); break;
      case 'hipowhat': {
        var o = HIPO_OPTS[i]; hipoWhat = o[0];
        Array.prototype.forEach.call(document.querySelectorAll('#hw .chip'), function (c) { c.classList.toggle('on', c === b); });
        if (o[1]) $('#hgr').value = o[1];
        break;
      }
      case 'hiposave': {
        var hv = num($('#hg').value), hgr = num($('#hgr').value), t9 = Date.now();
        S.log.push({ t: t9, ins: 'hipo', carbs: 0, glucose: hv > 0 ? Math.round(hv) : null, treat: hgr > 0 ? hgr : null, what: hipoWhat || null });
        if (hv > 0) addHist([[t9, Math.round(hv)]]);
        S.hipoCheck = t9 + 15 * 60000; save(); closeDlg(); tab = 'ahora'; render(); scheduleHipo(S.hipoCheck);
        toast('Apuntada. Te aviso en 15 minutos'); break;
      }
      case 'hipook': S.hipoCheck = 0; save(); scheduleHipo(0); render(); break;
      case 'restore': openDlg('<h3>Restaurar copia</h3><p class="mut">Pega aquí el texto de una copia de seguridad. Sustituye a los datos actuales.</p><textarea id="rs" rows="6"></textarea><div class="acts"><button data-act="close">Cancelar</button><button class="pri" data-act="restoredo">Restaurar</button></div>'); break;
      case 'restoredo': {
        try { restoreFrom(JSON.parse($('#rs').value)); closeDlg(); toast('Copia restaurada'); }
        catch (err) { toast('Ese texto no es una copia válida'); }
        break;
      }
      case 'libre': readLibre(false); break;
      case 'librestep': if (libreStep) dlgStep(); else readLibre(false); break;
      case 'libreaccept': acceptLibreStep(); break;
      case 'libretest': readLibre(false); break;
    }
  });

  document.addEventListener('toggle', function (e) { var d = e.target; if (d && d.dataset && d.dataset.sec) openSecs[d.dataset.sec] = d.open; }, true);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target && e.target.id === 'gi') { e.preventDefault(); var b = $('[data-act="gsave"]'); if (b) b.click(); }
  });
  ['cam', 'gal'].forEach(function (id) {
    var inp = $('#' + id); if (!inp) return;
    inp.addEventListener('change', function () { var f = inp.files && inp.files[0]; inp.value = ''; if (f) analyzePhoto(f); });
  });
  dlg.addEventListener('close', function () { stopScan(); wzOpen = false; });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { coachDaily(); nativePull().then(nativeSync); autoLibre(); refreshGlucoseUI(); scheduleBasal(); autoBackup(); if (tab === 'ahora' && !dlg.open) render(); } });
  setInterval(function () { if (document.hidden) return; autoLibre(); refreshGlucoseUI(); }, 30000);

  coachDaily();
  render();
  nativePull().then(function () { nativeSync(); if (tab === 'ahora' && !dlg.open) render(); });
  scheduleKit();
  if (!S.cfg.setup && !configured()) { wz = 0; renderWz(); }
  initNotifications();
  autoBackup();
  var rf = $('#rfile');
  if (rf) rf.addEventListener('change', function () {
    var f = rf.files && rf.files[0]; rf.value = ''; if (!f) return;
    var rd = new FileReader();
    rd.onload = function () {
      try { var j = JSON.parse(rd.result); confirmDlg('Restaurar la copia' + (j.saved ? ' del ' + new Date(j.saved).toLocaleString('es-ES') : '') + '? Sustituye a los datos actuales.', function () { restoreFrom(j); toast('Copia restaurada'); }); }
      catch (e) { msgDlg('No se pudo restaurar', 'Ese archivo no es una copia de iocrino.'); }
    };
    rd.readAsText(f);
  });
  autoLibre();
  window.__raciones = { state: function () { return S; }, missedDose: missedDose, nasBackup: nasBackup, addHist: addHist, showEstimate: showEstimate, version: VERSION, render: render, doAction: function (a) { doAction(a); }, coachDaily: coachDaily, checkAch: checkAch };
})();
