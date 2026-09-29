package com.functiongram.dypollabs.app.data

import com.google.gson.JsonObject
import okhttp3.MultipartBody
import okhttp3.RequestBody
import okhttp3.ResponseBody
import retrofit2.Response
import retrofit2.http.*

interface AuthApiService {
    @POST("api/auth/sign-up/email")
    suspend fun signUp(
        @Body body: Map<String, String>
    ): Response<ResponseBody>

    @POST("api/auth/sign-in/email")
    suspend fun signIn(
        @Body body: Map<String, String>
    ): Response<ResponseBody>

    @POST("api/auth/send-verification-email")
    suspend fun sendVerificationEmail(
        @Body body: Map<String, String>
    ): Response<ResponseBody>

    @POST("api/auth/request-password-reset")
    suspend fun requestPasswordReset(
        @Body body: Map<String, String>
    ): Response<ResponseBody>

    @POST("api/auth/reset-password")
    suspend fun resetPassword(
        @Body body: Map<String, String>
    ): Response<ResponseBody>

    @GET("api/auth/get-session")
    suspend fun getSession(): Response<ResponseBody>

    @POST("api/auth/sign-out")
    suspend fun signOut(): Response<ResponseBody>
}

interface SocialApiService {
    @GET("api/social")
    suspend fun getBootstrap(): Response<ResponseBody>

    @GET("api/social")
    suspend fun getFeed(
        @Query("offset") offset: Int = 0,
        @Query("category") category: String? = null,
        @Query("reels") reels: String? = null,
        @Query("explore") explore: String? = null,
        @Query("following") following: String? = null,
        @Query("profile") profile: String? = null,
        @Query("post") post: String? = null,
        @Query("saved") saved: String? = null,
        @Query("search") search: String? = null,
        @Query("hashtag") hashtag: String? = null
    ): Response<ResponseBody>

    @GET("api/social")
    suspend fun getComments(
        @Query("comments") postId: String,
        @Query("limit") limit: Int = 30,
        @Query("cursor") cursor: String? = null
    ): Response<ResponseBody>

    @GET("api/social")
    suspend fun getMessages(
        @Query("messages") otherId: String,
        @Query("limit") limit: Int = 30,
        @Query("cursor") cursor: String? = null
    ): Response<ResponseBody>

    @GET("api/social")
    suspend fun getInbox(): Response<ResponseBody>

    @GET("api/social")
    suspend fun getPerson(
        @Query("person") personId: String
    ): Response<ResponseBody>

    @GET("api/social")
    suspend fun getNotifications(): Response<ResponseBody>

    @GET("api/social")
    suspend fun getActivity(): Response<ResponseBody>

    @GET("api/social")
    suspend fun getUploadPolicy(
        @Query("upload-policy") policy: String = "1"
    ): Response<ResponseBody>

    @POST("api/social")
    suspend fun performAction(
        @Body body: Map<String, @JvmSuppressWildcards Any>
    ): Response<ResponseBody>

    @GET("api/social")
    suspend fun search(
        @Query("search") term: String
    ): Response<ResponseBody>

    @GET("api/social")
    suspend fun getCollections(
        @Query("collections") collections: String = "1"
    ): Response<ResponseBody>
}

interface UploadApiService {
    @POST("api/upload")
    suspend fun getUploadToken(
        @Body body: Map<String, Any>
    ): Response<ResponseBody>

    @POST("api/upload/complete")
    suspend fun completeUpload(
        @Body body: Map<String, String>
    ): Response<ResponseBody>

    @Multipart
    @POST("api/mobile/upload")
    suspend fun mobileUpload(
        @Part file: MultipartBody.Part,
        @Part("caption") caption: RequestBody? = null,
        @Part("kind") kind: RequestBody? = null
    ): Response<ResponseBody>

    @GET("api/media/{key}")
    suspend fun getMedia(
        @Path("key") key: String
    ): Response<ResponseBody>
}

// Generic API client builder
object ApiClient {
    fun createAuthService(baseUrl: String, sessionManager: SessionManager): AuthApiService {
        return RetrofitClient.getClient(baseUrl, sessionManager).create(AuthApiService::class.java)
    }

    fun createSocialService(baseUrl: String, sessionManager: SessionManager): SocialApiService {
        return RetrofitClient.getClient(baseUrl, sessionManager).create(SocialApiService::class.java)
    }

    fun createUploadService(baseUrl: String, sessionManager: SessionManager): UploadApiService {
        return RetrofitClient.getClient(baseUrl, sessionManager).create(UploadApiService::class.java)
    }
}

object RetrofitClient {
    private var clients = mutableMapOf<String, retrofit2.Retrofit>()

    fun getClient(baseUrl: String, sessionManager: SessionManager): retrofit2.Retrofit {
        val normalizedUrl = if (baseUrl.endsWith("/")) baseUrl else "$baseUrl/"
        return clients.getOrPut(normalizedUrl) {
            val logging = okhttp3.logging.HttpLoggingInterceptor().apply {
                level = okhttp3.logging.HttpLoggingInterceptor.Level.BODY
            }

            val client = okhttp3.OkHttpClient.Builder()
                .cookieJar(sessionManager.cookieJar)
                .addInterceptor(logging)
                .addInterceptor { chain ->
                    val request = chain.request().newBuilder()
                        .addHeader("Accept", "application/json")
                        .addHeader("Content-Type", "application/json")
                        .addHeader("User-Agent", "FunctionGram-Android/1.0")
                        .build()
                    chain.proceed(request)
                }
                .connectTimeout(30, java.util.concurrent.TimeUnit.SECONDS)
                .readTimeout(60, java.util.concurrent.TimeUnit.SECONDS)
                .writeTimeout(60, java.util.concurrent.TimeUnit.SECONDS)
                .build()

            retrofit2.Retrofit.Builder()
                .baseUrl(normalizedUrl)
                .client(client)
                .addConverterFactory(retrofit2.converter.gson.GsonConverterFactory.create())
                .build()
        }
    }

    fun clearCache() {
        clients.clear()
    }
}
