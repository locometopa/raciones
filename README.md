# iocrino

iocrino (antes «Raciones»): calculadora personal de raciones de hidratos y dosis de insulina rápida, con lectura del sensor FreeStyle Libre. El paquete Android sigue siendo es.locometopa.raciones para que las actualizaciones se instalen encima.
App Android hecha con tecnología web (carpeta `www`) envuelta con Capacitor.

> Ayuda de cálculo personal, no un producto sanitario. Solo calcula con las pautas que el usuario escribe en Ajustes.

## Qué hace

- **Ahora**: glucosa grande con color según tu rango y flecha de tendencia, gráfica de 12 horas (del Libre o de tus lecturas a mano) con tus dosis marcadas, insulina activa y última dosis.
- **Comida**: buscador, botones para describir la comida a la IA (sin foto), foto, código de barras e hidratos a mano, y la lista «En tu plato» con botón de ración normal; tabla base (`www/js/foods.js`, valores aproximados), código de barras (Open Food Facts), hidratos a mano y platos guardados.
- **Cálculo** (explicado en la app, «¿Cómo se calcula?»): comida (hidratos ÷ ratio de la franja) + corrección ((glucosa − objetivo) ÷ sensibilidad) − insulina activa. Con glucosa por debajo del umbral no sugiere dosis. La flecha de tendencia solo avisa, no cambia el número.
- **Libre**: lee la última glucosa, la flecha y la gráfica por LibreLinkUp; se actualiza sola cada minuto con la app abierta (`www/js/libre.js`). No es una API oficial y solo funciona en la app instalada.
- **Foto del plato (opcional, desactivada de serie)**: envía la foto a Claude, Gemini, ChatGPT, DeepSeek u otro servicio compatible con OpenAI (OpenRouter, Ollama, LM Studio) (`www/js/vision.js`). Propone alimentos y gramos aproximados que entran marcados como «estimado por foto». Se activa en Ajustes, con la ayuda para conseguir la clave de cada servicio. GitHub Models no está porque GitHub lo retiró el 30 de julio de 2026.
- **Asistente de configuración**: se abre la primera vez (y desde Ajustes) y pregunta insulinas, ratio, corrección, duración, Libre e IA.
- **Insulinas**: rápida (Fiasp por defecto en el asistente si la eliges) y lenta (Tresiba…). La lenta se apunta desde Ahora y no cuenta como insulina activa.
- **Menos datos que escribir**: cada alimento se añade con la cantidad de la última vez o su ración normal, y hay botones con lo último que has tomado. Bebidas en ml y cosas por unidades (sobres de azúcar, rebanadas, piezas de fruta).
- **Aprendizaje** (`www/js/learn.js`): con la gráfica del Libre mira la glucosa 2–3 h después de cada comida y muestra patrones por franja y por alimento. Solo observa: no cambia las pautas.
- **Asesor de ratios** (Registro): con la glucosa 1–4 h después de cada comida estima la insulina que te habría dejado bien y, con al menos 5 comidas por franja, propone cambios de un 10 % (o bajar si ha habido 2 bajadas de 70). Se aplican solo si confirmas y se pueden deshacer. También estima el factor de sensibilidad con la regla del 1700. Basado en el documento «Ajuste de la dosis de insulina para cubrir la ingesta» (Dra. Barrio y L. Cartaya, 2020).
- **Flechas**: opción para sumar o restar 50/75/100 mg/dL según la flecha (regla del mismo documento).
- **Guía fácil**: explicaciones desde cero dentro de la app.
- **Lenta con dosis fija**: si te pones siempre lo mismo, «Apuntar» es un toque y un aviso diario a tu hora (con botón «Apuntar») te recuerda si aún no la has apuntado.
- **¿Te has pinchado?**: si la glucosa sube 60 mg/dL o más en 2 h hasta pasar de 180 y no hay rápida apuntada en 3 h, avisa en Ahora (se comprueba al abrir la app). Las dosis sueltas (correcciones o comidas sin apuntar) se registran aparte.
- **Estoy bajo**: apunta la bajada (glucosa y lo que has tomado) y avisa a los 15 minutos para volver a mirar.
- **Informe para el endocrino** (Registro): 7/14/30 días con tiempo en rango, media, GMI, variabilidad, insulina diaria, comidas y bajadas; se comparte como texto o CSV. La app guarda el historial de glucosa del Libre hasta 90 días.
- **Copias de seguridad**: a Google Drive (u otro sitio) con el menú compartir, automática diaria a un NAS/servidor por WebDAV, y restauración desde archivo o desde el NAS.
- **Logo**: generado con `scripts/iconos.py` en `resources/android/res` (se copia al compilar).
- **Historial**: comidas y dosis registradas, insulina activa y exportación CSV.

Los datos se guardan solo en el dispositivo (Ajustes → Copia de seguridad).

## Probar en el PC

Abre `www/index.html` en el navegador (todo menos el Libre). Pruebas: `npm install` y `npm test`.

## Compilar la APK

- **GitHub Actions** (`.github/workflows/apk.yml`): en cada push a `main` compila y publica la APK en la rama `apk` (descarga directa: https://github.com/locometopa/raciones/raw/apk/iocrino.apk).
  Con los secretos `KEYSTORE_B64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS` y `KEY_PASSWORD` sale firmada con clave propia;
  sin ellos sale una APK de pruebas que no se puede actualizar encima de otra (habría que desinstalar y se perderían los datos).
- **En local** (con Android Studio / SDK y JDK 21): `npm install`, `npm run android`, `cd android`, `gradlew assembleDebug`.

La versión se cambia en `package.json`.
