package es.locometopa.raciones;

import android.content.Context;
import android.content.SharedPreferences;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONArray;
import org.json.JSONObject;

/* Puente entre la app (JavaScript) y la parte nativa: lectura en segundo plano, widget y avisos. */
@CapacitorPlugin(name = "Iocrino")
public class IocrinoPlugin extends Plugin {
    static final String PREFS = "iocrino_bg";

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    @PluginMethod
    public void setData(PluginCall call) {
        Context c = getContext();
        String json = call.getString("json", "{}");
        String last = call.getString("last", "");
        SharedPreferences.Editor e = prefs(c).edit().putString("cfg", json);
        boolean on = false;
        try {
            JSONObject cfg = new JSONObject(json);
            on = cfg.optBoolean("on", false);
            // La sesión de la app es más reciente que la nuestra: la usamos
            JSONObject s = cfg.optJSONObject("session");
            if (s != null && s.optString("token", "").length() > 0) e.putString("session", s.toString());
            if (cfg.optLong("sensorStart", 0) > 0) e.putLong("sensorStart", cfg.optLong("sensorStart"));
            if (cfg.optBoolean("xdrip", false) && last != null && last.length() > 2) {
                JSONObject l = new JSONObject(last);
                e.apply();
                XDrip.send(c, l.optInt("v"), l.optLong("t"));
            }
        } catch (Exception ignored) { }
        if (last != null && last.length() > 0) e.putString("last", last);
        // Lo que la app ya tiene de las últimas horas, para la gráfica del widget grande
        String h = call.getString("hist", "");
        if (h != null && h.length() > 2) {
            try {
                java.util.TreeMap<Long, Integer> m = new java.util.TreeMap<>();
                long cut = System.currentTimeMillis() - 24 * 3600000L;
                JSONArray a = new JSONArray(prefs(c).getString("hist", "[]")), b = new JSONArray(h);
                for (JSONArray src : new JSONArray[] { a, b }) for (int i = 0; i < src.length(); i++) { JSONArray pt = src.getJSONArray(i); if (pt.getLong(0) > cut) m.put(pt.getLong(0), pt.getInt(1)); }
                JSONArray out = new JSONArray();
                for (java.util.Map.Entry<Long, Integer> en : m.entrySet()) { JSONArray pt = new JSONArray(); pt.put(en.getKey()); pt.put(en.getValue()); out.put(pt); }
                e.putString("hist", out.toString());
            } catch (Exception ignored) { }
        }
        e.apply();
        BgWorker.schedule(c, on);
        GlucoseWidget.refreshAll(c);  // también actualiza la glucosa fija
        GlucoseNotif.syncService(c);
        call.resolve();
    }

    @PluginMethod
    public void getData(PluginCall call) {
        SharedPreferences p = prefs(getContext());
        JSObject r = new JSObject();
        r.put("hist", p.getString("hist", "[]"));
        r.put("session", p.getString("session", ""));
        int trend = 0;
        try { trend = new JSONObject(p.getString("last", "{}")).optInt("trend", 0); } catch (Exception ignored) { }
        r.put("trend", trend);
        r.put("err", p.getString("err", ""));
        r.put("action", p.getString("action", ""));
        r.put("persistSet", p.getString("persistSet", ""));
        p.edit().remove("persistSet").apply();
        p.edit().remove("action").apply();
        call.resolve(r);
    }

    /* Botón de un widget o atajo del icono: la app lo recoge al abrirse. */
    static void takeIntent(Context c, android.content.Intent it) {
        if (it == null) return;
        String a = it.getStringExtra("accion");
        if (a != null && a.matches("[a-z]{1,12}")) { prefs(c).edit().putString("action", a).apply(); it.removeExtra("accion"); }
    }

    @PluginMethod
    public void runNow(PluginCall call) {
        BgWorker.runOnce(getContext());
        call.resolve();
    }
}
