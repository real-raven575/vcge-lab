package com.herdofhelpers.helperboard

import android.content.ContentProvider
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.database.Cursor
import android.database.MatrixCursor
import android.net.Uri
import android.os.ParcelFileDescriptor
import android.provider.OpenableColumns
import java.io.File

/**
 * Share a take (raven575, 11-24: send the audio and the words it made, to compare them). Hands one take's WAV to the
 * app the person picks, read-only and only for that share: the provider isn't exported, and the picked app gets a
 * one-time grant. No internet is involved; the person chooses where it goes.
 */
class TakeShare : ContentProvider() {
    override fun onCreate() = true

    private fun fileFor(uri: Uri): File? {
        val id = uri.lastPathSegment?.removeSuffix(".wav") ?: return null
        if (!id.matches(Regex("[A-Za-z0-9_-]+"))) return null      // only a take id, never a path
        return TakeStore(context ?: return null).audio(id).takeIf { it.exists() }
    }

    override fun openFile(uri: Uri, mode: String): ParcelFileDescriptor? {
        if (mode != "r") throw SecurityException("Takes are shared read-only")
        return ParcelFileDescriptor.open(fileFor(uri) ?: return null, ParcelFileDescriptor.MODE_READ_ONLY)
    }

    override fun getType(uri: Uri) = "audio/wav"

    override fun query(uri: Uri, projection: Array<out String>?, s: String?, a: Array<out String>?, o: String?): Cursor? {
        val f = fileFor(uri) ?: return null
        return MatrixCursor(arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE)).apply { addRow(arrayOf(f.name, f.length())) }
    }

    override fun insert(uri: Uri, values: ContentValues?): Uri? = null
    override fun delete(uri: Uri, s: String?, a: Array<out String>?) = 0
    override fun update(uri: Uri, v: ContentValues?, s: String?, a: Array<out String>?) = 0

    companion object {
        fun intent(c: Context, take: Take): Intent {
            val uri = Uri.parse("content://${c.packageName}.takes/${take.id}.wav")
            val words = take.text.ifEmpty { "(no text yet)" }
            return Intent.createChooser(Intent(Intent.ACTION_SEND).apply {
                type = "audio/wav"
                putExtra(Intent.EXTRA_STREAM, uri)
                putExtra(Intent.EXTRA_SUBJECT, "Helper Board take")
                putExtra(Intent.EXTRA_TEXT, "What Helper Board heard:\n$words")
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                clipData = android.content.ClipData.newRawUri("take", uri)
            }, "Share this take")
        }
    }
}
