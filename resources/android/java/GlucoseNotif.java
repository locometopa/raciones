package es.locometopa.raciones;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Typeface;
import android.graphics.drawable.Icon;
import android.os.Build;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import org.json.JSONObject;

/* Aviso fijo con la glucosa: se ve en la pantalla de bloqueo, en la Always On Display y con el número en la barra de estado. */
class GlucoseNotif {
    static final int ID = 7500;
    static final String CH = "iocrino_glucosa";

    static void update(Context c) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        SharedPreferences p = IocrinoPlugin.prefs(c);
        try {
            JSONObject cfg = new JSONObject(p.getString("cfg", "{}"));
            if (!cfg.optBoolean("persist", false)) { nm.cancel(ID); return; }
            JSONObject last = new JSONObject(p.getString("last", "{}"));
            int g = last.optInt("v", 0);
            if (g <= 0) { nm.cancel(ID); return; }
            long t = last.optLong("t"), ago = (System.currentTimeMillis() - t) / 60000;
            int tr = last.optInt("trend", 0);
            String arrow = tr >= 0 && tr < GlucoseWidget.ARROWS.length ? GlucoseWidget.ARROWS[tr] : "";
            String state = ago > 20 ? "lectura antigua" : g < cfg.optInt("lo", 70) ? "baja" : g > cfg.optInt("alto", 250) ? "muy alta" : g > cfg.optInt("hi", 180) ? "alta" : "en rango";
            if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CH) == null) {
                NotificationChannel ch = new NotificationChannel(CH, "Glucosa fija", NotificationManager.IMPORTANCE_LOW);
                ch.setDescription("Tu última glucosa siempre visible, también con el móvil bloqueado");
                ch.setShowBadge(false);
                ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
                nm.createNotificationChannel(ch);
            }
            Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, CH) : new Notification.Builder(c);
            b.setSmallIcon(Icon.createWithBitmap(numberIcon(String.valueOf(g))))
                .setContentTitle(g + " " + arrow + " mg/dL")
                .setContentText(new SimpleDateFormat("HH:mm", Locale.getDefault()).format(new Date(t)) + " · " + state)
                .setColor(GlucoseWidget.colorFor(g, ago, cfg))
                .setOngoing(true).setOnlyAlertOnce(true).setShowWhen(false)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setCategory(Notification.CATEGORY_STATUS)
                .setContentIntent(GlucoseWidget.open(c, null, 0));
            Intent hide = new Intent(c, NotifAction.class).setAction(NotifAction.HIDE);
            PendingIntent hp = PendingIntent.getBroadcast(c, 7501, hide, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            b.addAction(new Notification.Action.Builder(Icon.createWithResource(c, R.drawable.ic_stat_iocrino), "Quitar de la barra", hp).build());
            if (Build.VERSION.SDK_INT < 26) b.setPriority(Notification.PRIORITY_LOW);
            nm.notify(ID, b.build());
        } catch (SecurityException ignored) {
        } catch (Exception e) { nm.cancel(ID); }
    }

    /* El número dibujado en blanco para el icono de la barra de estado. */
    static Bitmap numberIcon(String s) {
        int W = 96;
        Bitmap bm = Bitmap.createBitmap(W, W, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(bm);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setColor(Color.WHITE); p.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.BOLD)); p.setTextAlign(Paint.Align.CENTER);
        float size = s.length() >= 3 ? 52 : 70;
        p.setTextSize(size);
        while (p.measureText(s) > W - 2 && size > 20) { size -= 2; p.setTextSize(size); }
        Paint.FontMetrics fm = p.getFontMetrics();
        cv.drawText(s, W / 2f, W / 2f - (fm.ascent + fm.descent) / 2f, p);
        return bm;
    }
}
