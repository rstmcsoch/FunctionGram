package com.functiongram.app.push

import com.functiongram.app.data.remote.ApiRoutes
import java.io.IOException
import java.util.concurrent.TimeUnit
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

enum class PushWrite {
    OK,
    REJECTED,
    FAILED,
}

interface PushApi {
    fun fetchSettings(): PushSettings?
    fun register(token: String): PushWrite
    fun unregister(token: String): PushWrite
}

class OkHttpPushApi(
    private val origin: String,
    client: OkHttpClient,
) : PushApi {
    private val http = client.newBuilder()
        .callTimeout(20, TimeUnit.SECONDS)
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .writeTimeout(20, TimeUnit.SECONDS)
        .build()

    override fun fetchSettings(): PushSettings? {
        val raw = execute(Request.Builder().url(ApiRoutes.push(origin)).get().build())
        return PushCodec.settings(raw.status, raw.text)
    }

    override fun register(token: String): PushWrite {
        if (!PushToken.isValid(token)) return PushWrite.REJECTED
        val raw = execute(
            Request.Builder()
                .url(ApiRoutes.push(origin))
                .post(PushCodec.registerBody(token).toRequestBody(JSON))
                .build(),
        )
        return when (raw.status) {
            in 200..299 -> PushWrite.OK
            403 -> PushWrite.REJECTED
            else -> PushWrite.FAILED
        }
    }

    override fun unregister(token: String): PushWrite {
        if (!PushToken.isValid(token)) return PushWrite.REJECTED
        val raw = execute(
            Request.Builder()
                .url(ApiRoutes.push(origin))
                .delete(PushCodec.unregisterBody(token).toRequestBody(JSON))
                .build(),
        )
        return when (raw.status) {
            in 200..299, 401, 404 -> PushWrite.OK
            else -> PushWrite.FAILED
        }
    }

    private fun execute(request: Request): Raw {
        return try {
            http.newCall(request).execute().use { response ->
                val bytes = response.body?.bytes() ?: ByteArray(0)
                if (bytes.size > MAX_BYTES) return Raw(413, "")
                Raw(response.code, bytes.toString(Charsets.UTF_8))
            }
        } catch (_: IOException) {
            Raw(0, "")
        }
    }

    private data class Raw(val status: Int, val text: String)

    private companion object {
        const val MAX_BYTES = 256 * 1024
        val JSON = "application/json; charset=utf-8".toMediaType()
    }
}
