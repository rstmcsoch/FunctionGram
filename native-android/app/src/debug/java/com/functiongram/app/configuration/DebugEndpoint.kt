package com.functiongram.app.configuration

import com.functiongram.app.BuildConfig

/**
 * Optional debug-only origin. The committed value is empty.
 * A local change may use http://localhost:<port> or another public HTTPS host.
 * Never put a server credential in that field. Release has no equivalent.
 */
object DebugEndpoint {
    fun overrideOrNull(): String? = BuildConfig.DEBUG_API_ORIGIN.trim().ifEmpty { null }
}
