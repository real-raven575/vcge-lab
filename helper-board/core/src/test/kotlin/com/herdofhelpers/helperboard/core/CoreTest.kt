package com.herdofhelpers.helperboard.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

private const val D = Retention.DAY_MS

class RetentionTest {
    private val now = 100 * D

    @Test fun freshTakeStays() {
        assertTrue(Retention.plan(listOf(TakeMeta("a", now - 6 * D, 10)), now).isEmpty())
    }

    @Test fun untouchedTakeGoesToTrashAfterSevenDays() {
        assertEquals(listOf<RetentionAction>(RetentionAction.MoveToTrash("a")),
            Retention.plan(listOf(TakeMeta("a", now - 7 * D, 10)), now))
    }

    @Test fun touchingATakeRestartsItsClock() {
        val t = TakeMeta("a", now - 30 * D, 10, lastTouchedMs = now - 2 * D)
        assertTrue(Retention.plan(listOf(t), now).isEmpty())
    }

    @Test fun trashEmptiesAfterFourteenDays() {
        val t = TakeMeta("a", now - 40 * D, 10, trashedAtMs = now - 14 * D)
        assertEquals(listOf<RetentionAction>(RetentionAction.Purge("a")), Retention.plan(listOf(t), now))
        val newer = t.copy(trashedAtMs = now - 13 * D)
        assertTrue(Retention.plan(listOf(newer), now).isEmpty())
    }

    @Test fun keptTakesAreNeverRemoved() {
        val kept = TakeMeta("k", now - 400 * D, 900, kept = true)
        val actions = Retention.plan(listOf(kept), now, RetentionSettings(storageCapBytes = 1))
        assertTrue(actions.isEmpty())
    }

    @Test fun capEmptiesTrashFirstThenOldestUntouched() {
        val takes = listOf(
            TakeMeta("trash", now - 20 * D, 100, trashedAtMs = now - 3 * D),
            TakeMeta("old", now - 5 * D, 100),
            TakeMeta("newer", now - 3 * D, 100),
            TakeMeta("kept", now - 50 * D, 100, kept = true),
        )
        val actions = Retention.plan(takes, now, RetentionSettings(storageCapBytes = 250))
        assertEquals(listOf<RetentionAction>(RetentionAction.Purge("trash"), RetentionAction.Purge("old")), actions)
    }

    @Test fun capNeverRemovesATakeFromToday() {
        val takes = listOf(TakeMeta("today", now - 1000, 500))
        assertTrue(Retention.plan(takes, now, RetentionSettings(storageCapBytes = 10)).isEmpty())
    }

    @Test fun heavyUserCanShortenTimes() {
        val s = RetentionSettings(keepDays = 2, trashDays = 3)
        assertEquals(listOf<RetentionAction>(RetentionAction.MoveToTrash("a")),
            Retention.plan(listOf(TakeMeta("a", now - 2 * D, 1)), now, s))
    }
}

class FieldPolicyTest {
    private val text = 0x1
    private val password = 0x1 or 0x80
    private val webPassword = 0x1 or 0xe0
    private val visiblePassword = 0x1 or 0x90
    private val pin = 0x2 or 0x10
    private val url = 0x1 or 0x10
    private val email = 0x1 or 0x20

    @Test fun normalTextLearnsAndSaves() {
        val p = FieldPolicy.from(text, 0)
        assertTrue(p.learnWords); assertTrue(p.saveTakes); assertFalse(p.isPrivate)
    }

    @Test fun passwordsAreNeverLearnedByDefault() {
        for (t in listOf(password, webPassword, visiblePassword, pin)) {
            val p = FieldPolicy.from(t, 0)
            assertTrue(p.isPrivate, "type $t"); assertFalse(p.learnWords); assertFalse(p.saveTakes)
        }
    }

    @Test fun incognitoBoxesAreNeverLearnedByDefault() {
        val p = FieldPolicy.from(text, FieldPolicy.IME_FLAG_NO_PERSONALIZED_LEARNING)
        assertTrue(p.isPrivate); assertFalse(p.learnWords); assertFalse(p.saveTakes)
    }

    @Test fun savingInPrivateBoxesIsOptIn() {
        val p = FieldPolicy.from(password, 0, allowPrivateSaving = true)
        assertTrue(p.isPrivate); assertTrue(p.learnWords); assertTrue(p.saveTakes)
    }

    @Test fun webAndEmailBoxesAreRecognised() {
        assertTrue(FieldPolicy.from(url, 0).isWebOrEmail)
        assertTrue(FieldPolicy.from(email, 0).isWebOrEmail)
        assertFalse(FieldPolicy.from(text, 0).isWebOrEmail)
    }
}

class ShiftKeyTest {
    @Test fun tapGivesOneCapitalThenOff() {
        val s = ShiftKey()
        assertEquals(Shift.ONCE, s.tap(0))
        assertEquals("A", s.apply("a")); s.afterLetter()
        assertEquals(Shift.OFF, s.state)
    }

    @Test fun doubleTapLocksAndLockSurvivesLetters() {
        val s = ShiftKey()
        s.tap(0); assertEquals(Shift.LOCKED, s.tap(200))
        s.afterLetter(); assertEquals(Shift.LOCKED, s.state)
        assertEquals(Shift.OFF, s.tap(5000))
    }

    @Test fun slowSecondTapTurnsOff() {
        val s = ShiftKey()
        s.tap(0); assertEquals(Shift.OFF, s.tap(1000))
    }

