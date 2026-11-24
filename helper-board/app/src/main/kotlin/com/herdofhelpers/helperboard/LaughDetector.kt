package com.herdofhelpers.helperboard

import android.content.Context
import com.herdofhelpers.helperboard.core.LaughMarks
import com.herdofhelpers.helperboard.core.Wav
import java.io.File
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * Listens for laughter in a spoken part (raven575, 11-24), fully offline, with Google's YAMNet sound model
 * (Apache-2.0, 4.1 MB, assets/yamnet.tflite; see PROVENANCE.md) run by TensorFlow Lite (Apache-2.0).
 * The model hears 0.975 s at a time (15,600 samples at 16 kHz); windows step every half second.
 * If the model file is missing, or anything fails, it simply hears no laughter.
 */
class LaughDetector(context: Context) {
    /** Why the model isn't running, for the notice above the keys (null when it is). */
    var loadError: String? = null; private set
    private val interpreter: org.tensorflow.lite.Interpreter? = runCatching {
        val bytes = context.assets.open(MODEL).use { it.readBytes() }
        val buf = ByteBuffer.allocateDirect(bytes.size).order(ByteOrder.nativeOrder()).apply { put(bytes); rewind() }
        org.tensorflow.lite.Interpreter(buf, org.tensorflow.lite.Interpreter.Options().setNumThreads(2))
    }.onFailure { loadError = "${it.javaClass.simpleName}: ${it.message}".take(120) }.getOrNull()

    val available get() = interpreter != null
    /** The strongest laughing score in the last [listen] (0..1), shown when nothing counted, for tuning. */
    @Volatile var lastPeak = 0f; private set

    /** Laugh kind for each window of the PCM byte [range] (after the WAV header) of [audio]. Call off the main thread. */
    @Synchronized
    fun listen(audio: File, range: LongRange): List<LaughMarks.Kind?> {
        val model = interpreter ?: return emptyList()
        val pcm = runCatching {
            RandomAccessFile(audio, "r").use { raf ->
                val len = (range.last - range.first + 1).toInt().coerceAtLeast(0) and 1.inv()
                ByteArray(len).also { raf.seek(Wav.HEADER_BYTES + range.first); raf.readFully(it) }
            }
        }.getOrNull() ?: return emptyList()
        val samples = pcm.size / 2
        val out = ArrayList<LaughMarks.Kind?>()
        var peak = 0f
        var start = 0
        while (true) {
            val input = FloatArray(WINDOW) { i ->
                val s = start + i
                if (s >= samples) 0f
                else ((pcm[2 * s + 1].toInt() shl 8) or (pcm[2 * s].toInt() and 0xFF)).toShort() / 32768f
            }
            val scores = Array(1) { FloatArray(521) }
            runCatching { model.run(input, scores) }.onFailure { return out }
            out += LaughMarks.kind(scores[0])
            peak = maxOf(peak, LaughMarks.score(scores[0]))
            lastPeak = peak
            start += HOP
            if (start + WINDOW / 2 >= samples) break
        }
        return out
    }

    companion object {
        const val MODEL = "yamnet.tflite"
        const val WINDOW = 15_600
        const val HOP = 8_000
    }
}
