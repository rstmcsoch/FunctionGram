package com.functiongram.app.data.messaging

/**
 * Messaging shapes returned by the existing HTTPS API.
 * Flags and blocks are not stored here. The server text is.
 */
data class ConversationPage(
    val items: List<ConversationSummary>,
    val unreadTotal: Int,
    val filter: String,
)

data class ConversationSummary(
    val peerId: String,
    val username: String,
    val name: String,
    val avatar: String,
    val isDemo: Boolean,
    val isSelf: Boolean,
    val lastBody: String?,
    val lastType: String?,
    val lastSenderId: String?,
    val lastCreatedAt: Long?,
    val unreadCount: Int,
    val isPinned: Boolean,
    val isMuted: Boolean,
    val isArchived: Boolean,
    val isFavorite: Boolean,
    val markedUnread: Boolean,
)

data class ThreadPage(
    /** Newest first, matching `GET /api/social?messages=`. */
    val itemsNewestFirst: List<ChatMessage>,
    val nextCursor: String?,
) {
    fun chronological(): List<ChatMessage> = itemsNewestFirst.asReversed()
}

data class ChatMessage(
    val id: String,
    val senderId: String,
    val recipientId: String,
    val body: String,
    val createdAt: Long,
    val messageType: String,
    val mediaUrl: String?,
    val mediaMime: String?,
    val mediaFilename: String?,
    val viewOnce: Boolean,
    val viewOnceConsumed: Boolean,
    val readAt: Long?,
    val deliveredAt: Long?,
)

data class AttachmentAsset(
    val key: String,
    val mime: String,
    val filename: String,
    val category: String,
)

data class PhotoPayload(
    val bytes: ByteArray,
    val mime: String,
    val filename: String,
)

enum class MessagingFailureKind {
    TRANSPORT,
    SIGN_IN,
    REFUSED,
    LIMITED,
    UNAVAILABLE,
    UNEXPECTED,
}

data class MessagingFailure(
    val httpStatus: Int,
    val message: String,
    val kind: MessagingFailureKind,
)

sealed class MessagingCall<out T> {
    data class Ok<T>(val value: T) : MessagingCall<T>()
    data class Err(val failure: MessagingFailure) : MessagingCall<Nothing>()
}
