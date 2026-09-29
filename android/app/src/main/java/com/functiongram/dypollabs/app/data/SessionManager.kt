package com.functiongram.dypollabs.app.data

import android.content.Context
import android.content.SharedPreferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull

private val Context.dataStore by preferencesDataStore(name = "functiongram_prefs")

class SessionManager(private val context: Context) {

    companion object {
        private val BASE_URL_KEY = stringPreferencesKey("base_url")
        const val DEFAULT_BASE_URL = "https://functiongram.vercel.app"
    }

    private val prefs: SharedPreferences by lazy {
        context.getSharedPreferences("fg_cookies", Context.MODE_PRIVATE)
    }

    private val mainPrefs: SharedPreferences by lazy {
        context.getSharedPreferences("functiongram_prefs_main", Context.MODE_PRIVATE)
    }

    // Cookie Jar for OkHttp - persistent
    val cookieJar = object : CookieJar {
        private val cookieStore = mutableMapOf<String, MutableList<Cookie>>()

        init {
            val saved = prefs.getString("cookies", null)
            if (saved != null) {
                try {
                    val parts = saved.split(";;")
                    for (part in parts) {
                        if (part.isBlank()) continue
                        val hostEnd = part.indexOf('|')
                        if (hostEnd == -1) continue
                        val host = part.substring(0, hostEnd)
                        val cookieStr = part.substring(hostEnd + 1)
                        val url = "https://$host".toHttpUrlOrNull() ?: continue
                        val cookie = Cookie.parse(url, cookieStr) ?: continue
                        cookieStore.getOrPut(host) { mutableListOf() }.add(cookie)
                    }
                } catch (e: Exception) {
                    // ignore
                }
            }
        }

        override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
            val host = url.host
            val existing = cookieStore.getOrPut(host) { mutableListOf() }
            for (newCookie in cookies) {
                existing.removeAll { it.name == newCookie.name }
                existing.add(newCookie)
            }
            persist()
        }

        override fun loadForRequest(url: HttpUrl): List<Cookie> {
            return cookieStore[url.host]?.filter { 
                it.expiresAt > System.currentTimeMillis() 
            } ?: emptyList()
        }

        private fun persist() {
            val sb = StringBuilder()
            for ((host, cookies) in cookieStore) {
                for (cookie in cookies) {
                    if (sb.isNotEmpty()) sb.append(";;")
                    sb.append(host).append("|").append(cookie.toString())
                }
            }
            prefs.edit().putString("cookies", sb.toString()).apply()
        }

        fun clear() {
            cookieStore.clear()
            prefs.edit().remove("cookies").apply()
        }
    }

    val baseUrlFlow: Flow<String> = context.dataStore.data.map { preferences ->
        preferences[BASE_URL_KEY] ?: mainPrefs.getString("base_url", null) ?: DEFAULT_BASE_URL
    }

    suspend fun getBaseUrl(): String {
        return try {
            context.dataStore.data.first()[BASE_URL_KEY] 
                ?: mainPrefs.getString("base_url", null) 
                ?: DEFAULT_BASE_URL
        } catch (e: Exception) {
            mainPrefs.getString("base_url", null) ?: DEFAULT_BASE_URL
        }
    }

    fun getBaseUrlSync(): String {
        return mainPrefs.getString("base_url", null) ?: DEFAULT_BASE_URL
    }

    suspend fun setBaseUrl(url: String) {
        try {
            context.dataStore.edit { it[BASE_URL_KEY] = url }
        } catch (e: Exception) {
            // Fallback to SharedPreferences if DataStore fails
        }
        mainPrefs.edit().putString("base_url", url).apply()
    }

    fun setBaseUrlSync(url: String) {
        mainPrefs.edit().putString("base_url", url).apply()
    }

    fun clearSession() {
        cookieJar.clear()
        mainPrefs.edit().remove("user_json").apply()
    }

    fun saveUserJson(json: String) {
        mainPrefs.edit().putString("user_json", json).apply()
    }

    fun getUserJson(): String? {
        return mainPrefs.getString("user_json", null)
    }

    fun isLoggedIn(): Boolean {
        return mainPrefs.contains("user_json") || prefs.contains("cookies")
    }
}
