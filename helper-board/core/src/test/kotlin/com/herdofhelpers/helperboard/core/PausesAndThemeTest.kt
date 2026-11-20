package com.herdofhelpers.helperboard.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/** Loudness per 30 ms frame: [quiet] frames at 50, talking at 3000. */
private fun take(vararg parts: Pair<Boolean, Int>): IntArray =
    parts.flatMap { (talk, ms) -> List(ms / Pauses.FRAME_MS) { if (talk) 3_000 else 50 } }.toIntArray()

class PausesTest {
    @Test fun aLongPauseSplitsATakeAndKeepsWhatCameAfter() {
        // The first phone test: talk, a long pause, then more talking that the speech engine dropped.
        val parts = Pauses.speechParts(take(true to 3_000, false to 4_000, true to 2_000))
        assertEquals(2, parts.size)
        val secondStart = (3_000 + 4_000) / Pauses.FRAME_MS
        assertTrue(secondStart in parts[1], "the words after the pause are in a part of their own")
    }

    @Test fun aShortPauseStaysInsideOnePart() {
        assertEquals(1, Pauses.speechParts(take(true to 2_000, false to 450, true to 2_000)).size)
    }

    @Test fun partsArePaddedSoFirstSoundsAreNotClipped() {
        val p = Pauses.speechParts(take(false to 2_000, true to 1_000, false to 2_000)).single()
        assertEquals(2_000 / Pauses.FRAME_MS - 300 / Pauses.FRAME_MS, p.first)
    }

    @Test fun silenceGivesNoParts() {
        assertTrue(Pauses.speechParts(take(false to 5_000)).isEmpty())
        assertTrue(Pauses.speechParts(IntArray(0)).isEmpty())
    }

    @Test fun noisyBackgroundRaisesTheBar() {
        // A loud car (2000) with speech well above it (9000): the car alone is not speech.
        val levels = IntArray(300) { if (it in 100..150) 9_000 else 2_000 }
        val p = Pauses.speechParts(levels).single()
        assertTrue(p.first in 85..100 && p.last in 150..165)
    }

    @Test fun longTalkingIsCutIntoPiecesThatCoverEverything() {
        val levels = take(true to 70_000)
        val parts = Pauses.speechParts(levels, maxPartMs = 25_000)
        assertTrue(parts.size >= 3)
        assertTrue(parts.all { it.last - it.first + 1 <= 25_000 / Pauses.FRAME_MS })
        assertEquals(0, parts.first().first); assertEquals(levels.lastIndex, parts.last().last)
        parts.zipWithNext().forEach { (a, b) -> assertEquals(a.last + 1, b.first) }
    }

    @Test fun levelsReadLittleEndianPcm() {
        val pcm = ByteArray(Pauses.FRAME_BYTES * 2)
        for (i in Pauses.FRAME_BYTES until pcm.size step 2) { pcm[i] = 0xE8.toByte(); pcm[i + 1] = 0x03 } // 1000
        val l = Pauses.levels(pcm)
        assertEquals(0, l[0]); assertEquals(1_000, l[1])
        assertEquals(0L until Pauses.FRAME_BYTES.toLong(), Pauses.byteRange(0..0, 10_000))
    }
}

class HerdThemeTest {
    @Test fun everyLookAndColourVisionKeepsTextReadable() {
        for (look in HerdLook.values()) for (dark in listOf(true, false)) for (v in ColourVision.values()) {
            val p = HerdTheme.palette(look, v, dark)
            val where = "$look/${if (dark) "dark phone" else "light phone"}/$v"
            assertTrue(HerdTheme.contrast(p.text, p.surface) >= 4.5, "key text, $where")
            assertTrue(HerdTheme.contrast(p.onAccent, p.accent) >= 4.5, "mic and picked option, $where")
            assertTrue(HerdTheme.contrast(p.softInk, p.soft) >= 4.5, "suggestions, $where")
            assertTrue(HerdTheme.contrast(p.onStop, p.stop) >= 4.5, "recording key, $where")
            assertTrue(HerdTheme.contrast(p.onGood, p.good) >= 4.5, "caps on, $where")
        }
    }

    @Test fun colourVisionMovesGoAndStopApartLikeVcge() {
        val p = HerdTheme.palette(HerdLook.LIGHT, ColourVision.PROTAN)
        assertEquals(0xFF1D4ED8.toInt(), p.good); assertEquals(0xFFC2410C.toInt(), p.stop)
        assertEquals(HerdTheme.LIGHT, HerdTheme.palette(HerdLook.LIGHT, ColourVision.TYPICAL))
        assertEquals(HerdTheme.DARK, HerdTheme.palette(HerdLook.PHONE, ColourVision.TYPICAL, phoneIsDark = true))
    }
}

