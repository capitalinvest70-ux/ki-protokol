package bg.capitalinvest.protokol;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.DownloadManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.IntentFilter;
import android.telephony.SmsManager;
import java.util.Iterator;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;
import android.content.ActivityNotFoundException;
import android.content.ContentValues;
import android.content.pm.ResolveInfo;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.provider.MediaStore;
import androidx.core.content.FileProvider;
import java.io.File;
import java.io.FileOutputStream;
import java.io.FileInputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import android.content.pm.PackageInfo;
import android.view.View;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import java.util.ArrayList;
import android.os.Build;
import android.util.Base64;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.URLUtil;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.Toast;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.lang.reflect.Method;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.util.UUID;
import java.nio.charset.StandardCharsets;

// Протоколи КИ – отваря Програма за протокол и слага скина на Капитал Инвест.
public class MainActivity extends BridgeActivity {

    private String skin = "";
    private int lastKb = -1;
    private static final UUID SPP = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
    private BluetoothSocket btSock = null;
    private String btAddr = null;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        skin = readAsset("public/skin.js");

        WebView wv = getBridge().getWebView();
        WebSettings s = wv.getSettings();
        s.setTextZoom(100);
        s.setUseWideViewPort(false); // страницата да е широка колкото телефона
        s.setLoadWithOverviewMode(false);
        s.setSupportZoom(true);
        s.setBuiltInZoomControls(true);
        s.setDisplayZoomControls(false);
        s.setSupportMultipleWindows(false);
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(wv, true);

        wv.addJavascriptInterface(new KI(), "KIAndroid");

        // Клавиатурата: казваме на страницата колко е висока, за да остане полето за писане видимо
        final View decor = getWindow().getDecorView();
        ViewCompat.setOnApplyWindowInsetsListener(decor, (v, insets) -> {
            int ime = insets.isVisible(WindowInsetsCompat.Type.ime()) ? insets.getInsets(WindowInsetsCompat.Type.ime()).bottom : 0;
            int css = Math.round(ime / getResources().getDisplayMetrics().density);
            if (css != lastKb) {
                lastKb = css;
                wv.post(() -> wv.evaluateJavascript("window.KIM_kbd&&KIM_kbd(" + css + ")", null));
            }
            return ViewCompat.onApplyWindowInsets(v, insets);
        });

