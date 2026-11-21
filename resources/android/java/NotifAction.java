package es.locometopa.raciones;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/* Botón «Quitar» de la notificación de glucosa fija. */
public class NotifAction extends BroadcastReceiver {
    static final String HIDE = "es.locometopa.raciones.QUITAR_GLUCOSA";

    @Override
    public void onReceive(Context c, Intent it) {
        if (it != null && HIDE.equals(it.getAction())) GlucoseTile.setOn(c, false);
    }
}
