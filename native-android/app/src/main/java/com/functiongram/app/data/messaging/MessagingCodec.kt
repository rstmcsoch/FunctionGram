package com.functiongram.app.data.messaging

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json

/**
 * Maps FunctionGram JSON into messaging models.
 * A refusal keeps the server's `error` string. It is not rewritten into a local permission.
 */
object MessagingCodec {
    private val json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
        coerceInputValues = true
    }

    fun conversationList(status: Int, body: String): MessagingCall<ConversationPage> {
        if (status !in 200..299) return MessagingCall.Err(failure(status, body))
        val wire = decode<ConversationPageWire>(body)
            ?: return unreadable(status)
        if (wire.items.any { it.peerId.isBlank() }) return unreadable(status)
        return MessagingCall.Ok(
            ConversationPage(
                items = wire.items.map { it.toDomain() },
                unreadTotal = wire.unreadTotal.coerceAtLeast(0),
                filter = wire.filter.ifBlank { "all" },
            ),
        )
    }

    fun thread(status: Int, body: String): MessagingCall<ThreadPage> {
        if (status !in 200..299) return MessagingCall.Err(failure(status, body))
        val wire = decode<ThreadPageWire>(body) ?: return unreadable(status)
        if (wire.items.any { it.id.isBlank() || it.senderId.isBlank() }) return unreadable(status)
        return MessagingCall.Ok(
            ThreadPage(
                itemsNewestFirst = wire.items.map { it.toDomain() },
                nextCursor = wire.nextCursor?.takeIf { it.isNotBlank() },
            ),
        )
    }

    fun sentMessage(status: Int, body: String): MessagingCall<ChatMessage> {
        if (status !in 200..299) return MessagingCall.Err(failure(status, body))
        val wire = decode<MessageWire>(body) ?: return unreadable(status)
        if (wire.id.isBlank() || wire.senderId.isBlank()) return unreadable(status)
        return MessagingCall.Ok(wire.toDomain())
    }

    fun attachment(status: Int, body: String): MessagingCall<AttachmentAsset> {
        if (status !in 200..299) return MessagingCall.Err(failure(status, body))
        val wire = decode<AttachmentWire>(body) ?: return unreadable(status)
        if (!MessagingRequests.isUploadKey(wire.key)) return unreadable(status)
        return MessagingCall.Ok(
            AttachmentAsset(
                key = wire.key,
                mime = wire.mime,
                filename = wire.filename,
                category = wire.category,
            ),
        )
    }

    fun acknowledged(status: Int, body: String): MessagingCall<Unit> {
        if (status !in 200..299) return MessagingCall.Err(failure(status, body))
        return MessagingCall.Ok(Unit)
    }

    fun failure(status: Int, body: String): MessagingFailure {
        val server = errorMessage(body)
        val kind = when (status) {
            0 -> MessagingFailureKind.TRANSPORT
            401 -> MessagingFailureKind.SIGN_IN
            403, 404, 409, 410, 415, 422 -> MessagingFailureKind.REFUSED
            413, 429 -> MessagingFailureKind.LIMITED
            500, 502, 503, 504 -> MessagingFailureKind.UNAVAILABLE
            else -> MessagingFailureKind.UNEXPECTED
        }
        return MessagingFailure(
            httpStatus = status,
            message = server ?: fallback(kind),
            kind = kind,
        )
    }

    fun errorMessage(body: String): String? {
        val trimmed = body.trim()
        if (!trimmed.startsWith("{")) return null
        val parsed = decode<ErrorWire>(trimmed) ?: return null
        return parsed.error?.trim()?.takeIf { it.isNotEmpty() }
    }

    fun preview(type: String?, body: String?): String {
        val caption = body?.trim().orEmpty()
        return when (type ?: "text") {
            "", "text" -> caption.ifEmpty { "Message" }
            "image" -> caption.ifEmpty { "Photo" }
            "video" -> caption.ifEmpty { "Video" }
            "voice" -> caption.ifEmpty { "Voice message" }
            "file" -> caption.ifEmpty { "File" }
            "sticker" -> "Sticker"
            "gif" -> "GIF"
            "post" -> caption.ifEmpty { "Post" }
            "profile" -> "Profile"
            else -> caption.ifEmpty { "Message" }
        }
    }

    private fun unreadable(status: Int): MessagingCall.Err = MessagingCall.Err(
        MessagingFailure(
            httpStatus = status,
            message = MessagingCopy.UNREADABLE,
            kind = MessagingFailureKind.UNEXPECTED,
        ),
    )

    private fun fallback(kind: MessagingFailureKind): String = when (kind) {
        MessagingFailureKind.TRANSPORT -> MessagingCopy.TRANSPORT
        else -> MessagingCopy.GENERIC
    }

    private inline fun <reified T> decode(body: String): T? {
        return try {
            json.decodeFromString<T>(body)
        } catch (_: SerializationException) {
            null
        } catch (_: IllegalArgumentException) {
            null
        }
    }
}

