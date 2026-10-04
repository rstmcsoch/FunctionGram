package com.functiongram.app.data.remote

import com.functiongram.app.security.ClientSecretPolicy
import com.functiongram.app.security.InMemorySessionCookieJar
import okhttp3.OkHttpClient
import okhttp3.Request

/**
 * HTTP foundation aimed at the existing FunctionGram API.
 * Callers are expected to pass the public origin from [com.functiongram.app.configuration.ApiEnvironment].
 * Nothing in this type opens a database connection.
 */
class FunctionGramHttpClient(
    origin: String,
    private val client: OkHttpClient = defaultClient(origin),
) {
    private val origin: String = origin.trim().trimEnd('/')

    init {
        ClientSecretPolicy.requirePublicApiOrigin(this.origin)
    }

    fun healthRequest(): Request = Request.Builder()
        .url(ApiRoutes.health(origin))
        .get()
        .build()

    fun newCall(request: Request) = client.newCall(request)

    companion object {
        fun defaultClient(origin: String): OkHttpClient {
            val normalized = origin.trim().trimEnd('/')
            ClientSecretPolicy.requirePublicApiOrigin(normalized)
            return OkHttpClient.Builder()
                .cookieJar(InMemorySessionCookieJar())
                .addInterceptor(SameOriginHeaderInterceptor(normalized))
                .build()
        }
    }
}
