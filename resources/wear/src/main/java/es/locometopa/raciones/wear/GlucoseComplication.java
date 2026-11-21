package es.locometopa.raciones.wear;

import android.app.PendingIntent;
import android.content.Intent;
import android.os.RemoteException;
import androidx.wear.watchface.complications.data.ComplicationData;
import androidx.wear.watchface.complications.data.ComplicationText;
import androidx.wear.watchface.complications.data.ComplicationType;
import androidx.wear.watchface.complications.data.LongTextComplicationData;
import androidx.wear.watchface.complications.data.NoDataComplicationData;
import androidx.wear.watchface.complications.data.PlainComplicationText;
import androidx.wear.watchface.complications.data.RangedValueComplicationData;
import androidx.wear.watchface.complications.data.ShortTextComplicationData;
import androidx.wear.watchface.complications.datasource.ComplicationDataSourceService;
import androidx.wear.watchface.complications.datasource.ComplicationRequest;

/* Complicación para la esfera: glucosa y flecha (corta), con la hora (larga) o como arco (rango). */
public class GlucoseComplication extends ComplicationDataSourceService {

    static ComplicationText txt(String s) { return new PlainComplicationText.Builder(s).build(); }

    ComplicationData make(ComplicationType type, Glucose g) {
        PendingIntent tap = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class), PendingIntent.FLAG_IMMUTABLE);
        String desc = g.old() ? "Glucosa sin datos recientes" : "Glucosa " + g.v + " miligramos por decilitro";
        if (type == ComplicationType.SHORT_TEXT)
            return new ShortTextComplicationData.Builder(txt(g.value() + g.arrow()), txt(desc)).setTitle(txt(g.old() ? "iocrino" : g.time())).setTapAction(tap).build();
        if (type == ComplicationType.LONG_TEXT)
            return new LongTextComplicationData.Builder(txt(g.value() + " " + g.arrow() + " mg/dL"), txt(desc)).setTitle(txt(g.old() ? "Sin lectura reciente" : "a las " + g.time())).setTapAction(tap).build();
        if (type == ComplicationType.RANGED_VALUE) {
            float v = g.old() ? 40f : Math.max(40f, Math.min(300f, g.v));
            return new RangedValueComplicationData.Builder(v, 40f, 300f, txt(desc)).setText(txt(g.value())).setTitle(txt(g.arrow())).setTapAction(tap).build();
        }
        return new NoDataComplicationData();
    }

    @Override
    public void onComplicationRequest(ComplicationRequest request, ComplicationRequestListener listener) {
        try { listener.onComplicationData(make(request.getComplicationType(), Glucose.load(this))); } catch (RemoteException ignored) { }
    }

    @Override
    public ComplicationData getPreviewData(ComplicationType type) {
        Glucose g = new Glucose(); g.v = 124; g.trend = 3; g.t = System.currentTimeMillis();
        return make(type, g);
    }
}
