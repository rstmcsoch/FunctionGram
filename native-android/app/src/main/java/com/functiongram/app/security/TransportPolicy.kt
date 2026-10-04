package com.functiongram.app.security

/** Request-level companion to the network security config. */
object TransportPolicy {
    fun allows(url: String, debugBuild: Boolean, allowDebugEndpoint: Boolean): Boolean {
        val trimmed = url.trim()
        if (ClientSecretPolicy.containsBackendSecret(trimmed) || ClientSecretPolicy.looksLikeAdminSurface(trimmed)) {
            return false
        }
        if (trimmed.startsWith("https://")) return true
        if (!debugBuild || !allowDebugEndpoint) return false
        return trimmed.startsWith("http://") && EndpointResolver.isLocalhost(trimmed)
    }
}
