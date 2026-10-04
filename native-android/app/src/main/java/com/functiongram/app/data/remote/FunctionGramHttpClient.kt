package com.functiongram.app.data.remote

import com.functiongram.app.BuildConfig
import com.functiongram.app.configuration.VariantMarker
import com.functiongram.app.security.EndpointResolver
import com.functiongram.app.security.InMemorySessionCookieJar
import okhttp3.ConnectionSpec
import okhttp3.OkHttpClient
import okhttp3.Request

/**
 * HTTP foundation aimed at the existing FunctionGram API.
 * Nothing in this type opens a database connection or a WebView.
 */
class FunctionGramHttpClient(
    origin: String,
    private val client: OkHttpClient = defaultClient(origin),
) {
    private val origin: String = origin.trim().trimEnd('/')

    init {
        EndpointResolver.assertAllowed(
            origin = this.origin,
            debugBuild = BuildConfig.DEBUG,
            allowDebugEndpoint = VariantMarker.ALLOWS_DEBUG_ENDPOINT,
        )
    }

    fun healthRequest(): Request = Request.Builder()
        .url(ApiRoutes.health(origin))
        .get()
        .build()

    fun newCall(request: Request) = client.newCall(request)

    companion object {
        fun defaultClient(origin: String): OkHttpClient {
            val normalized = origin.trim().trimEnd('/')
            EndpointResolver.assertAllowed(
                origin = normalized,
                debugBuild = BuildConfig.DEBUG,
                allowDebugEndpoint = VariantMarker.ALLOWS_DEBUG_ENDPOINT,
            )
            val specs = if (normalized.startsWith("https://")) {
                listOf(ConnectionSpec.MODERN_TLS, ConnectionSpec.COMPATIBLE_TLS)
            } else {
                listOf(ConnectionSpec.CLEARTEXT)
            }
            return OkHttpClient.Builder()
                .connectionSpecs(specs)
                .cookieJar(InMemorySessionCookieJar())
                .addInterceptor(SameOriginHeaderInterceptor(normalized))
                .addNetworkInterceptor(HttpsOnlyInterceptor())
                .build()
        }
    }
}
