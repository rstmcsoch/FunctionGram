package com.functiongram.app.presentation.shell

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.height
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.functiongram.app.data.auth.PublicProfile
import com.functiongram.app.data.messaging.MessagingRepository
import com.functiongram.app.presentation.messaging.MessagingRoute
import com.functiongram.app.presentation.session.SessionHomeRoute
import com.functiongram.app.presentation.ui.FgDialog
import com.functiongram.app.presentation.ui.FunctionGramShell
import com.functiongram.app.presentation.ui.ShellPage

@Composable
fun SignedInShell(
    profile: PublicProfile?,
    busy: Boolean,
    onSignOut: () -> Unit,
    messaging: MessagingRepository,
    viewerId: String,
) {
    var selectedId by rememberSaveable { mutableStateOf(ShellDestination.HOME.id) }
    var createOpen by rememberSaveable { mutableStateOf(false) }
    val selected = ShellCatalog.destination(selectedId) ?: ShellDestination.HOME
    FunctionGramShell(
        selected = selected,
        onSelect = { selectedId = it.id },
        onCreate = { createOpen = true },
    ) { padding ->
        if (selected == ShellDestination.MESSAGES) {
            Box(Modifier.fillMaxSize().padding(padding)) {
                MessagingRoute(
                    repository = messaging,
                    viewerId = viewerId,
                    shellBottom = padding.calculateBottomPadding(),
                )
            }
        } else {
            ShellPage(padding = padding) {
                Text(
                    text = selected.label,
                    style = MaterialTheme.typography.headlineSmall,
                )
                Text(
                    text = placeholderCopy(selected),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                if (selected == ShellDestination.HOME) {
                    Spacer(Modifier.height(4.dp))
                    SessionHomeRoute(
                        profile = profile,
                        busy = busy,
                        onSignOut = onSignOut,
                    )
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

private fun placeholderCopy(destination: ShellDestination): String = when (destination) {
    ShellDestination.HOME ->
        "The feed is not part of this phase. This screen only shows the signed-in session."
    ShellDestination.SEARCH -> "Search is not part of this phase."
    ShellDestination.EXPLORE -> "Explore is not part of this phase."
    ShellDestination.REELS -> "Reels are not part of this phase."
    ShellDestination.NOTIFICATIONS -> "Notifications are not part of this phase."
    ShellDestination.PROFILE -> "Profiles are not part of this phase."
    ShellDestination.SAVED -> "Saved posts are not part of this phase."
    ShellDestination.MESSAGES -> ""
}
