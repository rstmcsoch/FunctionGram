plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("org.jetbrains.kotlin.plugin.serialization")
}

android {
    namespace = "com.functiongram.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.functiongram.app"
        minSdk = 28
        targetSdk = 36
        versionCode = 2
        versionName = "0.2.0-phase2"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        // Pure Kotlin today. These ABIs match androidx.graphics:graphics-path.
        // This app does not ship its own JNI.
        ndk {
            abiFilters += listOf("armeabi-v7a", "arm64-v8a", "x86", "x86_64")
        }

        // Public website origin only. Never a database URL or server secret.
        buildConfigField("String", "API_BASE_URL", "\"https://functiongram.vercel.app\"")
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
            isDebuggable = false
            isJniDebuggable = false
            isMinifyEnabled = true
            isShrinkResources = true
            // Skeleton only. AGP's debug keystore lets this phase assemble a minified APK.
            // It is not a production signing key and must be replaced before any store upload.
            signingConfig = signingConfigs.getByName("debug")
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
            buildConfigField("String", "API_BASE_URL", "\"https://functiongram.vercel.app\"")
            buildConfigField("String", "SIGNING_PROFILE", "\"debug-keystore-not-production\"")
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
    implementation("androidx.navigation:navigation-compose:2.8.9")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.8.1")

    debugImplementation("androidx.compose.ui:ui-tooling")
    testImplementation("junit:junit:4.13.2")
}
