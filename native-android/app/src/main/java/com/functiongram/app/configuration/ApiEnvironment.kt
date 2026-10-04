package com.functiongram.app.configuration

import com.functiongram.app.BuildConfig
import com.functiongram.app.security.EndpointResolver
import com.functiongram.app.security.ReleaseHardening

/**
 * Public HTTPS origin of the existing FunctionGram website.
 * Database URLs, mail credentials, and admin secrets stay on the server.
 */
object ApiEnvironment {
    const val PUBLIC_API_ORIGIN = "https://functiongram.vercel.app"

    fun resolvedOrigin(): String {
        ReleaseHardening.assertVariant(
            debugBuild = BuildConfig.DEBUG,
            allowsDebugEndpoint = VariantMarker.ALLOWS_DEBUG_ENDPOINT,
            claimsDebuggable = VariantMarker.CLAIMS_DEBUGGABLE,
        )
        return EndpointResolver.resolve(
            configuredOrigin = BuildConfig.API_BASE_URL,
            debugBuild = BuildConfig.DEBUG,
            allowDebugEndpoint = VariantMarker.ALLOWS_DEBUG_ENDPOINT,
            debugOverride = DebugEndpoint.overrideOrNull(),
        )
    }
}
