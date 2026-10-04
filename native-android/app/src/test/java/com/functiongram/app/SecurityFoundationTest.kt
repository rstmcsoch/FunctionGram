package com.functiongram.app

import com.functiongram.app.configuration.ApiEnvironment
import com.functiongram.app.security.ClientSecretPolicy
import com.functiongram.app.security.DeviceKeyPolicy
import com.functiongram.app.security.Digests
import com.functiongram.app.security.EndpointResolver
import com.functiongram.app.security.IntegrityEvaluator
import com.functiongram.app.security.IntegrityObservation
import com.functiongram.app.security.IntegritySnapshotCodec
import com.functiongram.app.security.IntegrityVerdict
import com.functiongram.app.security.ReleaseCertificatePin
import com.functiongram.app.security.ReleaseHardening
import com.functiongram.app.security.TransportPolicy
import com.functiongram.app.security.toSnapshot
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.w3c.dom.Element
import java.io.File
import javax.xml.parsers.DocumentBuilderFactory

class SecurityFoundationTest {
    @Test
    fun releaseIgnoresDebugEndpointOverride() {
        val origin = EndpointResolver.resolve(
            configuredOrigin = ApiEnvironment.PUBLIC_API_ORIGIN,
            debugBuild = false,
            allowDebugEndpoint = false,
            debugOverride = "http://localhost:3000",
        )
        assertEquals(ApiEnvironment.PUBLIC_API_ORIGIN, origin)
    }

    @Test
    fun releaseRejectsNonProductionOrigin() {
        assertFails {
            EndpointResolver.resolve(
                configuredOrigin = "https://localhost",
                debugBuild = false,
                allowDebugEndpoint = false,
                debugOverride = null,
            )
        }
        assertFails {
            EndpointResolver.resolve(
                configuredOrigin = "http://10.0.2.2:3000",
                debugBuild = false,
                allowDebugEndpoint = false,
                debugOverride = null,
            )
        }
        assertFails {
            EndpointResolver.resolve(
                configuredOrigin = "https://preview.example",
                debugBuild = false,
                allowDebugEndpoint = true,
                debugOverride = null,
            )
        }
    }

    @Test
    fun debugCleartextIsLocalhostOnly() {
        assertEquals(
            "http://localhost:3000",
            EndpointResolver.resolve(
                configuredOrigin = ApiEnvironment.PUBLIC_API_ORIGIN,
                debugBuild = true,
                allowDebugEndpoint = true,
                debugOverride = "http://localhost:3000",
            ),
        )
        assertFails {
            EndpointResolver.resolve(
                configuredOrigin = ApiEnvironment.PUBLIC_API_ORIGIN,
                debugBuild = true,
                allowDebugEndpoint = true,
                debugOverride = "http://10.0.2.2:3000",
            )
        }
        assertFails {
            EndpointResolver.resolve(
                configuredOrigin = ApiEnvironment.PUBLIC_API_ORIGIN,
                debugBuild = true,
                allowDebugEndpoint = true,
                debugOverride = "http://example.com",
            )
        }
    }

    @Test
    fun debugHttpsOverrideStillRejectsSecretsAndAdmin() {
        assertEquals(
            "https://preview.functiongram.dev",
            EndpointResolver.resolve(
                configuredOrigin = ApiEnvironment.PUBLIC_API_ORIGIN,
                debugBuild = true,
                allowDebugEndpoint = true,
                debugOverride = "https://preview.functiongram.dev",
            ),
        )
        assertFails {
            EndpointResolver.resolve(
                configuredOrigin = ApiEnvironment.PUBLIC_API_ORIGIN,
                debugBuild = true,
                allowDebugEndpoint = true,
                debugOverride = "libsql://example.invalid",
            )
        }
        assertFails {
            EndpointResolver.resolve(
                configuredOrigin = ApiEnvironment.PUBLIC_API_ORIGIN,
                debugBuild = true,
                allowDebugEndpoint = true,
                debugOverride = "https://functiongram.vercel.app/admin-panel",
            )
        }
    }

