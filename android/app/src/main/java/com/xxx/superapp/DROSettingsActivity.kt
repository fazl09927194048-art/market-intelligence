package com.xxx.superapp

import android.content.Context
import android.graphics.Typeface
import android.os.Bundle
import android.view.Gravity
import android.widget.*
import androidx.appcompat.app.AppCompatActivity
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.Locale
import java.util.concurrent.Executors

class DROSettingsActivity : AppCompatActivity() {
    private val prefs by lazy { getSharedPreferences("dro_control", Context.MODE_PRIVATE) }
    private val worker = Executors.newSingleThreadExecutor()
    private val bg = 0xFF07090D.toInt()
    private val panel = 0xFF111722.toInt()
    private val alt = 0xFF1A2534.toInt()
    private val white = 0xFFF4F7FB.toInt()
    private val muted = 0xFF9AA8BA.toInt()
    private val green = 0xFF39D98A.toInt()
    private val gold = 0xFFF4C76B.toInt()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(14), dp(12), dp(14), dp(18))
            setBackgroundColor(bg)
        }
        root.addView(text("DRO • SETTINGS", 21f, white, true))
        root.addView(text("تنظیمات برنامه، API مشترک و همگام‌سازی سایت", 12f, muted))
        val scroll = ScrollView(this)
        val content = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        scroll.addView(content)
        root.addView(scroll, LinearLayout.LayoutParams(-1, 0, 1f))
        val conn = card(content, "اتصال به سایت")
        add(conn, "آدرس سایت باید HTTPS باشد. تغییر این آدرس روی بازار و چت DRO اثر می‌گذارد.", 12f, muted)
        val url = field(conn, "آدرس پایه", "https://market-intelligence-840b.onrender.com", prefs.getString("server_url", "https://market-intelligence-840b.onrender.com").orEmpty(), false)
        val symbol = field(conn, "نماد پیش‌فرض تحلیل", "BTCUSDT", prefs.getString("default_symbol", "BTCUSDT").orEmpty(), true)
        val interval = field(conn, "تایم‌فریم پیش‌فرض", "15m", prefs.getString("default_interval", "15m").orEmpty(), true)
        val refresh = field(conn, "فاصله تازه‌سازی بازار (ثانیه، 15 تا 600)", "60", prefs.getString("refresh_seconds", "60").orEmpty(), true)
        val auto = CheckBox(this).apply {
            text = "به‌روزرسانی خودکار بازار"
            textSize = 13f; setTextColor(white)
            buttonTintList = android.content.res.ColorStateList.valueOf(green)
            isChecked = prefs.getBoolean("auto_refresh", true)
        }
        conn.addView(auto)
        val save = button("ذخیره تنظیمات", true) {
            val cleanUrl = url.text.toString().trim().trimEnd('/')
            val cleanSymbol = symbol.text.toString().trim().uppercase(Locale.US)
            val cleanInterval = interval.text.toString().trim()
            val secs = refresh.text.toString().trim().toIntOrNull()
            if (!cleanUrl.startsWith("https://") || cleanSymbol.isBlank() ||
                !cleanSymbol.matches(Regex("[A-Z0-9]{3,20}")) ||
                !cleanInterval.matches(Regex("[A-Za-z0-9]{2,8}")) ||
                secs == null || secs !in 15..600) {
                Toast.makeText(this, "یکی از مقادیر نامعتبر است؛ آدرس HTTPS و مقادیر را بررسی کن.", Toast.LENGTH_LONG).show()
            } else {
                prefs.edit()
                    .putString("server_url", cleanUrl)
                    .putString("default_symbol", cleanSymbol)
                    .putString("default_interval", cleanInterval)
                    .putString("refresh_seconds", secs.toString())
                    .putBoolean("auto_refresh", auto.isChecked)
                    .apply()
                Toast.makeText(this, "تنظیمات ذخیره شد", Toast.LENGTH_SHORT).show()
            }
        }
        conn.addView(save, LinearLayout.LayoutParams(-1, dp(48)).apply { topMargin = dp(8) })
        conn.addView(button("آزمایش اتصال و API بازار", false) { testConnection(conn) }, LinearLayout.LayoutParams(-1, dp(48)).apply { topMargin = dp(6) })

        val sync = card(content, "همگام‌سازی با وب‌سایت")
        add(sync, "• بازار اپ از /api/market خوانده می‌شود؛ نمادهای تازه‌ای که API سایت برگرداند، در اپ هم ظاهر می‌شوند.\n• چت اپ از /api/chat استفاده می‌کند و به موتور داخلی DRO متصل است.\n• تغییر منطق یا داده‌های API در سایت نیاز به انتشار APK جدید ندارد.\n• تغییر صرفاً ظاهری در وب‌سایت، خودکار ظاهر بومی اندروید را تغییر نمی‌دهد.\n• دفترچه و تاریخچه چت محلی روی همین دستگاه نگه‌داری می‌شوند.", 12f, muted)
        sync.addView(button("باز کردن سایت", false) {
            try { startActivity(android.content.Intent(android.content.Intent.ACTION_VIEW, android.net.Uri.parse(url.text.toString().trim()))) }
            catch (_: Exception) { Toast.makeText(this, "آدرس سایت را ذخیره و بررسی کن.", Toast.LENGTH_SHORT).show() }
        }, LinearLayout.LayoutParams(-1, dp(46)))
        val safety = card(content, "حریم خصوصی و ایمنی")
        add(safety, "این صفحه کلید صرافی را ذخیره نمی‌کند و سفارش معاملاتی ارسال نمی‌کند. پیام‌های چت و یادداشت‌ها روی گوشی ذخیره می‌شوند. هر تحلیل وابسته به دسترس‌پذیری داده سرور است و تضمین سود نیست.", 12f, muted)
        setContentView(root)
    }

    private fun testConnection(parent: LinearLayout) {
        val base = prefs.getString("server_url", "https://market-intelligence-840b.onrender.com").orEmpty().trimEnd('/')
        worker.execute {
            var conn: HttpURLConnection? = null
            try {
                conn = URL(base + "/api/market").openConnection() as HttpURLConnection
                conn.connectTimeout = 10000
                conn.readTimeout = 10000
                val code = conn.responseCode
                val stream = if (code in 200..299) conn.inputStream else conn.errorStream
                val data = JSONObject(stream.bufferedReader().use { it.readText() })
                val count = data.optJSONArray("markets")?.length() ?: 0
                val result = if (code in 200..299 && count > 0) "اتصال موفق • " + count + " نماد • " + data.optString("provider", "provider") else "سرور پاسخ داد ولی داده بازار در دسترس نیست (HTTP " + code + ")"
                runOnUiThread { Toast.makeText(this, result, Toast.LENGTH_LONG).show() }
            } catch (e: Exception) {
                runOnUiThread { Toast.makeText(this, "اتصال ناموفق: " + (e.message ?: "خطای شبکه"), Toast.LENGTH_LONG).show() }
            } finally { conn?.disconnect() }
        }
    }

    private fun card(parent: LinearLayout, title: String): LinearLayout {
        val outer = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(13), dp(12), dp(13), dp(13))
            setBackgroundColor(panel)
        }
        outer.addView(text(title, 15f, white, true))
        val inner = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(0, dp(8), 0, 0) }
        outer.addView(inner)
        parent.addView(outer, LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = dp(10) })
        return inner
    }

    private fun field(parent: LinearLayout, title: String, hint: String, initial: String, single: Boolean): EditText {
        add(parent, title, 12f, muted)
        val input = EditText(this).apply {
            this.hint = hint; setText(initial); setTextColor(white); setHintTextColor(muted)
            textSize = 14f; setSingleLine(single); setPadding(dp(10), dp(4), dp(10), dp(4))
            setBackgroundColor(alt)
        }
        parent.addView(input, LinearLayout.LayoutParams(-1, dp(48)).apply { topMargin = dp(4); bottomMargin = dp(7) })
        return input
    }

    private fun add(parent: LinearLayout, value: String, size: Float, color: Int) {
        parent.addView(text(value, size, color), LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = dp(5) })
    }

    private fun text(value: String, size: Float, color: Int, bold: Boolean = false) = TextView(this).apply {
        text = value; textSize = size; setTextColor(color)
        if (bold) setTypeface(typeface, Typeface.BOLD)
        gravity = Gravity.START or Gravity.CENTER_VERTICAL
        setLineSpacing(dp(2).toFloat(), 1.05f)
        setPadding(0, dp(3), 0, dp(4))
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
