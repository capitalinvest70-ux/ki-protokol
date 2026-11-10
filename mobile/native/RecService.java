package bg.capitalinvest.protokol;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.MediaRecorder;
import android.os.Build;
import android.os.IBinder;
import android.os.SystemClock;

import java.io.File;

// Запис на събранието от микрофона. Работи като услуга с известие,
// за да продължи и при заключен екран или когато се отвори друго приложение.
public class RecService extends Service {

    static final String CH = "ki_rec";
    static MediaRecorder rec;
    static File file;
    static String name;
    static long startedAt, accMs;
    static boolean paused;

    static synchronized long elapsed() {
        if (rec == null) return accMs;
        return accMs + (paused ? 0 : SystemClock.elapsedRealtime() - startedAt);
    }

    static synchronized String state() {
        return rec == null ? "idle" : (paused ? "paused" : "rec");
    }

    @SuppressWarnings("deprecation")
    static synchronized void begin(Context c, File f, String n) throws Exception {
        if (rec != null) throw new Exception("Вече се записва");
        MediaRecorder r = Build.VERSION.SDK_INT >= 31 ? new MediaRecorder(c) : new MediaRecorder();
        try {
            r.setAudioSource(MediaRecorder.AudioSource.MIC);
            r.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);
            r.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);
            r.setAudioChannels(1);
            r.setAudioSamplingRate(44100);
            r.setAudioEncodingBitRate(64000); // ~30 MB на час
            r.setOutputFile(f.getAbsolutePath());
            r.prepare();
            r.start();
        } catch (Exception e) {
            try { r.release(); } catch (Exception ignored) { }
            throw new Exception("Микрофонът не тръгна: " + e.getMessage());
        }
        rec = r; file = f; name = n; accMs = 0; paused = false;
        startedAt = SystemClock.elapsedRealtime();
    }

    static synchronized void pause() {
        if (rec != null && !paused && Build.VERSION.SDK_INT >= 24) {
            rec.pause();
            accMs += SystemClock.elapsedRealtime() - startedAt;
            paused = true;
        }
    }

    static synchronized void resume() {
        if (rec != null && paused && Build.VERSION.SDK_INT >= 24) {
            rec.resume();
            startedAt = SystemClock.elapsedRealtime();
            paused = false;
        }
    }

    static synchronized File end() {
        if (rec == null) return null;
        long ms = elapsed();
        try { rec.stop(); } catch (Exception ignored) { }
        try { rec.release(); } catch (Exception ignored) { }
        rec = null; paused = false; accMs = ms;
        return file;
    }

    @Override
    public IBinder onBind(Intent i) { return null; }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CH) == null) {
            nm.createNotificationChannel(new NotificationChannel(CH, "Запис на събрание", NotificationManager.IMPORTANCE_LOW));
        }
        Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        int pf = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
        PendingIntent pi = PendingIntent.getActivity(this, 0, open, pf);
        @SuppressWarnings("deprecation")
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CH) : new Notification.Builder(this);
        b.setContentTitle("● Записва събранието")
         .setContentText(name == null ? "Протоколи КИ" : name)
         .setSmallIcon(android.R.drawable.ic_btn_speak_now)
         .setOngoing(true)
         .setContentIntent(pi)
         .setUsesChronometer(true)
         .setWhen(System.currentTimeMillis() - elapsed());
        Notification n = b.build();
        try {
            if (Build.VERSION.SDK_INT >= 29) startForeground(42, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);
            else startForeground(42, n);
        } catch (Exception e) {
            // записът продължава, докато приложението е отворено
        }
        return START_NOT_STICKY;
    }
}
