package com.herdofhelpers.helperboard

import android.content.Context
import java.io.File

/**
 * If the keyboard ever stops, the reason is written to a small file on the phone (never sent anywhere).
 * Settings shows it with a Copy button, so a tester can paste the real cause instead of guessing.
 * Only the error and where it happened are saved: no typed text.
 */
object CrashLog {
    private const val NAME = "last-crash.txt"
    @Volatile private var installed = false

    fun install(context: Context) {
        if (installed) return
        installed = true
        val file = File(context.filesDir, NAME)
        val build = runCatching { context.packageManager.getPackageInfo(context.packageName, 0).versionName }.getOrNull()
        val before = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { t, e ->
            runCatching {
                val trace = e.stackTraceToString().lineSequence().take(40).joinToString("\n")
                file.writeText("When (UTC): ${java.time.Instant.now()}\nApp build: $build\n" +
                    "Android: ${android.os.Build.VERSION.RELEASE}\nThread: ${t.name}\n\n$trace\n")
            }
            before?.uncaughtException(t, e)
        }
    }

    fun read(context: Context): String? = File(context.filesDir, NAME).takeIf { it.exists() }?.readText()
    fun clear(context: Context) { File(context.filesDir, NAME).delete() }
}
