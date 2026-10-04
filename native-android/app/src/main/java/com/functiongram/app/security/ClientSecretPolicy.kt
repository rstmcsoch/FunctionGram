package com.functiongram.app.security

/**
 * The APK may only call the public HTTPS API. Database URLs and server
 * credentials stay in the Next.js deployment and are rejected here without
 * embedding those values in the client.
 */
object ClientSecretPolicy {
    fun containsBackendSecret(value: String): Boolean {
        val trimmed = value.trim()
        val lower = trimmed.lowercase()
        if ("://" in lower && !lower.startsWith("https://") && !lower.startsWith("http://")) {
            return true
        }
        if ("@" in trimmed && "://" in trimmed) return true
        val separator = trimmed.indexOf('=')
        if (separator > 0) {
            val name = trimmed.substring(0, separator).trim()
            val looksLikeServerEnv = name.length >= 6 &&
                name.all { it.isUpperCase() || it.isDigit() || it == '_' } &&
                '_' in name
            if (looksLikeServerEnv) return true
        }
        return false
    }

    fun requirePublicApiOrigin(origin: String) {
        val trimmed = origin.trim()
        require(trimmed.startsWith("https://")) { "FunctionGram API origin must be HTTPS." }
        require(!trimmed.contains('@')) { "FunctionGram API origin must not embed credentials." }
        require(!containsBackendSecret(trimmed)) {
            "FunctionGram API origin must not include a database URL or server secret."
        }
        val host = trimmed.removePrefix("https://").substringBefore('/').substringBefore('?')
        require(host.isNotEmpty() && '.' in host) { "FunctionGram API origin must name a public host." }
    }
}
