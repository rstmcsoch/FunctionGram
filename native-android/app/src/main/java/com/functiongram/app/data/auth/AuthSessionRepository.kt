package com.functiongram.app.data.auth

import com.functiongram.app.data.remote.ApiRoutes
import com.functiongram.app.domain.session.SessionGateway
import com.functiongram.app.domain.session.SessionPolicy
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

/**
 * Website session client.
 * Logout calls POST sign-out, which deletes the current session.
 * revoke-session needs the raw session token, which is not stored.
 * revoke-sessions and revoke-other-sessions affect more than this device,
 * so this phase does not call them. There is no client refresh call:
 * [SessionPolicy.extendsSessionOnUse] is false for the current server config.
 */
class AuthSessionRepository(
    private val transport: AuthTransport,
    private val jar: SessionCookieJar,
    private val json: Json = Json { explicitNulls = false; encodeDefaults = true },
) : SessionGateway {
    override fun hasSession(): Boolean = jar.hasSessionToken()

    fun restore(): AuthCallResult {
        if (!jar.hasSessionToken()) {
            return if (jar.hasTwoFactor()) {
                AuthCallResult.TwoFactorRequired(emptyList())
            } else {
                AuthCallResult.SignedOut(SignedOutReason.NO_SESSION)
            }
        }
        return loadSession()
    }

    fun signIn(email: String, password: String): AuthCallResult {
        val trimmed = email.trim()
        if (trimmed.isEmpty() || !trimmed.contains('@')) {
            return AuthCallResult.Failed(AuthFailureKind.INVALID_EMAIL)
        }
        if (password.isEmpty()) {
            return AuthCallResult.Failed(AuthFailureKind.INVALID_CREDENTIALS)
        }
        jar.clear()
        val body = json.encodeToString(SignInRequest(email = trimmed, password = password, rememberMe = true))
        val http = transport.execute(
            AuthWireRequest(method = "POST", path = ApiRoutes.SIGN_IN_EMAIL, jsonBody = body),
        )
        if (http.transportFailed) return AuthCallResult.Failed(AuthFailureKind.NETWORK)
        jar.consume(transport.host, http.setCookies)
        val result = AuthResponses.interpret(
            operation = AuthOperation.SIGN_IN,
            status = http.status,
            body = http.body,
            hasSessionCookie = jar.hasSessionToken(),
            hasTwoFactorCookie = jar.hasTwoFactor(),
            cookieExpiresAtEpochMillis = jar.sessionTokenExpiry(),
        )
        if (result is AuthCallResult.Failed && result.kind == AuthFailureKind.EMAIL_NOT_VERIFIED) {
            jar.clear()
        }
        if (result is AuthCallResult.Failed && result.kind == AuthFailureKind.TWO_FACTOR_EXPIRED) {
            jar.clearTwoFactor()
        }
        return result
    }

    fun verifyTotp(code: String): AuthCallResult {
        val trimmed = code.trim()
        if (trimmed.isEmpty()) return AuthCallResult.Failed(AuthFailureKind.TWO_FACTOR_INVALID)
        val body = json.encodeToString(VerifyTotpRequest(code = trimmed))
        val http = transport.execute(
            AuthWireRequest(method = "POST", path = ApiRoutes.VERIFY_TOTP, jsonBody = body),
        )
        if (http.transportFailed) return AuthCallResult.Failed(AuthFailureKind.NETWORK)
        jar.consume(transport.host, http.setCookies)
        val result = AuthResponses.interpret(
            operation = AuthOperation.VERIFY_TOTP,
            status = http.status,
            body = http.body,
            hasSessionCookie = jar.hasSessionToken(),
            hasTwoFactorCookie = jar.hasTwoFactor(),
            cookieExpiresAtEpochMillis = jar.sessionTokenExpiry(),
        )
        if (result is AuthCallResult.Failed &&
            (result.kind == AuthFailureKind.TWO_FACTOR_EXPIRED || result.kind == AuthFailureKind.EMAIL_NOT_VERIFIED)
        ) {
            jar.clear()
        }
        return result
    }

    fun signOut(): AuthCallResult {
        val http = transport.execute(
            AuthWireRequest(method = "POST", path = ApiRoutes.SIGN_OUT, jsonBody = "{}"),
        )
        if (!http.transportFailed) {
            jar.consume(transport.host, http.setCookies)
        }
        jar.clear()
        if (http.transportFailed || !AuthResponses.signOutSucceeded(http.status, http.body)) {
            return AuthCallResult.SignedOut(SignedOutReason.LOCAL_ONLY)
        }
        return AuthCallResult.SignedOut(SignedOutReason.LOGGED_OUT)
    }

    fun abandonChallenge() {
        jar.clear()
    }

    private fun loadSession(): AuthCallResult {
        val http = transport.execute(
            AuthWireRequest(method = "GET", path = ApiRoutes.GET_SESSION),
        )
        if (http.transportFailed) return AuthCallResult.Failed(AuthFailureKind.NETWORK)
        jar.consume(transport.host, http.setCookies)
        val result = AuthResponses.interpret(
            operation = AuthOperation.GET_SESSION,
            status = http.status,
            body = http.body,
            hasSessionCookie = jar.hasSessionToken(),
            hasTwoFactorCookie = jar.hasTwoFactor(),
            cookieExpiresAtEpochMillis = jar.sessionTokenExpiry(),
        )
        if (result is AuthCallResult.SignedOut ||
            (result is AuthCallResult.Failed && result.kind == AuthFailureKind.EMAIL_NOT_VERIFIED)
        ) {
            jar.clear()
        }
        return result
    }
}
