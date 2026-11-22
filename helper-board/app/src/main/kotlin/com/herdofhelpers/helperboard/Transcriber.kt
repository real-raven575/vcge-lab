package com.herdofhelpers.helperboard

import android.content.Context
import android.content.Intent
import android.media.AudioFormat
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.ParcelFileDescriptor
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import com.herdofhelpers.helperboard.core.Pauses
import com.herdofhelpers.helperboard.core.Wav
import java.io.File
import java.io.FileInputStream

/**
 * Turns a saved take into text, on the phone only.
 *
 * Prototype stand-in: Android's own ON-DEVICE recognizer (Android 13 and newer), fed from the saved audio file, so
 * the recording always exists before any transcribing starts. It never uses the network: createOnDeviceSpeechRecognizer
 * refuses to run if the phone has no offline speech pack. The real app swaps this for a bundled Moonshine model.
 *
 * If text can't be made (older Android, no offline pack, an error), the take stays saved as audio and can be
 * re-listened later from the Take Vault.
 */
class Transcriber(private val context: Context) {
    private val main = Handler(Looper.getMainLooper())

    fun available(): Boolean = Build.VERSION.SDK_INT >= 33 &&
        SpeechRecognizer.isOnDeviceRecognitionAvailable(context)

    /**
     * [done] is called on the main thread with the text, or null and a reason. Text plus a reason means some parts of
     * the take gave no text; the audio is all still saved, so the user can play those parts or Re-listen.
     */
    fun transcribe(audio: File, language: String, done: (String?, String?) -> Unit) {
        if (Build.VERSION.SDK_INT < 33) { done(null, "Text needs Android 13 or newer. Your audio is saved."); return }
        if (!SpeechRecognizer.isOnDeviceRecognitionAvailable(context)) {
            done(null, "No offline speech pack on this phone yet. Your audio is saved."); return
        }
        // Find the talking parts off the main thread, then make text from each part in turn. A long pause can no
        // longer end the take's text early: every part after it gets its own turn (first phone test, 11-20).
        Thread({
            val dataBytes = (audio.length() - Wav.HEADER_BYTES).coerceAtLeast(0)
            val parts = runCatching { Pauses.speechParts(levelsOf(audio)) }.getOrDefault(emptyList())
            main.post {
                if (parts.isEmpty()) { done(null, "No talking heard in this take. Your audio is saved."); return@post }
                val texts = mutableListOf<String>()
                val codes = sortedSetOf<Int>()
                var empty = 0
                fun next(i: Int) {
                    if (i == parts.size) {
                        val text = texts.joinToString(" ").trim().takeIf { it.isNotEmpty() }
                        val code = if (codes.isEmpty()) "" else " (engine code ${codes.joinToString(", ")})"
                        val reason = when {
                            text == null -> "The speech engine couldn't read this take$code. Your audio is saved."
                            empty > 0 -> "$empty of ${parts.size} parts had no text. Play the take or tap Re-listen."
                            else -> null
                        }
                        done(text, reason); return
                    }
                    recognize(audio, Pauses.byteRange(parts[i], dataBytes), language) { t, err ->
                        err?.let { codes += it }
                        if (t.isNullOrBlank()) empty++ else texts += t.trim()
                        next(i + 1)
                    }
                }
                next(0)
            }
        }, "helper-board-pauses").start()
    }

    /** Loudness of every 30 ms of the take, read a block at a time so long takes don't fill memory. */
    private fun levelsOf(audio: File): IntArray {
        val out = ArrayList<Int>()
        val buf = ByteArray(Pauses.FRAME_BYTES * 512)
        FileInputStream(audio).use { input ->
            input.skip(Wav.HEADER_BYTES.toLong())
            while (true) {
                var n = 0
                while (n < buf.size) { val r = input.read(buf, n, buf.size - n); if (r < 0) break; n += r }
                if (n == 0) break
                Pauses.levels(buf, n).forEach { out += it }
                if (n < buf.size) break
            }
        }
        return out.toIntArray()
    }

    /**
     * Text for one part of the take ([bytes] of PCM after the header), or null and the engine's error code.
     * Uses the engine's segmented mode, the mode that worked on the first phone test (build 8); the plain mode gave no
     * text at all on that phone (build 9).
     */
    internal fun recognize(audio: File, bytes: LongRange, language: String, done: (String?, Int?) -> Unit) {
        if (Build.VERSION.SDK_INT < 33) { done(null, null); return }
        val recognizer = SpeechRecognizer.createOnDeviceSpeechRecognizer(context)
        val pipe = ParcelFileDescriptor.createPipe()
        val readEnd = pipe[0]
        val writeEnd = pipe[1]
        var finished = false
        val token = Any()
        val heard = mutableListOf<String>()

        fun finish(error: Int? = null) {
            if (finished) return
            finished = true
            main.removeCallbacksAndMessages(token)
            runCatching { recognizer.destroy() }
            runCatching { readEnd.close() }
            val text = heard.joinToString(" ").trim().takeIf { it.isNotEmpty() }
            done(text, if (text == null) error else null)
        }
        fun first(b: Bundle?) = b?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()?.takeIf { it.isNotBlank() }

        recognizer.setRecognitionListener(object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) {}
            override fun onBeginningOfSpeech() {}
            override fun onRmsChanged(rmsdB: Float) {}
            override fun onBufferReceived(buffer: ByteArray?) {}
            override fun onEndOfSpeech() {}
            override fun onPartialResults(partialResults: Bundle?) {}
            override fun onEvent(eventType: Int, params: Bundle?) {}
            override fun onSegmentResults(segmentResults: Bundle) { first(segmentResults)?.let { heard += it } }
            override fun onEndOfSegmentedSession() { finish() }
            override fun onResults(results: Bundle?) { first(results)?.let { heard += it }; finish() }
            override fun onError(error: Int) { finish(error) }
        })

        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, language)
            putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
            putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE, readEnd)
            putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_CHANNEL_COUNT, 1)
            putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_ENCODING, AudioFormat.ENCODING_PCM_16BIT)
            putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_SAMPLING_RATE, 16_000)
            putExtra(RecognizerIntent.EXTRA_SEGMENTED_SESSION, RecognizerIntent.EXTRA_AUDIO_SOURCE)
        }
        recognizer.startListening(intent)

        // Feed just this part, then close the pipe to mark its end.
        Thread({
            try {
                ParcelFileDescriptor.AutoCloseOutputStream(writeEnd).use { out ->
                    java.io.RandomAccessFile(audio, "r").use { raf ->
                        raf.seek(Wav.HEADER_BYTES + bytes.first)
                        var left = bytes.last - bytes.first + 1
                        val buf = ByteArray(8_192)
                        while (left > 0) {
                            val n = raf.read(buf, 0, minOf(buf.size.toLong(), left).toInt())
                            if (n < 0) break
                            out.write(buf, 0, n); left -= n
                        }
                    }
                }
            } catch (_: Exception) {
                // The recognizer stopped reading early; whatever it heard is still reported.
            }
        }, "helper-board-feed").start()

        val seconds = (bytes.last - bytes.first + 1) / 32_000
        main.postAtTime({ finish() }, token, android.os.SystemClock.uptimeMillis() + 20_000L + seconds * 2_000L)
    }
}
