package com.functiongram.app.data.auth

import android.content.Context
import android.util.Log
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKeys
import java.io.IOException
import java.security.GeneralSecurityException

/**
 * Keystore-backed cookie store. Values are encrypted at rest.
 * If the store cannot be opened, cookies stay in process memory only.
 */
class EncryptedSessionStore private constructor(
    private val preferences: android.content.SharedPreferences,
) : SecureSessionStore {
    override fun load(): List<StoredAuthCookie> {
        val raw = preferences.getString(KEY, null) ?: return emptyList()
        return SessionCookieCodec.decode(raw)
    }

    override fun save(cookies: List<StoredAuthCookie>) {
        preferences.edit().putString(KEY, SessionCookieCodec.encode(cookies)).commit()
    }

    override fun clear() {
        preferences.edit().remove(KEY).commit()
    }

    companion object {
        private const val TAG = "FunctionGramSession"
        private const val FILE_NAME = "functiongram_auth_session"
        private const val KEY = "session_cookies"

        fun open(context: Context): SecureSessionStore {
            return try {
                val masterKeyAlias = MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC)
                val preferences = EncryptedSharedPreferences.create(
                    FILE_NAME,
                    masterKeyAlias,
                    context,
                    EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                    EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
                )
                EncryptedSessionStore(preferences)
            } catch (error: GeneralSecurityException) {
                Log.w(TAG, "Session store unavailable: ${error.javaClass.simpleName}")
                MemorySessionStore()
            } catch (error: IOException) {
                Log.w(TAG, "Session store unavailable: ${error.javaClass.simpleName}")
                MemorySessionStore()
            }
        }
    }
}
