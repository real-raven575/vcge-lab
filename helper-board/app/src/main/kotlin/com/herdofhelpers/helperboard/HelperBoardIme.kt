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
import com.herdofhelpers.helperboard.core.Alternates
import com.herdofhelpers.helperboard.core.Autocorrect
import com.herdofhelpers.helperboard.core.Pt
import com.herdofhelpers.helperboard.core.SwipeDecoder
import com.herdofhelpers.helperboard.core.WordList
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
    private var frameView: FrameLayout? = null
    private var spaceView: View? = null
    private var altBar: LinearLayout? = null
    private var trail: InkTrail? = null
    private var altOptions: List<String> = emptyList()
    private var altPicked = 0

    // Words: the common-word list for the voice language (loaded off the main thread), what was typed by keys since
    // the last space (only that is ever autocorrected, never dictation), and the last fix so ⌫ can undo it.
    @Volatile private var words: WordList? = null
    private var wordsLang = ""
    private val typed = StringBuilder()
    private var lastFix: Pair<String, String>? = null
    // Swipe typing: the finger's path over the letter keys, and the other words the last swipe could have been.
    private val letterViews = HashMap<Char, View>()
    private val keyViews = ArrayList<Pair<Key, KeyText>>()
    private val swipePath = ArrayList<Pt>()
    private val swipeOrigin = IntArray(2)
    private var swiping = false
    private var swipeAlternatives: List<String> = emptyList()
    private var lastSwiped: String? = null
    private var suggestionRow: LinearLayout? = null
    private var micLabel: TextView? = null
    private val main = Handler(Looper.getMainLooper())

    private var recorder: TakeRecorder? = null
    private var recordingTake: Take? = null
    private var live: LiveTranscriber? = null
    private var liveInsert = true
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
        val bar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL; visibility = View.GONE
            elevation = KeyLook.dp(this@HelperBoardIme, 10).toFloat()
        }
        altBar = bar
        frame.addView(bar, FrameLayout.LayoutParams(0, 0))
        // The swipe trail sits on top of everything and never takes touches.
        val inkLine = InkTrail(this)
        trail = inkLine
        frame.addView(inkLine, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        frameView = frame
        render()
        return frame
    }

    override fun onStartInputView(info: EditorInfo, restarting: Boolean) {
        super.onStartInputView(info, restarting)
        dict = prefs.loadDictionary()
        policy = FieldPolicy.from(info.inputType, info.imeOptions, prefs.allowPrivateSaving)
        shift.doubleTapMs = 350
        if (!restarting) mode = Mode.ABC
        typed.clear(); lastFix = null; swipeAlternatives = emptyList(); lastSwiped = null
        loadWords()
        updateAutoCap()
        render()
        if (testing) startTypingTest()
        android.util.Log.i("HBTEST", "keyboard: started in a box; test box: $testing")
    }

    override fun onFinishInputView(finishingInput: Boolean) {
        if (recorder != null) stopRecording(insert = false)
        main.removeCallbacksAndMessages(repeatToken)
        hidePreview(); hideAlternates()
        super.onFinishInputView(finishingInput)
    }

    // ---------- Drawing ----------

    /** Where the letter and the hold mark sit on each key: the Layout Lab layout's, else the standard place. */
    private var face = com.herdofhelpers.helperboard.core.KeyFace()

    private fun render() {
        val r = root ?: return
        hidePreview(); hideAlternates()
        letterViews.clear(); spaceView = null; keyViews.clear()
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
        else Layouts.forMode(mode, prefs.numberStyle, pad = prefs.padLayout, multi = prefs.multiKeyItems, coder = prefs.coderKeys)
        face = com.herdofhelpers.helperboard.core.KeyFace()
        val lab = if (emojiQuery == null && mode == Mode.ABC && prefs.labLayout.isNotBlank())
            com.herdofhelpers.helperboard.core.LabLayout.parse(prefs.labLayout).getOrNull() else null
        if (lab != null) {
            face = lab.face
            lab.rows.forEachIndexed { n, keys -> r.addView(keyRow(keys, lab.heightsDp[n], lab.widest)) }
            refreshSuggestions(); return
        }
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
        for (k in Layouts.modeStrip(prefs.showEmoji, prefs.showSystemKeys)) {
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
        suggestionAsk++  // any answer still being worked out is for an older word now
        row.removeAllViews()
        notice?.let { row.addView(chip(it, false) { notice = null; refreshSuggestions() }); return }
        if (recorder != null) {
            // The flowing wave shows you being heard; the strip stays the same view while you talk, so it never
            // restarts (raven575, 11-23: signal bars looked like phone reception).
            val wave = waveView ?: VoiceWaveView(this) { recorder?.wave }.also { waveView = it }
            wave.color = KeyLook.palette(this, prefs).accent
            (wave.parent as? ViewGroup)?.removeView(wave)
            val strip = (row.parent as? View)?.width ?: resources.displayMetrics.widthPixels
            row.addView(wave, LinearLayout.LayoutParams((strip * 0.62f).toInt(), KeyLook.dp(this, 28)))
            row.addView(chip(if (live != null) "Live · tap 🎙 to stop" else "Saving · tap 🎙 to stop", true) {})
            return
        }
        if (policy.isPrivate && !prefs.allowPrivateSaving) {
            row.addView(chip("🔒 Private box: nothing here is learned or saved", false) {}); return
        }
        if (spellNotes.isNotEmpty()) {
            for (n in spellNotes) row.addView(chip(if (n.sure) "✓ ${n.now} · ↶ ${n.other}" else "Did you mean ${n.other}?", !n.sure) {
                swapRecentWord(n.now, n.other); spellNotes = spellNotes - n; refreshSuggestions()
            })
            row.addView(chip("✕", false) { spellNotes = emptyList(); refreshSuggestions() })
            return
        }
        lastFix?.let { (original, fixed) ->
            row.addView(chip("↶ $original", true) { undoFix() })
            row.addView(chip("✓ $fixed", false) { lastFix = null; refreshSuggestions() })
            return
        }
        lastSwiped?.let { swiped ->
            // The typed best guess comes first (lit), then the other choices; tapping one swaps it in.
            if (swipeAlternatives.isNotEmpty()) row.addView(chip("✓ $swiped", true) { lastSwiped = null; swipeAlternatives = emptyList(); refreshSuggestions() })
            for (alt in swipeAlternatives) row.addView(chip(alt, false) { replaceSwiped(swiped, alt) })
            if (swipeAlternatives.isNotEmpty()) return
        }
        val word = PersonalDictionary.currentWord(currentInputConnection?.getTextBeforeCursor(40, 0) ?: "")
        if (word.isEmpty()) return
        val list = words
        val wantFix = prefs.autocorrect && autocorrectAllowed() && typed.toString() == word
        val english = wordsLang == "en"
        // Looking through 25,000 words takes too long to do between two key presses, so it happens off the main
        // thread; only the newest word's answer is shown (raven575, 11-22: fast typing froze).
        val ask = ++suggestionAsk
        suggester.execute {
            val found = runCatching {
                // With autocorrect on, show the fix that space would make, so it's never a surprise.
                val fix = if (wantFix && list != null)
                    Autocorrect.fix(word, list, known = { w -> dict.isKnown(w) }, english = english)?.takeIf { it != word } else null
                val picks = (dict.complete(word) + (list?.complete(word) ?: emptyList()).map { WordList.matchCase(word, it) })
                    .distinctBy { it.lowercase() }.take(4)
                val unknown = !dict.isKnown(word) && list?.isKnown(word) != true && word.length > 1
                Triple(fix, picks, unknown)
            }.getOrNull() ?: return@execute
            main.post {
                if (ask != suggestionAsk || suggestionRow !== row) return@post
                val (fix, picks, unknown) = found
                if (wantFix) fixReady = word to fix
                fix?.let { row.addView(chip("→ $it", true) { replaceCurrentWord(word, it) }) }
                for (s in picks) row.addView(chip(s, false) { replaceCurrentWord(word, s) })
                if (unknown) row.addView(chip("＋ save \"$word\"", false) {
                    dict.approve(word); prefs.saveDictionary(dict); refreshSuggestions()
                })
            }
        }
    }

    private var suggestionAsk = 0
    /** After dictation: words typed your way (tap to undo) and close ones to ask about (tap to use your spelling). */
    private data class SpellNote(val now: String, val other: String, val sure: Boolean)
    private var spellNotes: List<SpellNote> = emptyList()
    private var waveView: VoiceWaveView? = null
    /** The autocorrect answer for the word being typed, worked out in the background: (word, fix or null). */
    private var fixReady: Pair<String, String?>? = null
    private val suggester = java.util.concurrent.Executors.newSingleThreadExecutor()

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

    /** [rowDp] and [fullUnits] come from a Layout Lab layout: its row height, and the widest row so short rows end in space. */
    private fun keyRow(keys: List<Key>, rowDp: Int? = null, fullUnits: Float? = null): View {
        val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        val gap = KeyLook.dp(this, prefs.rowGapDp)
        val h = rowDp?.let { KeyLook.dp(this, it) - gap } ?: KeyLook.dp(this, prefs.keyHeightDp)
        fun space(w: Float) = row.addView(View(this), LinearLayout.LayoutParams(0, h, w))
        for (k in keys) {
            if (k.gap > 0f) space(k.gap)
            val v = keyView(k)
            row.addView(v, LinearLayout.LayoutParams(0, h, k.weight).apply {
                setMargins(KeyLook.dp(this@HelperBoardIme, 2), gap / 2, KeyLook.dp(this@HelperBoardIme, 2), gap / 2)
            })
        }
        val left = (fullUnits ?: 0f) - com.herdofhelpers.helperboard.core.LabLayout.units(keys)
        if (left > 0.01f) space(left)
        return row
    }

    private fun labelFor(k: Key): String = when (k.kind) {
        KeyKind.CHAR -> shift.apply(k.label)
        KeyKind.SHIFT -> when (shift.state) { Shift.OFF -> "⇧"; Shift.ONCE -> "⬆"; Shift.LOCKED -> "⇪" }
        KeyKind.MIC -> if (recorder != null) "⏹ " + (recorder?.dataBytes?.let { it / 32_000 } ?: 0) + "s" else "🎙"
        KeyKind.CAPS_LOCK -> if (shift.state == Shift.LOCKED) "⇪ ON" else k.label
        else -> k.label
    }

    private fun keyColors(k: Key, p: com.herdofhelpers.helperboard.core.HerdPalette): Pair<Int, Int> {
        val capsOn = (k.kind == KeyKind.SHIFT && shift.state != Shift.OFF) ||
            (k.kind == KeyKind.CAPS_LOCK && shift.state == Shift.LOCKED)
        return when {
            k.kind == KeyKind.MIC && recorder != null -> p.stop to p.onStop
            k.kind == KeyKind.MIC -> p.accent to p.onAccent
            capsOn -> p.good to p.onGood
            k.kind == KeyKind.CHAR || k.kind == KeyKind.SPACE -> p.surface to p.text
            else -> p.sunk to p.text
        }
    }

    /**
     * After a key press: change the letters (shift) and the suggestions in place. Rebuilding every key here is what
     * froze fast typing and dropped keys (raven575, 11-22): a thumb already down on an old key lost its press.
     */
    private fun refresh() {
        if (root == null) return
        val p = KeyLook.palette(this, prefs)
        for ((k, tv) in keyViews) {
            val label = labelFor(k)
            if (tv.text.toString() != label) tv.text = label
            if (k.kind == KeyKind.SHIFT || k.kind == KeyKind.CAPS_LOCK || k.kind == KeyKind.MIC) {
                val (c, ink) = keyColors(k, p)
                tv.setTextColor(ink)
                if (!tv.isPressed) tv.background = KeyLook.keyBackground(this, c, prefs.bubble, gradient = prefs.keyGradient, edge = p.border)
            }
        }
        refreshSuggestions()
    }

    @SuppressLint("ClickableViewAccessibility")
    private fun keyView(k: Key): TextView {
        val tv = KeyText(this)
        tv.face = face
        tv.text = labelFor(k)
        tv.gravity = Gravity.CENTER
        tv.textSize = if (k.label.length > 2) 14f else 20f
        tv.typeface = KeyLook.typeface(prefs)
        val p = KeyLook.palette(this, prefs)
        val (_, ink) = keyColors(k, p)
        keyViews += k to tv
        tv.setTextColor(ink)
        // A small mark in the corner shows what holding the key types (! over 1, ( over 9), so people know it's there.
        if (prefs.holdHints && (k.kind == KeyKind.CHAR) && emojiQuery == null) {
            tv.holdMark = Alternates.hint(k.label); tv.hintColor = p.muted
        }
        tv.background = KeyLook.keyBackground(this, keyColors(k, p).first, prefs.bubble, gradient = prefs.keyGradient, edge = p.border)
        tv.contentDescription = when (k.kind) {
            KeyKind.SPACE -> "space"; KeyKind.BACKSPACE -> "delete"; KeyKind.ENTER -> "enter"
            KeyKind.MIC -> "voice typing"; KeyKind.SHIFT -> "shift"; KeyKind.UNDO -> "undo"
            KeyKind.LEFT -> "cursor left"; KeyKind.RIGHT -> "cursor right"; else -> k.label
        }
        val repeats = k.kind == KeyKind.BACKSPACE || k.kind == KeyKind.LEFT || k.kind == KeyKind.RIGHT
        if (k.kind == KeyKind.CHAR && k.label.length == 1 && k.label[0].isLetter()) letterViews[k.label[0].lowercaseChar()] = tv
        if (k.kind == KeyKind.SPACE) spaceView = tv
        val canSwipe = k.kind == KeyKind.CHAR && prefs.swipeTyping && emojiQuery == null && mode == Mode.ABC &&
            !(policy.isPrivate && !prefs.allowPrivateSaving)
        tv.setOnTouchListener { v, e ->
            // After a hold, the choices bar is open: slide along it, lift to type the one under your finger.
            if (altOptions.isNotEmpty()) {
                when (e.actionMasked) {
                    MotionEvent.ACTION_MOVE -> pickAlternate(e.rawX)
                    MotionEvent.ACTION_UP -> { v.background = KeyLook.keyBackground(this, keyColors(k, p).first, prefs.bubble, gradient = prefs.keyGradient, edge = p.border); commitAlternate() }
                    MotionEvent.ACTION_CANCEL -> { v.background = KeyLook.keyBackground(this, keyColors(k, p).first, prefs.bubble, gradient = prefs.keyGradient, edge = p.border); hideAlternates() }
                }
                return@setOnTouchListener true
            }
            // Swipe typing: once the finger travels more than half a key, this press is a swipe, not a tap.
            if (canSwipe) when (e.actionMasked) {
                MotionEvent.ACTION_DOWN -> { v.getLocationOnScreen(swipeOrigin); swipePath.clear(); swipePath.add(Pt(swipeOrigin[0] + e.x, swipeOrigin[1] + e.y)); swiping = false }
                MotionEvent.ACTION_MOVE -> {
                    // Every touch point since the last event, so the ink line is smooth even on fast swipes.
                    // Screen place = the key's place + the touch's place on the key. (Not rawX: with two thumbs down,
                    // Android can hand a key the other thumb's raw place, which looked like a swipe.)
                    val ox = swipeOrigin[0].toFloat(); val oy = swipeOrigin[1].toFloat()
                    val sx = ox + e.x; val sy = oy + e.y
                    for (h in 0 until e.historySize) swipePath.add(Pt(e.getHistoricalX(h) + ox, e.getHistoricalY(h) + oy))
                    swipePath.add(Pt(sx, sy))
                    if (swiping && prefs.swipeTrail) trail?.add(sx, sy)
                    if (!swiping) {
                        val dx = sx - swipePath[0].x; val dy = sy - swipePath[0].y
                        if (Math.hypot(dx.toDouble(), dy.toDouble()) > v.width * 0.6) {
                            swiping = true; v.cancelLongPress(); v.isPressed = false; hidePreview()
                            if (testing) TypingTest.log.becameSwipe()
                            if (prefs.swipeTrail) trail?.let { t -> t.color = p.accent; t.clear(); swipePath.forEach { pt -> t.add(pt.x, pt.y) } }
                            v.background = KeyLook.keyBackground(this, keyColors(k, p).first, prefs.bubble, gradient = prefs.keyGradient, edge = p.border)
                        }
                    }
                    if (swiping) return@setOnTouchListener true
                }
                MotionEvent.ACTION_UP -> if (swiping) { swiping = false; trail?.lift(); finishSwipe(); return@setOnTouchListener true }
                MotionEvent.ACTION_CANCEL -> { swiping = false; trail?.lift() }
            }
            when (e.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    v.background = KeyLook.keyBackground(this, keyColors(k, p).first, prefs.bubble, gradient = prefs.keyGradient, pressed = true, edge = p.border)
                    buzz(v)
                    if (testing && (k.kind == KeyKind.CHAR || k.kind == KeyKind.SPACE)) {
                        val at = inFrame(v)
                        TypingTest.log.down(if (k.kind == KeyKind.SPACE) "space" else k.output, e.eventTime, at[0] + e.x, at[1] + e.y)
                    }
                    if ((k.kind == KeyKind.CHAR || k.kind == KeyKind.MULTI) && prefs.keyPreview) showPreview(v, labelFor(k), p)
                    if (repeats) startRepeat(k)
                }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                    v.background = KeyLook.keyBackground(this, keyColors(k, p).first, prefs.bubble, gradient = prefs.keyGradient, edge = p.border)
                    hidePreview()
                    if (repeats) stopRepeat()
                }
            }
            repeats // repeating keys handle the whole press here; the rest go on to click and long-press
        }
        tv.setOnClickListener { onKey(k) }
        tv.setOnLongClickListener {
            when (k.kind) {
                KeyKind.SHIFT -> { shift.lock(); refresh(); true }
                KeyKind.MODE_NUMBERS, KeyKind.SETTINGS -> { openSettings(); true }
                KeyKind.CHAR, KeyKind.MULTI -> {
                    val upper = shift.state != Shift.OFF
                    val options = if (k.kind == KeyKind.MULTI) k.items ?: prefs.multiKeyItems else Alternates.forKey(k.label, upper)
                    if (options.isEmpty() || emojiQuery != null) false
                    else { hidePreview(); showAlternates(tv, options, p); buzz(tv); true }
                }
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
            KeyKind.MULTI -> { forgetWord(); ic.commitText(k.output, 1); rerenderKeysIfShiftChanged() }
            KeyKind.CHAR -> {
                val out = shift.apply(k.output)
                lastFix = null; swipeAlternatives = emptyList(); lastSwiped = null; spellNotes = emptyList()
                if (out.length == 1 && (out[0].isLetter() || out[0] == '\'')) typed.append(out) else typed.clear()
                ic.commitText(out, 1)
                if (testing) TypingTest.log.typed(k.output, SystemClock.uptimeMillis())
                if (k.output.length == 1 && k.output[0].isLetter()) shift.afterLetter()
                rerenderKeysIfShiftChanged()
            }
            KeyKind.SPACE -> {
                // A space is only a space, unless the user turned autocorrect on; then a clear slip is fixed and
                // one tap of ⌫ (or the ↶ chip) puts back exactly what was typed.
                offerWordBeforeCursor()
                autocorrectBeforeSpace(ic)
                swipeAlternatives = emptyList(); lastSwiped = null
                ic.commitText(" ", 1)
                if (testing) TypingTest.log.typed("space", SystemClock.uptimeMillis())
                updateAutoCap(); refresh()
            }
            KeyKind.BACKSPACE -> { sendDownUpKeyEvents(KeyEvent.KEYCODE_DEL); updateAutoCap(); refresh() }
            KeyKind.ENTER -> {
                val action = currentInputEditorInfo?.imeOptions?.and(EditorInfo.IME_MASK_ACTION) ?: EditorInfo.IME_ACTION_NONE
                val multiLine = ((currentInputEditorInfo?.inputType ?: 0) and EditorInfo.TYPE_TEXT_FLAG_MULTI_LINE) != 0
                if (!multiLine && action != EditorInfo.IME_ACTION_NONE && action != EditorInfo.IME_ACTION_UNSPECIFIED) {
                    ic.performEditorAction(action)
                } else sendDownUpKeyEvents(KeyEvent.KEYCODE_ENTER)
                updateAutoCap(); refresh()
            }
            KeyKind.SHIFT -> { shift.tap(SystemClock.uptimeMillis()); refresh() }
            KeyKind.CAPS_LOCK -> { if (shift.state == Shift.LOCKED) shift.tap(0) else shift.lock(); refresh() }
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
            KeyKind.BACKSPACE -> when {
                repeatCount == 0 && undoFix() -> {}
                repeatCount > 22 -> { forgetWord(); deleteWord(redraw = false) }
                else -> { if (typed.isNotEmpty()) typed.setLength(typed.length - 1); lastFix = null; sendDownUpKeyEvents(KeyEvent.KEYCODE_DEL) }
            }
            KeyKind.LEFT -> { forgetWord(); sendDownUpKeyEvents(KeyEvent.KEYCODE_DPAD_LEFT) }
            KeyKind.RIGHT -> sendDownUpKeyEvents(KeyEvent.KEYCODE_DPAD_RIGHT)
            else -> {}
        }
    }
    private fun stopRepeat() {
        main.removeCallbacksAndMessages(repeatToken)
        // Redraw after the touch is finished, never inside it. Rebuilding the keys while Android is still
        // handing out this touch is what crashed the keyboard after fast or held ⌫ presses (video 11-20, 0:38).
        main.post { updateAutoCap(); refresh() }
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

    // ---------- Hold a key for more: capitals, accents, symbols, punctuation ----------

    private fun showAlternates(key: View, options: List<String>, p: com.herdofhelpers.helperboard.core.HerdPalette) {
        val bar = altBar ?: return
        val frame = bar.parent as? View ?: return
        bar.removeAllViews()
        val cellW = maxOf(key.width, KeyLook.dp(this, 40))
        // Long lists wrap to fit the keyboard's width.
        val perRow = maxOf(1, frame.width / cellW)
        val shown = options.take(perRow)
        for (o in shown) bar.addView(TextView(this).apply {
            text = o; gravity = Gravity.CENTER; textSize = 22f; setTextColor(p.text)
        }, LinearLayout.LayoutParams(cellW, ViewGroup.LayoutParams.MATCH_PARENT))
        val w = cellW * shown.size
        val h = (key.height * 1.25f).toInt()
        val k = IntArray(2); key.getLocationInWindow(k)
        val f = IntArray(2); frame.getLocationInWindow(f)
        val x = (k[0] - f[0]).coerceIn(0, (frame.width - w).coerceAtLeast(0))
        val y = (k[1] - f[1] - h).coerceAtLeast(0)
        bar.background = KeyLook.keyBackground(this, p.surface, 0, edge = p.accent, edgeDp = 2)
        bar.layoutParams = FrameLayout.LayoutParams(w, h).apply { leftMargin = x; topMargin = y }
        bar.visibility = View.VISIBLE
        altOptions = shown
        altPicked = 0
        highlightAlternate(p)
    }

    private fun pickAlternate(rawX: Float) {
        val bar = altBar ?: return
        val loc = IntArray(2); bar.getLocationOnScreen(loc)
        val cell = if (altOptions.isEmpty()) return else bar.width / altOptions.size
        val i = ((rawX - loc[0]) / cell).toInt().coerceIn(0, altOptions.size - 1)
        if (i != altPicked) { altPicked = i; highlightAlternate(KeyLook.palette(this, prefs)) }
    }

    private fun highlightAlternate(p: com.herdofhelpers.helperboard.core.HerdPalette) {
        val bar = altBar ?: return
        for (i in 0 until bar.childCount) (bar.getChildAt(i) as TextView).apply {
            val on = i == altPicked
            setTextColor(if (on) p.onAccent else p.text)
            background = if (on) KeyLook.keyBackground(this@HelperBoardIme, p.accent, 0, edge = p.accent) else null
        }
    }

    private fun commitAlternate() {
        val pick = altOptions.getOrNull(altPicked)
        hideAlternates()
        if (pick == null) return
        currentInputConnection?.commitText(pick, 1)
        if (pick.length == 1 && pick[0].isLetter()) shift.afterLetter()
        main.post { rerenderKeysIfShiftChanged() }
    }

    private fun hideAlternates() { altOptions = emptyList(); altBar?.visibility = View.GONE }

    // ---------- Key buzz, strength set by the user ----------

    private fun buzz(v: View) {
        val strength = prefs.keyBuzzStrength
        if (strength <= 0) return
        val vib = getSystemService(android.os.Vibrator::class.java)
        if (vib == null || !vib.hasVibrator()) { v.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP); return }
        val effect = if (vib.hasAmplitudeControl())
            android.os.VibrationEffect.createOneShot(18, (strength * 255 / 100).coerceIn(1, 255))
        else android.os.VibrationEffect.createOneShot((5 + strength * 25 / 100).toLong(), android.os.VibrationEffect.DEFAULT_AMPLITUDE)
        runCatching { vib.vibrate(effect) }
    }

    private var lastShiftDrawn = Shift.OFF
    private fun rerenderKeysIfShiftChanged() {
        lastShiftDrawn = shift.state; refresh()
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
        if (redraw) { updateAutoCap(); refresh() }
    }

    // ---------- Word list, autocorrect, swipe ----------

    private fun loadWords() {
        val lang = if (prefs.language.startsWith("es")) "es" else "en"
        if (lang == wordsLang && words != null) return
        wordsLang = lang
        Thread {
            val list = runCatching { WordList(assets.open("words-$lang.txt").bufferedReader().readLines()) }.getOrNull()
            main.post { if (wordsLang == lang) { words = list; refreshSuggestions() } }
        }.start()
    }

    private fun forgetWord() { typed.clear(); lastFix = null; swipeAlternatives = emptyList(); lastSwiped = null }

    /** Never in password or private boxes, or web and email addresses (T2, T7). */
    private fun autocorrectAllowed() = !policy.isPrivate && !policy.isWebOrEmail

    private fun autocorrectBeforeSpace(ic: android.view.inputmethod.InputConnection) {
        val word = typed.toString(); typed.clear(); lastFix = null
        if (!prefs.autocorrect || !autocorrectAllowed() || word.isEmpty()) return
        val before = PersonalDictionary.currentWord(ic.getTextBeforeCursor(40, 0) ?: "")
        if (before != word) return // the word wasn't all typed by keys just now (dictation, paste, cursor moved)
        val list = words ?: return
        // The suggestion bar usually worked this out already, off the main thread; reuse it rather than look again.
        val ready = fixReady?.takeIf { it.first == word }
        val fix = (if (ready != null) ready.second
            else Autocorrect.fix(word, list, known = { dict.isKnown(it) }, english = wordsLang == "en")) ?: return
        if (fix == word) return
        ic.deleteSurroundingText(word.length, 0)
        ic.commitText(fix, 1)
        lastFix = word to fix
    }

    /** ⌫ right after a fix puts back exactly what was typed (and drops the space the fix came with). */
    private fun undoFix(): Boolean {
        val (original, fixed) = lastFix ?: return false
        val ic = currentInputConnection ?: return false
        val before = ic.getTextBeforeCursor(fixed.length + 1, 0)?.toString() ?: return false
        lastFix = null
        if (before != "$fixed " && before != fixed) return false
        ic.deleteSurroundingText(before.length, 0)
        ic.commitText(original, 1)
        typed.clear()
        main.post { updateAutoCap(); refresh() }
        return true
    }

    private fun finishSwipe() {
        val list = words ?: return
        val path = ArrayList(swipePath)
        val centres = HashMap<Char, Pt>()
        var widths = 0f
        val loc = IntArray(2)
        for ((c, v) in letterViews) {
            v.getLocationOnScreen(loc)
            centres[c] = Pt(loc[0] + v.width / 2f, loc[1] + v.height / 2f); widths += v.width
        }
        if (centres.isEmpty()) return
        val keyWidth = widths / centres.size
        val caps = shift.state != com.herdofhelpers.helperboard.core.Shift.OFF
        Thread {
            val found = runCatching { SwipeDecoder(centres, keyWidth, list).decode(path, max = 6) }.getOrDefault(emptyList())  // best word + 5 others to pick from (raven575 11-23)
            main.post {
                if (testing) TypingTest.log.swiped(found)
                val ic = currentInputConnection ?: return@post
                if (found.isEmpty()) { notice = "Swipe not recognised. Try again, or tap the letters."; refreshSuggestions(); return@post }
                fun style(w: String) = if (caps) w.replaceFirstChar { it.uppercase() } else w
                val word = style(found[0])
                val before = ic.getTextBeforeCursor(1, 0)
                val gap = if (!before.isNullOrEmpty() && !before.last().isWhitespace()) " " else ""
                ic.commitText(gap + word, 1)
                typed.clear(); lastFix = null
                lastSwiped = word
                swipeAlternatives = found.drop(1).map { style(it) }
                if (shift.state == com.herdofhelpers.helperboard.core.Shift.ONCE) shift.afterLetter()
                updateAutoCap(); refresh()
            }
        }.start()
    }

    /** Swaps the last whole-word [old] in the recent text for [new], keeping everything typed after it. */
    private fun swapRecentWord(old: String, new: String) {
        val ic = currentInputConnection ?: return
        val before = ic.getTextBeforeCursor(400, 0)?.toString() ?: return
        val m = Regex("(?<![\\p{L}'])" + Regex.escape(old) + "(?![\\p{L}'])").findAll(before).lastOrNull() ?: return
        val tail = before.substring(m.range.first)
        ic.deleteSurroundingText(tail.length, 0)
        ic.commitText(new + tail.substring(old.length), 1)
    }

    private fun replaceSwiped(swiped: String, with: String) {
        val ic = currentInputConnection ?: return
        val before = ic.getTextBeforeCursor(swiped.length, 0)?.toString()
        if (before == swiped) { ic.deleteSurroundingText(swiped.length, 0); ic.commitText(with, 1) }
        lastSwiped = null; swipeAlternatives = emptyList()
        updateAutoCap(); refresh()
    }

    private fun replaceCurrentWord(word: String, with: String) {
        val ic = currentInputConnection ?: return
        ic.deleteSurroundingText(word.length, 0)
        ic.commitText("$with ", 1)
        updateAutoCap(); refresh()
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
        // Live voice: text appears while you talk; the whole take is still saved first, as always.
        val tr = Transcriber(this)
        if (prefs.liveVoice && tr.available()) {
            liveInsert = true
            live = LiveTranscriber(tr, takes.audio(take.id), take.language) { text -> insertDictation(text, liveInsert) }
                .also { it.start() }
        }
        render()
        tick()
    }

    private fun tick() {
        val rec = recorder ?: return
        micLabel?.text = "⏹ ${rec.dataBytes / 32_000}s"   // the wave above the keys draws itself every frame
        main.postDelayed({ tick() }, 250)
    }

    /** Dictated text starts a new word: add a space if it would run into the word before it. */
    private fun insertDictation(text: String, insert: Boolean) {
        if (!insert) return
        forgetWord()
        val ic = currentInputConnection ?: return
        val before = ic.getTextBeforeCursor(60, 0) ?: ""
        // Each part arrives capitalised as if it began a sentence, and edges can repeat a word: tidy the seam.
        var clean = com.herdofhelpers.helperboard.core.DictationJoin.clean(text, before)
        if (clean.isEmpty()) return
        // Taught spellings ("say it, spell it once"): sure matches are typed your way, close ones are asked about.
        val spell = com.herdofhelpers.helperboard.core.SpellOnce(com.herdofhelpers.helperboard.core.SpellOnce.parse(prefs.spellOnce)).apply(clean)
        clean = spell.text
        val gap = if (before.isNotEmpty() && !before.last().isWhitespace()) " " else ""
        ic.commitText(gap + clean + " ", 1)
        if (spell.changed.isNotEmpty() || spell.askAbout.isNotEmpty()) {
            spellNotes = spell.changed.map { (heard, spelled) -> SpellNote(spelled, heard, sure = true) } +
                spell.askAbout.map { (heard, spelled) -> SpellNote(heard, spelled, sure = false) }
            refreshSuggestions()
        }
    }

    private fun stopRecording(insert: Boolean) {
        val rec = recorder ?: return
        val take = recordingTake ?: return
        rec.stop()
        recorder = null; recordingTake = null
        main.removeCallbacksAndMessages(null)
        val audio = takes.audio(take.id)

        val lt = live
        if (lt != null) {
            live = null
            // Text already went in as you talked. Read the last part, then save the take's text. If live voice heard
            // nothing at all, fall back to reading the whole take.
            liveInsert = insert
            notice = "✍ Finishing the last words…"
            if (policy.saveTakes) { take.status = Take.STATUS_TRANSCRIBING; takes.save(take) }
            lt.finish { text ->
                if (text == null) { transcribeAndInsert(take, audio, insert, keep = policy.saveTakes); return@finish }
                if (policy.saveTakes) {
                    take.text = text; take.status = Take.STATUS_DONE; takes.save(take); takes.applyRetention(prefs)
                } else audio.delete()
                notice = if (lt.emptyParts > 0) "⚠ ${lt.emptyParts} of ${lt.parts} parts had no text. Play the take or tap Re-listen." else null
                render()
            }
            render()
            return
        }

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
            forgetWord()
            if (text != null) insertDictation(text, insert)
            render()
        }
    }

    // ---------- The keyboard test (Settings > 8): timing, dropped keys, where fingers land, and the robot ----------

    /** True while typing into the Settings test box. */
    private val testing get() = currentInputEditorInfo?.privateImeOptions?.contains(TypingTest.FIELD) == true

    private fun inFrame(v: View): IntArray {
        val a = IntArray(2); val f = IntArray(2)
        v.getLocationInWindow(a); frameView?.getLocationInWindow(f)
        return intArrayOf(a[0] - f[0], a[1] - f[1])
    }

    private fun keyBoxes(): Map<Char, com.herdofhelpers.helperboard.core.TypingLog.KeyBox> {
        val out = HashMap<Char, com.herdofhelpers.helperboard.core.TypingLog.KeyBox>()
        fun put(c: Char, v: View) { val at = inFrame(v); out[c] = com.herdofhelpers.helperboard.core.TypingLog.KeyBox(
            at[0] + v.width / 2f, at[1] + v.height / 2f, v.width.toFloat(), v.height.toFloat()) }
        letterViews.forEach { (c, v) -> put(c, v) }
        spaceView?.let { put(' ', it) }
        return out
    }

    private var stallWatch: android.view.Choreographer.FrameCallback? = null

    private fun startTypingTest() {
        main.postDelayed({ if (testing) TypingTest.keys = keyBoxes() }, 300)
        // A frame should come every 16 ms or so; the longest gap while testing is the longest freeze.
        if (stallWatch == null) {
            var last = 0L
            val cb = object : android.view.Choreographer.FrameCallback {
                override fun doFrame(nanos: Long) {
                    if (!testing) { stallWatch = null; return }
                    val ms = nanos / 1_000_000
                    if (last > 0) TypingTest.log.longestStallMs = maxOf(TypingTest.log.longestStallMs, ms - last - 16)
                    last = ms
                    android.view.Choreographer.getInstance().postFrameCallback(this)
                }
            }
            stallWatch = cb
            android.view.Choreographer.getInstance().postFrameCallback(cb)
        }
        // The Settings page starts the robot once this keyboard is up in the test box.
        TypingTest.startRobot = { sentence, gapMs ->
            val laidOut = (letterViews.values.firstOrNull()?.width ?: 0) > 0
            if (testing && laidOut && frameView != null) { runRobot(sentence, gapMs); true } else false
        }
    }

    /**
     * The robot: types [sentence] with two thumbs taking turns, one key every [gapMs] ms, each held 1.6 gaps so the
     * next thumb is already down before the last one lifts (that is how fast people type). Its touches go through
     * the same keys as a person's, so dropped keys and freezes show up exactly as they would on a phone.
     */
    private fun runRobot(sentence: String, gapMs: Int) {
        val frame = frameView ?: return
        android.util.Log.i("HBTEST", "keyboard: robot starts, ${letterViews.size} letter keys")
        TypingTest.log.clear()
        val boxes = keyBoxes().also { TypingTest.keys = it }
        data class Step(val at: Long, val down: Boolean, val id: Int, val x: Float, val y: Float)
        val start = SystemClock.uptimeMillis() + 300
        val steps = ArrayList<Step>()
        sentence.lowercase().forEachIndexed { i, c ->
            val b = boxes[c] ?: return@forEachIndexed
            val id = i % 2
            val t = start + i.toLong() * gapMs
            steps += Step(t, true, id, b.cx, b.cy); steps += Step(t + gapMs * 16L / 10, false, id, b.cx, b.cy)
        }
        steps.sortWith(compareBy<Step> { it.at }.thenBy { if (it.down) 1 else 0 })
        val active = java.util.TreeMap<Int, Pair<Float, Float>>()
        var downTime = 0L
        val token = Any()
        for (s in steps) main.postAtTime({
            if (s.down) active[s.id] = s.x to s.y
            if (active.size == 1 && s.down) downTime = s.at
            val ids = active.keys.toList()
            val index = ids.indexOf(s.id)
            val props = Array(ids.size) { MotionEvent.PointerProperties().apply { id = ids[it]; toolType = MotionEvent.TOOL_TYPE_FINGER } }
            val coords = Array(ids.size) { MotionEvent.PointerCoords().apply { x = active[ids[it]]!!.first; y = active[ids[it]]!!.second; pressure = 1f; size = 1f } }
            val action = when {
                s.down && ids.size == 1 -> MotionEvent.ACTION_DOWN
                s.down -> MotionEvent.ACTION_POINTER_DOWN or (index shl MotionEvent.ACTION_POINTER_INDEX_SHIFT)
                ids.size == 1 -> MotionEvent.ACTION_UP
                else -> MotionEvent.ACTION_POINTER_UP or (index shl MotionEvent.ACTION_POINTER_INDEX_SHIFT)
            }
            val ev = MotionEvent.obtain(downTime, s.at, action, ids.size, props, coords, 0, 0, 1f, 1f, 0, 0,
                android.view.InputDevice.SOURCE_TOUCHSCREEN, 0)
            frame.dispatchTouchEvent(ev); ev.recycle()
            if (!s.down) active.remove(s.id)
        }, token, s.at)
        val end = (steps.lastOrNull()?.at ?: start) + 1500
        main.postAtTime({
            val r = TypingTest.log.report(sentence, boxes)
            val got = currentInputConnection?.getTextBeforeCursor(500, 0)?.toString().orEmpty()
            val boxOk = got.trim().equals(sentence, ignoreCase = true)
            TypingTest.robotResult = listOf("Robot typed \"$got\" (${if (boxOk) "matches" else "does NOT match"}).") + r.lines()
            android.util.Log.i("HBTEST", "robot gap_ms=$gapMs box_ok=$boxOk ${r.machineLine()}")
            r.lines().forEach { android.util.Log.i("HBTEST", it) }
        }, token, end)
    }
}
