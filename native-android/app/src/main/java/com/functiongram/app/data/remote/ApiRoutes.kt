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

    private fun join(origin: String, path: String): String {
        val base = origin.trim().trimEnd('/')
        val suffix = if (path.startsWith("/")) path else "/$path"
        return base + suffix
    }
}
