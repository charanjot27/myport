package app.jotr.android

import android.content.Context

/** The script and settings, kept on the phone. */
class Prefs(context: Context) {
    private val p = context.getSharedPreferences("jotr", Context.MODE_PRIVATE)

    var script: String
        get() = p.getString("script", null) ?: SAMPLE
        set(v) = p.edit().putString("script", v).apply()

    var mode: String
        get() = p.getString("mode", MODE_VOICE) ?: MODE_VOICE
        set(v) = p.edit().putString("mode", v).apply()

    /** Recogniser language tag ("" = the phone's language). */
    var language: String
        get() = p.getString("language", "") ?: ""
        set(v) = p.edit().putString("language", v).apply()

    var wpm: Int
        get() = p.getInt("wpm", 140)
        set(v) = p.edit().putInt("wpm", v).apply()

    var textSize: Int
        get() = p.getInt("textSize", 17)
        set(v) = p.edit().putInt("textSize", v).apply()

    companion object {
        const val MODE_VOICE = "voice"
        const val MODE_STEADY = "steady"

        const val SAMPLE =
            "Hi, I'm Charanjot. This text sits right under my camera, so you see me looking at you, not at my notes. " +
                "When I pause, JOTR waits. When I skip ahead, it follows. It even works over WhatsApp, Instagram and the camera app."

        /** Languages offered for voice following (tag to label). */
        val LANGUAGES = listOf(
            "" to "Phone's language",
            "en-IN" to "English (India)",
            "en-US" to "English (US)",
            "en-GB" to "English (UK)",
            "hi-IN" to "हिन्दी · Hindi / Hinglish",
            "pa-IN" to "ਪੰਜਾਬੀ · Punjabi",
        )
    }
}
