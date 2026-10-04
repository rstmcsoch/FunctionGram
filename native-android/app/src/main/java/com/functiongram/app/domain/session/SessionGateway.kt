package com.functiongram.app.domain.session

/**
 * Whether this device still has a Better Auth session cookie for the website.
 * The cookie is issued by POST /api/auth/sign-in/email (or TOTP verification)
 * and cleared by POST /api/auth/sign-out. This is not a second account system.
 */
interface SessionGateway {
    fun hasSession(): Boolean
}

class SignedOutSession : SessionGateway {
    override fun hasSession(): Boolean = false
}
