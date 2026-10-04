package com.functiongram.app.data.directory

import com.functiongram.app.data.feed.FeedPost
import java.net.URI

/**
 * Username routes and list rules copied from the website.
 * A profile link is `/<username>`. Reserved application paths keep the legacy
 * hash form. There is no generic `/profile` route in this client.
 */
object ProfilePaths {
    private val USERNAME = Regex("^[a-z0-9_][a-z0-9_.]{2,29}$")

    /** Same reserved set as lib/profile-url.ts, including the admin panel path. */
    val reserved: Set<String> = setOf(
        "admin",
        "admin-panel",
        "admin-two-factor",
        "api",
        "media",
        "p",
        "reset-password",
        "two-factor",
        "verify-email",
        "_next",
        "favicon.ico",
        "favicon.svg",
    )

    fun isReserved(username: String): Boolean = reserved.contains(username.trim().lowercase())

    /** Null when the name can be saved. The messages match the social API. */
    fun usernameError(raw: String): String? {
        val username = raw.trim().lowercase()
        if (!USERNAME.matches(username)) return DirectoryCopy.USERNAME_RULE
        if (isReserved(username)) return DirectoryCopy.USERNAME_RESERVED
        return null
    }

    /**
     * Public path for an account that already exists.
     * A reserved name is never emitted as a root path, because that path
     * belongs to the application.
     */
    fun linkPath(username: String): String {
        val trimmed = username.trim()
        if (trimmed.isEmpty() || trimmed.length > 100) return ""
        if (trimmed.any { it.isISOControl() || it == '/' || it == '\\' || it == '?' || it == '#' }) return ""
        val encoded = java.net.URLEncoder.encode(trimmed, Charsets.UTF_8.name()).replace("+", "%20")
        if (isReserved(trimmed)) return "/#/profile/$encoded"
        return "/$encoded"
    }
}

object DirectoryDerive {
    fun searchNeedle(query: String): String? {
        val needle = query.trim().removePrefix("@")
        if (needle.length < 2) return null
        return needle
    }

    fun rememberRecent(current: List<String>, value: String): List<String> {
        val trimmed = value.trim()
        if (trimmed.isEmpty()) return current
        return listOf(trimmed) + current.filter { it.lowercase() != trimmed.lowercase() }.take(7)
    }

    fun forgetRecent(current: List<String>, value: String): List<String> =
        current.filter { it != value }

    /** Discovery suggestions. Sample accounts and the viewer are not listed. */
    fun discover(people: List<DirectoryPerson>, viewerId: String?): List<DirectoryPerson> =
        people.filter { person -> !person.demo && person.id != viewerId }.take(10)

    fun profileGrid(posts: List<FeedPost>, authorId: String, tab: ProfileTab): List<FeedPost> =
        posts.filter { post ->
            if (post.kind == "story") return@filter false
            when (tab) {
                ProfileTab.POSTS -> post.authorId == authorId && post.kind == "post"
                ProfileTab.REELS -> post.authorId == authorId && post.mediaType == "video"
                ProfileTab.SAVED -> post.saved
            }
        }

    fun groups(items: List<AppNotification>): List<NotificationGroup> {
        val result = mutableListOf<NotificationGroup>()
        for (notification in items) {
            val key = if (notification.kind == "broadcast") {
                "broadcast:" + (notification.broadcastId ?: notification.id)
            } else {
                notification.kind + ":" + (notification.postId ?: "none")
            }
            val last = result.lastOrNull()
            if (last != null && last.key == key && last.actors.size < 3) {
                result[result.lastIndex] = last.copy(
                    actors = last.actors + notification,
                    createdAt = maxOf(last.createdAt, notification.createdAt),
                    unread = last.unread || notification.readAt == null,
                )
            } else {
                result += NotificationGroup(
                    key = key,
                    kind = notification.kind,
                    actors = listOf(notification),
                    postId = notification.postId,
                    createdAt = notification.createdAt,
                    unread = notification.readAt == null,
                )
            }
        }
        return result
    }

    fun visibleGroups(groups: List<NotificationGroup>, filter: String): List<NotificationGroup> =
        if (filter == "all") groups else groups.filter { it.kind == filter }

    fun notificationLabel(notification: AppNotification): String {
        if (notification.messageText.isNotBlank()) return notification.messageText
        if (notification.templateText.isNotBlank()) return notification.templateText
        return when (notification.kind) {
            "like" -> "liked your post"
            "follow" -> "started following you"
            "comment" -> "commented on your post"
            "tag" -> "tagged you in a post"
            "broadcast" -> "sent you an announcement"
            else -> "interacted with you"
        }
    }

    fun websiteError(raw: String): String? {
        val website = raw.trim()
        if (website.isEmpty()) return null
        if (website.length > 200) return DirectoryCopy.LENGTH
        val url = try {
            URI(website)
        } catch (_: Exception) {
            return DirectoryCopy.WEBSITE_COMPLETE
        }
        val scheme = url.scheme?.lowercase()
        if (scheme == null || url.host.isNullOrBlank()) return DirectoryCopy.WEBSITE_COMPLETE
        if (scheme != "https" && scheme != "http") return DirectoryCopy.WEBSITE_INVALID
        if (!url.userInfo.isNullOrEmpty()) return DirectoryCopy.WEBSITE_INVALID
        return null
    }
}

/** Device theme. The website stores this locally. There is no account theme API. */
enum class ThemeChoice {
    LIGHT,
    DARK,
    SYSTEM,
    ;

    companion object {
        fun fromStored(value: String?): ThemeChoice = when (value) {
            "light" -> LIGHT
            "dark" -> DARK
            else -> SYSTEM
        }

        fun stored(choice: ThemeChoice): String = when (choice) {
            LIGHT -> "light"
            DARK -> "dark"
            SYSTEM -> "system"
        }

        fun isDark(choice: ThemeChoice, systemDark: Boolean): Boolean = when (choice) {
            LIGHT -> false
            DARK -> true
            SYSTEM -> systemDark
        }
    }
}
