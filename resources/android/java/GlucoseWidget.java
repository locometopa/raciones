package es.locometopa.raciones;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.DashPathEffect;
import android.graphics.Paint;
import android.graphics.Path;
import android.widget.RemoteViews;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONObject;

/* Widgets de la pantalla de inicio. Este es el mediano (2x1); los demás tamaños heredan de él. */
public class GlucoseWidget extends AppWidgetProvider {
    static final String[] ARROWS = { "", "↓", "↘", "→", "↗", "↑" };
    static final long H = 3600000L;

    protected int layout() { return R.layout.widget_glucose; }
    protected boolean chart() { return false; }

    @Override
    public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        RemoteViews v = views(c, layout(), chart());
        for (int id : ids) m.updateAppWidget(id, v);
    }

    @Override
    public void onEnabled(Context c) {
        try { BgWorker.schedule(c, new JSONObject(IocrinoPlugin.prefs(c).getString("cfg", "{}")).optBoolean("on", false)); } catch (Exception ignored) { }
    }

    static void refreshAll(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        refresh(c, m, GlucoseWidget.class, R.layout.widget_glucose, false);
        refresh(c, m, GlucoseWidgetSmall.class, R.layout.widget_small, false);
        refresh(c, m, GlucoseWidgetTall.class, R.layout.widget_tall, false);
        refresh(c, m, GlucoseWidgetBig.class, R.layout.widget_big, true);
        refresh(c, m, GlucoseWidgetWide.class, R.layout.widget_wide, true);
        GlucoseNotif.update(c);
        GlucoseTile.requestRefresh(c);
    }

    static void refresh(Context c, AppWidgetManager m, Class<?> cls, int layout, boolean chart) {
        int[] ids = m.getAppWidgetIds(new ComponentName(c, cls));
        if (ids == null || ids.length == 0) return;
        RemoteViews v = views(c, layout, chart);
        for (int id : ids) m.updateAppWidget(id, v);
    }

    static PendingIntent open(Context c, String action, int code) {
        Intent it = new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (action != null) it.putExtra("accion", action);
        return PendingIntent.getActivity(c, code, it, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static int colorFor(int g, long ago, JSONObject cfg) {
        if (ago > 20) return 0xFF8A93A3;
        if (g < cfg.optInt("lo", 70)) return 0xFFFF5A5A;
        if (g > cfg.optInt("alto", 250)) return 0xFFF5873B;
        if (g > cfg.optInt("hi", 180)) return 0xFFF0B429;
        return 0xFF7ACC6C;
    }

    static RemoteViews views(Context c, int layout, boolean withChart) {
        RemoteViews v = new RemoteViews(c.getPackageName(), layout);
        SharedPreferences p = IocrinoPlugin.prefs(c);
        String val = "—", arrow = "", sub = "Abre iocrino";
        int color = 0xFFF3F5F8;
        JSONObject cfg = new JSONObject();
        try {
            JSONObject last = new JSONObject(p.getString("last", "{}"));
            cfg = new JSONObject(p.getString("cfg", "{}"));
            if (last.optInt("v", 0) > 0) {
                int g = last.optInt("v"); long t = last.optLong("t"); int tr = last.optInt("trend", 0);
                long ago = (System.currentTimeMillis() - t) / 60000;
                val = String.valueOf(g);
                arrow = tr >= 0 && tr < ARROWS.length ? ARROWS[tr] : "";
                sub = new SimpleDateFormat("HH:mm", Locale.getDefault()).format(new Date(t)) + (ago > 20 ? " · antigua" : "");
                color = colorFor(g, ago, cfg);
            }
        } catch (Exception ignored) { }
        v.setTextViewText(R.id.w_value, val);
        v.setTextColor(R.id.w_value, color);
        v.setTextViewText(R.id.w_arrow, arrow);
        v.setTextColor(R.id.w_arrow, color);
        v.setTextViewText(R.id.w_time, sub);
        v.setOnClickPendingIntent(R.id.w_root, open(c, null, 0));
        if (withChart) {
            boolean big = layout == R.layout.widget_big;
            try { v.setImageViewBitmap(R.id.w_chart, chartBitmap(new JSONArray(p.getString("hist", "[]")), cfg, big ? 6 : 3, big ? 720 : 420)); } catch (Exception ignored) { }
        }
        if (layout == R.layout.widget_big) {
            v.setOnClickPendingIntent(R.id.w_b_comida, open(c, "comida", 11));
            v.setOnClickPendingIntent(R.id.w_b_lenta, open(c, "lenta", 12));
            v.setOnClickPendingIntent(R.id.w_b_bajo, open(c, "bajo", 13));
        }
        return v;
    }

    /* Gráfica de las últimas 6 horas, con la franja de tu rango. */
    static Bitmap chartBitmap(JSONArray hist, JSONObject cfg, int hours, int W) throws Exception {
        int Hh = 220, pad = 8;
        Bitmap b = Bitmap.createBitmap(W, Hh, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(b);
        long now = System.currentTimeMillis(), t0 = now - hours * H;
        float lo = cfg.optInt("lo", 70), hi = cfg.optInt("hi", 180), vmin = 40, vmax = 300;
        float yHi = y(hi, vmin, vmax, Hh, pad), yLo = y(lo, vmin, vmax, Hh, pad);
        Paint bandFill = new Paint(); bandFill.setColor(0x447ACC6C);
        cv.drawRect(0, yHi, W, yLo, bandFill);
        Paint dash = new Paint(Paint.ANTI_ALIAS_FLAG); dash.setColor(0xFFFF5A5A); dash.setStrokeWidth(2); dash.setStyle(Paint.Style.STROKE); dash.setPathEffect(new DashPathEffect(new float[] { 10, 8 }, 0));
        float yHypo = y(cfg.optInt("hypo", 70), vmin, vmax, Hh, pad);
        cv.drawLine(0, yHypo, W, yHypo, dash);
        Paint line = new Paint(Paint.ANTI_ALIAS_FLAG); line.setColor(0xFFF3F5F8); line.setStrokeWidth(5); line.setStyle(Paint.Style.STROKE); line.setStrokeJoin(Paint.Join.ROUND);
        Path path = new Path(); boolean first = true; float lx = 0, ly = 0; int lv = 0;
        for (int i = 0; i < hist.length(); i++) {
            JSONArray pt = hist.getJSONArray(i);
            long t = pt.getLong(0); if (t < t0) continue;
            int g = pt.getInt(1);
            float x = (float) (t - t0) / (hours * H) * (W - 2 * pad) + pad, yy = y(g, vmin, vmax, Hh, pad);
            if (first) { path.moveTo(x, yy); first = false; } else path.lineTo(x, yy);
            lx = x; ly = yy; lv = g;
        }
        if (!first) {
            cv.drawPath(path, line);
            Paint dot = new Paint(Paint.ANTI_ALIAS_FLAG); dot.setColor(colorFor(lv, 0, cfg));
            cv.drawCircle(lx, ly, 10, dot);
        } else {
            Paint tp = new Paint(Paint.ANTI_ALIAS_FLAG); tp.setColor(0xFFA4ADBB); tp.setTextSize(30); tp.setTextAlign(Paint.Align.CENTER);
            cv.drawText(W > 500 ? "Activa la lectura con la app cerrada" : "Sin datos", W / 2f, Hh / 2f, tp);
        }
        return b;
    }

    static float y(float v, float vmin, float vmax, int h, int pad) {
        v = Math.max(vmin, Math.min(vmax, v));
        return pad + (1 - (v - vmin) / (vmax - vmin)) * (h - 2 * pad);
    }
}
