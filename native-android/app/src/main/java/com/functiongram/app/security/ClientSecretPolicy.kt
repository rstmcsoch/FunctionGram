package com.functiongram.app.security

/**
 * The APK may only call the public HTTPS API. Database URLs and server
 * credentials stay in the Next.js deployment. Detection is structural so this
 * client does not need to embed vendor tokens or live secrets.
 */
object ClientSecretPolicy {
    fun containsBackendSecret(value: String): Boolean {
        val trimmed = value.trim()
        val lower = trimmed.lowercase()
        if ("://" in lower && !lower.startsWith("https://") && !lower.startsWith("http://")) {
            return true
        }
        if ('@' in trimmed && "://" in trimmed) return true
        if (hasServerEnvAssignment(trimmed)) return true
        if (looksLikePem(lower)) return true
        if (looksLikeKeyFile(lower)) return true
        return false
    }

    fun looksLikeAdminSurface(value: String): Boolean {
        val lower = value.lowercase()
        return "/api/admin" in lower || "/admin-panel" in lower
    }

    fun requirePublicApiOrigin(origin: String) {
        val trimmed = origin.trim()
        require(trimmed.startsWith("https://")) { "FunctionGram API origin must be HTTPS." }
        require(!trimmed.contains('@')) { "FunctionGram API origin must not embed credentials." }
        require(!containsBackendSecret(trimmed)) {
            "FunctionGram API origin must not include a database URL or server secret."
        }
        require(!looksLikeAdminSurface(trimmed)) {
            "FunctionGram API origin must not target the admin surface."
        }
        val host = trimmed.removePrefix("https://").substringBefore('/').substringBefore('?').substringBefore(':')
        require(host.isNotEmpty() && '.' in host && !host.equals("localhost", ignoreCase = true)) {
            "FunctionGram API origin must name a public host."
        }
    }

    private fun hasServerEnvAssignment(trimmed: String): Boolean {
        val separator = trimmed.indexOf('=')
        if (separator <= 0) return false
        val name = trimmed.substring(0, separator).trim()
        return name.length >= 6 &&
            name.all { it.isUpperCase() || it.isDigit() || it == '_' } &&
            '_' in name
    }

    private fun looksLikePem(lower: String): Boolean {
        val compact = lower.filter { !it.isWhitespace() && it != '-' }
        return "beginprivatekey" in compact ||
            "beginrsaprivatekey" in compact ||
            "beginopensshprivatekey" in compact
    }

    private fun looksLikeKeyFile(lower: String): Boolean {
        val privateField = "\"private_" + "key\""
        val emailField = "\"client_" + "email\""
        return privateField in lower && emailField in lower
    }
}
