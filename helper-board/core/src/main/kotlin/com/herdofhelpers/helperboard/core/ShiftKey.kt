package com.herdofhelpers.helperboard.core

enum class Shift { OFF, ONCE, LOCKED }

/**
 * Shift that always shows a clear state (testers T6, T8): tap = capital for one letter, double-tap = caps lock,
 * tap again = off. A hold (its time is adjustable in the app) also locks.
 */
class ShiftKey(var doubleTapMs: Long = 350) {
    var state: Shift = Shift.OFF
        private set
    private var lastTapMs: Long = Long.MIN_VALUE

    fun tap(nowMs: Long): Shift {
        val quick = lastTapMs != Long.MIN_VALUE && nowMs - lastTapMs <= doubleTapMs
        state = when (state) {
            Shift.OFF -> Shift.ONCE
            Shift.ONCE -> if (quick) Shift.LOCKED else Shift.OFF
            Shift.LOCKED -> Shift.OFF
        }
        lastTapMs = nowMs
        return state
    }

    fun lock() { state = Shift.LOCKED }

    /** Called after a letter is typed: a one-letter capital switches back off; caps lock stays. */
    fun afterLetter() { if (state == Shift.ONCE) state = Shift.OFF }

    /** Automatic capital at the start of a sentence; never overrides caps lock. */
    fun setAutoCap(on: Boolean) { if (state != Shift.LOCKED) state = if (on) Shift.ONCE else Shift.OFF }

    fun apply(text: String): String = if (state == Shift.OFF) text else text.uppercase()
}
