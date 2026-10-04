package com.functiongram.app.domain.session

/**
 * Session contract for later phases.
 * Better Auth issues the session from POST/GET /api/auth on the existing server.
 * This phase does not create accounts or store a session.
 */
interface SessionGateway {
    fun hasSession(): Boolean
}

class SignedOutSession : SessionGateway {
    override fun hasSession(): Boolean = false
}
