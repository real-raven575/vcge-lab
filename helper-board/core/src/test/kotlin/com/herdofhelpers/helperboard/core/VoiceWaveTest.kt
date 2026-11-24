package com.herdofhelpers.helperboard.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class VoiceWaveTest {
    @Test fun quietRoomIsFlatAndTalkingRises() {
        val w = VoiceWave()
        w.add(IntArray(50) { 100 })                 // room noise
        assertTrue(w.quiet())
        w.add(intArrayOf(400, 1600, 6400))          // talking, getting louder
        val h = w.heights(3)
        assertTrue(h[0] < h[1] && h[1] < h[2], "louder should be taller: ${h.toList()}")
        assertEquals(1f, h[2])
        assertTrue(!w.quiet(3))
    }

    @Test fun softSpeakerStillGetsRoomToMove() {
        val w = VoiceWave()
        w.add(IntArray(50) { 200 })
        w.add(intArrayOf(500, 900))                 // soft voice: under 5× the floor
        val h = w.heights(2)
        assertTrue(h[0] > 0.1f && h[1] > h[0] && h[1] < 1f, h.toList().toString())
    }

    @Test fun oldestFirstAndPaddedBeforeStart() {
        val w = VoiceWave(keep = 4)
        w.add(intArrayOf(100, 100, 100, 100, 100, 5000))
        val h = w.heights(6)
        assertEquals(0f, h[0]); assertEquals(0f, h[1])  // older than the ring keeps
        assertEquals(1f, h[5])
        assertEquals(6, w.frames)
    }
}
