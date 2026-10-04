package com.functiongram.app.data.feed

import com.functiongram.app.data.remote.ApiRoutes
import java.io.IOException
import java.util.concurrent.TimeUnit
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response

/**
 * Read-only feed client for the existing FunctionGram HTTPS API.
 * There is no create, like, comment, or story reply call in this type.
 */
interface FeedRepository {
    fun loadHome(): FeedCall<HomeFeed>
    fun loadOffset(offset: Int): FeedCall<List<FeedPost>>
    fun loadFollowing(offset: Int): FeedCall<FollowingPage>
    fun loadPost(id: String): FeedCall<FeedPost?>
    fun loadComments(postId: String, cursor: String?): FeedCall<CommentPage>
    fun loadReels(offset: Int): FeedCall<List<FeedPost>>
    fun loadImage(path: String): FeedCall<ByteArray>
    fun videoUrl(path: String): String?
    fun noteHome(posts: List<FeedPost>)
    fun notedHome(): List<FeedPost>
    fun http(): OkHttpClient
}

class OkHttpFeedRepository(
    private val origin: String,
    client: OkHttpClient,
    private val images: FeedMediaCache = FeedMediaCache(),
) : FeedRepository {
    private val http = client.newBuilder()
        .callTimeout(60, TimeUnit.SECONDS)
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .followRedirects(true)
        .followSslRedirects(true)
        .build()

    @Volatile
    private var homePosts: List<FeedPost> = emptyList()

    override fun loadHome(): FeedCall<HomeFeed> {
        val raw = get(ApiRoutes.homeFeed(origin))
        return FeedCodec.home(raw.status, raw.text)
    }

    override fun loadOffset(offset: Int): FeedCall<List<FeedPost>> {
        val raw = get(ApiRoutes.feedOffset(origin, offset))
        return FeedCodec.postList(raw.status, raw.text)
    }

    override fun loadFollowing(offset: Int): FeedCall<FollowingPage> {
        val raw = get(ApiRoutes.followingFeed(origin, offset))
        return FeedCodec.following(raw.status, raw.text)
    }

    override fun loadPost(id: String): FeedCall<FeedPost?> {
        val raw = try {
            get(ApiRoutes.singlePost(origin, id))
        } catch (error: IllegalArgumentException) {
            return FeedCall.Err(localRefusal(error))
        }
        return FeedCodec.onePost(raw.status, raw.text)
    }

    override fun loadComments(postId: String, cursor: String?): FeedCall<CommentPage> {
        val raw = try {
            get(ApiRoutes.postComments(origin, postId, cursor = cursor))
        } catch (error: IllegalArgumentException) {
            return FeedCall.Err(localRefusal(error))
        }
        return FeedCodec.comments(raw.status, raw.text)
    }

    override fun loadReels(offset: Int): FeedCall<List<FeedPost>> {
        val raw = get(ApiRoutes.reelsFeed(origin, offset))
        return FeedCodec.postList(raw.status, raw.text)
    }

    override fun loadImage(path: String): FeedCall<ByteArray> {
        val key = PostMediaRef.keyFromPath(path)
            ?: return FeedCall.Err(FeedCodec.failure(404, """{"error":"Media not found."}"""))
        images.get(key)?.let { return FeedCall.Ok(it) }
        val url = try {
            ApiRoutes.publicMedia(origin, key)
        } catch (error: IllegalArgumentException) {
            return FeedCall.Err(localRefusal(error, 404))
        }
        val request = Request.Builder()
            .url(url)
            .header("User-Agent", USER_AGENT)
            .header("Accept", "image/*,*/*")
            .get()
            .build()
        return try {
            http.newCall(request).execute().use { response -> readImage(response, key) }
        } catch (_: IOException) {
            FeedCall.Err(FeedCodec.failure(0, ""))
        }
    }

    override fun videoUrl(path: String): String? {
        val key = PostMediaRef.keyFromPath(path) ?: return null
        return try {
            ApiRoutes.publicMedia(origin, key)
        } catch (_: IllegalArgumentException) {
            null
        }
    }

    override fun noteHome(posts: List<FeedPost>) {
        homePosts = posts
    }

    override fun notedHome(): List<FeedPost> = homePosts

    override fun http(): OkHttpClient = http

    private fun readImage(response: Response, key: String): FeedCall<ByteArray> {
        val body = response.body ?: return FeedCall.Err(FeedCodec.failure(response.code, ""))
        if (response.code !in 200..299) {
            val text = readLimited(body.byteStream(), MAX_JSON_BYTES).toString(Charsets.UTF_8)
            return FeedCall.Err(FeedCodec.failure(response.code, text))
        }
        val type = body.contentType()?.toString().orEmpty().lowercase()
        if (type.startsWith("video/") || type.startsWith("text/") || "json" in type) {
            return FeedCall.Err(FeedCodec.failure(415, """{"error":"${FeedCopy.NOT_IMAGE}"}"""))
        }
        val declared = body.contentLength()
        if (declared > MAX_IMAGE_BYTES) {
            return FeedCall.Err(FeedCodec.failure(413, """{"error":"${FeedCopy.TOO_LARGE}"}"""))
        }
        val bytes = try {
            readLimited(body.byteStream(), MAX_IMAGE_BYTES)
        } catch (_: TooLarge) {
            return FeedCall.Err(FeedCodec.failure(413, """{"error":"${FeedCopy.TOO_LARGE}"}"""))
        }
        if (!looksLikeImage(bytes)) {
            val asText = bytes.take(64).toByteArray().toString(Charsets.UTF_8).trim()
            if (asText.startsWith("{")) {
                return FeedCall.Err(FeedCodec.failure(response.code, asText))
            }
            return FeedCall.Err(FeedCodec.failure(415, """{"error":"${FeedCopy.NOT_IMAGE}"}"""))
        }
        images.put(key, bytes)
        return FeedCall.Ok(bytes)
    }

    private fun get(url: String): RawHttp = try {
        val request = Request.Builder().url(url).header("User-Agent", USER_AGENT).get().build()
        http.newCall(request).execute().use { response ->
            val body = response.body
            val text = if (body == null) "" else readLimited(body.byteStream(), MAX_JSON_BYTES).toString(Charsets.UTF_8)
            RawHttp(response.code, text)
        }
    } catch (_: TooLarge) {
        RawHttp(413, """{"error":"${FeedCopy.GENERIC}"}""")
    } catch (_: IOException) {
        RawHttp(0, "")
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
                if (total > max) throw TooLarge()
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

    private fun localRefusal(error: IllegalArgumentException, status: Int = 422): FeedFailure {
        val message = error.message?.trim().orEmpty().ifBlank { "Please check your input." }
        return FeedCodec.failure(status, """{"error":${jsonString(message)}}""")
    }

    private fun jsonString(value: String): String = buildString {
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

    private class TooLarge : RuntimeException()

    private companion object {
        const val USER_AGENT = "FunctionGram-Android"
        const val MAX_JSON_BYTES = 4 * 1024 * 1024
        const val MAX_IMAGE_BYTES = 20 * 1024 * 1024
    }
}
