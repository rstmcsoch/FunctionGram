package com.functiongram.app.presentation.shell

/**
 * Website default navigation from lib/appearance.ts NAV_TARGETS.
 * Create is an action, not a destination. Home and Reels load the social API.
 * Search, Explore, profiles, and saved posts stay placeholders.
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
    const val CREATE_ID = "create"

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
}
