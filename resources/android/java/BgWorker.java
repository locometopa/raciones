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
        SharedPreferences p = IocrinoPlugin.prefs(c);
        try {
            JSONObject cfg = new JSONObject(p.getString("cfg", "{}"));
            if (!cfg.optBoolean("on", false) || cfg.optString("email").isEmpty()) return Result.success();
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
            if (rd.t > lastT) { JSONArray pt = new JSONArray(); pt.put(rd.t); pt.put(rd.v); keep.put(pt); }
            JSONObject last = new JSONObject(); last.put("v", rd.v); last.put("trend", rd.trend); last.put("t", rd.t);
            p.edit().putString("hist", keep.toString()).putString("last", last.toString()).putString("session", sess[0].toString()).putString("err", "").apply();
            GlucoseWidget.refreshAll(c);

            if (now - rd.t < 20 * M) alerts(c, p, cfg, keep, rd, now);
        } catch (Exception e) {
            p.edit().putString("err", String.valueOf(e.getMessage())).apply();
            if (e instanceof LibreClient.StepException) p.edit().remove("session").apply();
        }
        return Result.success();
    }

    void alerts(Context c, SharedPreferences p, JSONObject cfg, JSONArray hist, LibreClient.Reading rd, long now) throws Exception {
        // Bajada (opcional; la app del Libre ya tiene sus alarmas). Como mucho, un aviso cada 30 min.
        if (cfg.optBoolean("low", false) && rd.v < cfg.optInt("hypo", 70) && now - p.getLong("lowT", 0) > 30 * M) {
            notify(c, 7400, "Glucosa baja: " + rd.v + " mg/dL", "Trátala como te enseñó tu equipo y vuelve a mirar en 15 minutos.");
            p.edit().putLong("lowT", now).apply();
        }
        // Dosis olvidada: igual que en la app. Sube 60 o más en 2 h, está por encima de 180 y no hay rápida en 3 h.
        if (!cfg.optBoolean("missed", true)) return;
        if (now - cfg.optLong("missedOff", 0) < 3 * H || now - cfg.optLong("lastRapid", 0) < 3 * H || now - p.getLong("missedT", 0) < 3 * H) return;
        if (rd.v < 180) return;
        int mn = rd.v, n = 0;
        for (int i = 0; i < hist.length(); i++) {
            JSONArray pt = hist.getJSONArray(i);
            if (pt.getLong(0) >= rd.t - 2 * H) { mn = Math.min(mn, pt.getInt(1)); n++; }
        }
        if (n < 4 || rd.v - mn < 60) return;
        notify(c, 7401, "¿Te has pinchado?", "Tu glucosa ha subido " + (rd.v - mn) + " mg/dL en 2 horas (ahora " + rd.v + ") y no hay rápida apuntada.");
        p.edit().putLong("missedT", now).apply();
    }

    static void notify(Context c, int id, String title, String body) {
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
            .setPriority(NotificationCompat.PRIORITY_HIGH).setAutoCancel(true).setContentIntent(pi);
        try { NotificationManagerCompat.from(c).notify(id, b.build()); } catch (SecurityException ignored) { }
    }
}
