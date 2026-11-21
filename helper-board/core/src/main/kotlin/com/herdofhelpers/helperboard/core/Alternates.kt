package com.herdofhelpers.helperboard.core

/**
 * Hold a key for more choices (raven575, 11-21): the other case first, then accented letters, then symbols and
 * punctuation. The q row also offers its number, so digits are one hold away when the number row is off.
 */
object Alternates {
    private val extra = mapOf(
        "a" to "àáâäãåæª@", "b" to "", "c" to "ç©", "d" to "ð", "e" to "èéêëē€", "f" to "", "g" to "", "h" to "",
        "i" to "ìíîïī", "j" to "", "k" to "", "l" to "£", "m" to "µ", "n" to "ñ", "o" to "òóôöõøœº", "p" to "¶",
        "q" to "", "r" to "®", "s" to "ß$§", "t" to "™þ", "u" to "ùúûüū", "v" to "", "w" to "", "x" to "×",
        "y" to "ýÿ¥", "z" to "ž",
    )
    private val rowNumbers = mapOf("q" to "1", "w" to "2", "e" to "3", "r" to "4", "t" to "5", "y" to "6",
        "u" to "7", "i" to "8", "o" to "9", "p" to "0")
    private val punctuation = mapOf(
        "," to listOf(";", ":", "„", "‚"),
        "." to listOf("…", "·", "•", ":"),
        "?" to listOf("!", "¿", "¡", "‽"),
        "!" to listOf("¡", "‼", "?"),
        "'" to listOf("\"", "`", "‘", "’", "“", "”", "«", "»"),
        "-" to listOf("_", "–", "—", "~", "+", "="),
        "@" to listOf("#", "&", "_"),
        ".com" to listOf(".net", ".org", ".edu", ".gov", ".co.uk", ".mx", ".es"),
        "1" to listOf("¹", "½", "⅓", "¼"), "2" to listOf("²", "⅔"), "3" to listOf("³", "¾"),
        "0" to listOf("°", "∅"), "$" to listOf("€", "£", "¥", "¢"), "%" to listOf("‰"),
        "*" to listOf("×", "•"), "/" to listOf("÷", "\\"), "+" to listOf("±"), "=" to listOf("≠", "≈"),
    )

    /** The choices for a key whose label is [label]. [upper]: the keyboard is showing capitals right now. */
    fun forKey(label: String, upper: Boolean = false): List<String> {
        punctuation[label]?.let { return it }
        if (label.length != 1 || !label[0].isLetter()) return emptyList()
        val lower = label.lowercase()
        val other = if (upper) lower else lower.uppercase()
        val accents = (extra[lower] ?: "").map { it.toString() }
            .map { if (upper && it[0].isLetter()) it.uppercase() else it }
        return (listOf(other) + listOfNotNull(rowNumbers[lower]) + accents).distinct()
    }
}
