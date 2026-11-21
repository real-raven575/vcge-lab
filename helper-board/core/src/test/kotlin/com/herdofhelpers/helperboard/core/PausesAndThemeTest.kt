package com.herdofhelpers.helperboard.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlin.test.assertNull

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
            assertTrue(row.first { it.output == p }.weight in 1f..1.15f, "$p is letter-sized")
        }
    }

    @Test fun everyModeHasAnEnter() {
        for (n in NumberStyle.entries) for (m in Mode.entries) {
            assertTrue(Layouts.forMode(m, n).flatten().any { it.kind == KeyKind.ENTER }, "$m")
        }
    }
}

class Build15Test {
    private fun units(row: List<Key>) = row.sumOf { it.weight.toDouble() }

    @Test fun letterRowsAreTheSameWidthSoLettersMatch() {
        for (style in listOf(NumberStyle.ROW, NumberStyle.OFF)) {
            val rows = Layouts.abc(style)
            val q = rows.first { it.any { k -> k.label == "q" } }
            val a = rows.first { it.any { k -> k.label == "a" } }
            val z = rows.first { it.any { k -> k.label == "z" } }
            val enter = a.last().weight // the tall ⏎ also covers the z row
            assertEquals(Layouts.LETTER_ROW_UNITS.toDouble(), units(q), 0.01, "q row, $style")
            assertEquals(Layouts.LETTER_ROW_UNITS.toDouble(), units(a), 0.01, "a row, $style")
            assertEquals(Layouts.LETTER_ROW_UNITS.toDouble(), units(z) + enter, 0.01, "z row, $style")
            assertTrue(q.any { it.kind == KeyKind.MULTI }, "multi-key on the q row, $style")
        }
    }

    @Test fun holdingAKeyOffersCapitalsAccentsAndPunctuation() {
        val e = Alternates.forKey("e")
        assertEquals("E", e.first()); assertTrue("é" in e && "3" in e)
        assertEquals("e", Alternates.forKey("E", upper = true).first())
        assertTrue("É" in Alternates.forKey("E", upper = true))
        assertTrue("!" in Alternates.forKey("?") && "¿" in Alternates.forKey("?"))
        assertTrue("ñ" in Alternates.forKey("n"))
        assertTrue(Alternates.forKey("space").isEmpty())
    }

    @Test fun numberPadCanBePhoneOrTenKey() {
        assertEquals(listOf("1", "2", "3"), Layouts.numbers(PadLayout.PHONE)[0].take(3).map { it.label })
        assertEquals(listOf("7", "8", "9"), Layouts.numbers(PadLayout.TEN_KEY)[0].take(3).map { it.label })
    }

    @Test fun myColoursStayReadableAtEverySliderPosition() {
        for (h in 0 until 360 step 30) for (s in 0..100 step 25) for (b in 0..100 step 10) {
            val p = HerdTheme.custom(CustomColours(h, s, b))
            val where = "hue $h strength $s brightness $b"
            assertTrue(HerdTheme.contrast(p.text, p.surface) >= 4.5, "key text, $where")
            assertTrue(HerdTheme.contrast(p.text, p.sunk) >= 4.5, "function key text, $where")
            assertTrue(HerdTheme.contrast(p.onAccent, p.accent) >= 4.5, "mic, $where")
            assertTrue(HerdTheme.contrast(p.softInk, p.soft) >= 4.5, "suggestions, $where")
        }
    }
}

class WordsTest {
    private val en = WordList(java.io.File("../app/src/main/assets/words-en.txt").readLines())

    @Test fun autocorrectFixesClearSlipsOnly() {
        assertEquals("the", Autocorrect.fix("teh", en))
        assertEquals("The", Autocorrect.fix("Teh", en))
        assertEquals("hello", Autocorrect.fix("hrllo", en)) // r sits next to e
        assertEquals("don't", Autocorrect.fix("dont", en))
        assertEquals("I'm", Autocorrect.fix("im", en))
        assertEquals("I", Autocorrect.fix("i", en))
        assertNull(Autocorrect.fix("hello", en), "known words are left alone")
        assertNull(Autocorrect.fix("vcge", en, known = { it == "vcge" }), "the user's own words are left alone")
        assertNull(Autocorrect.fix("x7", en), "codes with numbers are left alone")
    }

    @Test fun swipeFindsTheWordAlongItsKeys() {
        // A simple key grid: letter rows 100 px apart, keys 100 px wide, offsets like a phone keyboard.
        val keys = HashMap<Char, Pt>()
        listOf("qwertyuiop" to 0f, "asdfghjkl" to 25f, "zxcvbnm" to 75f).forEachIndexed { r, (row, off) ->
            row.forEachIndexed { c, ch -> keys[ch] = Pt(off + c * 100f + 50f, r * 100f + 50f) }
        }
        val d = SwipeDecoder(keys, 100f, en)
        fun swipe(word: String): List<Pt> {
            // Wobble the finger a little around each key.
            val pts = ArrayList<Pt>()
            word.forEachIndexed { i, ch -> val k = keys[ch]!!; pts.add(Pt(k.x + (if (i % 2 == 0) 18f else -15f), k.y + 12f)) }
            return pts
        }
        for (w in listOf("hello", "keyboard", "the", "world", "thanks")) {
            val got = d.decode(swipe(w))
            assertTrue(w in got.take(2), "$w -> $got")
        }
    }

    @Test fun wordListSuggestsCommonWordsFirst() {
        assertEquals("the", en.words.first())
        assertTrue(en.complete("hel").contains("help"))
    }
}
