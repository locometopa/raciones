package es.locometopa.raciones.wear;

import android.app.Activity;
import android.content.SharedPreferences;
import android.graphics.Typeface;
import android.os.Bundle;
import android.view.Gravity;
import android.widget.LinearLayout;
import android.widget.TextView;

/* Pantalla del reloj: la glucosa en grande, la flecha y la hora de la lectura. */
public class MainActivity extends Activity implements SharedPreferences.OnSharedPreferenceChangeListener {
    TextView value, arrow, time;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        LinearLayout l = new LinearLayout(this);
        l.setOrientation(LinearLayout.VERTICAL); l.setGravity(Gravity.CENTER); l.setBackgroundColor(0xFF000000);
        value = new TextView(this); value.setTextSize(54); value.setTypeface(Typeface.DEFAULT_BOLD); value.setGravity(Gravity.CENTER);
        arrow = new TextView(this); arrow.setTextSize(30); arrow.setGravity(Gravity.CENTER);
        time = new TextView(this); time.setTextSize(14); time.setTextColor(0xFFA4ADBB); time.setGravity(Gravity.CENTER);
        TextView unit = new TextView(this); unit.setText("mg/dL"); unit.setTextSize(13); unit.setTextColor(0xFFA4ADBB); unit.setGravity(Gravity.CENTER);
        l.addView(value); l.addView(arrow); l.addView(unit); l.addView(time);
        setContentView(l);
    }

    void paint() {
        Glucose g = Glucose.load(this);
        value.setText(g.value()); value.setTextColor(g.color());
        arrow.setText(g.arrow()); arrow.setTextColor(g.color());
        time.setText(g.v > 0 ? "Lectura de las " + g.time() + (g.old() ? " (antigua)" : "") : "Abre iocrino en el móvil");
    }

    @Override protected void onResume() { super.onResume(); paint(); Glucose.prefs(this).registerOnSharedPreferenceChangeListener(this); }
    @Override protected void onPause() { Glucose.prefs(this).unregisterOnSharedPreferenceChangeListener(this); super.onPause(); }
    @Override public void onSharedPreferenceChanged(SharedPreferences p, String k) { runOnUiThread(this::paint); }
}
