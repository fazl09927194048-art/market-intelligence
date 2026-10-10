package com.xxx.superapp

import android.content.Context
import android.graphics.Color
import android.os.Bundle
import android.view.View
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity

class DROWebsiteActivity : AppCompatActivity() {
    private val prefs by lazy { getSharedPreferences("dro_control", Context.MODE_PRIVATE) }
    private lateinit var web: WebView
    private lateinit var progress: ProgressBar
    private lateinit var status: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.rgb(7, 9, 13))
        }
        val top = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = android.view.Gravity.CENTER_VERTICAL
            setPadding(dp(10), dp(6), dp(10), dp(6))
        }
        status = TextView(this).apply {
            text = "DRO • WEBSITE LIVE VIEW"
            textSize = 12f
            setTextColor(Color.WHITE)
        }
        top.addView(status, LinearLayout.LayoutParams(0, dp(40), 1f))
        val reload = TextView(this).apply {
            text = "بارگذاری مجدد"
            textSize = 12f
            setTextColor(Color.rgb(57, 217, 138))
            setPadding(dp(10), dp(8), dp(10), dp(8))
            setOnClickListener { web.reload() }
        }
        top.addView(reload)
        root.addView(top)
        progress = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            max = 100
            visibility = View.GONE
        }
        root.addView(progress, LinearLayout.LayoutParams(-1, dp(3)))
        web = WebView(this)
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        web.settings.loadsImagesAutomatically = true
        web.settings.javaScriptCanOpenWindowsAutomatically = false
        web.settings.allowFileAccess = false
        web.settings.allowContentAccess = false
        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                val url = request?.url?.toString().orEmpty()
                return !url.startsWith("https://")
            }
            override fun onPageFinished(view: WebView?, url: String?) {
                status.text = "DRO • " + (url ?: "صفحه سایت")
            }
        }
        web.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                progress.progress = newProgress
                progress.visibility = if (newProgress >= 100) View.GONE else View.VISIBLE
            }
        }
        root.addView(web, LinearLayout.LayoutParams(-1, 0, 1f))
        setContentView(root)
        loadSite()
    }

    private fun loadSite() {
        val base = prefs.getString("server_url", "https://market-intelligence-840b.onrender.com").orEmpty().trimEnd('/')
        if (!base.startsWith("https://")) {
            Toast.makeText(this, "برای امنیت، آدرس سایت باید HTTPS باشد.", Toast.LENGTH_LONG).show()
            finish()
            return
        }
        web.loadUrl(base)
    }

    override fun onBackPressed() {
        if (::web.isInitialized && web.canGoBack()) web.goBack() else super.onBackPressed()
    }

    override fun onDestroy() {
        if (::web.isInitialized) {
            web.stopLoading()
            web.destroy()
        }
        super.onDestroy()
    }

    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()
}
