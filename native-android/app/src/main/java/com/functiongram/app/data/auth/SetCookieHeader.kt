package com.functiongram.app.data.auth

/**
 * One Set-Cookie header line from Better Auth.
 * Unknown cookie names are ignored so this client does not store them.
 */
object SetCookieHeader {
    data class Change(
        val name: String,
        val cookie: StoredAuthCookie?,
    )

    fun parse(header: String, requestHost: String, nowEpochMillis: Long): Change? {
        val trimmed = header.trim()
        if (trimmed.isEmpty()) return null
        val parts = trimmed.split(';')
        val nameValue = parts.firstOrNull()?.trim().orEmpty()
        val separator = nameValue.indexOf('=')
        if (separator <= 0) return null
        val name = nameValue.substring(0, separator).trim()
        if (!AuthCookieNames.isKept(name)) return null
        val value = nameValue.substring(separator + 1).trim()
        val attributes = mutableMapOf<String, String>()
        parts.drop(1).forEach { part ->
            val piece = part.trim()
            if (piece.isEmpty()) return@forEach
            val eq = piece.indexOf('=')
            if (eq < 0) {
                attributes[piece.lowercase()] = ""
            } else {
                attributes[piece.substring(0, eq).trim().lowercase()] = piece.substring(eq + 1).trim()
            }
        }
        val domainAttribute = attributes["domain"]?.trim()?.trim('"')?.trimStart('.')
        if (!domainAttribute.isNullOrEmpty() && !hostMatches(requestHost, domainAttribute)) {
            return null
        }
        val maxAge = attributes["max-age"]?.toLongOrNull()
        val delete = value.isEmpty() || (maxAge != null && maxAge <= 0L)
        if (delete) return Change(name = name, cookie = null)
        val expiresAt = if (maxAge != null) {
            nowEpochMillis + maxAge * 1000L
        } else {
            Long.MAX_VALUE
        }
        val path = attributes["path"]?.trim()?.trim('"')?.ifEmpty { "/" } ?: "/"
        return Change(
            name = name,
            cookie = StoredAuthCookie(
                name = name,
                value = value,
                domain = requestHost,
                path = if (path.startsWith("/")) path else "/",
                secure = attributes.containsKey("secure"),
                httpOnly = attributes.containsKey("httponly"),
                expiresAtEpochMillis = expiresAt,
            ),
        )
    }

    private fun hostMatches(host: String, domainAttribute: String): Boolean {
        return host.equals(domainAttribute, ignoreCase = true) ||
            host.endsWith(".${domainAttribute}", ignoreCase = true)
    }
}
