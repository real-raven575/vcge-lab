package com.herdofhelpers.helperboard.core

/**
 * The keyboard test (raven575, 11-22: fast typing froze after 3 or 4 keys and dropped the rest).
 * The keyboard writes down every touch on a letter key and every letter it actually typed; [report] then says
 * how fast letters arrived, which touches never became a letter, and where fingers land compared with the key
 * they meant to press (so key sizes and places can be tuned). Swipes are checked word by word.
 */
class TypingLog {
    /** One touch on a key. [x], [y]: where the finger landed, in keyboard pixels. */
    data class Touch(val label: String, val downMs: Long, val x: Float, val y: Float, var typedMs: Long = -1)

    /** A key's place on screen, for the "where do fingers land" check. */
    data class KeyBox(val cx: Float, val cy: Float, val w: Float, val h: Float)

    data class Swipe(val words: List<String>)

    val touches = ArrayList<Touch>()
    val swipes = ArrayList<Swipe>()
    /** The longest the keyboard went without answering while the test ran, in ms. */
    var longestStallMs = 0L

    fun clear() { touches.clear(); swipes.clear(); longestStallMs = 0 }

    fun down(label: String, downMs: Long, x: Float, y: Float) { touches += Touch(label, downMs, x, y) }

    /** The last touch turned into a swipe, so it was never meant to type a letter by itself. */
    fun becameSwipe() { touches.lastOrNull()?.takeIf { it.typedMs < 0 }?.let { touches.remove(it) } }

    /** A letter arrived in the text box. It belongs to the oldest touch on that key still waiting. */
    fun typed(label: String, nowMs: Long) {
        touches.firstOrNull { it.typedMs < 0 && it.label.equals(label, ignoreCase = true) }?.typedMs = nowMs
    }

    fun swiped(words: List<String>) { swipes += Swipe(words) }

    data class Report(
        val touches: Int, val typed: Int, val dropped: Int, val droppedKeys: List<String>,
        val medianMs: Long, val p95Ms: Long, val maxMs: Long, val longestStallMs: Long,
        /** Letters of the target typed right, and the slips as "meant → hit" with a count. */
        val right: Int, val targetLetters: Int, val slips: Map<String, Int>,
        /** Average place of touches against the key that was meant: + is right of / below the middle, in key sizes. */
        val offsetX: Float, val offsetY: Float,
        val swipeRight: Int, val swipeWords: Int, val swipeNotes: List<String>,
    ) {
        /** Plain-words summary, one line each, for the Settings page and the test log. */
        fun lines(): List<String> = buildList {
            add("Keys touched: $touches. Letters typed: $typed. Dropped: $dropped" +
                if (droppedKeys.isEmpty()) "." else " (${droppedKeys.joinToString(" ")}).")
            if (typed > 0) add("Touch to letter: middle ${medianMs} ms, slowest 1 in 20 ${p95Ms} ms, slowest ${maxMs} ms.")
            if (longestStallMs > 0) add("Longest freeze: $longestStallMs ms.")
            if (targetLetters > 0) {
                add("Right keys: $right of $targetLetters.")
                if (slips.isNotEmpty()) add("Slips (meant → hit): " + slips.entries.joinToString(", ") { "${it.key} ×${it.value}" } + ".")
                add("Touches land " + side(offsetX, "right", "left") + " and " + side(offsetY, "low", "high") + " of the key's middle.")
            }
            if (swipeWords > 0) {
                add("Swipes right first try: $swipeRight of $swipeWords.")
                swipeNotes.forEach { add(it) }
            }
        }

        private fun side(v: Float, plus: String, minus: String): String {
            val pct = Math.round(Math.abs(v) * 100)
            return if (pct < 5) "near the middle ($pct% $plus/$minus)" else "$pct% of a key ${if (v > 0) plus else minus}"
        }

        /** One line for the test robot to read: key=value pairs. */
        fun machineLine() = "touches=$touches typed=$typed dropped=$dropped right=$right/$targetLetters " +
            "median_ms=$medianMs p95_ms=$p95Ms max_ms=$maxMs stall_ms=$longestStallMs"
    }

