package com.functiongram.app.presentation.feed

import android.graphics.Bitmap
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.PlayArrow
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.ProgressiveMediaSource
import androidx.media3.ui.PlayerView
import com.functiongram.app.data.feed.FeedCall
import com.functiongram.app.data.feed.FeedMedia
import com.functiongram.app.data.feed.FeedPost
import com.functiongram.app.data.feed.FeedRepository
import com.functiongram.app.data.feed.FeedTime
import com.functiongram.app.data.feed.StorySettings
import com.functiongram.app.presentation.messaging.PhotoDecode
import com.functiongram.app.presentation.messaging.PhotoGestures
import java.time.ZoneId
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

@Composable
fun FeedImage(
    repository: FeedRepository,
    media: FeedMedia,
    modifier: Modifier = Modifier,
    contentScale: ContentScale = ContentScale.Crop,
    maxSide: Int = 1280,
) {
    val key = media.key
    var bitmap by remember(key) { mutableStateOf<Bitmap?>(null) }
    var message by remember(key) { mutableStateOf<String?>(null) }
    LaunchedEffect(key) {
        if (key == null) {
            message = "This media can't be opened in the app."
            return@LaunchedEffect
        }
        val result = withContext(Dispatchers.IO) { repository.loadImage(media.path) }
        when (result) {
            is FeedCall.Err -> message = result.failure.message
            is FeedCall.Ok -> {
                val decoded = withContext(Dispatchers.Default) { PhotoDecode.decode(result.value, maxSide) }
                if (decoded == null) message = "Could not read this photo." else bitmap = decoded
            }
        }
    }
    Box(modifier.background(MaterialTheme.colorScheme.surfaceVariant), contentAlignment = Alignment.Center) {
        val image = bitmap
        when {
            image != null -> Image(
                bitmap = image.asImageBitmap(),
                contentDescription = media.alt.ifBlank { "Photo" },
                contentScale = contentScale,
                modifier = Modifier.fillMaxSize(),
            )
            message != null -> Text(
                text = message.orEmpty(),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(12.dp),
            )
            else -> CircularProgressIndicator(modifier = Modifier.size(28.dp), strokeWidth = 2.dp)
        }
    }
}

@Composable
fun FeedVideo(
    repository: FeedRepository,
    media: FeedMedia,
    playing: Boolean,
    modifier: Modifier = Modifier,
    onEnded: () -> Unit = {},
) {
    val context = LocalContext.current
    val url = media.key?.let { repository.videoUrl(media.path) }
    var error by remember(url) { mutableStateOf<String?>(null) }
    if (url == null) {
        Box(modifier.background(Color.Black), contentAlignment = Alignment.Center) {
            Text("This video can't be opened in the app.", color = Color.White, modifier = Modifier.padding(16.dp))
        }
        return
    }
    val player = remember(url) {
        val sourceFactory = OkHttpDataSource.Factory(repository.http())
            .setUserAgent("FunctionGram-Android")
        val mediaSource = ProgressiveMediaSource.Factory(sourceFactory)
            .createMediaSource(MediaItem.fromUri(url))
        ExoPlayer.Builder(context).build().apply {
            setMediaSource(mediaSource)
            prepare()
            addListener(object : Player.Listener {
                override fun onPlayerError(playbackError: PlaybackException) {
                    error = "Could not play this video."
                }
                override fun onPlaybackStateChanged(playbackState: Int) {
                    if (playbackState == Player.STATE_ENDED) onEnded()
                }
            })
        }
    }
    DisposableEffect(player) {
        onDispose { player.release() }
    }
    LaunchedEffect(playing) {
        player.playWhenReady = playing
    }
    Box(modifier.background(Color.Black), contentAlignment = Alignment.Center) {
        if (error == null) {
            AndroidView(
                factory = { viewContext ->
                    PlayerView(viewContext).apply {
                        this.player = player
                        useController = true
                    }
                },
                modifier = Modifier.fillMaxSize(),
            )
        } else {
            Text(error.orEmpty(), color = Color.White, modifier = Modifier.padding(16.dp))
        }
    }
}

@Composable
fun ZoomableFeedImage(
    repository: FeedRepository,
    media: FeedMedia,
    modifier: Modifier = Modifier,
) {
    val key = media.key
    var bitmap by remember(key) { mutableStateOf<Bitmap?>(null) }
    var message by remember(key) { mutableStateOf<String?>(null) }
    LaunchedEffect(key) {
        if (key == null) {
            message = "This media can't be opened in the app."
            return@LaunchedEffect
        }
        val result = withContext(Dispatchers.IO) { repository.loadImage(media.path) }
        when (result) {
            is FeedCall.Err -> message = result.failure.message
            is FeedCall.Ok -> {
                val decoded = withContext(Dispatchers.Default) { PhotoDecode.decode(result.value, 2048) }
                if (decoded == null) message = "Could not read this photo." else bitmap = decoded
            }
        }
    }
    val image = bitmap
    if (image == null) {
        Box(modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text(message ?: "Loading photo", color = Color.White)
        }
        return
    }
    var scale by remember(key) { mutableFloatStateOf(PhotoGestures.MIN_SCALE) }
    var panX by remember(key) { mutableFloatStateOf(0f) }
    var panY by remember(key) { mutableFloatStateOf(0f) }
    BoxWithConstraints(modifier.fillMaxSize().clipToBounds(), contentAlignment = Alignment.Center) {
        val viewWidth = constraints.maxWidth.toFloat()
        val viewHeight = constraints.maxHeight.toFloat()
        Image(
            bitmap = image.asImageBitmap(),
            contentDescription = media.alt.ifBlank { "Photo" },
            contentScale = ContentScale.Fit,
            modifier = Modifier
                .fillMaxSize()
                .pointerInput(key, viewWidth, viewHeight) {
                    detectTransformGestures { _, pan, zoom, _ ->
                        val next = PhotoGestures.nextScale(scale, zoom)
                        val moved = PhotoGestures.clamp(panX + pan.x, panY + pan.y, next, viewWidth, viewHeight)
                        scale = next
                        panX = moved.x
                        panY = moved.y
                    }
                }
                .pointerInput(key) {
                    detectTapGestures(onDoubleTap = {
                        if (scale > PhotoGestures.MIN_SCALE) {
                            scale = PhotoGestures.MIN_SCALE
                            panX = 0f
                            panY = 0f
                        } else {
                            scale = 2.5f
                        }
                    })
                }
                .graphicsLayer {
                    scaleX = scale
                    scaleY = scale
                    translationX = panX
                    translationY = panY
                },
        )
    }
}

