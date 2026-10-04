package com.functiongram.app.data.feed

/**
 * Feed, post, story, and reel models taken from the existing social API.
 * Nothing here is a sample account. Authors come from the response or not at all.
 */
data class FeedAuthor(
    val id: String,
    val username: String,
    val name: String,
    val avatarPath: String,
)

data class FeedMedia(
    val path: String,
    val key: String?,
    val aspect: Double?,
    val alt: String,
)

data class CommentPreview(
    val body: String,
    val username: String,
)

data class FeedPost(
    val id: String,
    val authorId: String,
    val author: FeedAuthor,
    val media: List<FeedMedia>,
    val mediaType: String,
    val kind: String,
    val caption: String,
    val location: String,
    val category: String,
    val createdAt: Long,
    val expiresAt: Long?,
    val likes: Int,
    val liked: Boolean,
    val saved: Boolean,
    val seen: Boolean,
    val commentCount: Int,
    val commentPreview: CommentPreview?,
    val displayLikes: Int?,
    val displayComments: Int?,
    val displayViews: Int?,
    val reelCredit: String,
    val highlighted: Boolean,
)

/**
 * Feed-facing alias for the admin feature document.
 * Prefer [com.functiongram.app.data.policy.ServerFeatures] for new call sites.
 */
typealias FeedFlags = com.functiongram.app.data.policy.ServerFeatures

/**
 * Public story settings from `bootstrap.stories`.
 * An absent object stays off. This client does not invent a tray.
 */
data class StorySettings(
    val enabled: Boolean = false,
    val hours: Int = 24,
    val photoSeconds: Int = 5,
    val videoMaxSeconds: Int = 15,
    val tray: Boolean = false,
    val ring: Boolean = false,
)

data class HomeFeed(
    val flags: FeedFlags,
    val storySettings: StorySettings,
    val viewerId: String?,
    val posts: List<FeedPost>,
    val hasMore: Boolean,
)

data class FollowingPage(
    val posts: List<FeedPost>,
    val hasMore: Boolean,
)

data class FeedComment(
    val id: String,
    val postId: String,
    val authorId: String,
    val username: String,
    val body: String,
    val createdAt: Long,
    val avatarPath: String,
)

data class CommentPage(
    val items: List<FeedComment>,
    val nextCursor: String?,
)

enum class FeedFailureKind {
    TRANSPORT,
    SIGN_IN,
    REFUSED,
    LIMITED,
    UNAVAILABLE,
    UNEXPECTED,
}

data class FeedFailure(
    val httpStatus: Int,
    val message: String,
    val kind: FeedFailureKind,
)

sealed class FeedCall<out T> {
    data class Ok<T>(val value: T) : FeedCall<T>()
    data class Err(val failure: FeedFailure) : FeedCall<Nothing>()
}

object FeedCopy {
    const val TRANSPORT = "Could not reach FunctionGram. Check your connection and try again."
    const val UNREADABLE = "Could not read the server response."
    const val GENERIC = "Something went wrong. Please try again."
    const val TOO_LARGE = "This photo is too large to open here."
    const val NOT_IMAGE = "This file is not a photo the app can show."
}
