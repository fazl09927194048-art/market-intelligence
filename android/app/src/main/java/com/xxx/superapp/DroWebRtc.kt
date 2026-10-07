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

    fun start() {
        PeerConnectionFactory.initialize(
            PeerConnectionFactory.InitializationOptions.builder(context).setEnableInternalTracer(false).createInitializationOptions()
        )
        egl = EglBase.create()
        peerFactory = PeerConnectionFactory.builder()
            .setVideoEncoderFactory(DefaultVideoEncoderFactory(egl!!.eglBaseContext, true, false))
            .setVideoDecoderFactory(DefaultVideoDecoderFactory(egl!!.eglBaseContext))
            .createPeerConnectionFactory()
        waitForSession()
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
        val config = PeerConnection.RTCConfiguration(
            listOf(PeerConnection.IceServer.builder("stun:stun.l.google.com:19302").createIceServer())
        )
        config.sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN
        peer = peerFactory!!.createPeerConnection(config, object : PeerConnection.Observer {
            override fun onSignalingChange(state: PeerConnection.SignalingState?) {}
            override fun onIceConnectionChange(state: PeerConnection.IceConnectionState?) { onState("ICE_" + state) }
            override fun onIceConnectionReceivingChange(receiving: Boolean) {}
            override fun onIceGatheringChange(state: PeerConnection.IceGatheringState?) {}
            override fun onIceCandidate(candidate: IceCandidate?) {
                if (candidate != null) sendSignal(JSONObject().put("candidate", JSONObject()
                    .put("sdpMid", candidate.sdpMid).put("sdpMLineIndex", candidate.sdpMLineIndex).put("candidate", candidate.sdp)))
            }
            override fun onIceCandidatesRemoved(candidates: Array<out IceCandidate>?) {}
            override fun onAddStream(stream: MediaStream?) {}
            override fun onRemoveStream(stream: MediaStream?) {}
            override fun onDataChannel(dc: DataChannel?) {}
            override fun onRenegotiationNeeded() {}
            override fun onAddTrack(receiver: RtpReceiver?, streams: Array<out MediaStream>?) {}
            override fun onConnectionChange(newState: PeerConnection.PeerConnectionState?) { onState("PEER_" + newState) }
        }) ?: run { onState("PEER_CREATE_FAILED"); return }

        val metrics = DisplayMetrics()
        (context.getSystemService(Context.WINDOW_SERVICE) as WindowManager).defaultDisplay.getRealMetrics(metrics)
        val width = (metrics.widthPixels.coerceAtMost(1280) / 2) * 2
        val height = (metrics.heightPixels.coerceAtMost(720) / 2) * 2
        videoSource = peerFactory!!.createVideoSource(false)
        capturer = ScreenCapturerAndroid(projectionData, projectionCallback)
        val helper = SurfaceTextureHelper.create("DRO-Screen", egl!!.eglBaseContext)
        capturer!!.initialize(helper, context, videoSource!!.capturerObserver)
        capturer!!.startCapture(width, height, 15)
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
        pollSignals()
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
        return JSONObject(source.bufferedReader().readText())
    }

    private fun getJson(path: String): JSONObject {
        val c = URL(serverUrl + path).openConnection() as HttpURLConnection
        c.requestMethod = "GET"; c.connectTimeout = 10000; c.readTimeout = 10000
        c.setRequestProperty("Authorization", "Bearer " + deviceToken)
        val source = if (c.responseCode in 200..299) c.inputStream else c.errorStream
        return JSONObject(source.bufferedReader().readText())
    }

    fun stop() {
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