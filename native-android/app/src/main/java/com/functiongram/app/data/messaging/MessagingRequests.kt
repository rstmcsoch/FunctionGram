package com.functiongram.app.data.messaging

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

/**
 * JSON bodies for the existing social and attachment routes.
 * This does not decide who may message. The server does.
 */
object MessagingRequests {
    private val json = Json { encodeDefaults = true; explicitNulls = false }

    /** UUIDv4, the only key shape `uploadKeyPattern` accepts. */
    private val uploadKey = Regex("^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$")

    /**
     * Absolute byte ceiling of `POST /api/message-attachment`.
     * The live per-file limit is smaller when an administrator sets it that way.
     * This cap only stops the process from reading an unbounded stream.
     * A smaller file the server rejects is shown with the server's own message.
     */
    const val ABSOLUTE_UPLOAD_BYTES: Int = 100 * 1024 * 1024 + 65_536

    fun isUploadKey(value: String): Boolean = uploadKey.matches(value)

    fun textMessage(peerId: String, body: String): String {
        requirePeer(peerId)
        val trimmed = body.trim()
        require(trimmed.isNotEmpty()) { "Please complete the required fields." }
        require(trimmed.length <= 4000) { "Please check the length of your text." }
        return json.encodeToString(TextSend(action = "message", id = peerId, body = trimmed))
    }

    fun imageMessage(peerId: String, mediaKey: String, caption: String): String {
        requirePeer(peerId)
        require(isUploadKey(mediaKey)) { "Invalid upload name." }
        val trimmed = caption.trim()
        require(trimmed.length <= 4000) { "Please check the length of your text." }
        return json.encodeToString(
            ImageSend(
                action = "message",
                id = peerId,
                body = trimmed,
                messageType = "image",
                mediaKey = mediaKey,
                viewOnce = false,
            ),
        )
    }

    fun readMessages(peerId: String): String {
        requirePeer(peerId)
        return json.encodeToString(ReadSend(action = "read_messages", id = peerId))
    }

    private fun requirePeer(peerId: String) {
        require(peerId.isNotBlank() && peerId.length <= 100) { "Specify a conversation partner." }
    }

    @Serializable
    private data class TextSend(
        val action: String,
        val id: String,
        val body: String,
    )

    @Serializable
    private data class ImageSend(
        val action: String,
        val id: String,
        val body: String,
        @SerialName("message_type") val messageType: String,
        @SerialName("media_key") val mediaKey: String,
        @SerialName("view_once") val viewOnce: Boolean,
    )

    @Serializable
    private data class ReadSend(
        val action: String,
        val id: String,
    )
}
