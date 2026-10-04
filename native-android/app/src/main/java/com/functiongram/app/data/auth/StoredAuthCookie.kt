package com.functiongram.app.data.auth

import kotlinx.serialization.Serializable

@Serializable
data class StoredAuthCookie(
    val name: String,
    val value: String,
    val domain: String,
    val path: String,
    val secure: Boolean,
    val httpOnly: Boolean,
    val expiresAtEpochMillis: Long,
) {
    override fun toString(): String {
        return "StoredAuthCookie(name=$name,domain=$domain,expiresAtEpochMillis=$expiresAtEpochMillis,value=redacted)"
    }
}
