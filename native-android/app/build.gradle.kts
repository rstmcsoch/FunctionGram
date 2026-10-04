plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("org.jetbrains.kotlin.plugin.serialization")
}

import java.util.Properties

/**
 * Release signing material. Values come from the environment or from the
 * gitignored file native-android/keystore.properties. Nothing in this file
 * is a keystore password, and the debug keystore is not a release fallback.
 */
data class ReleaseSigningCredentials(
    val storeFile: String,
    val storeSecret: String,
    val alias: String,
    val keySecret: String,
)

fun loadReleaseSigning(projectDir: File): ReleaseSigningCredentials? {
    val props = Properties()
    val localFile = File(projectDir, "keystore.properties")
    if (localFile.isFile) {
        localFile.inputStream().use { props.load(it) }
    }
    val externalPath = System.getenv("FUNCTIONGRAM_RELEASE_SIGNING_FILE")?.trim().orEmpty()
    if (externalPath.isNotEmpty()) {
        val external = File(externalPath)
        if (!external.isFile) {
            throw GradleException(
                "FUNCTIONGRAM_RELEASE_SIGNING_FILE does not point at a file. " +
                    "Refusing to sign a release build with the debug keystore.",
            )
        }
        external.inputStream().use { props.load(it) }
    }
    fun value(envName: String, propName: String): String? {
        val fromEnv = System.getenv(envName)?.trim()?.takeIf { it.isNotEmpty() }
        if (fromEnv != null) return fromEnv
        return props.getProperty(propName)?.trim()?.takeIf { it.isNotEmpty() }
    }
    val resolved = listOf(
        "storeFile" to value("FUNCTIONGRAM_RELEASE_STORE_FILE", "storeFile"),
        "storePassword" to value("FUNCTIONGRAM_RELEASE_STORE_PASSWORD", "storePassword"),
        "keyAlias" to value("FUNCTIONGRAM_RELEASE_KEY_ALIAS", "keyAlias"),
        "keyPassword" to value("FUNCTIONGRAM_RELEASE_KEY_PASSWORD", "keyPassword"),
    )
    val present = resolved.filter { it.second != null }
    val missing = resolved.filter { it.second == null }.map { it.first }
    if (present.isEmpty()) return null
    if (missing.isNotEmpty()) {
        throw GradleException(
            "Incomplete release signing configuration. Missing ${missing.joinToString()} " +
                "(names only; values are not logged). " +
                "assembleRelease will not fall back to the debug keystore. " +
                "Use :app:assembleNonProductionRelease for a minified debug-signed APK.",
        )
    }
    return ReleaseSigningCredentials(
        storeFile = resolved.first { it.first == "storeFile" }.second!!,
        storeSecret = resolved.first { it.first == "storePassword" }.second!!,
        alias = resolved.first { it.first == "keyAlias" }.second!!,
        keySecret = resolved.first { it.first == "keyPassword" }.second!!,
    )
}

fun resolveStoreFile(projectDir: File, path: String): File {
    val raw = File(path)
    return if (raw.isAbsolute) raw else File(projectDir, path)
}

val releaseCredentials = loadReleaseSigning(rootProject.projectDir)

