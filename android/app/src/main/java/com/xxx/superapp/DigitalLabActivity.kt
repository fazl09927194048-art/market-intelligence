package com.xxx.superapp

import android.content.Context
import android.content.Intent
import android.graphics.Typeface
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.InputType
import android.view.Gravity
import android.widget.*
import androidx.appcompat.app.AppCompatActivity
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.Executors

private const val LAB_BG = 0xFF07090D.toInt()
private const val LAB_PANEL = 0xFF111722.toInt()
private const val LAB_ALT = 0xFF1A2534.toInt()
private const val LAB_WHITE = 0xFFF4F7FB.toInt()
private const val LAB_MUTED = 0xFF9AA8BA.toInt()
private const val LAB_GREEN = 0xFF39D98A.toInt()
private const val LAB_RED = 0xFFFF6577.toInt()
private const val LAB_GOLD = 0xFFF4C76B.toInt()

private data class LabMarket(val symbol: String, val name: String, val price: Double, val change: Double)

class DigitalLabActivity : AppCompatActivity() {
    private val serverUrl: String get() = prefs.getString("server_url", "https://market-intelligence-840b.onrender.com").orEmpty().trim().trimEnd('/')
    private val prefs by lazy { getSharedPreferences("dro_control", Context.MODE_PRIVATE) }
    private val worker = Executors.newSingleThreadExecutor()
    private val mainHandler = Handler(Looper.getMainLooper())
    private val autoRefreshTask = object : Runnable {
        override fun run() {
            if (prefs.getBoolean("auto_refresh", true) && !isFinishing) refreshMarkets()
            val seconds = prefs.getString("refresh_seconds", "60")?.toLongOrNull() ?: 60L
            mainHandler.postDelayed(this, seconds.coerceIn(15L, 600L) * 1000L)
        }
    }
    private lateinit var page: LinearLayout
    private lateinit var status: TextView
    private var tab = "home"
    private var marketRows: List<LabMarket> = emptyList()
    private var marketDataValid = false
    private var loading = false
    private var marketMessage = "برای دریافت قیمت‌ها، رفرش را بزن."
    private var marketFilter = ""

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        shell()
        render()
        refreshMarkets()
    }

    override fun onResume() {
        super.onResume()
        if (::status.isInitialized) updateStatus()
        mainHandler.removeCallbacks(autoRefreshTask)
        mainHandler.postDelayed(autoRefreshTask, 15000L)
    }

    override fun onPause() {
        mainHandler.removeCallbacks(autoRefreshTask)
        super.onPause()
    }

    private fun shell() {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(14), dp(12), dp(14), dp(8))
            setBackgroundColor(LAB_BG)
        }
        val header = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        val title = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        title.addView(txt("DRO • DIGITAL LAB", 21f, LAB_WHITE, true))
        title.addView(txt("آزمایشگاه دیجیتال بازار و ابزارهای ترید", 12f, LAB_MUTED))
        header.addView(title, LinearLayout.LayoutParams(0, -2, 1f))
        status = txt("MARKET • CHECK", 10f, LAB_GOLD, true)
        header.addView(status)
        root.addView(header, LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = dp(12) })

        val navScroll = HorizontalScrollView(this).apply { isHorizontalScrollBarEnabled = false }
        val nav = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        listOf("home" to "خانه", "markets" to "بازار", "lab" to "آزمایش ترید", "journal" to "دفتر", "tools" to "ابزارها").forEach { pair ->
            val b = Button(this).apply {
                text = pair.second; isAllCaps = false; textSize = 11f; minHeight = dp(42)
                setTextColor(LAB_WHITE)
                setBackgroundTintList(android.content.res.ColorStateList.valueOf(LAB_ALT))
                setOnClickListener { tab = pair.first; render() }
            }
            nav.addView(b, LinearLayout.LayoutParams(-2, dp(42)).apply { marginEnd = dp(5) })
        }
        navScroll.addView(nav)
        root.addView(navScroll, LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = dp(10) })

        val scroll = ScrollView(this).apply { isFillViewport = true }
        page = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(0, 0, 0, dp(16)) }
        scroll.addView(page)
        root.addView(scroll, LinearLayout.LayoutParams(-1, 0, 1f))
        setContentView(root)
        updateStatus()
    }

    private fun render() {
        page.removeAllViews()
        when (tab) {
            "home" -> home()
            "markets" -> markets()
            "lab" -> tradeLab()
            "journal" -> journal()
            "tools" -> tools()
        }
    }

    private fun home() {
        val hero = card("DRO DIGITAL LAB • نسخه 1.2")
        add(hero, "یک ابزارخانه چندمنظوره برای تحلیل بازار، محاسبه ریسک، بررسی سود و زیان و ثبت معاملات.", 15f, LAB_WHITE, true)
        add(hero, "این نسخه قیمت‌های بازار را از API سایت می‌گیرد و محاسبات را روی خود گوشی انجام می‌دهد. داده ساختگی به‌عنوان قیمت زنده نمایش داده نمی‌شود.", 12f, LAB_MUTED)
        button(hero, "ورود به آزمایشگاه ترید", true) { tab = "lab"; render() }
        button(hero, "مشاهده بازار", false) { tab = "markets"; render(); refreshMarkets() }
        button(hero, "گفت‌وگوی مستقیم با DRO", true) { startActivity(Intent(this, DROChatActivity::class.java)) }
        button(hero, "تنظیمات و همگام‌سازی سایت", false) { startActivity(Intent(this, DROSettingsActivity::class.java)) }
        button(hero, "نمای زنده سایت داخل اپ", false) { startActivity(Intent(this, DROWebsiteActivity::class.java)) }

        val market = card("وضعیت بازار")
        add(market, marketMessage, 13f, if (marketRows.isEmpty()) LAB_GOLD else LAB_GREEN)
        add(market, "نمادهای دریافت‌شده: " + marketRows.size, 12f, LAB_MUTED)
        button(market, if (loading) "در حال دریافت…" else "به‌روزرسانی قیمت‌ها", false, loading) { refreshMarkets() }

        val shortcuts = card("ابزارهای اصلی")
        button(shortcuts, "محاسبه حجم پوزیشن و ریسک", false) { tab = "lab"; render() }
        button(shortcuts, "محاسبه P/L لانگ و شورت", false) { tab = "lab"; render() }
        button(shortcuts, "دفترچه معاملات و درس‌آموخته‌ها", false) { tab = "journal"; render() }
        button(shortcuts, "گفت‌وگو با DRO", false) { startActivity(Intent(this, DROChatActivity::class.java)) }
        button(shortcuts, "تنظیمات برنامه", false) { startActivity(Intent(this, DROSettingsActivity::class.java)) }
        button(shortcuts, "اتصال گوشی، مجوزها و اشتراک صفحه", false) {
            startActivity(Intent(this, MainActivity::class.java))
        }
        button(shortcuts, "باز کردن تحلیل‌گر DRO در وب", true) { openUrl(serverUrl) }

        val roadmap = card("ماژول‌های آزمایشگاه")
        add(roadmap, "✓ پایش قیمت و تغییرات ۲۴ ساعته\n✓ محاسبه‌گر ریسک و اندازه پوزیشن\n✓ محاسبه‌گر سود و زیان با اهرم\n✓ چک‌لیست پیش از معامله\n✓ دفتر ثبت معامله روی گوشی\n✓ دسترسی به Phone Control و حباب شناور", 13f, LAB_MUTED)
        add(roadmap, "اتصال مستقیم سفارش به صرافی در این نسخه فعال نیست؛ محاسبات، سیگنال معاملاتی یا اجرای معامله محسوب نمی‌شوند.", 11f, LAB_GOLD)
    }

    private fun markets() {
        val c = card("MARKET WATCH • پایش بازار")
        add(c, "منبع واحد: API مشترک FLI/DRO. هر نمادی که سرور در /api/market برگرداند بدون انتشار APK در این فهرست ظاهر می‌شود.", 12f, LAB_MUTED)
        button(c, if (loading) "در حال دریافت…" else "رفرش بازار", true, loading) { refreshMarkets() }
        val search = field(c, "جست‌وجوی ارز", "BTC / ETH / SUI", marketFilter, InputType.TYPE_CLASS_TEXT)
        button(c, "اعمال جست‌وجو", false) { marketFilter = search.text.toString().trim(); render() }
        add(c, marketMessage, 12f, if (marketRows.isEmpty()) LAB_GOLD else LAB_GREEN)
        val visibleMarkets = marketRows.filter { marketFilter.isBlank() || it.symbol.contains(marketFilter, true) || it.name.contains(marketFilter, true) }
        if (marketRows.isEmpty()) {
            add(c, "در حال حاضر داده معتبر برای نمایش نداریم. اینترنت را بررسی و دوباره تلاش کن.", 13f, LAB_WHITE)
        } else {
            if (visibleMarkets.isEmpty()) add(c, "ارزی با این عبارت پیدا نشد.", 13f, LAB_MUTED)
            visibleMarkets.forEach { m ->
                val row = LinearLayout(this).apply {
                    orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL
                    setPadding(dp(10), dp(10), dp(10), dp(10)); setBackgroundColor(LAB_ALT)
                }
                val left = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
                left.addView(txt(m.symbol, 14f, LAB_WHITE, true))
                left.addView(txt(m.name, 11f, LAB_MUTED))
                row.addView(left, LinearLayout.LayoutParams(0, -2, 1f))
                val right = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.END }
                right.addView(txt(price(m.price), 14f, LAB_WHITE, true))
                right.addView(txt(String.format(Locale.US, "%+.2f%%", m.change), 12f, if (m.change >= 0) LAB_GREEN else LAB_RED))
                row.addView(right)
                c.addView(row, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(5) })
            }
        }
        val next = card("ادامه تحلیل")
        button(next, "باز کردن DRO در سایت", true) { openUrl(serverUrl) }
        button(next, "رفتن به محاسبه‌گر ریسک", false) { tab = "lab"; render() }
    }

    private fun tradeLab() {
        add(page, "محاسبات زیر برای برنامه‌ریزی معامله‌اند؛ هزینه‌ها و شرایط واقعی صرافی باید جداگانه بررسی شوند.", 12f, LAB_MUTED)
        val risk = card("۱ • محاسبه‌گر حجم و ریسک")
        val balance = field(risk, "موجودی حساب (USDT)", "100", "100", InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL)
        val riskPct = field(risk, "ریسک مجاز (%)", "1", "1", InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL)
        val entry = field(risk, "قیمت ورود", "65000", "65000", InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL)
        val stop = field(risk, "حد ضرر", "64200", "64200", InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL)
        val target = field(risk, "هدف سود", "66600", "66600", InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL)
        val result = txt("نتیجه محاسبه اینجا نمایش داده می‌شود.", 13f, LAB_MUTED)
        risk.addView(result)
        button(risk, "محاسبه حجم و نسبت سود به ضرر", true) {
            val b = balance.num(); val r = riskPct.num(); val e = entry.num(); val s = stop.num(); val t = target.num()
            if (b == null || r == null || e == null || s == null || t == null || b <= 0 || r <= 0 || r > 100 || e <= 0 || s <= 0 || t <= 0 || e == s) {
                result.text = "ورودی نامعتبر است؛ مقادیر را بررسی کن."; result.setTextColor(LAB_RED)
            } else {
                val riskMoney = b * r / 100.0
                val units = riskMoney / kotlin.math.abs(e - s)
                val notional = units * e
                val reward = units * kotlin.math.abs(t - e)
                val rr = kotlin.math.abs(t - e) / kotlin.math.abs(e - s)
                result.text = "ریسک برنامه‌ریزی‌شده: " + f(riskMoney) + " USDT\nحجم تقریبی: " + f(units, 6) + " واحد\nارزش اسمی پوزیشن: " + f(notional) + " USDT\nسود فرضی تا هدف: " + f(reward) + " USDT\nنسبت سود به ضرر: 1 : " + f(rr) + "\n\nکارمزد، اسلیپیج، اهرم و لیکوییدیشن در این فرمول لحاظ نشده‌اند."
                result.setTextColor(LAB_WHITE)
            }
        }

        val pnl = card("۲ • محاسبه‌گر سود و زیان P/L")
        val side = Spinner(this)
        side.adapter = ArrayAdapter(this, android.R.layout.simple_spinner_dropdown_item, listOf("Long / خرید", "Short / فروش"))
        pnl.addView(txt("جهت معامله", 12f, LAB_MUTED))
        pnl.addView(side, LinearLayout.LayoutParams(-1, dp(48)))
        val pEntry = field(pnl, "قیمت ورود", "100", "100", InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL)
        val pExit = field(pnl, "قیمت خروج", "105", "105", InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL)
        val margin = field(pnl, "مارجین (USDT)", "20", "20", InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL)
        val leverage = field(pnl, "اهرم (x)", "5", "5", InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL)
        val pnlResult = txt("نتیجه محاسبه اینجا نمایش داده می‌شود.", 13f, LAB_MUTED)
        pnl.addView(pnlResult)
        button(pnl, "محاسبه P/L", true) {
            val e = pEntry.num(); val x = pExit.num(); val m = margin.num(); val l = leverage.num()
            if (e == null || x == null || m == null || l == null || e <= 0 || x <= 0 || m <= 0 || l <= 0 || l > 200) {
                pnlResult.text = "ورودی نامعتبر است؛ اهرم باید بین صفر و 200 باشد."; pnlResult.setTextColor(LAB_RED)
            } else {
                val quantity = m * l / e
                val direction = if (side.selectedItemPosition == 0) 1.0 else -1.0
                val profit = (x - e) * quantity * direction
                pnlResult.text = "حجم فرضی: " + f(quantity, 6) + " واحد\nارزش اسمی: " + f(m * l) + " USDT\nP/L قبل از هزینه‌ها: " + f(profit) + " USDT\nبازده نسبت به مارجین: " + f(profit / m * 100.0) + "%\n\nکارمزد، funding، اسلیپیج و قیمت لیکوییدیشن لحاظ نشده‌اند."
                pnlResult.setTextColor(if (profit >= 0) LAB_GREEN else LAB_RED)
            }
        }

        val checklist = card("۳ • چک‌لیست قبل از ورود")
        listOf("روند و تایم‌فریم بالاتر بررسی شده", "حد ضرر از قبل مشخص شده", "ریسک با موجودی متناسب است", "نسبت سود به ضرر بررسی شده", "اخبار مهم و رویدادها بررسی شده", "قیمت و نماد از منبع معتبر تأیید شده").forEach { label ->
            checklist.addView(CheckBox(this).apply {
                text = label; textSize = 13f; setTextColor(LAB_WHITE)
                buttonTintList = android.content.res.ColorStateList.valueOf(LAB_GREEN)
            })
        }
        add(checklist, "تیک‌ها صرفاً روی صفحه‌اند و تأیید یا توصیه معاملاتی نیستند.", 11f, LAB_MUTED)
    }

    private fun journal() {
        val c = card("دفتر ثبت معاملات")
        add(c, "یادداشت‌ها فقط در حافظه محلی همین گوشی ذخیره می‌شوند.", 12f, LAB_MUTED)
        val title = field(c, "نماد / عنوان", "BTCUSDT • شکست مقاومت", "", InputType.TYPE_CLASS_TEXT)
        val body = EditText(this).apply {
            hint = "دلیل ورود، سناریو، حد ضرر، نتیجه و درس آموخته‌شده…"
            setTextColor(LAB_WHITE); setHintTextColor(LAB_MUTED); textSize = 14f
            gravity = Gravity.TOP or Gravity.START; minLines = 4
            setPadding(dp(12), dp(12), dp(12), dp(12)); setBackgroundColor(LAB_ALT)
        }
        c.addView(body, LinearLayout.LayoutParams(-1, dp(120)).apply { topMargin = dp(6) })
        button(c, "ذخیره یادداشت", true) {
            val name = title.text.toString().trim(); val text = body.text.toString().trim()
            if (name.isBlank() || text.isBlank()) {
                Toast.makeText(this, "عنوان و متن را وارد کن", Toast.LENGTH_SHORT).show()
            } else {
                val date = SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.getDefault()).format(Date())
                val entry = "• " + date + " | " + name + "\n" + text
                val old = prefs.getString("trade_journal", "").orEmpty()
                prefs.edit().putString("trade_journal", (entry + "\n\n" + old).take(30000)).apply()
                render()
                Toast.makeText(this, "یادداشت ذخیره شد", Toast.LENGTH_SHORT).show()
            }
        }
        val saved = card("یادداشت‌های ذخیره‌شده")
        val notes = prefs.getString("trade_journal", "").orEmpty()
        add(saved, if (notes.isBlank()) "هنوز یادداشتی ثبت نشده." else notes, 13f, if (notes.isBlank()) LAB_MUTED else LAB_WHITE)
        if (notes.isNotBlank()) button(saved, "پاک کردن همه یادداشت‌ها", false) {
            prefs.edit().remove("trade_journal").apply(); render()
        }
    }

    private fun tools() {
        val c = card("ابزارهای دیجیتال")
        add(c, "این بخش نقطه شروع برای اضافه‌کردن ابزارهای بیشتر به آزمایشگاه است.", 13f, LAB_MUTED)
        button(c, "Phone Control • اتصال گوشی", true) { startActivity(Intent(this, MainActivity::class.java)) }
        button(c, "تحلیل‌گر و اسکن تصویر DRO", false) { startActivity(Intent(this, DROWebsiteActivity::class.java)) }
        button(c, "تنظیمات اپ و همگام‌سازی سایت", false) { startActivity(Intent(this, DROSettingsActivity::class.java)) }
        button(c, "باز کردن API وضعیت بازار", false) { openUrl(serverUrl + "/api/market") }
        button(c, "چت مستقیم با DRO", true) { startActivity(Intent(this, DROChatActivity::class.java)) }
        button(c, "تنظیمات و همگام‌سازی", false) { startActivity(Intent(this, DROSettingsActivity::class.java)) }
        button(c, "نمای زنده سایت داخل اپ", false) { startActivity(Intent(this, DROWebsiteActivity::class.java)) }
        val privacy = card("ایمنی و شفافیت")
        add(privacy, "• این برنامه در این نسخه سفارش صرافی ارسال نمی‌کند.\n• قیمت‌ها فقط از پاسخ API دریافت می‌شوند.\n• محاسبات سود و زیان تقریبی‌اند و هزینه‌ها را لحاظ نمی‌کنند.\n• توکن و مجوزهای Phone Control در صفحه جداگانه مدیریت می‌شوند.\n• قبل از استفاده از هر قابلیت کنترل گوشی، مجوزهای اندروید را بررسی کن.", 12f, LAB_MUTED)
    }

    private fun refreshMarkets() {
        if (loading) return
        loading = true
        marketMessage = "در حال دریافت داده از سرور…"
        // Do not rebuild the journal while a user may be typing an unsaved draft.
        if (tab != "journal") render()
        worker.execute {
            var conn: HttpURLConnection? = null
            try {
                conn = URL(serverUrl + "/api/market").openConnection() as HttpURLConnection
                conn.requestMethod = "GET"; conn.connectTimeout = 12000; conn.readTimeout = 12000
                conn.setRequestProperty("Accept", "application/json")
                val code = conn.responseCode
                val stream = if (code in 200..299) conn.inputStream else conn.errorStream
                val json = JSONObject(stream.bufferedReader().use { it.readText() })
                val arr = json.optJSONArray("markets")
                val fresh = mutableListOf<LabMarket>()
                if (arr != null) for (i in 0 until arr.length()) {
                    val item = arr.optJSONObject(i) ?: continue
                    val p = item.optDouble("price", Double.NaN)
                    val change = item.optDouble("change24h", Double.NaN)
                    if (p.isFinite() && change.isFinite() && p > 0) {
                        fresh.add(LabMarket(item.optString("symbol", "—"), item.optString("name", ""), p, change))
                    }
                }
                runOnUiThread {
                    marketRows = fresh; marketDataValid = code in 200..299 && json.optBoolean("dataValid", false); loading = false
                    val warnings = json.optJSONArray("warnings")?.length() ?: 0
                    marketMessage = if (fresh.isNotEmpty()) "دریافت شد • " + json.optString("provider", "market provider") + " • " + fresh.size + " نماد • " + (if (marketDataValid) "داده زنده معتبر" else "داده ناقص/برخی منابع نامعتبر") + " • هشدار: " + warnings
                        else "داده معتبر در دسترس نیست (HTTP " + code + ")"
                    updateStatus()
                    if (tab != "journal") render()
                }
            } catch (e: Exception) {
                runOnUiThread {
                    loading = false
                    marketDataValid = false
                    marketMessage = "اتصال ناموفق: " + (e.message ?: "خطای شبکه")
                    updateStatus()
                    if (tab != "journal") render()
                }
            } finally { conn?.disconnect() }
        }
    }

    private fun updateStatus() {
        if (!::status.isInitialized) return
        status.text = when { marketRows.isEmpty() -> "MARKET • CHECK"; marketDataValid -> "MARKET • LIVE"; else -> "MARKET • PARTIAL" }
        status.setTextColor(if (marketRows.isNotEmpty() && marketDataValid) LAB_GREEN else LAB_GOLD)
    }

    private fun openUrl(url: String) {
        try { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) }
        catch (_: Exception) { Toast.makeText(this, "مرورگر در دسترس نیست", Toast.LENGTH_SHORT).show() }
    }

    private fun card(title: String): LinearLayout {
        val outer = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL; setPadding(dp(14), dp(13), dp(14), dp(14)); setBackgroundColor(LAB_PANEL)
        }
        outer.addView(txt(title, 15f, LAB_WHITE, true))
        val inner = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(0, dp(8), 0, 0) }
        outer.addView(inner)
        page.addView(outer, LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = dp(10) })
        return inner
    }

    private fun add(parent: LinearLayout, text: String, size: Float, color: Int, bold: Boolean = false) {
        val v = txt(text, size, color, bold)
        v.setPadding(0, dp(4), 0, dp(5))
        parent.addView(v, LinearLayout.LayoutParams(-1, -2))
    }

    private fun txt(text: String, size: Float, color: Int, bold: Boolean = false) = TextView(this).apply {
        this.text = text; textSize = size; setTextColor(color)
        if (bold) setTypeface(typeface, Typeface.BOLD)
        gravity = Gravity.START or Gravity.CENTER_VERTICAL
        setLineSpacing(dp(2).toFloat(), 1.08f)
    }

    private fun button(parent: LinearLayout, text: String, primary: Boolean = false, disabled: Boolean = false, action: () -> Unit) {
        val b = Button(this).apply {
            this.text = text; textSize = 12f; isAllCaps = false; isEnabled = !disabled
            setTextColor(if (primary) LAB_BG else LAB_WHITE)
            setBackgroundTintList(android.content.res.ColorStateList.valueOf(if (primary) LAB_GREEN else LAB_ALT))
            setOnClickListener { action() }
        }
        parent.addView(b, LinearLayout.LayoutParams(-1, dp(48)).apply { topMargin = dp(5) })
    }

    private fun field(parent: LinearLayout, title: String, hintText: String, initial: String, type: Int): EditText {
        add(parent, title, 12f, LAB_MUTED)
        val input = EditText(this).apply {
            hint = hintText; setText(initial); setTextColor(LAB_WHITE); setHintTextColor(LAB_MUTED)
            textSize = 14f; inputType = type; setSingleLine(true)
            setPadding(dp(12), 0, dp(12), 0); setBackgroundColor(LAB_ALT)
        }
        parent.addView(input, LinearLayout.LayoutParams(-1, dp(48)).apply { topMargin = dp(4); bottomMargin = dp(8) })
        return input
    }

    private fun EditText.num(): Double? = text.toString().trim().replace(",", ".").toDoubleOrNull()?.takeIf { it.isFinite() }
    private fun f(v: Double, digits: Int = 2) = String.format(Locale.US, "%." + digits + "f", v)
    private fun price(v: Double): String = if (v >= 1000) String.format(Locale.US, "%,.2f", v) else String.format(Locale.US, "%.6f", v).trimEnd('0').trimEnd('.')
    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

    override fun onDestroy() {
        mainHandler.removeCallbacks(autoRefreshTask)
        worker.shutdownNow()
        super.onDestroy()
    }
}
