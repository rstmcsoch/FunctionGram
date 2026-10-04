package com.functiongram.app.data.auth

import kotlinx.serialization.Serializable

enum class AuthFailureKind {
    INVALID_EMAIL,
    INVALID_CREDENTIALS,
    PASSWORD_REJECTED,
    EMAIL_NOT_VERIFIED,
    ACCOUNT_UNAVAILABLE,
    RATE_LIMITED,
    TWO_FACTOR_INVALID,
    TWO_FACTOR_EXPIRED,
    UNAVAILABLE,
    NETWORK,
    UNEXPECTED,
}

enum class SignedOutReason {
    NO_SESSION,
    EXPIRED,
    LOGGED_OUT,
    LOCAL_ONLY,
}

enum class AuthOperation {
    SIGN_IN,
    VERIFY_TOTP,
    GET_SESSION,
    SIGN_OUT,
}

data class PublicProfile(
    val userId: String,
    val email: String,
    val name: String,
    val sessionExpiresAtEpochMillis: Long?,
) {
    override fun toString(): String = "PublicProfile(redacted)"
}

sealed class AuthCallResult {
    data class SignedIn(val profile: PublicProfile) : AuthCallResult() {
        override fun toString(): String = "SignedIn(redacted)"
    }

    data class TwoFactorRequired(val methods: List<String>) : AuthCallResult()

    data class SignedOut(val reason: SignedOutReason) : AuthCallResult()

    data class Failed(val kind: AuthFailureKind) : AuthCallResult()
}

@Serializable
class SignInRequest(
    val email: String,
    val password: String,
    val rememberMe: Boolean = true,
) {
    override fun toString(): String = "SignInRequest(redacted)"
}

@Serializable
class VerifyTotpRequest(
    val code: String,
) {
    override fun toString(): String = "VerifyTotpRequest(redacted)"
}

@Serializable
internal data class AuthErrorBody(
    val message: String? = null,
    val code: String? = null,
)

@Serializable
internal data class AuthUserBody(
    val id: String? = null,
    val email: String? = null,
    val name: String? = null,
    val emailVerified: Boolean? = null,
)

@Serializable
internal data class AuthSessionBody(
    val expiresAt: String? = null,
    val userId: String? = null,
)

@Serializable
internal data class GetSessionBody(
    val session: AuthSessionBody? = null,
    val user: AuthUserBody? = null,
)

@Serializable
internal data class SignInWireBody(
    val user: AuthUserBody? = null,
    val twoFactorRedirect: Boolean? = null,
    val twoFactorMethods: List<String>? = null,
)

@Serializable
internal data class SignOutBody(
    val success: Boolean? = null,
)

data class AuthWireRequest(
    val method: String,
    val path: String,
    val jsonBody: String? = null,
) {
    override fun toString(): String {
        val body = if (jsonBody == null) "none" else "redacted"
        return "AuthWireRequest(method=$method,path=$path,body=$body)"
    }
}

data class AuthHttpResult(
    val status: Int,
    val body: String,
    val setCookies: List<String> = emptyList(),
    val transportFailed: Boolean = false,
)

interface AuthTransport {
    val host: String
    fun execute(request: AuthWireRequest): AuthHttpResult
}
