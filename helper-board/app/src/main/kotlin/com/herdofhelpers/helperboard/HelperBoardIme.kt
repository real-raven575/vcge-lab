package com.herdofhelpers.helperboard

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.inputmethodservice.InputMethodService
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.text.TextUtils
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.inputmethod.EditorInfo
import android.widget.FrameLayout
import android.widget.HorizontalScrollView
import android.widget.LinearLayout
import android.widget.TextView
import com.herdofhelpers.helperboard.core.EmojiBook
import com.herdofhelpers.helperboard.core.EmojiGroup
import com.herdofhelpers.helperboard.core.FieldPolicy
import com.herdofhelpers.helperboard.core.NumberStyle
import com.herdofhelpers.helperboard.core.Key
import com.herdofhelpers.helperboard.core.KeyKind
import com.herdofhelpers.helperboard.core.Layouts
import com.herdofhelpers.helperboard.core.Mode
import com.herdofhelpers.helperboard.core.PersonalDictionary
import com.herdofhelpers.helperboard.core.Shift
import com.herdofhelpers.helperboard.core.ShiftKey

/**
 * The Helper Board keyboard. Promises kept here:
 *  - never lose a take: the mic records to a file first (TakeRecorder), then text is made from that file;
 *  - never change what you said: no autocorrect; space types a space; suggestions only apply when tapped;
 *  - private boxes (passwords, incognito) are never learned or saved unless the user opted in.
 */
class HelperBoardIme : InputMethodService() {
    private lateinit var prefs: Prefs
    private lateinit var takes: TakeStore
    private lateinit var dict: PersonalDictionary
    private val shift = ShiftKey()
    private var mode = Mode.ABC
    private var policy = FieldPolicy(learnWords = true, saveTakes = true, isPrivate = false, isWebOrEmail = false)
    private var root: LinearLayout? = null
    private var preview: TextView? = null
    private var suggestionRow: LinearLayout? = null
    private var micLabel: TextView? = null
    private val main = Handler(Looper.getMainLooper())

    private var recorder: TakeRecorder? = null
    private var recordingTake: Take? = null
    private var notice: String? = null

    override fun onCreate() {
        super.onCreate()
        prefs = Prefs(this)
        takes = TakeStore(this)
        dict = prefs.loadDictionary()
        CrashLog.install(this)
    }

