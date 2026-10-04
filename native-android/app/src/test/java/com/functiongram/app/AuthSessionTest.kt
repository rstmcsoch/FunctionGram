package com.functiongram.app

import com.functiongram.app.data.auth.AuthCallResult
import com.functiongram.app.data.auth.AuthCookieNames
import com.functiongram.app.data.auth.AuthCopy
import com.functiongram.app.data.auth.AuthFailureKind
import com.functiongram.app.data.auth.AuthHttpResult
import com.functiongram.app.data.auth.AuthOperation
import com.functiongram.app.data.auth.AuthResponses
import com.functiongram.app.data.auth.AuthSessionRepository
import com.functiongram.app.data.auth.AuthTransport
import com.functiongram.app.data.auth.AuthWireRequest
import com.functiongram.app.data.auth.MemorySessionStore
import com.functiongram.app.data.auth.SessionCookieCodec
import com.functiongram.app.data.auth.SessionCookieJar
import com.functiongram.app.data.auth.SetCookieHeader
import com.functiongram.app.data.remote.ApiRoutes
import com.functiongram.app.domain.session.SessionPolicy
import com.functiongram.app.presentation.auth.AuthApplySource
import com.functiongram.app.presentation.auth.AuthPhase
import com.functiongram.app.presentation.auth.AuthUiState
import com.functiongram.app.presentation.auth.reduceAuthUi
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class AuthSessionTest {
    @Test
    fun sessionIsNotExtendedWithTheCurrentServerConfig() {
        assertEquals(259200, SessionPolicy.EXPIRES_IN_SECONDS)
        assertEquals(SessionPolicy.EXPIRES_IN_SECONDS, SessionPolicy.UPDATE_AGE_SECONDS)
        assertFalse(SessionPolicy.extendsSessionOnUse())
        assertEquals(ApiRoutes.SIGN_OUT, SessionPolicy.SIGN_OUT_PATH)
    }

    @Test
    fun authPathsStayOnThePublicWebsite() {
        val origin = "https://functiongram.vercel.app"
        assertEquals("$origin/api/auth/sign-in/email", ApiRoutes.auth(origin, ApiRoutes.SIGN_IN_EMAIL))
        assertEquals("$origin/api/auth/get-session", ApiRoutes.auth(origin, ApiRoutes.GET_SESSION))
        assertEquals("$origin/api/auth/sign-out", ApiRoutes.auth(origin, ApiRoutes.SIGN_OUT))
        assertEquals(
            "$origin/api/auth/two-factor/verify-totp",
            ApiRoutes.auth(origin, ApiRoutes.VERIFY_TOTP),
        )
    }

    @Test
    fun liveErrorFixturesMapWithoutKeepingSecrets() {
        val invalidEmail = AuthResponses.interpret(
            operation = AuthOperation.SIGN_IN,
            status = 400,
            body = """{"message":"Invalid email","code":"INVALID_EMAIL"}""",
            hasSessionCookie = false,
            hasTwoFactorCookie = false,
            cookieExpiresAtEpochMillis = null,
        )
        assertEquals(AuthCallResult.Failed(AuthFailureKind.INVALID_EMAIL), invalidEmail)
        assertEquals(AuthCopy.forKind(AuthFailureKind.INVALID_EMAIL), "Enter the email address for your FunctionGram account.")

        val invalidPassword = AuthResponses.interpret(
            operation = AuthOperation.SIGN_IN,
            status = 401,
            body = """{"message":"Invalid email or password","code":"INVALID_EMAIL_OR_PASSWORD"}""",
            hasSessionCookie = false,
            hasTwoFactorCookie = false,
            cookieExpiresAtEpochMillis = null,
        )
        assertEquals(AuthCallResult.Failed(AuthFailureKind.INVALID_CREDENTIALS), invalidPassword)

        val missingSession = AuthResponses.interpret(
            operation = AuthOperation.GET_SESSION,
            status = 200,
            body = "null",
            hasSessionCookie = false,
            hasTwoFactorCookie = false,
            cookieExpiresAtEpochMillis = null,
        )
        assertEquals(AuthCallResult.SignedOut(com.functiongram.app.data.auth.SignedOutReason.EXPIRED), missingSession)

        val missingChallenge = AuthResponses.interpret(
            operation = AuthOperation.VERIFY_TOTP,
            status = 401,
            body = """{"message":"Invalid two factor cookie","code":"INVALID_TWO_FACTOR_COOKIE"}""",
            hasSessionCookie = false,
            hasTwoFactorCookie = false,
            cookieExpiresAtEpochMillis = null,
        )
        assertEquals(AuthCallResult.Failed(AuthFailureKind.TWO_FACTOR_EXPIRED), missingChallenge)

        val refreshRejected = AuthResponses.interpret(
            operation = AuthOperation.GET_SESSION,
            status = 405,
            body = """{"message":"POST method requires deferSessionRefresh to be enabled in session config","code":"METHOD_NOT_ALLOWED_DEFER_SESSION_REQUIRED"}""",
            hasSessionCookie = false,
            hasTwoFactorCookie = false,
            cookieExpiresAtEpochMillis = null,
        )
        // GET handler treats 401 and 200 only as session results. 405 is not a session.
        assertTrue(refreshRejected is AuthCallResult.SignedOut || refreshRejected is AuthCallResult.Failed)
    }

    @Test
    fun signInDropsTheRawSessionTokenAndRequiresTheCookie() {
        val body = """{"redirect":false,"token":"raw-session-secret","user":{"id":"user_fixture","email":"person@example.invalid","name":"Person","emailVerified":true}}"""
        val withoutCookie = AuthResponses.interpret(
            AuthOperation.SIGN_IN, 200, body, hasSessionCookie = false, hasTwoFactorCookie = false, cookieExpiresAtEpochMillis = 50L,
        )
        assertEquals(AuthCallResult.Failed(AuthFailureKind.UNEXPECTED), withoutCookie)

        val withCookie = AuthResponses.interpret(
            AuthOperation.SIGN_IN, 200, body, hasSessionCookie = true, hasTwoFactorCookie = false, cookieExpiresAtEpochMillis = 50L,
        )
        assertTrue(withCookie is AuthCallResult.SignedIn)
        val profile = (withCookie as AuthCallResult.SignedIn).profile
        assertEquals("user_fixture", profile.userId)
        assertEquals("person@example.invalid", profile.email)
        assertEquals(50L, profile.sessionExpiresAtEpochMillis)
        assertFalse(withCookie.toString().contains("raw-session-secret"))
        assertFalse(withCookie.toString().contains("person@example.invalid"))
        assertFalse(profile.toString().contains("person@example.invalid"))
    }

    @Test
    fun twoFactorAndAccountErrors() {
        val challenge = AuthResponses.interpret(
            AuthOperation.SIGN_IN,
            200,
            """{"twoFactorRedirect":true,"twoFactorMethods":["totp"]}""",
            hasSessionCookie = false,
            hasTwoFactorCookie = true,
            cookieExpiresAtEpochMillis = null,
        )
        assertEquals(AuthCallResult.TwoFactorRequired(listOf("totp")), challenge)

        val unavailable = AuthResponses.interpret(
            AuthOperation.SIGN_IN,
            403,
            """{"message":"This account is unavailable."}""",
            false,
            false,
            null,
        )
        assertEquals(AuthCallResult.Failed(AuthFailureKind.ACCOUNT_UNAVAILABLE), unavailable)

        val unverified = AuthResponses.interpret(
            AuthOperation.SIGN_IN,
            403,
            """{"message":"Email not verified","code":"EMAIL_NOT_VERIFIED"}""",
            false,
            false,
            null,
        )
        assertEquals(AuthCallResult.Failed(AuthFailureKind.EMAIL_NOT_VERIFIED), unverified)

        val locked = AuthResponses.interpret(
            AuthOperation.VERIFY_TOTP,
            429,
            """{"message":"Too many failed verification attempts. Your account is temporarily locked. Please try again later.","code":"ACCOUNT_TEMPORARILY_LOCKED"}""",
            false,
            true,
            null,
        )
        assertEquals(AuthCallResult.Failed(AuthFailureKind.RATE_LIMITED), locked)

        val down = AuthResponses.interpret(
            AuthOperation.SIGN_IN,
            503,
            """{"message":"Sign-in is temporarily unavailable. Please try again later."}""",
            false,
            false,
            null,
        )
        assertEquals(AuthCallResult.Failed(AuthFailureKind.UNAVAILABLE), down)

        val badCode = AuthResponses.interpret(
            AuthOperation.VERIFY_TOTP,
            401,
            """{"message":"Invalid code","code":"INVALID_CODE"}""",
            false,
            true,
            null,
        )
        assertEquals(AuthCallResult.Failed(AuthFailureKind.TWO_FACTOR_INVALID), badCode)
    }

    @Test
    fun getSessionFixtureIgnoresTheRawToken() {
        val body = """
            {"session":{"expiresAt":"2026-10-07T04:38:39.000Z","userId":"user_fixture","token":"raw-session-secret"},
             "user":{"id":"user_fixture","email":"person@example.invalid","name":"Person","emailVerified":true}}
        """.trimIndent()
        val result = AuthResponses.interpret(AuthOperation.GET_SESSION, 200, body, true, false, null)
        val profile = (result as AuthCallResult.SignedIn).profile
        assertEquals("user_fixture", profile.userId)
        assertEquals(InstantMs.OCT_7, profile.sessionExpiresAtEpochMillis)
        assertFalse(result.toString().contains("raw-session-secret"))
        assertTrue(AuthResponses.signOutSucceeded(200, """{"success":true}"""))
        assertFalse(AuthResponses.signOutSucceeded(500, """{"success":false}"""))
    }

    @Test
    fun cookieRoundTripRedactsValuesAndDropsUnknownOrExpiredCookies() {
        val now = 1_700_000_000_000L
        val store = MemorySessionStore()
        val jar = SessionCookieJar(store) { now }
        jar.consume(
            "functiongram.vercel.app",
            listOf(
                "__Secure-better-auth.session_token=fixture.session.value; Max-Age=259200; Path=/; HttpOnly; Secure; SameSite=Lax",
                "other=nope; Max-Age=100; Path=/",
                "__Secure-better-auth.session_token=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax",
            ),
        )
        assertTrue(store.load().isEmpty())
        assertFalse(jar.hasSessionToken())

        jar.consume(
            "functiongram.vercel.app",
            listOf("__Secure-better-auth.session_token=fixture.session.value; Max-Age=259200; Path=/; HttpOnly; Secure; SameSite=Lax"),
        )
        val saved = store.load().single()
        assertEquals("fixture.session.value", saved.value)
        assertTrue(AuthCookieNames.isSessionToken(saved.name))
        assertEquals(now + 259200_000L, saved.expiresAtEpochMillis)
        assertFalse(saved.toString().contains("fixture.session.value"))
        assertFalse(SessionCookieCodec.redacted(store.load()).contains("fixture.session.value"))
        val encoded = SessionCookieCodec.encode(store.load())
        assertEquals("fixture.session.value", SessionCookieCodec.decode(encoded).single().value)
        assertEquals(
            "fixture.session.value",
            jar.cookieHeaderValue("functiongram.vercel.app", https = true)?.substringAfter("="),
        )
        assertNull(jar.cookieHeaderValue("functiongram.vercel.app", https = false))
        assertNull(jar.cookieHeaderValue("evil.example", https = true))

        val later = SessionCookieJar(MemorySessionStore().also { it.save(store.load()) }) { now + 259200_000L }
        assertFalse(later.hasSessionToken())
        assertTrue(SetCookieHeader.parse("not a cookie", "functiongram.vercel.app", now) == null)
    }

    @Test
    fun repositorySignInPersistsOnlyTheCookie() {
        val store = MemorySessionStore()
        val jar = SessionCookieJar(store)
        val fake = FakeTransport { request ->
            assertEquals("POST", request.method)
            assertEquals(ApiRoutes.SIGN_IN_EMAIL, request.path)
            assertFalse(request.toString().contains("not-a-real-password"))
            assertTrue(request.jsonBody!!.contains("\"password\""))
            assertTrue(request.jsonBody.contains("\"rememberMe\":true"))
            assertFalse(request.jsonBody.contains("callbackURL"))
            AuthHttpResult(
                status = 200,
                body = """{"redirect":false,"token":"raw-session-secret","user":{"id":"user_fixture","email":"person@example.invalid","name":"Person","emailVerified":true}}""",
                setCookies = listOf(
                    "__Secure-better-auth.session_token=fixture.session.value; Max-Age=259200; Path=/; HttpOnly; Secure; SameSite=Lax",
                ),
            )
        }
        val repository = AuthSessionRepository(fake, jar)
        val result = repository.signIn("person@example.invalid", "not-a-real-password")
        assertTrue(result is AuthCallResult.SignedIn)
        assertTrue(repository.hasSession())
        val encoded = SessionCookieCodec.encode(store.load())
        assertTrue(encoded.contains("fixture.session.value"))
        assertFalse(encoded.contains("not-a-real-password"))
        assertFalse(encoded.contains("raw-session-secret"))
        assertEquals(1, fake.calls.size)
        assertFalse(fake.calls.any { it.path == ApiRoutes.GET_SESSION && it.method == "POST" })
    }

    @Test
    fun repositoryChallengeLogoutAndExpiredSession() {
        val store = MemorySessionStore()
        val jar = SessionCookieJar(store)
        val fake = FakeTransport { request ->
            when (request.path) {
                ApiRoutes.SIGN_IN_EMAIL -> AuthHttpResult(
                    status = 200,
                    body = """{"twoFactorRedirect":true,"twoFactorMethods":["totp"]}""",
                    setCookies = listOf(
                        "__Secure-better-auth.two_factor=fixture-challenge; Max-Age=300; Path=/; HttpOnly; Secure; SameSite=Lax",
                    ),
                )
                ApiRoutes.VERIFY_TOTP -> AuthHttpResult(
                    status = 200,
                    body = """{"token":"raw-session-secret","user":{"id":"user_fixture","email":"person@example.invalid","name":"Person","emailVerified":true}}""",
                    setCookies = listOf(
                        "__Secure-better-auth.two_factor=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax",
                        "__Secure-better-auth.session_token=fixture.session.value; Max-Age=259200; Path=/; HttpOnly; Secure; SameSite=Lax",
                    ),
                )
                ApiRoutes.GET_SESSION -> AuthHttpResult(status = 200, body = "null")
                ApiRoutes.SIGN_OUT -> AuthHttpResult(
                    status = 200,
                    body = """{"success":true}""",
                    setCookies = listOf(
                        "__Secure-better-auth.session_token=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax",
                    ),
                )
                else -> error("unexpected ${request.path}")
            }
        }
        val repository = AuthSessionRepository(fake, jar)
        val challenge = repository.signIn("person@example.invalid", "not-a-real-password")
        assertEquals(AuthCallResult.TwoFactorRequired(listOf("totp")), challenge)
        assertTrue(jar.hasTwoFactor())
        assertFalse(SessionCookieCodec.encode(store.load()).contains("not-a-real-password"))

        val signedIn = repository.verifyTotp("000000")
        assertTrue(signedIn is AuthCallResult.SignedIn)
        assertFalse(signedIn.toString().contains("raw-session-secret"))
        assertFalse(SessionCookieCodec.encode(store.load()).contains("000000"))
        assertTrue(repository.hasSession())

        val expired = repository.restore()
        assertEquals(AuthCallResult.SignedOut(com.functiongram.app.data.auth.SignedOutReason.EXPIRED), expired)
        assertFalse(repository.hasSession())
        assertTrue(store.load().isEmpty())

        jar.consume(
            "functiongram.vercel.app",
            listOf("__Secure-better-auth.session_token=fixture.session.value; Max-Age=259200; Path=/; HttpOnly; Secure; SameSite=Lax"),
        )
        fake.failTransport = true
        val offline = repository.restore()
        assertEquals(AuthCallResult.Failed(AuthFailureKind.NETWORK), offline)
        assertTrue(repository.hasSession())

        fake.failTransport = false
        val loggedOut = repository.signOut()
        assertEquals(AuthCallResult.SignedOut(com.functiongram.app.data.auth.SignedOutReason.LOGGED_OUT), loggedOut)
        assertTrue(store.load().isEmpty())
        assertTrue(fake.calls.any { it.method == "GET" && it.path == ApiRoutes.GET_SESSION })
        assertFalse(fake.calls.any { it.method == "POST" && it.path == ApiRoutes.GET_SESSION })
    }

    @Test
    fun localSignOutStillClearsWhenTheServerCannotBeReached() {
        val store = MemorySessionStore()
        val jar = SessionCookieJar(store)
        jar.consume(
            "functiongram.vercel.app",
            listOf("__Secure-better-auth.session_token=fixture.session.value; Max-Age=100; Path=/; HttpOnly; Secure; SameSite=Lax"),
        )
        val repository = AuthSessionRepository(FakeTransport { AuthHttpResult(status = 0, body = "", transportFailed = true) }, jar)
        val result = repository.signOut()
        assertEquals(AuthCallResult.SignedOut(com.functiongram.app.data.auth.SignedOutReason.LOCAL_ONLY), result)
        assertTrue(store.load().isEmpty())
    }

    @Test
    fun reducerCoversExpiredOfflineAndTwoFactor() {
        val expired = reduceAuthUi(
            AuthUiState(),
            AuthCallResult.SignedOut(com.functiongram.app.data.auth.SignedOutReason.EXPIRED),
            AuthApplySource.RESTORE,
            hasSession = false,
        )
        assertEquals(AuthPhase.SignIn, expired.phase)
        assertEquals(AuthCopy.SESSION_EXPIRED, expired.banner)

        val offline = reduceAuthUi(
            AuthUiState(phase = AuthPhase.Checking),
            AuthCallResult.Failed(AuthFailureKind.NETWORK),
            AuthApplySource.RESTORE,
            hasSession = true,
        )
        assertEquals(AuthPhase.Offline, offline.phase)
        assertEquals(AuthCopy.OFFLINE_HOLDING, offline.banner)

        val badCode = reduceAuthUi(
            AuthUiState(phase = AuthPhase.TwoFactor),
            AuthCallResult.Failed(AuthFailureKind.TWO_FACTOR_INVALID),
            AuthApplySource.VERIFY,
            hasSession = false,
        )
        assertEquals(AuthPhase.TwoFactor, badCode.phase)
        assertEquals(AuthCopy.forKind(AuthFailureKind.TWO_FACTOR_INVALID), badCode.banner)

        val unsupported = reduceAuthUi(
            AuthUiState(),
            AuthCallResult.TwoFactorRequired(listOf("otp")),
            AuthApplySource.SIGN_IN,
            hasSession = false,
        )
        assertEquals(AuthPhase.SignIn, unsupported.phase)
        assertEquals(AuthCopy.TWO_FACTOR_UNSUPPORTED, unsupported.banner)
    }

    @Test
    fun authSourcesDoNotLogSecretsOrPostASessionRefresh() {
        val authDir = File(moduleDir(), "src/main/java/com/functiongram/app/data/auth")
        val hits = mutableListOf<String>()
        authDir.walkTopDown().filter { it.isFile && it.extension == "kt" }.forEach { file ->
            val text = file.readText()
            if ("HttpLoggingInterceptor" in text) hits += "${file.name}: logging interceptor"
            if ("println" in text) hits += "${file.name}: println"
            text.lineSequence().filter { "Log." in it && !it.trim().startsWith("//") }.forEach { line ->
                val lower = line.lowercase()
                if ("password" in lower || "cookie" in lower || "token" in lower) {
                    hits += "${file.name}: $line"
                }
            }
        }
        val repository = File(authDir, "AuthSessionRepository.kt").readText()
        assertFalse(repository.contains("POST\", path = ApiRoutes.GET_SESSION"))
        assertTrue(repository.contains("ApiRoutes.GET_SESSION"))
        assertTrue(repository.contains("method = \"GET\""))
        assertTrue(hits.joinToString("\n"), hits.isEmpty())
        assertFalse(File(moduleDir(), "src/main/java/com/functiongram/app/data/remote/FunctionGramHttpClient.kt").readText().contains("HttpLoggingInterceptor"))
    }

    private class FakeTransport(
        private val handler: (AuthWireRequest) -> AuthHttpResult,
    ) : AuthTransport {
        override val host: String = "functiongram.vercel.app"
        val calls = mutableListOf<AuthWireRequest>()
        var failTransport: Boolean = false

        override fun execute(request: AuthWireRequest): AuthHttpResult {
            calls += request
            if (failTransport) return AuthHttpResult(status = 0, body = "", transportFailed = true)
            return handler(request)
        }
    }

    private fun moduleDir(): File {
        var dir = File(System.getProperty("user.dir") ?: error("user.dir is unset"))
        repeat(6) {
            if (File(dir, "src/main/AndroidManifest.xml").exists()) return dir
            dir = dir.parentFile ?: return@repeat
        }
        error("app module not found from ${System.getProperty("user.dir")}")
    }

    private object InstantMs {
        const val OCT_7 = 1791347919000L
    }
}
