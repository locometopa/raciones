/* Reglas de ejercicio y de días de enfermedad. Funciones puras, sin pantalla, para poder probarlas.
   Ejercicio: consenso internacional de Riddell y cols., Lancet Diabetes Endocrinol 2017.
   Cetonas en sangre: umbrales habituales de las guías de días de enfermedad (ISPAD 2022 y similares). */
var Guides = (function () {
  'use strict';

  /* Qué hacer según la glucosa antes de empezar. k: low | carb10 | ok | high | ketones */
  function preExercise(g) {
    if (g == null || isNaN(g)) return { k: 'nog', tone: 'info', t: 'Lee el Libre o mídete antes de empezar.' };
    if (g < 90) return { k: 'low', tone: 'bad', t: 'Por debajo de 90: toma 10–20 g de hidratos rápidos y no empieces hasta pasar de 90.' };
    if (g < 126) return { k: 'carb10', tone: 'warn', t: 'Entre 90 y 125: toma unos 10 g de hidratos antes de empezar (sobre todo si es ejercicio de fondo: andar, bici, correr).' };
    if (g < 182) return { k: 'ok', tone: 'ok', t: 'Entre 126 y 180: buen punto para empezar.' };
    if (g <= 270) return { k: 'high', tone: 'info', t: 'Entre 182 y 270: puedes empezar. El ejercicio muy intenso (pesas, sprints) puede subirte aún más.' };
    return { k: 'ketones', tone: 'warn', t: 'Por encima de 270: mide cetonas antes. Si están en 1,5 o más, no hagas ejercicio hoy; si están entre 0,6 y 1,4, corrige primero.' };
  }

  /* Cuánto bajar la rápida de la comida si haces ejercicio en las ~2 h siguientes.
     level: suave | moderado | intenso; min: duración. Devuelve % o null si no hay recomendación. */
  function bolusCut(level, min) {
    var long = (+min || 0) > 45;
    if (level === 'suave') return long ? 50 : 25;
    if (level === 'moderado') return long ? 75 : 50;
    if (level === 'intenso') return long ? null : 75;
    return null;
  }

  /* Plan completo para la pantalla. o: {g, level, min, kind ('fondo'|'mixto'|'fuerza'), meal (bool: comerás antes)} */
  function exercisePlan(o) {
    var out = { pre: preExercise(o.g), tips: [] };
    out.cut = o.meal ? bolusCut(o.level, o.min) : null;
    if (o.kind === 'fuerza') out.tips.push('Las pesas y los sprints suelen subir la glucosa al principio por la adrenalina. No corrijas enseguida: suele bajar sola después.');
    if ((+o.min || 0) >= 60 && o.kind !== 'fuerza') out.tips.push('Para más de una hora: lleva hidratos rápidos y mira cada 30 minutos. Muchas personas necesitan 20–30 g de hidratos por hora.');
    if (o.level === 'intenso' && (+o.min || 0) > 45) out.tips.push('Para ejercicio intenso y largo no hay una reducción fija de la rápida: pruébalo con cuidado y apunta qué pasa.');
    out.tips.push('Después, la glucosa puede seguir bajando hasta 24 h, también de noche. Mira antes de dormir y ten azúcar a mano.');
    return out;
  }

  /* Cetonas en sangre (mmol/L). */
  function ketone(mmol) {
    var v = +String(mmol).replace(',', '.');
    if (!(v >= 0)) return null;
    if (v < 0.6) return { k: 'normal', tone: 'ok', t: 'Normal (menos de 0,6).' };
    if (v < 1.5) return { k: 'algo', tone: 'warn', t: 'Algo altas (0,6 a 1,4). Bebe agua, corrige si estás alto según tu pauta y vuelve a medir en 2 horas.' };
    if (v < 3) return { k: 'alta', tone: 'bad', t: 'Altas (1,5 a 2,9). Llama hoy a tu equipo de diabetes. Bebe, corrige según tu pauta y vuelve a medir en 1–2 horas. No hagas ejercicio.' };
    return { k: 'muy', tone: 'bad', t: 'Muy altas (3 o más): riesgo de cetoacidosis. Ve a urgencias o llama al 112.' };
  }

  /* Normas de días de enfermedad (generales). */
  var SICK_RULES = [
    ['Nunca dejes la lenta', 'Aunque no comas, el cuerpo necesita su insulina lenta. Si estás enfermo, a menudo hace falta más insulina, no menos.'],
    ['Mira la glucosa a menudo', 'Al menos cada 2–3 horas, también de noche. Con el Libre es un vistazo.'],
    ['Cetonas si pasas de 250', 'Si tienes medidor de cetonas en sangre, mídelas cada 2–4 horas mientras estés alto o con vómitos.'],
    ['Bebe un vaso cada hora', 'Agua o líquidos sin azúcar, a sorbos si tienes náuseas: unos 100–200 ml cada hora.'],
    ['Si no puedes comer, hidratos en líquido', 'Zumo, leche, caldo con arroz o fideos, yogur… a poquitos, para no bajar y poder seguir con la insulina.']
  ];
  var SICK_HELP = [
    'Vomitas más de una o dos veces o no retienes los líquidos.',
    'Las cetonas en sangre están en 1,5 o más, o no bajan.',
    'La glucosa sigue por encima de 250 después de dos correcciones.',
    'Dolor de tripa, respiración rápida, aliento afrutado, mucho sueño o confusión: esto es urgente (112).',
    'Tienes bajadas que no consigues subir.'
  ];

  var api = { preExercise: preExercise, bolusCut: bolusCut, exercisePlan: exercisePlan, ketone: ketone, SICK_RULES: SICK_RULES, SICK_HELP: SICK_HELP };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  return api;
})();
