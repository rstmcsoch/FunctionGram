package com.functiongram.app.security

import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl

/**
 * Process-memory cookie jar for a future Better Auth session.
 * Phase 1 does not sign in and does not persist cookies to disk.
 */
class InMemorySessionCookieJar : CookieJar {
    private val store = mutableMapOf<String, MutableList<Cookie>>()

    override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
        if (cookies.isEmpty()) return
        val bucket = store.getOrPut(url.host) { mutableListOf() }
        cookies.forEach { incoming ->
            bucket.removeAll { it.name == incoming.name }
            bucket += incoming
        }
    }

    override fun loadForRequest(url: HttpUrl): List<Cookie> {
        val now = System.currentTimeMillis()
        val bucket = store[url.host] ?: return emptyList()
        bucket.removeAll { it.expiresAt <= now }
        return bucket.toList()
    }
}
