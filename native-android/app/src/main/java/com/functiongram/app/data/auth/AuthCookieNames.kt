package com.functiongram.app.data.auth

/**
 * Better Auth cookie names for this deployment. HTTPS responses use the
 * __Secure- prefix. The value is opaque and must not be logged.
 */
object AuthCookieNames {
    private val suffixes = setOf(
        "session_token",
        "session_data",
        "dont_remember",
        "two_factor",
    )

    fun isKept(name: String): Boolean {
        val bare = name.removePrefix("__Secure-").removePrefix("__Host-")
        if (!bare.startsWith("better-auth.")) return false
        return bare.removePrefix("better-auth.") in suffixes
    }

    fun isSessionToken(name: String): Boolean = isKept(name) && name.endsWith("session_token")

    fun isTwoFactor(name: String): Boolean = isKept(name) && name.endsWith("two_factor")
}
