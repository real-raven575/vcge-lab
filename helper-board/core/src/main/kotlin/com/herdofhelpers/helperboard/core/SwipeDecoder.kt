package com.herdofhelpers.helperboard.core

/** A point on the keyboard, in pixels. */
data class Pt(val x: Float, val y: Float)

/**
 * Swipe typing (raven575, 11-21), written here from scratch, offline. The finger's path is compared with the
 * path each word would draw through the key centres; the closest paths win, and common words break near-ties.
 * Words are only offered, the same as any suggestion: the best one is typed, the next ones wait in the word bar.
 */
class SwipeDecoder(private val keys: Map<Char, Pt>, private val keyWidth: Float, private val list: WordList) {
    private val samples = 32

    /** The best words for a swipe, best first. Empty when the path is too short to be a swipe. */
    fun decode(path: List<Pt>, max: Int = 4): List<String> {
        if (path.size < 2 || keyWidth <= 0f) return emptyList()
        val user = resample(path)
        val start = nearestKeys(path.first(), 3)
        val end = nearestKeys(path.last(), 3)
        val scored = ArrayList<Pair<String, Double>>()
        val plains = list.plainWords
        for ((rank, w) in list.words.withIndex()) {
            val letters = plains[rank]
            if (letters.length < 2 || letters.any { it !in keys }) continue
            if (letters.first() !in start || letters.last() !in end) continue
            val ideal = resample(pathFor(letters) ?: continue)
            var sum = 0.0
            for (i in 0 until samples) sum += dist(user[i], ideal[i])
            val location = sum / samples / keyWidth
            // Turns in the finger's path should match the word's letters: a straight swipe isn't "hello".
            val score = location + Math.log10(rank + 10.0) * 0.08
            scored.add(w to score)
        }
        return scored.sortedBy { it.second }.take(max).map { it.first }
    }

    /** The key-centre path for a word; double letters ("ll") draw one point. */
    private fun pathFor(letters: String): List<Pt>? {
        val pts = ArrayList<Pt>()
        var last: Char? = null
        for (c in letters) { if (c != last) pts.add(keys[c] ?: return null); last = c }
        return if (pts.size == 1) listOf(pts[0], pts[0]) else pts
    }

    private fun nearestKeys(p: Pt, n: Int): Set<Char> =
        keys.entries.sortedBy { dist(it.value, p) }.take(n).map { it.key }.toSet()

    private fun dist(a: Pt, b: Pt): Double { val dx = (a.x - b.x).toDouble(); val dy = (a.y - b.y).toDouble(); return Math.sqrt(dx * dx + dy * dy) }

    /** [samples] points spread evenly along the path. */
    fun resample(path: List<Pt>): List<Pt> {
        val total = (1 until path.size).sumOf { dist(path[it - 1], path[it]) }
        if (total == 0.0) return List(samples) { path.first() }
        val step = total / (samples - 1)
        val out = ArrayList<Pt>(samples).apply { add(path.first()) }
        var i = 1; var prev = path.first(); var carried = 0.0
        while (out.size < samples && i < path.size) {
            val cur = path[i]
            val d = dist(prev, cur)
            if (carried + d >= step && d > 0) {
                val t = ((step - carried) / d).toFloat()
                val np = Pt(prev.x + (cur.x - prev.x) * t, prev.y + (cur.y - prev.y) * t)
                out.add(np); prev = np; carried = 0.0
            } else { carried += d; prev = cur; i++ }
        }
        while (out.size < samples) out.add(path.last())
        return out
    }
}
