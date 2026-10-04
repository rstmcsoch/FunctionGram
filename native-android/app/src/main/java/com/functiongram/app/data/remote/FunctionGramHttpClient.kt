package com.functiongram.app.data.remote

import com.functiongram.app.BuildConfig
import com.functiongram.app.configuration.VariantMarker
import com.functiongram.app.data.auth.SessionCookieInterceptor
import com.functiongram.app.data.auth.SessionCookieJar
import com.functiongram.app.security.EndpointResolver
import okhttp3.ConnectionSpec
import okhttp3.CookieJar
import okhttp3.OkHttpClient
import okhttp3.Request

/**
 * HTTP client aimed at the existing FunctionGram API.
 * Auth cookies, when a jar is supplied, are added by [SessionCookieInterceptor].
 * Nothing in this type opens a database connection or a WebView.
 */
class FunctionGramHttpClient(
    origin: String,
    sessionJar: SessionCookieJar? = null,
    private val client: OkHttpClient = defaultClient(origin, sessionJar),
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

    fun okHttp(): OkHttpClient = client

    companion object {
        fun defaultClient(origin: String, sessionJar: SessionCookieJar? = null): OkHttpClient {
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
            val builder = OkHttpClient.Builder()
                .connectionSpecs(specs)
                .cookieJar(CookieJar.NO_COOKIES)
                .addInterceptor(SameOriginHeaderInterceptor(normalized))
                .addNetworkInterceptor(HttpsOnlyInterceptor())
            if (sessionJar != null) {
                builder.addInterceptor(SessionCookieInterceptor(sessionJar))
            }
            return builder.build()
        }
    }
}
