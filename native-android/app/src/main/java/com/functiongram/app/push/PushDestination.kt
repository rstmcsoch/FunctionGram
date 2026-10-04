package com.functiongram.app.push

import android.content.Intent
import java.net.URI

sealed class PushDestination {
    data class Conversation(val peerId: String) : PushDestination()
    data object Notifications : PushDestination()
    data class Profile(val idOrUsername: String?) : PushDestination()
}

object PushLinks {
    const val EXTRA_TARGET = "fg_target"
    const val EXTRA_ID = "fg_id"
    const val PUBLIC_HOST = "functiongram.vercel.app"

    private val reserved = setOf(
        "admin",
        "admin-panel",
        "admin-two-factor",
        "api",
        "media",
        "p",
        "reset-password",
        "two-factor",
        "verify-email",
        "_next",
        "favicon.ico",
        "favicon.svg",
    )

    fun fromIntent(intent: Intent?): PushDestination? {
        if (intent == null) return null
        val extras = buildMap {
            listOf(EXTRA_TARGET, EXTRA_ID, "target", "id", "peer", "screen", "conversation").forEach { key ->
                intent.getStringExtra(key)?.let { put(key, it) }
            }
        }
        return parse(intent.dataString, extras)
    }

    fun parse(uri: String?, extras: Map<String, String>): PushDestination? {
        fromExtras(extras)?.let { return it }
        if (uri.isNullOrBlank()) return null
        return fromUri(uri)
    }

    fun targetValue(destination: PushDestination): String = when (destination) {
        is PushDestination.Conversation -> "conversation"
        PushDestination.Notifications -> "notifications"
        is PushDestination.Profile -> "profile"
    }

    fun idValue(destination: PushDestination?): String? = when (destination) {
        is PushDestination.Conversation -> destination.peerId
        is PushDestination.Profile -> destination.idOrUsername
        else -> null
    }

    private fun fromExtras(extras: Map<String, String>): PushDestination? {
        val target = (extras[EXTRA_TARGET] ?: extras["target"] ?: extras["screen"])?.trim()?.lowercase()
            ?: return null
        val id = (extras[EXTRA_ID] ?: extras["id"] ?: extras["peer"] ?: extras["conversation"])?.trim()
        return when (target) {
            "notifications" -> PushDestination.Notifications
            "conversation", "messages" -> {
                if (id.isNullOrEmpty() || !validId(id)) null else PushDestination.Conversation(id)
            }
            "profile" -> {
                if (!id.isNullOrEmpty() && !validId(id)) null else PushDestination.Profile(id?.takeIf { it.isNotEmpty() })
            }
            else -> null
        }
    }

    private fun fromUri(raw: String): PushDestination? {
        val uri = try {
            URI(raw)
        } catch (_: IllegalArgumentException) {
            return null
        }
        val scheme = uri.scheme?.lowercase() ?: return null
        if (scheme == "functiongram") {
            val host = uri.host?.lowercase() ?: return null
            val segment = uri.path.orEmpty().trim('/').substringBefore('/').takeIf { it.isNotEmpty() }
            val id = segment?.let { decode(it) }
            return when (host) {
                "notifications" -> PushDestination.Notifications
                "conversation", "messages" -> id?.takeIf { validId(it) }?.let { PushDestination.Conversation(it) }
                "profile" -> {
                    if (id != null && !validId(id)) null else PushDestination.Profile(id)
                }
                else -> null
            }
        }
        if (scheme != "https" || uri.host?.lowercase() != PUBLIC_HOST) return null
        val fragment = uri.rawFragment
        if (!fragment.isNullOrBlank()) return fromHash(fragment)
        val segments = uri.path.orEmpty().split('/').filter { it.isNotBlank() }
        if (segments.size != 1) return null
        val decoded = decode(segments[0]) ?: return null
        if (decoded.lowercase() in reserved || !validId(decoded)) return null
        return PushDestination.Profile(decoded)
    }

    private fun fromHash(fragment: String): PushDestination? {
        val parts = fragment.removePrefix("#").removePrefix("/").split('/').filter { it.isNotEmpty() }
        if (parts.isEmpty()) return null
        val target = decode(parts[0])?.lowercase() ?: return null
        val id = parts.getOrNull(1)?.let { decode(it) }
        return when (target) {
            "notifications" -> PushDestination.Notifications
            "messages", "conversation" -> {
                if (id == null || !validId(id)) null else PushDestination.Conversation(id)
            }
            "profile" -> {
                if (id != null && !validId(id)) null else PushDestination.Profile(id)
            }
            else -> null
        }
    }

    private fun decode(value: String): String? = try {
        java.net.URLDecoder.decode(value, Charsets.UTF_8.name())
    } catch (_: IllegalArgumentException) {
        null
    }

    private fun validId(id: String): Boolean {
        if (id.isBlank() || id.length > 100) return false
        return id.none { char ->
            char.isISOControl() || char == '/' || char == '\\' || char == '?' || char == '#' || char == ' '
        }
    }
}
