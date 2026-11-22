package com.herdofhelpers.helperboard

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.os.SystemClock
import android.view.View

/**
 * The swipe trail (raven575, 11-21): a light, airy ink line, like a calligraphy brush stroke, that follows the
 * finger so you can see which keys the swipe crossed. The newest part is the boldest; older ink thins and fades,
 * and the whole stroke fades away shortly after the finger lifts. Touches pass straight through it.
 */
class InkTrail(context: Context) : View(context) {
    private data class Dot(val x: Float, val y: Float, val t: Long)
    private val dots = ArrayList<Dot>()
    private var liftedAt = 0L
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeCap = Paint.Cap.ROUND }
    var color: Int = Color.WHITE
    private val density = context.resources.displayMetrics.density

    init { isClickable = false; isFocusable = false }

    /** [rawX]/[rawY] are screen positions, the same as the touch events. */
    fun add(rawX: Float, rawY: Float) {
        val loc = IntArray(2); getLocationOnScreen(loc)
        if (liftedAt != 0L) { dots.clear(); liftedAt = 0L }
        dots.add(Dot(rawX - loc[0], rawY - loc[1], SystemClock.uptimeMillis()))
        invalidate()
    }

    fun lift() { liftedAt = SystemClock.uptimeMillis(); invalidate() }
    fun clear() { dots.clear(); liftedAt = 0L; invalidate() }

    override fun onDraw(canvas: Canvas) {
        if (dots.size < 2) return
        val now = SystemClock.uptimeMillis()
        val fade = if (liftedAt == 0L) 1f else (1f - (now - liftedAt) / FADE_MS).coerceIn(0f, 1f)
        if (fade <= 0f) { dots.clear(); return }
        val newest = dots.last().t
        // Smooth the line: draw from midpoint to midpoint, curving through each touch point.
        var px = dots[0].x; var py = dots[0].y
        for (i in 1 until dots.size) {
            val a = dots[i - 1]; val b = dots[i]
            val mx = (a.x + b.x) / 2; val my = (a.y + b.y) / 2
            val age = ((newest - b.t) / TAIL_MS).coerceIn(0f, 1f)          // 0 = newest ink, 1 = old
            val headness = 1f - age
            paint.strokeWidth = density * (1.2f + 4.8f * headness)       // brush: bold at the tip, fine behind
            paint.color = color
            paint.alpha = (255 * fade * (0.18f + 0.6f * headness)).toInt() // light and airy
            val path = android.graphics.Path().apply { moveTo(px, py); quadTo(a.x, a.y, mx, my) }
            canvas.drawPath(path, paint)
            px = mx; py = my
        }
        if (liftedAt != 0L) postInvalidateOnAnimation()
    }

    companion object {
        private const val FADE_MS = 380f
        private const val TAIL_MS = 900f
    }
}