    @Test
    fun rejectsKeyMaterialAndServerAssignments() {
        assertTrue(ClientSecretPolicy.containsBackendSecret("-----BEGIN PRIVATE KEY-----\nMIIB\n-----END PRIVATE KEY-----"))
        assertTrue(ClientSecretPolicy.containsBackendSecret("postgres://user:pass@host/db"))
        assertTrue(ClientSecretPolicy.containsBackendSecret("TURSO_AUTH_TOKEN=not-a-real-value"))
        assertTrue(ClientSecretPolicy.containsBackendSecret("BREVO_API_KEY=not-a-real-value"))
        assertTrue(
            ClientSecretPolicy.containsBackendSecret(
                """{"type":"service_account","private_key":"not-real","client_email":"a@b.c"}""",
            ),
        )
        assertFalse(ClientSecretPolicy.containsBackendSecret(ApiEnvironment.PUBLIC_API_ORIGIN))
        assertTrue(ClientSecretPolicy.looksLikeAdminSurface("https://functiongram.vercel.app/api/admin/users"))
    }

    @Test
    fun strongBoxAbsenceIsNotARejection() {
        assertFalse(DeviceKeyPolicy.requireStrongBox())
        assertFalse(DeviceKeyPolicy.requestStrongBox(strongBoxPresent = false))
        assertTrue(DeviceKeyPolicy.requestStrongBox(strongBoxPresent = true))
    }

    @Test
    fun integrityVerdictIsASignalNotAGuarantee() {
        val base = IntegrityObservation(
            packageName = "com.functiongram.app",
            expectedPackageName = "com.functiongram.app",
            debuggable = false,
            debugBuild = false,
            certificateSha256 = listOf("abc123"),
            expectedReleaseCertificates = emptySet(),
            installer = null,
        )
        assertEquals(IntegrityVerdict.SIGNAL_ONLY, IntegrityEvaluator.evaluate(base))
        assertEquals(
            IntegrityVerdict.UNEXPECTED,
            IntegrityEvaluator.evaluate(base.copy(debuggable = true)),
        )
        assertEquals(
            IntegrityVerdict.UNEXPECTED,
            IntegrityEvaluator.evaluate(base.copy(packageName = "com.example.other")),
        )
        assertEquals(
            IntegrityVerdict.SIGNAL_ONLY,
            IntegrityEvaluator.evaluate(base.copy(debugBuild = true, debuggable = true)),
        )
        assertEquals(
            IntegrityVerdict.CONSISTENT,
            IntegrityEvaluator.evaluate(base.copy(expectedReleaseCertificates = setOf("ABC123"))),
        )
        assertEquals(
            IntegrityVerdict.UNEXPECTED,
            IntegrityEvaluator.evaluate(base.copy(expectedReleaseCertificates = setOf("deadbeef"))),
        )
        assertTrue(ReleaseCertificatePin.sha256Hex.isEmpty())
        val json = IntegritySnapshotCodec.encode(base.toSnapshot(IntegrityVerdict.SIGNAL_ONLY))
        assertTrue(json.contains("signals only"))
        assertFalse(json.contains("BEGIN PRIVATE KEY"))
        assertFalse(json.contains("TURSO_"))
    }

    @Test
    fun transportPolicyBlocksCleartextOutsideDebugLocalhost() {
        assertTrue(TransportPolicy.allows("https://functiongram.vercel.app/api/health", debugBuild = false, allowDebugEndpoint = false))
        assertFalse(TransportPolicy.allows("http://functiongram.vercel.app/api/health", debugBuild = false, allowDebugEndpoint = false))
        assertFalse(TransportPolicy.allows("http://localhost:3000/api/health", debugBuild = false, allowDebugEndpoint = false))
        assertTrue(TransportPolicy.allows("http://localhost:3000/api/health", debugBuild = true, allowDebugEndpoint = true))
        assertFalse(TransportPolicy.allows("http://10.0.2.2:3000/api/health", debugBuild = true, allowDebugEndpoint = true))
        assertFalse(TransportPolicy.allows("https://functiongram.vercel.app/api/admin", debugBuild = true, allowDebugEndpoint = true))
    }

    @Test
    fun variantFlagsMatchTheTestBuild() {
        ReleaseHardening.assertVariant(
            debugBuild = BuildConfig.DEBUG,
            allowsDebugEndpoint = com.functiongram.app.configuration.VariantMarker.ALLOWS_DEBUG_ENDPOINT,
            claimsDebuggable = com.functiongram.app.configuration.VariantMarker.CLAIMS_DEBUGGABLE,
        )
        if (BuildConfig.DEBUG) {
            assertTrue(com.functiongram.app.configuration.VariantMarker.ALLOWS_DEBUG_ENDPOINT)
            assertEquals("debug", BuildConfig.SIGNING_PROFILE)
        } else {
            assertFalse(com.functiongram.app.configuration.VariantMarker.ALLOWS_DEBUG_ENDPOINT)
            assertFalse(com.functiongram.app.configuration.VariantMarker.CLAIMS_DEBUGGABLE)
            when (BuildConfig.SIGNING_PROFILE) {
                "release-keystore-required" -> Unit
                "debug-keystore-not-production" ->
                    assertTrue(BuildConfig.VERSION_NAME.endsWith("-nonprod"))
                else -> throw AssertionError("Unexpected signing profile ${BuildConfig.SIGNING_PROFILE}")
            }
            assertEquals(ApiEnvironment.PUBLIC_API_ORIGIN, ApiEnvironment.resolvedOrigin())
        }
    }

