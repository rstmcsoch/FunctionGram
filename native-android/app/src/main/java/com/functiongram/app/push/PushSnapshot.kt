package com.functiongram.app.push

import android.content.Context
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

interface PushSnapshot {
    fun settings(): PushSettings?
    fun saveSettings(settings: PushSettings)
    fun token(): String?
    fun saveToken(token: String?)
}

class MemoryPushSnapshot : PushSnapshot {
    private var settings: PushSettings? = null
    private var token: String? = null

    override fun settings(): PushSettings? = settings

    override fun saveSettings(settings: PushSettings) {
        this.settings = settings
    }

    override fun token(): String? = token

    override fun saveToken(token: String?) {
        this.token = token?.takeIf { PushToken.isValid(it) }
    }
}

class AndroidPushSnapshot(context: Context) : PushSnapshot {
    private val prefs = context.applicationContext.getSharedPreferences(FILE, Context.MODE_PRIVATE)

    override fun settings(): PushSettings? {
        if (!prefs.contains(ENABLED)) return null
        return PushSettings(
            notificationsEnabled = prefs.getBoolean(ENABLED, false),
            kinds = decodeKinds(prefs.getString(KINDS, null)),
            mutedPeerIds = decodeMuted(prefs.getString(MUTED, null)),
            pushDelivery = prefs.getString(DELIVERY, null)?.ifBlank { "unknown" } ?: "unknown",
        )
    }

    override fun saveSettings(settings: PushSettings) {
        prefs.edit()
            .putBoolean(ENABLED, settings.notificationsEnabled)
            .putString(KINDS, encodeKinds(settings.kinds))
            .putString(MUTED, encodeMuted(settings.mutedPeerIds))
            .putString(DELIVERY, settings.pushDelivery)
            .apply()
    }

    override fun token(): String? = prefs.getString(TOKEN, null)?.takeIf { PushToken.isValid(it) }

    override fun saveToken(token: String?) {
        val editor = prefs.edit()
        val valid = token?.takeIf { PushToken.isValid(it) }
        if (valid == null) editor.remove(TOKEN) else editor.putString(TOKEN, valid)
        editor.apply()
    }

    private fun encodeKinds(kinds: Map<String, Boolean>): String =
        JsonObject(kinds.mapValues { JsonPrimitive(it.value) }).toString()

    private fun decodeKinds(raw: String?): Map<String, Boolean> {
        val obj = parse(raw) as? JsonObject ?: return emptyMap()
        return obj.mapNotNull { (key, value) ->
            val primitive = value as? JsonPrimitive ?: return@mapNotNull null
            val flag = primitive.contentOrNull?.toBooleanStrictOrNull() ?: return@mapNotNull null
            key to flag
        }.toMap()
    }

    private fun encodeMuted(ids: Set<String>): String =
        JsonArray(ids.take(200).map { JsonPrimitive(it) }).toString()

    private fun decodeMuted(raw: String?): Set<String> {
        val array = parse(raw) as? JsonArray ?: return emptySet()
        return array.mapNotNull { (it as? JsonPrimitive)?.contentOrNull?.trim()?.takeIf { id -> id.isNotEmpty() } }.toSet()
    }

    private fun parse(raw: String?): kotlinx.serialization.json.JsonElement? {
        if (raw.isNullOrBlank()) return null
        return try {
            Json.parseToJsonElement(raw)
        } catch (_: IllegalArgumentException) {
            null
        }
    }

    private companion object {
        const val FILE = "functiongram_push"
        const val ENABLED = "notifications_enabled"
        const val KINDS = "kinds"
        const val MUTED = "muted_peers"
        const val DELIVERY = "push_delivery"
        const val TOKEN = "device_token"
    }
}
