package com.herdofhelpers.helperboard

import android.content.ComponentName
import android.content.Context
import android.content.pm.PackageManager

/**
 * The app icon menu (raven575, 11-22: "Icon choice can be a menu choice. Let's go with the buddy by default.").
 * Each icon by Team Creative is an <activity-alias> of VaultActivity in the manifest; exactly one is enabled.
 * The phone's own enabled/disabled state is the record of which icon is in use, so nothing is stored twice.
 */
object AppIcons {
    /** Alias name (after the package) to the name shown in Settings. The first is the default. */
    val ALL = listOf(
        "IconBuddy" to "Keycap Buddy",
        "IconIris" to "Iris the Lynx",
        "IconPeek" to "Cornerstone peeks",
        "IconOwl" to "Glyph the Owl",
        "IconTap" to "Cornerstone taps",
        "IconPaw" to "Plush paw",
    )

    private fun component(c: Context, alias: String) = ComponentName(c.packageName, "com.herdofhelpers.helperboard.$alias")

    fun current(c: Context): String = ALL.map { it.first }.firstOrNull { alias ->
        when (c.packageManager.getComponentEnabledSetting(component(c, alias))) {
            PackageManager.COMPONENT_ENABLED_STATE_ENABLED -> true
            PackageManager.COMPONENT_ENABLED_STATE_DEFAULT -> alias == ALL.first().first  // as the manifest says
            else -> false
        }
    } ?: ALL.first().first

    /** Turns the picked icon on first, then the rest off, so the app never has zero launcher icons. */
    fun use(c: Context, alias: String) {
        val pm = c.packageManager
        pm.setComponentEnabledSetting(component(c, alias), PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP)
        for ((other, _) in ALL) if (other != alias)
            pm.setComponentEnabledSetting(component(c, other), PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP)
    }
}
