package com.functiongram.app.security

import java.security.MessageDigest

object Digests {
    fun sha256(data: ByteArray): ByteArray = MessageDigest.getInstance("SHA-256").digest(data)

    fun sha256Hex(data: ByteArray): String = sha256(data).joinToString("") { "%02x".format(it) }

    fun equal(left: ByteArray, right: ByteArray): Boolean = MessageDigest.isEqual(left, right)
}
