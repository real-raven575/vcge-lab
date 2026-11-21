package com.herdofhelpers.helperboard.core

import java.nio.ByteBuffer
import java.nio.ByteOrder

/** WAV (PCM) header. The recorder rewrites it every second, so a take survives a crash with all but the last second. */
object Wav {
    const val HEADER_BYTES = 44

    fun header(dataBytes: Long, sampleRate: Int = 16_000, channels: Int = 1, bitsPerSample: Int = 16): ByteArray {
        val byteRate = sampleRate * channels * bitsPerSample / 8
        return ByteBuffer.allocate(HEADER_BYTES).order(ByteOrder.LITTLE_ENDIAN).apply {
            put("RIFF".toByteArray(Charsets.US_ASCII))
            putInt((36 + dataBytes).toInt())
            put("WAVE".toByteArray(Charsets.US_ASCII))
            put("fmt ".toByteArray(Charsets.US_ASCII))
            putInt(16)
            putShort(1)                                        // PCM
            putShort(channels.toShort())
            putInt(sampleRate)
            putInt(byteRate)
            putShort((channels * bitsPerSample / 8).toShort())
            putShort(bitsPerSample.toShort())
            put("data".toByteArray(Charsets.US_ASCII))
            putInt(dataBytes.toInt())
        }.array()
    }

    /** Length in whole seconds of [dataBytes] of 16 kHz mono 16-bit audio. */
    fun seconds(dataBytes: Long, sampleRate: Int = 16_000): Long = dataBytes / (sampleRate * 2L)
}
