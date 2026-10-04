package com.functiongram.app.push

data class PushSettings(
    val notificationsEnabled: Boolean,
    val kinds: Map<String, Boolean>,
    val mutedPeerIds: Set<String>,
    val pushDelivery: String,
)

object PushPolicy {
    /** Registration follows the notifications feature only. Delivery may still be unconfigured. */
    fun shouldRegister(settings: PushSettings): Boolean = settings.notificationsEnabled

    fun shouldDisplay(settings: PushSettings, kind: String?, peerId: String?): Boolean {
        if (!settings.notificationsEnabled) return false
        if (!kind.isNullOrBlank() && settings.kinds[kind] == false) return false
        if (!peerId.isNullOrBlank() && peerId in settings.mutedPeerIds) return false
        return true
    }
}
