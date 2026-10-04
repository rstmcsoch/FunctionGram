package com.functiongram.app.data.auth

import kotlinx.serialization.SerializationException
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

object SessionCookieCodec {
    private val json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
    }

    fun encode(cookies: List<StoredAuthCookie>): String = json.encodeToString(cookies)

    fun decode(raw: String): List<StoredAuthCookie> {
        return try {
            json.decodeFromString<List<StoredAuthCookie>>(raw)
                .filter { AuthCookieNames.isKept(it.name) && it.value.isNotEmpty() && it.domain.isNotEmpty() }
        } catch (_: SerializationException) {
            emptyList()
        } catch (_: IllegalArgumentException) {
            emptyList()
        }
    }

    /** Names and expiry only. Safe to log. */
    fun redacted(cookies: List<StoredAuthCookie>): String {
        if (cookies.isEmpty()) return "cookies=none"
        return cookies.joinToString(prefix = "cookies=", separator = ",") {
            "${it.name}@${it.domain} exp=${it.expiresAtEpochMillis}"
        }
    }
}
