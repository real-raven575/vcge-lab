package com.herdofhelpers.helperboard

import android.Manifest
import android.app.Activity
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.Typeface
import android.media.MediaPlayer
import android.os.Bundle
import android.provider.Settings
import android.text.format.DateFormat
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.inputmethod.InputMethodManager
import android.widget.Button
import android.widget.CompoundButton
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.SeekBar
import android.widget.Switch
import android.widget.TextView
import android.widget.Toast
import com.herdofhelpers.helperboard.core.ColourVision
import com.herdofhelpers.helperboard.core.HerdLook
import com.herdofhelpers.helperboard.core.HerdPalette
import com.herdofhelpers.helperboard.core.HerdTheme
import com.herdofhelpers.helperboard.core.NumberStyle
import java.util.Date

/**
 * The Helper Board app: setup steps, the Take Vault (every take, with Keep / Toss / Re-listen), and all settings.
 * Everything stays on the phone.
 */
class VaultActivity : Activity() {
    private lateinit var prefs: Prefs
    private lateinit var takes: TakeStore
    private lateinit var page: LinearLayout
    private var player: MediaPlayer? = null
    private var tryBox: EditText? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = Prefs(this)
        takes = TakeStore(this)
        page = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            val p = dp(16); setPadding(p, p, p, p)
        }
        setContentView(ScrollView(this).apply { addView(page) })
    }

    // A second "open" while the page is already up arrives here, not in onCreate; keep it so build() sees it.
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
    }

    override fun onResume() {
        super.onResume()
        watchTakes()
        takes.applyRetention(prefs)
        build()
    }

    override fun onPause() {
        player?.release(); player = null
        main.removeCallbacksAndMessages(null)
        super.onPause()
    }

    // The keyboard can add takes while this page is open (the try-it box). Check every 2 s and redraw only the
    // Take Vault part, so the box keeps its focus and the keyboard stays up.
    private val main = android.os.Handler(android.os.Looper.getMainLooper())
    private var takesBox: LinearLayout? = null
    private var takesSeen = ""
    private fun takesSignature() = takes.all().joinToString { "${it.id}:${it.status}:${it.kept}:${it.trashedAtMs}" }
    private fun watchTakes() {
        main.postDelayed({
            val now = takesSignature()
            if (now != takesSeen) refreshTakes()
            watchTakes()
        }, 2_000)
    }
    private fun refreshTakes() {
        val box = takesBox ?: return
        val real = page
        box.removeAllViews(); page = box
        try { takesSection() } finally { page = real }
        takesSeen = takesSignature()
    }

    private var pal = HerdTheme.DARK

    private fun build() {
        pal = KeyLook.palette(this, prefs)
        window.decorView.setBackgroundColor(pal.bg)
        window.statusBarColor = pal.bg
        window.navigationBarColor = pal.bg
        page.removeAllViews()
        title("Helper Board")
        text("Types what you meant. Keeps what you said. Never goes online. (Prototype ${versionName()})")
        // The emulator test opens straight to the keyboard test, so the box is on screen.
        intent.getStringExtra(EXTRA_ROBOT)?.let { sentence ->
            intent.removeExtra(EXTRA_ROBOT)
            TypingTest.robotRequest = sentence to intent.getIntExtra(EXTRA_ROBOT_GAP, 80)
            testSection(); return
        }

        section("1. Set up")
        val enabled = (getSystemService(INPUT_METHOD_SERVICE) as InputMethodManager)
            .enabledInputMethodList.any { it.packageName == packageName }
        val micOk = checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
        button((if (enabled) "✅ " else "") + "Turn on Helper Board in keyboard settings") {
            startActivity(Intent(Settings.ACTION_INPUT_METHOD_SETTINGS))
        }
        button((if (micOk) "✅ " else "") + "Allow the microphone for voice typing") {
            requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), 1)
        }
        button("Switch to Helper Board now") {
            (getSystemService(INPUT_METHOD_SERVICE) as InputMethodManager).showInputMethodPicker()
        }
        page.addView(EditText(this).apply {
            hint = "Try Helper Board here"
            setTextColor(pal.text); setHintTextColor(pal.muted)
            id = View.generateViewId()
            tryBox = this
        })
        if (intent.getBooleanExtra(EXTRA_FOCUS_TRY, false)) tryBox?.post {
            intent.removeExtra(EXTRA_FOCUS_TRY)  // focus once, not on every return to this page
            window.setSoftInputMode(android.view.WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_VISIBLE)
            tryBox?.requestFocus()
            (getSystemService(INPUT_METHOD_SERVICE) as InputMethodManager).showSoftInput(tryBox, InputMethodManager.SHOW_IMPLICIT)
        }
        if (!Transcriber(this).available()) text(
            "ℹ️ Voice → text needs Android 13+ with an offline speech pack (Settings › System › Languages › " +
                "On-device speech recognition). Without it, every take is still saved as audio."
        )

        takesBox = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        page.addView(takesBox)
        refreshTakes()
        keyboardSection()
        themeSection()
        dictionarySection()
        privacySection()
        cleanupSection()
        testSection()
        text("© 2026 raven575, Herd of Helpers (claude) & gemini. No internet permission. Nothing leaves your phone.")
    }

    // ---------- Take Vault ----------

    private fun takesSection() {
        val all = takes.all()
        val live = all.filter { it.trashedAtMs == null }
        val trash = all.filter { it.trashedAtMs != null }
        section("2. Take Vault (${live.size})")
        text("Every take is saved as audio first. Keep it forever, toss it, or Re-listen to make the text again.")
        if (live.isEmpty()) text("No takes yet. Tap 🎙 on the keyboard and talk.")
        for (t in live) takeCard(t, inTrash = false)
        if (trash.isNotEmpty()) {
            section("🗑 Trash (${trash.size}), emptied after ${prefs.trashDays} days")
            for (t in trash) takeCard(t, inTrash = true)
        }
    }

    private fun takeCard(t: Take, inTrash: Boolean) {
        val card = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            val p = dp(10); setPadding(p, p, p, p)
            background = KeyLook.keyBackground(this@VaultActivity, pal.surface, 0, edge = pal.border)
        }
        val whenText = DateFormat.format("EEE MMM d, h:mm a", Date(t.createdAtMs))
        val status = when (t.status) {
            Take.STATUS_DONE -> ""
            Take.STATUS_RECOVERED -> " · recovered after the app stopped"
            Take.STATUS_TRANSCRIBING -> " · making text…"
            else -> " · audio only"
        }
        card.addView(small("${if (t.kept) "✅ Kept · " else ""}$whenText · ${takes.seconds(t.id)} s$status"))
        card.addView(TextView(this).apply {
            text = t.text.ifEmpty { "(no text yet)" }; textSize = 16f; setTextIsSelectable(true); setTextColor(pal.text)
        })
        val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        row.addView(smallButton("▶ Play") { play(t) })
        if (inTrash) {
            row.addView(smallButton("↩ Restore") { t.trashedAtMs = null; takes.touch(t); build() })
            row.addView(smallButton("Delete now") { confirmDelete(t) })
        } else {
            row.addView(smallButton(if (t.kept) "Unkeep" else "✅ Keep") { t.kept = !t.kept; takes.touch(t); build() })
            row.addView(smallButton("🗑 Toss") { t.trashedAtMs = System.currentTimeMillis(); takes.save(t); build() })
        }
        card.addView(row)
        val row2 = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        row2.addView(smallButton("🔁 Re-listen") { relisten(t) })
        if (t.text.isNotEmpty()) row2.addView(smallButton("📋 Copy") {
            (getSystemService(CLIPBOARD_SERVICE) as ClipboardManager).setPrimaryClip(ClipData.newPlainText("take", t.text))
            takes.touch(t); toast("Copied")
        })
        card.addView(row2)
        page.addView(card, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
            .apply { setMargins(0, dp(6), 0, dp(6)) })
    }

    private var pendingDelete: String? = null
    private fun confirmDelete(t: Take) {
        // Two taps, because this can't be undone.
        if (pendingDelete == t.id) { takes.delete(t.id); pendingDelete = null; build() }
        else { pendingDelete = t.id; toast("Tap Delete now again to delete this take for good") }
    }

    private fun play(t: Take) {
        player?.release()
        player = MediaPlayer().apply {
            setDataSource(takes.audio(t.id).path); prepare(); start()
        }
        takes.touch(t)
    }

    private fun relisten(t: Take) {
        t.status = Take.STATUS_TRANSCRIBING; takes.save(t); build()
        Transcriber(this).transcribe(takes.audio(t.id), t.language) { text, reason ->
            if (reason != null && text != null) toast(reason)
            if (text != null) { t.text = text; t.status = Take.STATUS_DONE } else {
                t.status = if (t.text.isEmpty()) Take.STATUS_SAVED else Take.STATUS_DONE
                toast(reason ?: "Couldn't make text")
            }
            takes.touch(t); build()
        }
    }

    // ---------- Settings ----------

    private fun keyboardSection() {
        section("3. Keys")
        choice("Numbers", listOf("Row on top" to NumberStyle.ROW, "Keypad grid" to NumberStyle.GRID, "Off" to NumberStyle.OFF),
            prefs.numberStyle) { prefs.numberStyle = it }
        choice("Number pad", com.herdofhelpers.helperboard.core.PadLayout.values().map { it.label to it }, prefs.padLayout) { prefs.padLayout = it }
        multiKeyEditor()
        labLayoutEditor()
        slider("Key height", 34, 72, prefs.keyHeightDp, "dp") { prefs.keyHeightDp = it }
        slider("Space between rows", 0, 16, prefs.rowGapDp, "dp") { prefs.rowGapDp = it }
        choice("Voice language", listOf("English" to "en-US", "Español" to "es-US"), prefs.language) { prefs.language = it }
        slider("Key buzz strength (0 = off)", 0, 100, prefs.keyBuzzStrength, "%") { prefs.keyBuzzStrength = it; testBuzz(it) }
        toggle("Swipe typing (slide across the letters)", prefs.swipeTyping) { prefs.swipeTyping = it }
        toggle("Show the swipe ink line", prefs.swipeTrail) { prefs.swipeTrail = it }
        toggle("Show hold hints (! over 1, ( over 9)", prefs.holdHints) { prefs.holdHints = it }
        toggle("Coder keys row ( ` ~ \\ | { } [ ] < > _ = )", prefs.coderKeys) { prefs.coderKeys = it }
        toggle("Show 🌐 switch and ⌄ hide keys (for phones without them)", prefs.showSystemKeys) { prefs.showSystemKeys = it }
        toggle("Autocorrect: fix clear slips when I press space (⌫ undoes it)", prefs.autocorrect) { prefs.autocorrect = it }
        text("Autocorrect never touches dictation, passwords, or web and email addresses. Word lists: wordfreq by Robyn Speer, CC BY-SA 4.0, " +
            "built from Google Books Ngrams, Wikipedia, ParaCrawl, the Leeds Internet Corpus, OpenSubtitles (opensubtitles.org) " +
            "and the SUBTLEX word lists by Marc Brysbaert et al. (SUBTLEX is freely available data). Full notice: WORDS-NOTICE.txt in the app.")
        toggle("Show the letter above my thumb", prefs.keyPreview) { prefs.keyPreview = it }
        toggle("Live voice: words appear as I talk (offline)", prefs.liveVoice) { prefs.liveVoice = it }
        toggle("Use Bluetooth mic (car, headset)", prefs.useBluetoothMic) { prefs.useBluetoothMic = it }
        toggle("Show the 😀 emoji tab", prefs.showEmoji) { prefs.showEmoji = it }
        slider("Recent emoji to show", com.herdofhelpers.helperboard.core.EmojiBook.MIN_RECENT,
            com.herdofhelpers.helperboard.core.EmojiBook.MAX_RECENT, prefs.recentEmojiCount, "") { prefs.recentEmojiCount = it }
        text("Tips: double-tap ⇧ for caps lock. Hold ⌫ to keep deleting (it speeds up to whole words). " +
            "Tap ⚙ on the keyboard, or hold 123, to come straight here. Hold the space bar to switch keyboards.")
        crashBox()
    }

    /** A short buzz while the strength slider moves, so you feel the setting. */
    private fun testBuzz(strength: Int) {
        if (strength <= 0) return
        val vib = getSystemService(android.os.Vibrator::class.java) ?: return
        val effect = if (vib.hasAmplitudeControl())
            android.os.VibrationEffect.createOneShot(18, (strength * 255 / 100).coerceIn(1, 255))
        else android.os.VibrationEffect.createOneShot((5 + strength * 25 / 100).toLong(), android.os.VibrationEffect.DEFAULT_AMPLITUDE)
        runCatching { vib.vibrate(effect) }
    }

    /** The ✦ multi-key: tap types the first item, hold shows them all. Items are separated by spaces. */
    /** The ✦ multi-key's items, one per line, so an item can hold spaces (a word or short phrase). */
    private fun multiKeyEditor() {
        page.addView(TextView(this).apply {
            text = "✦ multi-key (top letter row). One item per line: tap types the first line, hold shows them all in this order. " +
                "Up to 12 items, 12 characters each. For more control, use the Layout Lab page."
            textSize = 15f; setTextColor(pal.text); setPadding(0, dp(8), 0, 0)
        })
        val box = android.widget.EditText(this).apply {
            setText(prefs.multiKeyItems.joinToString("\n")); setTextColor(pal.text); textSize = 16f
            minLines = 3; maxLines = 12; gravity = android.view.Gravity.TOP or android.view.Gravity.START
            inputType = android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_FLAG_MULTI_LINE
        }
        page.addView(box)
        val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        row.addView(smallButton("Save ✦ items") {
            val items = box.text.toString().lines().map { it.trim().take(12) }.filter { it.isNotEmpty() }.take(12)
            if (items.isEmpty()) toast("Add at least one item") else { prefs.multiKeyItems = items; toast("Saved"); build() }
        })
        row.addView(smallButton("Reset") {
            prefs.multiKeyItems = com.herdofhelpers.helperboard.core.Layouts.DEFAULT_MULTI; build()
        })
        page.addView(row)
    }

    /** "Use my own key layout": paste code from the Layout Lab page. Bad code is refused with the reason. */
    private fun labLayoutEditor() {
        val now = prefs.labLayout.takeIf { it.isNotBlank() }?.let { com.herdofhelpers.helperboard.core.LabLayout.parse(it).getOrNull() }
        page.addView(TextView(this).apply {
            text = "Use my own key layout. Make one in the Layout Lab page, tap Copy code there, then paste it here. " +
                "It changes the letters page only. Now using: " + (now?.name ?: "Helper Board standard")
            textSize = 15f; setTextColor(pal.text); setPadding(0, dp(8), 0, 0)
        })
        val box = android.widget.EditText(this).apply {
            hint = "Paste Layout Lab code"; setTextColor(pal.text); textSize = 13f; minLines = 2; maxLines = 5
        }
        page.addView(box)
        val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        row.addView(smallButton("Use this layout") {
            val code = box.text.toString()
            com.herdofhelpers.helperboard.core.LabLayout.parse(code)
                .onSuccess { prefs.labLayout = code; toast("Using " + it.name); build() }
                .onFailure { toast(it.message ?: "That code can't be used.") }
        })
        if (now != null) row.addView(smallButton("Back to standard") { prefs.labLayout = ""; toast("Standard keys"); build() })
        page.addView(row)
    }

    /** "My colours": hue, strength and brightness sliders with a live sample. Text colours stay readable by design. */
    private fun customColoursEditor() {
        val sample = TextView(this).apply {
            text = "  Sample  a b c  ⏎  "; textSize = 18f; gravity = android.view.Gravity.CENTER
            setPadding(dp(8), dp(14), dp(8), dp(14))
        }
        fun paint() {
            val p = com.herdofhelpers.helperboard.core.HerdTheme.custom(prefs.customColours)
            sample.setTextColor(p.text)
            sample.background = android.graphics.drawable.LayerDrawable(arrayOf(
                android.graphics.drawable.ColorDrawable(p.bg),
                KeyLook.keyBackground(this, p.surface, prefs.bubble, edge = p.border, gradient = prefs.keyGradient)))
        }
        paint()
        val c = prefs.customColours
        slider("Colour (hue)", 0, 359, c.hue, "°") { prefs.customColours = prefs.customColours.copy(hue = it); paint() }
        slider("Colour strength", 0, 100, c.strength, "%") { prefs.customColours = prefs.customColours.copy(strength = it); paint() }
        slider("Brightness", 0, 100, c.brightness, "%") { prefs.customColours = prefs.customColours.copy(brightness = it); paint() }
        page.addView(sample, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
            setMargins(0, dp(6), 0, dp(6))
        })
        button("Use these colours on this page too") { build() }
    }

    /** If the keyboard stopped, show why, with a Copy button for the tester. Nothing is sent anywhere. */
    private fun crashBox() {
        val log = CrashLog.read(this) ?: return
        section("⚠ The keyboard stopped last time")
        text("Tap Copy and paste this to Claude, so the real cause gets fixed. It holds no typed text.")
        text(log.lineSequence().take(8).joinToString("\n"))
        button("📋 Copy the details") {
            (getSystemService(CLIPBOARD_SERVICE) as ClipboardManager).setPrimaryClip(ClipData.newPlainText("crash", log))
        }
        button("Clear it") { CrashLog.clear(this); build() }
    }

    private fun themeSection() {
        section("4. Look (all free)")
        choice("Colours", HerdLook.values().map { it.label to it }, prefs.herdLook) { prefs.herdLook = it }
        if (prefs.herdLook == HerdLook.CUSTOM) customColoursEditor()
        toggle("Shaded keys (gradient)", prefs.keyGradient) { prefs.keyGradient = it }
        choice("Colour vision", ColourVision.values().map { it.label to it }, prefs.colourVision) { prefs.colourVision = it }
        text(prefs.colourVision.hint)
        button(if (prefs.themePhoto.exists()) "🖼 Change photo" else "🖼 Pick a photo for the keyboard") {
            startActivityForResult(Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                addCategory(Intent.CATEGORY_OPENABLE); type = "image/*"
            }, PICK_PHOTO)
        }
        if (prefs.themePhoto.exists()) {
            button("Remove photo") { prefs.themePhoto.delete(); build() }
            slider("Photo strength", 0, 100, prefs.themeOpacity, "%") { prefs.themeOpacity = it }
            toggle("Tile the photo", prefs.themeTile) { prefs.themeTile = it }
            choice("Photo position", listOf("Top" to "TOP", "Middle" to "CENTER", "Bottom" to "BOTTOM"), prefs.themeAlign) {
                prefs.themeAlign = it
            }
            choice("Photo tint (Herd colours)", listOf("None" to "NONE", "Teal" to "ACCENT", "Green" to "GOOD",
                "Gold" to "WARN", "Coral" to "STOP"), prefs.themeTint) { prefs.themeTint = it }
        }
        slider("Bubble look", 0, 100, prefs.bubble, "%") { prefs.bubble = it }
        choice("Key font", listOf("Standard" to "DEFAULT", "Serif" to "SERIF", "Mono" to "MONO", "Bold" to "BOLD"),
            prefs.keyFont) { prefs.keyFont = it }
        text("A dyslexia-friendly key font comes next.")
        choice("App icon (by Team Creative)", AppIcons.ALL.map { it.second to it.first }, AppIcons.current(this)) {
            AppIcons.use(this, it)
        }
        text("Your home screen can take a few seconds to show the new icon.")
    }

    @Deprecated("Activity result API needs AndroidX; this prototype stays framework-only.")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == PICK_PHOTO && resultCode == RESULT_OK) data?.data?.let { uri ->
            runCatching {
                contentResolver.openInputStream(uri)!!.use { input ->
                    prefs.themePhoto.outputStream().use { input.copyTo(it) }
                }
            }.onFailure { toast("Couldn't read that photo") }
            build()
        }
    }

    private fun dictionarySection() {
        val d = prefs.loadDictionary()
        section("5. My words (${d.words.size})")
        text("Words you save are never marked wrong. Nothing is ever changed without your tap.")
        toggle("Learn new words as I type (asks before saving)", prefs.learnWords) { prefs.learnWords = it }
        for (w in d.pending) {
            val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
            row.addView(TextView(this).apply { text = "Save \"$w\"?"; textSize = 16f; setTextColor(pal.text) },
                LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
            row.addView(smallButton("Yes") { d.approve(w); prefs.saveDictionary(d); build() })
            row.addView(smallButton("No") { d.reject(w); prefs.saveDictionary(d); build() })
            page.addView(row)
        }
        if (d.words.isNotEmpty()) {
            text(d.words.joinToString(" · "))
            button("Clear all my words") { prefs.saveDictionary(com.herdofhelpers.helperboard.core.PersonalDictionary()); build() }
        }
    }

    private fun privacySection() {
        section("6. Privacy")
        text("Password boxes and private (incognito) boxes are never learned and their takes are never saved.")
        toggle("Also save in private boxes (not recommended)", prefs.allowPrivateSaving) { prefs.allowPrivateSaving = it }
    }

    /** Settings > 8: type a sentence (or let the robot type it fast) and see speed, dropped keys and aim. */
    private fun testSection() {
        section("8. Test the keyboard")
        text("Type this sentence in the box below, as fast as you like:")
        page.addView(TextView(this).apply {
            text = TypingTest.SENTENCE; textSize = 18f; setTypeface(typeface, Typeface.BOLD); setTextColor(pal.text)
        })
        text("Tap the letters, or swipe each word, then press Show results. Nothing here is saved.")
        val box = EditText(this).apply {
            hint = "Type the sentence here"; contentDescription = "Typing test box"
            privateImeOptions = TypingTest.FIELD
            setTextColor(pal.text); setHintTextColor(pal.muted)
            id = View.generateViewId()
        }
        page.addView(box)
        val results = TextView(this).apply { textSize = 15f; setTextColor(pal.text); setPadding(0, dp(6), 0, dp(6)) }
        fun show(lines: List<String>) { results.text = lines.joinToString("\n") }
        button("Show results") {
            val got = box.text.toString().trim()
            show(listOf("You typed \"$got\" (${if (got.equals(TypingTest.SENTENCE, true)) "matches" else "does not match"}).") +
                TypingTest.report().lines())
        }
        button("Start over") { TypingTest.log.clear(); box.setText(""); results.text = "" }
        button("🤖 Robot test: two fast thumbs, 12 keys a second") {
            box.setText(""); TypingTest.log.clear(); TypingTest.robotResult = emptyList()
            TypingTest.robotRequest = TypingTest.SENTENCE to 80
            box.requestFocus()
            (getSystemService(INPUT_METHOD_SERVICE) as InputMethodManager).restartInput(box)
            results.text = "The robot starts in a moment. Keep your fingers off the keyboard, then press Show robot results."
        }
        button("Show robot results") { show(TypingTest.robotResult.ifEmpty { listOf("No robot run yet.") }) }
        page.addView(results)
    }

    private fun cleanupSection() {
        section("7. Cleanup")
        text("Untouched takes move to Trash, then Trash empties. Kept takes are never removed. Using ${takes.totalBytes() / 1_048_576} MB.")
        slider("Move to Trash after", 1, 60, prefs.keepDays, "days") { prefs.keepDays = it }
        slider("Empty Trash after", 1, 60, prefs.trashDays, "days") { prefs.trashDays = it }
        slider("Storage limit (0 = none)", 0, 2000, prefs.storageCapMb, "MB") { prefs.storageCapMb = it }
    }

    // ---------- Small UI helpers ----------

    private fun dp(v: Int) = KeyLook.dp(this, v)
    private fun toast(s: String) = Toast.makeText(this, s, Toast.LENGTH_SHORT).show()
    private fun versionName(): String = runCatching { packageManager.getPackageInfo(packageName, 0).versionName }.getOrNull() ?: "?"

    // Every piece of the page is drawn in the Herd palette (pal), so Herd Dark, Herd Light and colour vision all apply here too.
    private fun title(s: String) = page.addView(TextView(this).apply {
        text = s; textSize = 28f; setTypeface(typeface, Typeface.BOLD); setTextColor(pal.text)
    })
    private fun section(s: String) = page.addView(TextView(this).apply {
        text = s; textSize = 20f; setTypeface(typeface, Typeface.BOLD); setPadding(0, dp(20), 0, dp(6)); setTextColor(pal.accentText())
    })
    private fun text(s: String) = page.addView(TextView(this).apply {
        text = s; textSize = 15f; setPadding(0, dp(4), 0, dp(4)); setTextColor(pal.text)
    })
    private fun small(s: String) = TextView(this).apply { text = s; textSize = 13f; setTextColor(pal.muted) }
    private fun styled(b: Button, picked: Boolean = false, size: Float = 15f) = b.apply {
        isAllCaps = false; textSize = size; stateListAnimator = null
        setTextColor(if (picked) pal.onAccent else pal.text)
        background = KeyLook.keyBackground(this@VaultActivity, if (picked) pal.accent else pal.surface, 0,
            edge = if (picked) pal.text else pal.border, edgeDp = if (picked) 2 else 1)
        val p = dp(12); setPadding(p, 0, p, 0)
    }
    private fun button(s: String, onClick: () -> Unit) = page.addView(styled(Button(this)).apply {
        text = s; setOnClickListener { onClick() }
    }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
        setMargins(0, dp(3), 0, dp(3))
    })
    private fun smallButton(s: String, picked: Boolean = false, onClick: () -> Unit) = styled(Button(this), picked, 13f).apply {
        text = s; setOnClickListener { onClick() }
        layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
            setMargins(dp(3), dp(3), dp(3), dp(3))
        }
    }

    private fun toggle(s: String, on: Boolean, set: (Boolean) -> Unit) = page.addView(Switch(this).apply {
        text = s; textSize = 15f; isChecked = on; setTextColor(pal.text)
        setOnCheckedChangeListener { _: CompoundButton, v: Boolean -> set(v) }
    })

    private fun slider(s: String, min: Int, max: Int, value: Int, unit: String, set: (Int) -> Unit) {
        val label = TextView(this).apply { text = "$s: $value $unit"; textSize = 15f; setTextColor(pal.text) }
        page.addView(label)
        page.addView(SeekBar(this).apply {
            this.max = max - min; progress = value - min
            setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
                override fun onProgressChanged(sb: SeekBar, p: Int, fromUser: Boolean) {
                    label.text = "$s: ${p + min} $unit"; if (fromUser) set(p + min)
                }
                override fun onStartTrackingTouch(sb: SeekBar) {}
                override fun onStopTrackingTouch(sb: SeekBar) {}
            })
        })
    }

    /** Options as buttons. The picked one is filled in the Herd accent with a ✓ and a bold edge, so it shows on every look. */
    private fun <T> choice(s: String, options: List<Pair<String, T>>, current: T, set: (T) -> Unit) {
        page.addView(TextView(this).apply { text = s; textSize = 15f; setTextColor(pal.text); setPadding(0, dp(8), 0, 0) })
        options.chunked(3).forEach { chunk ->
            val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
            for ((name, v) in chunk) row.addView(smallButton((if (v == current) "✓ " else "") + name, picked = v == current) {
                set(v); build()
            })
            page.addView(row)
        }
    }

    /** Headings in the accent colour when it reads well on the page, else in the text colour. */
    private fun HerdPalette.accentText(): Int = if (HerdTheme.contrast(accent, bg) >= 4.5) accent else text

    companion object {
        private const val PICK_PHOTO = 7
        /** Used by the emulator smoke test: open with the try-it box focused so the keyboard appears. */
        const val EXTRA_FOCUS_TRY = "focusTry"
        /** Used by the emulator test: open on the keyboard test and have the robot type this sentence. */
        const val EXTRA_ROBOT = "robot"
        const val EXTRA_ROBOT_GAP = "robotGapMs"
    }
}
