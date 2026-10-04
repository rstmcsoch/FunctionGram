package com.functiongram.app

import com.functiongram.app.configuration.ApiEnvironment
import com.functiongram.app.data.remote.ApiRoutes
import com.functiongram.app.security.ClientSecretPolicy
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ApiContractTest {
    @Test
    fun healthUrlStaysOnThePublicHttpsApi() {
        val url = ApiRoutes.health(ApiEnvironment.PUBLIC_API_ORIGIN)
        assertEquals("https://functiongram.vercel.app/api/health", url)
        assertFalse(ClientSecretPolicy.containsBackendSecret(url))
        ClientSecretPolicy.requirePublicApiOrigin(ApiEnvironment.PUBLIC_API_ORIGIN)
    }

    @Test
    fun buildConfigOriginIsTheSamePublicApi() {
        assertEquals(ApiEnvironment.PUBLIC_API_ORIGIN, ApiEnvironment.resolvedOrigin())
        assertFalse(ClientSecretPolicy.containsBackendSecret(BuildConfig.API_BASE_URL))
    }

    @Test
    fun rejectsDatabaseUrlsAndServerSecretMarkers() {
        assertTrue(ClientSecretPolicy.containsBackendSecret("libsql://example.turso.io"))
        assertTrue(ClientSecretPolicy.containsBackendSecret("postgres://user:pass@host/db"))
        assertTrue(ClientSecretPolicy.containsBackendSecret("TURSO_AUTH_TOKEN=not-a-real-value"))
        assertTrue(ClientSecretPolicy.containsBackendSecret("BETTER_AUTH_SECRET=not-a-real-value"))
        assertFalse(ClientSecretPolicy.containsBackendSecret(ApiEnvironment.PUBLIC_API_ORIGIN))
    }

    @Test
    fun namesExistingSocialAuthAndMediaRoutes() {
        val origin = ApiEnvironment.PUBLIC_API_ORIGIN
        assertEquals("https://functiongram.vercel.app/api/social", ApiRoutes.social(origin))
        assertEquals(
            "https://functiongram.vercel.app/api/auth/get-session",
            ApiRoutes.auth(origin, "/get-session"),
        )
        assertEquals(
            "https://functiongram.vercel.app/api/media/photo-key",
            ApiRoutes.media(origin, "photo-key"),
        )
        assertEquals(
            "https://functiongram.vercel.app/api/message-attachment",
            ApiRoutes.messageAttachment(origin),
        )
        assertEquals(
            "https://functiongram.vercel.app/api/message-media/msg-1",
            ApiRoutes.messageMedia(origin, "msg-1"),
        )
        assertEquals(
            "https://functiongram.vercel.app/api/social?conversations=all&limit=100",
            ApiRoutes.conversations(origin),
        )
        assertEquals(
            "https://functiongram.vercel.app/api/social?messages=peer-1&limit=50",
            ApiRoutes.thread(origin, "peer-1"),
        )
        assertEquals(
            "https://functiongram.vercel.app/api/social?offset=0",
            ApiRoutes.feedOffset(origin, 0),
        )
        assertEquals(
            "https://functiongram.vercel.app/api/social?reels=1&offset=0",
            ApiRoutes.reelsFeed(origin, 0),
        )
    }
}