@Composable
fun StoryTray(
    groups: List<List<FeedPost>>,
    viewerId: String?,
    settings: StorySettings,
    onOpen: (String) -> Unit,
) {
    LazyRow(
        contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 12.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        items(groups.size) { index ->
            val group = groups[index]
            val first = group.first()
            val unseen = settings.ring && group.any { !it.seen }
            val label = if (first.authorId == viewerId) "Your story" else first.author.username.ifBlank { first.author.name }
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier.width(72.dp).clickable { onOpen(first.authorId) },
            ) {
                Box(
                    modifier = Modifier
                        .size(64.dp)
                        .clip(CircleShape)
                        .border(2.dp, if (unseen) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outline, CircleShape),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = label.take(1).uppercase(),
                        style = MaterialTheme.typography.titleMedium,
                    )
                }
                Text(
                    text = label,
                    style = MaterialTheme.typography.labelSmall,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(top = 4.dp),
                )
            }
        }
    }
}

@Composable
fun PostCard(
    post: FeedPost,
    repository: FeedRepository,
    zone: ZoneId,
    onOpen: () -> Unit,
    onMedia: (Int) -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 8.dp)
            .clip(RoundedCornerShape(16.dp))
            .background(MaterialTheme.colorScheme.surface)
            .clickable(onClick = onOpen),
    ) {
        Row(Modifier.padding(horizontal = 12.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(post.author.username.ifBlank { post.author.name.ifBlank { "Account" } }, style = MaterialTheme.typography.titleMedium)
                val whenText = FeedTime.format(post.createdAt, zone)
                if (whenText.isNotBlank() || post.location.isNotBlank()) {
                    Text(
                        text = listOf(post.location, whenText).filter { it.isNotBlank() }.joinToString(" · "),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            if (post.kind == "reel" || post.mediaType == "video") {
                Text("Video", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
            }
        }
        if (post.media.isNotEmpty()) {
            val pager = rememberPagerState(pageCount = { post.media.size })
            val aspect = post.media.getOrNull(pager.currentPage)?.aspect?.toFloat()
            val ratio = if (aspect == null || !aspect.isFinite() || aspect <= 0f) 1f else aspect.coerceIn(0.4f, 1.91f)
            Box(Modifier.fillMaxWidth().aspectRatio(ratio)) {
                if (post.mediaType == "video") {
                    Box(
                        Modifier
                            .fillMaxSize()
                            .background(Color.Black)
                            .clickable { onMedia(0) },
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(Icons.Outlined.PlayArrow, contentDescription = "Play video", tint = Color.White, modifier = Modifier.size(48.dp))
                    }
                } else {
                    HorizontalPager(state = pager, modifier = Modifier.fillMaxSize()) { page ->
                        FeedImage(
                            repository = repository,
                            media = post.media[page],
                            modifier = Modifier.fillMaxSize().clickable { onMedia(page) },
                        )
                    }
                }
            }
            if (post.media.size > 1 && post.mediaType != "video") {
                Text(
                    text = "${pager.currentPage + 1} / ${post.media.size}",
                    style = MaterialTheme.typography.labelSmall,
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                )
            }
        }
        Column(Modifier.padding(horizontal = 12.dp, vertical = 10.dp)) {
            val counts = buildList {
                if (post.displayLikes != null) add("${post.displayLikes} likes")
                if (post.displayComments != null) add("${post.displayComments} comments")
                if (post.displayViews != null && post.mediaType == "video") add("${post.displayViews} views")
            }
            if (counts.isNotEmpty()) {
                Text(counts.joinToString(" · "), style = MaterialTheme.typography.bodySmall)
            }
            if (post.liked || post.saved) {
                Text(
                    text = listOfNotNull(if (post.liked) "Liked" else null, if (post.saved) "Saved" else null).joinToString(" · "),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.primary,
                )
            }
            if (post.caption.isNotBlank()) {
                Spacer(Modifier.height(4.dp))
                Text(post.caption, style = MaterialTheme.typography.bodyMedium, maxLines = 4, overflow = TextOverflow.Ellipsis)
            }
            val preview = post.commentPreview
            if (preview != null && preview.body.isNotBlank()) {
                Spacer(Modifier.height(4.dp))
                Text(
                    text = "${preview.username.ifBlank { "Comment" }}  ${preview.body}",
                    style = MaterialTheme.typography.bodySmall,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (post.reelCredit.isNotBlank()) {
                Spacer(Modifier.height(4.dp))
                Text(post.reelCredit, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}
