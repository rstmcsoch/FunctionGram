package com.functiongram.app.data.auth

object AuthCopy {
    const val SESSION_EXPIRED = "Your session expired. Sign in again."
    const val LOCAL_SIGNOUT =
        "Signed out on this device. The server session could not be revoked and expires on its own."
    const val NETWORK = "FunctionGram could not be reached."
    const val OFFLINE_HOLDING =
        "FunctionGram could not be reached. The saved session is still on this device."
    const val TWO_FACTOR_UNSUPPORTED =
        "This account needs a sign-in step this app does not handle yet."

    fun forKind(kind: AuthFailureKind): String = when (kind) {
        AuthFailureKind.INVALID_EMAIL -> "Enter the email address for your FunctionGram account."
        AuthFailureKind.INVALID_CREDENTIALS -> "That email or password was not accepted."
        AuthFailureKind.PASSWORD_REJECTED -> "Use your FunctionGram password (12 to 128 characters)."
        AuthFailureKind.EMAIL_NOT_VERIFIED -> "Verify your email before signing in."
        AuthFailureKind.ACCOUNT_UNAVAILABLE -> "This account is unavailable."
        AuthFailureKind.RATE_LIMITED -> "Too many attempts. Wait and try again."
        AuthFailureKind.TWO_FACTOR_INVALID -> "That code was not accepted."
        AuthFailureKind.TWO_FACTOR_EXPIRED -> "That sign-in step expired. Start again."
        AuthFailureKind.UNAVAILABLE -> "Sign-in is temporarily unavailable. Try again later."
        AuthFailureKind.NETWORK -> NETWORK
        AuthFailureKind.UNEXPECTED -> "Sign-in could not be completed."
    }
}
