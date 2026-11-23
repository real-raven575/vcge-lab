package com.herdofhelpers.helperboard.core

/**
 * Tidies each spoken part before it is typed (raven575, 11-23: dictation came out as "I put the The What's that gift
 * Coupon Whatever the free ... Being paced Uh one after another").
 *
 * Live voice sends one part per pause, and the phone's recognizer treats every part as a new sentence: it gives it a
 * capital letter. Parts also share a little padded sound at their edges, so a word can come out twice. This:
 *  - lower-cases a part's first letter unless the text before it ends a sentence (or is empty), keeping "I" and
 *    words the recognizer wrote in capitals all through (names like "NASA");
 *  - drops the part's first word when it repeats the word just typed ("the The" becomes "the");
 *  - drops filler sounds ("uh", "um", "er", "ah", "hmm") when [dropFillers] is on.
 * Nothing else is changed: dictated words are never autocorrected (tester T7).
 */
object DictationJoin {
    private val fillers = setOf("uh", "um", "umm", "uhm", "er", "erm", "ah", "hmm", "mm")

    fun clean(part: String, before: CharSequence, dropFillers: Boolean = true): String {
        var words = part.trim().split(Regex("\\s+")).filter { it.isNotEmpty() }
        if (dropFillers) words = words.filter { it.lowercase().trimEnd(',', '.') !in fillers }
        if (words.isEmpty()) return ""

        val prev = before.trimEnd()
        val lastWord = prev.split(Regex("\\s+")).lastOrNull()?.trimEnd(',', '.', '!', '?').orEmpty()
        if (lastWord.isNotEmpty() && words[0].trimEnd(',', '.').equals(lastWord, ignoreCase = true)) words = words.drop(1)
        if (words.isEmpty()) return ""

        val sentenceStart = prev.isEmpty() || prev.last() in ".!?\n"
        val first = words[0]
        val keepCap = sentenceStart || first == "I" || first.startsWith("I'") ||
            (first.length > 1 && first.all { !it.isLetter() || it.isUpperCase() })
        val fixed = if (keepCap) first else first.replaceFirstChar { it.lowercaseChar() }
        return (listOf(fixed) + words.drop(1)).joinToString(" ")
    }
}
