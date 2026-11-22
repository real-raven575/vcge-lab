package com.herdofhelpers.helperboard.core

/**
 * A key layout made in the Layout Lab page (testbench/www/layout-lab.html) and pasted into Settings.
 * Format: {"format":"helper-board-layout","version":1,"name":..,"rows":[{"h":48,"keys":[{"l","o","k","w","g"}]}]}
 * l = what the key shows, o = what it types, k = KeyKind name, w = width in letters, g = space before it,
 * m = a ✦ multi-key's items (tap types the first, hold shows all).
 * Optional "face":{"lx","ly","hx","hy"} places the letter and the hold mark on every key (see [KeyFace]).
 * A row shorter than the widest gets the rest as empty space at its end, the same as the Lab draws it.
 */
/**
 * Where the writing sits on every key, as parts of the key's width and height.
 * [lx], [ly]: the main letter's nudge from the middle (-0.35..0.35). [hx], [hy]: the centre of the small hold mark (0.1..0.9).
 */
data class KeyFace(val lx: Float = 0f, val ly: Float = 0f, val hx: Float = 0.8f, val hy: Float = 0.24f) {
    companion object {
        fun of(m: Map<*, *>?): KeyFace {
            fun f(k: String, d: Float, lo: Float, hi: Float) = ((m?.get(k) as? Double)?.toFloat() ?: d).coerceIn(lo, hi)
            val d = KeyFace()
            return KeyFace(f("lx", d.lx, -0.35f, 0.35f), f("ly", d.ly, -0.35f, 0.35f), f("hx", d.hx, 0.1f, 0.9f), f("hy", d.hy, 0.1f, 0.9f))
        }
    }
}

data class LabLayout(
    val name: String, val rows: List<List<Key>>, val heightsDp: List<Int>, val face: KeyFace = KeyFace(),
) {
    val widest: Float get() = rows.maxOf { units(it) }

    companion object {
        const val FORMAT = "helper-board-layout"
        private val ALLOWED = setOf(
            KeyKind.CHAR, KeyKind.MULTI, KeyKind.SHIFT, KeyKind.BACKSPACE, KeyKind.ENTER, KeyKind.SPACE, KeyKind.MIC,
            KeyKind.LEFT, KeyKind.RIGHT, KeyKind.UNDO, KeyKind.CAPS_LOCK, KeyKind.MODE_NUMBERS, KeyKind.MODE_SYMBOLS,
            KeyKind.MODE_EMOJI, KeyKind.MODE_TAKES, KeyKind.SETTINGS,
        )

        fun units(row: List<Key>): Float = row.sumOf { (it.weight + it.gap).toDouble() }.toFloat()

        /** Reads Lab code. Returns the layout, or a plain-words reason it can't be used. */
        fun parse(text: String): Result<LabLayout> = runCatching {
            val top = MiniJson(text.trim()).read() as? Map<*, *> ?: fail("That isn't Layout Lab code.")
            if (top["format"] != FORMAT) fail("That isn't Layout Lab code.")
            val rowsIn = top["rows"] as? List<*> ?: fail("The code has no rows.")
            if (rowsIn.isEmpty() || rowsIn.size > 10) fail("A layout needs 1 to 10 rows.")
            val heights = mutableListOf<Int>()
            val rows = rowsIn.mapIndexed { r, rowAny ->
                val row = rowAny as? Map<*, *> ?: fail("Row ${r + 1} is broken.")
                heights += ((row["h"] as? Double) ?: 48.0).toInt().coerceIn(28, 80)
                val keys = row["keys"] as? List<*> ?: fail("Row ${r + 1} has no keys.")
                if (keys.isEmpty() || keys.size > 20) fail("Row ${r + 1} needs 1 to 20 keys.")
                keys.map { kAny ->
                    val k = kAny as? Map<*, *> ?: fail("A key in row ${r + 1} is broken.")
                    val kind = runCatching { KeyKind.valueOf(k["k"] as String) }.getOrNull()
                        ?.takeIf { it in ALLOWED } ?: fail("Row ${r + 1} has a key kind Helper Board doesn't know.")
                    val label = (k["l"] as? String)?.take(12) ?: ""
                    val out = (k["o"] as? String)?.take(24) ?: ""
                    if (kind == KeyKind.CHAR && out.isEmpty()) fail("A letter key in row ${r + 1} types nothing.")
                    val items = (k["m"] as? List<*>)?.filterIsInstance<String>()?.map { it.take(12) }?.filter { it.isNotEmpty() }
                        ?.take(12)?.takeIf { kind == KeyKind.MULTI && it.isNotEmpty() }
                    Key(
                        label = label, output = items?.first() ?: if (kind == KeyKind.CHAR || kind == KeyKind.MULTI) out else label,
                        items = items,
                        weight = ((k["w"] as? Double) ?: 1.0).toFloat().coerceIn(0.5f, 6f), kind = kind,
                        gap = ((k["g"] as? Double) ?: 0.0).toFloat().coerceIn(0f, 3f),
                    )
                }
            }
            val all = rows.flatten().map { it.kind }.toSet()
            for ((need, words) in listOf(KeyKind.BACKSPACE to "⌫", KeyKind.ENTER to "⏎", KeyKind.SPACE to "space"))
                if (need !in all) fail("The layout needs a $words key.")
            LabLayout((top["name"] as? String)?.take(40) ?: "My layout", rows, heights, KeyFace.of(top["face"] as? Map<*, *>))
        }

        private fun fail(why: String): Nothing = throw IllegalArgumentException(why)
    }
}

/** A small JSON reader (objects, arrays, strings, numbers, true/false/null), so the core stays free of Android. */
internal class MiniJson(private val s: String) {
    private var i = 0
    fun read(): Any? { val v = value(); ws(); require(i == s.length) { "extra text" }; return v }
    private fun ws() { while (i < s.length && s[i].isWhitespace()) i++ }
    private fun value(): Any? {
        ws(); require(i < s.length) { "end of text" }
        return when (s[i]) {
            '{' -> obj()
            '[' -> arr()
            '"' -> str()
            't' -> word("true", true)
            'f' -> word("false", false)
            'n' -> word("null", null)
            else -> { val st = i; while (i < s.length && s[i] in "-+.eE0123456789") i++; s.substring(st, i).toDouble() }
        }
    }
    private fun obj(): Map<String, Any?> {
        i++; val m = LinkedHashMap<String, Any?>(); ws()
        if (s[i] == '}') { i++; return m }
        while (true) {
            ws(); val k = str(); ws(); require(s[i++] == ':'); m[k] = value(); ws()
            if (s[i] == ',') i++ else { require(s[i++] == '}'); return m }
        }
    }
    private fun arr(): List<Any?> {
        i++; val l = ArrayList<Any?>(); ws()
        if (s[i] == ']') { i++; return l }
        while (true) { l += value(); ws(); if (s[i] == ',') i++ else { require(s[i++] == ']'); return l } }
    }
    private fun word(w: String, v: Any?): Any? { require(s.startsWith(w, i)); i += w.length; return v }
    private fun str(): String {
        require(s[i++] == '"'); val b = StringBuilder()
        while (true) {
            val c = s[i++]
            when (c) {
                '"' -> return b.toString()
                '\\' -> when (val e = s[i++]) {
                    'n' -> b.append('\n'); 't' -> b.append('\t'); 'r' -> b.append('\r'); 'b' -> b.append('\b'); 'f' -> b.append('\u000C')
                    'u' -> { b.append(s.substring(i, i + 4).toInt(16).toChar()); i += 4 }
                    else -> b.append(e)
                }
                else -> b.append(c)
            }
        }
    }
}
