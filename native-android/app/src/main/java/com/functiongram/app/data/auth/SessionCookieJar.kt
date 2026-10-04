package com.functiongram.app.data.auth

import okhttp3.Request

/**
 * In-memory Better Auth cookies plus a secure store.
 * Cookies without an expiry stay in memory only (they are not written as
 * immortal records). Expired cookies are not sent.
 */
class SessionCookieJar(
    private val store: SecureSessionStore,
    private val clock: () -> Long = { System.currentTimeMillis() },
) {
    private val lock = Any()
    private val cookies = mutableListOf<StoredAuthCookie>()

    init {
        synchronized(lock) {
            val now = clock()
            cookies += store.load().filter { it.expiresAtEpochMillis > now }
            persistLocked()
        }
    }

    fun hasSessionToken(): Boolean = synchronized(lock) {
        val now = clock()
        pruneLocked(now)
        cookies.any { AuthCookieNames.isSessionToken(it.name) && it.value.isNotEmpty() }
    }

    fun hasTwoFactor(): Boolean = synchronized(lock) {
        val now = clock()
        pruneLocked(now)
        cookies.any { AuthCookieNames.isTwoFactor(it.name) && it.value.isNotEmpty() }
    }

    fun sessionTokenExpiry(): Long? = synchronized(lock) {
        val now = clock()
        pruneLocked(now)
        cookies.filter { AuthCookieNames.isSessionToken(it.name) }
            .maxOfOrNull { it.expiresAtEpochMillis }
    }

    fun clear() {
        synchronized(lock) {
            cookies.clear()
            store.clear()
        }
    }

    fun clearTwoFactor() {
        synchronized(lock) {
            cookies.removeAll { AuthCookieNames.isTwoFactor(it.name) }
            persistLocked()
        }
    }

    fun consume(host: String, setCookies: List<String>) {
        if (host.isBlank()) return
        synchronized(lock) {
            val now = clock()
            cookies.removeAll { it.expiresAtEpochMillis <= now }
            setCookies.forEach { header ->
                val change = SetCookieHeader.parse(header, host, now) ?: return@forEach
                cookies.removeAll { it.name == change.name && it.domain.equals(host, ignoreCase = true) }
                val cookie = change.cookie
                if (cookie != null) cookies += cookie
            }
            persistLocked()
        }
    }

    fun cookieHeaderValue(host: String, https: Boolean): String? = synchronized(lock) {
        val now = clock()
        pruneLocked(now)
        val selected = cookies.filter {
            it.domain.equals(host, ignoreCase = true) &&
                it.expiresAtEpochMillis > now &&
                it.value.isNotEmpty() &&
                (!it.secure || https)
        }
        if (selected.isEmpty()) null else selected.joinToString(separator = "; ") { "${it.name}=${it.value}" }
    }

    fun decorate(request: Request): Request {
        val url = request.url
        val header = cookieHeaderValue(url.host, url.isHttps) ?: return request
        return request.newBuilder().header("Cookie", header).build()
    }

    fun snapshot(): List<StoredAuthCookie> = synchronized(lock) { cookies.toList() }

    private fun pruneLocked(now: Long) {
        val before = cookies.size
        cookies.removeAll { it.expiresAtEpochMillis <= now }
        if (cookies.size != before) persistLocked()
    }

    private fun persistLocked() {
        val durable = cookies.filter { it.expiresAtEpochMillis != Long.MAX_VALUE }
        store.save(durable)
    }
}
