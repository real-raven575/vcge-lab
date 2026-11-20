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

    val themePhoto: File get() = File(app.filesDir, "theme-photo")

    // Personal dictionary, kept as a small text file in private storage.
    private val dictFile: File get() = File(app.filesDir, "dictionary.txt")
    fun loadDictionary(): PersonalDictionary =
        if (dictFile.exists()) PersonalDictionary.parse(dictFile.readText()) else PersonalDictionary()
    fun saveDictionary(d: PersonalDictionary) { dictFile.writeText(d.serialize()) }
}
