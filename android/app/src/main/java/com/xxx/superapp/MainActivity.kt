package com.xxx.superapp

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat

class MainActivity : AppCompatActivity() {
    private lateinit var status: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(40, 60, 40, 40)
            setBackgroundColor(0xFF050505.toInt())
        }
        val title = TextView(this).apply { text = "xXx  •  DRO"; textSize = 30f; setTextColor(0xFFFFFFFF.toInt()) }
        status = TextView(this).apply { textSize = 16f; setPadding(0, 20, 0, 30); setTextColor(0xFFBDBDBD.toInt()) }
        val button = Button(this).apply { text = "فعال‌سازی شناور DRO"; setOnClickListener { enableOverlay() } }
        root.addView(title); root.addView(status); root.addView(button); setContentView(root)
        updateStatus()
    }

    override fun onResume() { super.onResume(); if (::status.isInitialized) updateStatus() }

    private fun updateStatus() {
        status.text = if (Settings.canDrawOverlays(this)) "وضعیت: شناور آماده است ✓" else "وضعیت: مجوز نمایش روی سایر برنامه‌ها لازم است"
    }

    private fun enableOverlay() {
        if (!Settings.canDrawOverlays(this)) {
            startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$packageName")))
        } else {
            ContextCompat.startForegroundService(this, Intent(this, DROOverlayService::class.java))
        }
    }
}
