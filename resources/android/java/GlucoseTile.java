package es.locometopa.raciones;

import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.drawable.Icon;
import android.os.Build;
import android.service.quicksettings.Tile;
import android.service.quicksettings.TileService;
import org.json.JSONObject;

/* Botón del panel de ajustes rápidos: enciende o apaga la glucosa fija en la barra de notificaciones. */
public class GlucoseTile extends TileService {

    static boolean isOn(Context c) {
        try { return new JSONObject(IocrinoPlugin.prefs(c).getString("cfg", "{}")).optBoolean("persist", false); } catch (Exception e) { return false; }
    }

    /* Cambia el ajuste aquí y avisa a la app (que lo recoge al abrirse). */
    static void setOn(Context c, boolean on) {
        SharedPreferences p = IocrinoPlugin.prefs(c);
        try {
            JSONObject cfg = new JSONObject(p.getString("cfg", "{}"));
            cfg.put("persist", on);
            p.edit().putString("cfg", cfg.toString()).putString("persistSet", on ? "1" : "0").apply();
        } catch (Exception ignored) { }
        GlucoseNotif.syncService(c);
        requestRefresh(c);
    }

    static void requestRefresh(Context c) {
        try { TileService.requestListeningState(c, new ComponentName(c, GlucoseTile.class)); } catch (Exception ignored) { }
    }

    @Override
    public void onStartListening() { paint(); }

    @Override
    public void onClick() {
        setOn(this, !isOn(this));
        paint();
    }

    void paint() {
        Tile t = getQsTile(); if (t == null) return;
        boolean on = isOn(this);
        t.setState(on ? Tile.STATE_ACTIVE : Tile.STATE_INACTIVE);
        t.setLabel("Glucosa fija");
        t.setIcon(Icon.createWithResource(this, R.drawable.ic_stat_iocrino));
        if (Build.VERSION.SDK_INT >= 29) {
            String sub = on ? "Activada" : "Desactivada";
            try {
                JSONObject last = new JSONObject(IocrinoPlugin.prefs(this).getString("last", "{}"));
                int g = last.optInt("v", 0), tr = last.optInt("trend", 0);
                if (on && g > 0) sub = g + " " + (tr >= 0 && tr < GlucoseWidget.ARROWS.length ? GlucoseWidget.ARROWS[tr] : "");
            } catch (Exception ignored) { }
            t.setSubtitle(sub);
        }
        t.updateTile();
    }
}
