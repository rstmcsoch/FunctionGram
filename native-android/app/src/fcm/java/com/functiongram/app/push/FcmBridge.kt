package com.functiongram.app.push

import com.google.firebase.messaging.FirebaseMessaging

object FcmBridge {
    const val available: Boolean = true

    fun install(onToken: (String) -> Unit) {
        PushEvents.listener = onToken
        FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
            if (!task.isSuccessful) return@addOnCompleteListener
            val token = task.result?.trim().orEmpty()
            if (PushToken.isValid(token)) onToken(token)
        }
    }
}