    override fun onCreateInputView(): View {
        val r = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        root = r
        // The key preview floats over the keys, so the keyboard sits in a frame with the bubble on top.
        val bubble = TextView(this).apply {
            gravity = Gravity.CENTER
            visibility = View.GONE
            elevation = KeyLook.dp(this@HelperBoardIme, 8).toFloat()
        }
        preview = bubble
        val frame = FrameLayout(this)
        frame.addView(r, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        frame.addView(bubble, FrameLayout.LayoutParams(0, 0))
        render()
        return frame
    }

    override fun onStartInputView(info: EditorInfo, restarting: Boolean) {
        super.onStartInputView(info, restarting)
        dict = prefs.loadDictionary()
        policy = FieldPolicy.from(info.inputType, info.imeOptions, prefs.allowPrivateSaving)
        shift.doubleTapMs = 350
        if (!restarting) mode = Mode.ABC
        updateAutoCap()
        render()
    }

    override fun onFinishInputView(finishingInput: Boolean) {
        if (recorder != null) stopRecording(insert = false)
        main.removeCallbacksAndMessages(repeatToken)
        hidePreview()
        super.onFinishInputView(finishingInput)
    }

    // ---------- Drawing ----------

    private fun render() {
        val r = root ?: return
        hidePreview()
        r.removeAllViews()
        r.background = KeyLook.background(this, prefs)
        // The phone's bar under the keyboard takes the keyboard's own colour, so it doesn't read as a black gap.
        window?.window?.navigationBarColor = KeyLook.palette(this, prefs).bg
        val pad = KeyLook.dp(this, 4)
        r.setPadding(pad, pad, pad, pad)

        r.addView(modeStrip())
        if (mode != Mode.EMOJI) emojiQuery = null
        if (mode == Mode.EMOJI) { suggestionRow = null; r.addView(emojiPanel()) } else r.addView(suggestionBar())
        if (mode == Mode.TAKES) r.addView(takesDrawer())
        // While searching emoji, the letter keys type into the search line instead of the text box.
        val rows = if (emojiQuery != null) Layouts.abc(NumberStyle.OFF, myRow = emptyList())
        else Layouts.forMode(mode, prefs.numberStyle)
        var i = 0
        while (i < rows.size) {
            val tall = rows[i].lastOrNull()?.takeIf { it.rows == 2 && i + 1 < rows.size }
            if (tall != null) { r.addView(tallBlock(rows[i].dropLast(1), rows[i + 1], tall)); i += 2 }
            else { r.addView(keyRow(rows[i])); i++ }
        }
        refreshSuggestions()
    }

    private fun modeStrip(): View {
        val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        for (k in Layouts.modeStrip(prefs.showEmoji)) {
            val active = when (k.kind) {
                KeyKind.MODE_ABC -> mode == Mode.ABC
                KeyKind.MODE_NUMBERS -> mode == Mode.NUMBERS
                KeyKind.MODE_SYMBOLS -> mode == Mode.SYMBOLS
                KeyKind.MODE_TAKES -> mode == Mode.TAKES
                KeyKind.MODE_EMOJI -> mode == Mode.EMOJI
                else -> false
            }
            val c = chip(k.label, active) { onKey(k) }.apply {
                setPadding(0, 0, 0, 0)
                // One line that shrinks to fit, so "🎙 Takes" never wraps and gets cut off on a narrow phone.
                maxLines = 1
                setAutoSizeTextTypeUniformWithConfiguration(9, 14, 1, android.util.TypedValue.COMPLEX_UNIT_SP)
                if (k.kind == KeyKind.MODE_NUMBERS) setOnLongClickListener { openSettings(); true }
            }
            row.addView(c, LinearLayout.LayoutParams(0, KeyLook.dp(this, 32), k.weight).apply {
                setMargins(KeyLook.dp(this@HelperBoardIme, 2), 0, KeyLook.dp(this@HelperBoardIme, 2), KeyLook.dp(this@HelperBoardIme, 4))
            })
        }
        return row
    }

    private fun suggestionBar(): View {
        val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        suggestionRow = row
        return HorizontalScrollView(this).apply {
            isHorizontalScrollBarEnabled = false
            addView(row)
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, KeyLook.dp(this@HelperBoardIme, 30))
        }
    }

    private fun refreshSuggestions() {
        val row = suggestionRow ?: return
        row.removeAllViews()
        notice?.let { row.addView(chip(it, false) { notice = null; refreshSuggestions() }); return }
        if (recorder != null) { row.addView(chip("⏺ Recording. Tap 🎙 to stop. Saved every second.", true) {}); return }
        if (policy.isPrivate && !prefs.allowPrivateSaving) {
            row.addView(chip("🔒 Private box: nothing here is learned or saved", false) {}); return
        }
        val word = PersonalDictionary.currentWord(currentInputConnection?.getTextBeforeCursor(40, 0) ?: "")
        if (word.isEmpty()) return
        for (s in dict.complete(word)) row.addView(chip(s, false) { replaceCurrentWord(word, s) })
        if (!dict.isKnown(word) && word.length > 1) {
            row.addView(chip("＋ save \"$word\"", false) {
                dict.approve(word); prefs.saveDictionary(dict); refreshSuggestions()
            })
        }
    }

