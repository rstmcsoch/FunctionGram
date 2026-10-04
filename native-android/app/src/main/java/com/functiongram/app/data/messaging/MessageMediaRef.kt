package com.functiongram.app.data.messaging

/**
 * Decides whether a message photo can be opened inside the app.
 * Absolute URLs and public `/api/media` keys are refused. Nothing here starts a browser.
 */
object MessageMediaRef {
    fun inAppMessageId(mediaUrl: String?, messageId: String): String? {
        if (mediaUrl.isNullOrBlank() || messageId.isBlank() || messageId.length > 100) return null
        if (':' in messageId || '/' in messageId || '\\' in messageId) return null
        val path = mediaUrl.trim().substringBefore('?').substringBefore('#')
        if ("://" in path) return null
        if (path.startsWith("//")) return null
        val prefix = "/api/message-media/"
        if (!path.startsWith(prefix)) return null
        val id = path.removePrefix(prefix)
        if (id.isEmpty() || id != messageId) return null
        if ('/' in id) return null
        return id
    }
}
