package com.functiongram.app.security

sealed class DeviceKeyStatus {
    data class Ready(
        val alias: String,
        val algorithm: String,
        val publicKeySha256: String,
        val strongBoxPreferred: Boolean,
    ) : DeviceKeyStatus()

    data class Unavailable(val reason: String) : DeviceKeyStatus()
}
