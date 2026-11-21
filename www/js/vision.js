/* Estimación OPCIONAL de un plato a partir de una foto, con el servicio de IA que elija el usuario.
   Devuelve una propuesta de alimentos y gramos que el usuario revisa: nunca una dosis. */
var Vision = (function () {
  'use strict';
  var MAX_EDGE = 1568;

  /* Servicios. Los modelos de serie se pueden cambiar en Ajustes. */
  var PROVIDERS = {
    claude: {
      name: 'Claude (Anthropic)', model: 'claude-sonnet-5-5', keyUrl: 'https://console.anthropic.com/settings/keys',
      steps: ['Entra en console.anthropic.com con tu cuenta (o créala).', 'En «Billing» añade saldo: es de prepago.', 'En «API Keys» pulsa «Create Key» y copia la clave (empieza por sk-ant-).']
    },
    gemini: {
      name: 'Gemini (Google)', model: 'gemini-3.8-flash', keyUrl: 'https://aistudio.google.com/apikey',
      steps: ['Entra en Google AI Studio (aistudio.google.com) con tu cuenta de Google.', 'Pulsa «Create API key» y copia la clave.', 'Mira en su página de precios si tu cuenta tiene uso gratuito o si hay que activar la facturación.']
    },
    openai: {
      name: 'ChatGPT (OpenAI)', model: 'gpt-6-luna', keyUrl: 'https://platform.openai.com/api-keys',
      steps: ['La suscripción de ChatGPT (Plus, etc.) no sirve: la API va aparte.', 'Entra en platform.openai.com y en «Billing» añade saldo.', 'En «API keys» pulsa «Create new secret key» y copia la clave (empieza por sk-).']
    },
    deepseek: {
      name: 'DeepSeek', model: 'deepseek-flash', keyUrl: 'https://platform.deepseek.com/api_keys',
      steps: ['Entra en platform.deepseek.com y crea la cuenta.', 'Recarga saldo («Top up»): se cobra del saldo y sin saldo da error.', 'En «API keys» crea una clave y cópiala. El modelo deepseek-flash es el que acepta fotos.']
    },
    custom: {
      name: 'Otro compatible con OpenAI', model: '', keyUrl: 'https://openrouter.ai/keys', needsUrl: true,
      steps: ['Sirve para OpenRouter (dirección https://openrouter.ai/api/v1, clave en openrouter.ai/keys) o para un modelo propio con Ollama o LM Studio (por ejemplo http://192.168.1.180:11434/v1, sin clave).', 'Pon la dirección, la clave si hace falta y el nombre exacto de un modelo que acepte imágenes.']
    }
  };

  var FIELDS = 'Devuelve SOLO un objeto JSON, sin texto alrededor, con esta forma exacta: ' +
    '{"alimentos":[{"nombre":"texto","gramos":numero,"hc_por_100g":numero,"confianza":"alta|media|baja"}],"notas":"texto"}';
  var SYSTEM = 'Ayudas a una persona con diabetes a contar hidratos de carbono. A partir de la foto o de la descripción de una comida, identifica cada alimento y estima su peso en gramos (tal como se come) y sus gramos de hidratos de carbono por 100 g. Si en una descripción no se dan cantidades, usa raciones normales de un adulto en España. ' +
    'Nombres cortos en español, indicando si está cocido, frito, etc. Incluye también los alimentos sin hidratos (carne, pescado, huevo) con 0. Sé prudente: si no puedes distinguir algo, dilo en las notas y marca confianza baja; no inventes alimentos que no se ven ni que no se mencionan. ' +
    'En las notas pon las dudas importantes (lo que no se ve, salsas…), o cadena vacía. No des consejos de insulina ni de dosis. Si no hay comida en la foto o en la descripción, devuelve la lista vacía y explícalo en las notas.';

  var TOOL = {
    name: 'registrar_plato',
    description: 'Registra los alimentos visibles en la foto con su peso estimado.',
    input_schema: {
      type: 'object',
      properties: {
        alimentos: { type: 'array', items: { type: 'object', properties: {
          nombre: { type: 'string' }, gramos: { type: 'number' }, hc_por_100g: { type: 'number' }, confianza: { type: 'string', enum: ['alta', 'media', 'baja'] }
        }, required: ['nombre', 'gramos', 'hc_por_100g', 'confianza'] } },
        notas: { type: 'string' }
      },
      required: ['alimentos', 'notas']
    }
  };

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

  /* Limpia la propuesta: solo alimentos con números razonables. */
  function clean(input) {
    if (!input || typeof input !== 'object') throw VisionError('proto', 'La respuesta de la IA no tiene el formato esperado.');
    var items = [];
    (Array.isArray(input.alimentos) ? input.alimentos : []).forEach(function (a) {
      var g = Number(a && a.gramos), hc = Number(a && a.hc_por_100g), nombre = String((a && a.nombre) || '').trim().slice(0, 80);
      if (!nombre || !(g > 0) || g > 2000 || !(hc >= 0) || hc > 100) return;
      items.push({ name: nombre, grams: Math.round(g), hc100: Math.round(hc * 10) / 10, conf: ['alta', 'media', 'baja'].indexOf(a.confianza) >= 0 ? a.confianza : 'baja' });
    });
    return { items: items, notes: String(input.notas || '').trim().slice(0, 600) };
  }
  /* Respuesta de Claude (herramienta). */
  function parse(body) {
    var blocks = (body && body.content) || [];
    for (var i = 0; i < blocks.length; i++) if (blocks[i].type === 'tool_use' && blocks[i].input) return clean(blocks[i].input);
    for (var j = 0; j < blocks.length; j++) if (blocks[j].type === 'text') return parseText(blocks[j].text);
    throw VisionError('proto', 'La respuesta de la IA no tiene el formato esperado.');
  }
  /* Respuesta en texto con un JSON dentro (puede venir entre ```json ... ```). */
  function parseText(text) {
    var s = String(text || ''), a = s.indexOf('{'), b = s.lastIndexOf('}');
    if (a < 0 || b <= a) throw VisionError('proto', 'La IA no ha devuelto la lista de alimentos. Prueba otra vez u otro modelo.');
    var obj;
    try { obj = JSON.parse(s.slice(a, b + 1)); } catch (e) { throw VisionError('proto', 'La IA ha devuelto una respuesta incompleta. Prueba otra vez u otro modelo.'); }
    return clean(obj);
  }

  async function post(url, headers, body) {
    var res;
    try { res = await fetch(url, { method: 'POST', headers: headers, body: JSON.stringify(body) }); }
    catch (e) { throw VisionError('net', 'No se pudo conectar con el servicio de IA (¿sin internet o dirección mal escrita?).'); }
    var json = null;
    try { json = await res.json(); } catch (e) { /* sin JSON */ }
    if (res.status >= 200 && res.status < 300) return json || {};
    var err = json && (json.error || (Array.isArray(json) && json[0] && json[0].error)) || {};
    var msg = String(err.message || json && json.message || '').slice(0, 180);
    if (res.status === 401 || res.status === 403 || /api.?key/i.test(msg)) throw VisionError('auth', 'La clave de la API no es válida o no tiene permiso.' + (msg ? ' (' + msg + ')' : ''));
    if (res.status === 402) throw VisionError('money', 'No queda saldo en la cuenta del servicio de IA.');
    if (res.status === 404) throw VisionError('model', 'El modelo configurado no existe en ese servicio. Revisa su nombre en Ajustes.' + (msg ? ' (' + msg + ')' : ''));
    if (res.status === 429) throw VisionError('rate', 'Límite de uso alcanzado o sin saldo. Prueba en un minuto o revisa la cuenta.');
    throw VisionError('http', 'El servicio de IA respondió con un error (' + res.status + (msg ? ': ' + msg : '') + ').');
  }

  function textOfChat(body) {
    var m = body && body.choices && body.choices[0] && body.choices[0].message;
    if (!m) return '';
    if (typeof m.content === 'string') return m.content;
    if (Array.isArray(m.content)) return m.content.map(function (p) { return p && (p.text || '') || ''; }).join('');
    return '';
  }

  /* cfg: {provider, key, model, url}. b64: JPEG en base64, o null para estimar solo a partir del texto.
     hint: pistas de la foto, o la descripción de la comida cuando no hay foto. */
  async function estimate(b64, hint, cfg) {
    cfg = cfg || {};
    var p = PROVIDERS[cfg.provider] ? cfg.provider : 'claude', P = PROVIDERS[p];
    var model = String(cfg.model || P.model || '').trim(), key = String(cfg.key || '').trim();
    if (P.needsUrl && !cfg.url) throw VisionError('cfg', 'Falta la dirección del servicio en Ajustes.');
    if (!P.needsUrl && !key) throw VisionError('cfg', 'Falta la clave de la API en Ajustes.');
    if (!model) throw VisionError('cfg', 'Falta el nombre del modelo en Ajustes.');
    var text = b64 ? 'Estima los alimentos de esta foto.' + (hint ? ' Indicaciones de quien va a comer: ' + String(hint).slice(0, 300) : '')
      : 'Esto es lo que voy a comer: ' + String(hint || '').slice(0, 800);
    if (!b64 && !String(hint || '').trim()) throw VisionError('cfg', 'Escribe qué vas a comer.');

    if (p === 'claude') {
      return parse(await post('https://api.anthropic.com/v1/messages', {
        'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true'
      }, {
        model: model, max_tokens: 1024, system: SYSTEM, tools: [TOOL], tool_choice: { type: 'tool', name: TOOL.name },
        messages: [{ role: 'user', content: (b64 ? [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } }] : []).concat([{ type: 'text', text: text }]) }]
      }));
    }
    if (p === 'gemini') {
      var g = await post('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent', {
        'content-type': 'application/json', 'x-goog-api-key': key
      }, {
        systemInstruction: { parts: [{ text: SYSTEM + ' ' + FIELDS }] },
        contents: [{ role: 'user', parts: (b64 ? [{ inline_data: { mime_type: 'image/jpeg', data: b64 } }] : []).concat([{ text: text }]) }],
        generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 4096 }
      });
      var c = g.candidates && g.candidates[0];
      var t = c && c.content && Array.isArray(c.content.parts) ? c.content.parts.map(function (x) { return x.text || ''; }).join('') : '';
      if (!t && g.promptFeedback && g.promptFeedback.blockReason) throw VisionError('blocked', 'Gemini ha rechazado la foto (' + g.promptFeedback.blockReason + ').');
      return parseText(t);
    }
    // OpenAI y compatibles (DeepSeek, OpenRouter, Ollama, LM Studio…)
    var base = p === 'openai' ? 'https://api.openai.com/v1' : p === 'deepseek' ? 'https://api.deepseek.com' : String(cfg.url).trim().replace(/\/+$/, '').replace(/\/chat\/completions$/, '');
    var hdr = { 'content-type': 'application/json' };
    if (key) hdr.authorization = 'Bearer ' + key;
    var body = {
      model: model,
      messages: [
        { role: 'system', content: SYSTEM + ' ' + FIELDS },
        { role: 'user', content: b64 ? [{ type: 'text', text: text }, { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + b64 } }] : text }
      ]
    };
    if (p === 'openai') { body.max_completion_tokens = 4096; body.response_format = { type: 'json_object' }; }
    else body.max_tokens = 2048;
    return parseText(textOfChat(await post(base + '/chat/completions', hdr, body)));
  }

  function describe(text, cfg) { return estimate(null, text, cfg); }

  var api = { estimate: estimate, describe: describe, parse: parse, parseText: parseText, fileToJpegBase64: fileToJpegBase64, PROVIDERS: PROVIDERS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  return api;
})();
