package com.herdofhelpers.helperboard.core

import java.text.Normalizer

/**
 * A language's common words, most used first (from wordfreq; see assets/WORDS-NOTICE.txt). Used for word
 * suggestions, opt-in autocorrect and swipe typing. Nothing here is learned: the user's own words live in
 * [PersonalDictionary].
 */
class WordList(words: List<String>) {
    val words: List<String> = words.map { it.trim().lowercase() }.filter { it.isNotEmpty() }.distinct()
    /** Each word without accents or apostrophes: the keys a swipe passes over. */
    val plainWords: List<String> by lazy { this.words.map { plain(it).replace("'", "") } }
    private val rank: Map<String, Int> = this.words.withIndex().associate { (i, w) -> w to i }

    fun isKnown(word: String): Boolean = rank.containsKey(word.lowercase())
    /** 0 for the most common word; null if unknown. */
    fun rankOf(word: String): Int? = rank[word.lowercase()]

    /** Common words that start with [prefix] (longer than it), most used first. */
    fun complete(prefix: String, max: Int = 3): List<String> {
        val p = prefix.lowercase()
        if (p.isEmpty()) return emptyList()
        return words.asSequence().filter { it.length > p.length && it.startsWith(p) }.take(max).toList()
    }

    companion object {
        /** "canción" -> "cancion": the key a letter lives on. */
        fun plain(word: String): String =
            Normalizer.normalize(word.lowercase(), Normalizer.Form.NFD).replace(Regex("\\p{M}+"), "")

        /** Give [word] the same capitals as what the user typed: "Teh" -> "The", "TEH" -> "THE". */
        fun matchCase(typed: String, word: String): String = when {
            typed.length > 1 && typed.all { !it.isLetter() || it.isUpperCase() } -> word.uppercase()
            typed.firstOrNull()?.isUpperCase() == true -> word.replaceFirstChar { it.uppercase() }
            else -> word
        }
    }
}
