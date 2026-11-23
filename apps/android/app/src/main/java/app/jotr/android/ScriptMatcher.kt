package app.jotr.android

import java.text.Normalizer

/**
 * Follows the speaker through the script, word by word, from speech-recogniser
 * text. Words are compared by a coarse cross-script sound key (a port of the web
 * app's `crossKey`), so a Hinglish script typed in English letters follows Hindi
 * speech written in Devanagari, Punjabi in Gurmukhi, and English loanwords
 * ("मीटिंग" / "meeting") match either way.
 */
class ScriptMatcher(val words: List<String>) {
    private val keys = words.map { soundKey(it) }

    /** Index of the next word to say. Everything before it has been said. */
    var position = 0
        private set

    private var consumed = 0

    /** A new utterance starts: its words are counted from zero again. */
    fun newUtterance() {
        consumed = 0
    }

    fun jumpTo(index: Int) {
        position = index.coerceIn(0, words.size)
    }

    /**
     * The recogniser's text for the current utterance so far. Partial results
     * repeat the whole utterance each time and may still change their last word,
     * so only words not seen before are used, and the last one only when [final].
     * Returns true if the position moved.
     */
    fun heard(utterance: String, final: Boolean): Boolean {
        val heard = tokenize(utterance)
        val usable = if (final) heard.size else (heard.size - 1).coerceAtLeast(0)
        val before = position
        while (consumed < usable) {
            match(soundKey(heard[consumed]))
            consumed++
        }
        if (final) consumed = 0
        return position != before
    }

    private fun match(key: String) {
        if (key.isEmpty()) return
        // Look a little ahead (skipped or misheard words), and a few words back (repeats).
        val end = minOf(keys.size, position + LOOK_AHEAD)
        for (j in position until end) {
            if (same(keys[j], key)) {
                position = j + 1
                return
            }
        }
        val back = maxOf(0, position - LOOK_BACK)
        for (j in position - 1 downTo back) {
            if (keys[j].length >= 4 && keys[j] == key) {
                position = j + 1
                return
            }
        }
    }

