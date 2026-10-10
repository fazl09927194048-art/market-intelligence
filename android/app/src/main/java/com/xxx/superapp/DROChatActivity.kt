package com.xxx.superapp

import android.content.Context
import android.graphics.Typeface
import android.os.Bundle
import android.view.Gravity
import android.view.inputmethod.EditorInfo
import android.widget.*
import androidx.appcompat.app.AppCompatActivity
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

class DROChatActivity : AppCompatActivity() {
    private val prefs by lazy { getSharedPreferences("dro_control", Context.MODE_PRIVATE) }
    private val serverUrl: String get() = prefs.getString("server_url", "https://market-intelligence-840b.onrender.com").orEmpty().trim().trimEnd('/')
    private val worker = Executors.newSingleThreadExecutor()
    private val history = mutableListOf<Pair<String, String>>()
    private lateinit var transcript: LinearLayout
    private lateinit var scroll: ScrollView
    private lateinit var input: EditText
    private lateinit var send: Button
    private var busy = false
    private val bg = 0xFF07090D.toInt()
    private val panel = 0xFF111722.toInt()
    private val alt = 0xFF1A2534.toInt()
    private val white = 0xFFF4F7FB.toInt()
    private val muted = 0xFF9AA8BA.toInt()
    private val green = 0xFF39D98A.toInt()
    private val gold = 0xFFF4C76B.toInt()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        loadHistory()
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(14), dp(12), dp(14), dp(12))
            setBackgroundColor(bg)
        }
        root.addView(text("DRO • CHAT", 21f, white, true))
        root.addView(text("گفت‌وگوی مستقیم با موتور هوش داخلی سایت", 12f, muted))
        root.addView(text("بدون نیاز به API Key خارجی • " + prefs.getString("default_symbol", "BTCUSDT") + " • " + prefs.getString("default_interval", "15m"), 11f, gold))
        val header = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        val clear = button("پاک کردن تاریخچه", false) { history.clear(); saveHistory(); drawHistory() }
        header.addView(clear, LinearLayout.LayoutParams(0, dp(44), 1f))
        val settings = button("تنظیمات", false) { startActivity(android.content.Intent(this, DROSettingsActivity::class.java)) }
        header.addView(settings, LinearLayout.LayoutParams(0, dp(44), 1f))
        root.addView(header)
        scroll = ScrollView(this).apply { isFillViewport = true; setBackgroundColor(panel) }
        transcript = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(10), dp(10), dp(10), dp(10)) }
        scroll.addView(transcript)
        root.addView(scroll, LinearLayout.LayoutParams(-1, 0, 1f).apply { topMargin = dp(8); bottomMargin = dp(8) })
        input = EditText(this).apply {
            hint = "از DRO سؤال کن؛ مثلاً تحلیل BTC، ریسک یا دلیل NO TRADE…"
            setTextColor(white); setHintTextColor(muted); textSize = 14f
            minLines = 2; maxLines = 4; gravity = Gravity.TOP or Gravity.START
            setPadding(dp(12), dp(10), dp(12), dp(10)); setBackgroundColor(alt)
            imeOptions = EditorInfo.IME_ACTION_SEND
            setOnEditorActionListener { _, actionId, _ ->
                if (actionId == EditorInfo.IME_ACTION_SEND) { submit(); true } else false
            }
        }
        root.addView(input, LinearLayout.LayoutParams(-1, dp(82)))
        send = button("ارسال به DRO", true) { submit() }
        root.addView(send, LinearLayout.LayoutParams(-1, dp(48)).apply { topMargin = dp(6) })
        setContentView(root)
        drawHistory()
    }

    private fun submit() {
        if (busy) return
        val message = input.text.toString().trim()
        if (message.isBlank()) return
        input.setText("")
        history.add("user" to message)
        saveHistory()
        busy = true
        send.isEnabled = false
        send.text = "DRO در حال تحلیل است…"
        drawHistory()
        worker.execute {
            var conn: HttpURLConnection? = null
            try {
                conn = URL(serverUrl + "/api/chat").openConnection() as HttpURLConnection
                conn.requestMethod = "POST"
                conn.connectTimeout = 15000
                conn.readTimeout = 60000
                conn.doOutput = true
                conn.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                conn.setRequestProperty("Accept", "application/json")
                val messages = JSONArray()
                history.dropLast(1).takeLast(12).forEach { item ->
                    messages.put(JSONObject().put("role", item.first).put("text", item.second.take(1800)))
                }
                val payload = JSONObject()
                    .put("message", message)
                    .put("symbol", prefs.getString("default_symbol", "BTCUSDT"))
                    .put("interval", prefs.getString("default_interval", "15m"))
                    .put("history", messages)
                conn.outputStream.use { it.write(payload.toString().toByteArray(Charsets.UTF_8)) }
                val code = conn.responseCode
                val stream = if (code in 200..299) conn.inputStream else conn.errorStream
                val response = JSONObject(stream.bufferedReader().use { it.readText() })
                val answer = response.optString("text", response.optString("error", "پاسخ متنی از سرور دریافت نشد."))
                runOnUiThread {
                    history.add("assistant" to if (code in 200..299) answer else "خطای سرور HTTP " + code + ": " + answer)
                    saveHistory()
                    busy = false
                    send.isEnabled = true
                    send.text = "ارسال به DRO"
                    drawHistory()
                }
            } catch (e: Exception) {
                runOnUiThread {
                    history.add("assistant" to ("اتصال ناموفق: " + (e.message ?: "خطای شبکه") + "\nآدرس سایت و اینترنت را در تنظیمات بررسی کن."))
                    saveHistory()
                    busy = false
                    send.isEnabled = true
                    send.text = "ارسال دوباره"
                    drawHistory()
                }
            } finally { conn?.disconnect() }
        }
    }

    private fun loadHistory() {
        val raw = prefs.getString("dro_chat_history", "").orEmpty()
        if (raw.isBlank()) return
        try {
            val array = JSONArray(raw)
            for (i in 0 until array.length()) {
                val item = array.optJSONObject(i) ?: continue
                history.add(item.optString("role") to item.optString("text"))
            }
        } catch (_: Exception) { prefs.edit().remove("dro_chat_history").apply() }
    }

    private fun saveHistory() {
        val array = JSONArray()
        history.takeLast(40).forEach { item ->
            array.put(JSONObject().put("role", item.first).put("text", item.second.take(7000)))
        }
        prefs.edit().putString("dro_chat_history", array.toString()).apply()
    }

    private fun drawHistory() {
        if (!::transcript.isInitialized) return
        transcript.removeAllViews()
        if (history.isEmpty()) {
            transcript.addView(text("سلام، من DRO هستم. درباره بازار، سناریو، ریسک، تحلیل‌گران یا علت تصمیم موتور بپرس. پاسخ‌ها از API زنده سایت می‌آیند.", 14f, muted))
        } else {
            history.takeLast(30).forEach { item ->
                transcript.addView(text(if (item.first == "assistant") "DRO" else "تو", 11f, if (item.first == "assistant") green else gold, true))
                val bubble = TextView(this).apply {
                    text = item.second
                    textSize = 14f
                    setTextColor(white)
                    setPadding(dp(10), dp(10), dp(10), dp(10))
                    setBackgroundColor(alt)
                    setLineSpacing(dp(2).toFloat(), 1.05f)
                }
                transcript.addView(bubble, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(4); bottomMargin = dp(10) })
            }
        }
        if (busy) transcript.addView(text("در حال دریافت پاسخ از موتور DRO…", 12f, gold))
        scroll.post { scroll.fullScroll(ScrollView.FOCUS_DOWN) }
    }

    private fun text(value: String, size: Float, color: Int, bold: Boolean = false) = TextView(this).apply {
        text = value; textSize = size; setTextColor(color)
        if (bold) setTypeface(typeface, Typeface.BOLD)
        setPadding(0, dp(4), 0, dp(5))
    }

    private fun button(label: String, primary: Boolean, action: () -> Unit) = Button(this).apply {
        text = label; isAllCaps = false; textSize = 12f
        setTextColor(if (primary) bg else white)
        setBackgroundTintList(android.content.res.ColorStateList.valueOf(if (primary) green else alt))
        setOnClickListener { action() }
    }

    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()

    override fun onDestroy() {
        worker.shutdownNow()
        super.onDestroy()
    }
}
