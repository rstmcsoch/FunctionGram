package com.functiongram.app.data.feed

import com.functiongram.app.data.policy.ServerFeatures

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.longOrNull

/**
 * Maps FunctionGram JSON into feed models.
 * A refusal keeps the server's `error` string.
 */
object FeedCodec {
    private val json = Json { ignoreUnknownKeys = true }

    fun home(status: Int, body: String): FeedCall<HomeFeed> {
        if (status !in 200..299) return FeedCall.Err(failure(status, body))
        val root = parseObject(body) ?: return unreadable(status)
        val postsElement = root["posts"] ?: return unreadable(status)
        val posts = posts(postsElement) ?: return unreadable(status)
        val me = root["me"]
        val viewer = if (me is JsonObject) text(me, "id").ifBlank { null } else null
        return FeedCall.Ok(
            HomeFeed(
                flags = flags(root["features"]),
                storySettings = storySettings(root["stories"]),
                viewerId = viewer,
                posts = posts,
                hasMore = flag(root["hasMore"]),
            ),
        )
    }

    fun postList(status: Int, body: String): FeedCall<List<FeedPost>> {
        if (status !in 200..299) return FeedCall.Err(failure(status, body))
        val element = parse(body) ?: return unreadable(status)
        val posts = posts(element) ?: return unreadable(status)
        return FeedCall.Ok(posts)
    }

    /** Posts nested inside another JSON object, such as search. Absent means none. */
    fun nestedPosts(element: JsonElement?): FeedCall<List<FeedPost>> {
        if (element == null || element is JsonNull) return FeedCall.Ok(emptyList())
        val parsed = posts(element) ?: return unreadable(200)
        return FeedCall.Ok(parsed)
    }

    fun following(status: Int, body: String): FeedCall<FollowingPage> {
        if (status !in 200..299) return FeedCall.Err(failure(status, body))
        val root = parseObject(body) ?: return unreadable(status)
        val posts = posts(root["posts"] ?: return unreadable(status)) ?: return unreadable(status)
        return FeedCall.Ok(FollowingPage(posts = posts, hasMore = flag(root["hasMore"])))
    }

    fun onePost(status: Int, body: String): FeedCall<FeedPost?> {
        val list = when (val parsed = postList(status, body)) {
            is FeedCall.Err -> return parsed
            is FeedCall.Ok -> parsed.value
        }
        return FeedCall.Ok(list.firstOrNull())
    }

    fun comments(status: Int, body: String): FeedCall<CommentPage> {
        if (status !in 200..299) return FeedCall.Err(failure(status, body))
        val root = parseObject(body) ?: return unreadable(status)
        val itemsElement = root["items"] as? JsonArray ?: return unreadable(status)
        val items = mutableListOf<FeedComment>()
        for (element in itemsElement) {
            val item = element as? JsonObject ?: return unreadable(status)
            val comment = comment(item) ?: return unreadable(status)
            items += comment
        }
        val cursor = text(root, "next_cursor").ifBlank { null }
        return FeedCall.Ok(CommentPage(items = items, nextCursor = cursor))
    }

    fun failure(status: Int, body: String): FeedFailure {
        val server = errorMessage(body)
        val kind = when (status) {
            0 -> FeedFailureKind.TRANSPORT
            401 -> FeedFailureKind.SIGN_IN
            403, 404, 409, 410, 415, 422 -> FeedFailureKind.REFUSED
            413, 429 -> FeedFailureKind.LIMITED
            500, 502, 503, 504 -> FeedFailureKind.UNAVAILABLE
            else -> FeedFailureKind.UNEXPECTED
        }
        return FeedFailure(
            httpStatus = status,
            message = server ?: fallback(kind),
            kind = kind,
        )
    }

    fun errorMessage(body: String): String? {
        val trimmed = body.trim()
        if (!trimmed.startsWith("{")) return null
        val parsed = parseObject(trimmed) ?: return null
        return text(parsed, "error").ifBlank { null }
    }

    private fun posts(element: JsonElement): List<FeedPost>? {
        val array = element as? JsonArray ?: return null
        val posts = mutableListOf<FeedPost>()
        for (item in array) {
            val objectItem = item as? JsonObject ?: return null
            val post = post(objectItem) ?: continue
            posts += post
        }
        if (array.isNotEmpty() && posts.isEmpty()) return null
        return posts
    }

    private fun post(objectItem: JsonObject): FeedPost? {
        val id = text(objectItem, "id")
        val authorId = text(objectItem, "author_id")
        if (id.isBlank() || authorId.isBlank()) return null
        val authorObject = objectItem["author"] as? JsonObject
        val author = FeedAuthor(
            id = authorObject?.let { text(it, "id") }.orEmpty().ifBlank { authorId },
            username = firstText(authorObject, objectItem, "username"),
            name = firstText(authorObject, objectItem, "name"),
            avatarPath = firstText(authorObject, objectItem, "avatar"),
        )
        val mediaPaths = stringList(objectItem["media"])
        val aspects = numberList(objectItem["aspects"])
        val options = objectItem["media_options"] as? JsonArray
        val media = mediaPaths.mapIndexed { index, path ->
            val option = options?.getOrNull(index) as? JsonObject
            FeedMedia(
                path = path,
                key = PostMediaRef.keyFromPath(path),
                aspect = aspects.getOrNull(index),
                alt = option?.let { text(it, "alt") }.orEmpty(),
            )
        }
        return FeedPost(
            id = id,
            authorId = authorId,
            author = author,
            media = media,
            mediaType = text(objectItem, "media_type").ifBlank { "image" },
            kind = text(objectItem, "kind").ifBlank { "post" },
            caption = text(objectItem, "caption"),
            location = text(objectItem, "location"),
            category = text(objectItem, "category"),
            createdAt = long(objectItem["created_at"]) ?: 0L,
            expiresAt = long(objectItem["expires_at"]),
            likes = (long(objectItem["likes"]) ?: 0L).toInt().coerceAtLeast(0),
            liked = flag(objectItem["liked"]),
            saved = flag(objectItem["saved"]),
            seen = flag(objectItem["seen"]),
            commentCount = (long(objectItem["comment_count"]) ?: 0L).toInt().coerceAtLeast(0),
            commentPreview = preview(objectItem["comment_preview"]),
            displayLikes = nullableCount(objectItem["display_likes"]),
            displayComments = nullableCount(objectItem["display_comments"]),
            displayViews = nullableCount(objectItem["display_views"]),
            reelCredit = text(objectItem, "reel_credit"),
            highlighted = flag(objectItem["highlighted"]),
        )
    }

