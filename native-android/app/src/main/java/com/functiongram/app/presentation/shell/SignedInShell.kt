package com.functiongram.app.presentation.shell

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.functiongram.app.data.auth.PublicProfile
import com.functiongram.app.data.directory.DirectoryFlags
import com.functiongram.app.data.policy.FeaturePolicy
import com.functiongram.app.data.policy.ServerFeatures
import com.functiongram.app.data.directory.DirectoryRepository
import com.functiongram.app.data.feed.FeedRepository
import com.functiongram.app.data.messaging.MessagingRepository
import com.functiongram.app.presentation.directory.DevicePreferences
import com.functiongram.app.presentation.directory.NotificationsRoute
import com.functiongram.app.presentation.directory.ProfileRoute
import com.functiongram.app.presentation.directory.SearchRoute
import com.functiongram.app.presentation.directory.SettingsRoute
import com.functiongram.app.presentation.directory.ShellSessionViewModel
import com.functiongram.app.presentation.feed.FeedRoute
import com.functiongram.app.presentation.feed.ReelsRoute
import com.functiongram.app.presentation.messaging.MessagingRoute
import com.functiongram.app.presentation.messaging.ScreenStatus
import com.functiongram.app.presentation.ui.FgDialog
import com.functiongram.app.presentation.ui.FgErrorState
import com.functiongram.app.presentation.ui.FgLoading
import com.functiongram.app.presentation.ui.FunctionGramShell
import com.functiongram.app.presentation.ui.ShellPage
import com.functiongram.app.push.PushDestination
import kotlinx.coroutines.flow.StateFlow

