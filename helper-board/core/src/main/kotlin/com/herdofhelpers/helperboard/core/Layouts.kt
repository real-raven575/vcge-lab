package com.herdofhelpers.helperboard.core

enum class NumberStyle { ROW, GRID, OFF }

enum class Mode { ABC, NUMBERS, SYMBOLS, TAKES, EMOJI }

enum class KeyKind {
    CHAR, SHIFT, BACKSPACE, ENTER, SPACE, MIC, LEFT, RIGHT, UNDO, CAPS_LOCK,
    MODE_ABC, MODE_NUMBERS, MODE_SYMBOLS, MODE_TAKES, MODE_EMOJI, SETTINGS, SWITCH_KEYBOARD, HIDE,
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
        // Emoji one tap away (raven575, 11-20); the user can hide this tab in settings.
        Key("😀", kind = KeyKind.MODE_EMOJI, weight = 0.7f),
        Key("🎙 Takes", kind = KeyKind.MODE_TAKES),
        // One tap straight to Helper Board's own settings (first phone test: the phone's keyboard menu is a maze).
        Key("⚙", kind = KeyKind.SETTINGS, weight = 0.6f),
        // The phone's own switch and hide buttons, inside the keyboard, so the phone's bar under it can be turned off.
        Key("🌐", kind = KeyKind.SWITCH_KEYBOARD, weight = 0.6f),
        Key("⌄", kind = KeyKind.HIDE, weight = 0.6f),
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

    /** The mode strip, with or without the emoji tab. */
    fun modeStrip(showEmoji: Boolean): List<Key> = MODE_STRIP.filter { showEmoji || it.kind != KeyKind.MODE_EMOJI }

    /** 48 everyday emoji, 6 rows of 8, Herd animals included. Space-separated because one emoji can be several chars. */
    val EMOJI = ("😀 😂 🥲 😊 😍 😘 😎 🤔 😅 😭 😡 😴 🙂 🙃 😬 🤗 " +
        "👍 👎 👏 🙏 💪 👋 🤝 ✌️ ❤️ 💔 🔥 ✨ 🎉 ✅ ❌ ⚠️ " +
        "⭐ 💯 🐘 🦒 🐢 🦝 ☕ 🍕 🎂 🚗 🏠 💼 📞 📅 ⏰ 💊").split(" ")

    /** Emoji keys: the user's recent ones first (kept on the phone only), then the everyday set. */
    fun emoji(recent: List<String> = emptyList()): List<List<Key>> = buildList {
        if (recent.isNotEmpty()) add(recent.take(8).map { Key(it) })
        val rows = EMOJI.chunked(8)
        rows.forEachIndexed { i, row ->
            // ⌫ ends the last emoji row; the only space bar is the usual one below (same width everywhere, T1).
            add(row.map { Key(it) } + if (i == rows.lastIndex) listOf(Key("⌫", kind = KeyKind.BACKSPACE, weight = 1.3f)) else emptyList())
        }
        add(bottomRow(Key("ABC", kind = KeyKind.MODE_ABC, weight = 1.2f)))
    }

    /** Most recent first, no repeats, at most [max]. */
    fun rememberEmoji(recent: List<String>, used: String, max: Int = 8): List<String> =
        (listOf(used) + recent.filter { it != used }).take(max)

    fun forMode(
        mode: Mode, numbers: NumberStyle, myRow: List<Key> = DEFAULT_MY_ROW, recentEmoji: List<String> = emptyList(),
    ): List<List<Key>> = when (mode) {
        Mode.ABC, Mode.TAKES -> abc(numbers, myRow)
        Mode.NUMBERS -> numbers()
        Mode.SYMBOLS -> symbols()
        Mode.EMOJI -> emoji(recentEmoji)
    }
}
