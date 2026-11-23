package app.jotr.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ScriptMatcherTest {
    private fun matcher(script: String) = ScriptMatcher(ScriptMatcher.tokenize(script))

    @Test
    fun followsEnglishWordByWord() {
        val m = matcher("Today I will show you how JOTR follows my voice")
        m.heard("today I", false) // last word of a partial result may still change
        assertEquals(1, m.position)
        m.heard("today I will show", false)
        assertEquals(3, m.position)
        m.heard("today I will show you", true)
        assertEquals(5, m.position)
    }

    @Test
    fun hinglishScriptFollowsDevanagariSpeech() {
        val m = matcher("Namaste doston, aap sab kaise ho? Aaj hum meeting ke baare mein baat karenge.")
        m.heard("नमस्ते दोस्तों आप सब कैसे हो", true)
        assertEquals(6, m.position)
        m.newUtterance()
        m.heard("आज हम मीटिंग के बारे में बात करेंगे", true)
        assertEquals(14, m.position) // all 14 words; "हम"/"hum" differ by a vowel and are skipped harmlessly
    }

    @Test
    fun punjabiInGurmukhiMatchesRomanised() {
        val m = matcher("Sat sri akaal ji, tusi kiwe ho")
        m.heard("ਸਤ ਸ੍ਰੀ ਅਕਾਲ ਜੀ ਤੁਸੀਂ ਕਿਵੇਂ ਹੋ", true)
        assertTrue("got ${m.position}", m.position >= 6)
    }

    @Test
    fun skipsMisheardWordsAndIgnoresStrayOnes() {
        val m = matcher("The quarterly numbers grew by twelve percent this year")
        m.heard("the quarterly banana grew by", true)
        assertEquals(5, m.position)
        m.heard("elephant", true)
        assertEquals(5, m.position) // nothing like it ahead: stay put
        m.heard("twelve percent", true)
        assertEquals(7, m.position)
    }

    @Test
    fun soundKeysAgreeAcrossScripts() {
        assertEquals(ScriptMatcher.soundKey("meeting"), ScriptMatcher.soundKey("मीटिंग"))
        assertEquals(ScriptMatcher.soundKey("kaise"), ScriptMatcher.soundKey("कैसे"))
        assertEquals(ScriptMatcher.soundKey("kese"), ScriptMatcher.soundKey("kaise"))
    }
}