class SettingsKeyTest {
    @Test fun theModeStripHasASettingsKey() {
        assertTrue(Layouts.MODE_STRIP.any { it.kind == KeyKind.SETTINGS })
        assertTrue(Layouts.MODE_STRIP.any { it.kind == KeyKind.HIDE } && Layouts.MODE_STRIP.any { it.kind == KeyKind.SWITCH_KEYBOARD })
    }
}

class EmojiTest {
    @Test fun emojiTabCanBeHidden() {
        assertTrue(Layouts.modeStrip(true).any { it.kind == KeyKind.MODE_EMOJI })
        assertTrue(Layouts.modeStrip(false).none { it.kind == KeyKind.MODE_EMOJI })
    }

    @Test fun emojiPageKeepsTheSameBottomRowAndBigDeleteAndEnter() {
        val rows = Layouts.emoji()
        fun shape(r: List<Key>) = r.map { (if (it.kind == KeyKind.MODE_ABC) KeyKind.MODE_NUMBERS else it.kind) to it.weight }
        assertEquals(shape(Layouts.abc(NumberStyle.ROW).last()), shape(rows.last()))
        assertEquals(listOf(KeyKind.BACKSPACE, KeyKind.ENTER), rows.first().map { it.kind })
    }

    @Test fun searchFindsEmojiByNameOrFeeling() {
        assertEquals("🐘", EmojiBook.search("elephant").first().char)
        val happy = EmojiBook.search("happy").map { it.char }
        assertTrue("😀" in happy && "😊" in happy)
        assertTrue("😴" in EmojiBook.search("tired").map { it.char })
        assertTrue("😢" in EmojiBook.search("sa").map { it.char }, "a partly typed word still finds it")
        assertTrue(EmojiBook.search("love heart").all { it.matches("love heart") })
        assertTrue(EmojiBook.search("").isEmpty() && EmojiBook.search("zzqx").isEmpty())
    }

    @Test fun namesComeBeforeFeelings() {
        val r = EmojiBook.search("heart")
        assertTrue(r.first().name.contains("heart"))
    }

    @Test fun everyGroupHasEmojiAndNoneRepeat() {
        for (g in EmojiGroup.entries) assertTrue(EmojiBook.inGroup(g).size >= 25, "$g")
        assertEquals(EmojiBook.ALL.size, EmojiBook.ALL.map { it.char }.toSet().size)
    }

    @Test fun recentEmojiAreNewestFirstWithoutRepeats() {
        var r = emptyList<String>()
        for (e in listOf("👍", "🐘", "👍")) r = Layouts.rememberEmoji(r, e)
        assertEquals(listOf("👍", "🐘"), r)
        assertEquals(8, (1..20).fold(emptyList<String>()) { acc, i -> Layouts.rememberEmoji(acc, "$i") }.size)
        assertEquals(12, (1..20).fold(emptyList<String>()) { acc, i -> Layouts.rememberEmoji(acc, "$i", 12) }.size)
    }
}

class KeyPlacesTest {
    @Test fun backspaceIsNextToZeroAndAQuarterToAHalfWider() {
        val row = Layouts.abc(NumberStyle.ROW).first { r -> r.any { it.output == "0" } }
        assertEquals(KeyKind.BACKSPACE, row.last().kind); assertEquals("0", row[row.size - 2].output)
        assertTrue(row.last().weight in 1.2f..1.5f)
        for (n in NumberStyle.entries) for (m in Mode.entries) {
            assertTrue(Layouts.forMode(m, n).flatten().filter { it.kind == KeyKind.BACKSPACE }.all { it.weight in 1.2f..1.5f })
        }
    }

    @Test fun enterIsBigAndTwoRowsTallWhereApostropheAndBackspaceWere() {
        for (n in NumberStyle.entries) {
            val layout = Layouts.abc(n)
            val i = layout.indexOfFirst { r -> r.any { it.kind == KeyKind.ENTER } }
            val enter = layout[i].last()
            assertEquals(KeyKind.ENTER, enter.kind); assertEquals(2, enter.rows)
            assertTrue(layout[i + 1].first().kind == KeyKind.SHIFT, "the row below is the z row")
            assertTrue(layout.flatten().count { it.kind == KeyKind.ENTER } == 1)
        }
    }

    @Test fun punctuationIsAmongTheLettersNotInItsOwnRow() {
        val layout = Layouts.abc(NumberStyle.ROW)
        for (p in listOf(",", ".", "-", "?")) {
            val row = layout.first { r -> r.any { it.output == p } }
            assertTrue(row.count { it.output.length == 1 && it.output[0].isLetter() } >= 7, "$p sits with letters")
            assertEquals(1f, row.first { it.output == p }.weight)
        }
    }

    @Test fun everyModeHasAnEnter() {
        for (n in NumberStyle.entries) for (m in Mode.entries) {
            assertTrue(Layouts.forMode(m, n).flatten().any { it.kind == KeyKind.ENTER }, "$m")
        }
    }
}
