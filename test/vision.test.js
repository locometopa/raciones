// Servicios de IA para la foto, con respuestas simuladas (sin red).
const assert = require('assert');
const Vision = require('../www/js/vision.js');

let next = null, last = null;
global.fetch = async (url, opt) => { last = { url, opt, body: JSON.parse(opt.body) }; const r = next; return { status: r.http || 200, json: async () => r.body }; };
const json = JSON.stringify({ alimentos: [{ nombre: 'Arroz blanco cocido', gramos: 180, hc_por_100g: 28, confianza: 'media' }, { nombre: 'Pollo', gramos: 120, hc_por_100g: 0, confianza: 'alta' }], notas: 'Sin salsa visible' });
const check = (r) => { assert.strictEqual(r.items.length, 2); assert.strictEqual(r.items[0].grams, 180); assert.strictEqual(r.notes, 'Sin salsa visible'); };

(async () => {
  // Texto con el JSON entre ``` o con texto alrededor
  check(Vision.parseText('```json\n' + json + '\n```'));
  check(Vision.parseText('Aquí tienes: ' + json + ' ¡Buen provecho!'));
  assert.throws(() => Vision.parseText('No veo comida'), /lista de alimentos/);
  assert.throws(() => Vision.parseText('{"alimentos": [ {'), /incompleta|lista/);
  // Valores imposibles fuera
  assert.strictEqual(Vision.parseText('{"alimentos":[{"nombre":"x","gramos":5000,"hc_por_100g":10},{"nombre":"y","gramos":50,"hc_por_100g":200}],"notas":""}').items.length, 0);

  // Claude
  next = { body: { content: [{ type: 'tool_use', input: JSON.parse(json) }] } };
  check(await Vision.estimate('QUJD', '', { provider: 'claude', key: 'k' }));
  assert.strictEqual(last.url, 'https://api.anthropic.com/v1/messages');
  assert.strictEqual(last.opt.headers['x-api-key'], 'k');
  assert.strictEqual(last.body.model, 'claude-sonnet-5-5');
  assert.strictEqual(last.body.messages[0].content[0].source.data, 'QUJD');

  // Gemini
  next = { body: { candidates: [{ content: { parts: [{ text: json }] } }] } };
  check(await Vision.estimate('QUJD', 'plato grande', { provider: 'gemini', key: 'g', model: 'gemini-3.8-flash' }));
  assert.ok(last.url.endsWith('/v1beta/models/gemini-3.8-flash:generateContent'));
  assert.strictEqual(last.opt.headers['x-goog-api-key'], 'g');
  assert.strictEqual(last.body.contents[0].parts[0].inline_data.data, 'QUJD');
  assert.strictEqual(last.body.generationConfig.responseMimeType, 'application/json');
  assert.ok(last.body.contents[0].parts[1].text.includes('plato grande'));

  // ChatGPT
  next = { body: { choices: [{ message: { content: json } }] } };
  check(await Vision.estimate('QUJD', '', { provider: 'openai', key: 'o' }));
  assert.strictEqual(last.url, 'https://api.openai.com/v1/chat/completions');
  assert.strictEqual(last.opt.headers.authorization, 'Bearer o');
  assert.strictEqual(last.body.model, 'gpt-6-luna');
  assert.deepStrictEqual(last.body.response_format, { type: 'json_object' });
  assert.ok(last.body.messages[1].content[1].image_url.url.startsWith('data:image/jpeg;base64,QUJD'));

  // DeepSeek
  next = { body: { choices: [{ message: { content: '```json\n' + json + '\n```' } }] } };
  check(await Vision.estimate('QUJD', '', { provider: 'deepseek', key: 'd' }));
  assert.strictEqual(last.url, 'https://api.deepseek.com/chat/completions');
  assert.strictEqual(last.body.model, 'deepseek-flash');
  assert.strictEqual(last.body.response_format, undefined);

  // Compatible (Ollama en casa, sin clave; dirección con barra final)
  next = { body: { choices: [{ message: { content: json } }] } };
  check(await Vision.estimate('QUJD', '', { provider: 'custom', url: 'http://192.168.1.180:11434/v1/', model: 'qwen-vl' }));
  assert.strictEqual(last.url, 'http://192.168.1.180:11434/v1/chat/completions');
  assert.strictEqual(last.opt.headers.authorization, undefined);
  await assert.rejects(Vision.estimate('QUJD', '', { provider: 'custom', url: 'http://x/v1' }), (e) => e.code === 'cfg');
  await assert.rejects(Vision.estimate('QUJD', '', { provider: 'custom', model: 'm' }), (e) => e.code === 'cfg');

  // Errores
  await assert.rejects(Vision.estimate('QUJD', '', { provider: 'gemini' }), (e) => e.code === 'cfg');
  next = { http: 400, body: { error: { message: 'API key not valid. Please pass a valid API key.' } } };
  await assert.rejects(Vision.estimate('QUJD', '', { provider: 'gemini', key: 'mal' }), (e) => e.code === 'auth');
  next = { http: 402, body: { error: { message: 'Insufficient Balance' } } };
  await assert.rejects(Vision.estimate('QUJD', '', { provider: 'deepseek', key: 'd' }), (e) => e.code === 'money');
  next = { http: 404, body: { error: { message: 'model not found' } } };
  await assert.rejects(Vision.estimate('QUJD', '', { provider: 'openai', key: 'o', model: 'no-existe' }), (e) => e.code === 'model');
  next = { http: 429, body: {} };
  await assert.rejects(Vision.estimate('QUJD', '', { provider: 'claude', key: 'k' }), (e) => e.code === 'rate');
  next = { body: { candidates: [], promptFeedback: { blockReason: 'SAFETY' } } };
  await assert.rejects(Vision.estimate('QUJD', '', { provider: 'gemini', key: 'g' }), (e) => e.code === 'blocked');

  // Descripción sin foto: no se manda imagen en ningún servicio
  next = { body: { content: [{ type: 'tool_use', input: JSON.parse(json) }] } };
  check(await Vision.describe('lentejas con chorizo y pan', { provider: 'claude', key: 'k' }));
  assert.strictEqual(last.body.messages[0].content.length, 1); assert.ok(last.body.messages[0].content[0].text.includes('lentejas'));
  next = { body: { candidates: [{ content: { parts: [{ text: json }] } }] } };
  check(await Vision.describe('lentejas', { provider: 'gemini', key: 'g' }));
  assert.strictEqual(last.body.contents[0].parts.length, 1); assert.ok(!last.body.contents[0].parts[0].inline_data);
  next = { body: { choices: [{ message: { content: json } }] } };
  check(await Vision.describe('lentejas', { provider: 'deepseek', key: 'd' }));
  assert.strictEqual(typeof last.body.messages[1].content, 'string');
  await assert.rejects(Vision.describe('  ', { provider: 'claude', key: 'k' }), (e) => e.code === 'cfg');

  // ---------- nuevas funciones de IA ----------
  // Carta (Gemini): platos con HC por ración y HC/100 g calculado
  next = { body: { candidates: [{ content: { parts: [{ text: JSON.stringify({ platos: [{ nombre: 'Paella', gramos_racion: 350, hc_racion: 90, grasa: 'media', nota: '' }, { nombre: 'Raro', gramos_racion: 100, hc_racion: 300 }], notas: '' }) }] } }] } };
  const mr = await Vision.menu('B64', { provider: 'gemini', key: 'g', model: 'm' });
  assert.ok(last.url.includes('generateContent')); assert.strictEqual(last.body.contents[0].parts[0].inline_data.data, 'B64');
  assert.strictEqual(mr.dishes.length, 1, 'descarta platos imposibles'); assert.strictEqual(mr.dishes[0].hc100, 25.7);
  // Grasa y proteína (DeepSeek, solo texto, en el mismo orden)
  next = { body: { choices: [{ message: { content: JSON.stringify({ alimentos: [{ nombre: 'Pizza', grasa_por_100g: 10, proteina_por_100g: 11 }, { nombre: 'Coca', grasa_por_100g: 0, proteina_por_100g: 0 }], notas: '' }) } }] } };
  const mm = await Vision.macros([{ name: 'Pizza', grams: 300 }, { name: 'Coca', grams: 330 }], { provider: 'deepseek', key: 'd' });
  assert.ok(last.url.startsWith('https://api.deepseek.com/chat/completions')); assert.ok(last.body.messages[1].content.includes('Pizza — 300 g'));
  assert.deepStrictEqual(mm.per[0], { fat100: 10, prot100: 11 });
  // ¿Por qué? : se quitan las frases con dosis o cambios de ratio
  next = { body: { choices: [{ message: { content: '```json\n' + JSON.stringify({ resumen: 'Subiste tras la pizza. Ponte 2 U más.', puntos: ['La comida tenía mucha grasa', 'Aumenta tu ratio de la cena'], probar: ['Pinchar 15 min antes'], medico: ['¿Me conviene repartir la dosis en comidas grasas?'] }) + '\n```' } }] } };
  const why = await Vision.why('contexto', { provider: 'deepseek', key: 'd' });
  assert.strictEqual(why.summary, 'Subiste tras la pizza.'); assert.deepStrictEqual(why.points, ['La comida tenía mucha grasa']); assert.strictEqual(why.cut, 2);
  assert.strictEqual(why.doctor.length, 1, 'una pregunta sin cifras se mantiene');
  assert.ok(last.body.messages[0].content.includes('Nunca des cantidades de insulina'));
  // Estimación de plato: guarda grasa y proteína si vienen
  const pe = Vision.parseText(JSON.stringify({ alimentos: [{ nombre: 'Pizza', gramos: 300, hc_por_100g: 30, grasa_por_100g: 10, proteina_por_100g: 11, confianza: 'media' }], notas: '' }));
  assert.strictEqual(pe.items[0].fat100, 10); assert.strictEqual(pe.items[0].prot100, 11);

  console.log('vision: todas las pruebas pasan');
})().catch((e) => { console.error(e); process.exit(1); });
