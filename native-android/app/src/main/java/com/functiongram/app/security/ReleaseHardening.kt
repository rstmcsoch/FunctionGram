package com.functiongram.app.security

import android.app.Application
import android.content.pm.ApplicationInfo
import com.functiongram.app.BuildConfig
import com.functiongram.app.configuration.VariantMarker

object ReleaseHardening {
    fun assertVariant(debugBuild: Boolean, allowsDebugEndpoint: Boolean, claimsDebuggable: Boolean) {
        if (debugBuild) {
            require(allowsDebugEndpoint) { "Debug builds must keep the debug endpoint switch on the debug variant." }
            require(claimsDebuggable) { "Debug builds must be marked debuggable." }
        } else {
            require(!allowsDebugEndpoint) { "Release builds must not allow a debug endpoint fallback." }
            require(!claimsDebuggable) { "Release builds must not be debuggable." }
        }
    }

    fun assertProcess(application: Application) {
        val debuggable = (application.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0
        if (!BuildConfig.DEBUG) {
            check(!debuggable) { "Release process must not be debuggable." }
            check(!VariantMarker.ALLOWS_DEBUG_ENDPOINT) { "Release process must not allow a debug endpoint." }
            check(!VariantMarker.CLAIMS_DEBUGGABLE) { "Release process must not claim to be debuggable." }
        }
    }
}
