package com.functiongram.app.presentation.messaging

import com.functiongram.app.data.messaging.ChatMessage
import com.functiongram.app.data.messaging.ConversationSummary
import com.functiongram.app.data.policy.ServerFeatures

enum class ScreenStatus {
    Idle,
    Loading,
    Ready,
    Empty,
    Error,
}

class PhotoViewerState(
    val messageId: String,
    val status: ScreenStatus,
    val bytes: ByteArray?,
    val message: String?,
) {
    fun copy(
        messageId: String = this.messageId,
        status: ScreenStatus = this.status,
        bytes: ByteArray? = this.bytes,
        message: String? = this.message,
    ) = PhotoViewerState(messageId, status, bytes, message)
}

data class MessagingUiState(
    val viewerId: String = "",
    val features: ServerFeatures = ServerFeatures(),
    val listStatus: ScreenStatus = ScreenStatus.Loading,
    val conversations: List<ConversationSummary> = emptyList(),
    val unreadTotal: Int = 0,
    val listMessage: String? = null,
    val openPeerId: String? = null,
    val openTitle: String = "",
    val threadStatus: ScreenStatus = ScreenStatus.Idle,
    val messages: List<ChatMessage> = emptyList(),
    val nextCursor: String? = null,
    val loadingEarlier: Boolean = false,
    val threadMessage: String? = null,
    val draft: String = "",
    val sending: Boolean = false,
    val sendMessage: String? = null,
    val viewer: PhotoViewerState? = null,
)
