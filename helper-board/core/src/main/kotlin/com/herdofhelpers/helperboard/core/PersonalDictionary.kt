package com.herdofhelpers.helperboard.core

/**
 * Words the user has approved. An approved word is never treated as a mistake again. New words wait in [pending]
 * ("Did you mean to save this?") until the user approves or rejects them. Nothing here ever changes typed text on its
 * own: suggestions only replace a word when the user taps one.
 */
class PersonalDictionary {
    private val known = linkedMapOf<String, String>()   // lowercase -> spelling the user saved
    private val waiting = linkedSetOf<String>()

    val words: List<String> get() = known.values.toList()
    val pending: List<String> get() = waiting.toList()

    fun isKnown(word: String) = known.containsKey(word.lowercase())

    fun approve(word: String) {
        val w = word.trim()
        if (w.isEmpty()) return
        known[w.lowercase()] = w
        waiting.removeIf { it.equals(w, ignoreCase = true) }
    }

    fun reject(word: String) { waiting.removeIf { it.equals(word, ignoreCase = true) } }

    fun remove(word: String) { known.remove(word.lowercase()) }

    /** Offer a new word for approval (only used when the user has turned learning on). */
    fun offer(word: String) {
        val w = word.trim()
        if (w.length < 2 || isKnown(w) || w.any { it.isDigit() }) return
        waiting += w
    }

    /** Up to [limit] saved words that start with [prefix], shortest first. */
    fun complete(prefix: String, limit: Int = 3): List<String> {
        if (prefix.isEmpty()) return emptyList()
        val p = prefix.lowercase()
        return known.entries.filter { it.key.startsWith(p) && it.key != p }
            .sortedBy { it.key.length }.take(limit).map { it.value }
    }

    fun serialize(): String = buildString {
        known.values.forEach { append("+").append(it).append('\n') }
        waiting.forEach { append("?").append(it).append('\n') }
    }

    companion object {
        fun parse(text: String): PersonalDictionary = PersonalDictionary().apply {
            text.lineSequence().forEach { line ->
                when {
                    line.startsWith("+") -> approve(line.substring(1))
                    line.startsWith("?") -> line.substring(1).trim().takeIf { it.isNotEmpty() }?.let { waiting += it }
                }
            }
        }

        /** The word right before the cursor (letters and apostrophes), or "" if the cursor follows a space. */
        fun currentWord(textBeforeCursor: CharSequence): String {
            var i = textBeforeCursor.length
            while (i > 0 && (textBeforeCursor[i - 1].isLetter() || textBeforeCursor[i - 1] == '\'')) i--
            return textBeforeCursor.substring(i)
        }
    }
}
