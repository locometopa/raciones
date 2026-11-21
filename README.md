# Raciones

Calculadora personal de raciones de hidratos y dosis de insulina rápida, con lectura del sensor FreeStyle Libre.
App Android hecha con tecnología web (carpeta `www`) envuelta con Capacitor.

> Ayuda de cálculo personal, no un producto sanitario. Solo calcula con las pautas que el usuario escribe en Ajustes.

## Qué hace

- **Ahora**: glucosa grande con color según tu rango y flecha de tendencia, gráfica de 12 horas (del Libre o de tus lecturas a mano) con tus dosis marcadas, insulina activa y última dosis.
- **Comida**: buscador en línea sobre la tabla base (`www/js/foods.js`, valores aproximados), código de barras (Open Food Facts), hidratos a mano y platos guardados.
- **Cálculo**: comida (hidratos ÷ ratio de la franja) + corrección ((glucosa − objetivo) ÷ sensibilidad) − insulina activa. Con glucosa por debajo del umbral no sugiere dosis. La flecha de tendencia solo avisa, no cambia el número.
- **Libre**: lee la última glucosa, la flecha y la gráfica por LibreLinkUp; se actualiza sola cada minuto con la app abierta (`www/js/libre.js`). No es una API oficial y solo funciona en la app instalada.
- **Foto del plato (opcional, desactivada de serie)**: envía la foto a la API de Claude (`www/js/vision.js`) y propone alimentos y gramos aproximados, que entran en la comida marcados como «estimado por foto» para revisarlos. Se activa en Ajustes con una clave de API propia.
- **Historial**: comidas y dosis registradas, insulina activa y exportación CSV.

Los datos se guardan solo en el dispositivo (Ajustes → Copia de seguridad).

## Probar en el PC

Abre `www/index.html` en el navegador (todo menos el Libre). Pruebas: `npm install` y `npm test`.

## Compilar la APK

- **GitHub Actions** (`.github/workflows/apk.yml`): en cada push a `main` compila y publica la APK en la rama `apk` (descarga directa: https://github.com/locometopa/raciones/raw/apk/raciones.apk).
  Con los secretos `KEYSTORE_B64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS` y `KEY_PASSWORD` sale firmada con clave propia;
  sin ellos sale una APK de pruebas que no se puede actualizar encima de otra (habría que desinstalar y se perderían los datos).
- **En local** (con Android Studio / SDK y JDK 21): `npm install`, `npm run android`, `cd android`, `gradlew assembleDebug`.

La versión se cambia en `package.json`.
