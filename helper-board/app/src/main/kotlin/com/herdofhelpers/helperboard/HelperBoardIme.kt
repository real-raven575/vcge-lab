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
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.inputmethod.EditorInfo
import android.widget.HorizontalScrollView
import android.widget.LinearLayout
import android.widget.TextView
import com.herdofhelpers.helperboard.core.FieldPolicy
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
    }

    override fun onCreateInputView(): View {
        val r = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        root = r
        render()
        return r
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
        super.onFinishInputView(finishingInput)
    }

    // ---------- Drawing ----------

    private fun render() {
        val r = root ?: return
        r.removeAllViews()
        r.background = KeyLook.background(this, prefs)
        val pad = KeyLook.dp(this, 4)
        r.setPadding(pad, pad, pad, pad)

        r.addView(modeStrip())
        r.addView(suggestionBar())
        if (mode == Mode.TAKES) r.addView(takesDrawer())
        for (row in Layouts.forMode(mode, prefs.numberStyle)) r.addView(keyRow(row))
        refreshSuggestions()
    }

    private fun modeStrip(): View {
        val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        for (k in Layouts.MODE_STRIP) {
            val active = when (k.kind) {
                KeyKind.MODE_ABC -> mode == Mode.ABC
                KeyKind.MODE_NUMBERS -> mode == Mode.NUMBERS
                KeyKind.MODE_SYMBOLS -> mode == Mode.SYMBOLS
                KeyKind.MODE_TAKES -> mode == Mode.TAKES
                else -> false
            }
            row.addView(chip(k.label, active) { onKey(k) }, LinearLayout.LayoutParams(0, KeyLook.dp(this, 32), 1f).apply {
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
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, KeyLook.dp(this@HelperBoardIme, 36))
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
        val color = when (k.kind) {
            KeyKind.MIC -> if (recorder != null) 0xFFB3264A.toInt() else 0xFFB86A00.toInt()
            KeyKind.SHIFT -> if (shift.state == Shift.OFF) prefs.keyColor else 0xFF0B7A6F.toInt()
            else -> prefs.keyColor
        }
        tv.setTextColor(KeyLook.textColor(color))
        tv.background = KeyLook.keyBackground(this, color, prefs.bubble)
        tv.contentDescription = when (k.kind) {
            KeyKind.SPACE -> "space"; KeyKind.BACKSPACE -> "delete"; KeyKind.ENTER -> "enter"
            KeyKind.MIC -> "voice typing"; KeyKind.SHIFT -> "shift"; KeyKind.UNDO -> "undo"
            KeyKind.LEFT -> "cursor left"; KeyKind.RIGHT -> "cursor right"; else -> k.label
        }
        tv.setOnTouchListener { v, e ->
            when (e.action) {
                MotionEvent.ACTION_DOWN -> v.background = KeyLook.keyBackground(this, color, prefs.bubble, pressed = true)
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> v.background = KeyLook.keyBackground(this, color, prefs.bubble)
            }
            false
        }
        tv.setOnClickListener { onKey(k) }
        tv.setOnLongClickListener {
            when (k.kind) {
                KeyKind.SHIFT -> { shift.lock(); render(); true }
                KeyKind.BACKSPACE -> { deleteWord(); true }
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
        val c = if (active) 0xFF2B3A8F.toInt() else 0xCC1B1E2A.toInt()
        setTextColor(KeyLook.textColor(c or 0xFF000000.toInt()))
        background = KeyLook.keyBackground(this@HelperBoardIme, c, 0)
        minHeight = KeyLook.dp(this@HelperBoardIme, 30)
        setOnClickListener { onClick() }
    }

    private fun label(text: String) = TextView(this).apply {
        this.text = text; textSize = 14f; setTextColor(0xFFFFFFFF.toInt())
        val p = KeyLook.dp(this@HelperBoardIme, 6); setPadding(p, p, p, p)
    }

    // ---------- Keys ----------

    private fun onKey(k: Key) {
        val ic = currentInputConnection ?: return
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
        }
    }

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

    private fun deleteWord() {
        val ic = currentInputConnection ?: return
        val before = ic.getTextBeforeCursor(64, 0)?.toString() ?: return
        val trimmed = before.trimEnd()
        val word = PersonalDictionary.currentWord(trimmed)
        val n = (before.length - trimmed.length) + word.length
        ic.deleteSurroundingText(if (n == 0) 1 else n, 0)
        updateAutoCap(); render()
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
                text != null && insert -> null
                text != null -> "✅ Text ready in the Take Vault"
                else -> "💾 $reason"
            }
            if (text != null && insert) currentInputConnection?.commitText(text + " ", 1)
            render()
        }
    }
}
