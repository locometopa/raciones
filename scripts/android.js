// Prepara el proyecto Android (carpeta android/, que no se guarda en el repo).
// Uso: npm run android   → después: cd android && gradlew assembleDebug
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const root = path.join(__dirname, '..');
const run = (cmd) => execSync(cmd, { cwd: root, stdio: 'inherit' });

// Núcleo JS de Capacitor (registerPlugin) para usar plugins sin empaquetador
fs.copyFileSync(path.join(root, 'node_modules/@capacitor/core/dist/capacitor.js'), path.join(root, 'www/js/capacitor.js'));
if (!fs.existsSync(path.join(root, 'android'))) run('npx cap add android');
run('npx cap sync android');

// Iconos, pantalla de arranque e icono de los avisos (generados con scripts/iconos.py)
const resSrc = path.join(root, 'resources/android/res');
if (fs.existsSync(resSrc)) fs.cpSync(resSrc, path.join(root, 'android/app/src/main/res'), { recursive: true });
const strings = path.join(root, 'android/app/src/main/res/values/strings.xml');
fs.writeFileSync(strings, fs.readFileSync(strings, 'utf8').replace(/(<string name="(app_name|title_activity_main)">)[^<]*/g, '$1iocrino'));

// Permiso de cámara (lector de códigos de barras). La cámara no es obligatoria.
const mf = path.join(root, 'android/app/src/main/AndroidManifest.xml');
let xml = fs.readFileSync(mf, 'utf8');
if (!xml.includes('android.permission.CAMERA')) {
  xml = xml.replace('<uses-permission android:name="android.permission.INTERNET" />',
    '<uses-permission android:name="android.permission.INTERNET" />\n    <uses-permission android:name="android.permission.CAMERA" />\n    <uses-feature android:name="android.hardware.camera" android:required="false" />');
  if (!xml.includes('android.permission.CAMERA')) throw new Error('No se pudo añadir el permiso de cámara al manifiesto');
  fs.writeFileSync(mf, xml);
}

// Permite http:// sin cifrar (solo hace falta para una IA propia en casa, p. ej. Ollama en http://192.168.1.180:11434).
if (!xml.includes('usesCleartextTraffic')) {
  xml = xml.replace('<application', '<application android:usesCleartextTraffic="true"');
  fs.writeFileSync(mf, xml);
}

// Parte nativa propia: lectura del Libre con la app cerrada, widget y avisos (resources/android/java)
const pkgDir = path.join(root, 'android/app/src/main/java/es/locometopa/raciones');
for (const f of fs.readdirSync(path.join(root, 'resources/android/java'))) fs.copyFileSync(path.join(root, 'resources/android/java', f), path.join(pkgDir, f));
fs.writeFileSync(path.join(pkgDir, 'MainActivity.java'), `package es.locometopa.raciones;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(IocrinoPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
`);
xml = fs.readFileSync(mf, 'utf8');
if (!xml.includes('GlucoseWidget')) {
  xml = xml.replace('</application>', `    <receiver android:name=".GlucoseWidget" android:exported="false" android:label="@string/widget_label">
            <intent-filter><action android:name="android.appwidget.action.APPWIDGET_UPDATE" /></intent-filter>
            <meta-data android:name="android.appwidget.provider" android:resource="@xml/widget_glucose_info" />
        </receiver>
    </application>`);
  if (!xml.includes('POST_NOTIFICATIONS')) xml = xml.replace('<uses-permission android:name="android.permission.INTERNET" />', '<uses-permission android:name="android.permission.INTERNET" />\n    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />');
  fs.writeFileSync(mf, xml);
}
const ag = path.join(root, 'android/app/build.gradle');
let agt = fs.readFileSync(ag, 'utf8');
if (!agt.includes('work-runtime')) {
  agt = agt.replace(/dependencies \{/, "dependencies {\n    implementation 'androidx.work:work-runtime:2.10.0'");
  if (!agt.includes('work-runtime')) throw new Error('No se pudo añadir WorkManager');
  fs.writeFileSync(ag, agt);
}

// Versión: la de package.json. 0.1.0 → código 100; 1.2.3 → 10203.
const v = require('../package.json').version;
const [a, b, c] = v.split('.').map(Number);
const code = a * 10000 + b * 100 + c;
const gf = path.join(root, 'android/app/build.gradle');
let g = fs.readFileSync(gf, 'utf8');
g = g.replace(/versionCode \d+/, 'versionCode ' + code).replace(/versionName "[^"]*"/, 'versionName "' + v + '"');
fs.writeFileSync(gf, g);
console.log('Android listo: versión ' + v + ' (código ' + code + ')');
