package com.xxx.superapp

import android.app.*
import android.app.Activity.RESULT_OK
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.projection.MediaProjection
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat

class ScreenCaptureService : Service() {
    companion object {
        const val EXTRA_RESULT_CODE = "result_code"
        const val EXTRA_DATA = "result_data"
        const val ACTION_STOP = "com.xxx.superapp.STOP_SCREEN"
        private const val CHANNEL_ID = "dro_control"
        private const val NOTIFICATION_ID = 2002
    }

    private var webrtc: DroWebRtc? = null
    private var running = false

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(i: Intent?, flags: Int, startId: Int): Int {
        if (i?.action == ACTION_STOP) {
            stopSelf()
            return START_NOT_STICKY
        }
        if (running) return START_STICKY

        val resultCode = i?.getIntExtra(EXTRA_RESULT_CODE, 0) ?: 0
        val data = i?.getParcelableExtra<Intent>(EXTRA_DATA)
        if (resultCode != RESULT_OK || data == null) {
            stopSelf()
            return START_NOT_STICKY
        }

        val token = secureDeviceToken(this) ?: run {
            stopSelf()
            return START_NOT_STICKY
        }

        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_menu_view)
            .setContentTitle("DRO Phone Control Active")
            .setContentText("Live screen sharing is active")
            .setOngoing(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .addAction(
                android.R.drawable.ic_menu_close_clear_cancel,
                "STOP",
                PendingIntent.getService(
                    this, 77,
                    Intent(this, ScreenCaptureService::class.java).setAction(ACTION_STOP),
                    PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
                )
            ).build()

        if (Build.VERSION.SDK_INT >= 29) {
            ServiceCompat.startForeground(
                this,
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }

        try {
            running = true
            webrtc = DroWebRtc(
                this, data,
                object : MediaProjection.Callback() {
                    override fun onStop() {
                        stopSelf()
                    }
                },
                token,
                "https://market-intelligence-840b.onrender.com"
            ) { state ->
                if (state == "SESSION_WAIT") {
                    // The visible foreground service remains active while the web session is created.
                }
            }
            webrtc!!.start()
        } catch (_: Exception) {
            running = false
            stopSelf()
        }
        return START_STICKY
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= 26) {
            val channel = NotificationChannel(
                CHANNEL_ID, "DRO Phone Control", NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Visible notification while DRO is controlling or viewing the phone"
                setShowBadge(false)
            }
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }
    }

    override fun onDestroy() {
        running = false
        webrtc?.stop()
        webrtc = null
        super.onDestroy()
    }

    override fun onBind(i: Intent?): IBinder? = null
}