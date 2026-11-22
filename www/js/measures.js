/* Medidas de casa: para elegir gramos o mililitros sin báscula. Valores aproximados y redondeados,
   tomados de los tamaños habituales en España (vaso de agua, taza de desayuno, plato hondo…). */
var Measures = (function () {
  'use strict';
  function n(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  var M = {
    leche: [['Taza de café', 100], ['Vaso', 200], ['Taza de desayuno', 250], ['Tazón grande', 350]],
    lata: [['Botellín', 200], ['Lata', 330], ['Vaso', 200], ['Botella pequeña', 500]],
    cerveza: [['Caña', 200], ['Tercio', 330], ['Lata', 330], ['Pinta', 500]],
    zumo: [['Vaso pequeño', 150], ['Vaso', 200], ['Brick pequeño', 200], ['Vaso grande', 300]],
    liquido: [['Vaso pequeño', 150], ['Vaso', 200], ['Taza de desayuno', 250], ['Tazón', 350]],
    barra: [['Rebanada fina', 20], ['Trozo de una mano', 40], ['Cuarto de barra', 60], ['Media barra', 120]],
    molde: [['1 rebanada', 25], ['2 rebanadas', 50], ['3 rebanadas', 75]],
    biscote: [['1 biscote', 8], ['2 biscotes', 16], ['4 biscotes', 32]],
    cocido: [['Cucharada colmada', 30], ['Cazo de servir', 100], ['Plato pequeño', 150], ['Plato hondo normal', 200], ['Plato hondo lleno', 300]],
    crudo: [['Puñado', 30], ['Ración en crudo', 70], ['Ración grande en crudo', 100]],
    guiso: [['Plato pequeño', 200], ['Plato hondo normal', 300], ['Plato hondo lleno', 400]],
    tortilla: [['Pincho', 80], ['Ración', 150], ['Ración grande', 220]],
    pizza: [['Porción', 100], ['Media pizza', 200], ['Pizza individual', 350]],
    patata: [['Patata pequeña', 100], ['Patata mediana', 170], ['Patata grande', 250]],
    fritas: [['Ración pequeña', 80], ['Ración', 120], ['Ración grande', 180]],
    fruta: [['Pieza pequeña', 100], ['Pieza mediana', 150], ['Pieza grande', 200]],
    platano: [['Plátano pequeño', 90], ['Plátano mediano', 120], ['Plátano grande', 150]],
    mandarina: [['1 mandarina', 70], ['2 mandarinas', 140], ['3 mandarinas', 210]],
    puñadoFruta: [['Puñado', 80], ['Cuenco pequeño', 150], ['Cuenco', 250]],
    raja: [['Raja fina', 150], ['Raja', 250], ['Raja grande', 400]],
    yogur: [['1 yogur', 125], ['2 yogures', 250], ['Yogur grande', 200]],
    queso: [['Loncha', 20], ['Taco', 30], ['Ración', 60]],
    verdura: [['Guarnición', 100], ['Plato', 200], ['Plato grande', 300]],
    azucar: [['Cucharadita', 5], ['Cucharada', 15], ['Cucharada colmada', 20]],
    galleta: [['2 galletas', 12], ['4 galletas', 25], ['6 galletas', 36], ['8 galletas', 50]],
    chocolate: [['Onza', 10], ['3 onzas', 30], ['Media tableta', 50]],
    bolleria: [['Pieza pequeña', 40], ['Pieza normal', 60], ['Pieza grande', 90]],
    helado: [['Bola', 60], ['2 bolas', 120], ['Tarrina', 150]],
    cereales: [['Puñado', 30], ['Tazón', 40], ['Tazón grande', 60]],
    seco: [['Puñado pequeño', 20], ['Puñado', 30], ['Bolsita', 50]],
    general: [['Cucharada sopera', 15], ['Puñado', 30], ['Ración pequeña', 60], ['Ración', 100], ['Ración grande', 150]]
  };
  var RULES = [
    [/cerveza/, 'cerveza'], [/refresco|tonica|isotonica|cola|gaseosa|energetica/, 'lata'], [/zumo|nectar|smoothie/, 'zumo'],
    [/leche|cafe|cacao|cola cao|colacao|batido|bebida de (avena|soja|almendra|arroz)|infusion|te /, 'leche'], [/gazpacho|caldo|sopa|crema/, 'liquido'],
    [/pan de molde|molde/, 'molde'], [/biscote|tostad/, 'biscote'], [/pan|baguette|chapata|bollo de pan/, 'barra'],
    [/tortilla/, 'tortilla'], [/pizza/, 'pizza'], [/patatas? fritas|chips/, 'fritas'], [/patata|boniato/, 'patata'],
    [/crud[oa]s?/, 'crudo'], [/arroz|pasta|macarron|espagueti|fideo|cuscus|quinoa|lenteja|garbanzo|alubia|judia blanca|guisante/, 'cocido'],
    [/paella|cocido|potaje|fabada|guis|lasana|canelon|estofado|puchero|migas/, 'guiso'],
    [/platano/, 'platano'], [/mandarina/, 'mandarina'], [/uva|cereza|fresa|arandano|frambuesa/, 'puñadoFruta'], [/sandia|melon/, 'raja'],
    [/yogur|natillas|flan|cuajada/, 'yogur'], [/queso/, 'queso'],
    [/azucar|miel|mermelada|sirope|cacao en polvo/, 'azucar'], [/galleta/, 'galleta'], [/chocolate|bombon/, 'chocolate'],
    [/croissant|cruasan|magdalena|donut|bolleria|napolitana|ensaimada|bizcocho|tarta|churro|porra/, 'bolleria'], [/helado/, 'helado'],
    [/cereales|copos|muesli|avena/, 'cereales'], [/almendra|nuez|nueces|cacahuete|pistacho|anacardo|pipas|avellana|frutos secos/, 'seco']
  ];
  var BYCAT = { 'Fruta': 'fruta', 'Verduras': 'verdura', 'Platos': 'guiso', 'Lácteos': 'yogur', 'Pan y cereales': 'barra', 'Legumbres y patata': 'cocido', 'Dulces': 'azucar', 'Bebidas': 'liquido', 'Frutos secos': 'seco' };

  /* Medidas para un alimento: [[nombre, cantidad], …] en la unidad del alimento (g o ml). Nada para unidades. */
  function forFood(name, unit, cat) {
    if (unit === 'ud') return [];
    var k = null, nn = n(name);
    for (var i = 0; i < RULES.length && !k; i++) if (RULES[i][0].test(nn)) k = RULES[i][1];
    if (!k && cat && BYCAT[cat]) k = BYCAT[cat];
    if (unit === 'ml') { if (!k || ['leche', 'lata', 'cerveza', 'zumo', 'liquido'].indexOf(k) < 0) k = 'liquido'; }
    else if (['leche', 'lata', 'cerveza', 'zumo', 'liquido'].indexOf(k) >= 0) k = 'general';
    return (M[k] || M.general).slice();
  }
  var api = { forFood: forFood, M: M };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  return api;
})();
