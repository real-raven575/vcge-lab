package com.herdofhelpers.helperboard

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.view.View
import com.herdofhelpers.helperboard.core.VoiceWave

/**
 * The flowing voice wave above the keys while recording (raven575, 11-23). The newest sound enters at the right and
 * drifts left over about 4 seconds. Talking swells the wave; breaks shrink it to a thin line, so pauses are easy to
 * see. It redraws every screen frame while it is on screen and stops by itself when the recording ends.
 */
class VoiceWaveView(context: Context, private val source: () -> VoiceWave?) : View(context) {
    var color: Int = 0xFF7FD4C8.toInt()
    private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
    private val line = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeCap = Paint.Cap.ROUND }
    private val path = Path()
    private val density = context.resources.displayMetrics.density
    /** Each point eases toward its target, so the wave flows instead of jumping 33 times a second. */
    private var shown = FloatArray(0)

    override fun onDraw(canvas: Canvas) {
        val wave = source() ?: return
        val w = width.toFloat(); val h = height.toFloat()
        val n = maxOf(16, (w / (3 * density)).toInt()).coerceAtMost(140)   // one point per 3 dp, up to ~4 s
        val target = wave.heights(n)
        if (shown.size != n) shown = target.copyOf()
        for (i in 0 until n) shown[i] += (target[i] - shown[i]) * 0.35f
        val mid = h / 2
        val minHalf = 1.2f * density                 // a break is a thin line, never nothing
        val maxHalf = h / 2 - 2 * density
        fun x(i: Int) = i * w / (n - 1)
        // Older sound fades a little, so the eye goes to "now" on the right.
        fun y(i: Int, sign: Int) = mid + sign * (minHalf + shown[i] * (maxHalf - minHalf))

        path.reset()
        path.moveTo(0f, y(0, -1))
        for (i in 1 until n) {                        // smooth top edge
            val cx = (x(i - 1) + x(i)) / 2
            path.quadTo(x(i - 1), y(i - 1, -1), cx, (y(i - 1, -1) + y(i, -1)) / 2)
        }
        path.lineTo(w, y(n - 1, -1)); path.lineTo(w, y(n - 1, 1))
        for (i in n - 1 downTo 1) {                   // and the mirrored bottom edge back
            val cx = (x(i) + x(i - 1)) / 2
            path.quadTo(x(i), y(i, 1), cx, (y(i, 1) + y(i - 1, 1)) / 2)
        }
        path.lineTo(0f, y(0, 1)); path.close()
        fill.shader = android.graphics.LinearGradient(0f, 0f, w, 0f,
            intArrayOf(color and 0x00FFFFFF or 0x30000000, color and 0x00FFFFFF or 0xC0000000.toInt()), null,
            android.graphics.Shader.TileMode.CLAMP)
        canvas.drawPath(path, fill)
        line.color = color; line.strokeWidth = 1.5f * density
        canvas.drawPath(path, line.apply { alpha = 200 })
        postInvalidateOnAnimation()
    }
}
