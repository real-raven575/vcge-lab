package com.herdofhelpers.helperboard

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.widget.TextView
import com.herdofhelpers.helperboard.core.KeyFace

/**
 * A key's writing, placed by [face] (set in the Layout Lab): the main label nudged from the middle, and the small
 * hold mark ([holdMark], at half size in [hintColor]) wherever the layout puts it. The background is drawn as usual.
 */
class KeyText(context: Context) : TextView(context) {
    var face = KeyFace()
    var holdMark: String? = null
    var hintColor = 0
    private val hintPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { textAlign = Paint.Align.CENTER }

    override fun onDraw(canvas: Canvas) {
        val p = paint
        p.color = currentTextColor
        p.textAlign = Paint.Align.CENTER
        val w = width.toFloat(); val h = height.toFloat()
        val label = text.toString()
        canvas.drawText(label, w / 2 + face.lx * w, h / 2 + face.ly * h - (p.descent() + p.ascent()) / 2, p)
        holdMark?.let {
            hintPaint.typeface = p.typeface
            hintPaint.textSize = p.textSize * 0.5f
            hintPaint.color = hintColor
            canvas.drawText(it, face.hx * w, face.hy * h - (hintPaint.descent() + hintPaint.ascent()) / 2, hintPaint)
        }
    }
}