    /**
     * [target]: the sentence the person was asked to type (empty = no accuracy check). [keys]: each letter key's
     * place, by its lower-case letter, plus ' ' for space.
     */
    fun report(target: String, keys: Map<Char, KeyBox>): Report {
        val done = touches.filter { it.typedMs >= 0 }
        val waits = done.map { it.typedMs - it.downMs }.sorted()
        fun pct(p: Double) = if (waits.isEmpty()) 0L else waits[((waits.size - 1) * p).toInt()]
        val dropped = touches.filter { it.typedMs < 0 }

        // Line up what was touched with what was meant (edit distance), so one slip doesn't shift every later letter.
        val meant = target.lowercase().filter { it.isLetter() || it == ' ' }
        val hit = touches.map { it.label.lowercase().let { l -> if (l == "space") ' ' else l.singleOrNull() ?: '?' } }
        var right = 0; val slips = LinkedHashMap<String, Int>()
        var sx = 0.0; var sy = 0.0; var n = 0
        for ((mi, ti) in align(meant, hit)) {
            if (mi == null || ti == null) continue
            val m = meant[mi]; val t = touches[ti]
            if (hit[ti] == m) right++ else slips.merge("${show(m)}→${show(hit[ti])}", 1, Int::plus)
            keys[m]?.let { k -> sx += (t.x - k.cx) / k.w; sy += (t.y - k.cy) / k.h; n++ }
        }

        val wanted = target.lowercase().split(' ').filter { it.isNotBlank() }
        var swipeRight = 0; val notes = ArrayList<String>()
        swipes.forEachIndexed { i, s ->
            val w = wanted.getOrNull(i) ?: return@forEachIndexed
            val rank = s.words.indexOfFirst { it.equals(w, ignoreCase = true) }
            when {
                rank == 0 -> swipeRight++
                rank > 0 -> notes += "Swipe \"$w\" was choice ${rank + 1} (first was \"${s.words[0]}\")."
                else -> notes += "Swipe \"$w\" not found (got ${s.words.take(3).joinToString { "\"$it\"" }.ifEmpty { "nothing" }})."
            }
        }
        return Report(
            touches.size, done.size, dropped.size, dropped.map { it.label }, pct(0.5), pct(0.95), waits.lastOrNull() ?: 0,
            longestStallMs, right, if (meant.isEmpty()) 0 else meant.length, slips,
            if (n == 0) 0f else (sx / n).toFloat(), if (n == 0) 0f else (sy / n).toFloat(),
            swipeRight, minOf(swipes.size, wanted.size), notes,
        )
    }

    private fun show(c: Char) = if (c == ' ') "space" else c.toString()

    companion object {
        /** Pairs of (index in a, index in b) from the cheapest edit path; null on one side = left out or extra. */
        fun align(a: String, b: List<Char>): List<Pair<Int?, Int?>> {
            val d = Array(a.length + 1) { IntArray(b.size + 1) }
            for (i in 0..a.length) d[i][0] = i
            for (j in 0..b.size) d[0][j] = j
            for (i in 1..a.length) for (j in 1..b.size)
                d[i][j] = minOf(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + if (a[i - 1] == b[j - 1]) 0 else 1)
            val out = ArrayList<Pair<Int?, Int?>>()
            var i = a.length; var j = b.size
            while (i > 0 || j > 0) {
                when {
                    i > 0 && j > 0 && d[i][j] == d[i - 1][j - 1] + if (a[i - 1] == b[j - 1]) 0 else 1 -> { out += (i - 1) to (j - 1); i--; j-- }
                    i > 0 && d[i][j] == d[i - 1][j] + 1 -> { out += (i - 1) to null; i-- }
                    else -> { out += null to (j - 1); j-- }
                }
            }
            return out.reversed()
        }
    }
}
