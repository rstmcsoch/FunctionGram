package com.functiongram.app.data.remote

import com.functiongram.app.BuildConfig
import com.functiongram.app.configuration.VariantMarker
import com.functiongram.app.security.TransportPolicy
import okhttp3.Interceptor
import okhttp3.Response
import java.io.IOException

/**
 * Network interceptor so each hop, including a redirect, stays on an allowed URL.
 * Release rejects every non-HTTPS request. Debug allows http://localhost only.
 */
class HttpsOnlyInterceptor : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val url = chain.request().url.toString()
        if (!TransportPolicy.allows(url, BuildConfig.DEBUG, VariantMarker.ALLOWS_DEBUG_ENDPOINT)) {
            throw IOException("Refusing a non-HTTPS FunctionGram request.")
        }
        return chain.proceed(chain.request())
    }
}
