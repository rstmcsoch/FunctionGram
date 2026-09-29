package com.functiongram.dypollabs.app.data

import kotlinx.serialization.Serializable

@Serializable
data class Person(
    val id: String,
    val username: String,
    val name: String,
    val bio: String = "",
    val website: String? = null,
    val avatar: String = "",
    val is_demo: Int = 0,
    val is_private: Int? = 0,
    val followers: Int = 0,
    val following: Int = 0,
    val post_count: Int = 0,
    val followed: Int = 0,
    val blocked: Int? = 0,
    val last_message: String? = null
)

@Serializable
data class MediaOption(
    val ratio: String = "original",
    val fit: String = "cover",
    val alt: String = ""
)

@Serializable
data class Post(
    val id: String,
    val author_id: String,
    val media: List<String> = emptyList(),
    val aspects: List<Double>? = null,
    val media_options: List<MediaOption>? = null,
    val tagged_users: List<String>? = null,
    val highlighted: Boolean? = false,
    val edited_at: Long? = null,
    val media_type: String = "image",
    val kind: String = "post",
    val caption: String = "",
    val location: String = "",
    val category: String = "For you",
    val created_at: Long = 0,
    val expires_at: Long? = null,
    val likes: Int = 0,
    val liked: Int = 0,
    val saved: Int = 0,
    val seen: Int = 0,
    val comment_count: Int = 0,
    val comment_preview: CommentPreview? = null,
    val author: Person? = null,
    val display_likes: Int? = null,
    val display_comments: Int? = null,
    val display_views: Int? = null,
    val reel_credit: String? = null
)

@Serializable
data class CommentPreview(
    val body: String,
    val username: String
)

@Serializable
data class Comment(
    val id: String,
    val post_id: String,
    val author_id: String,
    val body: String,
    val created_at: Long,
    val username: String,
    val avatar: String
)

@Serializable
data class Message(
    val id: String,
    val sender_id: String,
    val recipient_id: String,
    val body: String,
    val post_id: String? = null,
    val created_at: Long,
    val read_at: Long? = null
)

@Serializable
data class NotificationItem(
    val id: String,
    val actor_id: String,
    val kind: String,
    val post_id: String? = null,
    val created_at: Long,
    val read_at: Long? = null,
    val username: String,
    val avatar: String,
    val media: String? = null,
    val media_type: String? = null
)

@Serializable
data class SavedCollection(
    val id: String,
    val name: String,
    val created_at: Long,
    val post_ids: List<String> = emptyList()
)

@Serializable
data class StoryViewer(
    val username: String,
    val name: String,
    val avatar: String
)

@Serializable
data class SocialData(
    val me: Person? = null,
    val people: List<Person> = emptyList(),
    val posts: List<Post> = emptyList(),
    val notifications: List<NotificationItem> = emptyList(),
    val unreadMessages: Int = 0,
    val hasMore: Boolean = false,
    val features: Map<String, Boolean>? = null
)

@Serializable
data class SearchResults(
    val people: List<Person> = emptyList(),
    val posts: List<Post> = emptyList()
)

@Serializable
data class CommentsResponse(
    val items: List<Comment> = emptyList(),
    val next_cursor: String? = null
)

@Serializable
data class MessagesResponse(
    val items: List<Message> = emptyList(),
    val next_cursor: String? = null
)

@Serializable
data class AuthResponse(
    val user: AuthUser? = null,
    val url: String? = null,
    val error: AuthError? = null
)

@Serializable
data class AuthUser(
    val id: String,
    val email: String,
    val name: String,
    val emailVerified: Boolean = false
)

@Serializable
data class AuthError(
    val message: String? = null,
    val code: String? = null,
    val status: Int? = null
)

@Serializable
data class SessionResponse(
    val user: AuthUser? = null,
    val session: SessionInfo? = null
)

@Serializable
data class SessionInfo(
    val id: String,
    val expiresAt: String
)

@Serializable
data class UploadPolicy(
    val enabled: Boolean = true,
    val maxFileMb: Int = 20,
    val dailyQuotaMb: Int = 100,
    val maxMedia: Int = 10,
    val allowedTypes: List<String> = listOf("image/jpeg", "image/png", "image/webp", "video/mp4")
)

@Serializable
data class UploadCompleteResponse(
    val url: String,
    val type: String,
    val aspect: Double? = null
)

@Serializable
data class SocialActionResponse(
    val ok: Boolean = true,
    val id: String? = null,
    val existing: Boolean? = null,
    val private: Boolean? = null,
    val edited_at: Long? = null,
    val sender_id: String? = null,
    val recipient_id: String? = null,
    val body: String? = null,
    val created_at: Long? = null,
    val read_at: Long? = null
)
