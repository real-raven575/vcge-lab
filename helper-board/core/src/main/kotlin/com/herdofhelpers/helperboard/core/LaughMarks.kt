package com.herdofhelpers.helperboard.core

/**
 * Laughter markers (raven575's idea via HomeLab HMLB-0074, 11-23; build chosen 11-24): the phone's speech engine drops
 * laughter, so a small offline sound model (YAMNet, Apache-2.0) listens to each spoken part as well, about one
 * second at a time. This decides what to type from its scores: nothing, or one marker such as "(ha-ha)" or
 * "(giggle)", put before the words when the laugh came first and after them otherwise.
 */
object LaughMarks {
    /** YAMNet's sound classes (its label list, rows 13-18). */
    const val LAUGHTER = 13; const val BABY_LAUGHTER = 14; const val GIGGLE = 15
    const val SNICKER = 16; const val BELLY_LAUGH = 17; const val CHUCKLE = 18

    enum class Kind { LAUGH, GIGGLE }

    /** Marker styles for Settings: the laugh word and the giggle word. */
    val STYLES = listOf("(ha-ha) and (giggle)" to ("(ha-ha)" to "(giggle)"), "(laughs)" to ("(laughs)" to "(laughs)"), "😂 and 🤭" to ("😂" to "🤭"))

    /** The strongest laughing score of any kind in one window. */
    fun score(scores: FloatArray): Float =
        listOf(LAUGHTER, BABY_LAUGHTER, GIGGLE, SNICKER, BELLY_LAUGH, CHUCKLE).maxOf { scores.getOrElse(it) { 0f } }

    /** One ~1 s window's scores (521 classes) to a laugh kind, or null when no laughing was heard. */
    fun kind(scores: FloatArray, threshold: Float = 0.25f): Kind? {
        fun s(i: Int) = scores.getOrElse(i) { 0f }
        val laugh = maxOf(s(LAUGHTER), s(BELLY_LAUGH))
        val giggle = maxOf(s(GIGGLE), s(SNICKER), s(CHUCKLE), s(BABY_LAUGHTER))
        if (maxOf(laugh, giggle) < threshold) return null
        return if (laugh >= giggle) Kind.LAUGH else Kind.GIGGLE
    }

    /**
     * Adds one marker to a part's [text] when any window in [windows] (in time order) heard laughing. A big laugh
     * anywhere wins over giggles. Laughing only in the first third of the part goes before the words.
     */
    fun place(text: String, windows: List<Kind?>, laughWord: String = "(ha-ha)", giggleWord: String = "(giggle)"): String {
        val hits = windows.withIndex().filter { it.value != null }
        if (hits.isEmpty()) return text
        val word = if (hits.any { it.value == Kind.LAUGH }) laughWord else giggleWord
        val t = text.trim()
        if (t.isEmpty()) return word
        val early = hits.last().index < windows.size / 3.0
        return if (early) "$word $t" else "$t $word"
    }
}
