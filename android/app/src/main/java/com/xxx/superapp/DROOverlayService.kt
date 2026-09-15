package com.xxx.superapp

import android.app.*
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.os.IBinder
import android.provider.Settings
import android.view.*
import android.widget.*
import androidx.core.app.NotificationCompat

class DROOverlayService : Service() {
    private lateinit var wm: WindowManager
    private var bubble: TextView? = null
    private var panel: LinearLayout? = null
    private val channelId = "dro_overlay"

    override fun onCreate() {
        super.onCreate(); createChannel(); startForeground(1001, notification())
        if (Settings.canDrawOverlays(this)) createBubble()
    }

    private fun createChannel() {
        getSystemService(NotificationManager::class.java).createNotificationChannel(
            NotificationChannel(channelId, "DRO Floating Overlay", NotificationManager.IMPORTANCE_LOW)
        )
    }

    private fun notification() = NotificationCompat.Builder(this, channelId)
        .setSmallIcon(android.R.drawable.ic_menu_view)
        .setContentTitle("DRO فعال است")
        .setContentText("پنجره شناور روی برنامه‌ها آماده است")
        .setOngoing(true).build()

    private fun params(w: Int, h: Int) = WindowManager.LayoutParams(
        w, h, WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
        WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
        PixelFormat.TRANSLUCENT
    ).apply { gravity = Gravity.TOP or Gravity.START; x = 24; y = 220 }

    private fun createBubble() {
        wm = getSystemService(WINDOW_SERVICE) as WindowManager
        val p = params(76, 76)
        bubble = TextView(this).apply {
            text = "🌳"; textSize = 30f; gravity = Gravity.CENTER; setTextColor(Color.WHITE)
            setBackgroundResource(R.drawable.dro_icon_bg); elevation = 12f
        }
        var downX = 0f; var downY = 0f; var startX = 0; var startY = 0; var moved = false
        bubble!!.setOnTouchListener { _, e ->
            when (e.actionMasked) {
                MotionEvent.ACTION_DOWN -> { downX=e.rawX; downY=e.rawY; startX=p.x; startY=p.y; moved=false; true }
                MotionEvent.ACTION_MOVE -> { val dx=e.rawX-downX; val dy=e.rawY-downY; if(kotlin.math.abs(dx)>8||kotlin.math.abs(dy)>8)moved=true; p.x=startX+dx.toInt(); p.y=startY+dy.toInt(); wm.updateViewLayout(bubble,p); true }
                MotionEvent.ACTION_UP -> { if(!moved) togglePanel(); true }
                else -> true
            }
        }
        wm.addView(bubble, p)
    }

    private fun togglePanel() {
        if (panel != null) { wm.removeView(panel); panel=null; return }
        panel = LinearLayout(this).apply {
            orientation=LinearLayout.VERTICAL; setPadding(24,20,24,20); setBackgroundResource(R.drawable.dro_bg)
            addView(TextView(context).apply { text="🌳  DRO"; textSize=23f; setTextColor(Color.WHITE) })
            addView(TextView(context).apply { text="Market Intelligence • Floating Mode"; textSize=12f; setTextColor(0xFFBDBDBD.toInt()); setPadding(0,8,0,14) })
            val row=LinearLayout(context).apply { orientation=LinearLayout.HORIZONTAL }
            arrayOf("SIG","CHT","MTF","BOOK","DER","NEWS","RISK","AI","SCAN").forEach { tool ->
                row.addView(Button(context).apply { text=tool; textSize=10f; setOnClickListener { Toast.makeText(context,"DRO $tool",Toast.LENGTH_SHORT).show() } }, LinearLayout.LayoutParams(0,54,1f))
            }
            addView(row); addView(Button(context).apply { text="بستن"; setOnClickListener { togglePanel() } })
        }
        val p=params(620,260); p.x=30; p.y=160; wm.addView(panel,p)
    }

    override fun onDestroy() { try { bubble?.let{wm.removeView(it)}; panel?.let{wm.removeView(it)} } catch(_:Exception){}; bubble=null; panel=null; super.onDestroy() }
    override fun onBind(intent: Intent?): IBinder? = null
}
