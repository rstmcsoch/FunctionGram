package com.functiongram.app.presentation.feed

import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.functiongram.app.data.feed.FeedPost
import com.functiongram.app.data.feed.FeedRepository
import com.functiongram.app.data.feed.FeedTime
import com.functiongram.app.data.feed.StorySettings
import com.functiongram.app.presentation.messaging.ScreenStatus
import com.functiongram.app.presentation.ui.FgLoading
import com.functiongram.app.presentation.ui.FgTextButton
import java.time.ZoneId
import kotlinx.coroutines.delay

@Composable
fun PostDetail(
    detail: DetailState,
    repository: FeedRepository,
    zone: ZoneId,
    commentsEnabled: Boolean,
    onClose: () -> Unit,
    onMedia: (FeedPost, Int) -> Unit,
    onLoadMoreComments: () -> Unit,
) {
    Dialog(
        onDismissRequest = onClose,
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
            Row(Modifier.statusBarsPadding().fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onClose) {
                    Icon(Icons.Outlined.Close, contentDescription = "Close post")
                }
                Text("Post", style = MaterialTheme.typography.titleLarge)
            }
            LazyColumn(Modifier.fillMaxSize()) {
                item {
                    PostCard(
                        post = detail.post,
                        repository = repository,
                        zone = zone,
                        onOpen = {},
                        onMedia = { index -> onMedia(detail.post, index) },
                    )
                }
                if (commentsEnabled) {
                    item {
                        Text("Comments", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp))
                    }
                    when (detail.commentsStatus) {
                        ScreenStatus.Loading -> item { FgLoading("Loading comments") }
                        ScreenStatus.Error -> item {
                            Text(
                                detail.commentsMessage ?: "Could not load comments.",
                                color = MaterialTheme.colorScheme.error,
                                modifier = Modifier.padding(horizontal = 16.dp),
                            )
                        }
                        ScreenStatus.Empty -> item {
                            Text("No comments yet.", modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp))
                        }
                        else -> {
                            items(detail.comments, key = { it.id }) { comment ->
                                Column(Modifier.padding(horizontal = 16.dp, vertical = 8.dp)) {
                                    Text(comment.username.ifBlank { "Account" }, style = MaterialTheme.typography.labelLarge)
                                    Text(comment.body, style = MaterialTheme.typography.bodyMedium)
                                    val whenText = FeedTime.format(comment.createdAt, zone)
                                    if (whenText.isNotBlank()) {
                                        Text(whenText, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    }
                                }
                            }
                            if (detail.commentsCursor != null) {
                                item {
                                    FgTextButton(
                                        text = if (detail.loadingMoreComments) "Loading" else "Earlier comments",
                                        onClick = onLoadMoreComments,
                                        modifier = Modifier.padding(horizontal = 8.dp),
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun StoryOverlay(
    story: StorySession,
    settings: StorySettings,
    repository: FeedRepository,
    onClose: () -> Unit,
    onGesture: (Long, Float, Float, Float) -> Unit,
    onPause: (Boolean) -> Unit,
    onAdvance: () -> Unit,
) {
    val group = story.groups.getOrNull(story.authorIndex)
    val post = group?.getOrNull(story.segmentIndex)
    Dialog(onDismissRequest = onClose, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Box(Modifier.fillMaxSize().background(Color.Black)) {
            if (post == null) {
                Text("This story is no longer available.", color = Color.White, modifier = Modifier.align(Alignment.Center))
            } else {
                val media = post.media.firstOrNull()
                if (media == null) {
                    Text("This story has no media.", color = Color.White, modifier = Modifier.align(Alignment.Center))
                } else if (post.mediaType == "video") {
                    FeedVideo(
                        repository = repository,
                        media = media,
                        playing = !story.paused,
                        modifier = Modifier.fillMaxSize(),
                        onEnded = onAdvance,
                    )
                } else {
                    FeedImage(
                        repository = repository,
                        media = media,
                        modifier = Modifier.fillMaxSize(),
                        contentScale = androidx.compose.ui.layout.ContentScale.Fit,
                        maxSide = 2048,
                    )
                    LaunchedEffect(post.id, story.paused, settings.photoSeconds) {
                        if (story.paused) return@LaunchedEffect
                        delay(settings.photoSeconds.coerceAtLeast(1) * 1000L)
                        onAdvance()
                    }
                }
                Box(
                    Modifier
                        .fillMaxSize()
                        .pointerInput(post.id) {
                            awaitEachGesture {
                                val down = awaitFirstDown()
                                val start = down.position
                                val began = System.currentTimeMillis()
                                onPause(true)
                                var end = start
                                var up = false
                                while (!up) {
                                    val event = awaitPointerEvent()
                                    event.changes.forEach { change ->
                                        end = change.position
                                        if (!change.pressed) up = true
                                    }
                                }
                                onPause(false)
                                val width = size.width.coerceAtLeast(1).toFloat()
                                onGesture(
                                    System.currentTimeMillis() - began,
                                    end.x - start.x,
                                    end.y - start.y,
                                    start.x / width,
                                )
                            }
                        },
                )
                if (post.caption.isNotBlank()) {
                    Text(
                        text = post.caption,
                        color = Color.White,
                        modifier = Modifier.align(Alignment.BottomStart).padding(16.dp),
                        maxLines = 3,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            Column(Modifier.statusBarsPadding().padding(horizontal = 12.dp, vertical = 8.dp)) {
                if (group != null) {
                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp), modifier = Modifier.fillMaxWidth()) {
                        group.forEachIndexed { index, _ ->
                            val progress = when {
                                index < story.segmentIndex -> 1f
                                index == story.segmentIndex -> 0.5f
                                else -> 0f
                            }
                            LinearProgressIndicator(
                                progress = { progress },
                                modifier = Modifier.weight(1f).height(3.dp),
                                color = Color.White,
                                trackColor = Color.White.copy(alpha = 0.35f),
                            )
                        }
                    }
                }
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                    Text(
                        text = post?.author?.username?.ifBlank { "Story" } ?: "Story",
                        color = Color.White,
                        style = MaterialTheme.typography.titleMedium,
                        modifier = Modifier.weight(1f),
                    )
                    IconButton(onClick = onClose) {
                        Icon(Icons.Outlined.Close, contentDescription = "Close story", tint = Color.White)
                    }
                }
            }
        }
    }
}

@Composable
fun MediaOverlay(
    session: MediaSession,
    repository: FeedRepository,
    onClose: () -> Unit,
    onShift: (Int) -> Unit,
) {
    val media = session.post.media.getOrNull(session.index)
    Dialog(onDismissRequest = onClose, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Box(Modifier.fillMaxSize().background(Color.Black)) {
            if (media == null) {
                Text("This media can't be opened in the app.", color = Color.White, modifier = Modifier.align(Alignment.Center))
            } else if (session.post.mediaType == "video") {
                FeedVideo(repository = repository, media = media, playing = true, modifier = Modifier.fillMaxSize())
            } else {
                ZoomableFeedImage(repository = repository, media = media, modifier = Modifier.fillMaxSize())
            }
            Row(
                Modifier.align(Alignment.TopCenter).statusBarsPadding().fillMaxWidth().padding(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (session.index > 0) {
                    FgTextButton(text = "Previous", onClick = { onShift(-1) })
                }
                Text(
                    text = if (session.post.media.size > 1) "${session.index + 1} / ${session.post.media.size}" else "",
                    color = Color.White,
                    modifier = Modifier.weight(1f).padding(horizontal = 8.dp),
                )
                if (session.index < session.post.media.lastIndex) {
                    FgTextButton(text = "Next", onClick = { onShift(1) })
                }
                IconButton(onClick = onClose) {
                    Icon(Icons.Outlined.Close, contentDescription = "Close media", tint = Color.White)
                }
            }
        }
    }
}
