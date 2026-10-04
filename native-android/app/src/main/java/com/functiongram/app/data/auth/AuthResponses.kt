package com.functiongram.app.data.auth

import java.time.Instant
import java.time.format.DateTimeParseException
import kotlinx.serialization.SerializationException
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json

/**
 * Maps Better Auth JSON into app states.
 * The raw session token field is not modeled, so it is dropped on parse.
 */
object AuthResponses {
    private val json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
    }

    fun interpret(
        operation: AuthOperation,
        status: Int,
        body: String,
        hasSessionCookie: Boolean,
        hasTwoFactorCookie: Boolean,
        cookieExpiresAtEpochMillis: Long?,
    ): AuthCallResult {
        if (operation == AuthOperation.GET_SESSION && (status == 200 || status == 401)) {
            return interpretSession(status, body, cookieExpiresAtEpochMillis)
        }
        if (operation == AuthOperation.SIGN_OUT) {
            return if (signOutSucceeded(status, body)) {
                AuthCallResult.SignedOut(SignedOutReason.LOGGED_OUT)
            } else {
                AuthCallResult.Failed(AuthFailureKind.NETWORK)
            }
        }
        if (status == 200 && operation == AuthOperation.SIGN_IN) {
            return interpretSignIn(body, hasSessionCookie, hasTwoFactorCookie, cookieExpiresAtEpochMillis)
        }
        if (status == 200 && operation == AuthOperation.VERIFY_TOTP) {
            return if (hasSessionCookie) {
                interpretVerifiedUser(body, cookieExpiresAtEpochMillis)
            } else {
                AuthCallResult.Failed(AuthFailureKind.UNEXPECTED)
            }
        }
        return AuthCallResult.Failed(errorKind(operation, status, body))
    }

    fun signOutSucceeded(status: Int, body: String): Boolean {
        if (status != 200) return false
        return try {
            json.decodeFromString<SignOutBody>(body).success == true
        } catch (_: SerializationException) {
            false
        } catch (_: IllegalArgumentException) {
            false
        }
    }

    private fun interpretSession(status: Int, body: String, cookieExpiresAtEpochMillis: Long?): AuthCallResult {
        if (status == 401 || body.trim() == "null" || body.isBlank()) {
            return AuthCallResult.SignedOut(SignedOutReason.EXPIRED)
        }
        val parsed = decode<GetSessionBody>(body)
            ?: return AuthCallResult.SignedOut(SignedOutReason.EXPIRED)
        val user = parsed.user
        if (user?.id.isNullOrBlank() || parsed.session == null) {
            return AuthCallResult.SignedOut(SignedOutReason.EXPIRED)
        }
        if (user.emailVerified == false) {
            return AuthCallResult.Failed(AuthFailureKind.EMAIL_NOT_VERIFIED)
        }
        val expiry = parseInstant(parsed.session.expiresAt) ?: cookieExpiresAtEpochMillis
        return AuthCallResult.SignedIn(
            PublicProfile(
                userId = user.id,
                email = user.email.orEmpty(),
                name = user.name.orEmpty(),
                sessionExpiresAtEpochMillis = expiry,
            ),
        )
    }

    private fun interpretSignIn(
        body: String,
        hasSessionCookie: Boolean,
        hasTwoFactorCookie: Boolean,
        cookieExpiresAtEpochMillis: Long?,
    ): AuthCallResult {
        val parsed = decode<SignInWireBody>(body) ?: return AuthCallResult.Failed(AuthFailureKind.UNEXPECTED)
        if (parsed.twoFactorRedirect == true) {
            if (!hasTwoFactorCookie) return AuthCallResult.Failed(AuthFailureKind.UNEXPECTED)
            return AuthCallResult.TwoFactorRequired(parsed.twoFactorMethods ?: emptyList())
        }
        val user = parsed.user ?: return AuthCallResult.Failed(AuthFailureKind.UNEXPECTED)
        if (user.id.isNullOrBlank()) return AuthCallResult.Failed(AuthFailureKind.UNEXPECTED)
        if (!hasSessionCookie) return AuthCallResult.Failed(AuthFailureKind.UNEXPECTED)
        if (user.emailVerified == false) return AuthCallResult.Failed(AuthFailureKind.EMAIL_NOT_VERIFIED)
        return AuthCallResult.SignedIn(
            PublicProfile(
                userId = user.id,
                email = user.email.orEmpty(),
                name = user.name.orEmpty(),
                sessionExpiresAtEpochMillis = cookieExpiresAtEpochMillis,
            ),
        )
    }

    private fun interpretVerifiedUser(body: String, cookieExpiresAtEpochMillis: Long?): AuthCallResult {
        val parsed = decode<SignInWireBody>(body)
        val user = parsed?.user
        if (user?.id.isNullOrBlank()) {
            return AuthCallResult.Failed(AuthFailureKind.UNEXPECTED)
        }
        if (user.emailVerified == false) return AuthCallResult.Failed(AuthFailureKind.EMAIL_NOT_VERIFIED)
        return AuthCallResult.SignedIn(
            PublicProfile(
                userId = user.id,
                email = user.email.orEmpty(),
                name = user.name.orEmpty(),
                sessionExpiresAtEpochMillis = cookieExpiresAtEpochMillis,
            ),
        )
    }

    private fun errorKind(operation: AuthOperation, status: Int, body: String): AuthFailureKind {
        val parsed = decode<AuthErrorBody>(body)
        val message = parsed?.message?.trim().orEmpty()
        if (message == "This account is unavailable.") return AuthFailureKind.ACCOUNT_UNAVAILABLE
        when (parsed?.code) {
            "INVALID_EMAIL" -> return AuthFailureKind.INVALID_EMAIL
            "INVALID_EMAIL_OR_PASSWORD", "INVALID_PASSWORD" -> return AuthFailureKind.INVALID_CREDENTIALS
            "PASSWORD_TOO_SHORT", "PASSWORD_TOO_LONG" -> return AuthFailureKind.PASSWORD_REJECTED
            "EMAIL_NOT_VERIFIED" -> return AuthFailureKind.EMAIL_NOT_VERIFIED
            "INVALID_CODE" -> return AuthFailureKind.TWO_FACTOR_INVALID
            "INVALID_TWO_FACTOR_COOKIE", "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE" ->
                return AuthFailureKind.TWO_FACTOR_EXPIRED
            "ACCOUNT_TEMPORARILY_LOCKED" -> return AuthFailureKind.RATE_LIMITED
        }
        return when (status) {
            429 -> AuthFailureKind.RATE_LIMITED
            502, 503, 504 -> AuthFailureKind.UNAVAILABLE
            401 -> if (operation == AuthOperation.VERIFY_TOTP) {
                AuthFailureKind.TWO_FACTOR_INVALID
            } else {
                AuthFailureKind.INVALID_CREDENTIALS
            }
            403 -> AuthFailureKind.ACCOUNT_UNAVAILABLE
            else -> AuthFailureKind.UNEXPECTED
        }
    }

    private inline fun <reified T> decode(body: String): T? {
        return try {
            json.decodeFromString<T>(body)
        } catch (_: SerializationException) {
            null
        } catch (_: IllegalArgumentException) {
            null
        }
    }

    private fun parseInstant(value: String?): Long? {
        if (value.isNullOrBlank()) return null
        return try {
            Instant.parse(value).toEpochMilli()
        } catch (_: DateTimeParseException) {
            null
        }
    }
}
