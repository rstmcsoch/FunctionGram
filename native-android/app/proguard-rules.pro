# Release uses R8 (minify + resource shrinking). Do not keep the whole app.
# Compose and OkHttp ship consumer rules. Rules below cover this module's
# kotlinx.serialization models and the usual missing optional TLS providers.

-keepattributes Signature,InnerClasses,EnclosingMethod,RuntimeVisibleAnnotations,RuntimeVisibleParameterAnnotations,AnnotationDefault

-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**
-dontwarn javax.annotation.**

# kotlinx.serialization consumer rules also apply. Keep this module's generated serializers.
-if @kotlinx.serialization.Serializable class **
-keepclassmembers class <1> {
    static <1>$Companion Companion;
}

-if @kotlinx.serialization.Serializable class ** {
    kotlinx.serialization.KSerializer serializer(...);
}
-keepclassmembers class <1> {
    kotlinx.serialization.KSerializer serializer(...);
}

-keepclassmembers class com.functiongram.app.security.IntegritySnapshot {
    *** Companion;
    kotlinx.serialization.KSerializer serializer(...);
}
-keep,includedescriptorclasses class com.functiongram.app.security.IntegritySnapshot$$serializer { *; }
-keep,includedescriptorclasses class com.functiongram.app.security.IntegritySnapshot$Companion { *; }
