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

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(IocrinoPlugin.class);
        IocrinoPlugin.takeIntent(this, getIntent());
        super.onCreate(savedInstanceState);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        IocrinoPlugin.takeIntent(this, intent);
        super.onNewIntent(intent);
    }
}
`);
xml = fs.readFileSync(mf, 'utf8');
if (!xml.includes('GlucoseService')) {
  const rcv = (cls, label, info) => `    <receiver android:name=".${cls}" android:exported="false" android:label="@string/${label}">
            <intent-filter><action android:name="android.appwidget.action.APPWIDGET_UPDATE" /></intent-filter>
            <meta-data android:name="android.appwidget.provider" android:resource="@xml/${info}" />
        </receiver>
`;
  xml = xml.replace('</application>', rcv('GlucoseWidget', 'widget_label', 'widget_glucose_info') + rcv('GlucoseWidgetSmall', 'widget_label_small', 'widget_small_info') +
    rcv('GlucoseWidgetTall', 'widget_label_tall', 'widget_tall_info') + rcv('GlucoseWidgetBig', 'widget_label_big', 'widget_big_info') + rcv('GlucoseWidgetWide', 'widget_label_wide', 'widget_wide_info') + `    <receiver android:name=".NotifAction" android:exported="false" />
        <service android:name=".GlucoseService" android:exported="false" android:foregroundServiceType="specialUse">
            <property android:name="android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE" android:value="Mostrar en la barra y en la pantalla de bloqueo la glucosa del sensor en tiempo real" />
        </service>
        <receiver android:name=".BootReceiver" android:exported="true">
            <intent-filter><action android:name="android.intent.action.BOOT_COMPLETED" /><action android:name="android.intent.action.MY_PACKAGE_REPLACED" /></intent-filter>
        </receiver>
        <service android:name=".GlucoseTile" android:exported="true" android:label="@string/tile_label" android:icon="@drawable/ic_stat_iocrino" android:permission="android.permission.BIND_QUICK_SETTINGS_TILE">
            <intent-filter><action android:name="android.service.quicksettings.action.QS_TILE" /></intent-filter>
        </service>
` + '    </application>');
  // Atajos al mantener pulsado el icono
  xml = xml.replace(/(<activity[^>]*\.MainActivity"[\s\S]*?<\/intent-filter>)/, '$1\n            <meta-data android:name="android.app.shortcuts" android:resource="@xml/shortcuts" />');
  if (!xml.includes('android.app.shortcuts')) throw new Error('No se pudieron añadir los atajos');
  const perms = ['POST_NOTIFICATIONS', 'FOREGROUND_SERVICE', 'FOREGROUND_SERVICE_SPECIAL_USE', 'RECEIVE_BOOT_COMPLETED', 'WAKE_LOCK'].filter((x) => !xml.includes('android.permission.' + x));
  xml = xml.replace('<uses-permission android:name="android.permission.INTERNET" />', '<uses-permission android:name="android.permission.INTERNET" />' + perms.map((x) => '\n    <uses-permission android:name="android.permission.' + x + '" />').join(''));
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
