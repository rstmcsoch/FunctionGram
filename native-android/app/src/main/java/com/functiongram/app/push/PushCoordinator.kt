package com.functiongram.app.push

/**
 * Optional push registration. Failures are swallowed by the caller.
 * Signing in and sending messages do not wait on this type.
 */
class PushCoordinator(
    private val api: PushApi,
    private val snapshot: PushSnapshot,
) : PushLifecycle {
    @Volatile private var signedIn: Boolean = false
    @Volatile private var latestToken: String? = null
    @Volatile private var settings: PushSettings? = null

    fun onToken(token: String) {
        if (!PushToken.isValid(token)) return
        synchronized(this) {
            latestToken = token.trim()
            if (signedIn) sync()
        }
    }

    override fun onSignedIn() {
        synchronized(this) {
            signedIn = true
            val remote = try {
                api.fetchSettings()
            } catch (_: RuntimeException) {
                null
            }
            if (remote != null) {
                settings = remote
                snapshot.saveSettings(remote)
            } else if (settings == null) {
                settings = snapshot.settings()
            }
            sync()
        }
    }

    override fun onNotificationsEnabled(enabled: Boolean) {
        synchronized(this) {
            val base = settings ?: snapshot.settings() ?: PushSettings(
                notificationsEnabled = enabled,
                kinds = emptyMap(),
                mutedPeerIds = emptySet(),
                pushDelivery = "unknown",
            )
            val next = base.copy(notificationsEnabled = enabled)
            settings = next
            snapshot.saveSettings(next)
            if (signedIn) sync()
        }
    }

    override fun prepareSignOut() {
        synchronized(this) {
            val token = snapshot.token() ?: latestToken
            signedIn = false
            settings = null
            latestToken = null
            if (!token.isNullOrBlank()) {
                try {
                    api.unregister(token)
                } catch (_: RuntimeException) {
                    // Sign-out still proceeds.
                }
            }
            snapshot.saveToken(null)
        }
    }

    private fun sync() {
        val current = settings ?: return
        val token = latestToken ?: snapshot.token()
        if (token.isNullOrBlank()) return
        if (!PushPolicy.shouldRegister(current)) {
            try {
                api.unregister(token)
            } catch (_: RuntimeException) {
                return
            }
            snapshot.saveToken(null)
            return
        }
        when (
            try {
                api.register(token)
            } catch (_: RuntimeException) {
                PushWrite.FAILED
            }
        ) {
            PushWrite.OK -> snapshot.saveToken(token)
            PushWrite.REJECTED -> snapshot.saveToken(null)
            PushWrite.FAILED -> Unit
        }
    }
}

interface PushLifecycle {
    fun onSignedIn()
    fun prepareSignOut()
    fun onNotificationsEnabled(enabled: Boolean)
}
