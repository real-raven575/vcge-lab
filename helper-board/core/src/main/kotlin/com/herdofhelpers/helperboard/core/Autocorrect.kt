package com.herdofhelpers.helperboard.core

/**
 * Opt-in autocorrect (off until the user turns it on). Promises from testers T2 and T7:
 *  - it never touches dictated text, password boxes, or web and email addresses (the keyboard checks that);
 *  - it only fixes words it doesn't know, and only when one fix is clearly best;
 *  - every fix can be undone with one tap of ⌫ or the ↶ chip.
 * Typing slips cost less when the wrong letter sits next to the right one on the keys.
 */
object Autocorrect {
    /** English words people type without the apostrophe. Real words like "cant", "wont" and "ill" are left alone. */
    private val CONTRACTIONS = listOf("i'm", "i've", "don't", "didn't", "doesn't", "isn't", "aren't", "wasn't", "weren't",
        "hasn't", "haven't", "hadn't", "couldn't", "wouldn't", "shouldn't", "you're", "you've", "you'll", "they're",
        "they've", "that's", "what's", "there's", "here's", "where's", "who's", "how's", "it'll", "we've")
        .associateBy { it.replace("'", "") }
        .mapValues { (_, v) -> if (v.startsWith("i'")) "I" + v.substring(1) else v }

    private val rows = listOf("qwertyuiop", "asdfghjkl", "zxcvbnm")
    private val offsets = listOf(0.0, 0.25, 0.75)
    private val pos: Map<Char, Pair<Double, Double>> = buildMap {
        rows.forEachIndexed { r, row -> row.forEachIndexed { c, ch -> put(ch, (c + offsets[r]) to r.toDouble()) } }
    }

    fun neighbours(a: Char, b: Char): Boolean {
        val pa = pos[a] ?: return false; val pb = pos[b] ?: return false
        val dx = pa.first - pb.first; val dy = pa.second - pb.second
        return dx * dx + dy * dy < 1.6
    }

    private fun subCost(a: Char, b: Char): Double = when {
        a == b -> 0.0
        WordList.plain(a.toString()) == WordList.plain(b.toString()) -> 0.2 // e vs é
        neighbours(a, b) -> 0.6
        else -> 1.0
    }

    /** Typing distance: missing, extra, swapped or wrong letters; next-door slips and missing accents cost less. */
    fun distance(typed: String, word: String, limit: Double = 2.5): Double {
        val a = typed; val b = word
        if (Math.abs(a.length - b.length) > limit) return Double.MAX_VALUE
        val d = Array(a.length + 1) { DoubleArray(b.length + 1) }
        for (i in 0..a.length) d[i][0] = i.toDouble()
        for (j in 1..b.length) d[0][j] = d[0][j - 1] + if (b[j - 1] == '\'') 0.3 else 1.0
        for (i in 1..a.length) {
            var rowMin = Double.MAX_VALUE
            for (j in 1..b.length) {
                val insert = if (b[j - 1] == '\'') 0.3 else 1.0 // "dont" -> "don't" is cheap
                var v = minOf(d[i - 1][j] + 1.0, d[i][j - 1] + insert, d[i - 1][j - 1] + subCost(a[i - 1], b[j - 1]))
                if (i > 1 && j > 1 && a[i - 1] == b[j - 2] && a[i - 2] == b[j - 1]) v = minOf(v, d[i - 2][j - 2] + 0.6)
                d[i][j] = v
                rowMin = minOf(rowMin, v)
            }
            if (rowMin > limit) return Double.MAX_VALUE
        }
        return d[a.length][b.length]
    }

    /**
     * The fix for [typed], or null to leave it alone. [known] = the user's own words (never "fixed").
     * English "i" becomes "I".
     */
    fun fix(typed: String, list: WordList, known: (String) -> Boolean = { false }, english: Boolean = true): String? {
        if (typed.length < 2) return if (english && typed == "i") "I" else null
        if (typed.any { it.isDigit() } || !typed.any { it.isLetter() }) return null
        val low = typed.lowercase()
        if (english) CONTRACTIONS[low]?.let { return WordList.matchCase(typed, it) }
        if (list.isKnown(low) || known(low)) return null
        val limit = if (low.length <= 4) 1.0 else 2.0
        var best: String? = null; var bestScore = Double.MAX_VALUE; var second = Double.MAX_VALUE
        for ((rank, w) in list.words.withIndex()) {
            if (Math.abs(w.length - low.length) > 2) continue
            val dist = distance(low, w, limit)
            if (dist > limit) continue
            // Common words win ties: a tiny bonus by how often the word is used.
            val score = dist + Math.log10(rank + 10.0) * 0.12
            if (score < bestScore) { second = bestScore; bestScore = score; best = w }
            else if (score < second) second = score
        }
        val w = best ?: return null
        // Only when one fix is clearly best; a close race means we'd be guessing.
        if (second - bestScore < 0.15) return null
        val fixed = if (english && w.startsWith("i'")) "I" + w.substring(1) else w
        return WordList.matchCase(typed, fixed)
    }
}
