package com.functiongram.app.data.directory

import com.functiongram.app.data.policy.ServerFeatures

import com.functiongram.app.data.feed.FeedCall
import com.functiongram.app.data.feed.FeedCodec
import com.functiongram.app.data.feed.FeedCopy
import com.functiongram.app.data.feed.FeedFailure
import com.functiongram.app.data.feed.FeedFailureKind
import com.functiongram.app.data.feed.FeedPost
import com.functiongram.app.data.feed.PostMediaRef
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.longOrNull

/**
 * Maps FunctionGram JSON for profiles, search, notifications, and settings.
 * Refusals keep the server's message. `error` and Better Auth's `message` are both read.
 */
object DirectoryCodec {
    private val json = Json { ignoreUnknownKeys = true }

    fun shell(status: Int, body: String): FeedCall<AccountShell> {
        if (status !in 200..299) return FeedCall.Err(failure(status, body))
        val root = parseObject(body) ?: return unreadable(status)
        val me = root["me"]
        val person = when (me) {
            null, is JsonNull -> null
            is JsonObject -> personObject(me) ?: return unreadable(status)
            else -> return unreadable(status)
        }
        return FeedCall.Ok(AccountShell(flags = flags(root["features"]), me = person))
    }

    fun person(status: Int, body: String): FeedCall<DirectoryPerson?> {
        if (status !in 200..299) return FeedCall.Err(failure(status, body))
        val trimmed = body.trim()
        if (trimmed == "null" || trimmed.isEmpty()) return FeedCall.Ok(null)
        val root = parseObject(trimmed) ?: return unreadable(status)
        val parsed = personObject(root) ?: return unreadable(status)
        return FeedCall.Ok(parsed)
    }

    fun people(status: Int, body: String): FeedCall<List<DirectoryPerson>> {
        if (status !in 200..299) return FeedCall.Err(failure(status, body))
        return peopleArray(parse(body), status)
    }

    fun search(status: Int, body: String): FeedCall<SearchPage> {
        if (status !in 200..299) return FeedCall.Err(failure(status, body))
        val root = parseObject(body) ?: return unreadable(status)
        val people = when (val parsed = peopleArray(root["people"], status)) {
            is FeedCall.Err -> return parsed
            is FeedCall.Ok -> parsed.value
        }
        val posts = when (val parsed = FeedCodec.nestedPosts(root["posts"])) {
            is FeedCall.Err -> return parsed
            is FeedCall.Ok -> parsed.value
        }
        return FeedCall.Ok(SearchPage(people = people, posts = posts))
    }

    fun posts(status: Int, body: String): FeedCall<List<FeedPost>> = FeedCodec.postList(status, body)

    fun notifications(status: Int, body: String): FeedCall<List<AppNotification>> {
        if (status !in 200..299) return FeedCall.Err(failure(status, body))
        val root = parseObject(body) ?: return unreadable(status)
        val array = root["results"] as? JsonArray ?: return unreadable(status)
        return notificationArray(array, status)
    }

    fun collections(status: Int, body: String): FeedCall<List<SavedCollection>> {
        if (status !in 200..299) return FeedCall.Err(failure(status, body))
        val array = parse(body) as? JsonArray ?: return unreadable(status)
        val items = mutableListOf<SavedCollection>()
        for (element in array) {
            val objectItem = element as? JsonObject ?: return unreadable(status)
            val id = text(objectItem, "id")
            val name = text(objectItem, "name")
            if (id.isBlank() || name.isBlank()) return unreadable(status)
            items += SavedCollection(
                id = id,
                name = name,
                createdAt = long(objectItem["created_at"]) ?: 0L,
                postIds = idList(objectItem["post_ids"]),
            )
        }
        return FeedCall.Ok(items)
    }

    fun acknowledged(status: Int, body: String): FeedCall<Unit> {
        if (status !in 200..299) return FeedCall.Err(failure(status, body))
        val root = parseObject(body)
        if (root != null && root["ok"] is JsonPrimitive && flag(root["ok"]) == false) {
            return FeedCall.Err(failure(status, body))
        }
        return FeedCall.Ok(Unit)
    }

    fun privacy(status: Int, body: String): FeedCall<PrivacyResult> {
        if (status !in 200..299) return FeedCall.Err(failure(status, body))
        val root = parseObject(body) ?: return unreadable(status)
        if (!flag(root["ok"])) return unreadable(status)
        if (root["private"] == null) return unreadable(status)
        return FeedCall.Ok(PrivacyResult(privateAccount = flag(root["private"])))
    }

    fun collectionWrite(status: Int, body: String): FeedCall<CollectionWrite> {
        if (status !in 200..299) return FeedCall.Err(failure(status, body))
        val root = parseObject(body) ?: return unreadable(status)
        val id = text(root, "id")
        if (id.isBlank()) return unreadable(status)
        return FeedCall.Ok(CollectionWrite(id = id, existing = flag(root["existing"])))
    }

    fun failure(status: Int, body: String): FeedFailure {
        val base = FeedCodec.failure(status, body)
        if (base.message != FeedCopy.GENERIC && base.message != FeedCopy.UNREADABLE) return base
        val message = serverMessage(body)
        if (message != null) return base.copy(message = message)
        return base
    }

