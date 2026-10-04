package com.functiongram.app.push

object PushToken {
    private val pattern = Regex("^[A-Za-z0-9:_.\\-]{20,4096}$")

    fun isValid(value: String): Boolean = pattern.matches(value.trim())
}
