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
    }
}
