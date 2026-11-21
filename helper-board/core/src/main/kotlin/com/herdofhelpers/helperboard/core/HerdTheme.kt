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

enum class HerdLook(val label: String) { PHONE("Match my phone"), DARK("Herd Dark"), LIGHT("Herd Light"), CUSTOM("My colours") }

/**
 * The user's own colours (raven575, 11-21): three sliders. [hue] 0-359 picks the colour, [strength] 0-100 how much
 * colour (0 = grey), [brightness] 0-100 from near-black to near-white. Text colours are chosen for contrast, so any
 * slider position stays readable (tested).
 */
data class CustomColours(val hue: Int = 175, val strength: Int = 45, val brightness: Int = 10)

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
    fun palette(look: HerdLook, vision: ColourVision, phoneIsDark: Boolean = true, custom: CustomColours = CustomColours()): HerdPalette {
        val base = when (look) {
            HerdLook.DARK -> DARK; HerdLook.LIGHT -> LIGHT; HerdLook.PHONE -> if (phoneIsDark) DARK else LIGHT
            HerdLook.CUSTOM -> custom(custom)
        }
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

    /** A full palette from the three sliders. Go/warn/stop keep the Herd colours of the matching dark or light look. */
    fun custom(cc: CustomColours): HerdPalette {
        val h = ((cc.hue % 360) + 360) % 360
        val s = cc.strength.coerceIn(0, 100) / 100.0
        // Skip the middle greys: no text colour reads well on both a key and the keyboard there.
        val b = cc.brightness.coerceIn(0, 100) / 100.0
        val l = if (b < 0.5) 0.04 + b / 0.5 * 0.30 else 0.66 + (b - 0.5) / 0.5 * 0.30
        val dark = l < 0.5
        // Bright hues (yellow, green) look lighter than their number says: nudge the shade away from the middle
        // until the key text reads at 4.5:1 or better.
        var shade = l
        fun backs(x: Double) = listOf(hsl(h, s * 0.6, x), hsl(h, s * 0.55, if (dark) x + 0.08 else minOf(x + 0.05, 0.99)),
            hsl(h, s * 0.6, if (dark) maxOf(x - 0.03, 0.02) else x - 0.06))
        repeat(12) {
            val b = backs(shade)
            if (b.minOf { contrast(readableOn(b, hsl(h, 0.2, 0.96), hsl(h, 0.35, 0.1)), it) } >= 4.5) return@repeat
            shade += if (dark) -0.025 else 0.025
        }
        val (bg, surface, sunk) = backs(shade)
        val border = hsl(h, s * 0.5, if (dark) shade + 0.17 else shade - 0.15)
        val text = readableOn(listOf(bg, surface, sunk), hsl(h, 0.2, 0.96), hsl(h, 0.35, 0.1))
        val accent = hsl(h, maxOf(s, 0.45), if (dark) 0.68 else 0.3)
        val onAccent = readableOn(listOf(accent), hsl(h, 0.3, 0.97), hsl(h, 0.5, 0.08))
        val soft = blend(accent, bg, 0.72)
        val base = if (dark) DARK else LIGHT
        return HerdPalette(
            bg = bg, surface = surface, text = text, muted = blend(text, bg, 0.3), accent = accent, onAccent = onAccent,
            border = border, sunk = sunk, soft = soft, softInk = readableOn(listOf(soft), hsl(h, 0.2, 0.96), hsl(h, 0.35, 0.1)),
            good = base.good, warn = base.warn, stop = base.stop, onGood = base.onGood, onStop = base.onStop, dark = dark,
        )
    }

    /** Whichever of [light] or [darkInk] reads better on every colour; pure white or black if neither reaches 4.5:1. */
    private fun readableOn(backs: List<Int>, light: Int, darkInk: Int): Int {
        fun worst(ink: Int) = backs.minOf { contrast(ink, it) }
        val pick = if (worst(light) >= worst(darkInk)) light else darkInk
        if (worst(pick) >= 4.5) return pick
        val white = 0xFFFFFFFF.toInt(); val black = 0xFF000000.toInt()
        return if (worst(white) >= worst(black)) white else black
    }

    fun hsl(hue: Int, sat: Double, light: Double): Int {
        val l = light.coerceIn(0.0, 1.0); val s = sat.coerceIn(0.0, 1.0)
        val c = (1 - Math.abs(2 * l - 1)) * s
        val hp = hue / 60.0
        val x = c * (1 - Math.abs(hp % 2 - 1))
        val (r, g, b) = when {
            hp < 1 -> Triple(c, x, 0.0); hp < 2 -> Triple(x, c, 0.0); hp < 3 -> Triple(0.0, c, x)
            hp < 4 -> Triple(0.0, x, c); hp < 5 -> Triple(x, 0.0, c); else -> Triple(c, 0.0, x)
        }
        val m = l - c / 2
        fun ch(v: Double) = ((v + m) * 255).toInt().coerceIn(0, 255)
        return (0xFF shl 24) or (ch(r) shl 16) or (ch(g) shl 8) or ch(b)
    }

    fun blend(a: Int, b: Int, t: Double): Int {
        fun ch(sh: Int) = (((a shr sh) and 0xFF) * (1 - t) + ((b shr sh) and 0xFF) * t).toInt().coerceIn(0, 255)
        return (0xFF shl 24) or (ch(16) shl 16) or (ch(8) shl 8) or ch(0)
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
