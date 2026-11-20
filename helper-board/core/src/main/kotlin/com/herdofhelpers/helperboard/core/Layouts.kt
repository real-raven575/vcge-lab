package com.herdofhelpers.helperboard.core

enum class NumberStyle { ROW, GRID, OFF }

enum class Mode { ABC, NUMBERS, SYMBOLS, TAKES }

enum class KeyKind {
    CHAR, SHIFT, BACKSPACE, ENTER, SPACE, MIC, LEFT, RIGHT, UNDO, CAPS_LOCK,
    MODE_ABC, MODE_NUMBERS, MODE_SYMBOLS, MODE_TAKES,
}

data class Key(val label: String, val output: String = label, val weight: Float = 1f, val kind: KeyKind = KeyKind.CHAR)

/**
 * Key layouts. Rules from testers: the space bar is the same width in every mode and every kind of text box (T1);
 * "?" and "!" never sit next to each other (T9); numbers can be a row, a phone keypad grid, or off (T6).
 */
object Layouts {
    const val SPACE_WEIGHT = 4f

    /** Modes shown on the always-visible strip above the keys. */
    val MODE_STRIP = listOf(
        Key("ABC", kind = KeyKind.MODE_ABC),
        Key("123", kind = KeyKind.MODE_NUMBERS),
        Key("#+=", kind = KeyKind.MODE_SYMBOLS),
        Key("🎙 Takes", kind = KeyKind.MODE_TAKES),
    )

    /** Default "my row" (raven575, 2026-11-20): @ · .com · caps lock · keypad. */
    val DEFAULT_MY_ROW = listOf(
        Key("@"),
        Key(".com"),
        Key("⇪ caps", kind = KeyKind.CAPS_LOCK),
        Key("🔢 pad", kind = KeyKind.MODE_NUMBERS),
    )

    private fun chars(s: String) = s.map { Key(it.toString()) }

    private fun bottomRow(modeKey: Key) = listOf(
        modeKey,
        Key("↶", kind = KeyKind.UNDO),
        Key("◀", kind = KeyKind.LEFT),
        Key("space", " ", SPACE_WEIGHT, KeyKind.SPACE),
        Key("▶", kind = KeyKind.RIGHT),
        Key("🎙", kind = KeyKind.MIC, weight = 1.2f),
        Key("⏎", kind = KeyKind.ENTER, weight = 1.3f),
    )

    fun abc(numbers: NumberStyle, myRow: List<Key> = DEFAULT_MY_ROW): List<List<Key>> = buildList {
        if (myRow.isNotEmpty()) add(myRow)
        if (numbers == NumberStyle.ROW) add(chars("1234567890"))
        add(chars("qwertyuiop"))
        add(chars("asdfghjkl") + Key("'"))
        add(listOf(Key("⇧", kind = KeyKind.SHIFT, weight = 1.3f)) + chars("zxcvbnm") +
            listOf(Key("⌫", kind = KeyKind.BACKSPACE, weight = 1.3f)))
        add(listOf(Key(","), Key("."), Key("-"), Key("?")))
        add(bottomRow(Key("123", kind = KeyKind.MODE_NUMBERS, weight = 1.2f)))
    }

    /** Phone-style keypad grid with the common number symbols beside it. */
    fun numbers(): List<List<Key>> = listOf(
        chars("123") + listOf(Key("+"), Key("%")),
        chars("456") + listOf(Key("-"), Key("$")),
        chars("789") + listOf(Key("*"), Key("/")),
        listOf(Key(","), Key("0"), Key("."), Key("="), Key("⌫", kind = KeyKind.BACKSPACE)),
        bottomRow(Key("ABC", kind = KeyKind.MODE_ABC, weight = 1.2f)),
    )

    fun symbols(): List<List<Key>> = listOf(
        chars("!@#&*()_"),
        chars("\"':;/\\|~"),
        chars("<>[]{}^`") ,
        listOf(Key("¿"), Key("€"), Key("ñ"), Key("£"), Key("¡"), Key("⌫", kind = KeyKind.BACKSPACE)),
        bottomRow(Key("ABC", kind = KeyKind.MODE_ABC, weight = 1.2f)),
    )

    fun forMode(mode: Mode, numbers: NumberStyle, myRow: List<Key> = DEFAULT_MY_ROW): List<List<Key>> = when (mode) {
        Mode.ABC, Mode.TAKES -> abc(numbers, myRow)
        Mode.NUMBERS -> numbers()
        Mode.SYMBOLS -> symbols()
    }
}
