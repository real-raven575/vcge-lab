package com.herdofhelpers.helperboard.core

import kotlin.math.ln
import kotlin.math.max

/**
 * The flowing voice wave (raven575, 11-23: "a waveform that flows and ebbs as you get louder and softer", in place of
 * signal bars, so people can see where their breaks are and how their talking is going).
 *
 * Takes one loudness level per 30 ms frame (see [Pauses.levels]) and keeps the last [keep] frames. [heights] turns
 * them into 0..1 heights on a log scale between the room's quiet floor and the recent loudest, both measured as you
 * talk, so a soft voice still swings from low to high and a loud room doesn't fill the whole strip.
 */
class VoiceWave(private val keep: Int = 200) {
    private val ring = IntArray(keep)
    private var count = 0L
    private var floor = -1.0
    private var peak = 0.0

    /** Frames seen so far (also tells the view that new sound arrived). */
    val frames: Long @Synchronized get() = count

    @Synchronized fun add(levels: IntArray) {
        for (l in levels) {
            ring[(count % keep).toInt()] = l
            count++
            val v = l.toDouble()
            // The floor creeps up slowly and drops fast: it settles on the quietest the room gets.
            floor = if (floor < 0) v else if (v < floor) v else floor + (v - floor) * 0.002
            // The top jumps up at once and relaxes over a few seconds, so the wave keeps its shape after a loud word.
            peak = if (v > peak) v else peak * 0.995
        }
    }

    /** The newest [n] frames as heights 0..1, oldest first; frames before the start are 0. */
    @Synchronized fun heights(n: Int): FloatArray {
        val lo = ln(max(floor, 1.0) * 1.5)
        val hi = max(ln(max(peak, 1.0)), lo + ln(4.0))   // at least 4× above the floor counts as full height
        return FloatArray(n) { i ->
            val age = n - 1 - i
            if (age >= count || age >= keep) 0f
            else {
                val v = ring[((count - 1 - age) % keep).toInt()].toDouble()
                ((ln(max(v, 1.0)) - lo) / (hi - lo)).toFloat().coerceIn(0f, 1f)
            }
        }
    }

    /** True when the newest [frames] frames are all quiet: a break in talking. */
    fun quiet(frames: Int = 10): Boolean = heights(frames).all { it < 0.08f }
}
