package es.locometopa.raciones.wear;

import android.content.Context;
import android.content.SharedPreferences;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/* Última glucosa recibida del móvil. */
class Glucose {
    static final String[] ARROWS = { "", "↓", "↘", "→", "↗", "↑" };
    int v, trend, lo = 70, hi = 180, alto = 250; long t;

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences("glucosa", Context.MODE_PRIVATE); }

    static Glucose load(Context c) {
        SharedPreferences p = prefs(c); Glucose g = new Glucose();
        g.v = p.getInt("v", 0); g.trend = p.getInt("trend", 0); g.t = p.getLong("t", 0);
        g.lo = p.getInt("lo", 70); g.hi = p.getInt("hi", 180); g.alto = p.getInt("alto", 250);
        return g;
    }

    long ageMin() { return (System.currentTimeMillis() - t) / 60000; }
    boolean old() { return v <= 0 || ageMin() > 20; }
    String value() { return old() ? "--" : String.valueOf(v); }
    String arrow() { return old() || trend < 0 || trend >= ARROWS.length ? "" : ARROWS[trend]; }
    String time() { return t > 0 ? new SimpleDateFormat("HH:mm", Locale.getDefault()).format(new Date(t)) : "sin datos"; }
    int color() {
        if (old()) return 0xFF8A93A3;
        if (v < lo) return 0xFFFF5A5A;
        if (v > alto) return 0xFFF5873B;
        if (v > hi) return 0xFFF0B429;
        return 0xFF7ACC6C;
    }
}
