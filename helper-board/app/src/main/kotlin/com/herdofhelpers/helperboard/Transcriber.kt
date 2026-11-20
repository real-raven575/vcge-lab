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

    /** [done] is called on the main thread with the text, or null and a reason. */
    fun transcribe(audio: File, language: String, done: (String?, String?) -> Unit) {
        if (Build.VERSION.SDK_INT < 33) { done(null, "Text needs Android 13 or newer. Your audio is saved."); return }
        if (!SpeechRecognizer.isOnDeviceRecognitionAvailable(context)) {
            done(null, "No offline speech pack on this phone yet. Your audio is saved."); return
        }
        main.post { start(audio, language, done) }
    }

    private fun start(audio: File, language: String, done: (String?, String?) -> Unit) {
        if (Build.VERSION.SDK_INT < 33) return
        val recognizer = SpeechRecognizer.createOnDeviceSpeechRecognizer(context)
        val pipe = ParcelFileDescriptor.createPipe()
        val readEnd = pipe[0]
        val writeEnd = pipe[1]
        val parts = mutableListOf<String>()
        var finished = false

        fun finish(text: String?, reason: String?) {
            if (finished) return
            finished = true
            main.removeCallbacksAndMessages(TIMEOUT_TOKEN)
            runCatching { recognizer.destroy() }
            runCatching { readEnd.close() }
            done(text?.trim()?.takeIf { it.isNotEmpty() }, reason)
        }

        fun texts(b: Bundle?): String =
            b?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull().orEmpty()

        recognizer.setRecognitionListener(object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) {}
            override fun onBeginningOfSpeech() {}
            override fun onRmsChanged(rmsdB: Float) {}
            override fun onBufferReceived(buffer: ByteArray?) {}
            override fun onEndOfSpeech() {}
            override fun onPartialResults(partialResults: Bundle?) {}
            override fun onEvent(eventType: Int, params: Bundle?) {}
            override fun onSegmentResults(segmentResults: Bundle) {
                texts(segmentResults).takeIf { it.isNotBlank() }?.let { parts += it }
            }
            override fun onEndOfSegmentedSession() { finish(parts.joinToString(" "), null) }
            override fun onResults(results: Bundle?) {
                texts(results).takeIf { it.isNotBlank() }?.let { parts += it }
                finish(parts.joinToString(" "), null)
            }
            override fun onError(error: Int) {
                if (parts.isNotEmpty()) finish(parts.joinToString(" "), null)
                else finish(null, "The speech engine couldn't read this take (code $error). Your audio is saved.")
            }
        })

        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, language)
            putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
            putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE, readEnd)
            putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_CHANNEL_COUNT, 1)
            putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_ENCODING, AudioFormat.ENCODING_PCM_16BIT)
            putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_SAMPLING_RATE, 16_000)
            // Keep going through pauses: one long take, many sentences.
            putExtra(RecognizerIntent.EXTRA_SEGMENTED_SESSION, RecognizerIntent.EXTRA_AUDIO_SOURCE)
        }
        recognizer.startListening(intent)

        // Feed the saved audio (without its header) into the recognizer, then close the pipe to mark the end.
        Thread({
            try {
                ParcelFileDescriptor.AutoCloseOutputStream(writeEnd).use { out ->
                    FileInputStream(audio).use { input ->
                        input.skip(Wav.HEADER_BYTES.toLong())
                        input.copyTo(out, 8_192)
                    }
                }
            } catch (_: Exception) {
                // The recognizer stopped reading early; whatever it heard is still reported.
            }
        }, "helper-board-feed").start()

        main.postAtTime({ finish(parts.joinToString(" "), if (parts.isEmpty()) "Timed out. Your audio is saved." else null) },
            TIMEOUT_TOKEN, android.os.SystemClock.uptimeMillis() + timeoutFor(audio))
    }

    private fun timeoutFor(audio: File): Long = 30_000L + Wav.seconds(audio.length()) * 2_000L

    private companion object { val TIMEOUT_TOKEN = Any() }
}
