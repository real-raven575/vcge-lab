package com.herdofhelpers.helperboard.core

/**
 * Helper Board wears the Herd's own colours, the same Herd Dark and Herd Light the vCGE app uses (vCGE-Master
 * mod01-shell/themes.js), and the same colour-vision choices (settings.js COLOUR_VISION). No made-up palettes.
 */
data class HerdPalette(
    val bg: Int, val surface: Int, val text: Int, val muted: Int, val accent: Int, val onAccent: Int,
    val border: Int, val sunk: Int, val soft: Int, val softInk: Int, val good: Int, val warn: Int, val stop: Int,
    val onGood: Int, val onStop: Int, val dark: Boolean,
)

enum class HerdLook(val label: String) { PHONE("Match my phone"), DARK("Herd Dark"), LIGHT("Herd Light") }

/** Colour vision, as in vCGE Settings > Accessibility. Each moves the go and stop colours to a pair that person tells apart. */
enum class ColourVision(val label: String, val hint: String) {
    TYPICAL("Typical", "No colour changes"),
    PROTAN("Red-weak (protan)", "Green and red become blue and orange"),
    DEUTAN("Green-weak (deutan)", "Green and red become blue and orange"),
    TRITAN("Blue-weak (tritan)", "Blue and yellow cues become teal and pink"),
    MONO("No colour", "Go and stop cues turn grey, with words and marks"),
}

object HerdTheme {
    private fun c(hex: String): Int = (0xFF000000 or hex.removePrefix("#").toLong(16)).toInt()

    val DARK = HerdPalette(
        bg = c("#18151f"), surface = c("#231f2e"), text = c("#eeeaf7"), muted = c("#b4acc9"), accent = c("#72d3ca"),
        onAccent = c("#0e2b29"), border = c("#3a3449"), sunk = c("#141119"), soft = c("#1d3b3a"), softInk = c("#9fe6de"),
        good = c("#7fd39e"), warn = c("#f2c060"), stop = c("#ff8a80"), onGood = c("#18151f"), onStop = c("#18151f"), dark = true,
    )
    val LIGHT = HerdPalette(
        bg = c("#f5f2fa"), surface = c("#ffffff"), text = c("#2a2440"), muted = c("#5e5776"), accent = c("#17736e"),
        onAccent = c("#ffffff"), border = c("#dcd5ea"), sunk = c("#ece7f5"), soft = c("#d5efec"), softInk = c("#0f4f4b"),
        good = c("#2e7d4f"), warn = c("#8a5800"), stop = c("#b3261e"), onGood = c("#ffffff"), onStop = c("#ffffff"), dark = false,
    )

    /** The palette for a look and colour vision. [phoneIsDark] is used only by [HerdLook.PHONE]. */
    fun palette(look: HerdLook, vision: ColourVision, phoneIsDark: Boolean = true): HerdPalette {
        val base = when (look) { HerdLook.DARK -> DARK; HerdLook.LIGHT -> LIGHT; HerdLook.PHONE -> if (phoneIsDark) DARK else LIGHT }
        val (good, stop) = when (vision) {
            ColourVision.TYPICAL -> return base
            ColourVision.PROTAN, ColourVision.DEUTAN ->
                if (base.dark) c("#8ab4ff") to c("#fdba74") else c("#1d4ed8") to c("#c2410c")
            ColourVision.TRITAN ->
                if (base.dark) c("#5eead4") to c("#f9a8d4") else c("#0f766e") to c("#be185d")
            ColourVision.MONO ->
                if (base.dark) c("#e0e0e0") to c("#9e9e9e") else c("#3d3d3d") to c("#5c5c5c")
        }
        return base.copy(good = good, stop = stop)
    }

    /** WCAG contrast ratio between two opaque colours (1 to 21). */
    fun contrast(a: Int, b: Int): Double {
        fun lum(x: Int): Double {
            fun ch(v: Int): Double { val s = v / 255.0; return if (s <= 0.03928) s / 12.92 else Math.pow((s + 0.055) / 1.055, 2.4) }
            return 0.2126 * ch((x shr 16) and 0xFF) + 0.7152 * ch((x shr 8) and 0xFF) + 0.0722 * ch(x and 0xFF)
        }
        val (hi, lo) = lum(a).let { la -> lum(b).let { lb -> maxOf(la, lb) to minOf(la, lb) } }
        return (hi + 0.05) / (lo + 0.05)
    }
}
