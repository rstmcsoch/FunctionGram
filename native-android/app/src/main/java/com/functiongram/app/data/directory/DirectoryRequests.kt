package com.functiongram.app.data.directory

import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

/**
 * JSON bodies for existing social and Better Auth routes.
 * The server decides whether the signed-in account may make the change.
 */
object DirectoryRequests {
    private val json = Json { encodeDefaults = true; explicitNulls = false }

    const val EMAIL_CALLBACK = "/verify-email?changed=1"
    const val DELETE_CALLBACK = "/verify-email?deleted=1"

    fun setPrivacy(privateAccount: Boolean): String =
        json.encodeToString(PrivacyBody(action = "set_privacy", privateAccount = privateAccount))

    fun readNotifications(): String =
        json.encodeToString(ActionBody(action = "read_notifications"))

    fun follow(id: String, active: Boolean): String {
        requireId(id)
        return json.encodeToString(ActiveBody(action = "follow", id = id, active = active))
    }

    fun block(id: String): String {
        requireId(id)
        return json.encodeToString(IdBody(action = "block", id = id))
    }

    fun unblock(id: String): String {
        requireId(id)
        return json.encodeToString(IdBody(action = "unblock", id = id))
    }

    fun reportProfile(targetId: String, viewerId: String, reason: String, details: String): String {
        requireId(targetId)
        require(targetId != viewerId) { "You cannot report your own profile." }
        require(ReportReasons.allowed(reason)) { DirectoryCopy.REPORT_REASON }
        val trimmed = details.trim()
        require(trimmed.length <= 1000) { DirectoryCopy.LENGTH }
        return json.encodeToString(
            ReportBody(
                action = "report",
                targetType = "profile",
                targetId = targetId,
                reason = reason,
                details = trimmed,
            ),
        )
    }

    fun updateProfile(
        username: String,
        name: String,
        bio: String,
        website: String,
        avatar: String,
    ): String {
        val normalized = username.trim().lowercase()
        val usernameError = ProfilePaths.usernameError(normalized)
        require(usernameError == null) { usernameError ?: DirectoryCopy.USERNAME_RULE }
        val trimmedName = name.trim()
        require(trimmedName.isNotEmpty() && trimmedName.length <= 60) {
            if (trimmedName.isEmpty()) DirectoryCopy.REQUIRED else DirectoryCopy.LENGTH
        }
        val trimmedBio = bio.trim()
        require(trimmedBio.length <= 150) { DirectoryCopy.LENGTH }
        val trimmedSite = website.trim()
        val siteError = DirectoryDerive.websiteError(trimmedSite)
        require(siteError == null) { siteError ?: DirectoryCopy.WEBSITE_INVALID }
        val trimmedAvatar = avatar.trim()
        require(trimmedAvatar.isEmpty() || trimmedAvatar.startsWith("/api/media/")) {
            "Please upload a profile photo."
        }
        require(trimmedAvatar.length <= 200) { DirectoryCopy.LENGTH }
        return json.encodeToString(
            ProfileBody(
                action = "profile",
                username = normalized,
                name = trimmedName,
                bio = trimmedBio,
                website = trimmedSite,
                avatar = trimmedAvatar,
            ),
        )
    }

    fun createCollection(name: String): String {
        val trimmed = name.trim()
        require(trimmed.length >= 2) { DirectoryCopy.COLLECTION_NAME }
        require(trimmed.length <= 40) { DirectoryCopy.LENGTH }
        return json.encodeToString(CollectionBody(action = "create_collection", name = trimmed))
    }

    fun deleteCollection(id: String): String {
        requireId(id)
        return json.encodeToString(IdBody(action = "delete_collection", id = id))
    }

    fun changeEmail(address: String): String {
        val trimmed = address.trim()
        require(trimmed.length in 3..254 && '@' in trimmed && ' ' !in trimmed && '\n' !in trimmed) {
            DirectoryCopy.EMAIL
        }
        return json.encodeToString(ChangeEmailBody(newEmail = trimmed, callbackURL = EMAIL_CALLBACK))
    }

    fun deleteAccount(): String =
        json.encodeToString(DeleteAccountBody(callbackURL = DELETE_CALLBACK))

    private fun requireId(id: String) {
        require(id.isNotBlank() && id.length <= 100 && id.none { it.isISOControl() || it == '/' || it == '\\' }) {
            DirectoryCopy.REQUIRED
        }
    }

    @Serializable
    private data class ActionBody(val action: String)

    @Serializable
    private data class PrivacyBody(
        val action: String,
        @kotlinx.serialization.SerialName("private") val privateAccount: Boolean,
    )

    @Serializable
    private data class ActiveBody(
        val action: String,
        val id: String,
        val active: Boolean,
    )

    @Serializable
    private data class IdBody(val action: String, val id: String)

    @Serializable
    private data class ReportBody(
        val action: String,
        @kotlinx.serialization.SerialName("target_type") val targetType: String,
        @kotlinx.serialization.SerialName("target_id") val targetId: String,
        val reason: String,
        val details: String,
    )

    @Serializable
    private data class ProfileBody(
        val action: String,
        val username: String,
        val name: String,
        val bio: String,
        val website: String,
        val avatar: String,
    )

    @Serializable
    private data class CollectionBody(val action: String, val name: String)

    @Serializable
    private data class ChangeEmailBody(val newEmail: String, val callbackURL: String)

    @Serializable
    private data class DeleteAccountBody(val callbackURL: String)
}