    private fun takesDrawer(): View {
        val list = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        val recent = takes.all(recordingTake?.id).filter { it.trashedAtMs == null }.take(4)
        if (recent.isEmpty()) list.addView(label("No takes yet. Tap 🎙 to record one."))
        for (t in recent) {
            val line = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
            val text = t.text.ifEmpty { "(audio only, ${takes.seconds(t.id)} s)" }
            line.addView(label((if (t.kept) "✅ " else "") + text).apply {
                maxLines = 1; ellipsize = TextUtils.TruncateAt.END
            }, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
            if (t.text.isNotEmpty()) line.addView(chip("Paste", false) {
                currentInputConnection?.commitText(t.text, 1); takes.touch(t)
            })
            line.addView(chip(if (t.kept) "Kept" else "Keep", t.kept) { t.kept = !t.kept; takes.touch(t); render() })
            list.addView(line)
        }
        list.addView(chip("Open Take Vault", false) {
            startActivity(Intent(this, VaultActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        })
        return list
    }

    /** Two rows side by side with one tall key at the right that covers both (the big ⏎). */
    private fun tallBlock(top: List<Key>, bottom: List<Key>, tall: Key): View {
        val block = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        val left = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        left.addView(keyRow(top)); left.addView(keyRow(bottom))
        val leftWeight = maxOf(top.sumOf { it.weight.toDouble() }, bottom.sumOf { it.weight.toDouble() }).toFloat()
        block.addView(left, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, leftWeight))
        val gap = KeyLook.dp(this, prefs.rowGapDp)
        block.addView(keyView(tall), LinearLayout.LayoutParams(0, KeyLook.dp(this, prefs.keyHeightDp) * 2 + gap, tall.weight).apply {
            setMargins(KeyLook.dp(this@HelperBoardIme, 2), gap / 2, KeyLook.dp(this@HelperBoardIme, 2), gap / 2)
        })
        return block
    }

    // ---------- Emoji window ----------

    private var emojiGroup = EmojiGroup.FEELINGS
    /** Non-null while searching emoji: what has been typed into the search line. */
    private var emojiQuery: String? = null

    /** A big emoji window: search line, recent emoji, group tabs, and a scrolling grid (or the search results). */
    private fun emojiPanel(): View {
        val p = KeyLook.palette(this, prefs)
        val panel = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        val top = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        val q = emojiQuery
        top.addView(chip(if (q == null) "🔍 Search by name or feeling" else "🔍 $q▏", q != null) {
            if (emojiQuery == null) { emojiQuery = ""; render() }
        }, LinearLayout.LayoutParams(0, KeyLook.dp(this, 34), 1f))
        if (q != null) top.addView(chip("✕ Done", false) { emojiQuery = null; render() })
        panel.addView(top)

        if (q != null) {
            // Results in one scrolling line, so the letter keys fit underneath.
            val hits = EmojiBook.search(q)
            val line = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
            if (q.isBlank()) line.addView(label("Type a name or a feeling, like happy, tired, love, dog"))
            else if (hits.isEmpty()) line.addView(label("No emoji for \"$q\" yet"))
            for (e in hits) line.addView(emojiCell(e.char, p))
            panel.addView(HorizontalScrollView(this).apply { isHorizontalScrollBarEnabled = false; addView(line) },
                LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, KeyLook.dp(this, 52)))
            return panel
        }

        val recent = prefs.recentEmoji.take(prefs.recentEmojiCount)
        if (recent.isNotEmpty()) {
            val line = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
            line.addView(label("Recent"))
            for (e in recent) line.addView(emojiCell(e, p))
            panel.addView(HorizontalScrollView(this).apply { isHorizontalScrollBarEnabled = false; addView(line) })
        }
        val tabs = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        for (g in EmojiGroup.entries) tabs.addView(chip("${g.icon} ${g.label}", g == emojiGroup) { emojiGroup = g; render() })
        panel.addView(HorizontalScrollView(this).apply { isHorizontalScrollBarEnabled = false; addView(tabs) })

        val grid = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        EmojiBook.inGroup(emojiGroup).chunked(8).forEach { chunk ->
            val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
            for (e in chunk) row.addView(emojiCell(e.char, p), LinearLayout.LayoutParams(0, KeyLook.dp(this, 50), 1f))
            repeat(8 - chunk.size) { row.addView(View(this), LinearLayout.LayoutParams(0, 1, 1f)) }
            grid.addView(row)
        }
        panel.addView(android.widget.ScrollView(this).apply { addView(grid) },
            LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, KeyLook.dp(this, prefs.keyHeightDp * 4)))
        return panel
    }

    private fun emojiCell(e: String, p: com.herdofhelpers.helperboard.core.HerdPalette) = TextView(this).apply {
        text = e; textSize = 26f; gravity = Gravity.CENTER
        val pad = KeyLook.dp(this@HelperBoardIme, 6); setPadding(pad, 0, pad, 0)
        minWidth = KeyLook.dp(this@HelperBoardIme, 44); minHeight = KeyLook.dp(this@HelperBoardIme, 48)
        setTextColor(p.text)
        setOnClickListener {
            currentInputConnection?.commitText(e, 1)
            // Recent emoji are remembered on the phone only, and never from private boxes.
            if (!policy.isPrivate) prefs.recentEmoji = Layouts.rememberEmoji(prefs.recentEmoji, e, EmojiBook.MAX_RECENT)
            if (emojiQuery == null) render()
        }
    }

