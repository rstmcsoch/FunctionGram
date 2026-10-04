package com.functiongram.app.configuration

import com.functiongram.app.BuildConfig
import com.functiongram.app.security.ClientSecretPolicy

/**
 * Public HTTPS origin of the existing FunctionGram website.
 * Turso, Better Auth, Brevo, and Blob credentials are server environment
 * variables and must never appear here or in any other APK resource.
 */
object ApiEnvironment {
    const val PUBLIC_API_ORIGIN = "https://functiongram.vercel.app"

    fun resolvedOrigin(): String {
        val configured = BuildConfig.API_BASE_URL.trim().trimEnd('/')
        ClientSecretPolicy.requirePublicApiOrigin(configured)
        return configured
    }
}
