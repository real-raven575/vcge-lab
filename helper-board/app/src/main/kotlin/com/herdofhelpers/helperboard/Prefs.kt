package com.herdofhelpers.helperboard

import android.content.Context
import com.herdofhelpers.helperboard.core.ColourVision
import com.herdofhelpers.helperboard.core.HerdLook
import com.herdofhelpers.helperboard.core.NumberStyle
import com.herdofhelpers.helperboard.core.PersonalDictionary
import com.herdofhelpers.helperboard.core.RetentionSettings
import java.io.File

/** Every setting lives on the phone only, in the app's private storage. */
class Prefs(context: Context) {
    private val app = context.applicationContext
    private val sp = app.getSharedPreferences("helper_board", Context.MODE_PRIVATE)

    var numberStyle: NumberStyle
        get() = runCatching { NumberStyle.valueOf(sp.getString("numberStyle", "ROW")!!) }.getOrDefault(NumberStyle.ROW)
        set(v) = sp.edit().putString("numberStyle", v.name).apply()

    var keyHeightDp: Int
        get() = sp.getInt("keyHeightDp", 46)
        set(v) = sp.edit().putInt("keyHeightDp", v).apply()

    var rowGapDp: Int
        get() = sp.getInt("rowGapDp", 4)
        set(v) = sp.edit().putInt("rowGapDp", v).apply()

    var language: String
        get() = sp.getString("language", "en-US")!!
        set(v) = sp.edit().putString("language", v).apply()

    /** Word learning: off until the user turns it on. */
    var learnWords: Boolean
        get() = sp.getBoolean("learnWords", false)
        set(v) = sp.edit().putBoolean("learnWords", v).apply()

    /** Saving words or takes typed in password and private boxes: off until the user turns it on. */
    var allowPrivateSaving: Boolean
        get() = sp.getBoolean("allowPrivateSaving", false)
        set(v) = sp.edit().putBoolean("allowPrivateSaving", v).apply()

    /** A short buzz on every key press, so you feel each contact (raven575 video, 11-20). 0 = off, 100 = strongest. */
    var keyBuzzStrength: Int
        get() = sp.getInt("keyBuzzStrength", 50)
        set(v) = sp.edit().putInt("keyBuzzStrength", v).apply()

    var padLayout: com.herdofhelpers.helperboard.core.PadLayout
        get() = runCatching { com.herdofhelpers.helperboard.core.PadLayout.valueOf(sp.getString("padLayout", "PHONE")!!) }
            .getOrDefault(com.herdofhelpers.helperboard.core.PadLayout.PHONE)
        set(v) = sp.edit().putString("padLayout", v.name).apply()

    /** What the ✦ multi-key types: tap = the first item, hold = all of them. Stored one per line (older builds: spaces). */
    var multiKeyItems: List<String>
        get() = sp.getString("multiKeyItems", null)
            ?.let { if ('\n' in it) it.split('\n') else it.split(' ') }?.filter { it.isNotEmpty() }?.takeIf { it.isNotEmpty() }
            ?: com.herdofhelpers.helperboard.core.Layouts.DEFAULT_MULTI
        set(v) = sp.edit().putString("multiKeyItems", v.joinToString("\n")).apply()

    /** Autocorrect: off until the user turns it on (testers T2, T7). Never on dictation, passwords or addresses. */
    var autocorrect: Boolean
        get() = sp.getBoolean("autocorrect", false)
        set(v) = sp.edit().putBoolean("autocorrect", v).apply()

    /** The 🌐 and ⌄ keys: off, since most phones show them under the keyboard already (raven575, 11-21). */
    var showSystemKeys: Boolean
        get() = sp.getBoolean("showSystemKeys", false)
        set(v) = sp.edit().putBoolean("showSystemKeys", v).apply()
    /** An extra row of ` ~ \ | { } [ ] < > _ = for SSH, PowerShell and code. */
    var coderKeys: Boolean
        get() = sp.getBoolean("coderKeys", false)
        set(v) = sp.edit().putBoolean("coderKeys", v).apply()
    /** Small marks in key corners showing what a hold types (! over 1, ( over 9...). */
    var holdHints: Boolean
        get() = sp.getBoolean("holdHints", true)
        set(v) = sp.edit().putBoolean("holdHints", v).apply()
    var swipeTrail: Boolean
        get() = sp.getBoolean("swipeTrail", true)
        set(v) = sp.edit().putBoolean("swipeTrail", v).apply()

    /** Live voice: words appear while you talk (offline), instead of after you stop. */
    var liveVoice: Boolean
        get() = sp.getBoolean("liveVoice", true)
        set(v) = sp.edit().putBoolean("liveVoice", v).apply()

    var swipeTyping: Boolean
        get() = sp.getBoolean("swipeTyping", true)
        set(v) = sp.edit().putBoolean("swipeTyping", v).apply()