android {
    namespace = "com.functiongram.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.functiongram.app"
        minSdk = 28
        targetSdk = 36
        versionCode = 5
        versionName = "0.5.0-phase5"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        // Pure Kotlin today. These ABIs match androidx.graphics:graphics-path.
        // This app does not ship its own JNI. Universal APK keeps all four.
        ndk {
            abiFilters += listOf("armeabi-v7a", "arm64-v8a", "x86", "x86_64")
        }

        // Public website origin only. Never a database URL or server secret.
        buildConfigField("String", "API_BASE_URL", "\"https://functiongram.vercel.app\"")
    }

    signingConfigs {
        if (releaseCredentials != null) {
            create("release") {
                val store = resolveStoreFile(rootProject.projectDir, releaseCredentials.storeFile)
                storeFile = store
                storePassword = releaseCredentials.storeSecret
                keyAlias = releaseCredentials.alias
                keyPassword = releaseCredentials.keySecret
            }
        }
    }

    buildTypes {
        debug {
            isDebuggable = true
            isMinifyEnabled = false
            isShrinkResources = false
            isJniDebuggable = false
            versionNameSuffix = "-debug"
            buildConfigField("String", "API_BASE_URL", "\"https://functiongram.vercel.app\"")
            // Empty in git. A local edit may point at http://localhost:<port> or another HTTPS host.
            buildConfigField("String", "DEBUG_API_ORIGIN", "\"\"")
            buildConfigField("String", "SIGNING_PROFILE", "\"debug\"")
        }
        release {
            // Release is not a debuggable process. Debug endpoint overrides do not exist on this variant.
            // There is no debug-keystore fallback. packageRelease fails closed unless a release
            // keystore was supplied from the environment or keystore.properties.
            isDebuggable = false
            isJniDebuggable = false
            isMinifyEnabled = true
            isShrinkResources = true
            if (releaseCredentials != null) {
                signingConfig = signingConfigs.getByName("release")
            } else {
                // Explicitly unsigned until verifyReleaseSigning fails the release tasks.
                // Do not assign the debug signing config here.
                signingConfig = null
            }
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
            buildConfigField("String", "API_BASE_URL", "\"https://functiongram.vercel.app\"")
            // Means the variant requires an external release keystore. It does not mean
            // this compilation was signed, and it does not name a production certificate.
            buildConfigField("String", "SIGNING_PROFILE", "\"release-keystore-required\"")
        }
        // Minified, not debuggable, debug-signed. Explicitly not a production artifact.
        create("nonProductionRelease") {
            initWith(getByName("release"))
            matchingFallbacks += listOf("release")
            signingConfig = signingConfigs.getByName("debug")
            versionNameSuffix = "-nonprod"
            buildConfigField("String", "SIGNING_PROFILE", "\"debug-keystore-not-production\"")
        }
    }

    sourceSets {
        getByName("nonProductionRelease") {
            // Same release-only sources (network config, VariantMarker). Not a debug variant.
            java.srcDir("src/release/java")
            res.srcDir("src/release/res")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

val verifyReleaseSigning = tasks.register("verifyReleaseSigning") {
    group = "verification"
    description = "Fails release packaging when no release keystore is configured. Does not print secrets."
    doLast {
        val creds = loadReleaseSigning(rootProject.projectDir)
        if (creds == null) {
            throw GradleException(
                """
                assembleRelease refuses to build without a release keystore.
                The Android debug keystore is not used for this task.
                Set all of FUNCTIONGRAM_RELEASE_STORE_FILE, FUNCTIONGRAM_RELEASE_STORE_PASSWORD,
                FUNCTIONGRAM_RELEASE_KEY_ALIAS, and FUNCTIONGRAM_RELEASE_KEY_PASSWORD,
                or provide gitignored native-android/keystore.properties
                (storeFile, storePassword, keyAlias, keyPassword).
                See native-android/keystore.properties.example and native-android/SIGNING.md.
                For a minified APK signed with the debug certificate, run :app:assembleNonProductionRelease.
                That artifact is not production-signed.
                """.trimIndent(),
            )
        }
        val store = resolveStoreFile(rootProject.projectDir, creds.storeFile)
        if (!store.isFile) {
            throw GradleException(
                "Release keystore file does not exist at ${store.absolutePath}. " +
                    "Refusing to sign the release build with the debug keystore.",
            )
        }
    }
}

tasks.register("extractReleaseArtifactFingerprint") {
    group = "verification"
    description = "Checksum and signer fingerprint for app-release.apk, only when that file exists."
    val apkProvider = layout.buildDirectory.file("outputs/apk/release/app-release.apk")
    val reportProvider = layout.buildDirectory.file("outputs/signing/release-apk-fingerprint.txt")
    val script = rootProject.file("scripts/verify-release-apk.sh")
    doLast {
        val apk = apkProvider.get().asFile
        val report = reportProvider.get().asFile
        if (!apk.isFile) {
            if (report.exists()) report.delete()
            logger.lifecycle(
                "No release APK at ${apk.path}. Skipping checksum and fingerprint extraction. " +
                    "This is not a production signature.",
            )
            return@doLast
        }
        report.parentFile.mkdirs()
        val result = providers.exec {
            commandLine("bash", script.absolutePath, apk.absolutePath, report.absolutePath)
            isIgnoreExitValue = true
        }.result.get()
        if (result.exitValue == 2) {
            if (report.exists()) report.delete()
            logger.lifecycle("No signed artifact. Skipping fingerprint extraction.")
            return@doLast
        }
        if (result.exitValue != 0) {
            if (report.exists()) report.delete()
            throw GradleException(
                "Signature verification failed for ${apk.path}. No fingerprint file was kept.",
            )
        }
        logger.lifecycle(
            "Wrote ${report.path}. productionSigned is true only if FUNCTIONGRAM_PRODUCTION_CERT_SHA256 matches. " +
                "This repository does not contain a production certificate.",
        )
    }
}

tasks.configureEach {
    if (name == "packageRelease" || name == "assembleRelease" || name == "bundleRelease" || name == "signRelease") {
        dependsOn(verifyReleaseSigning)
    }
    if (name == "assembleRelease") {
        finalizedBy("extractReleaseArtifactFingerprint")
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2025.08.00")
    implementation(composeBom)
    androidTestImplementation(composeBom)

    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.activity:activity-compose:1.10.1")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.7")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.navigation:navigation-compose:2.8.9")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.8.1")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.1")
    implementation("androidx.lifecycle:lifecycle-viewmodel-ktx:2.8.7")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("androidx.security:security-crypto:1.0.0")

    debugImplementation("androidx.compose.ui:ui-tooling")
    testImplementation("junit:junit:4.13.2")
}
