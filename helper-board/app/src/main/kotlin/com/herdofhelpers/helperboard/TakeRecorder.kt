package com.herdofhelpers.helperboard

import android.annotation.SuppressLint
import android.content.Context
import android.media.AudioAttributes
import android.media.AudioDeviceInfo
import android.media.AudioFocusRequest
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Build
import com.herdofhelpers.helperboard.core.Pauses
import com.herdofhelpers.helperboard.core.VoiceWave
import com.herdofhelpers.helperboard.core.Wav
import java.io.File
import java.io.RandomAccessFile

/**
 * Records 16 kHz mono audio straight to a WAV file. The header and the file are synced to storage every second, so
 * a crash, an incoming call, or a dead battery loses at most the last second of what was said.
 *
 * While recording it holds "transient exclusive" audio focus and lets go cleanly afterwards, which should stop music
 * apps from treating the end of a voice message as a cue to start playing (tester T5; needs a real car test).
 */
class TakeRecorder(private val context: Context, private val file: File, private val useBluetoothMic: Boolean) {
    @Volatile private var running = false
    private var thread: Thread? = null
    private var focus: AudioFocusRequest? = null
    @Volatile var dataBytes: Long = 0; private set
    @Volatile var error: String? = null; private set
    /** How loud each 30 ms has been, for the flowing wave above the keys. */
    val wave = VoiceWave()

    private val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager

    @SuppressLint("MissingPermission") // the keyboard checks RECORD_AUDIO before creating a recorder
    fun start() {
        val rate = 16_000
        val minBuf = AudioRecord.getMinBufferSize(rate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
        val record = AudioRecord(
            MediaRecorder.AudioSource.VOICE_RECOGNITION, rate,
            AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, maxOf(minBuf, rate),
        )
        if (record.state != AudioRecord.STATE_INITIALIZED) {
            record.release(); error = "The microphone could not start."; return
        }
        chooseMic(record)
        requestFocus()

        running = true
        record.startRecording()
        thread = Thread({ loop(record) }, "helper-board-recorder").apply { start() }
    }

    private fun chooseMic(record: AudioRecord) {
        val inputs = audioManager.getDevices(AudioManager.GET_DEVICES_INPUTS)
        val wanted = if (useBluetoothMic) inputs.firstOrNull { it.type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO }
        else inputs.firstOrNull { it.type == AudioDeviceInfo.TYPE_BUILTIN_MIC }
        if (wanted != null) record.preferredDevice = wanted
        // A Bluetooth headset or car only sends its mic once it is the call ("communication") device.
        if (useBluetoothMic && wanted != null && Build.VERSION.SDK_INT >= 31) {
            usedCommunicationDevice = audioManager.setCommunicationDevice(wanted)
        }
    }
    private var usedCommunicationDevice = false

    private fun requestFocus() {
        val attrs = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ASSISTANT)
            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build()
        val req = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_EXCLUSIVE)
            .setAudioAttributes(attrs)
            .setOnAudioFocusChangeListener { }
            .build()
        audioManager.requestAudioFocus(req)
        focus = req
    }

    private fun loop(record: AudioRecord) {
        val buf = ByteArray(Pauses.FRAME_BYTES * 2) // 60 ms: small reads keep the wave smooth
        try {
            RandomAccessFile(file, "rw").use { raf ->
                raf.setLength(0)
                raf.write(Wav.header(0))
                var lastSync = System.currentTimeMillis()
                while (running) {
                    val n = record.read(buf, 0, buf.size)
                    if (n > 0) { raf.write(buf, 0, n); dataBytes += n; wave.add(Pauses.levels(buf, n)) }
                    val now = System.currentTimeMillis()
                    if (now - lastSync >= 1_000) { writeHeader(raf); raf.fd.sync(); lastSync = now }
                }
                writeHeader(raf); raf.fd.sync()
            }
        } catch (e: Exception) {
            error = "Recording stopped early: ${e.message}"
        } finally {
            runCatching { record.stop() }
            record.release()
        }
    }

    private fun writeHeader(raf: RandomAccessFile) {
        val pos = raf.filePointer
        raf.seek(0); raf.write(Wav.header(dataBytes)); raf.seek(pos)
    }

    /** Stops and waits until every byte is on disk. */
    fun stop() {
        running = false
        thread?.join(3_000)
        focus?.let { audioManager.abandonAudioFocusRequest(it) }
        focus = null
        if (usedCommunicationDevice && Build.VERSION.SDK_INT >= 31) audioManager.clearCommunicationDevice()
        usedCommunicationDevice = false
    }

    companion object {
        val supportsOnDeviceText: Boolean get() = Build.VERSION.SDK_INT >= 33
    }
}
