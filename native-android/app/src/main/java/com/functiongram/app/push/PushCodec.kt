package com.functiongram.app.push

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.longOrNull

object PushCodec {
    private val json = Json { ignoreUnknownKeys = true }

    fun settings(status: Int, body: String): PushSettings? {
        if (status !in 200..299 || body.isBlank()) return null
        val root = try {
            json.parseToJsonElement(body) as? JsonObject
        } catch (_: IllegalArgumentException) {
            null
        } ?: return null
        val kinds = (root["kinds"] as? JsonObject)?.mapNotNull { (key, value) ->
            flag(value)?.let { key to it }
        }?.toMap().orEmpty()
        val muted = (root["mutedPeerIds"] as? JsonArray)?.mapNotNull { element ->
            (element as? JsonPrimitive)?.contentOrNull?.trim()?.takeIf { it.isNotEmpty() }
        }?.take(200)?.toSet().orEmpty()
        val delivery = (root["pushDelivery"] as? JsonPrimitive)?.contentOrNull?.trim().orEmpty()
            .ifBlank { "unknown" }
        return PushSettings(
            notificationsEnabled = flag(root["notificationsEnabled"]) == true,
            kinds = kinds,
            mutedPeerIds = muted,
            pushDelivery = delivery,
        )
    }

    fun registerBody(token: String): String {
        require(PushToken.isValid(token)) { "Invalid device token." }
        return """{"token":"$token","platform":"android"}"""
    }

    fun unregisterBody(token: String): String {
        require(PushToken.isValid(token)) { "Invalid device token." }
        return """{"token":"$token"}"""
    }

    private fun flag(value: kotlinx.serialization.json.JsonElement?): Boolean? {
        val primitive = value as? JsonPrimitive ?: return null
        primitive.booleanOrNull?.let { return it }
        primitive.longOrNull?.let { return it == 1L }
        return when (primitive.contentOrNull) {
            "1", "true" -> true
            "0", "false" -> false
            else -> null
        }
    }
}
