package com.functiongram.app.data.messaging

import com.functiongram.app.data.remote.ApiRoutes
import java.io.IOException
import java.util.UUID
import java.util.concurrent.TimeUnit
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response

/**
 * Messaging client for the existing FunctionGram HTTPS API.
 * Session cookies come from the shared jar. No database driver is created here.
 */
interface MessagingRepository {
    fun listConversations(): MessagingCall<ConversationPage>
    fun loadThread(peerId: String, cursor: String?): MessagingCall<ThreadPage>
    fun sendText(peerId: String, body: String): MessagingCall<ChatMessage>
    fun sendPhoto(peerId: String, caption: String, photo: PhotoPayload): MessagingCall<ChatMessage>
    fun markRead(peerId: String): MessagingCall<Unit>
    fun loadPhoto(messageId: String): MessagingCall<ByteArray>
}

class OkHttpMessagingRepository(
    private val origin: String,
    client: OkHttpClient,
) : MessagingRepository {
    private val http = client.newBuilder()
        .callTimeout(60, TimeUnit.SECONDS)
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .writeTimeout(60, TimeUnit.SECONDS)
        .build()

    override fun listConversations(): MessagingCall<ConversationPage> {
        val raw = get(ApiRoutes.conversations(origin))
        return MessagingCodec.conversationList(raw.status, raw.text)
    }

    override fun loadThread(peerId: String, cursor: String?): MessagingCall<ThreadPage> {
        val raw = try {
            get(ApiRoutes.thread(origin, peerId, cursor = cursor))
        } catch (error: IllegalArgumentException) {
            return MessagingCall.Err(localRefusal(error))
        }
        return MessagingCodec.thread(raw.status, raw.text)
    }

    override fun sendText(peerId: String, body: String): MessagingCall<ChatMessage> {
        val payload = try {
            MessagingRequests.textMessage(peerId, body)
        } catch (error: IllegalArgumentException) {
            return MessagingCall.Err(localRefusal(error))
        }
        val raw = postJson(ApiRoutes.social(origin), payload)
        return MessagingCodec.sentMessage(raw.status, raw.text)
    }

    override fun sendPhoto(peerId: String, caption: String, photo: PhotoPayload): MessagingCall<ChatMessage> {
        if (photo.bytes.isEmpty()) {
            return MessagingCall.Err(MessagingCodec.failure(422, """{"error":"${MessagingCopy.CHOOSE_FILE}"}"""))
        }
        if (photo.bytes.size > MessagingRequests.ABSOLUTE_UPLOAD_BYTES) {
            return MessagingCall.Err(MessagingCodec.failure(413, """{"error":"${MessagingCopy.TOO_LARGE}"}"""))
        }
        val key = UUID.randomUUID().toString()
        if (!MessagingRequests.isUploadKey(key)) {
            return MessagingCall.Err(MessagingCodec.failure(0, ""))
        }
        val uploaded = postPhoto(key, photo)
        val asset = when (val parsed = MessagingCodec.attachment(uploaded.status, uploaded.text)) {
            is MessagingCall.Err -> return parsed
            is MessagingCall.Ok -> parsed.value
        }
        val payload = try {
            MessagingRequests.imageMessage(peerId, asset.key, caption)
        } catch (error: IllegalArgumentException) {
            return MessagingCall.Err(localRefusal(error))
        }
        val sent = postJson(ApiRoutes.social(origin), payload)
        return MessagingCodec.sentMessage(sent.status, sent.text)
    }

    override fun markRead(peerId: String): MessagingCall<Unit> {
        val payload = try {
            MessagingRequests.readMessages(peerId)
        } catch (error: IllegalArgumentException) {
            return MessagingCall.Err(localRefusal(error))
        }
        val raw = postJson(ApiRoutes.social(origin), payload)
        return MessagingCodec.acknowledged(raw.status, raw.text)
    }

    override fun loadPhoto(messageId: String): MessagingCall<ByteArray> {
        val url = try {
            ApiRoutes.messageMedia(origin, messageId)
        } catch (error: IllegalArgumentException) {
            return MessagingCall.Err(localRefusal(error, status = 404))
        }
        val request = Request.Builder()
            .url(url)
            .header("User-Agent", USER_AGENT)
            .get()
            .build()
        return try {
            http.newCall(request).execute().use { response -> readPhoto(response) }
        } catch (_: IOException) {
            MessagingCall.Err(MessagingCodec.failure(0, ""))
        }
    }

    private fun readPhoto(response: Response): MessagingCall<ByteArray> {
        val body = response.body ?: return MessagingCall.Err(MessagingCodec.failure(response.code, ""))
        val contentType = body.contentType()?.toString().orEmpty()
        val declared = body.contentLength()
        if (declared > MessagingRequests.ABSOLUTE_UPLOAD_BYTES) {
            return MessagingCall.Err(MessagingCodec.failure(413, """{"error":"${MessagingCopy.TOO_LARGE}"}"""))
        }
        val bytes = try {
            readLimited(body.byteStream(), MessagingRequests.ABSOLUTE_UPLOAD_BYTES)
        } catch (_: IOException) {
            return MessagingCall.Err(MessagingCodec.failure(0, ""))
        } catch (_: PhotoTooLarge) {
            return MessagingCall.Err(MessagingCodec.failure(413, """{"error":"${MessagingCopy.TOO_LARGE}"}"""))
        }
        if (response.isSuccessful && (contentType.startsWith("image/") || looksLikeImage(bytes))) {
            return MessagingCall.Ok(bytes)
        }
        val text = bytes.toString(Charsets.UTF_8)
        if (!response.isSuccessful) return MessagingCall.Err(MessagingCodec.failure(response.code, text))
        return MessagingCall.Err(MessagingCodec.failure(response.code, text.ifBlank { """{"error":"Media not found."}""" }))
    }

    private fun get(url: String): RawHttp {
        val request = Request.Builder().url(url).header("User-Agent", USER_AGENT).get().build()
        return execute(request)
    }

    private fun postJson(url: String, payload: String): RawHttp {
        val request = Request.Builder()
            .url(url)
            .header("User-Agent", USER_AGENT)
            .post(payload.toRequestBody(JSON))
            .build()
        return execute(request)
    }

    private fun postPhoto(key: String, photo: PhotoPayload): RawHttp {
        val mime = if (photo.mime.startsWith("image/")) photo.mime else "image/jpeg"
        val filename = safeFilename(photo.filename)
        val form = MultipartBody.Builder()
            .setType(MultipartBody.FORM)
            .addFormDataPart("key", key)
            .addFormDataPart("category", "image")
            .addFormDataPart("file", filename, photo.bytes.toRequestBody(mime.toMediaType()))
            .build()
        val request = Request.Builder()
            .url(ApiRoutes.messageAttachment(origin))
            .header("User-Agent", USER_AGENT)
            .post(form)
            .build()
        return execute(request)
    }

    private fun execute(request: Request): RawHttp {
        return try {
            http.newCall(request).execute().use { response ->
                val text = try {
                    val body = response.body
                    if (body == null) {
                        ""
                    } else {
                        readLimited(body.byteStream(), MAX_JSON_BYTES).toString(Charsets.UTF_8)
                    }
                } catch (_: PhotoTooLarge) {
                    return RawHttp(response.code, "")
                }
                RawHttp(response.code, text)
            }
        } catch (_: IOException) {
            RawHttp(0, "")
        }
    }

    private fun readLimited(stream: java.io.InputStream, max: Int): ByteArray {
        val out = java.io.ByteArrayOutputStream()
        val buffer = ByteArray(8192)
        var total = 0
        stream.use { input ->
            while (true) {
                val read = input.read(buffer)
                if (read < 0) break
                total += read
                if (total > max) throw PhotoTooLarge()
                out.write(buffer, 0, read)
            }
        }
        return out.toByteArray()
    }

    private fun looksLikeImage(bytes: ByteArray): Boolean {
        if (bytes.size >= 3 && bytes[0] == 0xFF.toByte() && bytes[1] == 0xD8.toByte() && bytes[2] == 0xFF.toByte()) {
            return true
        }
        if (bytes.size >= 8 && bytes[0] == 0x89.toByte() && bytes[1] == 0x50.toByte()) return true
        val head = bytes.take(16).toByteArray().toString(Charsets.ISO_8859_1)
        return head.startsWith("GIF8") || head.startsWith("RIFF")
    }

    private fun safeFilename(name: String): String {
        val cleaned = name.trim().filter { char ->
            char != '/' && char != '\\' && char != '"' && !char.isISOControl()
        }.take(120)
        return cleaned.ifBlank { "photo.jpg" }
    }


    private fun localRefusal(error: IllegalArgumentException, status: Int = 422): MessagingFailure {
        val message = error.message?.trim().orEmpty().ifBlank { "Please check your input." }
        return MessagingCodec.failure(status, """{"error":${jsonString(message)}}""")
    }

    private fun jsonString(value: String): String =
        buildString {
            append('"')
            value.forEach { char ->
                when (char) {
                    '\\' -> append("\\\\")
                    '"' -> append("\\\"")
                    '\n' -> append("\\n")
                    '\r' -> append("\\r")
                    else -> append(char)
                }
            }
            append('"')
        }

    private data class RawHttp(val status: Int, val text: String)

    private class PhotoTooLarge : RuntimeException()

    private companion object {
        const val USER_AGENT = "FunctionGram-Android"
        const val MAX_JSON_BYTES = 1_048_576
        val JSON = "application/json; charset=utf-8".toMediaType()
    }
}
