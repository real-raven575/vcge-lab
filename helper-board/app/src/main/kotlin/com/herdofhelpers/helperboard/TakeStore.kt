package com.herdofhelpers.helperboard

import android.content.Context
import com.herdofhelpers.helperboard.core.Retention
import com.herdofhelpers.helperboard.core.RetentionAction
import com.herdofhelpers.helperboard.core.TakeMeta
import com.herdofhelpers.helperboard.core.Wav
import org.json.JSONObject
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** One voice take: the audio file plus what we know about it. */
data class Take(
    val id: String,
    val createdAtMs: Long,
    var lastTouchedMs: Long = createdAtMs,
    var kept: Boolean = false,
    var trashedAtMs: Long? = null,
    var text: String = "",
    var status: String = STATUS_RECORDING,
    var language: String = "en-US",
) {
    companion object {
        const val STATUS_RECORDING = "recording"
        const val STATUS_SAVED = "saved"          // audio safe, no text (yet)
        const val STATUS_TRANSCRIBING = "transcribing"
        const val STATUS_DONE = "done"
        const val STATUS_RECOVERED = "recovered"  // the app stopped mid-take; audio up to the last second is safe
    }
}

/** Takes live in the app's private folder: takes/<id>.wav and takes/<id>.json. Nothing leaves the phone. */
class TakeStore(context: Context) {
    private val dir = File(context.applicationContext.filesDir, "takes").apply { mkdirs() }

    fun audio(id: String) = File(dir, "$id.wav")
    private fun metaFile(id: String) = File(dir, "$id.json")

    fun newId(now: Long = System.currentTimeMillis()): String =
        "take-" + SimpleDateFormat("yyyyMMdd-HHmmss-SSS", Locale.US).format(Date(now))

    fun save(t: Take) {
        val j = JSONObject()
            .put("id", t.id).put("createdAtMs", t.createdAtMs).put("lastTouchedMs", t.lastTouchedMs)
            .put("kept", t.kept).put("text", t.text).put("status", t.status).put("language", t.language)
        t.trashedAtMs?.let { j.put("trashedAtMs", it) }
        val tmp = File(dir, "${t.id}.json.tmp")
        tmp.writeText(j.toString())
        tmp.renameTo(metaFile(t.id))
    }

    fun load(id: String): Take? = runCatching {
        val j = JSONObject(metaFile(id).readText())
        Take(
            id = j.getString("id"),
            createdAtMs = j.getLong("createdAtMs"),
            lastTouchedMs = j.optLong("lastTouchedMs", j.getLong("createdAtMs")),
            kept = j.optBoolean("kept"),
            trashedAtMs = if (j.has("trashedAtMs")) j.getLong("trashedAtMs") else null,
            text = j.optString("text"),
            status = j.optString("status", Take.STATUS_SAVED),
            language = j.optString("language", "en-US"),
        )
    }.getOrNull()

    /** All takes, newest first. A take still marked "recording" when nothing is recording is marked recovered. */
    fun all(activeId: String? = null): List<Take> {
        val takes = dir.listFiles { f -> f.name.endsWith(".json") }.orEmpty().mapNotNull { load(it.nameWithoutExtension) }
        takes.filter { it.status == Take.STATUS_RECORDING && it.id != activeId }.forEach {
            it.status = Take.STATUS_RECOVERED; save(it)
        }
        return takes.sortedByDescending { it.createdAtMs }
    }

    fun touch(t: Take) { t.lastTouchedMs = System.currentTimeMillis(); save(t) }

    fun delete(id: String) { audio(id).delete(); metaFile(id).delete() }

    fun seconds(id: String): Long = Wav.seconds((audio(id).length() - Wav.HEADER_BYTES).coerceAtLeast(0))

    /** Applies the cleanup rules. Returns how many takes moved to Trash and how many were deleted. */
    fun applyRetention(prefs: Prefs, activeId: String? = null): Pair<Int, Int> {
        val takes = all(activeId).filter { it.id != activeId }
        val metas = takes.map {
            TakeMeta(it.id, it.createdAtMs, audio(it.id).length(), it.kept, it.trashedAtMs, it.lastTouchedMs)
        }
        var trashed = 0; var purged = 0
        for (a in Retention.plan(metas, System.currentTimeMillis(), prefs.retention)) when (a) {
            is RetentionAction.MoveToTrash -> takes.first { it.id == a.id }.let {
                it.trashedAtMs = System.currentTimeMillis(); save(it); trashed++
            }
            is RetentionAction.Purge -> { delete(a.id); purged++ }
        }
        return trashed to purged
    }

    fun totalBytes(): Long = dir.listFiles().orEmpty().sumOf { it.length() }
}
