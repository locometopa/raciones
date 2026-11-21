package es.locometopa.raciones;

import android.content.Context;
import com.google.android.gms.wearable.DataMap;
import com.google.android.gms.wearable.PutDataMapRequest;
import com.google.android.gms.wearable.Wearable;
import org.json.JSONObject;

/* Manda cada lectura a la app de iocrino del reloj (Wear OS). Si no hay reloj, no pasa nada. */
class WearSync {
    static void send(Context c, int v, int trend, long t, JSONObject cfg) {
        try {
            if (IocrinoPlugin.prefs(c).getLong("wearT", 0) >= t) return;
            PutDataMapRequest r = PutDataMapRequest.create("/glucosa");
            DataMap m = r.getDataMap();
            m.putInt("v", v); m.putInt("trend", trend); m.putLong("t", t);
            m.putInt("lo", cfg.optInt("lo", 70)); m.putInt("hi", cfg.optInt("hi", 180)); m.putInt("alto", cfg.optInt("alto", 250));
            Wearable.getDataClient(c).putDataItem(r.asPutDataRequest().setUrgent());
            IocrinoPlugin.prefs(c).edit().putLong("wearT", t).apply();
        } catch (Throwable ignored) { }
    }
}
