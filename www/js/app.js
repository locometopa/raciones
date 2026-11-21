(function () {
  'use strict';
  var KEY = 'raciones.v1';
  var SLOTS = [['desayuno', 'Desayuno'], ['comida', 'Comida'], ['merienda', 'Merienda'], ['cena', 'Cena']];
  var TREND = { 0: ['', 'Sin flecha'], 1: ['↓', 'Bajando rápido'], 2: ['↘', 'Bajando'], 3: ['→', 'Estable'], 4: ['↗', 'Subiendo'], 5: ['↑', 'Subiendo rápido'] };
  var STALE_MS = 15 * 60000;
  var native = !!(window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform());
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var view = $('#view'), dlg = $('#dlg');
  var num = Calc.num;
  var tab = 'comida';
  var pending = null;      // acción pendiente de confirmar
  var bcProduct = null;    // producto encontrado por código
  var estimate = null;     // propuesta de la IA pendiente de aceptar
  var stream = null, scanTimer = null, lastLibreTry = 0;

  // ---------- estado ----------
  function defaults() {
    return {
      cfg: { ratioMode: 'r', ratios: { desayuno: '', comida: '', merienda: '', cena: '' }, isf: '', target: '', dia: '', iobMode: 'total', step: '1', maxBolus: '', hypo: '70' },
      libre: { email: '', password: '', version: Libre.DEFAULT_VERSION, session: null },
      ai: { on: '0', key: '', model: Vision.DEFAULT_MODEL },
      custom: [], plates: [], log: [],
      meal: { items: [], glucose: '', trend: 0, gt: null, gsrc: '', slot: '' }
    };
  }
  function merge(d, j) {
    if (!j || typeof j !== 'object') return d;
    var ratios = Object.assign({}, d.cfg.ratios, j.cfg && j.cfg.ratios);
    ['cfg', 'libre', 'ai', 'meal'].forEach(function (k) { if (j[k] && typeof j[k] === 'object') Object.assign(d[k], j[k]); });
    d.cfg.ratios = ratios;
    ['custom', 'plates', 'log'].forEach(function (k) { if (Array.isArray(j[k])) d[k] = j[k]; });
    if (!Array.isArray(d.meal.items)) d.meal.items = [];
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

  // ---------- cálculo ----------
  function glucoseValue() {
    var g = num(S.meal.glucose);
    if (g === null) return { v: null, bad: false };
    if (g < 20 || g > 600) return { v: null, bad: true };
    return { v: g, bad: false };
  }
  function activeInsulin() { return Calc.iob(S.log, Date.now(), S.cfg.dia); }
  function compute() {
    var slot = curSlot(), g = glucoseValue();
    var carbs = Calc.mealCarbs(S.meal.items);
    var gpu = Calc.gramsPerUnit(S.cfg.ratioMode, S.cfg.ratios[slot]);
    var r = Calc.bolus({ carbs: carbs, glucose: g.v, gPerU: gpu, isf: S.cfg.isf, target: S.cfg.target, iob: activeInsulin(), iobMode: S.cfg.iobMode, step: S.cfg.step, maxBolus: S.cfg.maxBolus, hypo: S.cfg.hypo });
    return { slot: slot, carbs: carbs, gpu: gpu, g: g, r: r };
  }

  // ---------- vista: comida ----------
  function vMeal() {
    var m = S.meal, slot = curSlot(), h = '';
    h += '<section class="card"><h2>Glucosa ahora</h2><div class="row">' +
      '<input class="big" inputmode="numeric" placeholder="—" value="' + esc(m.glucose) + '" data-f="glucose" aria-label="Glucosa en mg/dL">' +
      '<span class="mut">mg/dL</span><select class="grow" data-f="trend" aria-label="Flecha de tendencia">' +
      Object.keys(TREND).map(function (k) { return '<option value="' + k + '"' + (+k === +m.trend ? ' selected' : '') + '>' + TREND[k][0] + ' ' + TREND[k][1] + '</option>'; }).join('') +
      '</select></div><div class="row" style="margin-top:8px">' +
      (native ? '<button data-act="libre" id="blibre">Leer del Libre</button>' : '') +
      '<span class="mut" id="gage"></span></div>' +
      (native ? '' : '<p class="fine">La lectura automática del Libre solo funciona en la app instalada en el móvil. Aquí escribe la glucosa a mano.</p>') +
      '</section>';
    h += '<section class="card"><h2>Franja (elige el ratio)</h2><div class="chips">' +
      SLOTS.map(function (s) { return '<button class="chip' + (s[0] === slot ? ' on' : '') + '" data-act="slot" data-v="' + s[0] + '">' + s[1] + '</button>'; }).join('') + '</div></section>';
    h += '<section class="card"><h2>Qué vas a comer</h2><div id="items">';
    if (!m.items.length) h += '<p class="mut">Añade alimentos, un código de barras o uno de tus platos.</p>';
    m.items.forEach(function (it, i) {
      var direct = it.hcDirect !== undefined && it.hcDirect !== null;
      h += '<div class="item"><div class="nm"><b>' + esc(it.name) + '</b><small>' +
        (direct ? 'hidratos puestos a mano' : fmt(num(it.hc100) || 0, 1) + ' g de HC por 100 g') + (it.est ? ' · <span style="color:var(--warn)">estimado por foto</span>' : '') + '</small></div>' +
        '<input class="n" inputmode="decimal" data-f="' + (direct ? 'hcDirect' : 'grams') + '" data-i="' + i + '" value="' + esc(direct ? it.hcDirect : it.grams) + '" placeholder="' + (direct ? 'g HC' : (it.portion ? 'p. ej. ' + it.portion : 'gramos')) + '" aria-label="' + (direct ? 'Gramos de hidratos' : 'Gramos de alimento') + '">' +
        '<span class="hc" id="hc' + i + '"></span><button class="x" data-act="del" data-i="' + i + '" aria-label="Quitar">✕</button></div>';
    });
    h += '</div><div class="row" style="margin-top:10px"><button class="pri" data-act="add">+ Alimento</button><button data-act="barcode">Código de barras</button><button data-act="manual">HC a mano</button><button data-act="pickplate">Mis platos</button>' + (aiOn() ? '<button data-act="photo">Foto del plato</button>' : '') + '</div></section>';
    h += '<section class="card" id="res"></section>';
    view.innerHTML = h;
    renderRes();
  }

  function renderRes() {
    var res = $('#res'); if (!res) return;
    var c = compute(), r = c.r, m = S.meal, h = '';
    m.items.forEach(function (it, i) { var el = $('#hc' + i); if (el) el.textContent = fmt(Calc.carbsOf(it), 1) + ' g'; });
    var age = $('#gage');
    if (age) age.textContent = m.gt && m.glucose !== '' ? (m.gsrc === 'libre' ? 'Libre · ' : 'A mano · ') + 'hace ' + Math.max(0, Math.round((Date.now() - m.gt) / 60000)) + ' min' : '';

    h += '<h2>Resultado · ' + esc(slotName(c.slot)) + '</h2>';
    h += '<div class="tot"><span>Hidratos</span><span><b>' + fmt(c.carbs, 1) + '</b> g · ' + fmt(c.carbs / Calc.RACION, 1) + ' raciones</span></div>';
    if (c.g.bad) h += '<div class="note warn">La glucosa escrita no parece un valor válido (20–600 mg/dL). No se usa en el cálculo.</div>';

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
      if (m.items.some(function (x) { return x.est; })) h += '<div class="note warn">Hay cantidades estimadas por foto. Revísalas antes de fiarte del resultado.</div>';
      if (r.capped) h += '<div class="note warn">El cálculo supera tu dosis máxima configurada (' + fu(num(S.cfg.maxBolus)) + '); se ha limitado a ese tope.</div>';
      if (!r.hasGlucose && !c.g.bad) h += '<div class="note warn">Sin glucosa: solo se ha calculado la parte de la comida.</div>';
      if (r.hasGlucose && (m.trend === 1 || m.trend === 2)) h += '<div class="note warn">La flecha indica que la glucosa está ' + TREND[m.trend][1].toLowerCase() + '. El cálculo no lo tiene en cuenta: valora poner menos según tus pautas.</div>';
      if (r.hasGlucose && (m.trend === 4 || m.trend === 5)) h += '<div class="note warn">La flecha indica que la glucosa está ' + TREND[m.trend][1].toLowerCase() + '. El cálculo no lo tiene en cuenta.</div>';
      if (r.hasGlucose && m.gt && Date.now() - m.gt > STALE_MS) h += '<div class="note warn">La glucosa es de hace ' + Math.round((Date.now() - m.gt) / 60000) + ' min. Vuelve a medirla antes de decidir.</div>';
    }
    h += '<div class="row" style="margin-top:10px"><button class="pri" data-act="log">Registrar</button><button data-act="saveplate"' + (m.items.length ? '' : ' disabled') + '>Guardar como plato</button><button class="ghost" data-act="clear">Vaciar</button></div>';
    h += '<p class="fine">Cálculo orientativo hecho con las pautas que tú has puesto. La decisión de la dosis es tuya y de tu equipo de diabetes.</p>';
    res.innerHTML = h;
  }

  function aiOn() { return S.ai.on === '1' && !!S.ai.key; }

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
      showEstimate(await Vision.estimate(b64, hint, S.ai));
    } catch (e) { msgDlg('No se pudo analizar la foto', e && e.message ? e.message : 'Error desconocido'); }
  }
  function showEstimate(est) {
    estimate = est;
    if (!est.items.length) { msgDlg('Foto del plato', 'La IA no ha reconocido alimentos en la foto.' + (est.notes ? ' ' + est.notes : '')); estimate = null; return; }
    var total = Calc.mealCarbs(est.items);
    openDlg('<h3>Propuesta de la IA</h3><div class="list" style="margin-top:0">' + est.items.map(function (it) {
      return '<div class="item" style="padding:8px 4px"><div class="nm"><b>' + esc(it.name) + '</b><small>≈ ' + it.grams + ' g · ' + fmt(it.hc100, 1) + ' g HC/100 g · confianza ' + esc(it.conf) + '</small></div><span class="hc">' + fmt(Calc.carbsOf(it), 1) + ' g</span></div>';
    }).join('') + '</div><div class="tot" style="margin-top:8px"><span>Total estimado</span><span><b>' + fmt(total, 1) + '</b> g</span></div>' +
      (est.notes ? '<div class="note info">' + esc(est.notes) + '</div>' : '') +
      '<div class="note warn">Es una estimación a ojo: los gramos pueden desviarse bastante. Al añadirla podrás corregir cada cantidad.</div>' +
      '<div class="acts"><button data-act="close">Descartar</button><button class="pri" data-act="photoadd">Añadir a la comida</button></div>');
  }

  function clearMeal() { S.meal = defaults().meal; save(); }

  // ---------- diálogos de alimentos ----------
  function dlgAdd() {
    openDlg('<h3>Añadir alimento</h3><input placeholder="Buscar (arroz, pan, manzana…)" data-f="q" id="q" autocomplete="off"><div class="list" id="ql"></div>' +
      '<div class="acts"><button data-act="newfood">Nuevo alimento propio</button><button data-act="close">Cerrar</button></div>');
    renderSearch('');
  }
  function renderSearch(q) {
    var box = $('#ql'); if (!box) return;
    var n = norm(q.trim()), out = [];
    S.custom.forEach(function (f, i) { if (!n || norm(f.name).indexOf(n) >= 0) out.push('<button data-act="pick" data-src="c" data-k="' + i + '"><span>' + esc(f.name) + ' <small class="mut">· propio</small></span><span>' + fmt(num(f.hc100) || 0, 1) + ' g/100 g</span></button>'); });
    var byCat = [];
    FOODS.forEach(function (f, i) {
      var row = '<button data-act="pick" data-src="b" data-k="' + i + '"><span>' + esc(f[0]) + '</span><span>' + fmt(f[1], 1) + ' g/100 g</span></button>';
      if (!n || norm(f[0]).indexOf(n) >= 0) out.push(row); else if (norm(f[2]).indexOf(n) >= 0) byCat.push(row);
    });
    out = out.concat(byCat);
    box.innerHTML = out.slice(0, 60).join('') || '<p class="mut" style="padding:8px">Nada con ese nombre. Puedes crearlo como alimento propio.</p>';
  }
  function addItem(it) { S.meal.items.push(it); save(); closeDlg(); tab = 'comida'; render(); var ins = view.querySelectorAll('input.n'); if (ins.length) ins[ins.length - 1].focus(); }
  function dlgNewFood(name, hc, code) {
    openDlg('<h3>Alimento propio</h3><label>Nombre</label><input id="nfn" value="' + esc(name || '') + '"><label>Gramos de hidratos por 100 g (de la etiqueta)</label><input id="nfh" inputmode="decimal" value="' + esc(hc || '') + '">' +
      '<input type="hidden" id="nfc" value="' + esc(code || '') + '"><div class="acts"><button data-act="close">Cancelar</button><button class="pri" data-act="nfsave">Guardar y añadir</button></div>');
  }
  function dlgManual() {
    openDlg('<h3>Hidratos a mano</h3><label>Descripción (opcional)</label><input id="mhn" placeholder="Menú del bar, postre…"><label>Gramos de hidratos</label><input id="mhg" inputmode="decimal">' +
      '<div class="acts"><button data-act="close">Cancelar</button><button class="pri" data-act="mhsave">Añadir</button></div>');
  }
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

  // ---------- vista: platos ----------
  function plateSummary(p) { return p.items.map(function (it) { return it.name + (it.hcDirect != null ? '' : ' ' + (it.grams || '?') + ' g'); }).join(' · '); }
  function vPlates() {
    var h = '';
    if (!S.plates.length) h = '<section class="card"><h2>Mis platos</h2><p class="mut">Aún no hay platos. Monta una comida en «Comida» y pulsa «Guardar como plato» para repetirla otro día con un toque.</p></section>';
    S.plates.forEach(function (p, i) {
      var c = Calc.mealCarbs(p.items);
      h += '<section class="card"><div class="tot"><span><b style="font-size:17px">' + esc(p.name) + '</b></span><span><b>' + fmt(c, 1) + '</b> g · ' + fmt(c / Calc.RACION, 1) + ' rac.</span></div>' +
        '<p class="mut">' + esc(plateSummary(p)) + '</p><div class="row"><button class="pri" data-act="useplate" data-i="' + i + '">Usar</button><button class="ghost" data-act="delplate" data-i="' + i + '">Borrar</button></div></section>';
    });
    view.innerHTML = h;
  }
  function usePlate(i) {
    var p = S.plates[i]; if (!p) return;
    p.items.forEach(function (it) { S.meal.items.push(JSON.parse(JSON.stringify(it))); });
    save(); closeDlg(); tab = 'comida'; render(); toast('Plato añadido: revisa las cantidades');
  }

  // ---------- vista: historial ----------
  function vLog() {
    var a = activeInsulin();
    var h = '<section class="card"><h2>Insulina activa ahora</h2>' + (num(S.cfg.dia) > 0 ? '<div class="tot"><span class="mut">de las dosis registradas aquí</span><b>' + fu(a) + '</b></div>' : '<p class="mut">Pon la duración de tu insulina rápida en Ajustes para calcularla.</p>') + '</section>';
    if (!S.log.length) h += '<section class="card"><p class="mut">Cuando registres una comida o una dosis aparecerá aquí.</p></section>';
    else h += '<div class="row"><button data-act="csv">Copiar historial (CSV)</button></div>';
    var lastDay = '';
    S.log.slice().sort(function (x, y) { return y.t - x.t; }).forEach(function (e) {
      var d = new Date(e.t), day = d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
      if (day !== lastDay) { h += '<div class="day">' + esc(day) + '</div>'; lastDay = day; }
      h += '<section class="card"><div class="item"><div class="nm"><b>' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) + ' · ' + esc(slotName(e.slot)) + '</b><small>' +
        fmt(e.carbs || 0, 1) + ' g HC' + (e.glucose != null ? ' · ' + fmt(e.glucose, 0) + ' mg/dL ' + (TREND[e.trend] ? TREND[e.trend][0] : '') : '') + (e.sug != null ? ' · sugerido ' + fu(e.sug) : '') +
        (e.items ? '<br>' + esc(e.items) : '') + '</small></div><span class="hc">' + fu(e.u || 0) + '</span><button class="x" data-act="dellog" data-t="' + e.t + '" aria-label="Borrar">✕</button></div></section>';
    });
    view.innerHTML = h;
  }
  function csv() {
    var rows = ['fecha;hora;franja;hidratos_g;glucosa_mgdl;tendencia;sugerido_U;puesto_U;alimentos'];
    S.log.slice().sort(function (x, y) { return x.t - y.t; }).forEach(function (e) {
      var d = new Date(e.t);
      rows.push([d.toLocaleDateString('es-ES'), d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }), e.slot, fmt(e.carbs || 0, 1), e.glucose != null ? e.glucose : '', TREND[e.trend] ? TREND[e.trend][1] : '', e.sug != null ? fmt(e.sug, 2) : '', fmt(e.u || 0, 2), '"' + String(e.items || '').replace(/"/g, '""') + '"'].join(';'));
    });
    return rows.join('\n');
  }

  // ---------- vista: ajustes ----------
  function field(label, path, attrs) { return '<label>' + label + '</label><input data-s="' + path + '" value="' + esc(getPath(path)) + '" ' + (attrs || 'inputmode="decimal"') + '>'; }
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
      field('Por debajo de esta glucosa no sugerir dosis (mg/dL)', 'cfg.hypo') + '</section>';
    h += '<section class="card"><h2>Sensor Libre (LibreLinkUp)</h2><p class="mut">La app lee tu glucosa a través de LibreLinkUp, la función de compartir de Abbott. Necesitas una cuenta de LibreLinkUp con <b>otro correo</b> distinto al de tu LibreLink, e invitarla desde LibreLink → Aplicaciones conectadas → LibreLinkUp. No es una vía oficial: puede dejar de funcionar si Abbott la cambia.</p>' +
      field('Correo de la cuenta LibreLinkUp', 'libre.email', 'type="email" autocomplete="off"') +
      field('Contraseña', 'libre.password', 'type="password" autocomplete="off"') +
      field('Versión que se anuncia a LibreLinkUp (avanzado)', 'libre.version', '') +
      (native ? '<div class="row" style="margin-top:10px"><button data-act="libretest">Probar lectura</button></div>' : '<p class="fine">La lectura solo funciona en la app instalada; desde un navegador no es posible.</p>') +
      '<p class="fine">El correo y la contraseña se guardan solo en este dispositivo.</p></section>';
    h += '<section class="card"><h2>Foto del plato con IA (opcional)</h2><p class="mut">Si lo activas, aparece el botón «Foto del plato» en Comida. La foto se envía a la API de Claude (Anthropic), que propone alimentos y gramos aproximados para que los revises. Necesita internet y una clave de API de pago (console.anthropic.com).</p>' +
      sel('Estimación por foto', 'ai.on', [['0', 'Desactivada'], ['1', 'Activada']]) +
      field('Clave de la API', 'ai.key', 'type="password" autocomplete="off"') +
      field('Modelo (avanzado)', 'ai.model', '') +
      '<p class="fine">La clave se guarda solo en este dispositivo y no entra en la copia de seguridad.</p></section>';
    h += '<section class="card"><h2>Mis alimentos propios</h2>' + (S.custom.length ? S.custom.map(function (f, i) { return '<div class="item"><div class="nm"><b>' + esc(f.name) + '</b><small>' + fmt(num(f.hc100) || 0, 1) + ' g de HC por 100 g' + (f.code ? ' · código ' + esc(f.code) : '') + '</small></div><button class="x" data-act="delcustom" data-i="' + i + '" aria-label="Borrar">✕</button></div>'; }).join('') : '<p class="mut">Los que crees o escanees se guardan aquí.</p>') + '</section>';
    h += '<section class="card"><h2>Copia de seguridad</h2><p class="mut">Los datos viven solo en este dispositivo. Guarda una copia de vez en cuando.</p><div class="row"><button data-act="backup">Copiar copia de seguridad</button><button data-act="restore">Restaurar…</button></div></section>';
    h += '<p class="fine" style="padding:0 6px">Raciones es una ayuda de cálculo personal, no un producto sanitario. Los valores de la tabla de alimentos son aproximados; manda la etiqueta.</p>';
    view.innerHTML = h;
  }

  // ---------- Libre ----------
  async function readLibre(silent) {
    if (!native) { if (!silent) toast('La lectura del Libre solo funciona en la app instalada'); return; }
    if (silent && (!S.libre.email || !S.libre.password)) return;
    lastLibreTry = Date.now();
    var b = $('#blibre'); if (b) { b.disabled = true; b.textContent = 'Leyendo…'; }
    try {
      var out = await Libre.read(S.libre);
      S.libre.session = out.session;
      S.meal.glucose = String(out.reading.mgdl); S.meal.trend = out.reading.trend; S.meal.gt = out.reading.t || Date.now(); S.meal.gsrc = 'libre';
      save(); if (tab === 'comida' && !dlg.open) render(); else if (!silent) msgDlg('Libre', 'Lectura correcta: ' + out.reading.mgdl + ' mg/dL ' + TREND[out.reading.trend][0]);
    } catch (e) {
      S.libre.session = null; save();
      if (!silent) msgDlg('No se pudo leer el Libre', e && e.message ? e.message : 'Error desconocido');
    } finally { b = $('#blibre'); if (b) { b.disabled = false; b.textContent = 'Leer del Libre'; } }
  }
  function autoLibre() {
    if (!native || tab !== 'comida' || Date.now() - lastLibreTry < 60000) return;
    if (S.meal.gsrc === 'manual' && S.meal.gt && Date.now() - S.meal.gt < STALE_MS) return; // no pisar lo escrito a mano
    readLibre(true);
  }

  // ---------- render y eventos ----------
  function render() {
    Array.prototype.forEach.call(document.querySelectorAll('#nav button'), function (b) { b.classList.toggle('on', b.dataset.tab === tab); });
    if (tab === 'comida') vMeal(); else if (tab === 'platos') vPlates(); else if (tab === 'historial') vLog(); else vSettings();
  }

  document.addEventListener('input', function (e) {
    var t = e.target; if (!t.dataset) return;
    if (t.dataset.s) { setPath(t.dataset.s, t.value.trim ? t.value.trim() : t.value); if (t.dataset.s.indexOf('libre.') === 0) S.libre.session = null; save(); return; }
    var f = t.dataset.f; if (!f) return;
    if (f === 'glucose') { S.meal.glucose = t.value.trim(); S.meal.gt = S.meal.glucose ? Date.now() : null; S.meal.gsrc = 'manual'; save(); renderRes(); }
    else if (f === 'trend') { S.meal.trend = +t.value; save(); renderRes(); }
    else if (f === 'grams' || f === 'hcDirect') { var it = S.meal.items[+t.dataset.i]; if (it) { it[f] = t.value; save(); renderRes(); } }
    else if (f === 'q') renderSearch(t.value);
  });

  document.addEventListener('click', function (e) {
    var navb = e.target.closest && e.target.closest('#nav button');
    if (navb) { tab = navb.dataset.tab; render(); window.scrollTo(0, 0); return; }
    var b = e.target.closest && e.target.closest('[data-act]'); if (!b) return;
    var a = b.dataset.act, i = +b.dataset.i;
    switch (a) {
      case 'close': closeDlg(); break;
      case 'yes': { var fn = pending; pending = null; closeDlg(); if (fn) fn(); break; }
      case 'goto': tab = b.dataset.v; render(); window.scrollTo(0, 0); break;
      case 'slot': S.meal.slot = b.dataset.v; save(); render(); break;
      case 'del': S.meal.items.splice(i, 1); save(); render(); break;
      case 'clear': if (S.meal.items.length || S.meal.glucose) confirmDlg('¿Vaciar la comida actual?', function () { clearMeal(); render(); }); break;
      case 'add': dlgAdd(); break;
      case 'pick': {
        var f = b.dataset.src === 'c' ? S.custom[+b.dataset.k] : null, base = b.dataset.src === 'b' ? FOODS[+b.dataset.k] : null;
        if (f) addItem({ name: f.name, hc100: f.hc100, grams: '' });
        else if (base) addItem({ name: base[0], hc100: base[1], grams: '', portion: base[3] || null });
        break;
      }
      case 'newfood': dlgNewFood(($('#q') || {}).value || ''); break;
      case 'nfsave': {
        var nm = $('#nfn').value.trim(), hc = num($('#nfh').value), code = $('#nfc').value;
        if (!nm || hc === null || hc < 0 || hc > 100) { toast('Pon un nombre y los hidratos por 100 g (0 a 100)'); break; }
        var nf = { name: nm, hc100: hc }; if (code) nf.code = code;
        S.custom.push(nf); addItem({ name: nm, hc100: hc, grams: '' }); break;
      }
      case 'manual': dlgManual(); break;
      case 'mhsave': { var g = num($('#mhg').value); if (g === null || g < 0) { toast('Pon los gramos de hidratos'); break; } addItem({ name: $('#mhn').value.trim() || 'Hidratos a mano', hcDirect: String(g).replace('.', ',') }); break; }
      case 'barcode': dlgBarcode(); break;
      case 'bcfind': stopScan(); findCode(); break;
      case 'bcscan': startScan(); break;
      case 'bcadd': if (bcProduct && bcProduct.hc100 !== null) { if (!S.custom.some(function (x) { return x.code === bcProduct.code; })) S.custom.push({ name: bcProduct.name, hc100: bcProduct.hc100, code: bcProduct.code }); addItem({ name: bcProduct.name, hc100: bcProduct.hc100, grams: '' }); } break;
      case 'bcnew': dlgNewFood(bcProduct && bcProduct.name || '', '', bcProduct && bcProduct.code || ''); break;
      case 'pickplate':
        if (!S.plates.length) { toast('Aún no tienes platos guardados'); break; }
        openDlg('<h3>Mis platos</h3><div class="list">' + S.plates.map(function (p, k) { return '<button data-act="useplate" data-i="' + k + '"><span>' + esc(p.name) + '</span><span>' + fmt(Calc.mealCarbs(p.items), 1) + ' g</span></button>'; }).join('') + '</div><div class="acts"><button data-act="close">Cerrar</button></div>');
        break;
      case 'useplate': usePlate(i); break;
      case 'saveplate': openDlg('<h3>Guardar como plato</h3><label>Nombre del plato</label><input id="pn" placeholder="Desayuno de diario…"><div class="acts"><button data-act="close">Cancelar</button><button class="pri" data-act="platesave">Guardar</button></div>'); break;
      case 'platesave': { var pn = $('#pn').value.trim(); if (!pn) { toast('Ponle un nombre'); break; } S.plates.push({ name: pn, items: JSON.parse(JSON.stringify(S.meal.items)) }); save(); closeDlg(); toast('Plato guardado'); break; }
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
        S.log.push({ t: Date.now(), slot: cc.slot, carbs: Math.round(cc.carbs * 10) / 10, glucose: cc.g.v, trend: S.meal.trend, sug: cc.r.ok ? cc.r.total : null, u: u, items: S.meal.items.map(function (x) { return x.name; }).join(', ') });
        clearMeal(); closeDlg(); render(); toast('Registrado'); break;
      }
      case 'dellog': confirmDlg('¿Borrar este registro? Dejará de contar como insulina activa.', function () { S.log = S.log.filter(function (x) { return String(x.t) !== b.dataset.t; }); save(); render(); }); break;
      case 'csv': copyText(csv(), 'Historial copiado'); break;
      case 'delcustom': confirmDlg('¿Borrar «' + S.custom[i].name + '» de tus alimentos?', function () { S.custom.splice(i, 1); save(); render(); }); break;
      case 'backup': { var copy = JSON.parse(JSON.stringify(S)); copy.libre.password = ''; copy.libre.session = null; copy.ai.key = ''; copyText(JSON.stringify(copy), 'Copia de seguridad copiada (sin contraseñas ni claves)'); break; }
      case 'restore': openDlg('<h3>Restaurar copia</h3><p class="mut">Pega aquí el texto de una copia de seguridad. Sustituye a los datos actuales.</p><textarea id="rs" rows="6"></textarea><div class="acts"><button data-act="close">Cancelar</button><button class="pri" data-act="restoredo">Restaurar</button></div>'); break;
      case 'restoredo': {
        try {
          var j = JSON.parse($('#rs').value); if (!j || typeof j !== 'object' || !j.cfg) throw 0;
          var pw = S.libre.password, ak = S.ai.key; S = merge(defaults(), j); if (!S.libre.password) S.libre.password = pw; if (!S.ai.key) S.ai.key = ak; S.libre.session = null;
          save(); closeDlg(); render(); toast('Copia restaurada');
        } catch (err) { toast('Ese texto no es una copia válida'); }
        break;
      }
      case 'photo': dlgPhoto(); break;
      case 'photocam': $('#cam').click(); break;
      case 'photogal': $('#gal').click(); break;
      case 'photoadd':
        if (estimate) { estimate.items.forEach(function (it) { S.meal.items.push({ name: it.name, hc100: it.hc100, grams: String(it.grams), est: true }); }); estimate = null; save(); closeDlg(); tab = 'comida'; render(); toast('Añadido: revisa los gramos'); }
        break;
      case 'libre': readLibre(false); break;
      case 'libretest': readLibre(false); break;
    }
  });

  ['cam', 'gal'].forEach(function (id) {
    var inp = $('#' + id); if (!inp) return;
    inp.addEventListener('change', function () { var f = inp.files && inp.files[0]; inp.value = ''; if (f) analyzePhoto(f); });
  });
  dlg.addEventListener('close', stopScan);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { autoLibre(); if (tab === 'comida') renderRes(); } });
  setInterval(function () { if (tab === 'comida' && !document.hidden) renderRes(); }, 30000);

  render();
  autoLibre();
  window.__raciones = { state: function () { return S; }, showEstimate: showEstimate }; // para pruebas
})();
