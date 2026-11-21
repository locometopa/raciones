/* Estimación OPCIONAL de un plato a partir de una foto, con la API de Claude.
   Devuelve una propuesta de alimentos y gramos que el usuario revisa: nunca una dosis. */
var Vision = (function () {
  'use strict';
  var DEFAULT_MODEL = 'claude-sonnet-5-5';
  var MAX_EDGE = 1568;

  var TOOL = {
    name: 'registrar_plato',
    description: 'Registra los alimentos visibles en la foto con su peso estimado.',
    input_schema: {
      type: 'object',
      properties: {
        alimentos: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              nombre: { type: 'string', description: 'Nombre corto en español, indicando si está cocido, frito, etc.' },
              gramos: { type: 'number', description: 'Peso estimado de ese alimento tal como está en el plato' },
              hc_por_100g: { type: 'number', description: 'Gramos de hidratos de carbono por 100 g de ese alimento tal como está en el plato' },
              confianza: { type: 'string', enum: ['alta', 'media', 'baja'] }
            },
            required: ['nombre', 'gramos', 'hc_por_100g', 'confianza']
          }
        },
        notas: { type: 'string', description: 'Dudas importantes: lo que no se ve, salsas, lo que puede cambiar mucho la estimación. Cadena vacía si no hay.' }
      },
      required: ['alimentos', 'notas']
    }
  };

  var SYSTEM = 'Ayudas a una persona con diabetes a contar hidratos de carbono. A partir de la foto de una comida, identifica cada alimento visible y estima su peso en gramos y sus hidratos por 100 g. ' +
    'Incluye también los alimentos sin hidratos (carne, pescado, huevo) con 0. Sé prudente: si no puedes distinguir algo, dilo en las notas y marca confianza baja; no inventes alimentos que no se ven. ' +
    'No des consejos de insulina ni de dosis. Si la foto no muestra comida, devuelve la lista vacía y explícalo en las notas. Responde en español usando la herramienta.';

  function VisionError(code, msg) { var e = new Error(msg); e.code = code; return e; }

  /* Reduce la foto y la pasa a JPEG base64 (sin el prefijo data:). */
  function fileToJpegBase64(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        try {
          var k = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
          var c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          var data = c.toDataURL('image/jpeg', 0.82);
          URL.revokeObjectURL(url);
          resolve(data.slice(data.indexOf(',') + 1));
        } catch (e) { reject(VisionError('img', 'No se pudo preparar la foto.')); }
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(VisionError('img', 'No se pudo abrir la foto.')); };
      img.src = url;
    });
  }

  /* Limpia la respuesta del modelo: solo alimentos con números razonables. */
  function parse(body) {
    var blocks = (body && body.content) || [], input = null;
    for (var i = 0; i < blocks.length; i++) if (blocks[i].type === 'tool_use' && blocks[i].input) { input = blocks[i].input; break; }
    if (!input) throw VisionError('proto', 'La respuesta de la IA no tiene el formato esperado.');
    var items = [];
    (Array.isArray(input.alimentos) ? input.alimentos : []).forEach(function (a) {
      var g = Number(a && a.gramos), hc = Number(a && a.hc_por_100g), nombre = String((a && a.nombre) || '').trim().slice(0, 80);
      if (!nombre || !(g > 0) || g > 2000 || !(hc >= 0) || hc > 100) return;
      items.push({ name: nombre, grams: Math.round(g), hc100: Math.round(hc * 10) / 10, conf: ['alta', 'media', 'baja'].indexOf(a.confianza) >= 0 ? a.confianza : 'baja' });
    });
    return { items: items, notes: String(input.notas || '').trim().slice(0, 600) };
  }

  /* cfg: {key, model}. b64: JPEG en base64. hint: texto opcional del usuario. */
  async function estimate(b64, hint, cfg) {
    if (!cfg || !cfg.key) throw VisionError('cfg', 'Falta la clave de la API en Ajustes.');
    var text = 'Estima los alimentos de esta foto.' + (hint ? ' Indicaciones de quien va a comer: ' + String(hint).slice(0, 300) : '');
    var res;
    try {
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': cfg.key,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: cfg.model || DEFAULT_MODEL,
          max_tokens: 1024,
          system: SYSTEM,
          tools: [TOOL],
          tool_choice: { type: 'tool', name: TOOL.name },
          messages: [{ role: 'user', content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } },
            { type: 'text', text: text }
          ] }]
        })
      });
    } catch (e) { throw VisionError('net', 'No se pudo conectar con la IA (¿sin internet?).'); }
    var body = null;
    try { body = await res.json(); } catch (e) { /* sin JSON */ }
    if (res.status === 401 || res.status === 403) throw VisionError('auth', 'La clave de la API no es válida o no tiene permiso.');
    if (res.status === 404) throw VisionError('model', 'El modelo configurado no existe. Revisa su nombre en Ajustes.');
    if (res.status === 429) throw VisionError('rate', 'Límite de uso de la API alcanzado. Prueba en un minuto o revisa el saldo.');
    if (res.status < 200 || res.status >= 300) throw VisionError('http', 'La IA respondió con un error (' + res.status + (body && body.error && body.error.message ? ': ' + String(body.error.message).slice(0, 160) : '') + ').');
    return parse(body);
  }

  var api = { estimate: estimate, parse: parse, fileToJpegBase64: fileToJpegBase64, DEFAULT_MODEL: DEFAULT_MODEL };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  return api;
})();
