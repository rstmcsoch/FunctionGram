package com.functiongram.app.presentation.auth

import com.functiongram.app.data.auth.AuthCallResult
import com.functiongram.app.data.auth.AuthCopy
import com.functiongram.app.data.auth.AuthFailureKind
import com.functiongram.app.data.auth.PublicProfile
import com.functiongram.app.data.auth.SignedOutReason

enum class AuthPhase {
    Checking,
    SignIn,
    TwoFactor,
    SignedIn,
    Offline,
}

enum class AuthApplySource {
    RESTORE,
    SIGN_IN,
    VERIFY,
    SIGN_OUT,
}

data class AuthUiState(
    val phase: AuthPhase = AuthPhase.Checking,
    val splashFinished: Boolean = false,
    val busy: Boolean = false,
    val banner: String? = null,
    val profile: PublicProfile? = null,
    val twoFactorMethods: List<String> = emptyList(),
)

fun reduceAuthUi(
    previous: AuthUiState,
    result: AuthCallResult,
    source: AuthApplySource,
    hasSession: Boolean,
): AuthUiState {
    val base = previous.copy(busy = false)
    return when (result) {
        is AuthCallResult.SignedIn -> base.copy(
            phase = AuthPhase.SignedIn,
            banner = null,
            profile = result.profile,
            twoFactorMethods = emptyList(),
        )
        is AuthCallResult.TwoFactorRequired -> {
            val methods = result.methods
            val totp = methods.isEmpty() || methods.any { it == "totp" }
            if (!totp) {
                base.copy(
                    phase = AuthPhase.SignIn,
                    banner = AuthCopy.TWO_FACTOR_UNSUPPORTED,
                    profile = null,
                    twoFactorMethods = methods,
                )
            } else {
                base.copy(
                    phase = AuthPhase.TwoFactor,
                    banner = null,
                    profile = null,
                    twoFactorMethods = methods,
                )
            }
        }
        is AuthCallResult.SignedOut -> base.copy(
            phase = AuthPhase.SignIn,
            profile = null,
            twoFactorMethods = emptyList(),
            banner = when (result.reason) {
                SignedOutReason.EXPIRED -> AuthCopy.SESSION_EXPIRED
                SignedOutReason.LOCAL_ONLY -> AuthCopy.LOCAL_SIGNOUT
                SignedOutReason.NO_SESSION, SignedOutReason.LOGGED_OUT -> null
            },
        )
        is AuthCallResult.Failed -> {
            val holding = source == AuthApplySource.RESTORE &&
                result.kind == AuthFailureKind.NETWORK &&
                hasSession
            if (holding) {
                base.copy(phase = AuthPhase.Offline, banner = AuthCopy.OFFLINE_HOLDING)
            } else if (result.kind == AuthFailureKind.TWO_FACTOR_EXPIRED ||
                result.kind == AuthFailureKind.EMAIL_NOT_VERIFIED
            ) {
                base.copy(
                    phase = AuthPhase.SignIn,
                    profile = null,
                    twoFactorMethods = emptyList(),
                    banner = AuthCopy.forKind(result.kind),
                )
            } else if (source == AuthApplySource.VERIFY && previous.phase == AuthPhase.TwoFactor) {
                base.copy(phase = AuthPhase.TwoFactor, banner = AuthCopy.forKind(result.kind))
            } else {
                base.copy(phase = AuthPhase.SignIn, banner = AuthCopy.forKind(result.kind))
            }
        }
    }
}
