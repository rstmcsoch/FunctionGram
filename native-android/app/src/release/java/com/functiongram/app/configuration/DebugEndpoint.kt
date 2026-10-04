package com.functiongram.app.configuration

/** Release builds have no debug origin field and no fallback. */
object DebugEndpoint {
    fun overrideOrNull(): String? = null
}
