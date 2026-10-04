# Phase 1 does not minify. These rules are the release skeleton for the HTTP layer.
-dontwarn okhttp3.**
-dontwarn okio.**
-keep class com.functiongram.app.data.remote.** { *; }
-keep class com.functiongram.app.configuration.** { *; }
