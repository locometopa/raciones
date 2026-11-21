package es.locometopa.raciones;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import org.json.JSONObject;

/* Widget de la pantalla de inicio: última glucosa, flecha y hora. */
public class GlucoseWidget extends AppWidgetProvider {
    static final String[] ARROWS = { "", "↓", "↘", "→", "↗", "↑" };

    @Override
    public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        for (int id : ids) m.updateAppWidget(id, views(c));
    }

    @Override
    public void onEnabled(Context c) {
        try { BgWorker.schedule(c, new JSONObject(IocrinoPlugin.prefs(c).getString("cfg", "{}")).optBoolean("on", false)); } catch (Exception ignored) { }
    }

    static void refreshAll(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        int[] ids = m.getAppWidgetIds(new ComponentName(c, GlucoseWidget.class));
        if (ids == null || ids.length == 0) return;
        RemoteViews v = views(c);
        for (int id : ids) m.updateAppWidget(id, v);
    }

    static RemoteViews views(Context c) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_glucose);
        SharedPreferences p = IocrinoPlugin.prefs(c);
        String val = "—", arrow = "", sub = "Abre iocrino";
        int color = 0xFFF3F5F8;
        try {
            JSONObject last = new JSONObject(p.getString("last", "{}")), cfg = new JSONObject(p.getString("cfg", "{}"));
            if (last.optInt("v", 0) > 0) {
                int g = last.optInt("v"); long t = last.optLong("t");
                int tr = last.optInt("trend", 0);
                val = String.valueOf(g);
                arrow = tr >= 0 && tr < ARROWS.length ? ARROWS[tr] : "";
                long ago = (System.currentTimeMillis() - t) / 60000;
                sub = new SimpleDateFormat("HH:mm", Locale.getDefault()).format(new Date(t)) + (ago > 20 ? " · antigua" : "");
                if (ago > 20) color = 0xFF8A93A3;
                else if (g < cfg.optInt("lo", 70)) color = 0xFFFF5A5A;
                else if (g > cfg.optInt("alto", 250)) color = 0xFFF5873B;
                else if (g > cfg.optInt("hi", 180)) color = 0xFFF0B429;
                else color = 0xFF7ACC6C;
            }
        } catch (Exception ignored) { }
        v.setTextViewText(R.id.w_value, val);
        v.setTextColor(R.id.w_value, color);
        v.setTextViewText(R.id.w_arrow, arrow);
        v.setTextColor(R.id.w_arrow, color);
        v.setTextViewText(R.id.w_time, sub);
        Intent it = new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        v.setOnClickPendingIntent(R.id.w_root, PendingIntent.getActivity(c, 0, it, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        return v;
    }
}