@Composable
fun SignedInShell(
    profile: PublicProfile?,
    busy: Boolean,
    onSignOut: () -> Unit,
    messaging: MessagingRepository,
    viewerId: String,
    feed: FeedRepository,
    directory: DirectoryRepository,
    preferences: DevicePreferences,
    pendingLink: StateFlow<PushDestination?>,
    onLinkHandled: () -> Unit,
    onNotificationsEnabled: (Boolean) -> Unit,
) {
    var selectedId by rememberSaveable { mutableStateOf(ShellDestination.HOME.id) }
    var createOpen by rememberSaveable { mutableStateOf(false) }
    var profileLookup by rememberSaveable { mutableStateOf<String?>(null) }
    var settingsOpen by rememberSaveable { mutableStateOf(false) }
    var messagePeer by rememberSaveable { mutableStateOf<String?>(null) }
    var messageTitle by rememberSaveable { mutableStateOf("") }
    val selected = ShellCatalog.destination(selectedId) ?: ShellDestination.HOME
    val session: ShellSessionViewModel = viewModel(factory = ShellSessionViewModel.factory(directory))
    val sessionState by session.state.collectAsStateWithLifecycle()
    val flags = sessionState.shell?.flags ?: DirectoryFlags()
    androidx.compose.runtime.LaunchedEffect(flags) {
        val current = ShellCatalog.destination(selectedId) ?: ShellDestination.HOME
        if (!ShellCatalog.allows(current, flags)) {
            selectedId = ShellDestination.HOME.id
            profileLookup = null
            settingsOpen = false
            createOpen = false
        }
    }
    val selfLookup = sessionState.shell?.me?.username?.takeIf { it.isNotBlank() } ?: viewerId
    val pending by pendingLink.collectAsStateWithLifecycle()
    LaunchedEffect(sessionState.shell?.flags?.notifications) {
        val shell = sessionState.shell ?: return@LaunchedEffect
        onNotificationsEnabled(shell.flags.notifications)
    }
    LaunchedEffect(pending, sessionState.status, flags, selfLookup) {
        val destination = pending ?: return@LaunchedEffect
        val shellReady = sessionState.status == ScreenStatus.Ready && sessionState.shell != null
        when (val decision = ShellDeepLink.decide(destination, flags, shellReady, selfLookup)) {
            ShellDeepLink.Decision.Waiting -> Unit
            ShellDeepLink.Decision.Blocked -> onLinkHandled()
            is ShellDeepLink.Decision.Open -> {
                settingsOpen = false
                profileLookup = decision.applied.profileLookup
                messagePeer = decision.applied.messagePeer
                messageTitle = decision.applied.messageTitle
                decision.applied.selectedId?.let { selectedId = it }
                onLinkHandled()
            }
        }
    }

    BackHandler(enabled = settingsOpen || profileLookup != null) {
        when {
            settingsOpen -> settingsOpen = false
            profileLookup != null -> profileLookup = null
        }
    }

    FunctionGramShell(
        selected = selected,
        onSelect = { destination ->
            if (ShellCatalog.allows(destination, flags)) {
                profileLookup = null
                settingsOpen = false
                selectedId = destination.id
            }
        },
        onCreate = {
            if (ShellCatalog.allowsCreate(flags)) {
                createOpen = true
            }
        },
        features = flags,
    ) { padding ->
        when {
            settingsOpen -> {
                Box(Modifier.fillMaxSize().padding(padding)) {
                    SettingsRoute(
                        repository = directory,
                        preferences = preferences,
                        shell = sessionState.shell,
                        viewerId = viewerId,
                        email = profile?.email.orEmpty(),
                        onBack = { settingsOpen = false },
                        onSignOut = onSignOut,
                    )
                }
            }
            profileLookup != null -> {
                Box(Modifier.fillMaxSize().padding(padding)) {
                    ProfileRoute(
                        repository = directory,
                        feed = feed,
                        lookup = profileLookup!!,
                        viewerId = viewerId,
                        flags = flags,
                        onBack = { profileLookup = null },
                        onOpenProfile = { profileLookup = it },
                        onMessage = { id, title ->
                            if (FeaturePolicy.canOpenMessages(flags)) {
                                messagePeer = id
                                messageTitle = title
                                profileLookup = null
                                selectedId = ShellDestination.MESSAGES.id
                            }
                        },
                        onSettings = { settingsOpen = true },
                    )
                }
            }
            else -> when (selected) {
                ShellDestination.MESSAGES -> {
                    Box(Modifier.fillMaxSize().padding(padding)) {
                        if (!FeaturePolicy.canOpenMessages(flags)) {
                            Text(
                                text = FeaturePolicy.FEATURE_OFF,
                                modifier = Modifier.padding(16.dp),
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        } else {
                            MessagingRoute(
                                repository = messaging,
                                viewerId = viewerId,
                                shellBottom = padding.calculateBottomPadding(),
                                features = flags,
                                pendingPeerId = messagePeer,
                                pendingTitle = messageTitle,
                                onPendingPeerConsumed = { messagePeer = null },
                            )
                        }
                    }
                }
                ShellDestination.HOME -> {
                    Box(Modifier.fillMaxSize().padding(padding)) {
                        FeedRoute(
                            repository = feed,
                            profile = profile,
                            busy = busy,
                            onSignOut = onSignOut,
                        )
                    }
                }
                ShellDestination.REELS -> {
                    Box(Modifier.fillMaxSize().padding(padding)) {
                        if (!flags.reels) {
                            Text(
                                text = FeaturePolicy.FEATURE_OFF,
                                modifier = Modifier.padding(16.dp),
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        } else {
                            ReelsRoute(repository = feed)
                        }
                    }
                }
                ShellDestination.SEARCH -> DirectoryGate(sessionState.status, sessionState.message, session::refresh, padding) {
                    SearchRoute(
                        repository = directory,
                        feed = feed,
                        recents = preferences.recents,
                        viewerId = viewerId,
                        flags = flags,
                        onOpenProfile = { profileLookup = it },
                    )
                }
                ShellDestination.NOTIFICATIONS -> DirectoryGate(sessionState.status, sessionState.message, session::refresh, padding) {
                    NotificationsRoute(
                        repository = directory,
                        feed = feed,
                        flags = flags,
                        onOpenProfile = { profileLookup = it },
                    )
                }
                ShellDestination.PROFILE -> DirectoryGate(sessionState.status, sessionState.message, session::refresh, padding) {
                    ProfileRoute(
                        repository = directory,
                        feed = feed,
                        lookup = selfLookup,
                        viewerId = viewerId,
                        flags = flags,
                        onBack = null,
                        onOpenProfile = { profileLookup = it },
                        onMessage = { id, title ->
                            if (FeaturePolicy.canOpenMessages(flags)) {
                                messagePeer = id
                                messageTitle = title
                                selectedId = ShellDestination.MESSAGES.id
                            }
                        },
                        onSettings = { settingsOpen = true },
                    )
                }
                else -> {
                    ShellPage(padding = padding) {
                        Text(text = selected.label, style = MaterialTheme.typography.headlineSmall)
                        Text(
                            text = placeholderCopy(selected),
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }
    }
    if (createOpen) {
        FgDialog(
            title = "Create",
            body = "Creating a post is not part of this phase.",
            onDismiss = { createOpen = false },
        )
    }
}

@Composable
private fun DirectoryGate(
    status: ScreenStatus,
    message: String?,
    onRetry: () -> Unit,
    padding: androidx.compose.foundation.layout.PaddingValues,
    content: @Composable () -> Unit,
) {
    Box(Modifier.fillMaxSize().padding(padding)) {
        when (status) {
            ScreenStatus.Loading, ScreenStatus.Idle -> FgLoading("Loading")
            ScreenStatus.Error -> FgErrorState(
                title = "Couldn't load FunctionGram",
                message = message ?: "Could not reach FunctionGram.",
                actionLabel = "Try again",
                onAction = onRetry,
            )
            else -> content()
        }
    }
}

private fun placeholderCopy(destination: ShellDestination): String = when (destination) {
    ShellDestination.EXPLORE -> "Explore is not part of this phase. GET /api/social?explore= exists and is not opened here."
    ShellDestination.SAVED -> "Saved posts are not part of this phase. Your own saved tab is on your profile when saves are enabled."
    else -> ""
}
