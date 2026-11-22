package es.locometopa.raciones;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import java.util.concurrent.TimeUnit;
import org.json.JSONArray;
import org.json.JSONObject;

/* Cada ~15 min: lee el Libre, actualiza el widget y avisa de una posible dosis olvidada (o de una bajada, si se pidió). */
public class BgWorker extends Worker {
    static final String NAME = "iocrino-libre";
    static final String CH = "iocrino_alertas";
    static final long H = 3600000L, M = 60000L;

    public BgWorker(@NonNull Context c, @NonNull WorkerParameters p) { super(c, p); }

    static Constraints net() { return new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build(); }

    static void schedule(Context c, boolean on) {
        WorkManager wm = WorkManager.getInstance(c);
        if (!on) { wm.cancelUniqueWork(NAME); return; }
        PeriodicWorkRequest r = new PeriodicWorkRequest.Builder(BgWorker.class, 15, TimeUnit.MINUTES).setConstraints(net()).build();
        wm.enqueueUniquePeriodicWork(NAME, ExistingPeriodicWorkPolicy.KEEP, r);
    }

    static void runOnce(Context c) {
        OneTimeWorkRequest r = new OneTimeWorkRequest.Builder(BgWorker.class).setConstraints(net()).build();
        WorkManager.getInstance(c).enqueueUniqueWork(NAME + "-ya", ExistingWorkPolicy.REPLACE, r);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context c = getApplicationContext();
        try {
            JSONObject cfg = new JSONObject(IocrinoPlugin.prefs(c).getString("cfg", "{}"));
            if (cfg.optBoolean("on", false)) fetch(c);
        } catch (Exception ignored) { }
        return Result.success();
    }

    /* Una lectura: la usan el trabajo periódico y el servicio de la glucosa fija. Sincronizado para no pisarse. */
    static synchronized void fetch(Context c) {
        SharedPreferences p = IocrinoPlugin.prefs(c);
        try {
            JSONObject cfg = new JSONObject(p.getString("cfg", "{}"));
            if (cfg.optString("email").isEmpty()) return;
            JSONObject[] sess = { null };
            String ss = p.getString("session", "");
            if (!ss.isEmpty()) sess[0] = new JSONObject(ss);
            LibreClient.Reading rd = LibreClient.read(cfg, sess);
            long now = System.currentTimeMillis();

            // Historial de las últimas 24 h ([t, v]), que la app recoge al abrirse
            JSONArray hist = new JSONArray(p.getString("hist", "[]")), keep = new JSONArray();
            long lastT = 0;
            for (int i = 0; i < hist.length(); i++) {
                JSONArray pt = hist.getJSONArray(i);
                if (pt.getLong(0) > now - 24 * H) { keep.put(pt); lastT = Math.max(lastT, pt.getLong(0)); }
            }
            if (rd.t > lastT) { JSONArray pt = new JSONArray(); pt.put(rd.t); pt.put(rd.v); keep.put(pt); if (cfg.optBoolean("xdrip", false)) XDrip.send(c, rd.v, rd.t); WearSync.send(c, rd.v, rd.trend, rd.t, cfg); }
            JSONObject last = new JSONObject(); last.put("v", rd.v); last.put("trend", rd.trend); last.put("t", rd.t);
            p.edit().putString("hist", keep.toString()).putString("last", last.toString()).putString("session", sess[0].toString()).putString("err", "").putLong("fetchT", now).apply();
            GlucoseWidget.refreshAll(c);

            if (now - rd.t < 20 * M) alerts(c, p, cfg, keep, rd, now);
        } catch (Exception e) {
            p.edit().putString("err", String.valueOf(e.getMessage())).apply();
            if (e instanceof LibreClient.StepException) p.edit().remove("session").apply();
            GlucoseNotif.update(c);  // marca la lectura como antigua si toca
        }
    }

    /* Pendiente (mg/dL por minuto) con mínimos cuadrados sobre los últimos 20 minutos. NaN si no hay datos suficientes. */
    static double slope(JSONArray hist, long lastT) throws Exception {
        double n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0; long t0 = Long.MAX_VALUE, t1 = 0;
        for (int i = 0; i < hist.length(); i++) {
            JSONArray pt = hist.getJSONArray(i);
            long t = pt.getLong(0); if (t < lastT - 20 * M || t > lastT) continue;
            double x = (t - lastT) / 60000.0, y = pt.getDouble(1);
            n++; sx += x; sy += y; sxx += x * x; sxy += x * y; t0 = Math.min(t0, t); t1 = Math.max(t1, t);
        }
        if (n < 3 || t1 - t0 < 8 * M) return Double.NaN;
        double d = n * sxx - sx * sx; if (d == 0) return Double.NaN;
        return (n * sxy - sx * sy) / d;
    }

    /* Minutos del día de tus comidas habituales (los manda la app) cerca de ahora: ±90 min. */
    static boolean nearMeal(JSONObject cfg, long now) {
        JSONArray mt = cfg.optJSONArray("mealTimes"); if (mt == null) return false;
        java.util.Calendar cal = java.util.Calendar.getInstance(); cal.setTimeInMillis(now);
        int m = cal.get(java.util.Calendar.HOUR_OF_DAY) * 60 + cal.get(java.util.Calendar.MINUTE);
        for (int i = 0; i < mt.length(); i++) { int d = Math.abs(mt.optInt(i, -999) - m); if (Math.min(d, 1440 - d) <= 90) return true; }
        return false;
    }

