package com.herdofhelpers.helperboard.core

/**
 * Finds the parts of a take where someone is talking, so text can be made from each part on its own.
 *
 * Why: Android's speech engine can stop listening at a long pause and drop everything said after it (first phone
 * test, 11-20). Splitting the saved audio at pauses first means a pause can never end the take's text early.
 *
 * Works on loudness levels, one per [FRAME_MS] of audio (see [levels]). The quiet floor is measured from the take
 * itself, so a noisy car and a quiet room both work.
 */
object Pauses {
    const val FRAME_MS = 30
    const val SAMPLE_RATE = 16_000
    const val FRAME_BYTES = SAMPLE_RATE / 1000 * FRAME_MS * 2   // 16-bit mono: 960 bytes

    /** Mean loudness of each 30 ms frame of 16-bit little-endian mono PCM. A short last frame still counts. */
    fun levels(pcm: ByteArray, length: Int = pcm.size): IntArray {
        val frames = (length + FRAME_BYTES - 1) / FRAME_BYTES
        return IntArray(frames) { f ->
            val start = f * FRAME_BYTES
            val end = minOf(start + FRAME_BYTES, length) and 1.inv()
            var sum = 0L
            var i = start
            while (i + 1 < end) {
                val s = ((pcm[i + 1].toInt() shl 8) or (pcm[i].toInt() and 0xFF)).toShort().toInt()
                sum += kotlin.math.abs(s); i += 2
            }
            if (end > start) (sum / ((end - start) / 2).coerceAtLeast(1)).toInt() else 0
        }
    }

    /**
     * Frame ranges (inclusive) that hold speech, in order. Pauses shorter than [pauseMs] stay inside a part; each
     * part gets [padMs] of lead-in and tail so first and last sounds aren't clipped; no part is longer than
     * [maxPartMs] (long talking is cut at its quietest moment). An all-quiet take gives no parts.
     */
    fun speechParts(
        levels: IntArray,
        pauseMs: Int = 800,
        padMs: Int = 300,
        maxPartMs: Int = 25_000,
        minLevel: Int = 300,
    ): List<IntRange> {
        if (levels.isEmpty()) return emptyList()
        // Quiet floor = the take's quieter frames; loud = its louder ones. A take that is talking all the way through
        // has no quiet frames, so the bar is also capped at a quarter of the loud level.
        val sorted = levels.sorted()
        val floor = sorted[sorted.size / 5]
        val loud = sorted[(sorted.size * 19) / 20]
        val threshold = maxOf(minLevel, minOf(floor * 3, loud / 4))
        val pause = pauseMs / FRAME_MS
        val pad = padMs / FRAME_MS
        val maxLen = maxPartMs / FRAME_MS

        // 1. Runs of talking, joining runs split by short pauses.
        val raw = mutableListOf<IntRange>()
        var start = -1
        var lastLoud = -1
        for (i in levels.indices) {
            if (levels[i] <= threshold) continue
            if (start < 0) start = i
            else if (i - lastLoud > pause) { raw += start..lastLoud; start = i }
            lastLoud = i
        }
        if (start >= 0) raw += start..lastLoud

        // 2. Pad, keep inside the take, and merge any that now touch.
        val padded = mutableListOf<IntRange>()
        for (r in raw) {
            val p = maxOf(0, r.first - pad)..minOf(levels.lastIndex, r.last + pad)
            val prev = padded.lastOrNull()
            if (prev != null && p.first <= prev.last + 1) padded[padded.lastIndex] = prev.first..maxOf(prev.last, p.last)
            else padded += p
        }

        // 3. Cut very long parts at their quietest frame, looking back from the length limit.
        val out = mutableListOf<IntRange>()
        for (r in padded) {
            var s = r.first
            while (r.last - s + 1 > maxLen) {
                val windowStart = s + maxLen * 4 / 5
                val windowEnd = s + maxLen - 1
                var cut = windowEnd
                for (i in windowStart..windowEnd) if (levels[i] < levels[cut]) cut = i
                out += s..cut
                s = cut + 1
            }
            out += s..r.last
        }
        return out
    }

    /** Byte range in the PCM data (after the WAV header) for a frame range. */
    fun byteRange(frames: IntRange, dataBytes: Long): LongRange =
        frames.first * FRAME_BYTES.toLong() until minOf(dataBytes, (frames.last + 1) * FRAME_BYTES.toLong())
}
