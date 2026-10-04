package com.functiongram.app.push

/**
 * Compiled when the optional services file is absent.
 * Login and messaging do not call Firebase.
 */
object FcmBridge {
    const val available: Boolean = false

    fun install(onToken: (String) -> Unit) {
        PushEvents.listener = onToken
    }
}
