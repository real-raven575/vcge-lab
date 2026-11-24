package com.herdofhelpers.helperboard.core

/**
 * "Say it, spell it once" (raven575, 11-23/24: a name the voice kept mishearing nearly put the wrong email address on
 * a draft). The person teaches a word once: how it sounds ("Alex") and how it is spelled ("Aleks"). Dictated words
 * are then compared by sound:
 *  - a sure match (the taught word itself, or the same sounds and vowels) is typed the taught way;
 *  - a near match (same consonants with other vowels, or one sound apart) is left alone and offered as a
 *    "Did you mean…?" choice, because it might be a different name.
 * Examples use made-up names only; the person's real list stays on the phone.
 */
class SpellOnce(entries: List<Pair<String, String>>) {
    data class Entry(val soundsLike: String, val spelled: String) {
        internal val keys = setOf(soundKey(soundsLike), soundKey(spelled)).filter { it.isNotEmpty() }.toSet()
    }
    data class Result(val text: String, val changed: List<Pair<String, String>>, val askAbout: List<Pair<String, String>>)

    val entries = entries.filter { it.first.isNotBlank() && it.second.isNotBlank() }.map { Entry(it.first.trim(), it.second.trim()) }

    /** Fixes sure matches in [text]; near matches come back in [Result.askAbout] as (heard, taught spelling). */
    fun apply(text: String): Result {
        if (entries.isEmpty()) return Result(text, emptyList(), emptyList())
        val changed = ArrayList<Pair<String, String>>(); val ask = ArrayList<Pair<String, String>>()
        val out = Regex("[\\p{L}']+").replace(text) { m ->
            val heard = m.value
            if (heard.length < 2) return@replace heard
            val key = soundKey(heard)
            // Sure: the very word taught, or the same sounds with the same vowels ("Alecks" for "Alex").
            // Same consonants but other vowels ("Kosha" for "Kasha") might be a different name, so it asks.
            val sure = entries.firstOrNull { e ->
                heard.equals(e.soundsLike, true) || heard.equals(e.spelled, true) ||
                    (key in e.keys && (vowels(heard) == vowels(e.soundsLike) || vowels(heard) == vowels(e.spelled)))
            }
            if (sure != null) {
                if (!heard.equals(sure.spelled, true)) changed += heard to sure.spelled
                return@replace sure.spelled
            }
            if (key.length >= 2) entries.firstOrNull { e -> key in e.keys || (key.length >= 3 && e.keys.any { oneApart(key, it) }) }
                ?.let { if (!heard.equals(it.spelled, true)) ask += heard to it.spelled }
            heard
        }
        return Result(out, changed, ask)
    }

    companion object {
        private fun vowels(w: String) = w.lowercase().filter { it in "aeiouy" }

        /** Lines "sounds like = spelled" (Settings) to pairs; lines without "=" are skipped. */
        fun parse(lines: String): List<Pair<String, String>> = lines.lines().mapNotNull { l ->
            val i = l.indexOf('='); if (i < 0) null else l.substring(0, i).trim() to l.substring(i + 1).trim()
        }.filter { it.first.isNotEmpty() && it.second.isNotEmpty() }

        /**
         * A rough English sound key: letters that sound alike map to one symbol, vowels after the first letter and
         * doubled letters drop out. "Aleks", "Alex" and "Alecks" all give the same key. Made for short names, not a
         * full phonetics engine.
         */
        fun soundKey(word: String): String {
            var w = word.lowercase().filter { it in 'a'..'z' }
            if (w.isEmpty()) return ""
            w = w.replace("ph", "f").replace("ck", "k").replace("cks", "x").replace("ks", "x").replace("cs", "x")
                .replace("sh", "S").replace("sch", "S").replace("ch", "C").replace("tch", "C").replace("th", "0")
                .replace("gh", "").replace("kn", "n").replace("wr", "r").replace("qu", "kw").replace("dg", "j")
                .replace("ce", "se").replace("ci", "si").replace("cy", "sy").replace("ge", "je").replace("gi", "ji")
            val map = mapOf('c' to 'k', 'q' to 'k', 'z' to 's', 'v' to 'f', 'y' to 'i', 'w' to 'u', 'j' to 'j', 'x' to 'x')
            val sb = StringBuilder()
            for ((i, ch0) in w.withIndex()) {
                val ch = map[ch0] ?: ch0
                val vowel = ch in "aeiou"
                if (i > 0 && vowel) continue
                if (sb.isNotEmpty() && sb.last() == (if (i == 0 && vowel) 'A' else ch)) continue
                sb.append(if (i == 0 && vowel) 'A' else ch)
            }
            return sb.toString()
        }

        /** True when [a] and [b] differ by one added, dropped or changed sound. */
        fun oneApart(a: String, b: String): Boolean {
            if (a == b || kotlin.math.abs(a.length - b.length) > 1) return false
            var i = 0; var j = 0; var edits = 0
            while (i < a.length && j < b.length) {
                if (a[i] == b[j]) { i++; j++; continue }
                if (++edits > 1) return false
                when { a.length > b.length -> i++; a.length < b.length -> j++; else -> { i++; j++ } }
            }
            return edits + (a.length - i) + (b.length - j) <= 1
        }
    }
}
