package com.herdofhelpers.helperboard

import com.herdofhelpers.helperboard.core.TypingLog

/**
 * The keyboard test in Settings (raven575, 11-22). The test box marks itself with [FIELD] in its private IME
 * options; while the keyboard types into that box it writes every touch and letter into [log]. The keyboard and
 * the Settings page run in the same app, so they share this object. Nothing here is saved to disk.
 */
object TypingTest {
    const val FIELD = "com.herdofhelpers.helperboard.typingtest"
    const val SENTENCE = "the quick brown fox jumps over the lazy dog"

    val log = TypingLog()
    /** Each key's place when the test started, by lower-case letter, ' ' for space. */
    @Volatile var keys: Map<Char, TypingLog.KeyBox> = emptyMap()

    /** A robot run the Settings page asked for: the sentence and the time between key presses. */
    @Volatile var robotRequest: Pair<String, Int>? = null
    /** The last robot run's report lines, for the Settings page. */
    @Volatile var robotResult: List<String> = emptyList()

    fun report() = log.report(SENTENCE, keys)
}