    private fun comment(objectItem: JsonObject): FeedComment? {
        val id = text(objectItem, "id")
        if (id.isBlank()) return null
        return FeedComment(
            id = id,
            postId = text(objectItem, "post_id"),
            authorId = text(objectItem, "author_id"),
            username = text(objectItem, "username"),
            body = text(objectItem, "body"),
            createdAt = long(objectItem["created_at"]) ?: 0L,
            avatarPath = text(objectItem, "avatar"),
        )
    }

    private fun preview(element: JsonElement?): CommentPreview? {
        val objectItem = when (element) {
            null, is JsonNull -> return null
            is JsonObject -> element
            is JsonPrimitive -> {
                val raw = element.contentOrNull ?: return null
                parseObject(raw)
            }
            else -> null
        } ?: return null
        val body = text(objectItem, "body")
        val username = text(objectItem, "username")
        if (body.isBlank() && username.isBlank()) return null
        return CommentPreview(body = body, username = username)
    }

    private fun flags(element: JsonElement?): FeedFlags = ServerFeatures.parse(element)

    private fun storySettings(element: JsonElement?): StorySettings {
        val objectItem = element as? JsonObject ?: return StorySettings()
        return StorySettings(
            enabled = flag(objectItem["enabled"]),
            hours = boundedInt(objectItem["hours"], 1, 168, 24),
            photoSeconds = boundedInt(objectItem["photoSeconds"], 1, 120, 5),
            videoMaxSeconds = boundedInt(objectItem["videoMaxSeconds"], 1, 120, 15),
            tray = flag(objectItem["tray"]),
            ring = flag(objectItem["ring"]),
        )
    }

    private fun stringList(element: JsonElement?): List<String> {
        val array = when (element) {
            is JsonArray -> element
            is JsonPrimitive -> parse(element.contentOrNull.orEmpty()) as? JsonArray
            else -> null
        } ?: return emptyList()
        return array.mapNotNull { item ->
            (item as? JsonPrimitive)?.contentOrNull?.takeIf { it.isNotBlank() }
        }
    }

    private fun numberList(element: JsonElement?): List<Double> {
        val array = element as? JsonArray ?: return emptyList()
        return array.map { item -> (item as? JsonPrimitive)?.doubleOrNull ?: Double.NaN }
    }

    private fun firstText(primary: JsonObject?, fallback: JsonObject, name: String): String {
        val fromPrimary = primary?.let { text(it, name) }.orEmpty()
        if (fromPrimary.isNotBlank()) return fromPrimary
        return text(fallback, name)
    }

    private fun text(objectItem: JsonObject, name: String): String {
        val primitive = objectItem[name] as? JsonPrimitive ?: return ""
        return primitive.contentOrNull?.trim().orEmpty()
    }

    private fun flag(element: JsonElement?): Boolean {
        val primitive = element as? JsonPrimitive ?: return false
        primitive.booleanOrNull?.let { return it }
        primitive.longOrNull?.let { return it != 0L }
        return primitive.contentOrNull.equals("true", ignoreCase = true) || primitive.contentOrNull == "1"
    }

    private fun long(element: JsonElement?): Long? {
        if (element == null || element is JsonNull) return null
        val primitive = element as? JsonPrimitive ?: return null
        primitive.longOrNull?.let { return it }
        primitive.doubleOrNull?.let { return it.toLong() }
        return primitive.contentOrNull?.toLongOrNull()
    }

    private fun nullableCount(element: JsonElement?): Int? {
        val value = long(element) ?: return null
        return value.toInt().coerceAtLeast(0)
    }

    private fun boundedInt(element: JsonElement?, min: Int, max: Int, fallback: Int): Int {
        val value = long(element)?.toInt() ?: return fallback
        if (value !in min..max) return fallback
        return value
    }

    private fun fallback(kind: FeedFailureKind): String = when (kind) {
        FeedFailureKind.TRANSPORT -> FeedCopy.TRANSPORT
        else -> FeedCopy.GENERIC
    }

    private fun unreadable(status: Int): FeedCall.Err = FeedCall.Err(
        FeedFailure(httpStatus = status, message = FeedCopy.UNREADABLE, kind = FeedFailureKind.UNEXPECTED),
    )

    private fun parse(body: String): JsonElement? = try {
        json.parseToJsonElement(body)
    } catch (_: IllegalArgumentException) {
        null
    }

    private fun parseObject(body: String): JsonObject? = parse(body) as? JsonObject
}
