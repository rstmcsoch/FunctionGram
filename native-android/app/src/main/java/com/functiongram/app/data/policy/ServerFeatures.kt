package com.functiongram.app.data.policy

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.longOrNull

/**
 * Viewer flags from `GET /api/social` `features`, matching `FEATURE_KEYS` in
 * `lib/features.ts`. The admin Features screen writes the same document.
 * Absent or unreadable keys stay off. This client does not invent rollouts.
 */
data class ServerFeatures(
    val reels: Boolean = false,
    val stories: Boolean = false,
    val explore: Boolean = false,
    val search: Boolean = false,
    val messages: Boolean = false,
    val notifications: Boolean = false,
    val comments: Boolean = false,
    val likes: Boolean = false,
    val saves: Boolean = false,
    val shares: Boolean = false,
    val follow: Boolean = false,
    val reports: Boolean = false,
    val uploads: Boolean = false,
    val signups: Boolean = false,
    val guestBrowsing: Boolean = false,
    val privateAccounts: Boolean = false,
    val tagging: Boolean = false,
    val postEditing: Boolean = false,
    val messageDeletion: Boolean = false,
    val messageSearch: Boolean = false,
    val readReceipts: Boolean = false,
    val emojiPicker: Boolean = false,
    val messageReplies: Boolean = false,
    val messageReactions: Boolean = false,
    val messageEditing: Boolean = false,
    val messageForwarding: Boolean = false,
    val messagePinning: Boolean = false,
    val messageSaving: Boolean = false,
    val disappearingMessages: Boolean = false,
    val voiceMessages: Boolean = false,
    val fileMessages: Boolean = false,
    val gifMessages: Boolean = false,
    val stickerMessages: Boolean = false,
    val chatThemes: Boolean = false,
    val messageTyping: Boolean = false,
) {
    fun isEnabled(key: String): Boolean = when (key) {
        "reels" -> reels
        "stories" -> stories
        "explore" -> explore
        "search" -> search
        "messages" -> messages
        "notifications" -> notifications
        "comments" -> comments
        "likes" -> likes
        "saves" -> saves
        "shares" -> shares
        "follow" -> follow
        "reports" -> reports
        "uploads" -> uploads
        "signups" -> signups
        "guestBrowsing" -> guestBrowsing
        "privateAccounts" -> privateAccounts
        "tagging" -> tagging
        "postEditing" -> postEditing
        "messageDeletion" -> messageDeletion
        "messageSearch" -> messageSearch
        "readReceipts" -> readReceipts
        "emojiPicker" -> emojiPicker
        "messageReplies" -> messageReplies
        "messageReactions" -> messageReactions
        "messageEditing" -> messageEditing
        "messageForwarding" -> messageForwarding
        "messagePinning" -> messagePinning
        "messageSaving" -> messageSaving
        "disappearingMessages" -> disappearingMessages
        "voiceMessages" -> voiceMessages
        "fileMessages" -> fileMessages
        "gifMessages" -> gifMessages
        "stickerMessages" -> stickerMessages
        "chatThemes" -> chatThemes
        "messageTyping" -> messageTyping
        else -> false
    }

    companion object {
        /** Keys that exist in `lib/features.ts` FEATURE_KEYS. */
        val KEYS: List<String> = listOf(
            "reels", "stories", "explore", "search", "messages", "notifications",
            "comments", "likes", "saves", "shares", "follow", "reports", "uploads",
            "signups", "guestBrowsing", "privateAccounts", "tagging", "postEditing",
            "messageDeletion", "messageSearch", "readReceipts", "emojiPicker",
            "messageReplies", "messageReactions", "messageEditing", "messageForwarding",
            "messagePinning", "messageSaving", "disappearingMessages", "voiceMessages",
            "fileMessages", "gifMessages", "stickerMessages", "chatThemes", "messageTyping",
        )

        fun parse(element: JsonElement?): ServerFeatures {
            val objectItem = element as? JsonObject ?: return ServerFeatures()
            return ServerFeatures(
                reels = flag(objectItem["reels"]),
                stories = flag(objectItem["stories"]),
                explore = flag(objectItem["explore"]),
                search = flag(objectItem["search"]),
                messages = flag(objectItem["messages"]),
                notifications = flag(objectItem["notifications"]),
                comments = flag(objectItem["comments"]),
                likes = flag(objectItem["likes"]),
                saves = flag(objectItem["saves"]),
                shares = flag(objectItem["shares"]),
                follow = flag(objectItem["follow"]),
                reports = flag(objectItem["reports"]),
                uploads = flag(objectItem["uploads"]),
                signups = flag(objectItem["signups"]),
                guestBrowsing = flag(objectItem["guestBrowsing"]),
                privateAccounts = flag(objectItem["privateAccounts"]),
                tagging = flag(objectItem["tagging"]),
                postEditing = flag(objectItem["postEditing"]),
                messageDeletion = flag(objectItem["messageDeletion"]),
                messageSearch = flag(objectItem["messageSearch"]),
                readReceipts = flag(objectItem["readReceipts"]),
                emojiPicker = flag(objectItem["emojiPicker"]),
                messageReplies = flag(objectItem["messageReplies"]),
                messageReactions = flag(objectItem["messageReactions"]),
                messageEditing = flag(objectItem["messageEditing"]),
                messageForwarding = flag(objectItem["messageForwarding"]),
                messagePinning = flag(objectItem["messagePinning"]),
                messageSaving = flag(objectItem["messageSaving"]),
                disappearingMessages = flag(objectItem["disappearingMessages"]),
                voiceMessages = flag(objectItem["voiceMessages"]),
                fileMessages = flag(objectItem["fileMessages"]),
                gifMessages = flag(objectItem["gifMessages"]),
                stickerMessages = flag(objectItem["stickerMessages"]),
                chatThemes = flag(objectItem["chatThemes"]),
                messageTyping = flag(objectItem["messageTyping"]),
            )
        }

        private fun flag(element: JsonElement?): Boolean {
            val primitive = element as? JsonPrimitive ?: return false
            primitive.booleanOrNull?.let { return it }
            primitive.longOrNull?.let { return it != 0L }
            return primitive.contentOrNull.equals("true", ignoreCase = true) ||
                primitive.contentOrNull == "1"
        }
    }
}
