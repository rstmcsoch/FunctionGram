package com.functiongram.app.push

object PushEvents {
    @Volatile
    var listener: ((String) -> Unit)? = null

    fun publish(token: String) {
        listener?.invoke(token)
    }
}
