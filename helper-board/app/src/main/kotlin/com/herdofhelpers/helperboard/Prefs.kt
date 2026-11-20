package com.herdofhelpers.helperboard

import android.content.Context
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
    var themeTint: Int     // ARGB, 0 = none
        get() = sp.getInt("themeTint", 0)
        set(v) = sp.edit().putInt("themeTint", v).apply()
    var themeTile: Boolean
        get() = sp.getBoolean("themeTile", false)
        set(v) = sp.edit().putBoolean("themeTile", v).apply()
    var themeAlign: String  // TOP, CENTER, BOTTOM
        get() = sp.getString("themeAlign", "CENTER")!!
        set(v) = sp.edit().putString("themeAlign", v).apply()
    var keyColor: Int
        get() = sp.getInt("keyColor", 0xFF3A3F55.toInt())
        set(v) = sp.edit().putInt("keyColor", v).apply()
    var bubble: Int  // 0..100 bevel strength
        get() = sp.getInt("bubble", 60)
        set(v) = sp.edit().putInt("bubble", v).apply()
    var keyFont: String  // DEFAULT, SERIF, MONO, BOLD
        get() = sp.getString("keyFont", "DEFAULT")!!
        set(v) = sp.edit().putString("keyFont", v).apply()

    val themePhoto: File get() = File(app.filesDir, "theme-photo")

    // Personal dictionary, kept as a small text file in private storage.
    private val dictFile: File get() = File(app.filesDir, "dictionary.txt")
    fun loadDictionary(): PersonalDictionary =
        if (dictFile.exists()) PersonalDictionary.parse(dictFile.readText()) else PersonalDictionary()
    fun saveDictionary(d: PersonalDictionary) { dictFile.writeText(d.serialize()) }
}
