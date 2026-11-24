package com.herdofhelpers.helperboard.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class LaughMarksTest {
    private fun scores(vararg pairs: Pair<Int, Float>) = FloatArray(521).also { for ((i, v) in pairs) it[i] = v }

    @Test fun readsTheModelScores() {
        assertNull(LaughMarks.kind(scores(0 to 0.9f)))                                   // speech only
        assertEquals(LaughMarks.Kind.LAUGH, LaughMarks.kind(scores(LaughMarks.LAUGHTER to 0.6f, LaughMarks.GIGGLE to 0.3f)))
        assertEquals(LaughMarks.Kind.GIGGLE, LaughMarks.kind(scores(LaughMarks.CHUCKLE to 0.4f)))
        assertNull(LaughMarks.kind(scores(LaughMarks.LAUGHTER to 0.1f)))                 // too faint
    }

    @Test fun placesOneMarker() {
        val l = LaughMarks.Kind.LAUGH; val g = LaughMarks.Kind.GIGGLE
        assertEquals("that was great", LaughMarks.place("that was great", listOf(null, null)))
        assertEquals("that was great (ha-ha)", LaughMarks.place("that was great", listOf(null, null, g, l)))
        assertEquals("(giggle) okay stop", LaughMarks.place("okay stop", listOf(g, null, null, null)))
        assertEquals("(ha-ha)", LaughMarks.place("", listOf(l, l)))                     // laughing, no words
        assertEquals("ok 😂", LaughMarks.place("ok", listOf(null, l), "😂", "🤭"))
    }
}
