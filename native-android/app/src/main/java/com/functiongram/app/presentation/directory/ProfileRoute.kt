package com.functiongram.app.presentation.directory

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.clickable
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.functiongram.app.data.directory.DirectoryFlags
import com.functiongram.app.data.directory.DirectoryPerson
import com.functiongram.app.data.directory.DirectoryRepository
import com.functiongram.app.data.directory.ProfileTab
import com.functiongram.app.data.directory.ReportReasons
import com.functiongram.app.data.feed.FeedRepository
import com.functiongram.app.presentation.feed.MediaOverlay
import com.functiongram.app.presentation.feed.PostDetail
import com.functiongram.app.presentation.messaging.ScreenStatus
import com.functiongram.app.presentation.ui.FgErrorState
import com.functiongram.app.presentation.ui.FgInlineMessage
import com.functiongram.app.presentation.ui.FgLoading
import com.functiongram.app.presentation.ui.FgPrimaryButton
import com.functiongram.app.presentation.ui.FgSecondaryButton
import com.functiongram.app.presentation.ui.FgTextButton
import com.functiongram.app.presentation.ui.FgTextField
import java.time.ZoneId

@Composable
fun ProfileRoute(
    repository: DirectoryRepository,
    feed: FeedRepository,
    lookup: String,
    viewerId: String,
    flags: DirectoryFlags,
    onBack: (() -> Unit)?,
    onOpenProfile: (String) -> Unit,
    onMessage: (String, String) -> Unit,
    onSettings: () -> Unit,
    zone: ZoneId = ZoneId.systemDefault(),
) {
    val viewModel: ProfileViewModel = viewModel(
        key = "profile-$lookup-$viewerId",
        factory = ProfileViewModel.factory(repository, feed, lookup, viewerId),
    )
    val state by viewModel.state.collectAsStateWithLifecycle()
    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = 4.dp), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
            if (onBack != null) {
                androidx.compose.material3.IconButton(onClick = onBack) {
                    androidx.compose.material3.Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Back")
                }
            }
            Text(
                text = state.person?.username ?: "Profile",
                style = MaterialTheme.typography.titleLarge,
                modifier = Modifier.weight(1f).padding(horizontal = 8.dp),
            )
        }
        when (state.status) {
            ScreenStatus.Loading, ScreenStatus.Idle -> FgLoading("Loading profile")
            ScreenStatus.Error -> FgErrorState(
                title = "Couldn't load this profile",
                message = state.message ?: "Could not load this profile.",
                actionLabel = "Try again",
                onAction = viewModel::refresh,
            )
            ScreenStatus.Empty -> FgErrorState(
                title = "Profile unavailable",
                message = state.message ?: "This profile is not available.",
                actionLabel = "Try again",
                onAction = viewModel::refresh,
            )
            ScreenStatus.Ready -> {
                val person = state.person ?: return@Column
                ProfileBody(
                    state = state,
                    person = person,
                    flags = flags,
                    viewerId = viewerId,
                    feed = feed,
                    onSelectTab = { viewModel.selectTab(it, flags) },
                    onFollow = { viewModel.follow(flags) },
                    onBlock = viewModel::block,
                    onMessage = { onMessage(person.id, person.username) },
                    onSettings = onSettings,
                    onEdit = { viewModel.setEditing(true) },
                    onReport = { viewModel.setReporting(true) },
                    onRelations = { viewModel.loadRelations(it, flags) },
                    onOpenPost = { viewModel.openPost(it, flags.comments) },
                )
            }
        }
    }
    state.notice?.let { notice ->
        LaunchedEffect(notice) { }
        FgInlineMessage(notice, Modifier.padding(16.dp))
    }
    val detail = state.detail
    if (detail != null) {
        PostDetail(
            detail = detail,
            repository = feed,
            zone = zone,
            commentsEnabled = flags.comments,
            onClose = viewModel::closePost,
            onMedia = viewModel::openMedia,
            onLoadMoreComments = viewModel::loadMoreComments,
        )
    }
    state.media?.let { media ->
        MediaOverlay(media, feed, viewModel::closeMedia, viewModel::shiftMedia)
    }
    if (state.editing && state.person != null) {
        EditProfileDialog(
            person = state.person!!,
            busy = state.busy == "edit",
            notice = state.notice,
            onDismiss = { viewModel.setEditing(false) },
            onSave = viewModel::saveProfile,
        )
    }
    if (state.reporting && state.person != null) {
        ReportDialog(
            username = state.person!!.username,
            busy = state.busy == "report",
            onDismiss = { viewModel.setReporting(false) },
            onSend = viewModel::report,
        )
    }
    if (state.relations != null) {
        RelationsDialog(
            kind = state.relationsKind ?: "followers",
            people = state.relations.orEmpty(),
            message = state.relationsMessage,
            onOpen = { username ->
                viewModel.closeRelations()
                onOpenProfile(username)
            },
            onDismiss = viewModel::closeRelations,
        )
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ProfileBody(
    state: ProfileUiState,
    person: DirectoryPerson,
    flags: DirectoryFlags,
    viewerId: String,
    feed: FeedRepository,
    onSelectTab: (ProfileTab) -> Unit,
    onFollow: () -> Unit,
    onBlock: () -> Unit,
    onMessage: () -> Unit,
    onSettings: () -> Unit,
    onEdit: () -> Unit,
    onReport: () -> Unit,
    onRelations: (String) -> Unit,
    onOpenPost: (com.functiongram.app.data.feed.FeedPost) -> Unit,
) {
    val own = person.id == viewerId
    val context = LocalContext.current
    Column(Modifier.fillMaxSize()) {
        Column(Modifier.padding(horizontal = 16.dp)) {
            Row {
                AccountAvatar(feed, person.username, person.avatarPath, 96.dp)
                Column(Modifier.padding(start = 16.dp)) {
                    Text(person.username, style = MaterialTheme.typography.headlineSmall)
                    if (state.linkPath.isNotBlank()) {
                        Text(state.linkPath, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    if (person.privateAccount) {
                        Text("Private", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
                    }
                    if (person.verified) {
                        Text("Verified", style = MaterialTheme.typography.labelMedium)
                    }
                    if (person.demo) {
                        Text("Sample", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
            Spacer(Modifier.height(12.dp))
            Row {
                Stat(person.postCount, "posts", null)
                Stat(person.followers, "followers", if (flags.follow) ({ onRelations("followers") }) else null)
                Stat(person.following, "following", if (flags.follow) ({ onRelations("following") }) else null)
            }
            if (person.name.isNotBlank()) {
                Text(person.name, style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 8.dp))
            }
            if (person.bio.isNotBlank()) {
                Text(person.bio, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 4.dp))
            }
            if (person.website.isNotBlank()) {
                Text(
                    text = person.website.removePrefix("https://").removePrefix("http://").trimEnd('/'),
                    color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.padding(top = 4.dp).clickable {
                        val site = person.website
                        if (site.startsWith("https://") || site.startsWith("http://")) {
                            context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(site)))
                        }
                    },
                )
            }
            if (person.blocked) {
                Text("You blocked this account.", modifier = Modifier.padding(top = 8.dp))
            }
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 12.dp)) {
                if (own) {
                    FgSecondaryButton(text = "Edit profile", onClick = onEdit)
                    FgSecondaryButton(text = "Settings", onClick = onSettings)
                } else {
                    if (flags.follow) {
                        FgPrimaryButton(
                            text = if (person.followed) "Following" else "Follow",
                            onClick = onFollow,
                            enabled = state.busy != "follow" && !person.blocked,
                        )
                    }
                    if (flags.messages) {
                        FgSecondaryButton(text = "Message", onClick = onMessage, enabled = !person.blocked)
                    }
                    if (flags.reports) {
                        FgTextButton(text = "Report", onClick = onReport)
                    }
                    FgTextButton(text = if (person.blocked) "Unblock" else "Block", onClick = onBlock)
                }
            }
            Row(Modifier.padding(top = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                TabChip("Posts", state.tab == ProfileTab.POSTS) { onSelectTab(ProfileTab.POSTS) }
                if (flags.reels) TabChip("Reels", state.tab == ProfileTab.REELS) { onSelectTab(ProfileTab.REELS) }
                if (own && flags.saves) TabChip("Saved", state.tab == ProfileTab.SAVED) { onSelectTab(ProfileTab.SAVED) }
            }
            Spacer(Modifier.height(8.dp))
        }
        when (state.postsStatus) {
            ScreenStatus.Loading, ScreenStatus.Idle -> FgLoading("Loading posts")
            ScreenStatus.Error -> Text(
                state.postsMessage ?: "Could not load posts.",
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.padding(16.dp),
            )
            ScreenStatus.Empty -> Text(
                if (state.tab == ProfileTab.SAVED) "No saved posts yet." else "No posts yet.",
                modifier = Modifier.padding(16.dp),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            ScreenStatus.Ready -> {
                LazyVerticalGrid(
                    columns = GridCells.Fixed(3),
                    modifier = Modifier.weight(1f).fillMaxWidth(),
                    contentPadding = PaddingValues(2.dp),
                ) {
                    items(state.posts, key = { it.id }) { post ->
                        val media = post.media.firstOrNull()
                        if (media?.key == null) {
                            Box(Modifier.padding(1.dp).aspectRatio(1f))
                        } else {
                            com.functiongram.app.presentation.feed.FeedImage(
                                repository = feed,
                                media = media,
                                modifier = Modifier.padding(1.dp).aspectRatio(1f).clickable { onOpenPost(post) },
                                maxSide = 480,
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun TabChip(label: String, selected: Boolean, onClick: () -> Unit) {
    if (selected) FgPrimaryButton(text = label, onClick = onClick) else FgSecondaryButton(text = label, onClick = onClick)
}

@Composable
private fun EditProfileDialog(
    person: DirectoryPerson,
    busy: Boolean,
    notice: String?,
    onDismiss: () -> Unit,
    onSave: (String, String, String, String) -> Unit,
) {
    var username by remember(person.id) { mutableStateOf(person.username) }
    var name by remember(person.id) { mutableStateOf(person.name) }
    var bio by remember(person.id) { mutableStateOf(person.bio) }
    var website by remember(person.id) { mutableStateOf(person.website) }
    AlertDialog(
        onDismissRequest = { if (!busy) onDismiss() },
        title = { Text("Edit profile") },
        text = {
            Column {
                FgTextField(username, { username = it }, "Username", enabled = !busy)
                Spacer(Modifier.height(8.dp))
                FgTextField(name, { name = it }, "Name", enabled = !busy)
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(bio, { if (it.length <= 150) bio = it }, label = { Text("Bio") }, enabled = !busy, modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(8.dp))
                FgTextField(website, { website = it }, "Website", enabled = !busy)
                if (!notice.isNullOrBlank()) {
                    Text(notice, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(top = 8.dp))
                }
            }
        },
        confirmButton = {
            TextButton(onClick = { onSave(username, name, bio, website) }, enabled = !busy) { Text(if (busy) "Saving" else "Save") }
        },
        dismissButton = { TextButton(onClick = onDismiss, enabled = !busy) { Text("Cancel") } },
    )
}

@Composable
private fun ReportDialog(
    username: String,
    busy: Boolean,
    onDismiss: () -> Unit,
    onSend: (String, String) -> Unit,
) {
    var reason by remember { mutableStateOf(ReportReasons.all.first().first) }
    var details by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = { if (!busy) onDismiss() },
        title = { Text("Report $username") },
        text = {
            Column {
                ReportReasons.all.forEach { (value, label) ->
                    TextButton(onClick = { reason = value }) {
                        Text(if (reason == value) "• $label" else label)
                    }
                }
                OutlinedTextField(details, { if (it.length <= 1000) details = it }, label = { Text("Details") }, modifier = Modifier.fillMaxWidth())
            }
        },
        confirmButton = {
            TextButton(onClick = { onSend(reason, details) }, enabled = !busy) { Text(if (busy) "Sending" else "Send report") }
        },
        dismissButton = { TextButton(onClick = onDismiss, enabled = !busy) { Text("Cancel") } },
    )
}

@Composable
private fun RelationsDialog(
    kind: String,
    people: List<DirectoryPerson>,
    message: String?,
    onOpen: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (kind == "following") "Following" else "Followers") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                if (!message.isNullOrBlank()) Text(message, color = MaterialTheme.colorScheme.error)
                if (people.isEmpty() && message.isNullOrBlank()) Text("No accounts yet.")
                people.forEach { person ->
                    TextButton(onClick = { if (person.username.isNotBlank()) onOpen(person.username) }) {
                        Text(person.username.ifBlank { person.name })
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("Close") } },
    )
}