    private fun peopleArray(element: JsonElement?, status: Int): FeedCall<List<DirectoryPerson>> {
        val array = element as? JsonArray ?: return unreadable(status)
        val people = mutableListOf<DirectoryPerson>()
        for (item in array) {
            val objectItem = item as? JsonObject ?: return unreadable(status)
            val person = personObject(objectItem) ?: continue
            people += person
        }
        if (array.isNotEmpty() && people.isEmpty()) return unreadable(status)
        return FeedCall.Ok(people)
    }

    private fun notificationArray(array: JsonArray, status: Int): FeedCall<List<AppNotification>> {
        val items = mutableListOf<AppNotification>()
        for (element in array) {
            val objectItem = element as? JsonObject ?: return unreadable(status)
            val id = text(objectItem, "id")
            val actorId = text(objectItem, "actor_id")
            val kind = text(objectItem, "kind")
            if (id.isBlank() || actorId.isBlank() || kind.isBlank()) continue
            val postId = text(objectItem, "post_id").ifBlank { null }
            items += AppNotification(
                id = id,
                actorId = actorId,
                kind = kind,
                postId = postId,
                createdAt = long(objectItem["created_at"]) ?: 0L,
                readAt = long(objectItem["read_at"]),
                username = text(objectItem, "username"),
                avatarPath = text(objectItem, "avatar"),
                mediaPath = firstMedia(objectItem["media"]),
                templateText = text(objectItem, "template_text"),
                messageText = text(objectItem, "message_text"),
                broadcastId = text(objectItem, "broadcast_id").ifBlank { null },
            )
        }
        if (array.isNotEmpty() && items.isEmpty()) return unreadable(status)
        return FeedCall.Ok(items)
    }

    private fun personObject(objectItem: JsonObject): DirectoryPerson? {
        val id = text(objectItem, "id")
        val username = text(objectItem, "username")
        if (id.isBlank() || username.isBlank()) return null
        return DirectoryPerson(
            id = id,
            username = username,
            name = text(objectItem, "name"),
            bio = text(objectItem, "bio"),
            website = text(objectItem, "website"),
            avatarPath = text(objectItem, "avatar"),
            demo = flag(objectItem["is_demo"]),
            privateAccount = flag(objectItem["is_private"]),
            verified = flag(objectItem["verified"]),
            followers = count(objectItem["followers"]),
            following = count(objectItem["following"]),
            postCount = count(objectItem["post_count"]),
            followed = flag(objectItem["followed"]),
            blocked = flag(objectItem["blocked"]),
        )
    }

    private fun flags(element: JsonElement?): DirectoryFlags = ServerFeatures.parse(element)

    private fun firstMedia(element: JsonElement?): String? {
        val raw = when (element) {
            is JsonArray -> element.firstOrNull()?.let { item ->
                (item as? JsonPrimitive)?.contentOrNull
            }
            is JsonPrimitive -> element.contentOrNull
            else -> null
        } ?: return null
        val trimmed = raw.trim()
        if (trimmed.startsWith("[")) {
            val array = parse(trimmed) as? JsonArray ?: return null
            val path = (array.firstOrNull() as? JsonPrimitive)?.contentOrNull ?: return null
            return PostMediaRef.keyFromPath(path)?.let { path.substringBefore('?').substringBefore('#') }
        }
        val key = PostMediaRef.keyFromPath(trimmed) ?: return null
        return "/api/media/$key"
    }

    private fun idList(element: JsonElement?): List<String> {
        val array = when (element) {
            is JsonArray -> element
            is JsonPrimitive -> parse(element.contentOrNull.orEmpty()) as? JsonArray
            else -> null
        } ?: return emptyList()
        return array.mapNotNull { item ->
            val value = (item as? JsonPrimitive)?.contentOrNull?.trim().orEmpty()
            value.ifBlank { null }
        }
    }

    private fun serverMessage(body: String): String? {
        val root = parseObject(body.trim()) ?: return null
        return text(root, "message").ifBlank { text(root, "error").ifBlank { null } }
    }

    private fun unreadable(status: Int): FeedCall<Nothing> = FeedCall.Err(
        FeedFailure(httpStatus = status, message = FeedCopy.UNREADABLE, kind = FeedFailureKind.UNEXPECTED),
    )

    private fun parse(body: String): JsonElement? = try {
        json.parseToJsonElement(body)
    } catch (_: IllegalArgumentException) {
        null
    }

    private fun parseObject(body: String): JsonObject? = parse(body) as? JsonObject

    private fun text(objectItem: JsonObject, name: String): String {
        val primitive = objectItem[name] as? JsonPrimitive ?: return ""
        if (primitive is JsonNull || primitive.contentOrNull == null) return ""
        return primitive.content
    }

    private fun flag(element: JsonElement?): Boolean {
        val primitive = element as? JsonPrimitive ?: return false
        primitive.booleanOrNull?.let { return it }
        primitive.longOrNull?.let { return it != 0L }
        return primitive.content == "true" || primitive.content == "1"
    }

    private fun long(element: JsonElement?): Long? {
        if (element == null || element is JsonNull) return null
        val primitive = element as? JsonPrimitive ?: return null
        return primitive.longOrNull
    }

    private fun count(element: JsonElement?): Int {
        val value = long(element) ?: 0L
        if (value <= 0L) return 0
        if (value > Int.MAX_VALUE) return Int.MAX_VALUE
        return value.toInt()
    }
}
