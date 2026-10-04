package com.functiongram.app.data.auth

import okhttp3.Interceptor
import okhttp3.Response

/**
 * Adds the stored Better Auth cookie and keeps Set-Cookie values.
 * This interceptor does not log headers.
 */
class SessionCookieInterceptor(
    private val jar: SessionCookieJar,
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = jar.decorate(chain.request())
        val response = chain.proceed(request)
        jar.consume(response.request.url.host, response.headers("Set-Cookie"))
        return response
    }
}
