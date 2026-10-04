package com.functiongram.app.data.remote

/**
 * Existing FunctionGram HTTP routes. Reads and writes stay on the Next.js API.
 * There is no Turso, admin, or second account system in this client.
 */
object ApiRoutes {
    const val HEALTH = "/api/health"
    const val AUTH = "/api/auth"
    const val SOCIAL = "/api/social"
    const val UPLOAD = "/api/upload"
    const val UPLOAD_COMPLETE = "/api/upload/complete"
    const val MEDIA = "/api/media"
    const val MESSAGE_ATTACHMENT = "/api/message-attachment"
    const val MESSAGE_MEDIA = "/api/message-media"
    const val SIGN_IN_EMAIL = "sign-in/email"
    const val GET_SESSION = "get-session"
    const val SIGN_OUT = "sign-out"
    const val VERIFY_TOTP = "two-factor/verify-totp"

    fun health(origin: String): String = join(origin, HEALTH)

    fun social(origin: String): String = join(origin, SOCIAL)

    fun auth(origin: String, path: String): String = join(origin, "$AUTH/${path.trimStart('/')}")

    fun media(origin: String, key: String): String = join(origin, "$MEDIA/${key.trimStart('/')}")

    fun messageAttachment(origin: String): String = join(origin, MESSAGE_ATTACHMENT)

    /**
     * Participant media. The id is a message id, never a storage key and never
     * an absolute URL. Callers must not pass a value taken from an arbitrary host.
     */
    fun messageMedia(origin: String, messageId: String): String {
        require(messageId.isNotBlank() && messageId.length <= 100) { "Invalid message id." }
        require(!messageId.contains('/') && !messageId.contains('\\') && !messageId.contains("..")) {
            "Invalid message id."
        }
        require('?' !in messageId && '#' !in messageId && ':' !in messageId) { "Invalid message id." }
        return join(origin, "$MESSAGE_MEDIA/$messageId")
    }

    /** `GET /api/social?conversations=<filter>&limit=`. Filter names are the server's. */
    fun conversations(origin: String, filter: String = "all", limit: Int = 100): String {
        val safe = if (filter in CONVERSATION_FILTERS) filter else "all"
        val bounded = limit.coerceIn(1, 200)
        return social(origin) + "?conversations=" + encode(safe) + "&limit=" + bounded
    }

    /**
     * Public post media. The key must be the 36-character id the API stores.
     * Callers must not pass an absolute URL or a message-media id.
     */
    fun publicMedia(origin: String, key: String): String {
        require(key.length == 36 && MEDIA_KEY.matches(key)) { "Invalid media key." }
        require('/' !in key && '\\' !in key && ':' !in key) { "Invalid media key." }
        return media(origin, key)
    }

    /** `GET /api/social` bootstrap: features, story settings, and the first posts. */
    fun homeFeed(origin: String): String = social(origin)

    /** `GET /api/social?offset=` discovery page. The server clamps the offset. */
    fun feedOffset(origin: String, offset: Int): String =
        social(origin) + "?offset=" + offset.coerceIn(0, MAX_OFFSET)

    /** `GET /api/social?following=1&offset=` signed-in following page. */
    fun followingFeed(origin: String, offset: Int): String =
        social(origin) + "?following=1&offset=" + offset.coerceIn(0, MAX_OFFSET)

    /** `GET /api/social?post=<id>` returns a one-item array, or an empty array. */
    fun singlePost(origin: String, id: String): String {
        require(validResourceId(id)) { "Invalid post." }
        return social(origin) + "?post=" + encode(id)
    }

    /** `GET /api/social?comments=<id>&limit=` plus an optional cursor. */
    fun postComments(origin: String, postId: String, limit: Int = 30, cursor: String? = null): String {
        require(validResourceId(postId)) { "Invalid post." }
        val bounded = limit.coerceIn(1, 100)
        val base = social(origin) + "?comments=" + encode(postId) + "&limit=" + bounded
        if (cursor.isNullOrBlank()) return base
        return base + "&cursor=" + encode(cursor)
    }

    /** `GET /api/social?reels=1&offset=` video page. */
    fun reelsFeed(origin: String, offset: Int): String =
        social(origin) + "?reels=1&offset=" + offset.coerceIn(0, MAX_OFFSET)

    /** `GET /api/social?messages=<peer>&limit=` plus an optional cursor. */
    fun thread(origin: String, peerId: String, limit: Int = 50, cursor: String? = null): String {
        require(peerId.isNotBlank() && peerId.length <= 100) { "Invalid conversation." }
        val bounded = limit.coerceIn(1, 100)
        val base = social(origin) + "?messages=" + encode(peerId) + "&limit=" + bounded
        if (cursor.isNullOrBlank()) return base
        return base + "&cursor=" + encode(cursor)
    }

    /** `GET /api/social?person=` accepts an account id or a username. */
    fun person(origin: String, idOrUsername: String): String {
        require(validResourceId(idOrUsername)) { "Please complete the required fields." }
        return social(origin) + "?person=" + encode(idOrUsername)
    }

    /**
     * Posts for one account. The query value is the account id, after the
     * username route has been resolved. This is not a `/profile` path.
     */
    fun profilePosts(origin: String, authorId: String): String {
        require(validResourceId(authorId)) { "Invalid profile." }
        return social(origin) + "?profile=" + encode(authorId)
    }

    /** `GET /api/social?search=`. The server rejects a term longer than 80. */
    fun search(origin: String, term: String): String {
        val trimmed = term.trim()
        require(trimmed.isNotEmpty() && trimmed.length <= 80) { "Please check the length of your text." }
        return social(origin) + "?search=" + encode(trimmed)
    }

    /** People directory. Not a search, and not gated by the search flag. */
    fun people(origin: String, limit: Int = 40, offset: Int = 0): String {
        val bounded = limit.coerceIn(1, 60)
        val boundedOffset = offset.coerceIn(0, 100_000)
        return social(origin) + "?people=1&limit=" + bounded + "&offset=" + boundedOffset
    }

    fun notifications(origin: String): String = social(origin) + "?notifications=1"

    fun relations(origin: String, id: String, kind: String): String {
        require(validResourceId(id)) { "Invalid profile." }
        require(kind == "followers" || kind == "following") { "Invalid relationship." }
        return social(origin) + "?relations=" + encode(id) + "&kind=" + kind
    }

    fun savedPosts(origin: String): String = social(origin) + "?saved=1"

    fun collections(origin: String): String = social(origin) + "?collections=1"

    fun changeEmail(origin: String): String = auth(origin, "change-email")

    fun deleteUser(origin: String): String = auth(origin, "delete-user")

    private fun encode(value: String): String =
        java.net.URLEncoder.encode(value, Charsets.UTF_8.name()).replace("+", "%20")

    private fun validResourceId(id: String): Boolean {
        if (id.isBlank() || id.length > 100) return false
        return id.none { char ->
            char.isISOControl() || char == '/' || char == '\\' || char == '?' || char == '#' || char == ' '
        }
    }

    private val CONVERSATION_FILTERS = setOf("all", "unread", "archived", "favorites")
    private val MEDIA_KEY = Regex("^[a-f0-9-]{36}$")
    private const val MAX_OFFSET = 10_000

    private fun join(origin: String, path: String): String {
        val base = origin.trim().trimEnd('/')
        val suffix = if (path.startsWith("/")) path else "/$path"
        return base + suffix
    }
}
