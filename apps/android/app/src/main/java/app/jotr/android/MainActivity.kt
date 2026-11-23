package app.jotr.android

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.text.Editable
import android.text.TextWatcher
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.widget.AdapterView
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.SeekBar
import android.widget.Spinner
import android.widget.TextView

/**
 * JOTR for Android: write or paste a script (or share one from any app), then
 * float it in a notch under the camera, over WhatsApp, Instagram, the camera app,
 * anything. Built with plain Android views: no libraries, a tiny APK.
 */
class MainActivity : Activity() {
    private lateinit var prefs: Prefs
    private lateinit var script: EditText
    private lateinit var startBtn: Button
    private lateinit var overlayRow: TextView
    private lateinit var micRow: TextView
    private lateinit var speedRow: LinearLayout

    private val ink = Color.parseColor("#0B0710")
    private val card = Color.parseColor("#17111C")
    private val muted = Color.parseColor("#B8A9AE")
    private val ember = Color.parseColor("#FF8A3D")

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = Prefs(this)
        window.statusBarColor = ink
        window.navigationBarColor = ink
        takeShared(intent)
        setContentView(build())
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        takeShared(intent)
        if (::script.isInitialized) script.setText(prefs.script)
    }

    override fun onResume() {
        super.onResume()
        refresh()
    }

    /** A script shared from another app ("Share → JOTR") replaces the current one. */
    private fun takeShared(intent: Intent?) {
        if (intent?.action == Intent.ACTION_SEND) {
            intent.getStringExtra(Intent.EXTRA_TEXT)?.takeIf { it.isNotBlank() }?.let { prefs.script = it.trim() }
        }
    }

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

    private fun rounded(color: Int, radius: Int = 18, stroke: Int? = null) = GradientDrawable().apply {
        setColor(color)
        cornerRadius = dp(radius).toFloat()
        if (stroke != null) setStroke(dp(1), stroke)
    }

    private fun label(text: String, size: Float = 14f, color: Int = Color.WHITE, bold: Boolean = false) = TextView(this).apply {
        this.text = text
        setTextColor(color)
        setTextSize(TypedValue.COMPLEX_UNIT_SP, size)
        if (bold) typeface = Typeface.DEFAULT_BOLD
    }

    private fun build(): View {
        val col = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(28), dp(20), dp(32))
        }
        col.addView(label("JOTR", 30f, Color.WHITE, true))
        col.addView(label("Your script in a notch under the camera, over any app. Follows your voice.", 15f, muted).apply {
            setPadding(0, dp(4), 0, dp(18))
        })

        // Permissions
        overlayRow = permissionRow("Display over other apps") {
            startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$packageName")))
        }
        micRow = permissionRow("Microphone, to follow your voice") {
            val perms = mutableListOf(Manifest.permission.RECORD_AUDIO)
            if (Build.VERSION.SDK_INT >= 33) perms += Manifest.permission.POST_NOTIFICATIONS
            requestPermissions(perms.toTypedArray(), 1)
        }
        col.addView(overlayRow)
        col.addView(micRow)

        // Script
        col.addView(label("Script", 13f, muted, true).apply { setPadding(0, dp(18), 0, dp(8)) })
        script = EditText(this).apply {
            setText(prefs.script)
            setTextColor(Color.WHITE)
            setHintTextColor(muted)
            hint = "Paste or type your script, or share one to JOTR from any app"
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
            gravity = Gravity.TOP
            minLines = 7
            background = rounded(card, 16, Color.parseColor("#2A2030"))
            setPadding(dp(14), dp(12), dp(14), dp(12))
            addTextChangedListener(object : TextWatcher {
                override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
                override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
                override fun afterTextChanged(s: Editable?) {
                    prefs.script = s?.toString() ?: ""
                }
            })
        }
        col.addView(script, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT))

        // Mode
        col.addView(label("Scrolling", 13f, muted, true).apply { setPadding(0, dp(18), 0, dp(8)) })
        val modes = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        val voiceBtn = chip("Follow my voice")
        val steadyBtn = chip("Steady scroll")
        modes.addView(voiceBtn, LinearLayout.LayoutParams(0, dp(46), 1f).apply { marginEnd = dp(8) })
        modes.addView(steadyBtn, LinearLayout.LayoutParams(0, dp(46), 1f))
        col.addView(modes)

        // Language (voice) and speed (steady)
        val lang = Spinner(this).apply {
            adapter = ArrayAdapter(this@MainActivity, android.R.layout.simple_spinner_dropdown_item, Prefs.LANGUAGES.map { it.second })
            setSelection(Prefs.LANGUAGES.indexOfFirst { it.first == prefs.language }.coerceAtLeast(0))
            background = rounded(card, 14)
            onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
                override fun onItemSelected(p: AdapterView<*>?, v: View?, pos: Int, id: Long) {
                    prefs.language = Prefs.LANGUAGES[pos].first
                    (v as? TextView)?.setTextColor(Color.WHITE)
                }

                override fun onNothingSelected(p: AdapterView<*>?) {}
            }
        }
        val langRow = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(0, dp(12), 0, 0)
            addView(label("Language you'll speak", 13f, muted))
            addView(lang, LinearLayout.LayoutParams(MATCH_PARENT, dp(48)).apply { topMargin = dp(6) })
        }
        col.addView(langRow)
        speedRow = slider("Speed", prefs.wpm, 80, 220, " words/min") { prefs.wpm = it }
        col.addView(speedRow)
        col.addView(slider("Text size", prefs.textSize, 13, 26, "") { prefs.textSize = it })

        fun showMode() {
            val voice = prefs.mode == Prefs.MODE_VOICE
            voiceBtn.background = rounded(if (voice) ember else card, 14)
            voiceBtn.setTextColor(if (voice) ink else Color.WHITE)
            steadyBtn.background = rounded(if (!voice) ember else card, 14)
            steadyBtn.setTextColor(if (!voice) ink else Color.WHITE)
            langRow.visibility = if (voice) View.VISIBLE else View.GONE
            speedRow.visibility = if (voice) View.GONE else View.VISIBLE
            refresh()
        }
        voiceBtn.setOnClickListener { prefs.mode = Prefs.MODE_VOICE; showMode() }
        steadyBtn.setOnClickListener { prefs.mode = Prefs.MODE_STEADY; showMode() }
        showMode()

        // Start / stop
        startBtn = Button(this).apply {
            isAllCaps = false
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 17f)
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(ink)
            background = rounded(Color.WHITE, 28)
            setOnClickListener { startOrStop() }
        }
        col.addView(startBtn, LinearLayout.LayoutParams(MATCH_PARENT, dp(56)).apply { topMargin = dp(22) })
        col.addView(label(
            "Then open any app. Tap the notch to pause, drag it anywhere, double-tap to put it back under the camera, long-press to close. " +
                "Your script never shows in screenshots or screen recordings.",
            13f, muted,
        ).apply { setPadding(0, dp(14), 0, 0) })

        return ScrollView(this).apply {
            setBackgroundColor(ink)
            isFillViewport = true
            addView(col)
        }
    }

    private fun chip(text: String) = Button(this).apply {
        this.text = text
        isAllCaps = false
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
        stateListAnimator = null
    }

    private fun permissionRow(text: String, onClick: () -> Unit) = TextView(this).apply {
        this.text = text
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
        setPadding(dp(14), dp(12), dp(14), dp(12))
        background = rounded(card, 14)
        layoutParams = LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT).apply { bottomMargin = dp(8) }
        setOnClickListener { onClick() }
    }

    private fun slider(name: String, value: Int, min: Int, max: Int, unit: String, onChange: (Int) -> Unit): LinearLayout {
        val title = label("$name: $value$unit", 13f, muted)
        val bar = SeekBar(this).apply {
            this.max = max - min
            progress = value - min
            setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
                override fun onProgressChanged(s: SeekBar?, p: Int, fromUser: Boolean) {
                    title.text = "$name: ${p + min}$unit"
                    onChange(p + min)
                }

                override fun onStartTrackingTouch(s: SeekBar?) {}
                override fun onStopTrackingTouch(s: SeekBar?) {}
            })
        }
        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(0, dp(14), 0, 0)
            addView(title)
            addView(bar)
        }
    }

    private fun canFloat() = Settings.canDrawOverlays(this)
    private fun hasMic() = checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED

    private fun refresh() {
        if (!::startBtn.isInitialized) return
        val ok = canFloat()
        overlayRow.text = if (ok) "✓  Can display over other apps" else "→  Allow “Display over other apps”"
        overlayRow.setTextColor(if (ok) Color.parseColor("#B9F5DD") else ember)
        val voice = prefs.mode == Prefs.MODE_VOICE
        micRow.visibility = if (voice) View.VISIBLE else View.GONE
        micRow.text = if (hasMic()) "✓  Microphone allowed" else "→  Allow the microphone to follow your voice"
        micRow.setTextColor(if (hasMic()) Color.parseColor("#B9F5DD") else ember)
        startBtn.text = if (OverlayService.running) "Stop floating" else "Start floating"
    }

    private fun startOrStop() {
        if (OverlayService.running) {
            OverlayService.stop(this)
            startBtn.postDelayed({ refresh() }, 300)
            return
        }
        if (!canFloat()) {
            startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$packageName")))
            return
        }
        if (prefs.mode == Prefs.MODE_VOICE && !hasMic()) {
            requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), 2)
            return
        }
        if (prefs.script.isBlank()) {
            script.error = "Add your script first"
            return
        }
        OverlayService.start(this)
        // Step aside so the next app comes up under the notch.
        startBtn.postDelayed({
            refresh()
            moveTaskToBack(true)
        }, 350)
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        refresh()
        if (requestCode == 2 && hasMic()) startOrStop()
    }
}
