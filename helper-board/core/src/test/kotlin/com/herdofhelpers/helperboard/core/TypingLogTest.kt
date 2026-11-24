package com.herdofhelpers.helperboard.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class TypingLogTest {
    private val keys = mapOf(
        'h' to TypingLog.KeyBox(100f, 100f, 40f, 50f), 'i' to TypingLog.KeyBox(300f, 50f, 40f, 50f),
        'u' to TypingLog.KeyBox(260f, 50f, 40f, 50f), ' ' to TypingLog.KeyBox(200f, 200f, 200f, 50f),
    )

    @Test fun countsDroppedKeysAndTimes() {
        val log = TypingLog()
        log.down("h", 0, 100f, 100f); log.typed("h", 30)
        log.down("i", 50, 300f, 50f)            // never typed: dropped
        log.down("h", 100, 110f, 110f); log.typed("H", 300)  // shift doesn't matter
        val r = log.report("", keys)
        assertEquals(3, r.touches); assertEquals(2, r.typed); assertEquals(1, r.dropped)
        assertEquals(listOf("i"), r.droppedKeys)
        assertEquals(30, r.medianMs); assertEquals(200, r.maxMs)
        assertTrue(r.lines().first().contains("Dropped: 1 (i)"))
        assertTrue(r.machineLine().contains("dropped=1"))
    }

    @Test fun findsSlipsAndWhereThumbsLand() {
        val log = TypingLog()
        // Meant "hi": h dead centre, then u instead of i, a quarter key to the left of i's middle and half a key low.
        log.down("h", 0, 100f, 100f); log.typed("h", 10)
        log.down("u", 20, 290f, 75f); log.typed("u", 30)
        val r = log.report("hi", keys)
        assertEquals(1, r.right); assertEquals(2, r.targetLetters)
        assertEquals(mapOf("i→u" to 1), r.slips)
        assertEquals(-0.125f, r.offsetX, 0.001f)  // (-0.25 + 0) / 2
        assertEquals(0.25f, r.offsetY, 0.001f)    // (0.5 + 0) / 2
    }

    @Test fun oneMissingLetterDoesNotShiftTheRest() {
        val pairs = TypingLog.align("hi hi", listOf('h', ' ', 'h', 'i'))
        assertEquals(listOf(0 to 0, 1 to null, 2 to 1, 3 to 2, 4 to 3), pairs)
    }

    @Test fun checksSwipesWordByWord() {
        val log = TypingLog()
        log.swiped(listOf("hello", "jello")); log.swiped(listOf("would", "world")); log.swiped(emptyList())
        val r = log.report("hello world again", keys)
        assertEquals(1, r.swipeRight); assertEquals(3, r.swipeWords)
        assertTrue(r.swipeNotes[0].contains("\"world\" was choice 2"))
        assertTrue(r.swipeNotes[1].contains("not found (got nothing)"))
    }
}
