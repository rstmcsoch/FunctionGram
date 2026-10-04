package com.functiongram.app.policy

import com.functiongram.app.configuration.ApiEnvironment
import com.functiongram.app.data.directory.DirectoryCodec
import com.functiongram.app.data.feed.FeedCall
import com.functiongram.app.data.feed.FeedCodec
import com.functiongram.app.data.policy.FeaturePolicy
import com.functiongram.app.data.policy.ServerFeatures
import com.functiongram.app.presentation.shell.ShellCatalog
import com.functiongram.app.presentation.shell.ShellDestination
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class FeaturePolicyTest {
    private val origin = ApiEnvironment.PUBLIC_API_ORIGIN
    private val mediaKey = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"

    @Test
    fun parsesFullAdminFeatureDocumentAndFailsClosed() {
        val json = """
            {"features":{
              "reels":true,"stories":1,"explore":false,"search":true,"messages":true,
              "notifications":0,"comments":true,"likes":true,"saves":false,"shares":true,
              "follow":true,"reports":true,"uploads":true,"signups":false,"guestBrowsing":true,
              "privateAccounts":true,"tagging":false,"postEditing":true,
              "messageDeletion":true,"messageSearch":false,"readReceipts":true,"emojiPicker":true,
              "messageReplies":true,"messageReactions":false,"messageEditing":true,
              "messageForwarding":true,"messagePinning":false,"messageSaving":true,
              "disappearingMessages":false,"voiceMessages":false,"fileMessages":false,
              "gifMessages":true,"stickerMessages":true,"chatThemes":false,"messageTyping":true
            }}
        """.trimIndent()
        val root = Json.parseToJsonElement(json).jsonObject
        val features = ServerFeatures.parse(root["features"])
        assertTrue(features.reels)
        assertTrue(features.stories)
        assertFalse(features.explore)
        assertTrue(features.search)
        assertTrue(features.messages)
        assertFalse(features.notifications)
        assertFalse(features.saves)
        assertTrue(features.uploads)
        assertFalse(features.signups)
        assertFalse(features.tagging)
        assertFalse(features.messageSearch)
        assertFalse(features.messageReactions)
        assertFalse(features.messagePinning)
        assertFalse(features.disappearingMessages)
        assertTrue(features.gifMessages)
        assertFalse(features.chatThemes)
        assertEquals(ServerFeatures.KEYS.size, 35)
        assertTrue(ServerFeatures.KEYS.contains("messages"))
        assertTrue(ServerFeatures.KEYS.contains("uploads"))
        val absent = ServerFeatures.parse(null)
        assertFalse(absent.messages)
        assertFalse(absent.search)
        assertFalse(absent.reels)
    }

    @Test
    fun flagOffHidesNavAndBlocksRequestShapes() {
        val off = ServerFeatures(search = false, messages = false, notifications = false, reels = false, explore = false, saves = false, uploads = false, follow = false, comments = false)
        assertFalse(ShellCatalog.allows(ShellDestination.SEARCH, off))
        assertFalse(ShellCatalog.allows(ShellDestination.MESSAGES, off))
        assertFalse(ShellCatalog.allows(ShellDestination.NOTIFICATIONS, off))
        assertFalse(ShellCatalog.allows(ShellDestination.REELS, off))
        assertFalse(ShellCatalog.allows(ShellDestination.EXPLORE, off))
        assertFalse(ShellCatalog.allows(ShellDestination.SAVED, off))
        assertFalse(ShellCatalog.allowsCreate(off))
        assertTrue(ShellCatalog.allows(ShellDestination.HOME, off))
        assertTrue(ShellCatalog.allows(ShellDestination.PROFILE, off))
        assertFalse(ShellCatalog.dockIds(off).contains("search"))
        assertFalse(ShellCatalog.dockIds(off).contains("reels"))
        assertFalse(ShellCatalog.dockIds(off).contains(ShellCatalog.CREATE_ID))
        assertFalse(ShellCatalog.headerIds(off).contains("messages"))
        assertFalse(ShellCatalog.sidebarIds(off).contains("notifications"))

        assertNull(FeaturePolicy.searchUrl(origin, "ada", off))
        assertNull(FeaturePolicy.conversationsUrl(origin, off))
        assertNull(FeaturePolicy.threadUrl(origin, "user-2", null, off))
        assertNull(FeaturePolicy.notificationsUrl(origin, off))
        assertNull(FeaturePolicy.followingUrl(origin, 0, off))
        assertNull(FeaturePolicy.commentsUrl(origin, "post-1", 30, null, off))
        assertNull(FeaturePolicy.reelsUrl(origin, 0, off))
        assertNull(FeaturePolicy.textMessageBody("user-2", "hello", off))
        assertNull(FeaturePolicy.imageMessageBody("user-2", mediaKey, "hi", off))
        assertEquals(FeaturePolicy.FEATURE_OFF, FeaturePolicy.blockIfOff(false))
    }

    @Test
    fun flagOnAllowsRequestShapesMatchingExistingRoutes() {
        val on = ServerFeatures(
            search = true,
            messages = true,
            notifications = true,
            reels = true,
            explore = true,
            saves = true,
            uploads = true,
            follow = true,
            comments = true,
        )
        assertTrue(ShellCatalog.allows(ShellDestination.SEARCH, on))
        assertTrue(ShellCatalog.allows(ShellDestination.MESSAGES, on))
        assertTrue(ShellCatalog.allows(ShellDestination.REELS, on))
        assertTrue(ShellCatalog.allowsCreate(on))
        assertTrue(ShellCatalog.dockIds(on).contains("search"))
        assertTrue(ShellCatalog.headerIds(on).contains("messages"))

        assertEquals(
            "https://functiongram.vercel.app/api/social?search=ada",
            FeaturePolicy.searchUrl(origin, "ada", on),
        )
        assertEquals(
            "https://functiongram.vercel.app/api/social?conversations=all&limit=100",
            FeaturePolicy.conversationsUrl(origin, on),
        )
        assertTrue(
            FeaturePolicy.threadUrl(origin, "user-2", null, on)!!
                .startsWith("https://functiongram.vercel.app/api/social?messages=user-2"),
        )
        assertEquals(
            "https://functiongram.vercel.app/api/social?notifications=1",
            FeaturePolicy.notificationsUrl(origin, on),
        )
        assertEquals(
            "https://functiongram.vercel.app/api/social?following=1&offset=0",
            FeaturePolicy.followingUrl(origin, 0, on),
        )
        assertTrue(
            FeaturePolicy.commentsUrl(origin, "post-1", 30, null, on)!!
                .contains("comments=post-1"),
        )
        assertEquals(
            "https://functiongram.vercel.app/api/social?reels=1&offset=0",
            FeaturePolicy.reelsUrl(origin, 0, on),
        )
        val text = FeaturePolicy.textMessageBody("user-2", "hello", on)
        assertNotNull(text)
        assertTrue(text!!.contains("\"action\":\"message\""))
        assertTrue(text.contains("\"body\":\"hello\""))
        val image = FeaturePolicy.imageMessageBody("user-2", mediaKey, "caption", on)
        assertNotNull(image)
        assertTrue(image!!.contains("\"message_type\":\"image\""))
        assertTrue(image.contains("\"media_key\":\"$mediaKey\""))
        assertTrue(FeaturePolicy.canSendPhoto(on))
        assertNull(FeaturePolicy.blockIfOff(true))
    }

    @Test
    fun uploadsOffBlocksPhotoEvenWhenMessagesOn() {
        val features = ServerFeatures(messages = true, uploads = false)
        assertTrue(FeaturePolicy.canOpenMessages(features))
        assertFalse(FeaturePolicy.canSendPhoto(features))
        assertNull(FeaturePolicy.imageMessageBody("user-2", mediaKey, "", features))
        assertNotNull(FeaturePolicy.textMessageBody("user-2", "hello", features))
        assertNotNull(FeaturePolicy.conversationsUrl(origin, features))
    }

    @Test
    fun homeAndShellCodecsExposeTheSameFeatureKeys() {
        val body = """{"features":{"stories":true,"reels":false,"follow":true,"comments":true,"likes":1,"saves":0,"search":true,"notifications":true,"messages":true,"uploads":true,"privateAccounts":true,"reports":false,"explore":true},"stories":{"enabled":true,"hours":24,"photoSeconds":5,"videoMaxSeconds":15,"tray":true,"ring":false},"me":{"id":"viewer-1","username":"ada","name":"Ada","bio":"","website":"","avatar":"","is_demo":0,"is_private":0,"verified":0,"followers":0,"following":0,"post_count":0,"followed":0,"blocked":0},"posts":[],"hasMore":false}"""
        val home = (FeedCodec.home(200, body) as FeedCall.Ok).value
        assertTrue(home.flags.stories)
        assertFalse(home.flags.reels)
        assertTrue(home.flags.search)
        assertTrue(home.flags.messages)
        assertTrue(home.flags.explore)
        assertFalse(home.flags.saves)
        assertTrue(home.flags.likes)
        val shell = (DirectoryCodec.shell(200, body) as FeedCall.Ok).value
        assertTrue(shell.flags.search)
        assertTrue(shell.flags.messages)
        assertTrue(shell.flags.explore)
        assertFalse(shell.flags.reports)
        assertEquals(home.flags.uploads, shell.flags.uploads)
    }

    @Test
    fun viewFeatureMappingMatchesServer() {
        assertEquals("reels", FeaturePolicy.featureForNavId("reels"))
        assertEquals("search", FeaturePolicy.featureForNavId("search"))
        assertEquals("explore", FeaturePolicy.featureForNavId("explore"))
        assertEquals("messages", FeaturePolicy.featureForNavId("messages"))
        assertEquals("notifications", FeaturePolicy.featureForNavId("notifications"))
        assertEquals("saves", FeaturePolicy.featureForNavId("saved"))
        assertEquals("uploads", FeaturePolicy.featureForNavId("create"))
        assertNull(FeaturePolicy.featureForNavId("home"))
        assertNull(FeaturePolicy.featureForNavId("profile"))
    }
}
