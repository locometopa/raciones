package es.locometopa.raciones;

import android.content.Context;
import android.content.SharedPreferences;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
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
        } catch (Exception ignored) { }
        if (last != null && last.length() > 0) e.putString("last", last);
        e.apply();
        BgWorker.schedule(c, on);
        GlucoseWidget.refreshAll(c);
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
        call.resolve(r);
    }

    @PluginMethod
    public void runNow(PluginCall call) {
        BgWorker.runOnce(getContext());
        call.resolve();
    }
}
