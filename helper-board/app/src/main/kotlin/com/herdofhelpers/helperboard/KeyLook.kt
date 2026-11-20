package com.herdofhelpers.helperboard

import android.content.Context
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

/** The keyboard's look: the user's photo behind bubble keys, all from their own settings. Every option is free. */
object KeyLook {
    /** The 16 starter colors. No color is ever paid. */
    val PALETTE = intArrayOf(
        0xFF3A3F55.toInt(), 0xFF1B1E2A.toInt(), 0xFFFFFFFF.toInt(), 0xFF9AA0B4.toInt(),
        0xFFB3264A.toInt(), 0xFFFF7D9B.toInt(), 0xFFB86A00.toInt(), 0xFFFFB547.toInt(),
        0xFF0B7A6F.toInt(), 0xFF4FD6C4.toInt(), 0xFF2B3A8F.toInt(), 0xFF9FB0FF.toInt(),
        0xFF5B3FB8.toInt(), 0xFFB9A4FF.toInt(), 0xFF2E7D32.toInt(), 0xFF8D6E63.toInt(),
    )

    fun dp(context: Context, v: Int): Int = (v * context.resources.displayMetrics.density).toInt()

    fun typeface(prefs: Prefs): Typeface = when (prefs.keyFont) {
        "SERIF" -> Typeface.SERIF
        "MONO" -> Typeface.MONOSPACE
        "BOLD" -> Typeface.DEFAULT_BOLD
        else -> Typeface.DEFAULT
    }

    /** Text that reads on the key color: light keys get dark text. */
    fun textColor(keyColor: Int): Int {
        val l = 0.299 * Color.red(keyColor) + 0.587 * Color.green(keyColor) + 0.114 * Color.blue(keyColor)
        return if (l > 150) 0xFF1B1E2A.toInt() else Color.WHITE
    }

    /** A rounded key with a soft top-light bevel ("bubble"); strength 0 = flat. */
    fun keyBackground(context: Context, color: Int, bubble: Int, pressed: Boolean = false): Drawable {
        val base = if (pressed) blend(color, Color.BLACK, 0.25f) else color
        val radius = dp(context, 9).toFloat()
        val body = GradientDrawable().apply {
            cornerRadius = radius
            setColor(base)
            setStroke(dp(context, 1), blend(base, Color.BLACK, 0.35f))
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
        val plain = ColorDrawable(0xFF12141C.toInt())
        val file = prefs.themePhoto
        if (!file.exists()) return plain
        val bmp: Bitmap = runCatching { decodeScaled(file.path, 1080) }.getOrNull() ?: return plain
        val photo = BitmapDrawable(context.resources, bmp).apply {
            alpha = (prefs.themeOpacity.coerceIn(0, 100) * 255 / 100)
            if (prefs.themeTile) setTileModeXY(Shader.TileMode.REPEAT, Shader.TileMode.REPEAT)
            else gravity = Gravity.FILL_HORIZONTAL or when (prefs.themeAlign) {
                "TOP" -> Gravity.TOP; "BOTTOM" -> Gravity.BOTTOM; else -> Gravity.CENTER_VERTICAL
            }
            if (prefs.themeTint != 0) setColorFilter(
                Color.argb(110, Color.red(prefs.themeTint), Color.green(prefs.themeTint), Color.blue(prefs.themeTint)),
                PorterDuff.Mode.SRC_ATOP,
            )
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
