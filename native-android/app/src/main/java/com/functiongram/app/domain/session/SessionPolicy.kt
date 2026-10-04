package com.functiongram.app.domain.session

/**
 * Session lifetime copied from the website auth config.
 * expiresIn and updateAge are both three days. Better Auth only rewrites
 * the session expiry when expiresAt - expiresIn + updateAge is already due,
 * which here is the same moment the session is expired. Using the app does
 * not extend the window. Signing in again creates a new session.
 *
 * POST get-session is not a refresh: the server rejects it unless
 * deferSessionRefresh is enabled, and that flag is not enabled.
 */
object SessionPolicy {
    const val EXPIRES_IN_SECONDS = 60 * 60 * 24 * 3
    const val UPDATE_AGE_SECONDS = 60 * 60 * 24 * 3

    /** Current-device revocation the server already implements. */
    const val SIGN_OUT_PATH = "sign-out"

    fun extendsSessionOnUse(): Boolean = UPDATE_AGE_SECONDS < EXPIRES_IN_SECONDS
}
