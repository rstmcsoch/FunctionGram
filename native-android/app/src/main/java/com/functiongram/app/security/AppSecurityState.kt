package com.functiongram.app.security

data class AppSecurityState(
    val apiOrigin: String,
    val deviceKey: DeviceKeyStatus,
    val integrityVerdict: IntegrityVerdict,
    val integritySnapshotJson: String,
)
