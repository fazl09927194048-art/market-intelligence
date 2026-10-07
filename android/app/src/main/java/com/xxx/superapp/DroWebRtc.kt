package com.xxx.superapp

import android.content.Context
import android.media.projection.MediaProjection
import android.util.DisplayMetrics
import android.view.WindowManager
import org.json.JSONObject
import org.webrtc.*
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit

class DroWebRtc(
    private val context: Context,
    private val projectionData: android.content.Intent,
    private val projectionCallback: MediaProjection.Callback,
    private val deviceToken: String,
    private val serverUrl: String,
    private val onState: (String) -> Unit
) {
    private val io: ScheduledExecutorService = Executors.newScheduledThreadPool(2)
    private var sessionId: String? = null
    private var capturer: ScreenCapturerAndroid? = null
    private var peerFactory: PeerConnectionFactory? = null
    private var peer: PeerConnection? = null
    private var egl: EglBase? = null
    private var videoSource: VideoSource? = null
    private var turnServers: List<PeerConnection.IceServer> = emptyList()
    private var restartCount = 0
    private var pollingStarted = false
    private var captureWidth = 720
    private var captureHeight = 1280

    fun start() {
        PeerConnectionFactory.initialize(
            PeerConnectionFactory.InitializationOptions.builder(context).setEnableInternalTracer(false).createInitializationOptions()
        )
        egl = EglBase.create()
        peerFactory = PeerConnectionFactory.builder()
            .setVideoEncoderFactory(DefaultVideoEncoderFactory(egl!!.eglBaseContext, true, false))
            .setVideoDecoderFactory(DefaultVideoDecoderFactory(egl!!.eglBaseContext))
            .createPeerConnectionFactory()
        loadIceServers { waitForSession() }
    }

    private fun loadIceServers(onLoaded: () -> Unit) {
        io.execute {
            try {
                val json = getJson("/api/phone-control/webrtc/config")
                val arr = json.optJSONArray("servers") ?: return@execute
                val list = mutableListOf<PeerConnection.IceServer>()
                for (i in 0 until arr.length()) {
                    val s = arr.getJSONObject(i)
                    val urls = mutableListOf<String>()
                    val u = s.opt("urls")
                    if (u is org.json.JSONArray) for (j in 0 until u.length()) urls.add(u.getString(j)) else if (u != null) urls.add(u.toString())
                    if (urls.isNotEmpty()) {
                        val b = PeerConnection.IceServer.builder(urls)
                        if (s.has("username")) b.setUsername(s.optString("username"))
                        if (s.has("credential")) b.setPassword(s.optString("credential"))
                        list.add(b.createIceServer())
                    }
                }
                turnServers = list
            } catch (_: Exception) {} finally { onLoaded() }
        }
    }

    private fun waitForSession() {
        io.scheduleWithFixedDelay({
            if (sessionId != null) return@scheduleWithFixedDelay
            try {
                val json = postJson("/api/phone-control/device/heartbeat",
                    JSONObject().put("state", "STREAMING").put("mediaProjection", true))
                val id = json.optString("session").takeIf { it.isNotBlank() }
                if (id != null) {
                    sessionId = id
                    io.schedule({ createPeer() }, 0, TimeUnit.MILLISECONDS)
                }
            } catch (_: Exception) { onState("SESSION_WAIT") }
        }, 0, 3, TimeUnit.SECONDS)
    }

    private fun createPeer() {
        if (peer != null) return
        val config = PeerConnection.RTCConfiguration(
            if (turnServers.isNotEmpty()) turnServers else listOf(PeerConnection.IceServer.builder("stun:stun.l.google.com:19302").createIceServer())
        )
        config.sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN
        peer = peerFactory!!.createPeerConnection(config, object : PeerConnection.Observer {
            override fun onSignalingChange(state: PeerConnection.SignalingState?) {}
            override fun onIceConnectionChange(state: PeerConnection.IceConnectionState?) {
                onState("ICE_" + state)
                if (state == PeerConnection.IceConnectionState.FAILED || state == PeerConnection.IceConnectionState.DISCONNECTED) restartIce()
            }
            override fun onIceConnectionReceivingChange(receiving: Boolean) {}
            override fun onIceGatheringChange(state: PeerConnection.IceGatheringState?) {}
            override fun onIceCandidate(candidate: IceCandidate?) {
                if (candidate != null) sendSignal(JSONObject().put("candidate", JSONObject()
                    .put("sdpMid", candidate.sdpMid).put("sdpMLineIndex", candidate.sdpMLineIndex).put("candidate", candidate.sdp)))
            }
            override fun onIceCandidatesRemoved(candidates: Array<out IceCandidate>?) {}
            override fun onAddStream(stream: MediaStream?) {}
            override fun onRemoveStream(stream: MediaStream?) {}
            override fun onDataChannel(dc: DataChannel?) {
                dc?.registerObserver(object : DataChannel.Observer {
                    override fun onBufferedAmountChange(previousAmount: Long) {}
                    override fun onStateChange() {}
                    override fun onMessage(buffer: DataChannel.Buffer?) {
                        if (buffer == null) return
                        try {
                            val bytes = ByteArray(buffer.data.remaining())
                            buffer.data.get(bytes)
                            val message = JSONObject(String(bytes, Charsets.UTF_8))
                            if (message.optString("type") == "quality") {
                                val requestedW = message.optInt("width", captureWidth).coerceIn(360, 1280)
                                val requestedH = message.optInt("height", captureHeight).coerceIn(360, 1280)
                                val fps = message.optInt("fps", 15).coerceIn(5, 30)
                                val portrait = captureHeight > captureWidth
                                val longSide = minOf(maxOf(requestedW, requestedH), 1280)
                                val shortSide = minOf(minOf(requestedW, requestedH), 720)
                                val w = if (portrait) shortSide else longSide
                                val h = if (portrait) longSide else shortSide
                                captureWidth = w - (w % 2)
                                captureHeight = h - (h % 2)
                                capturer?.changeCaptureFormat(captureWidth, captureHeight, fps)
                            }
                        } catch (_: Exception) {}
                    }
                })
            }
            override fun onRenegotiationNeeded() {}
            override fun onAddTrack(receiver: RtpReceiver?, streams: Array<out MediaStream>?) {}
            override fun onConnectionChange(newState: PeerConnection.PeerConnectionState?) { onState("PEER_" + newState) }
        }) ?: run { onState("PEER_CREATE_FAILED"); return }

        val metrics = DisplayMetrics()
        (context.getSystemService(Context.WINDOW_SERVICE) as WindowManager).defaultDisplay.getRealMetrics(metrics)
        val portrait = metrics.heightPixels > metrics.widthPixels
        val shortSide = minOf(if (portrait) metrics.widthPixels else metrics.heightPixels, 720)
        val longSide = minOf(if (portrait) metrics.heightPixels else metrics.widthPixels, 1280)
        captureWidth = (if (portrait) shortSide else longSide).coerceAtLeast(360)
        captureHeight = (if (portrait) longSide else shortSide).coerceAtLeast(360)
        captureWidth -= captureWidth % 2
        captureHeight -= captureHeight % 2
        videoSource = peerFactory!!.createVideoSource(false)
        capturer = ScreenCapturerAndroid(projectionData, projectionCallback)
        val helper = SurfaceTextureHelper.create("DRO-Screen", egl!!.eglBaseContext)
        capturer!!.initialize(helper, context, videoSource!!.capturerObserver)
        capturer!!.startCapture(captureWidth, captureHeight, 15)
        val track = peerFactory!!.createVideoTrack("dro-screen", videoSource)
        peer!!.addTrack(track, listOf("dro-screen-stream"))

        peer!!.createOffer(object : SdpObserver {
            override fun onCreateSuccess(desc: SessionDescription?) {
                if (desc == null) return
                peer!!.setLocalDescription(object : SdpObserver {
                    override fun onSetSuccess() { sendSignal(JSONObject().put("sdp", JSONObject().put("type", "offer").put("sdp", desc.description))) }
                    override fun onSetFailure(error: String?) { onState("LOCAL_SDP_FAILED") }
                    override fun onCreateSuccess(p0: SessionDescription?) {}
                    override fun onCreateFailure(p0: String?) {}
                }, desc)
            }
            override fun onSetSuccess() {}
            override fun onCreateFailure(error: String?) { onState("OFFER_FAILED") }
            override fun onSetFailure(error: String?) {}
        }, MediaConstraints())
        if (!pollingStarted) { pollingStarted = true; pollSignals() }
    }

    private fun reconnectPeer() {
        try { capturer?.stopCapture() } catch (_: Exception) {}
        capturer?.dispose(); capturer = null
        videoSource?.dispose(); videoSource = null
        peer?.close(); peer = null
        restartCount = 0
        onState("RECONNECTING")
        io.schedule({ createPeer() }, 2, TimeUnit.SECONDS)
    }

    private fun restartIce() {
        if (restartCount >= 5 || peer == null) { if (restartCount >= 5) reconnectPeer(); return }
        restartCount++
        io.schedule({
            try {
                peer?.restartIce()
                peer?.createOffer(object : SdpObserver {
                    override fun onCreateSuccess(desc: SessionDescription?) {
                        if (desc == null) return
                        peer?.setLocalDescription(object : SdpObserver {
                            override fun onSetSuccess() { sendSignal(JSONObject().put("sdp", JSONObject().put("type", "offer").put("sdp", desc.description).put("iceRestart", true))) }
                            override fun onSetFailure(error: String?) { onState("ICE_RESTART_SDP_FAILED") }
                            override fun onCreateSuccess(p0: SessionDescription?) {}
                            override fun onCreateFailure(p0: String?) {}
                        }, desc)
                    }
                    override fun onSetSuccess() {}
                    override fun onCreateFailure(error: String?) { onState("ICE_RESTART_FAILED") }
                    override fun onSetFailure(error: String?) {}
                }, MediaConstraints())
            } catch (_: Exception) {}
        }, 2, TimeUnit.SECONDS)
    }

    private fun pollSignals() {
        io.scheduleWithFixedDelay({
            val id = sessionId ?: return@scheduleWithFixedDelay
            try {
                val json = getJson("/api/phone-control/webrtc?sessionId=" + id)
                val signals = json.optJSONArray("signals") ?: return@scheduleWithFixedDelay
                for (i in 0 until signals.length()) {
                    val payload = signals.getJSONObject(i).optJSONObject("payload") ?: continue
                    val sdp = payload.optJSONObject("sdp")
                    if (sdp != null && sdp.optString("type") == "answer") {
                        peer?.setRemoteDescription(SimpleSdpObserver { onState("ANSWER_SET") },
                            SessionDescription(SessionDescription.Type.ANSWER, sdp.optString("sdp")))
                    } else if (sdp != null && sdp.optString("type") == "offer") {
                        peer?.setRemoteDescription(SimpleSdpObserver {
                            peer?.createAnswer(object : SdpObserver {
                                override fun onCreateSuccess(answer: SessionDescription?) {
                                    if (answer == null) return
                                    peer?.setLocalDescription(object : SdpObserver {
                                        override fun onSetSuccess() {
                                            sendSignal(JSONObject().put("sdp", JSONObject().put("type", "answer").put("sdp", answer.description)))
                                        }
                                        override fun onSetFailure(error: String?) { onState("RESTART_ANSWER_FAILED") }
                                        override fun onCreateSuccess(p0: SessionDescription?) {}
                                        override fun onCreateFailure(p0: String?) {}
                                    }, answer)
                                }
                                override fun onSetSuccess() {}
                                override fun onCreateFailure(error: String?) { onState("RESTART_ANSWER_FAILED") }
                                override fun onSetFailure(error: String?) {}
                            }, MediaConstraints())
                        }, SessionDescription(SessionDescription.Type.OFFER, sdp.optString("sdp")))
                    }
                    val c = payload.optJSONObject("candidate")
                    if (c != null) peer?.addIceCandidate(IceCandidate(
                        c.optString("sdpMid"), c.optInt("sdpMLineIndex"), c.optString("candidate")))
                }
            } catch (_: Exception) {}
        }, 1, 1, TimeUnit.SECONDS)
    }

    private fun sendSignal(payload: JSONObject) {
        val id = sessionId ?: return
        io.execute {
            try { postJson("/api/phone-control/webrtc", JSONObject().put("sessionId", id).put("payload", payload)) } catch (_: Exception) {}
        }
    }

    private fun postJson(path: String, body: JSONObject): JSONObject {
        val c = URL(serverUrl + path).openConnection() as HttpURLConnection
        c.requestMethod = "POST"; c.doOutput = true; c.connectTimeout = 10000; c.readTimeout = 10000
        c.setRequestProperty("Content-Type", "application/json"); c.setRequestProperty("Authorization", "Bearer " + deviceToken)
        c.outputStream.use { it.write(body.toString().toByteArray()) }
        val source = if (c.responseCode in 200..299) c.inputStream else c.errorStream
            ?: throw IllegalStateException("HTTP ${c.responseCode}")
        return JSONObject(source.bufferedReader().use { it.readText() })
    }

    private fun getJson(path: String): JSONObject {
        val c = URL(serverUrl + path).openConnection() as HttpURLConnection
        c.requestMethod = "GET"; c.connectTimeout = 10000; c.readTimeout = 10000
        c.setRequestProperty("Authorization", "Bearer " + deviceToken)
        val source = if (c.responseCode in 200..299) c.inputStream else c.errorStream
        return JSONObject(source.bufferedReader().readText())
    }

    fun stop() {
        try {
            if (sessionId != null) {
                Thread {
                    try {
                        postJson("/api/phone-control/device/heartbeat",
                            JSONObject().put("state", "STOPPED").put("mediaProjection", false))
                    } catch (_: Exception) {}
                }.start()
            }
        } catch (_: Exception) {}
        try { capturer?.stopCapture() } catch (_: Exception) {}
        capturer?.dispose(); capturer = null
        videoSource?.dispose(); videoSource = null
        peer?.close(); peer = null
        peerFactory?.dispose(); peerFactory = null
        egl?.release(); egl = null
        io.shutdownNow()
    }

    private class SimpleSdpObserver(private val success: () -> Unit): SdpObserver {
        override fun onSetSuccess() = success()
        override fun onCreateSuccess(p0: SessionDescription?) {}
        override fun onSetFailure(p0: String?) {}
        override fun onCreateFailure(p0: String?) {}
    }
}