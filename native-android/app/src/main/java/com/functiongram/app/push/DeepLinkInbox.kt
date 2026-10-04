package com.functiongram.app.push

import android.content.Intent
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

class DeepLinkInbox {
    private val flow = MutableStateFlow<PushDestination?>(null)
    val pending: StateFlow<PushDestination?> = flow.asStateFlow()

    fun offer(intent: Intent?) {
        val destination = PushLinks.fromIntent(intent) ?: return
        flow.value = destination
    }

    fun offer(destination: PushDestination) {
        flow.value = destination
    }

    fun consume() {
        flow.value = null
    }
}