    companion object {
        const val LOOK_AHEAD = 12
        const val LOOK_BACK = 4

        fun tokenize(text: String): List<String> =
            text.split(Regex("\\s+")).map { it.trim() }.filter { it.isNotEmpty() }

        /** Exact key, or near-equal keys for longer words (one letter off, or a prefix). */
        fun same(a: String, b: String): Boolean {
            if (a == b) return true
            if (a.length < 3 || b.length < 3) return false
            if (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a))) return true
            return a.length >= 4 && editDistanceAtMostOne(a, b)
        }

        private fun editDistanceAtMostOne(a: String, b: String): Boolean {
            if (kotlin.math.abs(a.length - b.length) > 1) return false
            var i = 0
            var j = 0
            var edits = 0
            while (i < a.length && j < b.length) {
                if (a[i] == b[j]) {
                    i++; j++
                } else {
                    if (++edits > 1) return false
                    when {
                        a.length > b.length -> i++
                        a.length < b.length -> j++
                        else -> { i++; j++ }
                    }
                }
            }
            return edits + (a.length - i) + (b.length - j) <= 1
        }

        // ---------------------------------------------------------- transliteration

        private val CONSONANTS = mapOf(
            // Devanagari
            "क" to "k", "ख" to "kh", "ग" to "g", "घ" to "gh", "ङ" to "ng",
            "च" to "ch", "छ" to "chh", "ज" to "j", "झ" to "jh", "ञ" to "ny",
            "ट" to "t", "ठ" to "th", "ड" to "d", "ढ" to "dh", "ण" to "n",
            "त" to "t", "थ" to "th", "द" to "d", "ध" to "dh", "न" to "n", "ऩ" to "n",
            "प" to "p", "फ" to "ph", "ब" to "b", "भ" to "bh", "म" to "m",
            "य" to "y", "र" to "r", "ऱ" to "r", "ल" to "l", "ळ" to "l", "ऴ" to "l", "व" to "v",
            "श" to "sh", "ष" to "sh", "स" to "s", "ह" to "h",
            // Gurmukhi
            "ਕ" to "k", "ਖ" to "kh", "ਗ" to "g", "ਘ" to "gh", "ਙ" to "ng",
            "ਚ" to "ch", "ਛ" to "chh", "ਜ" to "j", "ਝ" to "jh", "ਞ" to "ny",
            "ਟ" to "t", "ਠ" to "th", "ਡ" to "d", "ਢ" to "dh", "ਣ" to "n",
            "ਤ" to "t", "ਥ" to "th", "ਦ" to "d", "ਧ" to "dh", "ਨ" to "n",
            "ਪ" to "p", "ਫ" to "ph", "ਬ" to "b", "ਭ" to "bh", "ਮ" to "m",
            "ਯ" to "y", "ਰ" to "r", "ਲ" to "l", "ਵ" to "v", "ੜ" to "r", "ਸ" to "s", "ਹ" to "h",
        )
        private val VOWELS = mapOf(
            "अ" to "a", "आ" to "aa", "इ" to "i", "ई" to "ii", "उ" to "u", "ऊ" to "uu", "ऋ" to "ri",
            "ए" to "e", "ऐ" to "ai", "ओ" to "o", "औ" to "au", "ऍ" to "e", "ऑ" to "o",
            "ਅ" to "a", "ਆ" to "aa", "ਇ" to "i", "ਈ" to "ii", "ਉ" to "u", "ਊ" to "uu", "ਏ" to "e", "ਐ" to "ai",
            "ਓ" to "o", "ਔ" to "au", "ੳ" to "", "ੲ" to "",
        )
        private val MATRAS = mapOf(
            "ा" to "aa", "ि" to "i", "ी" to "ii", "ु" to "u", "ू" to "uu", "ृ" to "ri",
            "े" to "e", "ै" to "ai", "ो" to "o", "ौ" to "au", "ॅ" to "e", "ॉ" to "o",
            "ਾ" to "aa", "ਿ" to "i", "ੀ" to "ii", "ੁ" to "u", "ੂ" to "uu", "ੇ" to "e", "ੈ" to "ai", "ੋ" to "o", "ੌ" to "au",
        )
        private val NUKTA = mapOf("k" to "q", "kh" to "kh", "g" to "g", "j" to "z", "ph" to "f", "d" to "r", "dh" to "rh", "s" to "sh", "l" to "l", "y" to "y")
        private val VIRAMA = setOf("्", "੍")
        private val NASAL = setOf("ं", "ँ", "ੰ", "ਂ")
        private val NUKTA_SIGN = setOf("़", "਼")
        private val VISARGA = setOf("ः", "ਃ")
        private const val ADDAK = "ੱ"
        private val INDIC = Regex("[\\u0900-\\u097F\\u0A00-\\u0A7F]")

        /** Romanise Devanagari/Gurmukhi (simplified ITRANS); other text passes through. */
        fun transliterate(input: String): String {
            if (!INDIC.containsMatchIn(input)) return input
            // NFD splits precomposed nukta letters (क़ → क + ़), which the nukta rule handles.
            val s = Normalizer.normalize(input, Normalizer.Form.NFD)
            val out = StringBuilder()
            var pendingA = false
            var lastConsonant = ""
            var geminate = false
            fun flush() {
                if (pendingA) out.append('a')
                pendingA = false
            }
            var i = 0
            while (i < s.length) {
                val ch = s.substring(i, i + 1)
                i++
                val c = CONSONANTS[ch]
                when {
                    c != null -> {
                        flush()
                        out.append(if (geminate) c[0] + c else c)
                        geminate = false
                        lastConsonant = c
                        pendingA = true
                    }
                    MATRAS[ch] != null -> {
                        pendingA = false
                        out.append(MATRAS[ch])
                    }
                    VOWELS[ch] != null -> {
                        flush()
                        out.append(VOWELS[ch])
                    }
                    ch in VIRAMA -> pendingA = false
                    ch in NUKTA_SIGN -> {
                        val repl = NUKTA[lastConsonant]
                        if (repl != null && out.endsWith(lastConsonant)) {
                            out.setLength(out.length - lastConsonant.length)
                            out.append(repl)
                        }
                    }
                    ch in NASAL -> {
                        flush()
                        out.append('n')
                    }
                    ch in VISARGA -> {
                        flush()
                        out.append('h')
                    }
                    ch == ADDAK -> {
                        flush()
                        geminate = true
                    }
                    else -> {
                        // Word end or other character: Hindi and Punjabi drop the final inherent vowel.
                        pendingA = false
                        if (!INDIC.matches(ch)) out.append(ch)
                    }
                }
            }
            return out.toString()
        }

        /** Coarse cross-script sound key (port of the web app's crossKey). */
        fun soundKey(word: String): String {
            var w = transliterate(word).lowercase().replace(Regex("[^a-z0-9]"), "")
            if (w.isEmpty()) return word.lowercase().filter { it.isLetterOrDigit() }
            if (w.all { it.isDigit() }) return w
            w = w.replace("chh", "C").replace("ch", "C").replace("sh", "S").replace("ph", "f").replace("ck", "k")
                .replace(Regex("c(?=[eiy])"), "s").replace("c", "k").replace("q", "k").replace("x", "ks")
                .replace("z", "j").replace("w", "v")
                .replace(Regex("([kgtdbpjCrS])h"), "$1")
                .replace("C", "c").replace("S", "s")
                .replace("aa", "a").replace(Regex("(ee|ii|ey)"), "i").replace(Regex("(oo|uu)"), "u")
                .replace(Regex("(ai|ay|ei)"), "e").replace(Regex("(au|aw|ou)"), "o")
                .replace(Regex("y$"), "i")
            val first = if (w[0] in "aeiou") "a" else w.substring(0, 1)
            val skeleton = collapse(first + w.substring(1).replace(Regex("[aeiouhy]"), ""))
            return if (skeleton.length <= 2) collapse(w) else skeleton
        }

        private fun collapse(s: String): String = s.replace(Regex("(.)\\1+"), "$1")
    }
}
