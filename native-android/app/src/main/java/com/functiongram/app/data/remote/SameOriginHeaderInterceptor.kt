package com.functiongram.app.data.remote

import okhttp3.Interceptor
import okhttp3.Response

/**
 * POST /api/social rejects cross-site writes unless Origin matches the API host
 * (or a server-configured trusted origin). A native client has no browser
 * Origin of its own, so requests name the public API origin they are calling.
 * This does not grant a session and does not bypass authentication.
 */
class SameOriginHeaderInterceptor(
    private val origin: String,
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request().newBuilder()
            .header("Origin", origin.trimEnd('/'))
            .header("Accept", "application/json")
            .build()
        return chain.proceed(request)
    }
}
