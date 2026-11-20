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
        takes.applyRetention(prefs)
        build()
    }

    override fun onPause() {
        player?.release(); player = null
        super.onPause()
    }

    private fun build() {
        page.removeAllViews()
        title("Helper Board")
        text("Types what you meant. Keeps what you said. Never goes online. (Prototype ${versionName()})")

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

        takesSection()
        keyboardSection()
        themeSection()
        dictionarySection()
        privacySection()
        cleanupSection()
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
            setBackgroundColor(0x22888888)
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
            text = t.text.ifEmpty { "(no text yet)" }; textSize = 16f; setTextIsSelectable(true)
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
        slider("Key height", 34, 72, prefs.keyHeightDp, "dp") { prefs.keyHeightDp = it }
        slider("Space between rows", 0, 16, prefs.rowGapDp, "dp") { prefs.rowGapDp = it }
        choice("Voice language", listOf("English" to "en-US", "Español" to "es-US"), prefs.language) { prefs.language = it }
        toggle("Use Bluetooth mic (car, headset)", prefs.useBluetoothMic) { prefs.useBluetoothMic = it }
        text("Tips: double-tap ⇧ for caps lock, hold ⌫ to delete a word, hold the space bar to switch keyboards.")
    }

    private fun themeSection() {
        section("4. Look (all free)")
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
            text("Photo tint")
            palette(includeNone = true, selected = prefs.themeTint) { prefs.themeTint = it }
        }
        text("Key color")
        palette(includeNone = false, selected = prefs.keyColor) { prefs.keyColor = it }
        slider("Bubble look", 0, 100, prefs.bubble, "%") { prefs.bubble = it }
        choice("Key font", listOf("Standard" to "DEFAULT", "Serif" to "SERIF", "Mono" to "MONO", "Bold" to "BOLD"),
            prefs.keyFont) { prefs.keyFont = it }
        text("Dyslexia-friendly fonts and colorblind palettes come next.")
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
            row.addView(TextView(this).apply { text = "Save \"$w\"?"; textSize = 16f },
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

    private fun title(s: String) = page.addView(TextView(this).apply { text = s; textSize = 28f; setTypeface(typeface, Typeface.BOLD) })
    private fun section(s: String) = page.addView(TextView(this).apply {
        text = s; textSize = 20f; setTypeface(typeface, Typeface.BOLD); setPadding(0, dp(20), 0, dp(6))
    })
    private fun text(s: String) = page.addView(TextView(this).apply { text = s; textSize = 15f; setPadding(0, dp(4), 0, dp(4)) })
    private fun small(s: String) = TextView(this).apply { text = s; textSize = 13f; alpha = 0.8f }
    private fun button(s: String, onClick: () -> Unit) = page.addView(Button(this).apply {
        text = s; isAllCaps = false; setOnClickListener { onClick() }
    })
    private fun smallButton(s: String, onClick: () -> Unit) = Button(this).apply {
        text = s; isAllCaps = false; textSize = 13f; setOnClickListener { onClick() }
    }

    private fun toggle(s: String, on: Boolean, set: (Boolean) -> Unit) = page.addView(Switch(this).apply {
        text = s; textSize = 15f; isChecked = on
        setOnCheckedChangeListener { _: CompoundButton, v: Boolean -> set(v) }
    })

    private fun slider(s: String, min: Int, max: Int, value: Int, unit: String, set: (Int) -> Unit) {
        val label = TextView(this).apply { text = "$s: $value $unit"; textSize = 15f }
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

    private fun <T> choice(s: String, options: List<Pair<String, T>>, current: T, set: (T) -> Unit) {
        page.addView(TextView(this).apply { text = s; textSize = 15f })
        val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        for ((name, v) in options) row.addView(smallButton((if (v == current) "● " else "○ ") + name) { set(v); build() })
        page.addView(row)
    }

    private fun palette(includeNone: Boolean, selected: Int, set: (Int) -> Unit) {
        val colors = (if (includeNone) listOf(0) else emptyList()) + KeyLook.PALETTE.toList()
        colors.chunked(6).forEach { chunk ->
            val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
            for (c in chunk) row.addView(View(this).apply {
                background = KeyLook.keyBackground(this@VaultActivity, if (c == 0) Color.LTGRAY else c, 30)
                contentDescription = if (c == 0) "no tint" else "color"
                alpha = if (c == selected) 1f else 0.6f
                setOnClickListener { set(c); build() }
            }, LinearLayout.LayoutParams(dp(40), dp(40)).apply { setMargins(dp(4), dp(4), dp(4), dp(4)) })
            page.addView(row)
        }
    }

    companion object {
        private const val PICK_PHOTO = 7
        /** Used by the emulator smoke test: open with the try-it box focused so the keyboard appears. */
        const val EXTRA_FOCUS_TRY = "focusTry"
    }
}