    @Test
    fun sha256EmptyVector() {
        assertEquals(
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
            Digests.sha256Hex(byteArrayOf()),
        )
        assertTrue(Digests.equal("same".encodeToByteArray(), "same".encodeToByteArray()))
        assertFalse(Digests.equal("same".encodeToByteArray(), "other".encodeToByteArray()))
    }

    @Test
    fun manifestIsMinimalAndComponentsDeclareExported() {
        val manifest = File(moduleDir(), "src/main/AndroidManifest.xml")
        val factory = DocumentBuilderFactory.newInstance().apply { isNamespaceAware = true }
        val doc = factory.newDocumentBuilder().parse(manifest)
        val androidNs = "http://schemas.android.com/apk/res/android"
        val permissions = doc.getElementsByTagName("uses-permission")
        val names = (0 until permissions.length).map {
            (permissions.item(it) as Element).getAttributeNS(androidNs, "name")
        }
        assertEquals(listOf("android.permission.INTERNET", "android.permission.POST_NOTIFICATIONS"), names)
        val application = doc.getElementsByTagName("application").item(0) as Element
        assertEquals("false", application.getAttributeNS(androidNs, "allowBackup"))
        assertEquals("false", application.getAttributeNS(androidNs, "usesCleartextTraffic"))
        assertTrue(application.getAttributeNS(androidNs, "networkSecurityConfig").isNotEmpty())
        assertTrue(application.getAttributeNS(androidNs, "dataExtractionRules").isNotEmpty())
        assertTrue(application.getAttribute("android:debuggable").isEmpty())
        listOf("activity", "service", "receiver", "provider").forEach { tag ->
            val nodes = doc.getElementsByTagName(tag)
            for (i in 0 until nodes.length) {
                val node = nodes.item(i) as Element
                assertTrue("$tag missing exported", node.hasAttributeNS(androidNs, "exported"))
            }
        }
    }

    @Test
    fun releaseNetworkConfigBlocksCleartextAndUserCas() {
        val release = File(moduleDir(), "src/release/res/xml/network_security_config.xml").readText()
        val debug = File(moduleDir(), "src/debug/res/xml/network_security_config.xml").readText()
        assertFalse(release.contains("cleartextTrafficPermitted=\"true\""))
        assertFalse(release.contains("src=\"user\""))
        assertTrue(release.contains("cleartextTrafficPermitted=\"false\""))
        assertTrue(release.contains("src=\"system\""))
        assertTrue(debug.contains("localhost"))
        assertTrue(debug.contains("src=\"user\""))
        assertFalse(debug.contains("10.0.2.2"))
    }

    @Test
    fun gradleReleaseIsNotDebuggableAndHasNoSigningSecret() {
        val gradle = File(moduleDir(), "build.gradle.kts").readText()
        assertTrue(gradle.contains("isDebuggable = false"))
        assertTrue(gradle.contains("isMinifyEnabled = true"))
        assertTrue(gradle.contains("isShrinkResources = true"))
        assertTrue(gradle.contains("verifyReleaseSigning"))
        assertTrue(gradle.contains("nonProductionRelease"))
        assertTrue(gradle.contains("armeabi-v7a"))
        assertTrue(gradle.contains("arm64-v8a"))
        assertTrue(gradle.contains("x86_64"))
        assertFalse(Regex("(?i)(store|key)password\\s*[=:]\\s*\"[^\"]+\"").containsMatchIn(gradle))
        assertFalse(gradle.contains("BEGIN "))
        val release = gradle.substringAfter("\n        release {").substringBefore("create(\"nonProductionRelease\")")
        assertFalse(release.contains("getByName(\"debug\")"))
        assertFalse(release.contains("DEBUG_API_ORIGIN"))
        assertTrue(release.contains("release-keystore-required"))
        assertTrue(gradle.contains("DEBUG_API_ORIGIN"))
        val nonProd = gradle.substringAfter("create(\"nonProductionRelease\")")
        assertTrue(nonProd.contains("signingConfigs.getByName(\"debug\")"))
    }

