package com.functiongram.app.presentation.messaging

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import com.functiongram.app.data.messaging.MessagingCopy
import com.functiongram.app.data.messaging.MessagingRequests
import com.functiongram.app.data.messaging.PhotoPayload
import java.io.ByteArrayOutputStream

/**
 * Reads a photo the user picked. Does not request storage access.
 * The server still accepts or refuses the bytes.
 */
object PhotoPicker {
    fun read(context: Context, uri: Uri): PhotoPayload {
        val resolver = context.contentResolver
        val declared = resolver.getType(uri)?.substringBefore(';')?.trim()?.lowercase().orEmpty()
        val mime = if (declared.startsWith("image/")) declared else "image/jpeg"
        val name = displayName(context, uri)
        resolver.openInputStream(uri).use { input ->
            if (input == null) error(MessagingCopy.CHOOSE_FILE)
            val out = ByteArrayOutputStream()
            val buffer = ByteArray(8192)
            var total = 0
            while (true) {
                val read = input.read(buffer)
                if (read < 0) break
                total += read
                if (total > MessagingRequests.ABSOLUTE_UPLOAD_BYTES) error(MessagingCopy.TOO_LARGE)
                out.write(buffer, 0, read)
            }
            val bytes = out.toByteArray()
            if (bytes.isEmpty()) error(MessagingCopy.CHOOSE_FILE)
            return PhotoPayload(bytes = bytes, mime = mime, filename = name)
        }
    }

    private fun displayName(context: Context, uri: Uri): String {
        val queried = context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)
        queried?.use { cursor ->
            if (cursor.moveToFirst()) {
                val index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                if (index >= 0) {
                    val name = cursor.getString(index)?.trim().orEmpty()
                    if (name.isNotEmpty()) return name.take(120)
                }
            }
        }
        return "photo.jpg"
    }
}
