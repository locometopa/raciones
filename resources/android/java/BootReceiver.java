package es.locometopa.raciones;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/* Al encender el móvil o actualizar iocrino: vuelve a poner la glucosa fija si estaba activada. */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent it) {
        String a = it == null ? "" : String.valueOf(it.getAction());
        if (Intent.ACTION_BOOT_COMPLETED.equals(a) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(a)) GlucoseNotif.syncService(c);
    }
}
