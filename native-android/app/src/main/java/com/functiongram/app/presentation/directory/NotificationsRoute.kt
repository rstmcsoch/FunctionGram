package com.functiongram.app.presentation.directory

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.functiongram.app.data.directory.DirectoryDerive
import com.functiongram.app.data.directory.DirectoryFlags
import com.functiongram.app.data.directory.DirectoryRepository
import com.functiongram.app.data.directory.NotificationGroup
import com.functiongram.app.data.feed.FeedRepository
import com.functiongram.app.data.feed.FeedTime
import com.functiongram.app.presentation.feed.MediaOverlay
import com.functiongram.app.presentation.feed.PostDetail
import com.functiongram.app.presentation.messaging.ScreenStatus
import com.functiongram.app.presentation.ui.FgErrorState
import com.functiongram.app.presentation.ui.FgLoading
import com.functiongram.app.presentation.ui.FgTextButton
import java.time.ZoneId

private val notificationFilters = listOf(
    "all" to "All",
    "like" to "Likes",
    "comment" to "Comments",
    "follow" to "Follows",
    "tag" to "Tags",
    "broadcast" to "Announcements",
)

@Composable
fun NotificationsRoute(
    repository: DirectoryRepository,
    feed: FeedRepository,
    flags: DirectoryFlags,
    onOpenProfile: (String) -> Unit,
    zone: ZoneId = ZoneId.systemDefault(),
) {
    val viewModel: NotificationsViewModel = viewModel(
        factory = NotificationsViewModel.factory(repository, feed),
    )
    val state by viewModel.state.collectAsStateWithLifecycle()
    LaunchedEffect(flags) { viewModel.bind(flags) }
    Column(Modifier.fillMaxSize()) {
        Text("Notifications", style = MaterialTheme.typography.headlineSmall, modifier = Modifier.padding(start = 16.dp, top = 12.dp))
        val unread = state.items.any { it.readAt == null }
        Text(
            if (unread) "New activity" else "Recent activity",
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (!flags.notifications) {
            Text(state.message ?: "This feature is currently unavailable.", modifier = Modifier.padding(16.dp))
            return@Column
        }
        LazyRow(Modifier.padding(horizontal = 8.dp, vertical = 4.dp)) {
            items(notificationFilters) { (value, label) ->
                val dot = value != "all" && state.items.any { it.kind == value && it.readAt == null }
                FgTextButton(
                    text = if (state.filter == value) label else if (dot) "$label •" else label,
                    onClick = { viewModel.setFilter(value) },
                )
            }
        }
        when (state.status) {
            ScreenStatus.Loading, ScreenStatus.Idle -> FgLoading("Loading notifications")
            ScreenStatus.Error -> FgErrorState(
                title = "Couldn't load notifications",
                message = state.message ?: "Could not load notifications.",
                actionLabel = "Try again",
                onAction = { viewModel.refresh(markRead = false) },
            )
            ScreenStatus.Empty -> Text(
                "You're all caught up. When someone likes, comments, or follows you, you'll see it here.",
                modifier = Modifier.padding(16.dp),
            )
            ScreenStatus.Ready -> {
                if (state.groups.isEmpty()) {
                    Text("Nothing in this filter yet.", modifier = Modifier.padding(16.dp))
                } else {
                    LazyColumn(Modifier.weight(1f).fillMaxWidth()) {
                        items(state.groups, key = { it.key + ":" + it.actors.first().id }) { group ->
                            NotificationRow(group, zone, state.opening == group.key, feed) {
                                if (group.kind == "broadcast") return@NotificationRow
                                val postId = group.postId
                                if (postId.isNullOrBlank()) {
                                    val username = group.actors.first().username
                                    if (username.isNotBlank()) onOpenProfile(username)
                                } else {
                                    viewModel.openPost(postId, flags.comments)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    state.detail?.let { detail ->
        PostDetail(
            detail = detail,
            repository = feed,
            zone = zone,
            commentsEnabled = flags.comments,
            onClose = viewModel::closePost,
            onMedia = viewModel::openMedia,
            onLoadMoreComments = {},
        )
    }
    state.media?.let { media ->
        MediaOverlay(media, feed, viewModel::closeMedia, viewModel::shiftMedia)
    }
}

@Composable
private fun NotificationRow(
    group: NotificationGroup,
    zone: ZoneId,
    busy: Boolean,
    feed: FeedRepository,
    onClick: () -> Unit,
) {
    val first = group.actors.first()
    val others = group.actors.size - 1
    val label = DirectoryDerive.notificationLabel(first)
    Row(
        Modifier
            .fillMaxWidth()
            .clickable(enabled = !busy, onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        AccountAvatar(feed, first.username, first.avatarPath, 44.dp)
        Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
            val names = if (others > 0) "${first.username} and $others other${if (others > 1) "s" else ""}" else first.username
            Text(names, fontWeight = if (group.unread) FontWeight.SemiBold else FontWeight.Normal)
            Text(label, style = MaterialTheme.typography.bodyMedium)
            val whenText = FeedTime.format(group.createdAt, zone)
            if (whenText.isNotBlank()) {
                Text(whenText, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        if (group.unread) {
            Text("New", color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelMedium)
        }
    }
}