    /** "My colours": the three sliders, and keys shaded top to bottom. */
    var customColours: com.herdofhelpers.helperboard.core.CustomColours
        get() = com.herdofhelpers.helperboard.core.CustomColours(
            sp.getInt("customHue", 175), sp.getInt("customStrength", 45), sp.getInt("customBrightness", 10))
        set(v) = sp.edit().putInt("customHue", v.hue).putInt("customStrength", v.strength)
            .putInt("customBrightness", v.brightness).apply()
    var keyGradient: Boolean
        get() = sp.getBoolean("keyGradient", false)
        set(v) = sp.edit().putBoolean("keyGradient", v).apply()

    /** The letter pops up above your thumb so you can see which key you pressed. */
    var keyPreview: Boolean
        get() = sp.getBoolean("keyPreview", true)
        set(v) = sp.edit().putBoolean("keyPreview", v).apply()

    /** Which microphone voice typing uses: phone or Bluetooth (tester T5). */
    var useBluetoothMic: Boolean
        get() = sp.getBoolean("useBluetoothMic", false)
        set(v) = sp.edit().putBoolean("useBluetoothMic", v).apply()

    var keepDays: Int
        get() = sp.getInt("keepDays", 7)
        set(v) = sp.edit().putInt("keepDays", v).apply()

    var trashDays: Int
        get() = sp.getInt("trashDays", 14)
        set(v) = sp.edit().putInt("trashDays", v).apply()

    /** Storage limit for takes in MB; 0 = no limit. */
    var storageCapMb: Int
        get() = sp.getInt("storageCapMb", 0)
        set(v) = sp.edit().putInt("storageCapMb", v).apply()

    val retention: RetentionSettings
        get() = RetentionSettings(
            keepDays = keepDays,
            trashDays = trashDays,
            storageCapBytes = storageCapMb.takeIf { it > 0 }?.let { it * 1_048_576L },
        )

    // Theme
    var themeOpacity: Int  // 0..100
        get() = sp.getInt("themeOpacity", 70)
        set(v) = sp.edit().putInt("themeOpacity", v).apply()
    var themeTint: String  // NONE, ACCENT, GOOD, WARN, STOP: Herd colours only
        get() = sp.getString("themeTintName", "NONE")!!
        set(v) = sp.edit().putString("themeTintName", v).apply()
    var themeTile: Boolean
        get() = sp.getBoolean("themeTile", false)
        set(v) = sp.edit().putBoolean("themeTile", v).apply()
    var themeAlign: String  // TOP, CENTER, BOTTOM
        get() = sp.getString("themeAlign", "CENTER")!!
        set(v) = sp.edit().putString("themeAlign", v).apply()
    /** Herd Dark, Herd Light, or match the phone (first phone test: Herd theming only). */
    var herdLook: HerdLook
        get() = runCatching { HerdLook.valueOf(sp.getString("herdLook", "PHONE")!!) }.getOrDefault(HerdLook.PHONE)
        set(v) = sp.edit().putString("herdLook", v.name).apply()
    /** Colour vision, the same choices as vCGE. */
    var colourVision: ColourVision
        get() = runCatching { ColourVision.valueOf(sp.getString("colourVision", "TYPICAL")!!) }.getOrDefault(ColourVision.TYPICAL)
        set(v) = sp.edit().putString("colourVision", v.name).apply()
    var bubble: Int  // 0..100 bevel strength
        get() = sp.getInt("bubble", 60)
        set(v) = sp.edit().putInt("bubble", v).apply()
    var keyFont: String  // DEFAULT, SERIF, MONO, BOLD
        get() = sp.getString("keyFont", "DEFAULT")!!
        set(v) = sp.edit().putString("keyFont", v).apply()

    /** The 😀 tab on the mode strip (on by default). */
    var showEmoji: Boolean
        get() = sp.getBoolean("showEmoji", true)
        set(v) = sp.edit().putBoolean("showEmoji", v).apply()
    /** Up to 8 recently used emoji, newest first, kept on the phone only. */
    var recentEmoji: List<String>
        get() = sp.getString("recentEmoji", "")!!.split(" ").filter { it.isNotEmpty() }
        set(v) = sp.edit().putString("recentEmoji", v.joinToString(" ")).apply()

    /** How many recent emoji show at the top of the emoji window: 4 to 12 (raven575, 11-20). */
    var recentEmojiCount: Int
        get() = sp.getInt("recentEmojiCount", com.herdofhelpers.helperboard.core.EmojiBook.DEFAULT_RECENT)
        set(v) = sp.edit().putInt("recentEmojiCount", v).apply()

    /** Layout Lab code the user pasted in; empty = the standard keys. Used on the ABC page only. */
    var labLayout: String
        get() = sp.getString("labLayout", "")!!
        set(v) = sp.edit().putString("labLayout", v).apply()

    val themePhoto: File get() = File(app.filesDir, "theme-photo")

    // Personal dictionary, kept as a small text file in private storage.
    private val dictFile: File get() = File(app.filesDir, "dictionary.txt")
    fun loadDictionary(): PersonalDictionary =
        if (dictFile.exists()) PersonalDictionary.parse(dictFile.readText()) else PersonalDictionary()
    fun saveDictionary(d: PersonalDictionary) { dictFile.writeText(d.serialize()) }
}
