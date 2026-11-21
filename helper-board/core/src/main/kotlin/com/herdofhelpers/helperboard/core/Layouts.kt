package com.herdofhelpers.helperboard.core

enum class NumberStyle { ROW, GRID, OFF }

/** The number pad: a phone's 1-2-3 on top, or a calculator / 10-key's 7-8-9 on top (raven575, 11-21). */
enum class PadLayout(val label: String) { PHONE("Phone (1 2 3 on top)"), TEN_KEY("10-key (7 8 9 on top)") }

enum class Mode { ABC, NUMBERS, SYMBOLS, TAKES, EMOJI }

enum class KeyKind {
    CHAR, MULTI, SHIFT, BACKSPACE, ENTER, SPACE, MIC, LEFT, RIGHT, UNDO, CAPS_LOCK,
    MODE_ABC, MODE_NUMBERS, MODE_SYMBOLS, MODE_TAKES, MODE_EMOJI, SETTINGS, SWITCH_KEYBOARD, HIDE,
}

/** [rows] = 2 makes a tall key: it ends its row and also covers the end of the row below (the big ⏎). */
data class Key(
    val label: String, val output: String = label, val weight: Float = 1f, val kind: KeyKind = KeyKind.CHAR, val rows: Int = 1,
)

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

    /** The same bottom row in every mode, so the space bar never changes width (T1). ⏎ lives up in the keys. */
    private fun bottomRow(modeKey: Key) = listOf(
        modeKey,
        Key("↶", kind = KeyKind.UNDO),
        Key("◀", kind = KeyKind.LEFT),
        Key("space", " ", SPACE_WEIGHT, KeyKind.SPACE),
        Key("▶", kind = KeyKind.RIGHT),
        Key("🎙", kind = KeyKind.MIC, weight = 1.5f),
    )

    /** ⌫ is always a bit wider than a letter (raven575: 120 to 150 %), so it is easy to find and hit. */
    const val BACKSPACE_WEIGHT = 1.4f
    private val backspace get() = Key("⌫", kind = KeyKind.BACKSPACE, weight = BACKSPACE_WEIGHT)
    /** The big ⏎: two rows tall at the right edge, where ' and ⌫ used to be, so it's hard to miss (raven575, 11-20). */
    private val bigEnter get() = Key("⏎", kind = KeyKind.ENTER, weight = 1.6f, rows = 2)

    /**
     * The programmable multi-key ✦ (raven575, 11-21): tap types its first item, hold shows all of them.
     * The user sets the items in Settings.
     */
    const val MULTI_WEIGHT = 1.6f
    fun multiKey(items: List<String>): Key {
        val first = items.firstOrNull() ?: "✦"
        return Key("✦$first", first, MULTI_WEIGHT, KeyKind.MULTI)
    }
    val DEFAULT_MULTI = listOf(":)", "/", "#", "&", "*", "(", ")", ";", ":", "…")

    /** Every letter row adds up to the same width, so letters are the same size in every row (raven575, 11-21). */
    const val LETTER_ROW_UNITS = 12.9f

    fun abc(numbers: NumberStyle, myRow: List<Key> = DEFAULT_MY_ROW, multi: List<String> = DEFAULT_MULTI): List<List<Key>> = buildList {
        if (myRow.isNotEmpty()) add(myRow)
        // ⌫ sits right after 0; with no number row it ends the top letter row instead.
        // The q row's spare room (it has only 10 letters) holds "!" and the ✦ multi-key, which sits above ⏎.
        if (numbers == NumberStyle.ROW) {
            add(chars("1234567890") + backspace)
            add(chars("qwertyuiop") + Key("!", weight = 1.3f) + multiKey(multi))
        } else add(chars("qwertyuiop") + Key("⌫", kind = KeyKind.BACKSPACE, weight = 1.3f) + multiKey(multi))
        // , . - ? ' live among the letters now, not in a row of their own.
        add(chars("asdfghjkl") + listOf(Key("'", weight = 1.15f), Key("-", weight = 1.15f), bigEnter))
        add(listOf(Key("⇧", kind = KeyKind.SHIFT, weight = 1.3f)) + chars("zxcvbnm") + listOf(Key(","), Key("."), Key("?")))
        add(bottomRow(Key("123", kind = KeyKind.MODE_NUMBERS, weight = 1.2f)))
    }

    /** Phone-style keypad grid with the common number symbols beside it. */
    fun numbers(pad: PadLayout = PadLayout.PHONE): List<List<Key>> = listOf(
        chars(if (pad == PadLayout.PHONE) "123" else "789") + listOf(Key("+"), Key("%")),
        chars("456") + listOf(Key("-"), Key("$")),
        chars(if (pad == PadLayout.PHONE) "789" else "123") + listOf(Key("*"), Key("/")),
        listOf(Key(","), Key("0"), Key("."), Key("="), backspace, Key("⏎", kind = KeyKind.ENTER, weight = 1.4f)),
        bottomRow(Key("ABC", kind = KeyKind.MODE_ABC, weight = 1.2f)),
    )

    fun symbols(): List<List<Key>> = listOf(
        chars("!@#&*()_"),
        chars("\"':;/\\|~"),
        chars("<>[]{}^`") ,
        listOf(Key("¿"), Key("€"), Key("ñ"), Key("£"), Key("¡"), backspace, Key("⏎", kind = KeyKind.ENTER, weight = 1.4f)),
        bottomRow(Key("ABC", kind = KeyKind.MODE_ABC, weight = 1.2f)),
    )

    /** The mode strip, with or without the emoji tab. */
    fun modeStrip(showEmoji: Boolean): List<Key> = MODE_STRIP.filter { showEmoji || it.kind != KeyKind.MODE_EMOJI }

    /**
     * Emoji page keys: only ⌫ and ⏎ under the emoji window, then the usual bottom row. The emoji themselves are a big
     * scrolling window with groups, recents and search (EmojiBook), drawn by the keyboard.
     */
    fun emoji(): List<List<Key>> = listOf(
        listOf(Key("⌫", kind = KeyKind.BACKSPACE, weight = BACKSPACE_WEIGHT), Key("⏎", kind = KeyKind.ENTER, weight = BACKSPACE_WEIGHT)),
        bottomRow(Key("ABC", kind = KeyKind.MODE_ABC, weight = 1.2f)),
    )

    /** Most recent first, no repeats, at most [max]. */
    fun rememberEmoji(recent: List<String>, used: String, max: Int = EmojiBook.DEFAULT_RECENT): List<String> =
        (listOf(used) + recent.filter { it != used }).take(max)

    fun forMode(
        mode: Mode, numbers: NumberStyle, myRow: List<Key> = DEFAULT_MY_ROW,
        pad: PadLayout = PadLayout.PHONE, multi: List<String> = DEFAULT_MULTI,
    ): List<List<Key>> = when (mode) {
        Mode.ABC, Mode.TAKES -> abc(numbers, myRow, multi)
        Mode.NUMBERS -> numbers(pad)
        Mode.SYMBOLS -> symbols()
        Mode.EMOJI -> emoji()
    }
}