object MessagingCopy {
    const val TRANSPORT = "Could not reach FunctionGram. Check your connection and try again."
    const val UNREADABLE = "Could not read the server response."
    const val GENERIC = "Something went wrong. Please try again."
    const val TOO_LARGE = "The file exceeds the current upload size limit."
    const val CHOOSE_FILE = "Choose a file to send."
}

@Serializable
private data class ErrorWire(val error: String? = null)

@Serializable
private data class ConversationPageWire(
    val items: List<ConversationWire> = emptyList(),
    @SerialName("unread_total") val unreadTotal: Int = 0,
    val filter: String = "all",
)

@Serializable
private data class ConversationWire(
    @SerialName("peer_id") val peerId: String = "",
    val username: String = "",
    val name: String = "",
    val avatar: String = "",
    @SerialName("is_demo") val isDemo: Int = 0,
    @SerialName("is_self") val isSelf: Int = 0,
    @SerialName("last_body") val lastBody: String? = null,
    @SerialName("last_type") val lastType: String? = null,
    @SerialName("last_sender_id") val lastSenderId: String? = null,
    @SerialName("last_created_at") val lastCreatedAt: Long? = null,
    @SerialName("unread_count") val unreadCount: Int = 0,
    @SerialName("is_pinned") val isPinned: Int = 0,
    @SerialName("is_muted") val isMuted: Int = 0,
    @SerialName("is_archived") val isArchived: Int = 0,
    @SerialName("is_favorite") val isFavorite: Int = 0,
    @SerialName("marked_unread") val markedUnread: Int = 0,
) {
    fun toDomain() = ConversationSummary(
        peerId = peerId,
        username = username,
        name = name,
        avatar = avatar,
        isDemo = isDemo == 1,
        isSelf = isSelf == 1,
        lastBody = lastBody,
        lastType = lastType,
        lastSenderId = lastSenderId,
        lastCreatedAt = lastCreatedAt,
        unreadCount = unreadCount.coerceAtLeast(0),
        isPinned = isPinned == 1,
        isMuted = isMuted == 1,
        isArchived = isArchived == 1,
        isFavorite = isFavorite == 1,
        markedUnread = markedUnread == 1,
    )
}

@Serializable
private data class ThreadPageWire(
    val items: List<MessageWire> = emptyList(),
    @SerialName("next_cursor") val nextCursor: String? = null,
)

@Serializable
private data class MessageWire(
    val id: String = "",
    @SerialName("sender_id") val senderId: String = "",
    @SerialName("recipient_id") val recipientId: String = "",
    val body: String = "",
    @SerialName("created_at") val createdAt: Long = 0,
    @SerialName("message_type") val messageType: String = "text",
    @SerialName("media_url") val mediaUrl: String? = null,
    @SerialName("media_mime") val mediaMime: String? = null,
    @SerialName("media_filename") val mediaFilename: String? = null,
    @SerialName("view_once") val viewOnce: Int = 0,
    @SerialName("view_once_consumed") val viewOnceConsumed: Int = 0,
    @SerialName("read_at") val readAt: Long? = null,
    @SerialName("delivered_at") val deliveredAt: Long? = null,
) {
    fun toDomain() = ChatMessage(
        id = id,
        senderId = senderId,
        recipientId = recipientId,
        body = body,
        createdAt = createdAt,
        messageType = messageType.ifBlank { "text" },
        mediaUrl = mediaUrl,
        mediaMime = mediaMime,
        mediaFilename = mediaFilename,
        viewOnce = viewOnce == 1,
        viewOnceConsumed = viewOnceConsumed == 1,
        readAt = readAt,
        deliveredAt = deliveredAt,
    )
}

@Serializable
private data class AttachmentWire(
    val key: String = "",
    val mime: String = "",
    val filename: String = "",
    val category: String = "",
)