    @Test fun autoCapNeverBreaksCapsLock() {
        val s = ShiftKey(); s.lock(); s.setAutoCap(false)
        assertEquals(Shift.LOCKED, s.state)
    }
}

class LayoutsTest {
    private fun allLayouts() = NumberStyle.entries.flatMap { n -> Mode.entries.map { Layouts.forMode(it, n) } }

    @Test fun spaceBarIsTheSameWidthEverywhere() {
        for (layout in allLayouts()) {
            val spaces = layout.flatten().filter { it.kind == KeyKind.SPACE }
            assertEquals(1, spaces.size)
            assertEquals(Layouts.SPACE_WEIGHT, spaces.single().weight)
            val row = layout.first { r -> r.any { it.kind == KeyKind.SPACE } }
            assertEquals(row.sumOf { it.weight.toDouble() }, layout.last().sumOf { it.weight.toDouble() })
        }
    }

    @Test fun questionAndExclamationNeverTouch() {
        for (layout in allLayouts()) for (row in layout) {
            row.zipWithNext().forEach { (a, b) ->
                assertFalse(setOf(a.output, b.output) == setOf("?", "!"), "neighbours ${a.label} ${b.label}")
                assertFalse(setOf(a.output, b.output) == setOf("¿", "¡"), "neighbours ${a.label} ${b.label}")
            }
        }
    }

    @Test fun numberRowOnlyWhenChosen() {
        val digits = "1234567890".map { it.toString() }
        assertTrue(Layouts.abc(NumberStyle.ROW).any { r -> r.map { it.output } == digits })
        assertFalse(Layouts.abc(NumberStyle.GRID).any { r -> r.map { it.output } == digits })
        assertFalse(Layouts.abc(NumberStyle.OFF).any { r -> r.map { it.output } == digits })
    }

    @Test fun keypadIsAPhoneGrid() {
        val grid = Layouts.numbers().take(3).map { r -> r.take(3).joinToString("") { it.output } }
        assertEquals(listOf("123", "456", "789"), grid)
    }

    @Test fun defaultMyRowIsRavensPick() {
        assertEquals(listOf("@", ".com", "⇪ caps", "🔢 pad"), Layouts.DEFAULT_MY_ROW.map { it.label })
        assertEquals(Layouts.DEFAULT_MY_ROW, Layouts.abc(NumberStyle.OFF).first())
    }

    @Test fun everyLayoutHasMicAndBackspace() {
        for (layout in allLayouts()) {
            val kinds = layout.flatten().map { it.kind }
            assertTrue(KeyKind.MIC in kinds); assertTrue(KeyKind.BACKSPACE in kinds)
        }
    }
}

class PersonalDictionaryTest {
    @Test fun approvedWordsAreKnownInAnyCase() {
        val d = PersonalDictionary(); d.approve("Herd")
        assertTrue(d.isKnown("herd")); assertTrue(d.isKnown("HERD"))
    }

    @Test fun offeredWordsWaitForApproval() {
        val d = PersonalDictionary(); d.offer("vCGE")
        assertFalse(d.isKnown("vCGE")); assertEquals(listOf("vCGE"), d.pending)
        d.approve("vCGE"); assertTrue(d.pending.isEmpty()); assertTrue(d.isKnown("vcge"))
    }

    @Test fun rejectedWordsAreDropped() {
        val d = PersonalDictionary(); d.offer("teh"); d.reject("teh")
        assertTrue(d.pending.isEmpty()); assertFalse(d.isKnown("teh"))
    }

    @Test fun completionsComeOnlyFromSavedWords() {
        val d = PersonalDictionary(); listOf("Cornerstone", "Corn", "Cornbread").forEach(d::approve)
        assertEquals(listOf("Corn", "Cornbread", "Cornerstone"), d.complete("cor"))
        assertEquals(listOf("Cornbread", "Cornerstone"), d.complete("corn"))
        assertTrue(d.complete("x").isEmpty())
    }

    @Test fun surviveSaveAndLoad() {
        val d = PersonalDictionary(); d.approve("Milestone"); d.offer("Encore")
        val back = PersonalDictionary.parse(d.serialize())
        assertEquals(listOf("Milestone"), back.words); assertEquals(listOf("Encore"), back.pending)
    }

    @Test fun currentWordFindsTheWordBeforeTheCursor() {
        assertEquals("world", PersonalDictionary.currentWord("hello world"))
        assertEquals("", PersonalDictionary.currentWord("hello "))
        assertEquals("don't", PersonalDictionary.currentWord("I don't"))
    }

    @Test fun numbersAreNeverOffered() {
        val d = PersonalDictionary(); d.offer("a1b2"); d.offer("x")
        assertTrue(d.pending.isEmpty())
    }
}

class WavTest {
    @Test fun headerDescribesSixteenKilohertzMono() {
        val h = Wav.header(32_000)
        assertEquals(44, h.size)
        assertEquals("RIFF", String(h, 0, 4, Charsets.US_ASCII))
        assertEquals("data", String(h, 36, 4, Charsets.US_ASCII))
        fun int(at: Int) = (h[at].toInt() and 0xff) or ((h[at + 1].toInt() and 0xff) shl 8) or
            ((h[at + 2].toInt() and 0xff) shl 16) or ((h[at + 3].toInt() and 0xff) shl 24)
        assertEquals(36 + 32_000, int(4)); assertEquals(16_000, int(24)); assertEquals(32_000, int(40))
        assertEquals(1L, Wav.seconds(32_000))
    }
}
