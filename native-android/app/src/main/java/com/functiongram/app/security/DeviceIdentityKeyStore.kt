package com.functiongram.app.security

import android.content.Context
import android.content.pm.PackageManager
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.PrivateKey
import java.security.Signature
import java.security.spec.ECGenParameterSpec

/**
 * Generates one app-scoped signing key in Android Keystore.
 * [sign] returns a signature only. It refuses a key whose encoded private bytes
 * are available, and it never writes the private key to disk or to the status.
 */
class DeviceIdentityKeyStore(
    private val context: Context,
) {
    fun ensure(): DeviceKeyStatus {
        return try {
            val keyStore = open()
            if (!keyStore.containsAlias(DeviceKeyPolicy.ALIAS)) {
                createKey()
            }
            val signature = sign(PROBE)
            if (signature == null || signature.isEmpty()) {
                return DeviceKeyStatus.Unavailable("sign-unavailable")
            }
            describe(open())
        } catch (error: Exception) {
            DeviceKeyStatus.Unavailable(error.javaClass.simpleName)
        }
    }

    fun sign(payload: ByteArray): ByteArray? {
        val keyStore = open()
        val privateKey = keyStore.getKey(DeviceKeyPolicy.ALIAS, null) as? PrivateKey ?: return null
        val encoded = privateKey.encoded
        if (encoded != null) {
            // A key that can leave the process is not the device key we asked for.
            return null
        }
        val signature = Signature.getInstance("SHA256withECDSA")
        signature.initSign(privateKey)
        signature.update(payload)
        return signature.sign()
    }

    private fun createKey() {
        val strongBoxPresent = context.packageManager.hasSystemFeature(PackageManager.FEATURE_STRONGBOX_KEYSTORE)
        if (DeviceKeyPolicy.requestStrongBox(strongBoxPresent)) {
            try {
                generate(strongBox = true)
                return
            } catch (error: Exception) {
                if (DeviceKeyPolicy.requireStrongBox()) throw error
                if (open().containsAlias(DeviceKeyPolicy.ALIAS)) return
            }
        }
        generate(strongBox = false)
    }

    private fun generate(strongBox: Boolean) {
        val generator = KeyPairGenerator.getInstance(
            KeyProperties.KEY_ALGORITHM_EC,
            DeviceKeyPolicy.ANDROID_KEYSTORE,
        )
        generator.initialize(spec(strongBox))
        generator.generateKeyPair()
    }

    private fun spec(strongBox: Boolean): KeyGenParameterSpec {
        return KeyGenParameterSpec.Builder(
            DeviceKeyPolicy.ALIAS,
            KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY,
        )
            .setAlgorithmParameterSpec(ECGenParameterSpec(DeviceKeyPolicy.CURVE))
            .setDigests(KeyProperties.DIGEST_SHA256)
            .setIsStrongBoxBacked(strongBox)
            .setUserAuthenticationRequired(false)
            .build()
    }

    private fun describe(keyStore: KeyStore): DeviceKeyStatus {
        val certificate = keyStore.getCertificate(DeviceKeyPolicy.ALIAS)
            ?: return DeviceKeyStatus.Unavailable("missing-certificate")
        val publicKey = certificate.publicKey
        val encoded = publicKey.encoded ?: return DeviceKeyStatus.Unavailable("missing-public-key")
        val strongBoxPresent = context.packageManager.hasSystemFeature(PackageManager.FEATURE_STRONGBOX_KEYSTORE)
        return DeviceKeyStatus.Ready(
            alias = DeviceKeyPolicy.ALIAS,
            algorithm = publicKey.algorithm,
            publicKeySha256 = Digests.sha256Hex(encoded),
            strongBoxPreferred = DeviceKeyPolicy.requestStrongBox(strongBoxPresent),
        )
    }

    private fun open(): KeyStore = KeyStore.getInstance(DeviceKeyPolicy.ANDROID_KEYSTORE).apply { load(null) }

    private companion object {
        val PROBE: ByteArray = "functiongram-device-key".encodeToByteArray()
    }
}
