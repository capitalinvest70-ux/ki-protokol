package bg.capitalinvest.protokol;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.DownloadManager;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;
import android.content.pm.PackageManager;
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

        getBridge().setWebViewClient(new BridgeWebViewClient(getBridge()) {
            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                if (!skin.isEmpty()) view.evaluateJavascript(skin, null);
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
        a.cancelDiscovery();
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
        public String btList() {
            return MainActivity.this.btList();
        }

        @JavascriptInterface
        public void print(String id, String target, String b64) {
            MainActivity.this.print(id, target, b64);
        }
    }
}
