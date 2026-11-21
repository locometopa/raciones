// Prepara el proyecto Android (carpeta android/, que no se guarda en el repo).
// Uso: npm run android   → después: cd android && gradlew assembleDebug
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const root = path.join(__dirname, '..');
const run = (cmd) => execSync(cmd, { cwd: root, stdio: 'inherit' });

if (!fs.existsSync(path.join(root, 'android'))) run('npx cap add android');
run('npx cap sync android');

// Permiso de cámara (lector de códigos de barras). La cámara no es obligatoria.
const mf = path.join(root, 'android/app/src/main/AndroidManifest.xml');
let xml = fs.readFileSync(mf, 'utf8');
if (!xml.includes('android.permission.CAMERA')) {
  xml = xml.replace('<uses-permission android:name="android.permission.INTERNET" />',
    '<uses-permission android:name="android.permission.INTERNET" />\n    <uses-permission android:name="android.permission.CAMERA" />\n    <uses-feature android:name="android.hardware.camera" android:required="false" />');
  if (!xml.includes('android.permission.CAMERA')) throw new Error('No se pudo añadir el permiso de cámara al manifiesto');
  fs.writeFileSync(mf, xml);
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
