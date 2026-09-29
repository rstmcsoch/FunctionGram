package com.functiongram.dypollabs.app.data

import android.util.Log
import com.google.gson.Gson
import com.google.gson.JsonObject
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import retrofit2.Response
import okhttp3.ResponseBody

class AuthRepository(
    private val sessionManager: SessionManager
) {
    private val gson = Gson()

    private fun getServices(): Pair<AuthApiService, String> {
        val baseUrl = sessionManager.getBaseUrlSync()
        return ApiClient.createAuthService(baseUrl, sessionManager) to baseUrl
    }

    suspend fun signUp(email: String, password: String, name: String): Result<String> = withContext(Dispatchers.IO) {
        try {
            val (service, _) = getServices()
            val body = mapOf(
                "email" to email,
                "password" to password,
                "name" to name,
                "callbackURL" to "/"
            )
            val response = service.signUp(body)
            handleAuthResponse(response)
        } catch (e: Exception) {
            Log.e("AuthRepository", "SignUp error", e)
            Result.failure(e)
        }
    }

    suspend fun signIn(email: String, password: String): Result<String> = withContext(Dispatchers.IO) {
        try {
            val (service, _) = getServices()
            val body = mapOf(
                "email" to email,
                "password" to password,
                "callbackURL" to "/"
            )
            val response = service.signIn(body)
            handleAuthResponse(response)
        } catch (e: Exception) {
            Log.e("AuthRepository", "SignIn error", e)
            Result.failure(e)
        }
    }

    suspend fun sendVerificationEmail(email: String): Result<String> = withContext(Dispatchers.IO) {
        try {
            val (service, _) = getServices()
            val body = mapOf(
                "email" to email,
                "callbackURL" to "/verify-email?verified=1"
            )
            val response = service.sendVerificationEmail(body)
            handleAuthResponse(response)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun requestPasswordReset(email: String): Result<String> = withContext(Dispatchers.IO) {
        try {
            val (service, _) = getServices()
            val body = mapOf(
                "email" to email,
                "redirectTo" to "/reset-password"
            )
            val response = service.requestPasswordReset(body)
            handleAuthResponse(response)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun resetPassword(token: String, newPassword: String): Result<String> = withContext(Dispatchers.IO) {
        try {
            val (service, _) = getServices()
            val body = mapOf(
                "token" to token,
                "newPassword" to newPassword
            )
            val response = service.resetPassword(body)
            handleAuthResponse(response)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun getSession(): Result<String> = withContext(Dispatchers.IO) {
        try {
            val (service, _) = getServices()
            val response = service.getSession()
            if (response.isSuccessful) {
                val body = response.body()?.string() ?: ""
                if (body == "null" || body.isBlank()) {
                    Result.failure(Exception("No session"))
                } else {
                    Result.success(body)
                }
            } else {
                Result.failure(Exception("Session check failed: ${response.code()}"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun signOut(): Result<Unit> = withContext(Dispatchers.IO) {
        try {
            val (service, _) = getServices()
            val response = service.signOut()
            sessionManager.clearSession()
            RetrofitClient.clearCache()
            if (response.isSuccessful) {
                Result.success(Unit)
            } else {
                Result.success(Unit) // Clear anyway
            }
        } catch (e: Exception) {
            sessionManager.clearSession()
            Result.success(Unit)
        }
    }

    private fun handleAuthResponse(response: Response<ResponseBody>): Result<String> {
        return try {
            val bodyString = response.body()?.string() ?: response.errorBody()?.string() ?: ""
            if (response.isSuccessful) {
                Result.success(bodyString)
            } else {
                // Try to parse error
                try {
                    val json = JSONObject(bodyString)
                    val error = json.optString("error", "Unknown error")
                    val code = json.optString("code", "")
                    if (code == "EMAIL_NOT_VERIFIED") {
                        Result.failure(Exception("EMAIL_NOT_VERIFIED:$error"))
                    } else {
                        Result.failure(Exception(error))
                    }
                } catch (e: Exception) {
                    Result.failure(Exception("Error ${response.code()}: $bodyString"))
                }
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}
