package com.xxx.superapp

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.graphics.Path
import android.graphics.Rect
import android.os.Bundle
import android.view.accessibility.AccessibilityNodeInfo
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

class DROAccessibilityService : AccessibilityService() {
    private val executor = Executors.newSingleThreadExecutor()
    private val server = "https://market-intelligence-840b.onrender.com"

    override fun onAccessibilityEvent(event: android.view.accessibility.AccessibilityEvent?) {
        if (event != null) poll()
    }

    override fun onInterrupt() {}

    private fun poll() {
        val token = secureDeviceToken(this) ?: return
        executor.execute {
            try {
                val c = URL("$server/api/phone-control/device/actions").openConnection() as HttpURLConnection
                c.requestMethod = "GET"
                c.connectTimeout = 5000
                c.readTimeout = 7000
                c.setRequestProperty("Authorization", "Bearer $token")
                if (c.responseCode !in 200..299) return@execute
                val actions = JSONObject(c.inputStream.bufferedReader().readText()).optJSONArray("actions") ?: return@execute
                for (i in 0 until actions.length()) execute(actions.getJSONObject(i))
            } catch (_: Exception) {}
        }
    }

    private fun execute(a: JSONObject) {
        val id = a.optString("id")
        val p = a.optJSONObject("payload") ?: JSONObject()
        try {
            when (a.optString("action_type")) {
                "BACK" -> performGlobalAction(GLOBAL_ACTION_BACK)
                "HOME" -> performGlobalAction(GLOBAL_ACTION_HOME)
                "RECENT" -> performGlobalAction(GLOBAL_ACTION_RECENTS)
                "TAP" -> gesture(60, p.optDouble("x").toFloat(), p.optDouble("y").toFloat(), p.optDouble("x").toFloat(), p.optDouble("y").toFloat())
                "LONG_PRESS" -> gesture(700, p.optDouble("x").toFloat(), p.optDouble("y").toFloat(), p.optDouble("x").toFloat(), p.optDouble("y").toFloat())
                "SWIPE", "SCROLL" -> {
                    val x1 = p.optDouble("x1", p.optDouble("x")).toFloat()
                    val y1 = p.optDouble("y1", p.optDouble("y")).toFloat()
                    gesture(
                        p.optLong("durationMs", 450),
                        x1, y1,
                        p.optDouble("x2", x1.toDouble()).toFloat(),
                        p.optDouble("y2", y1.toDouble()).toFloat()
                    )
                }
                "TYPE_TEXT" -> typeText(p.optString("text"))
                else -> throw IllegalArgumentException("UNSUPPORTED_ACTION")
            }
            report(id, "SUCCESS", JSONObject().put("verified", true))
        } catch (e: Exception) {
            report(id, "FAILED", JSONObject().put("error", e.message ?: "ACTION_FAILED"))
        }
    }

    private fun gesture(d: Long, x1: Float, y1: Float, x2: Float, y2: Float) {
        val path = Path().apply { moveTo(x1, y1); lineTo(x2, y2) }
        val g = GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(path, 0, d.coerceIn(40, 3000)))
            .build()
        if (!dispatchGesture(g, null, null)) throw IllegalStateException("GESTURE_REJECTED")
    }

    private fun typeText(s: String) {
        val root = rootInActiveWindow ?: throw IllegalStateException("NO_WINDOW")
        val node = findEditable(root) ?: throw IllegalStateException("NO_INPUT")
        val b = Bundle()
        b.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, s)
        if (!node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, b)) throw IllegalStateException("TYPE_REJECTED")
    }

    private fun findEditable(n: AccessibilityNodeInfo): AccessibilityNodeInfo? {
        if (n.isEditable && n.isEnabled) return n
        for (i in 0 until n.childCount) {
            val child = n.getChild(i) ?: continue
            val found = findEditable(child)
            if (found != null) return found
        }
        return null
    }

    fun buildUiTree(): JSONObject {
        val root = rootInActiveWindow ?: return JSONObject().put("nodes", JSONArray())
        val nodes = JSONArray()
        walk(root, nodes)
        return JSONObject()
            .put("package", root.packageName?.toString())
            .put("window", root.className?.toString())
            .put("nodes", nodes)
    }

    private fun walk(n: AccessibilityNodeInfo, a: JSONArray) {
        val b = Rect()
        n.getBoundsInScreen(b)
        a.put(JSONObject()
            .put("text", n.text?.toString())
            .put("contentDescription", n.contentDescription?.toString())
            .put("className", n.className?.toString())
            .put("clickable", n.isClickable)
            .put("scrollable", n.isScrollable)
            .put("enabled", n.isEnabled)
            .put("selected", n.isSelected)
            .put("editable", n.isEditable)
            .put("bounds", JSONArray().apply {
                put(b.left)
                put(b.top)
                put(b.right)
                put(b.bottom)
            }))
        for (i in 0 until n.childCount) n.getChild(i)?.let { walk(it, a) }
    }

    private fun report(id: String, state: String, result: JSONObject) {
        val token = secureDeviceToken(this) ?: return
        executor.execute {
            try {
                val c = URL("$server/api/phone-control/device/actions").openConnection() as HttpURLConnection
                c.requestMethod = "POST"
                c.doOutput = true
                c.connectTimeout = 5000
                c.readTimeout = 7000
                c.setRequestProperty("Authorization", "Bearer $token")
                c.setRequestProperty("Content-Type", "application/json")
                c.outputStream.use {
                    it.write(JSONObject().put("actionId", id).put("state", state).put("result", result).toString().toByteArray())
                }
                c.inputStream.close()
            } catch (_: Exception) {}
        }
    }

    override fun onDestroy() {
        executor.shutdownNow()
        super.onDestroy()
    }
}