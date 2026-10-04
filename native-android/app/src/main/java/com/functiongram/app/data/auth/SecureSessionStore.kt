package com.functiongram.app.data.auth

/**
 * Persistence for Better Auth cookies.
 * Implementations must not log cookie values. A memory store is the fallback
 * when the Keystore-backed store cannot be opened. Plaintext preferences are
 * not a fallback.
 */
interface SecureSessionStore {
    fun load(): List<StoredAuthCookie>
    fun save(cookies: List<StoredAuthCookie>)
    fun clear()
}

class MemorySessionStore : SecureSessionStore {
    private var cookies: List<StoredAuthCookie> = emptyList()

    override fun load(): List<StoredAuthCookie> = cookies

    override fun save(cookies: List<StoredAuthCookie>) {
        this.cookies = cookies
    }

    override fun clear() {
        cookies = emptyList()
    }
}
