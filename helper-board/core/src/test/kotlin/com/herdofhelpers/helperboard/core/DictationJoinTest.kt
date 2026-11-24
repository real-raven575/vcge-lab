package com.herdofhelpers.helperboard.core

import kotlin.test.Test
import kotlin.test.assertEquals

class DictationJoinTest {
    @Test fun rebuildsRaven575sExample() {
        // The parts as the recognizer sent them, one per pause.
        val parts = listOf("Also I put the", "The What's that gift", "Coupon", "Whatever the free",
            "That we made", "I put those in the corn box", "Uh one after another")
        var text = ""
        for (p in parts) { val c = DictationJoin.clean(p, text); if (c.isNotEmpty()) text = if (text.isEmpty()) c else "$text $c" }
        assertEquals("Also I put the what's that gift coupon whatever the free that we made I put those in the corn box one after another", text)
    }

    @Test fun keepsCapitalAfterSentenceEndAndForNames() {
        assertEquals("Then we go", DictationJoin.clean("Then we go", "That's done."))
        assertEquals("NASA called", DictationJoin.clean("NASA called", "and then"))
        assertEquals("I'm here", DictationJoin.clean("I'm here", "so"))
        assertEquals("Hello", DictationJoin.clean("Hello", ""))
    }

    @Test fun fillersCanStay() {
        assertEquals("uh okay", DictationJoin.clean("Uh okay", "well", dropFillers = false))
        assertEquals("", DictationJoin.clean("Um", "well"))
    }
}