    @Test
    fun signingInputsAreGitignoredAndExampleHasNoSecret() {
        val nativeRoot = moduleDir().parentFile ?: error("native-android directory missing")
        val repoRoot = nativeRoot.parentFile ?: error("repository root missing")
        val nativeIgnore = File(nativeRoot, ".gitignore").readText()
        assertTrue(nativeIgnore.contains("*.jks"))
        assertTrue(nativeIgnore.contains("*.keystore"))
        assertTrue(nativeIgnore.contains("keystore.properties"))
        val rootIgnore = File(repoRoot, ".gitignore").readText()
        assertTrue(rootIgnore.contains("*.jks"))
        assertTrue(rootIgnore.contains("keystore.properties"))
        val example = File(nativeRoot, "keystore.properties.example").readText()
        listOf("storeFile", "storePassword", "keyAlias", "keyPassword").forEach { key ->
            val line = example.lineSequence().first { it.startsWith("$key=") }
            assertTrue(line.removePrefix("$key=").isBlank())
        }
        val script = File(nativeRoot, "scripts/verify-release-apk.sh").readText()
        assertTrue(script.contains("PRODUCTION=\"false\""))
        assertTrue(script.contains("FUNCTIONGRAM_PRODUCTION_CERT_SHA256"))
        assertTrue(script.contains("exit 2"))
        assertFalse(File(nativeRoot, "keystore.properties").exists())
        assertTrue(ReleaseCertificatePin.sha256Hex.isEmpty())
    }

    @Test
    fun sourcesDoNotEmbedServerCredentialsOrABrowserView() {
        val forbidden = listOf(
            "libsql://",
            "postgres://",
            "postgresql://",
            "mysql://",
            "xkeysib-",
            "BEGIN PRIVATE KEY",
            "BEGIN RSA PRIVATE KEY",
            "BEGIN OPENSSH PRIVATE KEY",
            "service_account",
            "private_key_id",
            "TURSO_",
            "BREVO_",
            "BETTER_AUTH_SECRET",
            "BLOB_READ_WRITE_TOKEN",
            "FIREBASE_",
            "firebase-adminsdk",
            "ADMIN_SECRET",
            "GOOGLE_APPLICATION_CREDENTIALS",
            "storePassword",
            "keyPassword",
            "google-services.json",
        )
        val browser = listOf("android.webkit", "WebView")
        val roots = listOf(
            File(moduleDir(), "src/main"),
            File(moduleDir(), "src/debug"),
            File(moduleDir(), "src/release"),
            File(moduleDir(), "proguard-rules.pro"),
        )
        val hits = mutableListOf<String>()
        roots.forEach { walk(it) { file ->
            if (!file.isFile || file.extension.lowercase() !in TEXT) return@walk
            val text = file.readText()
            forbidden.forEach { needle ->
                if (needle in text) hits += "${file.path}: $needle"
            }
            val code = text.lineSequence().filter { line ->
                val trimmed = line.trim()
                !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*")
            }.joinToString("\n")
            browser.forEach { needle ->
                if (needle in code) hits += "${file.path}: $needle"
            }
        } }
        val gradleText = File(moduleDir(), "build.gradle.kts").readText()
        forbidden.filter { it != "storePassword" && it != "keyPassword" }.forEach { needle ->
            if (needle in gradleText) hits += "build.gradle.kts: $needle"
        }
        assertTrue(hits.joinToString("\n"), hits.isEmpty())
        assertFalse(File(moduleDir(), "google-services.json").exists())
        assertFalse(File(moduleDir().parentFile, "google-services.json").exists())
    }

    private fun assertFails(block: () -> Unit) {
        try {
            block()
        } catch (expected: IllegalArgumentException) {
            return
        }
        throw AssertionError("Expected IllegalArgumentException")
    }

    private fun moduleDir(): File {
        var dir = File(System.getProperty("user.dir") ?: error("user.dir is unset"))
        repeat(6) {
            if (File(dir, "src/main/AndroidManifest.xml").exists()) return dir
            dir = dir.parentFile ?: return@repeat
        }
        error("app module not found from ${System.getProperty("user.dir")}")
    }

    private fun walk(file: File, visitor: (File) -> Unit) {
        if (!file.exists()) return
        if (file.isDirectory) {
            if (file.name == "build") return
            file.listFiles()?.forEach { walk(it, visitor) }
        } else {
            visitor(file)
        }
    }

    private companion object {
        val TEXT = setOf("kt", "kts", "xml", "pro", "properties", "txt", "md", "json", "gradle")
    }
}
