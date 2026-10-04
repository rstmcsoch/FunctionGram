package com.functiongram.app.data.directory

import com.functiongram.app.data.feed.FeedPost

/**
 * Profiles, search, notifications, and account settings from the social API.
 * Rows come from the server. This client does not invent accounts.
 */
data class DirectoryPerson(
    val id: String,
    val username: String,
    val name: String,
    val bio: String,
    val website: String,
    val avatarPath: String,
    val demo: Boolean,
    val privateAccount: Boolean,
    val verified: Boolean,
    val followers: Int,
    val following: Int,
    val postCount: Int,
    val followed: Boolean,
    val blocked: Boolean,
)

/**
 * Directory-facing alias for the admin feature document.
 * Prefer [com.functiongram.app.data.policy.ServerFeatures] for new call sites.
 */
typealias DirectoryFlags = com.functiongram.app.data.policy.ServerFeatures

data class AccountShell(
    val flags: DirectoryFlags,
    val me: DirectoryPerson?,
)

data class AppNotification(
    val id: String,
    val actorId: String,
    val kind: String,
    val postId: String?,
    val createdAt: Long,
    val readAt: Long?,
    val username: String,
    val avatarPath: String,
    val mediaPath: String?,
    val templateText: String,
    val messageText: String,
    val broadcastId: String?,
)

data class NotificationGroup(
    val key: String,
    val kind: String,
    val actors: List<AppNotification>,
    val postId: String?,
    val createdAt: Long,
    val unread: Boolean,
)

data class SearchPage(
    val people: List<DirectoryPerson>,
    val posts: List<FeedPost>,
)

data class SavedCollection(
    val id: String,
    val name: String,
    val createdAt: Long,
    val postIds: List<String>,
)

data class CollectionWrite(
    val id: String,
    val existing: Boolean,
)

data class PrivacyResult(
    val privateAccount: Boolean,
)

enum class ProfileTab {
    POSTS,
    REELS,
    SAVED,
}

object DirectoryCopy {
    const val FEATURE_OFF = "This feature is currently unavailable."
    const val SIGN_IN = "Sign in to join the conversation."
    const val POST_GONE = "This post is no longer available."
    const val USERNAME_RULE = "Use 3–30 letters, numbers, dots, or underscores for your username."
    const val USERNAME_RESERVED = "That username is reserved for an application page. Try another."
    const val REQUIRED = "Please complete the required fields."
    const val LENGTH = "Please check the length of your text."
    const val WEBSITE_COMPLETE = "Enter a complete website URL, starting with https://."
    const val WEBSITE_INVALID = "Enter a valid http(s) website URL."
    const val COLLECTION_NAME = "Give the collection a longer name."
    const val RELATIONSHIP = "Invalid relationship."
    const val EMAIL = "Enter an email address."
    const val EMAIL_SENT = "A confirmation link was sent to the new address. Your email stays the same until you open it."
    const val DELETE_SENT = "A deletion link is on its way to your email. Your account stays until you confirm it."
    const val REPORT_REASON = "Choose a reason for the report."
}

object ReportReasons {
    val all: List<Pair<String, String>> = listOf(
        "spam" to "Spam",
        "harassment" to "Harassment",
        "false_information" to "False information",
        "misleading" to "Misleading",
        "inappropriate" to "Inappropriate",
        "other" to "Other",
    )

    fun allowed(reason: String): Boolean = all.any { it.first == reason }
}
