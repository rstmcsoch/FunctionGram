package com.functiongram.app.data.policy

import com.functiongram.app.data.messaging.MessagingRequests
import com.functiongram.app.data.remote.ApiRoutes

/**
 * Client-side gates for the same feature document the admin Features screen
 * publishes. Hiding a control is convenience only; the HTTPS API still enforces
 * `requireFeature`. No second settings store is created here.
 *
 * Destination keys mirror `VIEW_FEATURES` in `lib/features.ts`.
 */
object FeaturePolicy {
    const val FEATURE_OFF = "This feature is currently unavailable."

    /** Create is an action id in the shell, not a destination. */
    const val CREATE_ID = "create"

    /**
     * Map shell / create ids to admin feature keys. Home and profile have none.
     * Ids match `ShellDestination` / `ShellCatalog`.
     */
    fun featureForNavId(id: String): String? = when (id) {
        "reels" -> "reels"
        "search" -> "search"
        "explore" -> "explore"
        "messages" -> "messages"
        "notifications" -> "notifications"
        "saved" -> "saves"
        CREATE_ID -> "uploads"
        else -> null
    }

    fun allowsNavId(id: String, features: ServerFeatures): Boolean {
        val key = featureForNavId(id) ?: return true
        return features.isEnabled(key)
    }

    fun visibleIds(ids: List<String>, features: ServerFeatures): List<String> =
        ids.filter { allowsNavId(it, features) }

    /** null when the flag is on; server copy when the client must not call. */
    fun blockIfOff(enabled: Boolean): String? = if (enabled) null else FEATURE_OFF

    fun conversationsUrl(origin: String, features: ServerFeatures): String? {
        if (!features.messages) return null
        return ApiRoutes.conversations(origin)
    }

    fun threadUrl(origin: String, peerId: String, cursor: String?, features: ServerFeatures): String? {
        if (!features.messages) return null
        return ApiRoutes.thread(origin, peerId, cursor = cursor)
    }

    fun searchUrl(origin: String, term: String, features: ServerFeatures): String? {
        if (!features.search) return null
        return ApiRoutes.search(origin, term)
    }

    fun notificationsUrl(origin: String, features: ServerFeatures): String? {
        if (!features.notifications) return null
        return ApiRoutes.notifications(origin)
    }

    fun followingUrl(origin: String, offset: Int, features: ServerFeatures): String? {
        if (!features.follow) return null
        return ApiRoutes.followingFeed(origin, offset)
    }

    fun commentsUrl(
        origin: String,
        postId: String,
        limit: Int,
        cursor: String?,
        features: ServerFeatures,
    ): String? {
        if (!features.comments) return null
        return ApiRoutes.postComments(origin, postId, limit, cursor)
    }

    fun reelsUrl(origin: String, offset: Int, features: ServerFeatures): String? {
        if (!features.reels) return null
        return ApiRoutes.reelsFeed(origin, offset)
    }

    fun textMessageBody(peerId: String, body: String, features: ServerFeatures): String? {
        if (!features.messages) return null
        return MessagingRequests.textMessage(peerId, body)
    }

    fun imageMessageBody(
        peerId: String,
        mediaKey: String,
        caption: String,
        features: ServerFeatures,
    ): String? {
        if (!features.messages || !features.uploads) return null
        return MessagingRequests.imageMessage(peerId, mediaKey, caption)
    }

    fun canSendPhoto(features: ServerFeatures): Boolean = features.messages && features.uploads

    fun canOpenMessages(features: ServerFeatures): Boolean = features.messages
}
