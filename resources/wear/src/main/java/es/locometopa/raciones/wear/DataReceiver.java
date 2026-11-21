package es.locometopa.raciones.wear;

import android.content.ComponentName;
import androidx.wear.watchface.complications.datasource.ComplicationDataSourceUpdateRequester;
import com.google.android.gms.wearable.DataEvent;
import com.google.android.gms.wearable.DataEventBuffer;
import com.google.android.gms.wearable.DataMap;
import com.google.android.gms.wearable.DataMapItem;
import com.google.android.gms.wearable.WearableListenerService;

/* Recibe cada lectura que manda el móvil y actualiza las complicaciones de la esfera. */
public class DataReceiver extends WearableListenerService {
    @Override
    public void onDataChanged(DataEventBuffer events) {
        boolean got = false;
        for (DataEvent e : events) {
            if (e.getType() != DataEvent.TYPE_CHANGED || !"/glucosa".equals(e.getDataItem().getUri().getPath())) continue;
            DataMap m = DataMapItem.fromDataItem(e.getDataItem()).getDataMap();
            Glucose.prefs(this).edit().putInt("v", m.getInt("v")).putInt("trend", m.getInt("trend")).putLong("t", m.getLong("t"))
                .putInt("lo", m.getInt("lo", 70)).putInt("hi", m.getInt("hi", 180)).putInt("alto", m.getInt("alto", 250)).apply();
            got = true;
        }
        if (got) ComplicationDataSourceUpdateRequester.create(this, new ComponentName(this, GlucoseComplication.class)).requestUpdateAll();
    }
}
