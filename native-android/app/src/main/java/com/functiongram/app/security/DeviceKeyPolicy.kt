package com.functiongram.app.security

/**
 * Android Keystore device key. StrongBox is used when the device has it.
 * Devices without StrongBox still get a keystore key. The private key is not
 * exported; Android Keystore keys report no encoded form.
 */
object DeviceKeyPolicy {
    const val ANDROID_KEYSTORE = "AndroidKeyStore"
    const val ALIAS = "functiongram.device.identity"
    const val CURVE = "secp256r1"

    fun requireStrongBox(): Boolean = false

    fun requestStrongBox(strongBoxPresent: Boolean): Boolean = strongBoxPresent
}
