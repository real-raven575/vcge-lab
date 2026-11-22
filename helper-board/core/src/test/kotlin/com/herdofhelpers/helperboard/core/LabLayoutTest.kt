package com.herdofhelpers.helperboard.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class LabLayoutTest {
    private val standard = javaClass.getResource("/lab-standard.json")!!.readText()

    @Test fun readsTheLabsOwnStandardLayout() {
        val lab = LabLayout.parse(standard).getOrThrow()
        assertEquals(6, lab.rows.size)
        assertEquals(KeyKind.BACKSPACE, lab.rows[1].last().kind)
        assertEquals(KeyKind.ENTER, lab.rows[3].last().kind)
        assertEquals("q", lab.rows[2][0].output)
        assertEquals(12.9f, lab.widest, 0.05f)
    }

    @Test fun saysWhyBadCodeCantBeUsed() {
        assertTrue(LabLayout.parse("hello").isFailure)
        val noEnter = standard.replace("\"ENTER\"", "\"UNDO\"")
        assertEquals("The layout needs a ⏎ key.", LabLayout.parse(noEnter).exceptionOrNull()?.message)
        val badKind = standard.replace("\"BACKSPACE\"", "\"HACK\"")
        assertTrue(LabLayout.parse(badKind).exceptionOrNull()!!.message!!.contains("doesn't know"))
    }

    @Test fun keepsGapsAndClampsSizes() {
        val t = """{"format":"helper-board-layout","version":1,"name":"t","rows":[{"h":200,"keys":[
            {"l":"a","o":"a","k":"CHAR","w":99,"g":1.5},{"l":"⌫","o":"","k":"BACKSPACE","w":1,"g":0},
            {"l":"⏎","o":"","k":"ENTER","w":1,"g":0},{"l":"space","o":"","k":"SPACE","w":4,"g":0}]}]}"""
        val lab = LabLayout.parse(t).getOrThrow()
        assertEquals(80, lab.heightsDp[0])
        assertEquals(6f, lab.rows[0][0].weight)
        assertEquals(1.5f, lab.rows[0][0].gap)
        assertEquals(" ", Key(" ").output)
    }

    @Test fun readsWhereTheLetterAndHoldMarkSit() {
        assertEquals(KeyFace(), LabLayout.parse(standard).getOrThrow().face)
        val moved = standard.replaceFirst("\"rows\"", "\"face\": {\"lx\": 0.1, \"ly\": 0.9, \"hx\": 0.2, \"hy\": 0.15},\n \"rows\"")
        assertEquals(KeyFace(0.1f, 0.35f, 0.2f, 0.15f), LabLayout.parse(moved).getOrThrow().face)
    }

    @Test fun aMultiKeyCarriesItsOwnItems() {
        val withItems = standard.replace("\"k\": \"MULTI\",", "\"k\": \"MULTI\", \"m\": [\"lol\", \"\", \"🙂\"],")
        val multi = LabLayout.parse(withItems).getOrThrow().rows.flatten().first { it.kind == KeyKind.MULTI }
        assertEquals(listOf("lol", "🙂"), multi.items)
        assertEquals("lol", multi.output)
    }
}
