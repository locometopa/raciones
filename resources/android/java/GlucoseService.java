package es.locometopa.raciones;

import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.os.PowerManager;

/* Servicio de la glucosa fija: lee el Libre cada minuto con la pantalla encendida (cada 3 con ella apagada)
   y al momento cuando enciendes la pantalla, para que el número de la barra y de la pantalla de bloqueo esté al día. */
public class GlucoseService extends Service {
    static final long ON_MS = 60000L, OFF_MS = 180000L;
    HandlerThread thread;
    Handler h;
    PowerManager pm;
    PowerManager.WakeLock wl;

    final Runnable tick = new Runnable() {
        @Override public void run() {
            if (!GlucoseNotif.wanted(GlucoseService.this)) { stopSelf(); return; }
            try { if (wl != null) wl.acquire(30000L); BgWorker.fetch(GlucoseService.this); }
            finally { if (wl != null && wl.isHeld()) wl.release(); }
            h.removeCallbacks(this);
            h.postDelayed(this, pm != null && pm.isInteractive() ? ON_MS : OFF_MS);
        }
    };

    final BroadcastReceiver screen = new BroadcastReceiver() {
        @Override public void onReceive(Context c, Intent i) {
            // Al encender la pantalla: lectura nueva si la última tiene más de 30 s
            if (System.currentTimeMillis() - IocrinoPlugin.prefs(c).getLong("fetchT", 0) > 30000L) { h.removeCallbacks(tick); h.post(tick); }
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        pm = (PowerManager) getSystemService(POWER_SERVICE);
        wl = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "iocrino:lectura");
        wl.setReferenceCounted(false);
        thread = new HandlerThread("iocrino-glucosa");
        thread.start();
        h = new Handler(thread.getLooper());
        IntentFilter f = new IntentFilter(Intent.ACTION_SCREEN_ON);
        f.addAction(Intent.ACTION_USER_PRESENT);
        registerReceiver(screen, f);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        try {
            if (Build.VERSION.SDK_INT >= 34) startForeground(GlucoseNotif.ID, GlucoseNotif.build(this), ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
            else startForeground(GlucoseNotif.ID, GlucoseNotif.build(this));
        } catch (Exception e) { stopSelf(); return START_NOT_STICKY; }
        if (!GlucoseNotif.wanted(this)) { stopSelf(); return START_NOT_STICKY; }
        long since = System.currentTimeMillis() - IocrinoPlugin.prefs(this).getLong("fetchT", 0);
        h.removeCallbacks(tick);
        h.postDelayed(tick, since > 30000L ? 0 : ON_MS - since);
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        try { unregisterReceiver(screen); } catch (Exception ignored) { }
        if (h != null) h.removeCallbacksAndMessages(null);
        if (thread != null) thread.quitSafely();
        if (wl != null && wl.isHeld()) wl.release();
        GlucoseNotif.update(this);
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent i) { return null; }
}
