package com.xxx.superapp

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import android.media.projection.MediaProjectionManager
import android.widget.*
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID
import java.util.concurrent.Executors
import android.util.Base64
import java.security.KeyPairGenerator

class MainActivity : AppCompatActivity() {
    private lateinit var status: TextView
    private val prefs by lazy { getSharedPreferences("dro_control", Context.MODE_PRIVATE) }
    private val serverUrl = "https://market-intelligence-840b.onrender.com"
    private val executor = Executors.newSingleThreadExecutor()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(40, 60, 40, 40)
            setBackgroundColor(0xFF050505.toInt())
        }
        val title = TextView(this).apply { text = "xXx • DRO PHONE CONTROL"; textSize = 24f; setTextColor(0xFFFFFFFF.toInt()) }
        status = TextView(this).apply { textSize = 14f; setPadding(0, 20, 0, 24); setTextColor(0xFFBDBDBD.toInt()) }
        val code = EditText(this).apply { hint = "PAIRING CODE"; setSingleLine(true); setTextColor(0xFFFFFFFF.toInt()); setHintTextColor(0xFF777777.toInt()) }
        val pair = Button(this).apply { text = "Pair this Android once" }
        val setup = Button(this).apply { text = "Run one-time permission setup" }
        val overlay = Button(this).apply { text = "Start DRO floating service" }
        val screen = Button(this).apply { text = "Share live screen with DRO" }
        pair.setOnClickListener { pairDevice(code.text.toString()) }
        setup.setOnClickListener { openMissingPermission() }
        overlay.setOnClickListener { enableOverlay() }
        screen.setOnClickListener { requestScreenCapture() }
        root.addView(title); root.addView(status); root.addView(code); root.addView(pair); root.addView(setup); root.addView(overlay); root.addView(screen)
        setContentView(root)
        updateStatus()
    }

    override fun onResume() { super.onResume(); if (::status.isInitialized) updateStatus() }

    private fun updateStatus() {
        val trusted = prefs.getString("device_token", null) != null
        val overlay = Settings.canDrawOverlays(this)
        status.text = "Pairing: " + if (trusted) "TRUSTED ✓" else "NOT PAIRED" +
            "\nOverlay: " + if (overlay) "READY ✓" else "NEEDED" +
            "\nServer: " + serverUrl
    }

    private fun deviceId(): String {
        prefs.getString("device_id", null)?.let { return it }
        val id = "android-" + UUID.randomUUID().toString()
        prefs.edit().putString("device_id", id).apply()
        return id
    }

    private fun publicKey(): String {
        prefs.getString("public_key", null)?.let { return it }
        val gen = KeyPairGenerator.getInstance("EC")
        gen.initialize(256)
        val pair = gen.generateKeyPair()
        val pub = Base64.encodeToString(pair.public.encoded, Base64.NO_WRAP)
        prefs.edit().putString("public_key", pub).apply()
        return pub
    }

    private fun pairDevice(code: String) {
        val clean = code.trim().uppercase()
        if (clean.length < 6) { Toast.makeText(this, "Pairing code را وارد کن", Toast.LENGTH_SHORT).show(); return }
        status.text = "Pairing…"
        executor.execute {
            try {
                val body = JSONObject().apply {
                    put("code", clean)
                    put("deviceId", deviceId())
                    put("name", "xXx DRO Android")
                    put("platform", "android")
                    put("publicKey", publicKey())
                }
                val conn = URL(serverUrl + "/api/phone-control/pair").openConnection() as HttpURLConnection
                conn.requestMethod = "POST"; conn.doOutput = true; conn.connectTimeout = 10000; conn.readTimeout = 10000
                conn.setRequestProperty("Content-Type", "application/json")
                conn.outputStream.use { it.write(body.toString().toByteArray()) }
                val source = if (conn.responseCode in 200..299) conn.inputStream else conn.errorStream
                val json = JSONObject(source.bufferedReader().readText())
                if (!json.optBoolean("ok")) throw IllegalStateException(json.optString("error", "PAIRING_FAILED"))
                prefs.edit().putString("device_token", json.getString("token")).apply()
                runOnUiThread { Toast.makeText(this, "Android trusted شد ✓", Toast.LENGTH_LONG).show(); updateStatus() }
            } catch (e: Exception) {
                runOnUiThread { status.text = "Pairing failed: " + (e.message ?: "UNKNOWN") }
            }
        }
    }

    private fun openMissingPermission() {
        if (!Settings.canDrawOverlays(this)) {
            startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + packageName)))
            return
        }
        if (android.os.Build.VERSION.SDK_INT >= 33 && checkSelfPermission("android.permission.POST_NOTIFICATIONS") != 0) {
            requestPermissions(arrayOf("android.permission.POST_NOTIFICATIONS"), 700)
            return
        }
        startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
        Toast.makeText(this, "DRO Accessibility را فعال کن و برگرد.", Toast.LENGTH_LONG).show()
    }

    private fun requestScreenCapture() {
        val manager = getSystemService(MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        startActivityForResult(manager.createScreenCaptureIntent(), 801)
    }

    @Deprecated("Use Activity Result APIs for new code")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == 801 && resultCode == RESULT_OK && data != null) {
            val intent = Intent(this, ScreenCaptureService::class.java).apply {
                putExtra(ScreenCaptureService.EXTRA_RESULT_CODE, resultCode)
                putExtra(ScreenCaptureService.EXTRA_DATA, data)
            }
            ContextCompat.startForegroundService(this, intent)
            Toast.makeText(this, "Screen sharing started", Toast.LENGTH_SHORT).show()
        }
    }

    private fun enableOverlay() {
        if (!Settings.canDrawOverlays(this)) {
            startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + packageName)))
        } else {
            ContextCompat.startForegroundService(this, Intent(this, DROOverlayService::class.java))
        }
    }

    override fun onDestroy() {
        executor.shutdownNow()
        super.onDestroy()
    }
}