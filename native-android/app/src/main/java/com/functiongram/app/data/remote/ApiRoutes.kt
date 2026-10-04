package com.functiongram.app.data.remote

/**
 * Existing FunctionGram HTTP routes. Reads and writes stay on the Next.js API.
 * There is no Turso, admin, or second account system in this client.
 */
object ApiRoutes {
    const val HEALTH = "/api/health"
    const val AUTH = "/api/auth"
    const val SOCIAL = "/api/social"
    const val UPLOAD = "/api/upload"
    const val UPLOAD_COMPLETE = "/api/upload/complete"
    const val MEDIA = "/api/media"
    const val MESSAGE_ATTACHMENT = "/api/message-attachment"
    const val MESSAGE_MEDIA = "/api/message-media"
    const val SIGN_IN_EMAIL = "sign-in/email"
    const val GET_SESSION = "get-session"
    const val SIGN_OUT = "sign-out"
    const val VERIFY_TOTP = "two-factor/verify-totp"

    fun health(origin: String): String = join(origin, HEALTH)

    fun social(origin: String): String = join(origin, SOCIAL)

    fun auth(origin: String, path: String): String = join(origin, "$AUTH/${path.trimStart('/')}")

    fun media(origin: String, key: String): String = join(origin, "$MEDIA/${key.trimStart('/')}")

    fun messageAttachment(origin: String): String = join(origin, MESSAGE_ATTACHMENT)

    /**
     * Participant media. The id is a message id, never a storage key and never
     * an absolute URL. Callers must not pass a value taken from an arbitrary host.
     */
    fun messageMedia(origin: String, messageId: String): String {
        require(messageId.isNotBlank() && messageId.length <= 100) { "Invalid message id." }
        require(!messageId.contains('/') && !messageId.contains('\\') && !messageId.contains("..")) {
            "Invalid message id."
        }
        require('?' !in messageId && '#' !in messageId && ':' !in messageId) { "Invalid message id." }
        return join(origin, "$MESSAGE_MEDIA/$messageId")
    }

    /** `GET /api/social?conversations=<filter>&limit=`. Filter names are the server's. */
    fun conversations(origin: String, filter: String = "all", limit: Int = 100): String {
        val safe = if (filter in CONVERSATION_FILTERS) filter else "all"
        val bounded = limit.coerceIn(1, 200)
        return social(origin) + "?conversations=" + encode(safe) + "&limit=" + bounded
    }

    /** `GET /api/social?messages=<peer>&limit=` plus an optional cursor. */
    fun thread(origin: String, peerId: String, limit: Int = 50, cursor: String? = null): String {
        require(peerId.isNotBlank() && peerId.length <= 100) { "Invalid conversation." }
        val bounded = limit.coerceIn(1, 100)
        val base = social(origin) + "?messages=" + encode(peerId) + "&limit=" + bounded
        if (cursor.isNullOrBlank()) return base
        return base + "&cursor=" + encode(cursor)
    }

    private fun encode(value: String): String =
        java.net.URLEncoder.encode(value, Charsets.UTF_8.name()).replace("+", "%20")

    private val CONVERSATION_FILTERS = setOf("all", "unread", "archived", "favorites")

    private fun join(origin: String, path: String): String {
        val base = origin.trim().trimEnd('/')
        val suffix = if (path.startsWith("/")) path else "/$path"
        return base + suffix
    }
}
