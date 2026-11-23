package app.jotr.android

import android.Manifest
import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.graphics.PixelFormat
import android.graphics.Rect
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.view.GestureDetector
import android.view.Gravity
import android.view.MotionEvent
import android.view.WindowManager
import android.widget.Toast

/**
 * Keeps the notch floating over every app. Follows the speaker's voice with the
 * phone's own speech recogniser (free, the same engine as the keyboard's mic), or
 * scrolls at a steady pace. Tap the notch to pause, drag it anywhere, double-tap to
 * send it back under the camera, long-press to close.
 */
class OverlayService : Service() {
    private lateinit var wm: WindowManager
    private var notch: NotchView? = null
    private lateinit var params: WindowManager.LayoutParams
    private lateinit var matcher: ScriptMatcher
    private lateinit var prefs: Prefs
    private val main = Handler(Looper.getMainLooper())

    private var recognizer: SpeechRecognizer? = null
    private var paused = false
    private var stopped = false
    private var homeX = 0

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        wm = getSystemService(WINDOW_SERVICE) as WindowManager
        prefs = Prefs(this)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                stopSelf()
                return START_NOT_STICKY
            }
            ACTION_TOGGLE -> {
                togglePause()
                return START_NOT_STICKY
            }
        }
        if (notch == null) start()
        return START_NOT_STICKY
    }

    private fun voiceMode() = prefs.mode == Prefs.MODE_VOICE &&
        checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED

    private fun start() {
        val words = ScriptMatcher.tokenize(prefs.script)
        if (words.isEmpty()) {
            stopSelf()
            return
        }
        goForeground()
        running = true
        matcher = ScriptMatcher(words)

        val view = NotchView(this, words, prefs.textSize.toFloat())
        notch = view
        val metrics = resources.displayMetrics
        val width = minOf(metrics.widthPixels - dp(16), dp(440))
        val cut = cameraCutout()
        view.cameraInset = maxOf(cut?.bottom?.toFloat() ?: 0f, dp(24).toFloat()) + dp(4)
        // Centre on the camera (punch-holes aren't always in the middle).
        val cx = cut?.centerX() ?: (metrics.widthPixels / 2)
        homeX = (cx - width / 2).coerceIn(0, maxOf(0, metrics.widthPixels - width))

        params = WindowManager.LayoutParams(
            width,
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
                WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS or
                // Kept out of screenshots and screen recordings: only you see your script.
                WindowManager.LayoutParams.FLAG_SECURE,
            PixelFormat.TRANSLUCENT,
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = homeX
            y = 0
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
            }
        }
        attachGestures(view)
        wm.addView(view, params)

        if (voiceMode()) startListening() else scheduleSteady()
    }

    /** The camera cut-out at the top of the screen, if the phone has one. */
    private fun cameraCutout(): Rect? {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return null
        val cutout = wm.currentWindowMetrics.windowInsets.displayCutout ?: return null
        return cutout.boundingRectTop.takeIf { !it.isEmpty }
    }

    @SuppressLint("ClickableViewAccessibility")
    private fun attachGestures(view: NotchView) {
        var startX = 0
        var startY = 0
        var touchX = 0f
        var touchY = 0f
        val detector = GestureDetector(this, object : GestureDetector.SimpleOnGestureListener() {
            override fun onDown(e: MotionEvent): Boolean {
                startX = params.x
                startY = params.y
                touchX = e.rawX
                touchY = e.rawY
                return true
            }

            override fun onSingleTapConfirmed(e: MotionEvent): Boolean {
                togglePause()
                return true
            }

            override fun onDoubleTap(e: MotionEvent): Boolean {
                params.x = homeX
                params.y = 0
                view.docked = true
                wm.updateViewLayout(view, params)
                return true
            }

            override fun onLongPress(e: MotionEvent) {
                view.performHapticFeedback(android.view.HapticFeedbackConstants.LONG_PRESS)
                stopSelf()
            }

            override fun onScroll(e1: MotionEvent?, e2: MotionEvent, dx: Float, dy: Float): Boolean {
                params.x = startX + (e2.rawX - touchX).toInt()
                params.y = maxOf(0, startY + (e2.rawY - touchY).toInt())
                // Snap back to the top edge when dropped close to it.
                view.docked = params.y < dp(24)
                if (view.docked) params.y = 0
                wm.updateViewLayout(view, params)
                return true
            }
        })
        view.setOnTouchListener { _, ev -> detector.onTouchEvent(ev) }
    }

    private fun togglePause() {
        paused = !paused
        notch?.paused = paused
        if (voiceMode()) {
            if (paused) stopListening() else startListening()
        } else if (!paused) {
            scheduleSteady()
        }
        updateNotification()
    }

    // ------------------------------------------------------------------ steady

    private val steadyTick = object : Runnable {
        override fun run() {
            if (paused || stopped) return
            val next = matcher.position + 1
            if (next > matcher.words.size) return
            matcher.jumpTo(next)
            notch?.setPosition(matcher.position)
            main.postDelayed(this, 60_000L / prefs.wpm.coerceIn(60, 260))
        }
    }

    private fun scheduleSteady() {
        main.removeCallbacks(steadyTick)
        main.postDelayed(steadyTick, 900)
    }

    // ------------------------------------------------------------------- voice

    private fun startListening() {
        if (stopped || paused) return
        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            Toast.makeText(this, "No speech recogniser on this phone: switching to steady scroll", Toast.LENGTH_LONG).show()
            prefs.mode = Prefs.MODE_STEADY
            scheduleSteady()
            return
        }
        if (recognizer == null) {
            recognizer = SpeechRecognizer.createSpeechRecognizer(this).apply { setRecognitionListener(listener) }
        }
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
            putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, packageName)
            // Long pauses shouldn't end the session.
            putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 4000L)
            putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 4000L)
            prefs.language.takeIf { it.isNotEmpty() }?.let { putExtra(RecognizerIntent.EXTRA_LANGUAGE, it) }
        }
        matcher.newUtterance()
        notch?.listening = true
        try {
            recognizer?.startListening(intent)
        } catch (_: Exception) {
            restartSoon(600)
        }
    }

    private fun stopListening() {
        notch?.listening = false
        main.removeCallbacks(restart)
        try {
            recognizer?.cancel()
        } catch (_: Exception) {
        }
    }

    private val restart = Runnable { startListening() }
    private fun restartSoon(delay: Long = 120) {
        main.removeCallbacks(restart)
        if (!stopped && !paused) main.postDelayed(restart, delay)
    }

    private fun onHeard(bundle: Bundle?, final: Boolean) {
        val text = bundle?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull() ?: return
        if (matcher.heard(text, final)) notch?.setPosition(matcher.position)
    }

    private val listener = object : RecognitionListener {
        override fun onReadyForSpeech(params: Bundle?) {}
        override fun onBeginningOfSpeech() {}
        override fun onRmsChanged(rmsdB: Float) {}
        override fun onBufferReceived(buffer: ByteArray?) {}
        override fun onEndOfSpeech() {}
        override fun onEvent(eventType: Int, params: Bundle?) {}
        override fun onPartialResults(partialResults: Bundle?) = onHeard(partialResults, false)
        override fun onResults(results: Bundle?) {
            onHeard(results, true)
            restartSoon() // keep listening, utterance after utterance
        }

        override fun onError(error: Int) {
            when (error) {
                SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> {
                    Toast.makeText(this@OverlayService, "JOTR needs the microphone to follow your voice", Toast.LENGTH_LONG).show()
                    notch?.listening = false
                }
                SpeechRecognizer.ERROR_RECOGNIZER_BUSY, SpeechRecognizer.ERROR_CLIENT -> {
                    recognizer?.destroy()
                    recognizer = null
                    restartSoon(400)
                }
                SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT, SpeechRecognizer.ERROR_SERVER -> restartSoon(1500)
                else -> restartSoon() // silence / no match: just listen again
            }
        }
    }

    // ------------------------------------------------------------ foreground

    private fun goForeground() {
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(CHANNEL, "Floating script", NotificationManager.IMPORTANCE_LOW))
        val n = notification()
        val type = if (voiceMode()) ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
        else if (Build.VERSION.SDK_INT >= 34) ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE else 0
        // Service types exist from Android 11 (microphone) and 14 (special use); older versions take none.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && type != 0) startForeground(NOTE_ID, n, type) else startForeground(NOTE_ID, n)
    }

    private fun pending(action: String, code: Int) = PendingIntent.getService(
        this, code, Intent(this, OverlayService::class.java).setAction(action), PendingIntent.FLAG_IMMUTABLE,
    )

    private fun notification(): Notification {
        val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        return Notification.Builder(this, CHANNEL)
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setContentTitle(if (paused) "JOTR paused" else "JOTR is floating your script")
            .setContentText("Tap the notch to pause · long-press it to close")
            .setContentIntent(open)
            .setOngoing(true)
            .addAction(Notification.Action.Builder(null, if (paused) "Resume" else "Pause", pending(ACTION_TOGGLE, 1)).build())
            .addAction(Notification.Action.Builder(null, "Stop", pending(ACTION_STOP, 2)).build())
            .build()
    }

    private fun updateNotification() {
        getSystemService(NotificationManager::class.java).notify(NOTE_ID, notification())
    }

    override fun onDestroy() {
        stopped = true
        running = false
        main.removeCallbacksAndMessages(null)
        recognizer?.destroy()
        recognizer = null
        notch?.let { runCatching { wm.removeView(it) } }
        notch = null
        super.onDestroy()
    }

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

    companion object {
        const val ACTION_STOP = "app.jotr.android.STOP"
        const val ACTION_TOGGLE = "app.jotr.android.TOGGLE"
        private const val CHANNEL = "float"
        private const val NOTE_ID = 7

        /** Whether the notch is floating right now (for the app's Start/Stop button). */
        @Volatile
        var running = false
            private set

        fun start(context: Context) {
            context.startForegroundService(Intent(context, OverlayService::class.java))
        }

        fun stop(context: Context) {
            context.startService(Intent(context, OverlayService::class.java).setAction(ACTION_STOP))
        }
    }
}
