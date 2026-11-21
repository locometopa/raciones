package es.locometopa.raciones;

import android.content.Context;
import android.content.Intent;
import android.os.Bundle;

/* Pasa cada lectura a xDrip+ con el mismo aviso que usaba la app de Libre parcheada.
   En xDrip+: fuente de datos «Libre2 (patched app)». Desde ahí xDrip+ la manda a relojes Amazfit, Mi Band, etc. */
class XDrip {
    static final String ACTION = "com.librelink.app.ThirdPartyIntegration.GLUCOSE_READING";

    static void send(Context c, int mgdl, long t) {
        try {
            if (IocrinoPlugin.prefs(c).getLong("xdripT", 0) >= t) return;
            Bundle b = new Bundle();
            b.putDouble("glucose", mgdl);
            b.putLong("timestamp", t);
            Bundle ble = new Bundle(); ble.putString("sensorSerial", "iocrino"); b.putBundle("bleManager", ble);
            Bundle cur = new Bundle(); cur.putLong("sensorStartTime", IocrinoPlugin.prefs(c).getLong("sensorStart", t - 86400000L));
            Bundle sas = new Bundle(); sas.putBundle("currentSensor", cur); b.putBundle("sas", sas);
            Intent it = new Intent(ACTION).putExtras(b).setPackage("com.eveningoutpost.dexdrip").addFlags(Intent.FLAG_INCLUDE_STOPPED_PACKAGES);
            c.sendBroadcast(it);
            IocrinoPlugin.prefs(c).edit().putLong("xdripT", t).apply();
        } catch (Exception ignored) { }
    }
}
