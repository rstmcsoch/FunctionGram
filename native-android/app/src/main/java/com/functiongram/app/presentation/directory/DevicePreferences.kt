package com.functiongram.app.presentation.directory

import android.content.Context
import com.functiongram.app.data.directory.DirectoryDerive
import com.functiongram.app.data.directory.ThemeChoice
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

interface RecentSearchStore {
    fun read(): List<String>
    fun write(values: List<String>)
}

/**
 * Device-only preferences. Theme matches the website's local `rstmc-theme` choice.
 * The public API does not store a per-account theme, and this is not an admin setting.
 */
class DevicePreferences(context: Context) {
    private val prefs = context.getSharedPreferences(FILE, Context.MODE_PRIVATE)
    private val themeFlow = MutableStateFlow(ThemeChoice.fromStored(prefs.getString(THEME, null)))

    val theme: StateFlow<ThemeChoice> = themeFlow

    val recents: RecentSearchStore = object : RecentSearchStore {
        override fun read(): List<String> = decode(prefs.getString(RECENTS, null))

        override fun write(values: List<String>) {
            val kept = values.take(8)
            prefs.edit().putString(RECENTS, encode(kept)).apply()
        }
    }

    fun setTheme(choice: ThemeChoice) {
        prefs.edit().putString(THEME, ThemeChoice.stored(choice)).apply()
        themeFlow.value = choice
    }

    private fun encode(values: List<String>): String =
        JsonArray(values.map { JsonPrimitive(it) }).toString()

    private fun decode(raw: String?): List<String> {
        if (raw.isNullOrBlank()) return emptyList()
        val array = try {
            Json.parseToJsonElement(raw) as? JsonArray
        } catch (_: IllegalArgumentException) {
            null
        } ?: return emptyList()
        return array.mapNotNull { element ->
            val text = (element as? JsonPrimitive)?.contentOrNull?.trim()
            text?.takeIf { it.isNotEmpty() }
        }.let { items ->
            items.fold(emptyList<String>()) { acc, item -> DirectoryDerive.rememberRecent(acc, item) }
        }
    }

    private companion object {
        const val FILE = "functiongram-device"
        const val THEME = "rstmc-theme"
        const val RECENTS = "rstmc-recent-searches"
    }
}
