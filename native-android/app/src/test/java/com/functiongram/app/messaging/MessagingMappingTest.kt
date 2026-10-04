package com.functiongram.app.messaging

import com.functiongram.app.data.messaging.MessageMediaRef
import com.functiongram.app.data.messaging.MessagingCall
import com.functiongram.app.data.messaging.MessagingCodec
import com.functiongram.app.data.messaging.MessagingCopy
import com.functiongram.app.data.messaging.MessagingFailureKind
import com.functiongram.app.data.messaging.MessagingRequests
import com.functiongram.app.data.remote.ApiRoutes
import com.functiongram.app.presentation.messaging.MessagingLayout
import com.functiongram.app.presentation.messaging.PhotoGestures
import com.functiongram.app.presentation.messaging.formatWhen
import com.functiongram.app.security.ClientSecretPolicy
import java.time.ZoneOffset
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class MessagingMappingTest {
    @Test
    fun conversationListKeepsServerFields() {
        val parsed = MessagingCodec.conversationList(200, CONVERSATIONS)
        val page = (parsed as MessagingCall.Ok).value
        assertEquals(2, page.unreadTotal)
        assertEquals("all", page.filter)
        assertEquals(2, page.items.size)
        val first = page.items[0]
        assertEquals("peer-ada", first.peerId)
        assertEquals("Ada Lovelace", first.name)
        assertEquals("ada", first.username)
        assertTrue(first.isPinned)
        assertEquals(2, first.unreadCount)
        assertEquals("See you there", first.lastBody)
        assertEquals("text", first.lastType)
        assertEquals(1_700_000_000_000L, first.lastCreatedAt)
        val second = page.items[1]
        assertTrue(second.isSelf)
        assertFalse(second.isPinned)
        assertNull(second.lastBody)
        assertEquals("image", second.lastType)
        assertTrue(second.markedUnread)
        assertEquals("Photo", MessagingCodec.preview(second.lastType, second.lastBody))
    }

    @Test
    fun threadIsNewestFirstAndChronologicalWhenReversed() {
        val parsed = MessagingCodec.thread(200, THREAD)
        val page = (parsed as MessagingCall.Ok).value
        assertEquals("1700000000000,msg-old", page.nextCursor)
        assertEquals("msg-new", page.itemsNewestFirst.first().id)
        assertEquals("msg-old", page.chronological().first().id)
        val photo = page.itemsNewestFirst.first()
        assertEquals("image", photo.messageType)
        assertEquals("/api/message-media/msg-new", photo.mediaUrl)
        assertEquals("image/jpeg", photo.mediaMime)
        assertTrue(photo.viewOnce)
        assertEquals("caption", photo.body)
        val text = page.chronological().first()
        assertEquals("hello", text.body)
        assertEquals("text", text.messageType)
        assertNull(text.mediaUrl)
        assertFalse(text.viewOnce)
    }

    @Test
    fun sentTextAndAttachmentRoundTrip() {
        val sent = MessagingCodec.sentMessage(200, SENT_TEXT) as MessagingCall.Ok
        assertEquals("msg-9", sent.value.id)
        assertEquals("peer-ada", sent.value.recipientId)
        assertEquals("text", sent.value.messageType)
        assertNull(sent.value.readAt)
        val asset = MessagingCodec.attachment(200, ATTACHMENT) as MessagingCall.Ok
        assertEquals("11111111-1111-4111-8111-111111111111", asset.value.key)
        assertEquals("image", asset.value.category)
        assertEquals("image/jpeg", asset.value.mime)
    }

    @Test
    fun refusesAnAttachmentKeyThatIsNotUuidV4() {
        val bad = MessagingCodec.attachment(200, ATTACHMENT.replace("11111111-1111-4111-8111-111111111111", "not-a-key"))
        val failure = (bad as MessagingCall.Err).failure
        assertEquals(MessagingFailureKind.UNEXPECTED, failure.kind)
        assertEquals(MessagingCopy.UNREADABLE, failure.message)
    }

    @Test
    fun serverErrorTextIsKeptVerbatim() {
        val samples = listOf(
            401 to "Sign in to join the conversation." to MessagingFailureKind.SIGN_IN,
            403 to "This feature is currently unavailable." to MessagingFailureKind.REFUSED,
            403 to "You cannot message this profile." to MessagingFailureKind.REFUSED,
            403 to "You are not allowed to send messages right now." to MessagingFailureKind.REFUSED,
            403 to "This account is not accepting messages right now." to MessagingFailureKind.REFUSED,
            403 to "Direct messages are unavailable for one of these accounts." to MessagingFailureKind.REFUSED,
            403 to "This account only accepts messages from its followers." to MessagingFailureKind.REFUSED,
            422 to "Messages are limited to 2000 characters." to MessagingFailureKind.REFUSED,
            429 to "You are sending messages too quickly. Try again in a moment." to MessagingFailureKind.LIMITED,
            503 to "We’ll be back soon" to MessagingFailureKind.UNAVAILABLE,
            413 to "The file exceeds the current upload size limit." to MessagingFailureKind.LIMITED,
        )
        samples.forEach { (pair, kind) ->
            val (status, message) = pair
            val failure = MessagingCodec.failure(status, """{"error":"$message"}""")
            assertEquals(message, failure.message)
            assertEquals(kind, failure.kind)
            assertEquals(status, failure.httpStatus)
        }
    }

    @Test
    fun missingErrorBodyUsesAGenericFallbackNotALocalPermission() {
        val transport = MessagingCodec.failure(0, "")
        assertEquals(MessagingFailureKind.TRANSPORT, transport.kind)
        assertEquals(MessagingCopy.TRANSPORT, transport.message)
        val refused = MessagingCodec.failure(403, "")
        assertEquals(MessagingCopy.GENERIC, refused.message)
        assertFalse(refused.message.contains("blocked", ignoreCase = true))
        val list = MessagingCodec.conversationList(401, """{"error":"Sign in to join the conversation."}""")
        assertEquals("Sign in to join the conversation.", (list as MessagingCall.Err).failure.message)
    }

    @Test
    fun textAndImageRequestsMatchTheSocialContract() {
        val text = MessagingRequests.textMessage("peer-ada", "  hello  ")
        assertEquals("""{"action":"message","id":"peer-ada","body":"hello"}""", text)
        assertFalse(text.contains("media_key"))
        assertFalse(text.contains("message_type"))
        val image = MessagingRequests.imageMessage(
            "peer-ada",
            "11111111-1111-4111-8111-111111111111",
            "caption",
        )
        assertTrue(image.contains(""""action":"message""""))
        assertTrue(image.contains(""""message_type":"image""""))
        assertTrue(image.contains(""""media_key":"11111111-1111-4111-8111-111111111111""""))
        assertTrue(image.contains(""""view_once":false"""))
        assertFalse(image.contains("view_once\":true") || image.contains(""""view_once":true"""))
        val read = MessagingRequests.readMessages("peer-ada")
        assertEquals("""{"action":"read_messages","id":"peer-ada"}""", read)
        assertFalse(ClientSecretPolicy.containsBackendSecret(text))
        assertFalse(ClientSecretPolicy.containsBackendSecret(image))
    }

    @Test
    fun threadUrlEncodesThePeerAndCursor() {
        val origin = "https://functiongram.vercel.app"
        val url = ApiRoutes.thread(origin, "peer ada", cursor = "1700000000000,msg-old")
        assertEquals(
            "https://functiongram.vercel.app/api/social?messages=peer%20ada&limit=50&cursor=1700000000000%2Cmsg-old",
            url,
        )
        assertFalse(ClientSecretPolicy.containsBackendSecret(url))
        assertFalse(url.contains("/api/admin"))
    }

    @Test
    fun photoOpenStaysOnTheMessageMediaPath() {
        assertEquals("msg-new", MessageMediaRef.inAppMessageId("/api/message-media/msg-new", "msg-new"))
        assertNull(MessageMediaRef.inAppMessageId("/api/message-media/msg-other", "msg-new"))
        assertNull(MessageMediaRef.inAppMessageId("/api/media/11111111-1111-4111-8111-111111111111", "msg-new"))
        assertNull(MessageMediaRef.inAppMessageId("https://functiongram.vercel.app/api/message-media/msg-new", "msg-new"))
        assertNull(MessageMediaRef.inAppMessageId("https://evil.example/api/message-media/msg-new", "msg-new"))
        assertNull(MessageMediaRef.inAppMessageId("//evil.example/api/message-media/msg-new", "msg-new"))
    }

    @Test
    fun keyboardInsetAccountsForShellPaddingAlreadyApplied() {
        assertEquals(0, MessagingLayout.remainingImePaddingPx(consumedBottomPx = 100, imeBottomPx = 0))
        assertEquals(0, MessagingLayout.remainingImePaddingPx(consumedBottomPx = 100, imeBottomPx = 80))
        assertEquals(220, MessagingLayout.remainingImePaddingPx(consumedBottomPx = 80, imeBottomPx = 300))
    }

    @Test
    fun photoPanClampsAndScaleStaysInRange() {
        assertEquals(1f, PhotoGestures.nextScale(1f, 0.2f))
        assertEquals(2f, PhotoGestures.nextScale(1f, 2f))
        assertEquals(5f, PhotoGestures.nextScale(4f, 2f))
        val idle = PhotoGestures.clamp(40f, 40f, scale = 1f, viewWidth = 100f, viewHeight = 200f)
        assertEquals(0f, idle.x)
        assertEquals(0f, idle.y)
        val clamped = PhotoGestures.clamp(1000f, -1000f, scale = 2f, viewWidth = 100f, viewHeight = 200f)
        assertEquals(50f, clamped.x)
        assertEquals(-100f, clamped.y)
    }

    @Test
    fun timestampsFormatWithoutUsingTheDeviceZone() {
        val formatted = formatWhen(1_700_000_000_000L, ZoneOffset.UTC)
        assertEquals("14 Nov, 22:13", formatted)
        assertEquals("", formatWhen(0L, ZoneOffset.UTC))
    }

    private companion object {
        val CONVERSATIONS = """
            {
              "items": [
                {
                  "peer_id": "peer-ada",
                  "username": "ada",
                  "name": "Ada Lovelace",
                  "avatar": "",
                  "is_demo": 0,
                  "is_self": 0,
                  "last_body": "See you there",
                  "last_type": "text",
                  "last_sender_id": "peer-ada",
                  "last_created_at": 1700000000000,
                  "unread_count": 2,
                  "is_pinned": 1,
                  "is_muted": 0,
                  "is_archived": 0,
                  "is_favorite": 0,
                  "marked_unread": 0
                },
                {
                  "peer_id": "me",
                  "username": "me",
                  "name": "Me",
                  "avatar": "",
                  "is_demo": 0,
                  "is_self": 1,
                  "last_body": null,
                  "last_type": "image",
                  "last_sender_id": "me",
                  "last_created_at": 1690000000000,
                  "unread_count": 0,
                  "is_pinned": 0,
                  "is_muted": 0,
                  "is_archived": 0,
                  "is_favorite": 1,
                  "marked_unread": 1
                }
              ],
              "unread_total": 2,
              "filter": "all"
            }
        """.trimIndent()

        val THREAD = """
            {
              "items": [
                {
                  "id": "msg-new",
                  "sender_id": "peer-ada",
                  "recipient_id": "me",
                  "body": "caption",
                  "created_at": 1700000001000,
                  "message_type": "image",
                  "media_url": "/api/message-media/msg-new",
                  "media_mime": "image/jpeg",
                  "media_filename": "photo.jpg",
                  "view_once": 1,
                  "view_once_consumed": 0,
                  "read_at": null,
                  "delivered_at": 1700000001000,
                  "reactions": []
                },
                {
                  "id": "msg-old",
                  "sender_id": "me",
                  "recipient_id": "peer-ada",
                  "body": "hello",
                  "created_at": 1700000000000,
                  "read_at": 1700000000500,
                  "delivered_at": 1700000000200
                }
              ],
              "next_cursor": "1700000000000,msg-old"
            }
        """.trimIndent()

        const val SENT_TEXT = """
            {"id":"msg-9","sender_id":"me","recipient_id":"peer-ada","body":"hello","created_at":1700000002000,"read_at":null,"delivered_at":null,"message_type":"text","media_url":null,"media_mime":null,"view_once":0,"view_once_consumed":0}
        """

        const val ATTACHMENT = """
            {"key":"11111111-1111-4111-8111-111111111111","url":"/api/media/11111111-1111-4111-8111-111111111111","mime":"image/jpeg","size":1200,"width":64,"height":64,"duration":null,"filename":"photo.jpg","category":"image"}
        """
    }
}
