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
import java.nio.charset.StandardCharsets
import java.security.KeyStore
import java.util.UUID
import java.util.concurrent.Executors
import android.util.Base64
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.spec.GCMParameterSpec

private const val SECURE_PREFS = "dro_secure"
private const val TOKEN_KEY = "device_token"
private const val TOKEN_AES_ALIAS = "dro_device_token_aes"
private const val SIGNING_ALIAS = "dro_device_signing"

fun secureDeviceToken(context: Context): String? {
    val packed = context.getSharedPreferences(SECURE_PREFS, Context.MODE_PRIVATE)
        .getString(TOKEN_KEY, null) ?: return null
    return try {
        val bytes = Base64.decode(packed, Base64.NO_WRAP)
        if (bytes.size <= 12) return null
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        val key = keyStore.getKey(TOKEN_AES_ALIAS, null) as? javax.crypto.SecretKey ?: return null
        cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, bytes.copyOfRange(0, 12)))
        String(cipher.doFinal(bytes.copyOfRange(12, bytes.size)), StandardCharsets.UTF_8)
    } catch (_: Exception) { null }
}

fun saveSecureDeviceToken(context: Context, token: String) {
    val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    val key = (keyStore.getKey(TOKEN_AES_ALIAS, null) as? javax.crypto.SecretKey)
        ?: KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder(
                TOKEN_AES_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
            ).setBlockModes(KeyProperties.BLOCK_MODE_GCM)
             .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
             .build())
        }.generateKey()
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.ENCRYPT_MODE, key)
    val ciphertext = cipher.doFinal(token.toByteArray(StandardCharsets.UTF_8))
    val packed = ByteArray(cipher.iv.size + ciphertext.size)
    System.arraycopy(cipher.iv, 0, packed, 0, cipher.iv.size)
    System.arraycopy(ciphertext, 0, packed, cipher.iv.size, ciphertext.size)
    context.getSharedPreferences(SECURE_PREFS, Context.MODE_PRIVATE).edit()
        .putString(TOKEN_KEY, Base64.encodeToString(packed, Base64.NO_WRAP))
        .apply()
}

fun clearSecureDeviceToken(context: Context) {
    context.getSharedPreferences(SECURE_PREFS, Context.MODE_PRIVATE).edit().remove(TOKEN_KEY).apply()
}

fun deviceSigningPublicKey(): String {
    val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    if (!ks.containsAlias(SIGNING_ALIAS)) {
        val generator = java.security.KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, "AndroidKeyStore")
        generator.initialize(KeyGenParameterSpec.Builder(
            SIGNING_ALIAS,
            KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY
        ).setDigests(KeyProperties.DIGEST_SHA256, KeyProperties.DIGEST_SHA512).build())
        generator.generateKeyPair()
    }
    return Base64.encodeToString(ks.getCertificate(SIGNING_ALIAS).publicKey.encoded, Base64.NO_WRAP)
}

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
        val trusted = secureDeviceToken(this) != null
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
                    put("publicKey", deviceSigningPublicKey())
                }
                val conn = URL(serverUrl + "/api/phone-control/pair").openConnection() as HttpURLConnection
                conn.requestMethod = "POST"; conn.doOutput = true; conn.connectTimeout = 10000; conn.readTimeout = 10000
                conn.setRequestProperty("Content-Type", "application/json")
                conn.outputStream.use { it.write(body.toString().toByteArray(StandardCharsets.UTF_8)) }
                val source = if (conn.responseCode in 200..299) conn.inputStream else conn.errorStream
                val json = JSONObject(source.bufferedReader().readText())
                if (!json.optBoolean("ok")) throw IllegalStateException(json.optString("error", "PAIRING_FAILED"))
                saveSecureDeviceToken(this, json.getString("token"))
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