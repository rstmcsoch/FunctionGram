package com.functiongram.app.security

import com.functiongram.app.configuration.ApiEnvironment

/**
 * Release always uses the public HTTPS origin and ignores any debug override.
 * Debug may opt into http://localhost or another public HTTPS host. Cleartext
 * to IP addresses is intentionally unsupported: network security config cannot
 * name IP literals, and release never permits cleartext.
 */
object EndpointResolver {
    fun resolve(
        configuredOrigin: String,
        debugBuild: Boolean,
        allowDebugEndpoint: Boolean,
        debugOverride: String?,
    ): String {
        if (!debugBuild || !allowDebugEndpoint) {
            val production = normalize(configuredOrigin)
            require(production == ApiEnvironment.PUBLIC_API_ORIGIN) {
                "Release builds must use the public HTTPS API and cannot fall back to a debug endpoint."
            }
            ClientSecretPolicy.requirePublicApiOrigin(production)
            return production
        }

        val chosen = normalize(debugOverride?.takeIf { it.isNotBlank() } ?: configuredOrigin)
        if (chosen.startsWith("http://")) {
            require(isLocalhost(chosen)) { "Debug cleartext is limited to localhost." }
            require(!ClientSecretPolicy.containsBackendSecret(chosen)) {
                "Debug origin must not include a database URL or server secret."
            }
            require(!ClientSecretPolicy.looksLikeAdminSurface(chosen)) {
                "Debug origin must not target the admin surface."
            }
            return chosen
        }
        ClientSecretPolicy.requirePublicApiOrigin(chosen)
        return chosen
    }

    fun assertAllowed(origin: String, debugBuild: Boolean, allowDebugEndpoint: Boolean) {
        val normalized = normalize(origin)
        val resolved = if (!debugBuild || !allowDebugEndpoint) {
            resolve(
                configuredOrigin = normalized,
                debugBuild = false,
                allowDebugEndpoint = false,
                debugOverride = "http://localhost:9",
            )
        } else {
            resolve(
                configuredOrigin = ApiEnvironment.PUBLIC_API_ORIGIN,
                debugBuild = true,
                allowDebugEndpoint = true,
                debugOverride = normalized,
            )
        }
        require(resolved == normalized) { "Origin is not allowed for this build." }
    }

    fun isLocalhost(origin: String): Boolean {
        val host = origin
            .removePrefix("http://")
            .removePrefix("https://")
            .substringBefore('/')
            .substringBefore('?')
            .substringBefore(':')
        return host.equals("localhost", ignoreCase = true)
    }

    private fun normalize(value: String): String = value.trim().trimEnd('/')
}
