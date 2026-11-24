package com.herdofhelpers.helperboard.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class SpellOnceTest {
    // Made-up names only.
    private val s = SpellOnce(SpellOnce.parse("Alex = Aleks\nKasha = Kajsa\nnot a pair"))

    @Test fun parsesLines() = assertEquals(listOf("Alex" to "Aleks", "Kasha" to "Kajsa"), SpellOnce.parse("Alex = Aleks\nKasha = Kajsa\nnot a pair"))

    @Test fun sureMatchIsSpelledTheTaughtWay() {
        val r = s.apply("email alex about the bill")
        assertEquals("email Aleks about the bill", r.text)
        assertEquals(listOf("alex" to "Aleks"), r.changed)
        assertEquals("send it to Kajsa", s.apply("send it to Kasha").text)
        assertEquals("ask Aleks", s.apply("ask Alecks").text)            // sounds the same
    }

    @Test fun nearMatchAsksInsteadOfChanging() {
        val r = s.apply("call Kosha later")
        assertEquals("call Kosha later", r.text)                       // left alone
        assertTrue(r.changed.isEmpty())
        assertEquals(listOf("Kosha" to "Kajsa"), r.askAbout)
    }

    @Test fun everydayWordsAreLeftAlone() {
        val r = s.apply("the cat sat on a mat and we laughed")
        assertEquals("the cat sat on a mat and we laughed", r.text)
        assertTrue(r.changed.isEmpty() && r.askAbout.isEmpty(), r.toString())
    }

    @Test fun soundKeysAgree() {
        assertEquals(SpellOnce.soundKey("Alex"), SpellOnce.soundKey("Aleks"))
        assertTrue(SpellOnce.oneApart("ABC", "ABD") && SpellOnce.oneApart("AB", "ABC") && !SpellOnce.oneApart("AB", "ABCD"))
    }
}