        getBridge().setWebViewClient(new BridgeWebViewClient(getBridge()) {
            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                if (!skin.isEmpty()) view.evaluateJavascript(skin, null);
                if (lastKb >= 0) view.evaluateJavascript("window.KIM_kbd&&KIM_kbd(" + lastKb + ")", null);
                CookieManager.getInstance().flush();
            }
        });

        // Бутоните на самата програма (Изтегли протокол, Генерирай договор…) също свалят
        wv.setDownloadListener((url, userAgent, contentDisposition, mimeType, length) ->
                download(url, URLUtil.guessFileName(url, contentDisposition, mimeType), mimeType));
    }

    @Override
    public void onBackPressed() {
        WebView wv = getBridge().getWebView();
        if (wv.canGoBack()) wv.goBack();
        else super.onBackPressed();
    }

    @Override
    public void onPause() {
        if (dictOn) dictStop();
        super.onPause();
        CookieManager.getInstance().flush(); // да не иска парола всеки път
    }

    private void download(String url, String name, String mime) {
        try {
            DownloadManager.Request r = new DownloadManager.Request(Uri.parse(url));
            String cookies = CookieManager.getInstance().getCookie(url);
            if (cookies != null) r.addRequestHeader("Cookie", cookies);
            r.setTitle(name);
            r.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            r.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, "Протоколи/" + name);
            if (mime != null && !mime.isEmpty() && !mime.equals("application/octet-stream")) r.setMimeType(mime);
            ((DownloadManager) getSystemService(DOWNLOAD_SERVICE)).enqueue(r);
            runOnUiThread(() -> Toast.makeText(this, "Свалям: " + name, Toast.LENGTH_SHORT).show());
        } catch (Exception e) {
            runOnUiThread(() -> Toast.makeText(this, "Грешка при сваляне: " + e.getMessage(), Toast.LENGTH_LONG).show());
        }
    }

    /* ---------- Файлове (PDF с подписи) ---------- */
    private String saveFile(String name, String b64, String mime) {
        try {
            byte[] data = Base64.decode(b64, Base64.DEFAULT);
            if (Build.VERSION.SDK_INT >= 29) {
                ContentValues v = new ContentValues();
                v.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                v.put(MediaStore.MediaColumns.MIME_TYPE, mime);
                v.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Протоколи");
                Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                if (uri == null) return "ERR няма достъп до Изтегляния";
                try (OutputStream os = getContentResolver().openOutputStream(uri)) { os.write(data); }
                return uri.toString();
            } else {
                File dir = new File(getExternalFilesDir(Environment.DIRECTORY_DOCUMENTS), "Протоколи");
                if (!dir.exists()) dir.mkdirs();
                File f = new File(dir, name);
                try (FileOutputStream os = new FileOutputStream(f)) { os.write(data); }
                return FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", f).toString();
            }
        } catch (Exception e) {
            return "ERR " + e.getMessage();
        }
    }

    private void openFile(String uri, String mime) {
        runOnUiThread(() -> {
            try {
                Intent i = new Intent(Intent.ACTION_VIEW);
                i.setDataAndType(Uri.parse(uri), mime);
                i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(i);
            } catch (Exception e) {
                Toast.makeText(this, "Няма приложение за PDF. Файлът е в Изтегляния/Протоколи.", Toast.LENGTH_LONG).show();
            }
        });
    }

    private void shareFile(String uri, String mime) {
        runOnUiThread(() -> {
            try {
                Intent s = new Intent(Intent.ACTION_SEND);
                s.setType(mime);
                s.putExtra(Intent.EXTRA_STREAM, Uri.parse(uri));
                s.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                startActivity(Intent.createChooser(s, "Изпрати"));
            } catch (Exception e) {
                Toast.makeText(this, "Не може да се изпрати: " + e.getMessage(), Toast.LENGTH_LONG).show();
            }
        });
    }

    // Изпращане към конкретно приложение: имейл (със скрито копие до всички), Viber, SharpFox (принтер C80)
    private void shareTo(String uri, String mime, String target, String bcc, String subject, String text) {
        runOnUiThread(() -> {
            try {
                Intent s = new Intent(Intent.ACTION_SEND);
                s.setType(mime);
                s.putExtra(Intent.EXTRA_STREAM, Uri.parse(uri));
                s.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                if (subject != null && !subject.isEmpty()) s.putExtra(Intent.EXTRA_SUBJECT, subject);
                if (text != null && !text.isEmpty()) s.putExtra(Intent.EXTRA_TEXT, text);
                if ("email".equals(target)) {
                    if (bcc != null && !bcc.trim().isEmpty()) s.putExtra(Intent.EXTRA_BCC, bcc.split("\\s*,\\s*"));
                    // Направо в Gmail; ако го няма – в друга поща; накрая – общ списък
                    String[] mailApps = {"com.google.android.gm", "com.microsoft.office.outlook", "com.samsung.android.email.provider", "com.yahoo.mobile.client.android.mail"};
                    for (String pkg : mailApps) {
                        try { s.setPackage(pkg); startActivity(s); return; } catch (ActivityNotFoundException ignored) { }
                    }
                    s.setPackage(null);
                    startActivity(Intent.createChooser(s, "Изпрати по имейл"));
                    return;
                }
                if ("viber".equals(target)) {
                    s.setPackage("com.viber.voip");
                    try { startActivity(s); }
                    catch (ActivityNotFoundException e) {
                        s.setPackage(null);
                        Toast.makeText(this, "Viber не е инсталиран", Toast.LENGTH_SHORT).show();
                        startActivity(Intent.createChooser(s, "Изпрати"));
                    }
                    return;
                }
                if ("c80".equals(target)) {
                    String pkg = findApp(s, new String[]{"sharpfox", "bytecintia", "flashlabel"});
                    if (pkg != null) { s.setPackage(pkg); startActivity(s); return; }
                    Toast.makeText(this, "Не намерих SharpFox – избери приложението на принтера", Toast.LENGTH_LONG).show();
                    startActivity(Intent.createChooser(s, "Печат на C80 – избери SharpFox"));
                    return;
                }
                startActivity(Intent.createChooser(s, "Изпрати"));
            } catch (Exception e) {
                Toast.makeText(this, "Не може да се изпрати: " + e.getMessage(), Toast.LENGTH_LONG).show();
            }
        });
    }

    private String findApp(Intent s, String[] keys) {
        try {
            PackageManager pm = getPackageManager();
            for (ResolveInfo r : pm.queryIntentActivities(s, 0)) {
                String pkg = r.activityInfo.packageName.toLowerCase();
                String label = String.valueOf(r.loadLabel(pm)).toLowerCase();
                for (String k : keys) if (pkg.contains(k) || label.contains(k)) return r.activityInfo.packageName;
            }
        } catch (Exception ignored) { }
        return null;
    }

    /* ---------- Печат ---------- */
    private boolean btAllowed() {
        return Build.VERSION.SDK_INT < 31 || checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED;
    }

    @SuppressLint("MissingPermission")
    private String btList() {
        if (!btAllowed()) {
            runOnUiThread(() -> requestPermissions(new String[]{Manifest.permission.BLUETOOTH_CONNECT}, 7));
            return "{\"perm\":true}";
        }
        BluetoothAdapter a = BluetoothAdapter.getDefaultAdapter();
        if (a == null) return "[]";
        if (!a.isEnabled()) return "{\"off\":true}";
        JSONArray arr = new JSONArray();
        try {
            for (BluetoothDevice d : a.getBondedDevices()) {
                JSONObject o = new JSONObject();
                o.put("name", d.getName() == null ? d.getAddress() : d.getName());
                o.put("address", d.getAddress());
                arr.put(o);
            }
        } catch (Exception ignored) { }
        return arr.toString();
    }

    @SuppressLint("MissingPermission")
    private synchronized OutputStream btOpen(String addr) throws Exception {
        if (btSock != null && btSock.isConnected() && addr.equals(btAddr)) return btSock.getOutputStream();
        btClose();
        if (!btAllowed()) throw new Exception("Разрешете Bluetooth за приложението");
        BluetoothAdapter a = BluetoothAdapter.getDefaultAdapter();
        if (a == null || !a.isEnabled()) throw new Exception("Включете Bluetooth на телефона");
        // На Android 12+ cancelDiscovery иска BLUETOOTH_SCAN – не е нужно за сдвоен принтер
        try {
            if (Build.VERSION.SDK_INT < 31 || checkSelfPermission(Manifest.permission.BLUETOOTH_SCAN) == PackageManager.PERMISSION_GRANTED) a.cancelDiscovery();
        } catch (SecurityException ignored) { }
        BluetoothDevice dev = a.getRemoteDevice(addr);
        BluetoothSocket s;
        try {
            s = dev.createRfcommSocketToServiceRecord(SPP);
            s.connect();
        } catch (Exception e1) {
            try {
                s = dev.createInsecureRfcommSocketToServiceRecord(SPP);
                s.connect();
            } catch (Exception e2) {
                Method m = dev.getClass().getMethod("createRfcommSocket", int.class);
                s = (BluetoothSocket) m.invoke(dev, 1);
                try { s.connect(); } catch (Exception e3) { throw new Exception("Принтерът не отговаря. Включен ли е и наблизо ли е?"); }
            }
        }
        btSock = s; btAddr = addr;
        return s.getOutputStream();
    }

    private synchronized void btClose() {
        try { if (btSock != null) btSock.close(); } catch (Exception ignored) { }
        btSock = null; btAddr = null;
    }

    private static void writeChunks(OutputStream os, byte[] data) throws Exception {
        for (int i = 0; i < data.length; i += 1024) {
            os.write(data, i, Math.min(1024, data.length - i));
            os.flush();
            Thread.sleep(15);
        }
    }

    private void sendBt(String addr, byte[] data) throws Exception {
        try {
            writeChunks(btOpen(addr), data);
        } catch (Exception first) {
            btClose(); // връзката е паднала – опитай още веднъж
            writeChunks(btOpen(addr), data);
        }
        Thread.sleep(300);
    }

    private void sendTcp(String target, byte[] data) throws Exception {
        String host = target; int port = 9100;
        int c = target.lastIndexOf(':');
        if (c > 0) { host = target.substring(0, c); port = Integer.parseInt(target.substring(c + 1)); }
        try (Socket s = new Socket()) {
            s.connect(new InetSocketAddress(host, port), 6000);
            OutputStream os = s.getOutputStream();
            writeChunks(os, data);
            Thread.sleep(300);
        } catch (java.io.IOException e) {
            throw new Exception("Няма връзка с принтера " + host + ". Свързан ли е телефонът към същата мрежа?");
        }
    }

    private void print(String id, String target, String b64) {
        new Thread(() -> {
            String err = null;
            try {
                byte[] data = Base64.decode(b64, Base64.DEFAULT);
                if (target.startsWith("bt:")) sendBt(target.substring(3), data);
                else if (target.startsWith("tcp:")) sendTcp(target.substring(4), data);
                else throw new Exception("Непознат принтер");
            } catch (Exception e) {
                err = e.getMessage() == null ? e.toString() : e.getMessage();
            }
            String q = JSONObject.quote(id);
            String js = "window.__kiPrintCb&&window.__kiPrintCb[" + q + "]&&window.__kiPrintCb[" + q + "](" + (err == null) + "," + JSONObject.quote(err == null ? "" : err) + ")";
            runOnUiThread(() -> getBridge().getWebView().evaluateJavascript(js, null));
        }).start();
    }

    /* ---------- 🎙️ Запис на събранието ---------- */
    private String recStart(String name) {
        if (Build.VERSION.SDK_INT >= 23 && checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            final String[] perms = Build.VERSION.SDK_INT >= 33
                    ? new String[]{Manifest.permission.RECORD_AUDIO, "android.permission.POST_NOTIFICATIONS"}
                    : new String[]{Manifest.permission.RECORD_AUDIO};
            runOnUiThread(() -> requestPermissions(perms, 8));
            return "PERM";
        }
        try {
            File dir = new File(getExternalFilesDir(Environment.DIRECTORY_MUSIC), "rec");
            if (!dir.exists()) dir.mkdirs();
            String safe = name.replaceAll("[\\\\/:*?\"<>|]", "_");
            RecService.begin(this, new File(dir, safe), safe);
            Intent i = new Intent(this, RecService.class);
            try {
                if (Build.VERSION.SDK_INT >= 26) startForegroundService(i); else startService(i);
            } catch (Exception ignored) { }
            return "OK";
        } catch (Exception e) {
            return "ERR " + (e.getMessage() == null ? e.toString() : e.getMessage());
        }
    }

    private String recState() {
        try {
            JSONObject o = new JSONObject();
            o.put("state", RecService.state());
            o.put("ms", RecService.elapsed());
            o.put("name", RecService.name == null ? "" : RecService.name);
            return o.toString();
        } catch (Exception e) {
            return "{\"state\":\"idle\",\"ms\":0}";
        }
    }

    private String recStop() {
        File f = RecService.end();
        long ms = RecService.accMs;
        try { stopService(new Intent(this, RecService.class)); } catch (Exception ignored) { }
        if (f == null || !f.exists()) return "ERR Няма запис";
        try {
            String uri;
            if (Build.VERSION.SDK_INT >= 29) {
                ContentValues v = new ContentValues();
                v.put(MediaStore.MediaColumns.DISPLAY_NAME, f.getName());
                v.put(MediaStore.MediaColumns.MIME_TYPE, "audio/mp4");
                v.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Протоколи/Записи");
                Uri u = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                if (u == null) throw new Exception("няма достъп до Изтегляния");
                try (InputStream in = new FileInputStream(f); OutputStream os = getContentResolver().openOutputStream(u)) {
                    byte[] buf = new byte[65536];
                    int n;
                    while ((n = in.read(buf)) > 0) os.write(buf, 0, n);
                }
                f.delete();
                uri = u.toString();
            } else {
                uri = FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", f).toString();
            }
            JSONObject o = new JSONObject();
            o.put("uri", uri);
            o.put("ms", ms);
            o.put("name", f.getName());
            return o.toString();
        } catch (Exception e) {
            return "ERR Записът е спрян, но не можах да го преместя: " + e.getMessage() + ". Файлът е в " + f.getAbsolutePath();
        }
    }

    /* ---------- 🚀 Обновяване: сваля новия APK от GitHub и отваря инсталацията ---------- */
    private static final String UPD_PREFIX = "https://github.com/capitalinvest70-ux/ki-protokol/releases/download/";

    private void js(String code) {
        runOnUiThread(() -> getBridge().getWebView().evaluateJavascript(code, null));
    }

    @SuppressWarnings("deprecation")
    private String appVersion() {
        try {
            PackageInfo pi = getPackageManager().getPackageInfo(getPackageName(), 0);
            long code = Build.VERSION.SDK_INT >= 28 ? pi.getLongVersionCode() : pi.versionCode;
            JSONObject o = new JSONObject();
            o.put("name", pi.versionName);
            o.put("code", code);
            return o.toString();
        } catch (Exception e) {
            return "{\"name\":\"?\",\"code\":0}";
        }
    }

    // Проверката за нова версия минава оттук – страницата на програмата не позволява връзки към други сайтове
    private String latestRelease() {
        try {
            HttpURLConnection c = (HttpURLConnection) new URL("https://api.github.com/repos/capitalinvest70-ux/ki-protokol/releases/latest").openConnection();
            c.setConnectTimeout(12000);
            c.setReadTimeout(15000);
            c.setRequestProperty("Accept", "application/vnd.github+json");
            c.setRequestProperty("User-Agent", "Protokoli-KI");
            c.setUseCaches(false);
            int code = c.getResponseCode();
            if (code != 200) return "ERR " + code;
            try (InputStream in = c.getInputStream()) {
                ByteArrayOutputStream bo = new ByteArrayOutputStream();
                byte[] buf = new byte[16384];
                int n;
                while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
                return bo.toString(StandardCharsets.UTF_8.name());
            }
        } catch (Exception e) {
            return "ERR " + e.getMessage();
        }
    }

    private String update(String url) {
        if (url == null || !url.startsWith(UPD_PREFIX)) return "ERR Непознат адрес за обновяване";
        if (Build.VERSION.SDK_INT >= 26 && !getPackageManager().canRequestPackageInstalls()) {
            runOnUiThread(() -> {
                try {
                    startActivity(new Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getPackageName())));
                } catch (Exception ignored) { }
            });
            return "PERM";
        }
        new Thread(() -> {
            try {
                File dir = new File(getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "upd");
                if (!dir.exists()) dir.mkdirs();
                File f = new File(dir, "Protokoli-KI-update.apk");
                if (f.exists()) f.delete();
                HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
                c.setInstanceFollowRedirects(true);
                c.setConnectTimeout(15000);
                c.setReadTimeout(30000);
                c.setRequestProperty("User-Agent", "Protokoli-KI");
                int code = c.getResponseCode();
                if (code != 200) throw new Exception("сървърът отговори " + code);
                long total = c.getContentLengthLong(), got = 0;
                int last = -1;
                try (InputStream in = c.getInputStream(); OutputStream os = new FileOutputStream(f)) {
                    byte[] buf = new byte[65536];
                    int n;
                    while ((n = in.read(buf)) > 0) {
                        os.write(buf, 0, n);
                        got += n;
                        int p = total > 0 ? (int) Math.min(99, got * 100 / total) : 0;
                        if (p != last) { last = p; js("window.KIM_updP&&KIM_updP(" + p + ")"); }
                    }
                }
                js("window.KIM_updP&&KIM_updP(100)");
                runOnUiThread(() -> {
                    try {
                        Uri u = Build.VERSION.SDK_INT >= 24
                                ? FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", f)
                                : Uri.fromFile(f);
                        Intent i = new Intent(Intent.ACTION_VIEW);
                        i.setDataAndType(u, "application/vnd.android.package-archive");
                        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                        startActivity(i);
                    } catch (Exception e) {
                        js("window.KIM_updP&&KIM_updP(-1," + JSONObject.quote("Не можах да отворя инсталацията: " + e.getMessage()) + ")");
                    }
                });
            } catch (Exception e) {
                js("window.KIM_updP&&KIM_updP(-1," + JSONObject.quote("Свалянето спря: " + e.getMessage()) + ")");
            }
        }).start();
        return "OK";
    }

    /* ---------- 🎤 Диктуване: говориш и текстът се изписва (безплатно – разпознаването на Google в телефона) ---------- */
    private SpeechRecognizer sr;
    private boolean dictOn = false;

    private String dictStart() {
        if (Build.VERSION.SDK_INT >= 23 && checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            runOnUiThread(() -> requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, 9));
            return "PERM";
        }
        if (!SpeechRecognizer.isRecognitionAvailable(this)) return "ERR На телефона няма разпознаване на говор – инсталирайте или включете приложението Google";
        runOnUiThread(() -> { dictOn = true; listen(); });
        return "OK";
    }

    private void dictStop() {
        runOnUiThread(() -> {
            dictOn = false;
            if (sr != null) { try { sr.stopListening(); } catch (Exception ignored) { } }
            // някои телефони не връщат резултат след „Спри“ – приключваме сами
            getBridge().getWebView().postDelayed(() -> { if (!dictOn) dictJs("end", ""); }, 1500);
        });
    }

    private static String first(Bundle b) {
        ArrayList<String> r = b == null ? null : b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        return r == null || r.isEmpty() ? "" : r.get(0);
    }

    private void dictJs(String kind, String text) {
        js("window.KIM_dict&&KIM_dict(" + JSONObject.quote(kind) + "," + JSONObject.quote(text == null ? "" : text) + ")");
    }

    private void listen() {
        if (sr == null) {
            sr = SpeechRecognizer.createSpeechRecognizer(this);
            sr.setRecognitionListener(new RecognitionListener() {
                @Override public void onReadyForSpeech(Bundle p) { dictJs("ready", ""); }
                @Override public void onBeginningOfSpeech() { }
                @Override public void onRmsChanged(float v) { }
                @Override public void onBufferReceived(byte[] b) { }
                @Override public void onEndOfSpeech() { }
                @Override public void onEvent(int t, Bundle p) { }
                @Override public void onPartialResults(Bundle b) { dictJs("part", first(b)); }
                @Override public void onResults(Bundle b) {
                    dictJs("final", first(b));
                    if (dictOn) listen(); else dictJs("end", "");
                }
                @Override public void onError(int e) {
                    if (dictOn && (e == SpeechRecognizer.ERROR_NO_MATCH || e == SpeechRecognizer.ERROR_SPEECH_TIMEOUT
                            || e == SpeechRecognizer.ERROR_CLIENT || e == SpeechRecognizer.ERROR_RECOGNIZER_BUSY)) {
                        getBridge().getWebView().postDelayed(() -> { if (dictOn) listen(); }, 350);
                        return;
                    }
                    boolean was = dictOn;
                    dictOn = false;
                    if (!was) { dictJs("end", ""); return; }
                    String m = e == SpeechRecognizer.ERROR_NETWORK || e == SpeechRecognizer.ERROR_NETWORK_TIMEOUT ? "Няма интернет за разпознаването на говор"
                            : e == SpeechRecognizer.ERROR_AUDIO ? "Микрофонът е зает (може би се записва събранието)"
                            : e == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS ? "Няма разрешение за микрофона"
                            : "Разпознаването спря (код " + e + ")";
                    dictJs("err", m);
                }
            });
        }
        Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "bg-BG");
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, "bg-BG");
        i.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        i.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
        i.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 2500);
        i.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 2000);
        try { sr.startListening(i); } catch (Exception e) { dictOn = false; dictJs("err", "Разпознаването не тръгна: " + e.getMessage()); }
    }

    /* ---------- 📣 Покани: SMS през SIM картата, връзка към SMSAPI / Brevo, имейл ---------- */
    // Страницата не може сама да се свърже с други сайтове – минава оттук, само към тези адреси
    private static final String[] HTTP_OK = {"https://api.smsapi.bg/", "https://api2.smsapi.bg/", "https://api.smsapi.com/", "https://api2.smsapi.com/", "https://api.brevo.com/"};

    private void http(String id, String method, String url, String headers, String body) {
        new Thread(() -> {
            int code = 0; String out;
            try {
                boolean ok = false;
                for (String p : HTTP_OK) if (url != null && url.startsWith(p)) ok = true;
                if (!ok) throw new Exception("Непознат адрес");
                HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
                c.setConnectTimeout(15000);
                c.setReadTimeout(60000);
                c.setRequestMethod(method == null || method.isEmpty() ? "GET" : method);
                c.setRequestProperty("User-Agent", "Protokoli-KI");
                if (headers != null && !headers.isEmpty()) {
                    JSONObject h = new JSONObject(headers);
                    for (Iterator<String> it = h.keys(); it.hasNext(); ) { String k = it.next(); c.setRequestProperty(k, h.getString(k)); }
                }
                if (body != null && !body.isEmpty() && !"GET".equals(method)) {
                    c.setDoOutput(true);
                    try (OutputStream os = c.getOutputStream()) { os.write(body.getBytes(StandardCharsets.UTF_8)); }
                }
                code = c.getResponseCode();
                InputStream in = code >= 400 ? c.getErrorStream() : c.getInputStream();
                ByteArrayOutputStream bo = new ByteArrayOutputStream();
                if (in != null) try (InputStream i2 = in) { byte[] buf = new byte[16384]; int n; while ((n = i2.read(buf)) > 0) bo.write(buf, 0, n); }
                out = bo.toString(StandardCharsets.UTF_8.name());
            } catch (Exception e) {
                out = "ERR " + (e.getMessage() == null ? e.toString() : e.getMessage());
            }
            String q = JSONObject.quote(id);
            js("window.__kiHttpCb&&window.__kiHttpCb[" + q + "]&&window.__kiHttpCb[" + q + "](" + code + "," + JSONObject.quote(out) + ")");
        }).start();
    }

    private boolean smsAllowed() {
        return Build.VERSION.SDK_INT < 23 || checkSelfPermission(Manifest.permission.SEND_SMS) == PackageManager.PERMISSION_GRANTED;
    }

    private String smsPerm() {
        if (smsAllowed()) return "OK";
        runOnUiThread(() -> requestPermissions(new String[]{Manifest.permission.SEND_SMS}, 10));
        return "PERM";
    }

    // Праща един SMS през SIM картата. Отговаря два пъти: изпратен (KIM_smsCb) и доставен (KIM_smsDlv)
    @SuppressWarnings("deprecation")
    private String simSms(String id, String number, String text) {
        if (!smsAllowed()) return smsPerm();
        try {
            SmsManager sm = Build.VERSION.SDK_INT >= 31 ? getSystemService(SmsManager.class) : SmsManager.getDefault();
            if (sm == null) return "ERR Телефонът не може да праща SMS";
            ArrayList<String> parts = sm.divideMessage(text);
            final int total = parts.size();
            final String aSent = getPackageName() + ".SMS_SENT." + id, aDlv = getPackageName() + ".SMS_DLV." + id;
            final String q = JSONObject.quote(id);
            final int[] sent = {0}, dlv = {0};
            final String[] err = {null};
            BroadcastReceiver rs = new BroadcastReceiver() {
                @Override public void onReceive(Context ctx, Intent i) {
                    int rc = getResultCode();
                    if (rc != RESULT_OK && err[0] == null) err[0] = rc == SmsManager.RESULT_ERROR_NO_SERVICE ? "Няма обхват"
                            : rc == SmsManager.RESULT_ERROR_RADIO_OFF ? "Самолетен режим / изключена SIM"
                            : rc == SmsManager.RESULT_ERROR_NULL_PDU ? "Грешен номер" : "Операторът отказа (код " + rc + ")";
                    if (++sent[0] >= total) {
                        try { unregisterReceiver(this); } catch (Exception ignored) { }
                        js("window.KIM_smsCb&&KIM_smsCb(" + q + "," + (err[0] == null) + "," + JSONObject.quote(err[0] == null ? "" : err[0]) + ")");
                    }
                }
            };
            BroadcastReceiver rd = new BroadcastReceiver() {
                @Override public void onReceive(Context ctx, Intent i) {
                    if (++dlv[0] >= total) {
                        try { unregisterReceiver(this); } catch (Exception ignored) { }
                        js("window.KIM_smsDlv&&KIM_smsDlv(" + q + "," + (getResultCode() == RESULT_OK) + ")");
                    }
                }
            };
            if (Build.VERSION.SDK_INT >= 33) {
                registerReceiver(rs, new IntentFilter(aSent), Context.RECEIVER_NOT_EXPORTED);
                registerReceiver(rd, new IntentFilter(aDlv), Context.RECEIVER_NOT_EXPORTED);
            } else {
                registerReceiver(rs, new IntentFilter(aSent));
                registerReceiver(rd, new IntentFilter(aDlv));
            }
            int fl = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
            ArrayList<PendingIntent> si = new ArrayList<>(), di = new ArrayList<>();
            for (int k = 0; k < total; k++) {
                si.add(PendingIntent.getBroadcast(this, (id + "s" + k).hashCode(), new Intent(aSent).setPackage(getPackageName()), fl));
                di.add(PendingIntent.getBroadcast(this, (id + "d" + k).hashCode(), new Intent(aDlv).setPackage(getPackageName()), fl));
            }
            sm.sendMultipartTextMessage(number, null, parts, si, di);
            return "OK " + total;
        } catch (Exception e) {
            return "ERR " + (e.getMessage() == null ? e.toString() : e.getMessage());
        }
    }

    // Viber: отваря чата с човека и готовия текст (текстът е и копиран – ако не е в полето, „Постави“)
    private void viberChat(String number, String text) {
        runOnUiThread(() -> {
            try {
                android.content.ClipboardManager cm = (android.content.ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
                if (cm != null) cm.setPrimaryClip(android.content.ClipData.newPlainText("Протоколи КИ", text == null ? "" : text));
                Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse("viber://chat?number=" + Uri.encode(number) + "&draft=" + Uri.encode(text == null ? "" : text)));
                i.setPackage("com.viber.voip");
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(i);
            } catch (ActivityNotFoundException e) {
                Toast.makeText(this, "Viber не е инсталиран на този телефон", Toast.LENGTH_LONG).show();
            } catch (Exception e) {
                Toast.makeText(this, "Viber не се отвори: " + e.getMessage(), Toast.LENGTH_LONG).show();
            }
        });
    }

    // Отваря пощата (Gmail) с всички адреси като скрито копие – без файл
    private void mailTo(String bcc, String subject, String text) {
        runOnUiThread(() -> {
            try {
                Intent s = new Intent(Intent.ACTION_SENDTO, Uri.parse("mailto:"));
                if (bcc != null && !bcc.trim().isEmpty()) s.putExtra(Intent.EXTRA_BCC, bcc.split("\\s*,\\s*"));
                s.putExtra(Intent.EXTRA_SUBJECT, subject == null ? "" : subject);
                s.putExtra(Intent.EXTRA_TEXT, text == null ? "" : text);
                try { s.setPackage("com.google.android.gm"); startActivity(s); return; } catch (ActivityNotFoundException ignored) { }
                s.setPackage(null);
                startActivity(Intent.createChooser(s, "Изпрати по имейл"));
            } catch (Exception e) {
                Toast.makeText(this, "Няма приложение за поща: " + e.getMessage(), Toast.LENGTH_LONG).show();
            }
        });
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == 10) js("window.KIM_smsPerm&&KIM_smsPerm(" + smsAllowed() + ")");
        if (requestCode == 9) {
            boolean ok = Build.VERSION.SDK_INT < 23 || checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;
            js("window.KIM_dictPerm&&window.KIM_dictPerm(" + ok + ")");
        }
        if (requestCode == 8) {
            boolean ok = Build.VERSION.SDK_INT < 23 || checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;
            runOnUiThread(() -> getBridge().getWebView().evaluateJavascript("window.KIM_recPerm&&window.KIM_recPerm(" + ok + ")", null));
        }
    }

    @Override
    public void onDestroy() {
        btClose();
        super.onDestroy();
    }

    private String readAsset(String path) {
        try (InputStream is = getAssets().open(path)) {
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = is.read(buf)) > 0) bo.write(buf, 0, n);
            return bo.toString(StandardCharsets.UTF_8.name());
        } catch (Exception e) {
            return "";
        }
    }

    public class KI {
        @JavascriptInterface
        public void download(String url, String name) {
            MainActivity.this.download(url, name, null);
        }

        @JavascriptInterface
        public String saveFile(String name, String b64, String mime) {
            return MainActivity.this.saveFile(name, b64, mime);
        }

        @JavascriptInterface
        public void openFile(String uri, String mime) {
            MainActivity.this.openFile(uri, mime);
        }

        @JavascriptInterface
        public void shareFile(String uri, String mime) {
            MainActivity.this.shareFile(uri, mime);
        }

        @JavascriptInterface
        public void shareTo(String uri, String mime, String target, String bcc, String subject, String text) {
            MainActivity.this.shareTo(uri, mime, target, bcc, subject, text);
        }

        @JavascriptInterface
        public String asset(String name) {
            if (name == null || !name.matches("[a-z0-9.-]+\\.js")) return "";
            return MainActivity.this.readAsset("public/" + name);
        }

        @JavascriptInterface
        public String dictStart() { return MainActivity.this.dictStart(); }

        @JavascriptInterface
        public void dictStop() { MainActivity.this.dictStop(); }

        @JavascriptInterface
        public String appVersion() { return MainActivity.this.appVersion(); }

        @JavascriptInterface
        public String latestRelease() { return MainActivity.this.latestRelease(); }

        @JavascriptInterface
        public String update(String url) { return MainActivity.this.update(url); }

        @JavascriptInterface
        public String recStart(String name) { return MainActivity.this.recStart(name); }

        @JavascriptInterface
        public String recState() { return MainActivity.this.recState(); }

        @JavascriptInterface
        public String recPause() { RecService.pause(); return MainActivity.this.recState(); }

        @JavascriptInterface
        public String recResume() { RecService.resume(); return MainActivity.this.recState(); }

        @JavascriptInterface
        public String recStop() { return MainActivity.this.recStop(); }

        @JavascriptInterface
        public String btList() {
            return MainActivity.this.btList();
        }

        @JavascriptInterface
        public void http(String id, String method, String url, String headers, String body) { MainActivity.this.http(id, method, url, headers, body); }

        @JavascriptInterface
        public String smsPerm() { return MainActivity.this.smsPerm(); }

        @JavascriptInterface
        public String simSms(String id, String number, String text) { return MainActivity.this.simSms(id, number, text); }

        @JavascriptInterface
        public void viberChat(String number, String text) { MainActivity.this.viberChat(number, text); }

        @JavascriptInterface
        public void mailTo(String bcc, String subject, String text) { MainActivity.this.mailTo(bcc, subject, text); }

        @JavascriptInterface
        public void print(String id, String target, String b64) {
            MainActivity.this.print(id, target, b64);
        }
    }
}
