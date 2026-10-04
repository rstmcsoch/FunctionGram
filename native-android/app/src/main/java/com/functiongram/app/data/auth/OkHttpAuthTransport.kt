package com.functiongram.app.data.auth

import com.functiongram.app.data.remote.ApiRoutes
import java.io.IOException
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

class OkHttpAuthTransport(
    private val origin: String,
    private val client: OkHttpClient,
) : AuthTransport {
    override val host: String = origin.trim().trimEnd('/').toHttpUrl().host

    override fun execute(request: AuthWireRequest): AuthHttpResult {
        val url = ApiRoutes.auth(origin, request.path)
        val builder = Request.Builder()
            .url(url)
            .header("Accept", "application/json")
            .header("User-Agent", USER_AGENT)
        if (request.method == "GET") {
            builder.get()
        } else {
            val payload = request.jsonBody ?: "{}"
            builder.method(request.method, payload.toRequestBody(JSON))
        }
        return try {
            client.newCall(builder.build()).execute().use { response ->
                val payload = response.peekBody(MAX_BODY_BYTES).string()
                AuthHttpResult(
                    status = response.code,
                    body = payload,
                    setCookies = response.headers("Set-Cookie"),
                )
            }
        } catch (_: IOException) {
            AuthHttpResult(status = 0, body = "", transportFailed = true)
        }
    }

    private companion object {
        const val USER_AGENT = "FunctionGram-Android"
        const val MAX_BODY_BYTES = 65_536L
        val JSON = "application/json; charset=utf-8".toMediaType()
    }
}
