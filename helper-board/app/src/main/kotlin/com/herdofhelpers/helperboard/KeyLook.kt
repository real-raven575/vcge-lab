package com.herdofhelpers.helperboard

import android.content.Context
import android.content.res.Configuration
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.PorterDuff
import android.graphics.Shader
import android.graphics.Typeface
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.ColorDrawable
import android.graphics.drawable.Drawable
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.LayerDrawable
import android.view.Gravity
import com.herdofhelpers.helperboard.core.ColourVision
import com.herdofhelpers.helperboard.core.HerdLook
import com.herdofhelpers.helperboard.core.HerdPalette
import com.herdofhelpers.helperboard.core.HerdTheme

/** The keyboard's look: Herd Dark or Herd Light (vCGE's own colours), the user's photo behind it, bubble keys. All free. */
object KeyLook {
    /** The Herd palette for the user's look and colour vision. "Match my phone" follows the phone's dark mode. */
    fun palette(context: Context, prefs: Prefs): HerdPalette {
        val night = (context.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES
        return HerdTheme.palette(prefs.herdLook, prefs.colourVision, phoneIsDark = night)
    }

    /** The colour a photo tint name stands for, or 0 for none. */
    fun tint(p: HerdPalette, name: String): Int = when (name) {
        "ACCENT" -> p.accent; "GOOD" -> p.good; "WARN" -> p.warn; "STOP" -> p.stop; else -> 0
    }

    fun dp(context: Context, v: Int): Int = (v * context.resources.displayMetrics.density).toInt()

    fun typeface(prefs: Prefs): Typeface = when (prefs.keyFont) {
        "SERIF" -> Typeface.SERIF
        "MONO" -> Typeface.MONOSPACE
        "BOLD" -> Typeface.DEFAULT_BOLD
        else -> Typeface.DEFAULT
    }

    /** A rounded key with a soft top-light bevel ("bubble"); strength 0 = flat. */
    fun keyBackground(context: Context, color: Int, bubble: Int, pressed: Boolean = false, edge: Int? = null, edgeDp: Int = 1): Drawable {
        val base = if (pressed) blend(color, Color.BLACK, 0.25f) else color
        val radius = dp(context, 9).toFloat()
        val body = GradientDrawable().apply {
            cornerRadius = radius
            setColor(base)
            setStroke(dp(context, edgeDp), edge ?: blend(base, Color.BLACK, 0.35f))
        }
        if (bubble <= 0) return body
        val a = (bubble.coerceIn(0, 100) * 1.1f).toInt()
        val shine = GradientDrawable(
            GradientDrawable.Orientation.TOP_BOTTOM,
            intArrayOf(Color.argb(a, 255, 255, 255), Color.argb(0, 255, 255, 255), Color.argb(a / 2, 0, 0, 0)),
        ).apply { cornerRadius = radius }
        return LayerDrawable(arrayOf(body, shine))
    }

    /** The keyboard background: the user's photo (positioned or tiled, faded, tinted), or a plain color. */
    fun background(context: Context, prefs: Prefs): Drawable {
        val p = palette(context, prefs)
        val plain = ColorDrawable(p.bg)
        val file = prefs.themePhoto
        if (!file.exists()) return plain
        val bmp: Bitmap = runCatching { decodeScaled(file.path, 1080) }.getOrNull() ?: return plain
        val photo = BitmapDrawable(context.resources, bmp).apply {
            alpha = (prefs.themeOpacity.coerceIn(0, 100) * 255 / 100)
            if (prefs.themeTile) setTileModeXY(Shader.TileMode.REPEAT, Shader.TileMode.REPEAT)
            else gravity = Gravity.FILL_HORIZONTAL or when (prefs.themeAlign) {
                "TOP" -> Gravity.TOP; "BOTTOM" -> Gravity.BOTTOM; else -> Gravity.CENTER_VERTICAL
            }
            val t = tint(p, prefs.themeTint)
            if (t != 0) setColorFilter(Color.argb(110, Color.red(t), Color.green(t), Color.blue(t)), PorterDuff.Mode.SRC_ATOP)
        }
        return LayerDrawable(arrayOf(plain, photo))
    }

    private fun decodeScaled(path: String, maxWidth: Int): Bitmap? {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(path, bounds)
        var sample = 1
        while (bounds.outWidth / (sample * 2) >= maxWidth) sample *= 2
        return BitmapFactory.decodeFile(path, BitmapFactory.Options().apply { inSampleSize = sample })
    }

    fun blend(a: Int, b: Int, t: Float): Int = Color.rgb(
        (Color.red(a) * (1 - t) + Color.red(b) * t).toInt(),
        (Color.green(a) * (1 - t) + Color.green(b) * t).toInt(),
        (Color.blue(a) * (1 - t) + Color.blue(b) * t).toInt(),
    )
}
