/* Ánimos, trucos, curiosidades, logros e infografías.
   Funciones puras sobre el historial de glucosa y el registro; la app decide cuándo enseñarlas. */
var Coach = (function () {
  'use strict';
  var H = 3600e3, D = 24 * H;

  function dayStart(t) { var d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }
  function dur(ms) { var m = Math.round(ms / 60000), h = Math.floor(m / 60); return h ? h + ' h' + (m % 60 ? ' ' + (m % 60) + ' min' : '') : m + ' min'; }
  function pick(arr, seed) { return arr[Math.abs(seed | 0) % arr.length]; }
  function inR(v, lo, hi) { return v >= lo && v <= hi; }

  /* Estadísticas de un día: n puntos, % en rango, mínimo. */
  function dayStats(hist, start, lo, hi) {
    var p = hist.filter(function (x) { return x[0] >= start && x[0] < start + D; });
    if (!p.length) return { n: 0, tir: null, min: null };
    var ok = p.filter(function (x) { return inR(x[1], lo, hi); }).length;
    return { n: p.length, tir: ok / p.length * 100, min: Math.min.apply(null, p.map(function (x) { return x[1]; })) };
  }

  /* o: {hist, log, now, lo, hi} */
  function stats(o) {
    var hist = o.hist || [], now = o.now || Date.now(), lo = o.lo || 70, hi = o.hi || 180;
    var today = dayStats(hist, dayStart(now), lo, hi);
    // Tiempo seguido en rango hasta ahora (huecos de más de 30 min cortan)
    var run = 0, justBack = false;
    if (hist.length && now - hist[hist.length - 1][0] < 20 * 60000 && inR(hist[hist.length - 1][1], lo, hi)) {
      var i = hist.length - 1, first = hist[i][0];
      while (i > 0 && inR(hist[i - 1][1], lo, hi) && hist[i][0] - hist[i - 1][0] <= 30 * 60000) { i--; first = hist[i][0]; }
      run = hist[hist.length - 1][0] - first;
      justBack = i > 0 && hist[i - 1][1] > hi && run < 45 * 60000;
    }
    // Racha de días anteriores con más del 70 % en rango (con al menos 12 h de datos)
    var streak = 0;
    for (var d = 1; d <= 60; d++) {
      var s = dayStats(hist, dayStart(now) - d * D, lo, hi);
      if (s.n >= 48 && s.tir >= 70) streak++; else break;
    }
    // Días seguidos sin bajar de 70 (con datos)
    var noLow = 0;
    for (var d2 = 1; d2 <= 60; d2++) {
      var s2 = dayStats(hist, dayStart(now) - d2 * D, lo, hi);
      if (s2.n >= 48 && s2.min >= lo) noLow++; else break;
    }
    var week = [];
    for (var k = 6; k >= 0; k--) { var st = dayStats(hist, dayStart(now) - k * D, lo, hi); week.push({ day: dayStart(now) - k * D, tir: st.n >= 8 ? st.tir : null }); }
    var highFor = 0;
    if (hist.length && now - hist[hist.length - 1][0] < 20 * 60000 && hist[hist.length - 1][1] > 250) {
      var j = hist.length - 1; while (j > 0 && hist[j - 1][1] > 250 && hist[j][0] - hist[j - 1][0] <= 30 * 60000) j--;
      highFor = hist[hist.length - 1][0] - hist[j][0];
    }
    return { today: today, run: run, justBack: justBack, streak: streak, noLow: noLow, week: week, highFor: highFor };
  }

  /* Mensaje de ánimo o consejo según la glucosa. c: {g, trend, old, stats, ateRecently, now} → {tone, text} */
  function message(c) {
    var seed = Math.floor((c.now || Date.now()) / (20 * 60000)), s = c.stats || {};
    if (c.g == null || c.old) return { tone: 'info', text: pick(['Lee el Libre o escribe tu glucosa para ver cómo vas.', 'Sin una lectura reciente no puedo decirte nada. Toca la tarjeta para leerla.'], seed) };
    var g = c.g, tr = +c.trend || 0;
    if (g < 70) return { tone: 'bad', text: pick(['Primero lo primero: trata la bajada. Lo demás puede esperar.', 'Bajada a la vista. Toma algo de azúcar y vuelve a mirar en 15 minutos. Lo estás haciendo bien al estar pendiente.'], seed) };
    if (g < 90 && (tr === 1 || tr === 2)) return { tone: 'warn', text: 'Vas bajando y cerca de 70. Ten algo de azúcar a mano por si acaso.' };
    if (g > 250) {
      if (s.highFor >= H) return { tone: 'warn', text: 'Llevas ' + dur(s.highFor) + ' por encima de 250. Comprueba que no se te ha olvidado ninguna dosis y bebe agua. Si tu equipo te indicó medir cetonas, es buen momento.' };
      return { tone: 'warn', text: pick(['Alto, pero tiene arreglo. En Comida, sin añadir alimentos, puedes calcular una corrección (si hace más de 2 h de tu última dosis).', 'Respira: un número alto no es un fracaso. Mira si toca corregir y vuelve a mirar en un rato.'], seed) };
    }
    if (g > 180) {
      if (c.ateRecently && (tr === 4 || tr === 5 || tr === 3)) return { tone: 'info', text: 'Es normal subir después de comer. Mira cómo vas a las 2 horas.' };
      if (tr === 1 || tr === 2) return { tone: 'ok', text: 'Un poco alto, pero ya va bajando. Bien.' };
      return { tone: 'info', text: pick(['Un poco alto. Sin agobios: revisa si falta alguna dosis y vuelve a mirar en un rato.', 'Algo por encima de 180. Un paseo después de comer también ayuda a bajarla.'], seed) };
    }
    // En rango
    var t;
    if (s.justBack) t = pick(['Has vuelto al rango. ¡Bien gestionado!', 'De vuelta entre 70 y 180. Buen trabajo.'], seed);
    else if (s.run >= 3 * H) t = pick(['Llevas ' + dur(s.run) + ' en rango. ¡Así da gusto!', dur(s.run) + ' seguidas en rango. Sigue así.'], seed);
    else if (s.today && s.today.tir != null && s.today.n >= 16 && s.today.tir >= 70) t = 'Hoy vas por un ' + Math.round(s.today.tir) + ' % en rango. ¡Muy bien!';
    else t = pick(['En rango. ¡Bien!', 'Buen número. Disfruta del día.', 'Todo en orden por aquí.', 'Ahí, en tu sitio. Bien hecho.'], seed);
    if (s.streak >= 2) t += ' Y llevas ' + s.streak + ' días seguidos por encima del 70 %.';
    return { tone: 'ok', text: t };
  }

  /* Trucos y curiosidades. ctx() da prioridad cuando encajan con lo que te está pasando. */
  var TIPS = [
    { id: 'rotar', k: 'Truco', x: 'Cambia el sitio del pinchazo cada vez, dentro de la misma zona. Pinchar siempre en el mismo punto crea bultos de grasa donde la insulina se absorbe peor.' },
    { id: 'aguja', k: 'Truco', x: 'Usa una aguja nueva en cada pinchazo: una aguja usada pincha peor y puede doler más.' },
    { id: 'fiasp-guardar', k: 'Truco', x: 'La pluma de Fiasp en uso aguanta hasta 4 semanas fuera de la nevera, siempre por debajo de 30 °C. Apunta en la pluma el día que la empiezas.', ctx: function (c) { return c.rapid === 'Fiasp'; } },
    { id: 'tresiba-guardar', k: 'Truco', x: 'La Tresiba aguanta hasta 8 semanas fuera de la nevera, por debajo de 30 °C. Más que muchas otras insulinas.', ctx: function (c) { return c.basal === 'Tresiba'; } },
    { id: 'tresiba-olvido', k: 'Truco', x: '¿Se te olvidó la Tresiba? Según su ficha, póntela en cuanto te acuerdes y vuelve a tu horario normal, dejando siempre al menos 8 horas entre dos dosis.', ctx: function (c) { return c.basal === 'Tresiba'; } },
    { id: 'calor', k: 'Truco', x: 'El calor estropea la insulina: no la dejes en el coche ni al sol. En verano, mejor en una bolsa isotérmica.' },
    { id: 'orden', k: 'Truco', x: 'Empezar por la verdura y la proteína y dejar el pan o el arroz para el final suele hacer que la glucosa suba menos y más despacio.', ctx: function (c) { return c.highAfterMeals; } },
    { id: 'legumbres', k: 'Truco', x: 'Las legumbres, los integrales y la fruta entera suben la glucosa más despacio que el arroz blanco, el pan blanco o los zumos.', ctx: function (c) { return c.highAfterMeals; } },
    { id: 'grasa', k: 'Truco', x: 'Las comidas con mucha grasa (pizza, fritos) retrasan la subida: a veces sube 3 o 4 horas después. Si te pasa, apúntalo y coméntalo con tu equipo.', ctx: function (c) { return c.highAfterMeals; } },
    { id: 'paseo', k: 'Truco', x: 'Un paseo de 10–15 minutos después de comer ayuda a que la glucosa suba menos.', ctx: function (c) { return c.highAfterMeals; } },
    { id: 'ejercicio', k: 'Truco', x: 'El ejercicio puede seguir bajando la glucosa horas después, incluso por la noche. Si has entrenado, vigila más esa noche.' },
    { id: 'enfermo', k: 'Truco', x: 'Cuando estás enfermo o con mucho estrés la glucosa suele subir aunque comas menos. No dejes la lenta.' },
    { id: 'sensor', k: 'Truco', x: 'El sensor mide en el líquido de debajo de la piel, con unos minutos de retraso respecto a la sangre. Si te encuentras mal y el número no cuadra, mídete en el dedo.' },
    { id: 'conducir', k: 'Truco', x: 'Antes de conducir, mira la glucosa. Si estás bajo o bajando, no conduzcas hasta estar bien.', ctx: function (c) { return c.recentLow; } },
    { id: 'azucar-encima', k: 'Truco', x: 'Lleva siempre algo de azúcar encima: sobres, un zumo pequeño o pastillas. Las bajadas llegan cuando menos te lo esperas.', ctx: function (c) { return c.recentLow; } },
    { id: 'alcohol', k: 'Truco', x: 'El alcohol puede provocar bajadas horas después, sobre todo de noche. Si bebes, come algo y vigila.', ctx: function (c) { return c.recentLow; } },
    { id: 'pesar', k: 'Truco', x: 'Pesa la comida de vez en cuando aunque calcules a ojo: así entrenas el ojo y tus cálculos mejoran.' },
    { id: 'bebidas', k: 'Truco', x: 'Las bebidas con azúcar suben muy rápido. Para la sed, mejor agua o bebidas sin azúcar; el azúcar rápido, para las bajadas.' },
    { id: 'insulina-historia', k: 'Curiosidad', x: 'La insulina se descubrió en 1921 en Toronto (Banting y Best). En enero de 1922 se usó por primera vez en una persona: Leonard Thompson, de 14 años.' },
    { id: 'lata', k: 'Curiosidad', x: 'Una lata de refresco normal (330 ml) tiene unos 35 g de hidratos: 3,5 raciones de golpe.' },
    { id: 'racion-pan', k: 'Curiosidad', x: 'Una ración (10 g de hidratos) son unos 20 g de pan, 2 galletas María o un vaso de leche de 200 ml.' },
    { id: 'platano', k: 'Curiosidad', x: 'Un plátano mediano tiene unas 2 raciones; una mandarina, menos de 1.' },
    { id: 'tir-horas', k: 'Curiosidad', x: 'El objetivo de más del 70 % en rango son casi 17 horas al día entre 70 y 180.' },
    { id: 'tir-a1c', k: 'Curiosidad', x: 'Cada 10 % más de tiempo en rango se asocia a unos 0,5 puntos menos de hemoglobina glicosilada (HbA1c).' },
    { id: 'pancreas', k: 'Curiosidad', x: 'Un páncreas sano suelta un poco de insulina todo el día y un extra al comer. La lenta imita lo primero; la rápida, lo segundo.' },
    { id: 'tresiba-larga', k: 'Curiosidad', x: 'La Tresiba dura más de un día entero: por eso, aunque te la pongas cada 24 h, permite cierta flexibilidad de horario.', ctx: function (c) { return c.basal === 'Tresiba'; } },
    // ---- Sensor ----
    { id: 'compresion', k: 'Truco', x: 'Si duermes encima del sensor, puede marcar una bajada falsa: en la gráfica se ve como una caída brusca que luego vuelve. Si te despierta una alarma así, cambia de postura y, si dudas, mídete en el dedo.', ctx: function (c) { return c.recentLow; } },
    { id: 'vitc', k: 'Truco', x: 'Abbott avisa de que la vitamina C en dosis altas puede subir de forma falsa la lectura del Libre, y la aspirina bajarla un poco. Tenlo en cuenta si tomas suplementos.' },
    { id: 'sensor-dia1', k: 'Truco', x: 'El primer día de un sensor nuevo suele ser el menos exacto. En esas horas, si un número no cuadra con cómo te encuentras, compruébalo en el dedo antes de pincharte.' },
    { id: 'sensor-piel', k: 'Truco', x: 'Para que el sensor pegue bien: piel limpia y seca, sin cremas ni aceite. Si se despega con el sudor o la ducha, hay parches de refuerzo que van por encima.' },
    { id: 'sensor-distancia', k: 'Truco', x: 'Deja unos centímetros entre el sensor y la zona donde te pinchas la insulina: si pinchas muy cerca, la lectura puede alterarse.' },
    { id: 'dedo-lavar', k: 'Truco', x: 'Antes de medirte en el dedo, lávate las manos: un resto de fruta o azúcar en la piel da un número falso. Si no puedes, limpia la primera gota y usa la segunda.' },
    { id: 'velocimetro', k: 'Truco', x: 'Piensa en el sensor como el velocímetro del coche, no como una nota del colegio: te dice por dónde vas para decidir, no si lo estás haciendo bien o mal.' },
    { id: 'sauna', k: 'Truco', x: 'Los baños muy calientes, el jacuzzi o la sauna pueden dar lecturas raras y también bajarte la glucosa. Lleva azúcar a mano.' },
    { id: 'sensor-cambio-tarde', k: 'Truco', x: 'Cambia el sensor cuando tengas tiempo de vigilar, no justo antes de dormir o de un examen: las primeras horas son las menos fiables.' },
    // ---- Bajadas ----
    { id: 'regla-15', k: 'Truco', x: 'La regla 15/15: toma 15 g de hidratos rápidos, espera 15 minutos y vuelve a mirar. Si sigues por debajo de 70, repite.', ctx: function (c) { return c.recentLow; } },
    { id: 'hipo-que-tomar', k: 'Truco', x: 'Unos 15 g de hidratos rápidos son: un vaso pequeño de zumo (150 ml), 3 o 4 pastillas de glucosa o una cucharada de azúcar o miel.', ctx: function (c) { return c.recentLow; } },
    { id: 'hipo-chocolate', k: 'Truco', x: 'Para una bajada, mejor zumo, azúcar o pastillas que chocolate o galletas: la grasa hace que el azúcar entre más despacio.', ctx: function (c) { return c.recentLow; } },
    { id: 'hipo-espera', k: 'Truco', x: 'El sensor va unos minutos por detrás de la sangre. Después de tratar una bajada, espera 15 minutos antes de tomar más aunque el número aún no suba: así evitas el rebote.' },
    { id: 'hipo-tras-hipo', k: 'Truco', x: 'Después de una bajada es más fácil tener otra en las horas siguientes, porque las defensas del cuerpo quedan agotadas. Ese día, vigila un poco más.', ctx: function (c) { return c.recentLow; } },
    { id: 'hipo-antes', k: 'Truco', x: 'Si estás cerca de 70 y bajando rápido, tomar 5–10 g de hidratos un poco antes a veces evita la bajada entera. Pregunta a tu equipo si te encaja.' },
    { id: 'hipo-sintomas', k: 'Curiosidad', x: 'No hace falta estar por debajo de 70 para notar una bajada: si vienes de estar alto y bajas rápido, puedes notar temblor o nervios con 100.' },
    { id: 'hipo-no-notar', k: 'Truco', x: 'Si te das cuenta de que ya no notas las bajadas, coméntalo con tu equipo: tiene solución y suele mejorar evitando bajadas unas semanas.' },
    { id: 'glucagon', k: 'Truco', x: 'Enseña a alguien de confianza dónde guardas el glucagón y cómo se usa. Es para una bajada fuerte en la que tú no puedas tomar nada.' },
    // ---- Subidas ----
    { id: 'no-pasarse', k: 'Truco', x: 'Ante un alto, la tentación es corregir mucho. Cuenta la insulina que aún te queda activa (la app la descuenta) y espera: dos correcciones seguidas suelen acabar en bajada.' },
    { id: 'agua', k: 'Truco', x: 'Estar deshidratado puede subir la glucosa. Cuando estés alto, bebe agua.' },
    { id: 'cetonas', k: 'Truco', x: 'Si estás por encima de 250 durante horas y te encuentras mal (náuseas, dolor de tripa), mide cetonas si tu equipo te dio tiras, y llama si salen altas.' },
    { id: 'insulina-estropeada', k: 'Truco', x: '¿Altos sin explicación varios días? Puede que la pluma se haya calentado o congelado y funcione peor. Prueba con una nueva.' },
    { id: 'alba', k: 'Curiosidad', x: 'El «fenómeno del alba»: entre las 4 y las 8 de la mañana el cuerpo suelta hormonas que suben la glucosa. Por eso a veces te despiertas alto sin haber comido nada.' },
    { id: 'somogyi', k: 'Truco', x: 'Un alto al despertar no siempre es por falta de insulina: a veces viene de una bajada de madrugada y el rebote. Mira la gráfica de la noche antes de cambiar nada.' },
    { id: 'cena-grande', k: 'Truco', x: 'Las cenas grandes, tardías y con mucha grasa suelen dar noches más altas. Si te pasa, prueba a cenar antes o más ligero y mira la diferencia.', ctx: function (c) { return c.highAfterMeals; } },
    { id: 'alto-resistencia', k: 'Curiosidad', x: 'Estar alto mucho rato hace que la insulina funcione peor durante un tiempo. Por eso bajar de 300 cuesta más que bajar de 200.' },
    // ---- Comida ----
    { id: 'liquidos', k: 'Truco', x: 'Los hidratos bebidos suben antes que los masticados, aunque sean los mismos gramos: un zumo sube más rápido que la fruta entera.' },
    { id: 'fibra', k: 'Truco', x: 'Cuanta más fibra tiene un alimento respecto a sus hidratos, menos te suele subir: legumbres, verdura e integrales juegan a tu favor.' },
    { id: 'etiqueta', k: 'Truco', x: 'En la etiqueta, mira «Hidratos de carbono», no solo «azúcares»: el pan o la pasta casi no tienen azúcar y suben igual.' },
    { id: 'cafe', k: 'Curiosidad', x: 'A algunas personas el café les sube un poco la glucosa por la mañana, incluso sin azúcar. El té suele afectar menos.' },
    { id: 'proteina', k: 'Curiosidad', x: 'La proteína apenas sube la glucosa si hay insulina, pero una comida de mucha carne o pescado sin hidratos puede subirla algo horas después.' },
    { id: 'platano-maduro', k: 'Curiosidad', x: 'Un plátano muy maduro sube más y más rápido que uno algo verde: al madurar, su almidón se convierte en azúcar.' },
    { id: 'pasta-dente', k: 'Truco', x: 'La pasta al dente suele subir algo más despacio que la muy cocida.' },
    { id: 'plato-pequeno', k: 'Truco', x: 'Un plato más pequeño hace que te sirvas menos sin darte cuenta. Lo que ves en la mesa influye en lo que comes.' },
    { id: 'fuera', k: 'Truco', x: 'Comiendo fuera: compara con lo que pesas en casa para calcular a ojo, pide la guarnición de verdura y apunta lo que comiste para aprender de cómo te sentó.' },
    { id: 'alcohol-mezcla', k: 'Truco', x: 'Con alcohol: los refrescos y zumos de las mezclas suben, y el alcohol después baja. Come algo, no te pongas insulina de más y mira antes de dormir.' },
    // ---- Insulina ----
    { id: 'contar-10', k: 'Truco', x: 'Después de pincharte, deja la aguja dentro unos 10 segundos antes de sacarla: así no se escapa insulina.' },
    { id: 'purgar', k: 'Truco', x: 'Antes de cada pinchazo, purga la pluma (2 unidades al aire) para comprobar que sale insulina y que no hay aire.' },
    { id: 'musculo', k: 'Curiosidad', x: 'Si la insulina va al músculo en vez de a la grasa, se absorbe más rápido y puede dar bajadas, sobre todo si luego haces ejercicio. Por eso se pincha en pellizco o con aguja corta.' },
    { id: 'bultos', k: 'Truco', x: 'De vez en cuando, pasa los dedos por donde te pinchas: si notas bultos o zonas duras, deja de pinchar ahí. La insulina entra mal y da números raros.' },
    { id: 'nevera', k: 'Truco', x: 'Las plumas de repuesto, en la nevera entre 2 y 8 °C, lejos del congelador y de la pared del fondo, donde a veces se congela.' },
    { id: 'momento-dosis', k: 'Curiosidad', x: 'Ponerte la rápida un rato antes de comer (lo que te diga tu equipo) suele hacer que el pico de después sea menor que pinchártela al acabar.' },
    // ---- Ejercicio ----
    { id: 'ej-intenso', k: 'Curiosidad', x: 'Las pesas o los sprints pueden subir la glucosa al principio por la adrenalina, y bajarla horas después. Caminar o la bici suave suelen bajarla poco a poco.' },
    { id: 'ej-novato', k: 'Curiosidad', x: 'Cuando empiezas a hacer deporte la glucosa baja mucho; conforme te pones en forma, baja menos. Revisa tus ajustes cada cierto tiempo.' },
    { id: 'ej-insulina', k: 'Truco', x: 'Hacer ejercicio poco después de la rápida aumenta el riesgo de bajada. Si puedes, muévete 2–3 horas después de la dosis o habla con tu equipo de reducirla.' },
    // ---- Vida diaria ----
    { id: 'sueno', k: 'Curiosidad', x: 'Dormir poco hace que la insulina funcione peor al día siguiente y que la glucosa esté más movida. Dormir bien también es tratamiento.' },
    { id: 'quemadura', k: 'Curiosidad', x: 'Una quemadura de sol es un estrés para el cuerpo y puede subir la glucosa. Crema solar también por eso.' },
    { id: 'corticoides', k: 'Truco', x: 'Los corticoides (prednisona y similares) suben mucho la glucosa mientras los tomas. Si te los mandan, avisa a tu equipo de diabetes.' },
    { id: 'prospectos', k: 'Truco', x: 'Otros medicamentos pueden subir o bajar la glucosa. Cuando empieces uno nuevo, mira el prospecto o pregunta en la farmacia.' },
    { id: 'mirar-mas', k: 'Curiosidad', x: 'Mirar la glucosa más a menudo se asocia con más tiempo en rango y menos bajadas. Un vistazo rápido vale mucho.' },
    { id: 'cinco-claves', k: 'Curiosidad', x: 'Hay más de 40 cosas que mueven la glucosa, pero las que más pesan son cinco: cuántos hidratos, de qué tipo, cuánta insulina, cuándo te la pones y lo a menudo que miras.' },
    { id: 'factores-42', k: 'Ánimo', x: 'Hay al menos 42 factores que mueven la glucosa: sueño, estrés, calor, hormonas, una pluma caliente… No todo depende de ti. Un número raro no es un fallo tuyo.' },
    // ---- Viajes ----
    { id: 'viaje-cabina', k: 'Truco', x: 'En avión, la insulina va contigo en cabina, nunca en la maleta facturada: en la bodega puede congelarse. Lleva un informe médico, mejor también en inglés.' },
    { id: 'viaje-doble', k: 'Truco', x: 'De viaje, lleva el doble de material del que creas que vas a usar (agujas, sensores, plumas), repartido en dos bolsas.' },
    { id: 'viaje-horario', k: 'Truco', x: 'Si cruzas varios husos horarios, pregunta antes a tu equipo cómo mover la hora de la lenta.' },
    { id: 'calor-bajadas', k: 'Truco', x: 'Con calor la insulina se absorbe más rápido y hay más bajadas. En verano y en vacaciones, mira más a menudo.' },
    // ---- Curiosidades ----
    { id: 'nobel', k: 'Curiosidad', x: 'En 1923 el Nobel de Medicina fue por la insulina. Banting compartió su parte del premio con Best, su ayudante, porque pensaba que también lo merecía.' },
    { id: 'patente', k: 'Curiosidad', x: 'Banting, Best y Collip vendieron la patente de la insulina a la Universidad de Toronto por 1 dólar cada uno: querían que llegara a todo el mundo.' },
    { id: 'dia-mundial', k: 'Curiosidad', x: 'El Día Mundial de la Diabetes es el 14 de noviembre, el cumpleaños de Frederick Banting. Su símbolo es un círculo azul.' },
    { id: 'gmi', k: 'Curiosidad', x: 'El GMI del informe es una estimación de tu hemoglobina glicosilada a partir del sensor. No siempre coincide con la del análisis, y no pasa nada.' },
    { id: 'manana-resistencia', k: 'Curiosidad', x: 'A mucha gente le hace falta más insulina por ración en el desayuno que en la cena: por la mañana el cuerpo es más resistente a la insulina.' },
    // ---- Ánimo ----
    { id: 'animo-hipo', k: 'Ánimo', x: 'Una bajada puede traer de golpe tristeza, nervios o mal genio. Es el cerebro sin combustible, no eres tú. En cuanto sube, suele pasar.', ctx: function (c) { return c.lowMood; } },
    { id: 'animo-alto', k: 'Ánimo', x: 'Estar alto también afecta: cansancio, irritabilidad y cuesta concentrarse. Si te notas así sin motivo, mira la glucosa.', ctx: function (c) { return c.lowMood; } },
    { id: 'animo-gente', k: 'Ánimo', x: 'Explícale a tu gente que, si te ven raro o irritable, puede ser el azúcar. Que te pregunten con cariño «¿miramos la glucosa?» en vez de discutir.', ctx: function (c) { return c.lowMood; } },
    { id: 'animo-una', k: 'Ánimo', x: 'Si la diabetes te agobia, haz una cosa cada vez: primero la lenta, luego la comida… Muchas tareas pequeñas pesan menos que una montaña.', ctx: function (c) { return c.lowMood; } },
    { id: 'animo-pasos', k: 'Ánimo', x: 'Ponte metas pequeñas y alcanzables: «esta semana, apuntar todas las comidas» funciona mejor que «tenerlo todo perfecto».', ctx: function (c) { return c.lowMood; } },
    { id: 'animo-disfruta', k: 'Ánimo', x: 'Haz hueco cada semana para algo que te guste y no tenga nada que ver con la diabetes. Recargar también cuenta.', ctx: function (c) { return c.lowMood; } },
    { id: 'animo-iguales', k: 'Ánimo', x: 'Hablar con otras personas con diabetes ayuda mucho: las asociaciones de diabetes de tu zona tienen grupos y actividades.', ctx: function (c) { return c.lowMood; } },
    { id: 'animo-equipo', k: 'Ánimo', x: 'En la consulta, cuenta también cómo te sientes, no solo los números. Tu equipo puede ayudarte o derivarte a apoyo psicológico.', ctx: function (c) { return c.lowMood; } },
    { id: 'animo-cansancio', k: 'Ánimo', x: 'Cansarse de la diabetes es muy frecuente: unas 4 de cada 10 personas lo sienten en algún momento. No es falta de voluntad y tiene ayuda.', ctx: function (c) { return c.lowMood; } },
    { id: 'animo-respira', k: 'Ánimo', x: 'El estrés sube la glucosa. Un minuto respirando despacio (4 segundos dentro, 4 fuera) baja las revoluciones. Lo tienes en Aprende.', ctx: function (c) { return c.lowMood; } },
    { id: 'app-tarjeta', k: 'En la app', x: 'Toca la tarjeta de glucosa para leer el Libre al momento.' },
    { id: 'app-plato', k: 'En la app', x: 'Guarda tu desayuno de siempre como plato: la próxima vez son dos toques.', ctx: function (c) { return c.meals >= 3 && !c.plates; } },
    { id: 'app-describir', k: 'En la app', x: '¿Comes fuera? Con la IA activada, «Describir» calcula los hidratos a partir de lo que le cuentes.' },
    { id: 'app-asesor', k: 'En la app', x: 'El asesor de ratios necesita 5 comidas por franja con el Libre conectado. Cuanto más registres, mejor te aconseja.' },
    { id: 'app-informe', k: 'En la app', x: 'Antes de ir al endocrino, comparte el informe desde Registro: tiempo en rango, medias y bajadas en un mensaje.' },
    { id: 'app-borrar', k: 'En la app', x: 'Si te equivocas al registrar algo, bórralo desde Registro con la ✕.' }
  ];

  /* Devuelve el truco nuevo a desbloquear: primero los que encajan contigo, luego en orden. */
  function nextTip(unlocked, c) {
    var free = TIPS.filter(function (t) { return unlocked.indexOf(t.id) < 0; });
    if (!free.length) return null;
    return free.filter(function (t) { return t.ctx && t.ctx(c); })[0] || free.filter(function (t) { return !t.ctx; })[0] || free[0];
  }
  function tip(id) { return TIPS.filter(function (t) { return t.id === id; })[0] || null; }

  /* Logros: a: {meals, plates, daysUsed, basalStreak, stats, reportShared} */
  var ACH = [
    { id: 'primera', t: 'Primera comida', d: 'Registra tu primera comida.', ok: function (a) { return a.meals >= 1; } },
    { id: 'comidas10', t: '10 comidas', d: 'Registra 10 comidas.', ok: function (a) { return a.meals >= 10; } },
    { id: 'comidas50', t: '50 comidas', d: 'Registra 50 comidas.', ok: function (a) { return a.meals >= 50; } },
    { id: 'plato', t: 'Tu primer plato', d: 'Guarda una comida como plato.', ok: function (a) { return a.plates >= 1; } },
    { id: 'lenta7', t: 'Lenta de 7', d: '7 días seguidos con la lenta apuntada.', ok: function (a) { return a.basalStreak >= 7; } },
    { id: 'dia70', t: 'Día en rango', d: 'Un día entero con más del 70 % en rango.', ok: function (a) { return a.stats.streak >= 1; } },
    { id: 'racha3', t: 'Racha de 3', d: '3 días seguidos por encima del 70 % en rango.', ok: function (a) { return a.stats.streak >= 3; } },
    { id: 'racha7', t: 'Semana redonda', d: '7 días seguidos por encima del 70 % en rango.', ok: function (a) { return a.stats.streak >= 7; } },
    { id: 'sinbajadas', t: 'Sin bajadas', d: '7 días seguidos sin bajar de 70.', ok: function (a) { return a.stats.noLow >= 7; } },
    { id: 'semana', t: 'Constancia', d: 'Usa iocrino 7 días distintos.', ok: function (a) { return a.daysUsed >= 7; } },
    { id: 'animo5', t: 'Me escucho', d: 'Apunta tu ánimo 5 veces.', ok: function (a) { return a.moods >= 5; } },
    { id: 'informe', t: 'A la consulta', d: 'Comparte tu primer informe.', ok: function (a) { return !!a.reportShared; } }
  ];
  function achievements(a) { return ACH.map(function (x) { return { id: x.id, t: x.t, d: x.d, ok: !!x.ok(a) }; }); }

  /* ---------- infografías (SVG) ---------- */
  var COL = { in: 'var(--in-b)', hi: 'var(--hi-b)', vhi: 'var(--vhi-b)', lo: 'var(--lo-b)', mut: 'var(--mut)', ink: 'var(--ink)', acc: 'var(--acc)', card: 'var(--card2)' };
  function txt(x, y, s, size, fill, anchor, weight) { return '<text x="' + x + '" y="' + y + '" font-size="' + (size || 12) + '" fill="' + (fill || COL.ink) + '" text-anchor="' + (anchor || 'middle') + '"' + (weight ? ' font-weight="' + weight + '"' : '') + '>' + s + '</text>'; }

  function donut(pctIn, label) {
    var r = 70, c = 2 * Math.PI * r, v = Math.max(0, Math.min(100, pctIn || 0));
    return '<svg viewBox="0 0 340 200" class="ig"><circle cx="100" cy="100" r="' + r + '" fill="none" stroke="' + COL.card + '" stroke-width="22"/>' +
      '<circle cx="100" cy="100" r="' + r + '" fill="none" stroke="' + COL.in + '" stroke-width="22" stroke-linecap="round" stroke-dasharray="' + (c * v / 100).toFixed(1) + ' ' + c.toFixed(1) + '" transform="rotate(-90 100 100)"/>' +
      txt(100, 104, Math.round(v) + ' %', 30, COL.ink, 'middle', 800) + txt(100, 126, 'en rango', 12, COL.mut) +
      txt(195, 80, label || 'Hoy', 15, COL.ink, 'start', 700) + txt(195, 104, 'Objetivo general:', 12, COL.mut, 'start') + txt(195, 122, 'más del 70 %', 13, COL.in, 'start', 700) + txt(195, 146, '≈ 17 h al día', 12, COL.mut, 'start') + '</svg>';
  }
  function weekBars(week) {
    var s = '<svg viewBox="0 0 340 180" class="ig">', bw = 28, gap = 14, x0 = 50, base = 140, hmax = 110;
    s += '<line x1="34" x2="336" y1="' + (base - hmax * 0.7).toFixed(1) + '" y2="' + (base - hmax * 0.7).toFixed(1) + '" stroke="' + COL.in + '" stroke-dasharray="5 4" stroke-width="1.5"/>' + txt(4, base - hmax * 0.7 + 4, '70 %', 10, COL.in, 'start');
    week.forEach(function (d, i) {
      var x = x0 + i * (bw + gap), v = d.tir, h = v == null ? 4 : Math.max(4, hmax * v / 100), col = v == null ? COL.card : v >= 70 ? COL.in : v >= 50 ? COL.hi : COL.vhi;
      s += '<rect x="' + x + '" y="' + (base - h).toFixed(1) + '" width="' + bw + '" height="' + h.toFixed(1) + '" rx="6" fill="' + col + '"/>';
      s += txt(x + bw / 2, base - h - 6, v == null ? '' : Math.round(v), 11, COL.ink);
      s += txt(x + bw / 2, base + 18, new Date(d.day).toLocaleDateString('es-ES', { weekday: 'short' }).slice(0, 2), 11, COL.mut);
    });
    return s + '</svg>';
  }
  var STATIC = [
    { id: 'racion', t: '¿Qué es una ración?', c: 'Cada cuadro tiene unos 10 g de hidratos: 1 ración. Valores aproximados de la tabla de la app.', svg: function () {
      var items = [['🍞', 'Pan blanco', '20 g'], ['🍚', 'Arroz cocido', '35 g'], ['🍝', 'Pasta cocida', '35 g'], ['🥔', 'Patata cocida', '55 g'], ['🍎', 'Manzana', '85 g'], ['🥛', 'Leche', '200 ml'], ['🫘', 'Lentejas cocidas', '60 g'], ['🍪', 'Galletas María', '2 ud']];
      var s = '<svg viewBox="0 0 340 250" class="ig">';
      items.forEach(function (it, i) {
        var x = 8 + (i % 4) * 83, y = 8 + Math.floor(i / 4) * 120;
        s += '<rect x="' + x + '" y="' + y + '" width="76" height="110" rx="12" fill="' + COL.card + '"/>' + txt(x + 38, y + 44, it[0], 32) + txt(x + 38, y + 72, it[1], 9.5, COL.mut) + txt(x + 38, y + 94, it[2], 15, COL.acc, 'middle', 800);
      });
      return s + '</svg>';
    } },
    { id: 'fiasp', t: 'Cómo actúa tu rápida', c: 'Fiasp, según su prospecto: efecto máximo entre 1 y 3 horas y dura entre 3 y 5. Lo que queda es la «insulina activa» que la app descuenta.', svg: function () {
      var pts = [], i; for (i = 0; i <= 60; i++) { var h = i / 10, v = h <= 0 ? 0 : Math.pow(h / 1.6, 1.6) * Math.exp(1.6 * (1 - h / 1.6)); pts.push((30 + h * 50).toFixed(1) + ',' + (150 - v * 110).toFixed(1)); }
      return '<svg viewBox="0 0 340 200" class="ig"><rect x="80" y="30" width="100" height="125" fill="' + COL.acc + '" opacity=".13"/>' + txt(130, 24, 'máximo 1–3 h', 11, COL.acc) +
        '<rect x="180" y="30" width="100" height="125" fill="' + COL.mut + '" opacity=".1"/>' + txt(230, 24, 'se acaba 3–5 h', 11, COL.mut) +
        '<polyline points="' + pts.join(' ') + '" fill="none" stroke="' + COL.ink + '" stroke-width="3" stroke-linejoin="round"/>' +
        '<line x1="30" x2="330" y1="150" y2="150" stroke="' + COL.mut + '"/>' + [0, 1, 2, 3, 4, 5, 6].map(function (h) { return txt(30 + h * 50, 168, h + ' h', 11, COL.mut); }).join('') +
        txt(36, 186, 'pinchazo', 10, COL.mut, 'start') + '</svg>';
    } },
    { id: 'flechas', t: 'Las flechas del Libre', c: 'Cuánto puede cambiar tu glucosa en los próximos 30 minutos según la flecha.', svg: function () {
      var rows = [['↑', 'más de 2 por minuto', '+60 o más', COL.vhi], ['↗', '1–2 por minuto', '+30 a +60', COL.hi], ['→', 'menos de 1', 'estable', COL.in], ['↘', '1–2 por minuto', '−30 a −60', COL.hi], ['↓', 'más de 2 por minuto', '−60 o más', COL.lo]];
      var s = '<svg viewBox="0 0 340 230" class="ig">';
      rows.forEach(function (r, i) { var y = 10 + i * 44; s += '<rect x="6" y="' + y + '" width="328" height="38" rx="10" fill="' + COL.card + '"/>' + txt(32, y + 29, r[0], 28, r[3], 'middle', 700) + txt(64, y + 24, r[1], 12, COL.mut, 'start') + txt(324, y + 25, r[2], 14, COL.ink, 'end', 700); });
      return s + '</svg>';
    } },
    { id: 'plato', t: 'El plato equilibrado', c: 'Una forma sencilla de montar el plato: la mitad verdura, un cuarto proteína y un cuarto hidratos (mejor integrales o legumbres).', svg: function () {
      return '<svg viewBox="0 0 340 210" class="ig"><circle cx="110" cy="105" r="92" fill="' + COL.card + '"/>' +
        '<path d="M110 105 L110 13 A92 92 0 0 0 110 197 Z" fill="var(--in-b)" opacity=".85"/>' +
        '<path d="M110 105 L110 13 A92 92 0 0 1 202 105 Z" fill="var(--hi-b)" opacity=".85"/>' +
        '<path d="M110 105 L202 105 A92 92 0 0 1 110 197 Z" fill="var(--acc)" opacity=".85"/>' +
        txt(62, 110, '🥦', 30) + txt(148, 76, '🍗', 24) + txt(148, 150, '🍞', 24) +
        txt(218, 60, '½ Verdura', 14, COL.in, 'start', 700) + txt(218, 100, '¼ Proteína', 14, COL.hi, 'start', 700) + txt(218, 140, '¼ Hidratos', 14, COL.acc, 'start', 700) + '</svg>';
    } },
    { id: 'rotar', t: 'Rota los pinchazos', c: 'Cambia de sitio cada vez dentro de la misma zona y separa cada pinchazo unos centímetros del anterior. Evita los bultos.', svg: function () {
      var s = '<svg viewBox="0 0 340 200" class="ig"><rect x="70" y="20" width="200" height="160" rx="70" fill="' + COL.card + '"/><circle cx="170" cy="100" r="6" fill="' + COL.mut + '"/>' + txt(170, 124, 'ombligo', 10, COL.mut);
      var spots = [[120, 60], [140, 60], [200, 60], [220, 60], [120, 145], [140, 145], [200, 145], [220, 145]];
      spots.forEach(function (p, i) { s += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="9" fill="' + COL.acc + '" opacity="' + (0.35 + i * 0.08) + '"/>' + txt(p[0], p[1] + 4, i + 1, 10, '#0b2421', 'middle', 700); });
      return s + txt(170, 196, 'Abdomen: ve cambiando de punto', 11, COL.mut) + '</svg>';
    } }
  ];
  function infographics() { return STATIC.map(function (x) { return { id: x.id, t: x.t, c: x.c }; }); }
  function infographic(id) { var x = STATIC.filter(function (s) { return s.id === id; })[0]; return x ? { t: x.t, c: x.c, svg: x.svg() } : null; }


  /* ---------- ánimo ---------- */
  var MOODS = [[1, '😣', 'Fatal'], [2, '😕', 'Mal'], [3, '😐', 'Regular'], [4, '🙂', 'Bien'], [5, '😄', 'Genial']];
  var FEEL = ['Cansado', 'Irritable', 'Nervioso', 'Triste', 'Estresado', 'Sin concentración', 'Con energía', 'Tranquilo'];
  /* Respuesta al apuntar cómo te sientes, según la glucosa de ese momento. o: {mood, g, lo, hi, alto, tags} */
  function moodReply(o) {
    var m = o.mood, g = o.g, tags = o.tags || [];
    if (g != null && g < (o.lo || 70)) return { tone: 'bad', text: 'Estás en ' + Math.round(g) + '. Una bajada puede dar tristeza, nervios o mal genio de golpe: primero trátala. Cuando suba, mira si te sientes distinto.' };
    if (m <= 2 && g != null && g > (o.alto || 250)) return { tone: 'warn', text: 'Estar tan alto cansa y pone de mal humor: no es solo cosa tuya. Mira si toca corregir, bebe agua y date un rato.' };
    if (m <= 2 && g != null && g > (o.hi || 180)) return { tone: 'warn', text: 'Algo alto. Parte de cómo te sientes puede ser el azúcar. Un paseo corto y agua suelen ayudar a las dos cosas.' };
    if (m <= 2) return { tone: 'info', text: tags.indexOf('Estresado') >= 0 || tags.indexOf('Nervioso') >= 0 ? 'El estrés también mueve la glucosa. ¿Probamos un minuto de respiración?' : 'Tu glucosa está bien, así que esto es otra cosa. Está bien tener un mal día. Haz algo pequeño que te guste o habla con alguien.' };
    if (m === 3) return { tone: 'info', text: 'Gracias por apuntarlo. Con unos cuantos días veremos si tu ánimo va de la mano de la glucosa.' };
    return { tone: 'ok', text: g != null && g >= (o.lo || 70) && g <= (o.hi || 180) ? '¡Bien! En rango y de buen humor: buena combinación.' : '¡Me alegro! Apuntado.' };
  }
  /* Ánimo medio según la glucosa en el momento de apuntarlo. */
  function moodStats(log, lo, hi, now, days) {
    var from = (now || Date.now()) - (days || 30) * D, b = { bajo: [], rango: [], alto: [] };
    var es = (log || []).filter(function (e) { return e.ins === 'animo' && e.t >= from; });
    es.forEach(function (e) { if (e.glucose == null) return; (e.glucose < lo ? b.bajo : e.glucose > hi ? b.alto : b.rango).push(e.mood); });
    var avg = function (a) { return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : null; };
    var tags = {}; es.forEach(function (e) { (e.tags || []).forEach(function (t) { tags[t] = (tags[t] || 0) + 1; }); });
    return { n: es.length, all: avg(es.map(function (e) { return e.mood; })), bajo: { n: b.bajo.length, avg: avg(b.bajo) }, rango: { n: b.rango.length, avg: avg(b.rango) }, alto: { n: b.alto.length, avg: avg(b.alto) },
      tags: Object.keys(tags).sort(function (x, y) { return tags[y] - tags[x]; }).map(function (k) { return [k, tags[k]]; }) };
  }
  /* Varios días seguidos sintiéndote mal: 4 o más de las últimas 6 notas en «mal» o «fatal», en distintos días. */
  function lowStreak(log, now) {
    var es = (log || []).filter(function (e) { return e.ins === 'animo' && e.t > (now || Date.now()) - 14 * D; }).sort(function (a, b) { return b.t - a.t; }).slice(0, 6);
    var bad = es.filter(function (e) { return e.mood <= 2; }), days = {};
    bad.forEach(function (e) { days[new Date(e.t).toDateString()] = 1; });
    return bad.length >= 4 && Object.keys(days).length >= 3;
  }
  function moodFace(m) { for (var i = 0; i < MOODS.length; i++) if (MOODS[i][0] === m) return MOODS[i][1]; return ''; }

  var api = { MOODS: MOODS, FEEL: FEEL, moodReply: moodReply, moodStats: moodStats, lowStreak: lowStreak, moodFace: moodFace, stats: stats, message: message, nextTip: nextTip, tip: tip, TIPS: TIPS, achievements: achievements, donut: donut, weekBars: weekBars, infographics: infographics, infographic: infographic, dur: dur };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  return api;
})();