    static boolean inNight(JSONObject cfg, long now) {
        if (!cfg.optBoolean("night", false)) return false;
        java.util.Calendar cal = java.util.Calendar.getInstance(); cal.setTimeInMillis(now);
        int m = cal.get(java.util.Calendar.HOUR_OF_DAY) * 60 + cal.get(java.util.Calendar.MINUTE), a = cfg.optInt("nightFrom", 1380), b = cfg.optInt("nightTo", 420);
        return a > b ? (m >= a || m < b) : (m >= a && m < b);
    }

    static void alerts(Context c, SharedPreferences p, JSONObject cfg, JSONArray hist, LibreClient.Reading rd, long now) throws Exception {
        int hypo = cfg.optInt("hypo", 70);
        // Bajada (opcional; la app del Libre ya tiene sus alarmas). Como mucho, un aviso cada 30 min.
        if (cfg.optBoolean("low", false) && rd.v < hypo && now - p.getLong("lowT", 0) > 30 * M) {
            notify(c, 7400, "Glucosa baja: " + rd.v + " mg/dL", "Trátala como te enseñó tu equipo y vuelve a mirar en 15 minutos.", null, null);
            p.edit().putLong("lowT", now).apply();
        }
        // Bajada en camino: aún no estás bajo, pero al ritmo de los últimos 20 min lo estarías en 20 min.
        if (cfg.optBoolean("predict", true) && rd.v >= hypo && rd.v <= hypo + 60 && now - p.getLong("predT", 0) > 30 * M && now - p.getLong("lowT", 0) > 30 * M) {
            double s = slope(hist, rd.t);
            boolean fast = rd.trend == 1 && rd.v <= hypo + 40;
            int pred = Double.isNaN(s) ? -1 : (int) Math.round(rd.v + s * 20);
            if ((!Double.isNaN(s) && s <= -1.0 && pred < hypo) || fast) {
                notify(c, 7402, "Bajada en camino", "Ahora " + rd.v + " mg/dL y bajando" + (pred > 0 ? ": en unos 20 min podrías estar en " + Math.max(40, pred) : " deprisa") + ". Ten azúcar a mano y vuelve a mirar pronto.", null, null);
                p.edit().putLong("predT", now).apply();
            }
        }
        // Alto y subiendo, sin rápida en 2 h: que abra la app para ver la corrección sugerida (de noche también: es seguridad)
        if (cfg.optBoolean("high", true) && rd.v > cfg.optInt("alto", 250) && (rd.trend == 4 || rd.trend == 5)
                && now - cfg.optLong("lastRapid", 0) > 2 * H && now - p.getLong("highT", 0) > 2 * H) {
            notify(c, 7404, "Alto y subiendo: " + rd.v + " " + (rd.trend == 5 ? "↑" : "↗"), "Abre iocrino: te calculo si toca corregir, teniendo en cuenta la flecha y la insulina activa.", "Ver corrección", GlucoseWidget.open(c, "ahora", 23));
            p.edit().putLong("highT", now).apply();
        }
        // Dosis o comida sin apuntar (de noche, en silencio)
        if (!cfg.optBoolean("missed", true) || inNight(cfg, now)) return;
        if (now - cfg.optLong("missedOff", 0) < 3 * H || now - cfg.optLong("lastRapid", 0) < 2 * H || now - p.getLong("missedT", 0) < 3 * H) return;
        int mn2 = rd.v, n2 = 0, mn45 = rd.v, n45 = 0;
        for (int i = 0; i < hist.length(); i++) {
            JSONArray pt = hist.getJSONArray(i); long t = pt.getLong(0);
            if (t >= rd.t - 2 * H) { mn2 = Math.min(mn2, pt.getInt(1)); n2++; }
            if (t >= rd.t - 45 * M) { mn45 = Math.min(mn45, pt.getInt(1)); n45++; }
        }
        // A tu hora habitual de comer: sube 40 o más en 45 min y pasa de 140 → «¿has comido?»
        if (nearMeal(cfg, now) && n45 >= 3 && rd.v >= 140 && rd.v - mn45 >= 40) {
            notify(c, 7403, "¿Has comido?", "Tu glucosa sube (" + rd.v + " mg/dL, +" + (rd.v - mn45) + " en 45 min) y no hay comida ni rápida apuntada.", "Calcular comida", GlucoseWidget.open(c, "comida", 21));
            p.edit().putLong("missedT", now).apply();
            return;
        }
        // Dosis olvidada: igual que en la app. Sube 60 o más en 2 h, está por encima de 180 y no hay rápida en 3 h.
        if (now - cfg.optLong("lastRapid", 0) < 3 * H || rd.v < 180 || n2 < 4 || rd.v - mn2 < 60) return;
        notify(c, 7401, "¿Te has pinchado?", "Tu glucosa ha subido " + (rd.v - mn2) + " mg/dL en 2 horas (ahora " + rd.v + ") y no hay rápida apuntada.", "Abrir iocrino", GlucoseWidget.open(c, "comida", 22));
        p.edit().putLong("missedT", now).apply();
    }

    static void notify(Context c, int id, String title, String body, String actLabel, PendingIntent act) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CH) == null) {
            NotificationChannel ch = new NotificationChannel(CH, "Avisos de glucosa", NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription("Dosis olvidada y bajadas, leídos con la app cerrada");
            nm.createNotificationChannel(ch);
        }
        Intent it = new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(c, id, it, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.Builder b = new NotificationCompat.Builder(c, CH)
            .setSmallIcon(R.drawable.ic_stat_iocrino).setColor(0xFF5CCBBB)
            .setContentTitle(title).setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH).setAutoCancel(true).setContentIntent(act != null ? act : pi);
        if (act != null) b.addAction(0, actLabel, act);
        try { NotificationManagerCompat.from(c).notify(id, b.build()); } catch (SecurityException ignored) { }
    }
}