    private fun keyRow(keys: List<Key>): View {
        val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        val gap = KeyLook.dp(this, prefs.rowGapDp)
        for (k in keys) {
            val v = keyView(k)
            row.addView(v, LinearLayout.LayoutParams(0, KeyLook.dp(this, prefs.keyHeightDp), k.weight).apply {
                setMargins(KeyLook.dp(this@HelperBoardIme, 2), gap / 2, KeyLook.dp(this@HelperBoardIme, 2), gap / 2)
            })
        }
        return row
    }

    private fun labelFor(k: Key): String = when (k.kind) {
        KeyKind.CHAR -> shift.apply(k.label)
        KeyKind.SHIFT -> when (shift.state) { Shift.OFF -> "⇧"; Shift.ONCE -> "⬆"; Shift.LOCKED -> "⇪" }
        KeyKind.MIC -> if (recorder != null) "⏹ " + (recorder?.dataBytes?.let { it / 32_000 } ?: 0) + "s" else "🎙"
        KeyKind.CAPS_LOCK -> if (shift.state == Shift.LOCKED) "⇪ ON" else k.label
        else -> k.label
    }

    @SuppressLint("ClickableViewAccessibility")
    private fun keyView(k: Key): TextView {
        val tv = TextView(this)
        tv.text = labelFor(k)
        tv.gravity = Gravity.CENTER
        tv.textSize = if (k.label.length > 2) 14f else 20f
        tv.typeface = KeyLook.typeface(prefs)
        val p = KeyLook.palette(this, prefs)
        val capsOn = (k.kind == KeyKind.SHIFT && shift.state != Shift.OFF) ||
            (k.kind == KeyKind.CAPS_LOCK && shift.state == Shift.LOCKED)
        val (color, ink) = when {
            k.kind == KeyKind.MIC && recorder != null -> p.stop to p.onStop
            k.kind == KeyKind.MIC -> p.accent to p.onAccent
            capsOn -> p.good to p.onGood
            k.kind == KeyKind.CHAR || k.kind == KeyKind.SPACE -> p.surface to p.text
            else -> p.sunk to p.text
        }
        tv.setTextColor(ink)
        tv.background = KeyLook.keyBackground(this, color, prefs.bubble, edge = p.border)
        tv.contentDescription = when (k.kind) {
            KeyKind.SPACE -> "space"; KeyKind.BACKSPACE -> "delete"; KeyKind.ENTER -> "enter"
            KeyKind.MIC -> "voice typing"; KeyKind.SHIFT -> "shift"; KeyKind.UNDO -> "undo"
            KeyKind.LEFT -> "cursor left"; KeyKind.RIGHT -> "cursor right"; else -> k.label
        }
        val repeats = k.kind == KeyKind.BACKSPACE || k.kind == KeyKind.LEFT || k.kind == KeyKind.RIGHT
        tv.setOnTouchListener { v, e ->
            when (e.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    v.background = KeyLook.keyBackground(this, color, prefs.bubble, pressed = true, edge = p.border)
                    if (prefs.keyBuzz) v.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP)
                    if (k.kind == KeyKind.CHAR && prefs.keyPreview) showPreview(v, tv.text, p)
                    if (repeats) startRepeat(k)
                }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                    v.background = KeyLook.keyBackground(this, color, prefs.bubble, edge = p.border)
                    hidePreview()
                    if (repeats) stopRepeat()
                }
            }
            repeats // repeating keys handle the whole press here; the rest go on to click and long-press
        }
        tv.setOnClickListener { onKey(k) }
        tv.setOnLongClickListener {
            when (k.kind) {
                KeyKind.SHIFT -> { shift.lock(); render(); true }
                KeyKind.MODE_NUMBERS, KeyKind.SETTINGS -> { openSettings(); true }
                KeyKind.SPACE -> {
                    (getSystemService(INPUT_METHOD_SERVICE) as android.view.inputmethod.InputMethodManager)
                        .showInputMethodPicker(); true
                }
                else -> false
            }
        }
        if (k.kind == KeyKind.MIC) micLabel = tv
        return tv
    }

    private fun chip(text: String, active: Boolean, onClick: () -> Unit): TextView = TextView(this).apply {
        this.text = text
        gravity = Gravity.CENTER
        textSize = 14f
        val pad = KeyLook.dp(this@HelperBoardIme, 10)
        setPadding(pad, 0, pad, 0)
        val p = KeyLook.palette(this@HelperBoardIme, prefs)
        setTextColor(if (active) p.onAccent else p.softInk)
        background = KeyLook.keyBackground(this@HelperBoardIme, if (active) p.accent else p.soft, 0, edge = p.border)
        minHeight = KeyLook.dp(this@HelperBoardIme, 30)
        setOnClickListener { onClick() }
    }

    private fun label(text: String) = TextView(this).apply {
        this.text = text; textSize = 14f; setTextColor(KeyLook.palette(this@HelperBoardIme, prefs).text)
        val p = KeyLook.dp(this@HelperBoardIme, 6); setPadding(p, p, p, p)
    }

    // ---------- Keys ----------

    private fun onKey(k: Key) {
        val ic = currentInputConnection ?: return
        val q = emojiQuery
        if (q != null) {
            when (k.kind) {
                KeyKind.CHAR -> { emojiQuery = q + k.output.lowercase(); render(); return }
                KeyKind.SPACE -> { emojiQuery = "$q "; render(); return }
                KeyKind.BACKSPACE -> { emojiQuery = q.dropLast(1); render(); return }
                KeyKind.ENTER -> { emojiQuery = null; render(); return }
                else -> {}
            }
        }
        when (k.kind) {
            KeyKind.CHAR -> {
                ic.commitText(shift.apply(k.output), 1)
                if (k.output.length == 1 && k.output[0].isLetter()) shift.afterLetter()
                rerenderKeysIfShiftChanged()
            }
            KeyKind.SPACE -> {
                // A space is only ever a space. Nothing is swapped in.
                offerWordBeforeCursor()
                ic.commitText(" ", 1); updateAutoCap(); render()
            }
            KeyKind.BACKSPACE -> { sendDownUpKeyEvents(KeyEvent.KEYCODE_DEL); updateAutoCap(); render() }
            KeyKind.ENTER -> {
                val action = currentInputEditorInfo?.imeOptions?.and(EditorInfo.IME_MASK_ACTION) ?: EditorInfo.IME_ACTION_NONE
                val multiLine = ((currentInputEditorInfo?.inputType ?: 0) and EditorInfo.TYPE_TEXT_FLAG_MULTI_LINE) != 0
                if (!multiLine && action != EditorInfo.IME_ACTION_NONE && action != EditorInfo.IME_ACTION_UNSPECIFIED) {
                    ic.performEditorAction(action)
                } else sendDownUpKeyEvents(KeyEvent.KEYCODE_ENTER)
                updateAutoCap(); render()
            }
            KeyKind.SHIFT -> { shift.tap(SystemClock.uptimeMillis()); render() }
            KeyKind.CAPS_LOCK -> { if (shift.state == Shift.LOCKED) shift.tap(0) else shift.lock(); render() }
            KeyKind.LEFT -> sendDownUpKeyEvents(KeyEvent.KEYCODE_DPAD_LEFT)
            KeyKind.RIGHT -> sendDownUpKeyEvents(KeyEvent.KEYCODE_DPAD_RIGHT)
            KeyKind.UNDO -> {
                val t = SystemClock.uptimeMillis()
                ic.sendKeyEvent(KeyEvent(t, t, KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_Z, 0, KeyEvent.META_CTRL_ON))
                ic.sendKeyEvent(KeyEvent(t, t, KeyEvent.ACTION_UP, KeyEvent.KEYCODE_Z, 0, KeyEvent.META_CTRL_ON))
            }
            KeyKind.MIC -> if (recorder == null) startRecording() else stopRecording(insert = true)
            KeyKind.MODE_ABC -> { mode = Mode.ABC; render() }
            KeyKind.MODE_NUMBERS -> { mode = Mode.NUMBERS; render() }
            KeyKind.MODE_SYMBOLS -> { mode = Mode.SYMBOLS; render() }
            KeyKind.MODE_TAKES -> { mode = if (mode == Mode.TAKES) Mode.ABC else Mode.TAKES; render() }
            KeyKind.MODE_EMOJI -> { mode = if (mode == Mode.EMOJI) Mode.ABC else Mode.EMOJI; render() }
            KeyKind.SETTINGS -> openSettings()
            KeyKind.SWITCH_KEYBOARD -> (getSystemService(INPUT_METHOD_SERVICE) as android.view.inputmethod.InputMethodManager)
                .showInputMethodPicker()
            KeyKind.HIDE -> requestHideSelf(0)
        }
    }

    /** Straight to Helper Board's own settings page, no hunting through the phone's keyboard menus. */
    private fun openSettings() {
        startActivity(Intent(this, VaultActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    // Hold ⌫, ◀ or ▶ to keep going: first repeat after 0.4 s, then 20 a second; ⌫ moves up to whole words after 1.5 s.
    private var repeatCount = 0
    private val repeatToken = Any()
    private fun startRepeat(k: Key) {
        // Editing the emoji search line: one key press, no repeat (the line redraws on every change).
        if (emojiQuery != null && k.kind == KeyKind.BACKSPACE) { onKey(k); return }
        repeatCount = 0
        repeatOnce(k)
        main.postAtTime({ repeatLoop(k) }, repeatToken, SystemClock.uptimeMillis() + 400)
    }
    private fun repeatLoop(k: Key) {
        repeatCount++
        repeatOnce(k)
        val wordsNow = k.kind == KeyKind.BACKSPACE && repeatCount > 22
        main.postAtTime({ repeatLoop(k) }, repeatToken, SystemClock.uptimeMillis() + if (wordsNow) 160 else 50)
    }
    private fun repeatOnce(k: Key) {
        // No redraw while the key is held: redrawing would replace the key under the finger and end the hold.
        when (k.kind) {
            KeyKind.BACKSPACE -> if (repeatCount > 22) deleteWord(redraw = false) else sendDownUpKeyEvents(KeyEvent.KEYCODE_DEL)
            KeyKind.LEFT -> sendDownUpKeyEvents(KeyEvent.KEYCODE_DPAD_LEFT)
            KeyKind.RIGHT -> sendDownUpKeyEvents(KeyEvent.KEYCODE_DPAD_RIGHT)
            else -> {}
        }
    }
    private fun stopRepeat() {
        main.removeCallbacksAndMessages(repeatToken)
        // Redraw after the touch is finished, never inside it. Rebuilding the keys while Android is still
        // handing out this touch is what crashed the keyboard after fast or held ⌫ presses (video 11-20, 0:38).
        main.post { updateAutoCap(); render() }
    }

    // ---------- Key preview: the letter pops up above your thumb ----------

    private fun showPreview(key: View, text: CharSequence, p: com.herdofhelpers.helperboard.core.HerdPalette) {
        val b = preview ?: return
        val frame = b.parent as? View ?: return
        val k = IntArray(2); key.getLocationInWindow(k)
        val f = IntArray(2); frame.getLocationInWindow(f)
        val w = (key.width * 1.5f).toInt().coerceAtLeast(KeyLook.dp(this, 44))
        val h = (key.height * 1.6f).toInt()
        val x = (k[0] - f[0] + key.width / 2 - w / 2).coerceIn(0, (frame.width - w).coerceAtLeast(0))
        // Sit above the key; on the top rows it may cover the tabs, which is fine for a moment.
        val y = (k[1] - f[1] - h + key.height / 4).coerceAtLeast(0)
        b.text = text
        b.textSize = 30f
        b.setTextColor(p.text)
        b.background = KeyLook.keyBackground(this, p.surface, prefs.bubble, edge = p.accent, edgeDp = 2)
        b.layoutParams = FrameLayout.LayoutParams(w, h).apply { leftMargin = x; topMargin = y }
        b.visibility = View.VISIBLE
    }

    private fun hidePreview() { preview?.visibility = View.GONE }

    private var lastShiftDrawn = Shift.OFF
    private fun rerenderKeysIfShiftChanged() {
        if (shift.state != lastShiftDrawn) { lastShiftDrawn = shift.state; render() } else refreshSuggestions()
    }

    private fun updateAutoCap() {
        val ic = currentInputConnection ?: return
        val caps = currentInputEditorInfo?.inputType?.let { ic.getCursorCapsMode(it) } ?: 0
        shift.setAutoCap(caps != 0)
        lastShiftDrawn = shift.state
    }

    private fun deleteWord(redraw: Boolean = true) {
        val ic = currentInputConnection ?: return
        val before = ic.getTextBeforeCursor(64, 0)?.toString() ?: return
        val trimmed = before.trimEnd()
        val word = PersonalDictionary.currentWord(trimmed)
        val n = (before.length - trimmed.length) + word.length
        ic.deleteSurroundingText(if (n == 0) 1 else n, 0)
        if (redraw) { updateAutoCap(); render() }
    }

    private fun replaceCurrentWord(word: String, with: String) {
        val ic = currentInputConnection ?: return
        ic.deleteSurroundingText(word.length, 0)
        ic.commitText("$with ", 1)
        updateAutoCap(); render()
    }

    /** With learning on (opt-in), a finished word the dictionary doesn't know waits for the user's okay. */
    private fun offerWordBeforeCursor() {
        if (!prefs.learnWords || !policy.learnWords) return
        val word = PersonalDictionary.currentWord(currentInputConnection?.getTextBeforeCursor(40, 0) ?: "")
        if (word.length > 1 && !dict.isKnown(word)) { dict.offer(word); prefs.saveDictionary(dict) }
    }

    // ---------- Voice ----------

    private fun startRecording() {
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            notice = "🎙 Allow the mic in the Helper Board app first (tap here to open it)"
            startActivity(Intent(this, VaultActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            refreshSuggestions(); return
        }
        val take = Take(id = takes.newId(), createdAtMs = System.currentTimeMillis(), language = prefs.language)
        val rec = TakeRecorder(this, takes.audio(take.id), prefs.useBluetoothMic)
        if (policy.saveTakes) takes.save(take)
        rec.start()
        rec.error?.let { notice = "🎙 $it"; render(); return }
        recorder = rec; recordingTake = take
        render()
        tick()
    }

    private fun tick() {
        val rec = recorder ?: return
        micLabel?.text = "⏹ ${rec.dataBytes / 32_000}s"
        main.postDelayed({ tick() }, 500)
    }

    private fun stopRecording(insert: Boolean) {
        val rec = recorder ?: return
        val take = recordingTake ?: return
        rec.stop()
        recorder = null; recordingTake = null
        main.removeCallbacksAndMessages(null)
        val audio = takes.audio(take.id)

        if (!policy.saveTakes) {
            // Private box: text only, and the audio is removed as soon as it has been read.
            transcribeAndInsert(take, audio, insert, keep = false)
        } else {
            take.status = Take.STATUS_TRANSCRIBING; takes.save(take)
            transcribeAndInsert(take, audio, insert, keep = true)
            takes.applyRetention(prefs)
        }
        render()
    }

    private fun transcribeAndInsert(take: Take, audio: java.io.File, insert: Boolean, keep: Boolean) {
        notice = "✍ Making text from your take…"
        Transcriber(this).transcribe(audio, take.language) { text, reason ->
            if (keep) {
                take.text = text.orEmpty()
                take.status = if (text != null) Take.STATUS_DONE else Take.STATUS_SAVED
                takes.save(take)
            } else audio.delete()
            notice = when {
                text != null && reason != null -> "⚠ $reason"
                text != null && insert -> null
                text != null -> "✅ Text ready in the Take Vault"
                else -> "💾 $reason"
            }
            if (text != null && insert) {
                // Dictated text starts a new word: add a space if it would run into the word before it.
                val before = currentInputConnection?.getTextBeforeCursor(1, 0)
                val gap = if (!before.isNullOrEmpty() && !before.last().isWhitespace()) " " else ""
                currentInputConnection?.commitText(gap + text + " ", 1)
            }
            render()
        }
    }
}
