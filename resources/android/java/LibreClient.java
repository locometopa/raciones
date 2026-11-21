package es.locometopa.raciones;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Calendar;
import java.util.TimeZone;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.json.JSONArray;
import org.json.JSONObject;

/* Igual que www/js/libre.js, pero en Java para leer con la app cerrada. */
class LibreClient {
    static class Res { int http; JSONObject body; }
    static class Reading { int v; int trend; long t; }
    static class StepException extends Exception { StepException(String m) { super(m); } }

    static Res request(String host, String path, String method, JSONObject sess, String version, String body) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL("https://" + host + path).openConnection();
        c.setConnectTimeout(15000); c.setReadTimeout(20000); c.setRequestMethod(method);
        c.setRequestProperty("accept", "application/json");
        c.setRequestProperty("content-type", "application/json");
        c.setRequestProperty("cache-control", "no-cache");
        c.setRequestProperty("product", "llu.android");
        c.setRequestProperty("version", version);
        c.setRequestProperty("user-agent", "LibreLinkUp/" + version);
        if (sess != null) {
            c.setRequestProperty("authorization", "Bearer " + sess.optString("token"));
            c.setRequestProperty("account-id", sess.optString("accountId"));
        }
        if (body != null) {
            c.setDoOutput(true);
            try (OutputStream o = c.getOutputStream()) { o.write(body.getBytes(StandardCharsets.UTF_8)); }
        }
        Res r = new Res();
        r.http = c.getResponseCode();
        InputStream in = r.http >= 400 ? c.getErrorStream() : c.getInputStream();
        String txt = "";
        if (in != null) {
            ByteArrayOutputStream b = new ByteArrayOutputStream(); byte[] buf = new byte[8192]; int n;
            while ((n = in.read(buf)) > 0) b.write(buf, 0, n);
            in.close(); txt = b.toString("UTF-8");
        }
        try { r.body = new JSONObject(txt); } catch (Exception e) { r.body = new JSONObject(); }
        c.disconnect();
        return r;
    }

    static String sha256(String s) throws Exception {
        byte[] d = MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8));
        StringBuilder sb = new StringBuilder(); for (byte x : d) sb.append(String.format("%02x", x)); return sb.toString();
    }

    static JSONObject login(String email, String password, String version, String host0) throws Exception {
        String host = host0 == null || host0.isEmpty() ? "api.libreview.io" : host0;
        JSONObject cred = new JSONObject(); cred.put("email", email); cred.put("password", password);
        for (int i = 0; i < 4; i++) {
            Res r = request(host, "/llu/auth/login", "POST", null, version, cred.toString());
            JSONObject b = r.body, d = b.optJSONObject("data"); if (d == null) d = new JSONObject();
            int st = b.optInt("status", -1);
            if (d.optBoolean("redirect", false) && d.optString("region", "").length() > 0) { host = "api-" + d.optString("region") + ".libreview.io"; continue; }
            String minV = d.optString("minimumVersion", "");
            if ((st == 920 || r.http == 403) && minV.length() > 0 && !minV.equals(version)) { version = minV; continue; }
            if (st == 4) throw new StepException("LibreLinkUp pide aceptar algo. Abre iocrino.");
            JSONObject at = d.optJSONObject("authTicket"), user = d.optJSONObject("user");
            if (st == 0 && at != null && user != null) {
                long exp = at.optLong("expires", 0); if (exp < 1000000000000L) exp *= 1000;
                JSONObject s = new JSONObject();
                s.put("host", host); s.put("version", version); s.put("token", at.optString("token"));
                s.put("expires", exp); s.put("accountId", sha256(user.optString("id")));
                return s;
            }
            throw new Exception("LibreLinkUp: estado " + st + " (HTTP " + r.http + ")");
        }
        throw new Exception("No se pudo iniciar sesión en LibreLinkUp");
    }

    static final Pattern TS = Pattern.compile("^(\\d{1,2})/(\\d{1,2})/(\\d{4}) (\\d{1,2}):(\\d{2}):(\\d{2})(?: ?([AP]M))?$", Pattern.CASE_INSENSITIVE);

    static long parseTime(JSONObject gm) {
        String[] keys = { "FactoryTimestamp", "Timestamp" };
        for (int k = 0; k < 2; k++) {
            Matcher m = TS.matcher(gm.optString(keys[k], "").trim());
            if (!m.matches()) continue;
            int h = Integer.parseInt(m.group(4));
            if (m.group(7) != null) { boolean pm = m.group(7).equalsIgnoreCase("PM"); if (h == 12) h = pm ? 12 : 0; else if (pm) h += 12; }
            Calendar cal = Calendar.getInstance(k == 0 ? TimeZone.getTimeZone("UTC") : TimeZone.getDefault());
            cal.clear();
            cal.set(Integer.parseInt(m.group(3)), Integer.parseInt(m.group(1)) - 1, Integer.parseInt(m.group(2)), h, Integer.parseInt(m.group(5)), Integer.parseInt(m.group(6)));
            return cal.getTimeInMillis();
        }
        return 0;
    }

    /* Devuelve la lectura actual. sessHolder[0] entra con la sesión guardada y sale con la que sirva. */
    static Reading read(JSONObject cfg, JSONObject[] sessHolder) throws Exception {
        String version = cfg.optString("version", "5.0.1");
        JSONObject sess = sessHolder[0];
        for (int attempt = 0; attempt < 2; attempt++) {
            if (sess == null || sess.optString("token", "").isEmpty() || (sess.optLong("expires", 0) > 0 && sess.optLong("expires", 0) < System.currentTimeMillis() + 60000)) {
                sess = login(cfg.optString("email"), cfg.optString("password"), version, sess == null ? null : sess.optString("host", null));
            }
            Res r = request(sess.optString("host"), "/llu/connections", "GET", sess, sess.optString("version", version), null);
            if (r.http == 401 || r.http == 403) { sess = null; continue; }
            JSONArray list = r.body.optJSONArray("data");
            if (r.body.optInt("status", -1) != 0 || list == null || list.length() == 0) throw new Exception("LibreLinkUp sin conexiones (HTTP " + r.http + ")");
            JSONObject gm = list.getJSONObject(0).optJSONObject("glucoseMeasurement");
            if (gm == null) throw new Exception("Sin lectura reciente");
            Reading rd = new Reading();
            rd.v = (int) Math.round(gm.optDouble("ValueInMgPerDl", 0));
            rd.trend = gm.optInt("TrendArrow", 0);
            rd.t = parseTime(gm);
            if (rd.v <= 0 || rd.t <= 0) throw new Exception("Lectura no válida");
            sessHolder[0] = sess;
            return rd;
        }
        throw new Exception("LibreLinkUp rechaza la sesión");
    }
}
