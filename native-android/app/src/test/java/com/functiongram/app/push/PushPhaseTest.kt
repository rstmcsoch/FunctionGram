package com.functiongram.app.push

import com.functiongram.app.BuildConfig
import com.functiongram.app.configuration.ApiEnvironment
import com.functiongram.app.data.policy.ServerFeatures
import com.functiongram.app.data.remote.ApiRoutes
import com.functiongram.app.presentation.shell.ShellDeepLink
import com.functiongram.app.presentation.shell.ShellDestination
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PushPhaseTest {
    private val token = "a".repeat(20) + ":APA91b_example-token.1"

    @Test
    fun thisBuildDoesNotRequireFcm() {
        assertFalse(BuildConfig.FCM_CONFIGURED)
        assertFalse(FcmBridge.available)
    }

    @Test
    fun pushRouteStaysOnThePublicApi() {
        assertEquals(
            "https://functiongram.vercel.app/api/push",
            ApiRoutes.push(ApiEnvironment.PUBLIC_API_ORIGIN),
        )
    }

    @Test
    fun parsesConversationNotificationsAndProfileLinks() {
        assertEquals(
            PushDestination.Conversation("peer-1"),
            PushLinks.parse("functiongram://conversation/peer-1", emptyMap()),
        )
        assertEquals(
            PushDestination.Conversation("peer-1"),
            PushLinks.parse("https://functiongram.vercel.app/#/messages/peer-1", emptyMap()),
        )
        assertEquals(
            PushDestination.Notifications,
            PushLinks.parse("functiongram://notifications", emptyMap()),
        )
        assertEquals(
            PushDestination.Notifications,
            PushLinks.parse("https://functiongram.vercel.app/#/notifications", emptyMap()),
        )
        assertEquals(
            PushDestination.Profile("ada"),
            PushLinks.parse("https://functiongram.vercel.app/ada", emptyMap()),
        )
        assertEquals(
            PushDestination.Profile(null),
            PushLinks.parse("functiongram://profile", emptyMap()),
        )
        assertNull(PushLinks.parse("https://functiongram.vercel.app/admin-panel", emptyMap()))
        assertNull(PushLinks.parse("https://functiongram.vercel.app/api", emptyMap()))
        assertEquals(
            PushDestination.Conversation("peer-1"),
            PushLinks.parse(null, mapOf(PushLinks.EXTRA_TARGET to "conversation", PushLinks.EXTRA_ID to "peer-1")),
        )
    }

    @Test
    fun registrationFollowsNotificationsAndDisplayFollowsKindsAndMute() {
        val on = PushSettings(true, mapOf("like" to false, "comment" to true), setOf("muted"), "not_configured")
        assertTrue(PushPolicy.shouldRegister(on))
        assertFalse(PushPolicy.shouldDisplay(on, "like", null))
        assertTrue(PushPolicy.shouldDisplay(on, "comment", null))
        assertFalse(PushPolicy.shouldDisplay(on, "message", "muted"))
        assertTrue(PushPolicy.shouldDisplay(on, "message", "other"))
        val off = on.copy(notificationsEnabled = false)
        assertFalse(PushPolicy.shouldRegister(off))
        assertFalse(PushPolicy.shouldDisplay(off, "comment", null))
    }

    @Test
    fun settingsJsonFailsClosedWhenTheFlagIsMissing() {
        val parsed = PushCodec.settings(
            200,
            """{"kinds":{"like":0,"comment":1},"mutedPeerIds":["p1"],"pushDelivery":"not_configured"}""",
        )
        assertEquals(false, parsed?.notificationsEnabled)
        assertEquals(false, parsed?.kinds?.get("like"))
        assertEquals(true, parsed?.kinds?.get("comment"))
        assertTrue(parsed?.mutedPeerIds?.contains("p1") == true)
        assertEquals("not_configured", parsed?.pushDelivery)
        assertNull(PushCodec.settings(403, """{"error":"no"}"""))
        assertEquals("""{"token":"$token","platform":"android"}""", PushCodec.registerBody(token))
    }

    @Test
    fun coordinatorRegistersOnlyWhenSignedInAndNotificationsAreOn() {
        val api = FakePushApi()
        val snapshot = MemoryPushSnapshot()
        val coordinator = PushCoordinator(api, snapshot)
        coordinator.onToken(token)
        assertTrue(api.calls.isEmpty())
        api.settings = PushSettings(true, emptyMap(), emptySet(), "not_configured")
        coordinator.onSignedIn()
        assertEquals(listOf("register"), api.calls)
        assertEquals(token, snapshot.token())
        coordinator.onNotificationsEnabled(false)
        assertEquals(listOf("register", "unregister"), api.calls)
        assertNull(snapshot.token())
    }

    @Test
    fun signOutClearsAStoredTokenWithoutThrowingWhenUnregisterFails() {
        val api = FakePushApi().also { it.failUnregister = true }
        val snapshot = MemoryPushSnapshot().also { it.saveToken(token) }
        val coordinator = PushCoordinator(api, snapshot)
        coordinator.prepareSignOut()
        assertNull(snapshot.token())
        assertEquals(listOf("unregister"), api.calls)
    }

    @Test
    fun deepLinkWaitsForFlagsAndSkipsDisabledSurfaces() {
        val off = ServerFeatures(messages = false, notifications = false)
        val on = ServerFeatures(messages = true, notifications = true)
        assertEquals(
            ShellDeepLink.Decision.Waiting,
            ShellDeepLink.decide(PushDestination.Conversation("peer-1"), off, shellReady = false, selfLookup = ""),
        )
        assertEquals(
            ShellDeepLink.Decision.Blocked,
            ShellDeepLink.decide(PushDestination.Notifications, off, shellReady = true, selfLookup = "me"),
        )
        val open = ShellDeepLink.decide(PushDestination.Conversation("peer-1"), on, shellReady = true, selfLookup = "me")
        val applied = (open as ShellDeepLink.Decision.Open).applied
        assertEquals(ShellDestination.MESSAGES.id, applied.selectedId)
        assertEquals("peer-1", applied.messagePeer)
        val profile = ShellDeepLink.decide(PushDestination.Profile(null), on, shellReady = true, selfLookup = "ada")
        assertEquals("ada", (profile as ShellDeepLink.Decision.Open).applied.profileLookup)
    }

    private class FakePushApi : PushApi {
        val calls = mutableListOf<String>()
        var settings: PushSettings? = null
        var failUnregister: Boolean = false

        override fun fetchSettings(): PushSettings? = settings

        override fun register(token: String): PushWrite {
            calls += "register"
            return PushWrite.OK
        }

        override fun unregister(token: String): PushWrite {
            calls += "unregister"
            if (failUnregister) return PushWrite.FAILED
            return PushWrite.OK
        }
    }
}
