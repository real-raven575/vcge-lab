package com.herdofhelpers.helperboard

import android.os.Handler
import android.os.Looper
import com.herdofhelpers.helperboard.core.Pauses
import com.herdofhelpers.helperboard.core.Wav
import java.io.File
import java.io.RandomAccessFile

/**
 * Live voice (raven575, 11-21): text appears while you talk, still fully offline.
 *
 * The whole take keeps recording to its file (nothing is ever lost). Every 0.4 s this reads the newest audio from
 * that file, measures how loud it is (for the meter), and when a pause shows a talking part has ended, sends just
 * that part to the phone's on-device speech engine while recording carries on. Each part's text is handed back in
 * order, a second or so after it was said. When recording stops, the last part is read the same way.
 */
class LiveTranscriber(
    private val transcriber: Transcriber,
    private val audio: File,
    private val language: String,
    private val onText: (String) -> Unit,
) {
    private val main = Handler(Looper.getMainLooper())
    @Volatile private var stopping = false
    @Volatile var level: Int = 0; private set
    private var levels = IntArray(0)
    private var sentUpTo = 0           // frames already sent to the engine
    private val queue = ArrayDeque<LongRange>()
    private var busy = false
    private var scannerDone = false
    private val texts = mutableListOf<String>()
    var emptyParts = 0; private set
    var parts = 0; private set
    private var onFinished: ((String?) -> Unit)? = null

    fun start() {
        Thread({
            while (true) {
                val last = stopping
                runCatching { scan(final = last) }
                if (last) break
                Thread.sleep(400)
            }
            main.post { scannerDone = true; pump() }
        }, "helper-board-live").start()
    }

    /** Call after the recorder has stopped and flushed. [done] gets all the text (or null) on the main thread. */
    fun finish(done: (String?) -> Unit) { onFinished = done; stopping = true }

    private fun scan(final: Boolean) {
        val dataBytes = (audio.length() - Wav.HEADER_BYTES).coerceAtLeast(0)
        val haveFrames = levels.size
        val newFrames = (dataBytes / Pauses.FRAME_BYTES).toInt() - haveFrames
        if (newFrames > 0) {
            val buf = ByteArray(newFrames * Pauses.FRAME_BYTES)
            RandomAccessFile(audio, "r").use { raf ->
                raf.seek(Wav.HEADER_BYTES + haveFrames.toLong() * Pauses.FRAME_BYTES)
                raf.readFully(buf)
            }
            levels += Pauses.levels(buf)
            level = levels.takeLast(5).maxOrNull() ?: 0
        }
        val ready = Pauses.finishedParts(levels, sentUpTo, final)
        if (ready.isEmpty()) return
        sentUpTo = ready.last().last + 1
        val ranges = ready.map { Pauses.byteRange(it, levels.size.toLong() * Pauses.FRAME_BYTES) }
        main.post { queue.addAll(ranges); parts += ranges.size; pump() }
    }

    /** One part at a time, in order, so the text lands in the order it was said. */
    private fun pump() {
        if (busy) return
        val next = queue.removeFirstOrNull()
        if (next == null) {
            if (scannerDone) onFinished?.let { cb -> onFinished = null; cb(texts.joinToString(" ").trim().ifEmpty { null }) }
            return
        }
        busy = true
        transcriber.recognize(audio, next, language) { text, _ ->
            busy = false
            val t = text?.trim().orEmpty()
            if (t.isEmpty()) emptyParts++ else { texts += t; onText(t) }
            pump()
        }
    }
}
