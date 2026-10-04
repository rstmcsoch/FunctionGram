package com.functiongram.app.presentation.shell

import com.functiongram.app.data.policy.FeaturePolicy
import com.functiongram.app.data.policy.ServerFeatures

/**
 * Website default navigation from lib/appearance.ts NAV_TARGETS.
 * Create is an action, not a destination. Home, Reels, Search, Notifications,
 * and Profile load the social API. Profile opens the signed-in username, not
 * a generic /profile path. Explore and the Saved destination stay placeholders.
 * Feature flags from the admin Features screen can hide destinations.
 */
enum class ShellDestination(
    val id: String,
    val label: String,
) {
    HOME("home", "Home"),
    SEARCH("search", "Search"),
    EXPLORE("explore", "Explore"),
    REELS("reels", "Reels"),
    MESSAGES("messages", "Messages"),
    NOTIFICATIONS("notifications", "Notifications"),
    PROFILE("profile", "Profile"),
    SAVED("saved", "Saved"),
}

object ShellCatalog {
    const val CREATE_ID = FeaturePolicy.CREATE_ID

    /** Dock order after filtering the default nav to items with dock:true, create included. */
    val dockIds: List<String> = listOf(
        ShellDestination.HOME.id,
        ShellDestination.SEARCH.id,
        ShellDestination.EXPLORE.id,
        CREATE_ID,
        ShellDestination.REELS.id,
        ShellDestination.PROFILE.id,
    )

    val headerIds: List<String> = listOf(
        ShellDestination.MESSAGES.id,
        ShellDestination.NOTIFICATIONS.id,
    )

    /** Full default nav order, including the create action. */
    val sidebarIds: List<String> = listOf(
        ShellDestination.HOME.id,
        ShellDestination.SEARCH.id,
        ShellDestination.EXPLORE.id,
        ShellDestination.REELS.id,
        ShellDestination.MESSAGES.id,
        ShellDestination.NOTIFICATIONS.id,
        CREATE_ID,
        ShellDestination.PROFILE.id,
        ShellDestination.SAVED.id,
    )

    fun destination(id: String): ShellDestination? =
        ShellDestination.entries.firstOrNull { it.id == id }

    fun dockIds(features: ServerFeatures): List<String> =
        FeaturePolicy.visibleIds(dockIds, features)

    fun headerIds(features: ServerFeatures): List<String> =
        FeaturePolicy.visibleIds(headerIds, features)

    fun sidebarIds(features: ServerFeatures): List<String> =
        FeaturePolicy.visibleIds(sidebarIds, features)

    fun allows(destination: ShellDestination, features: ServerFeatures): Boolean =
        FeaturePolicy.allowsNavId(destination.id, features)

    fun allowsCreate(features: ServerFeatures): Boolean =
        FeaturePolicy.allowsNavId(CREATE_ID, features)
}
