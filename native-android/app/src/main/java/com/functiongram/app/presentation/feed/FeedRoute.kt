package com.functiongram.app.presentation.feed

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.functiongram.app.data.auth.PublicProfile
import com.functiongram.app.data.feed.FeedDerive
import com.functiongram.app.data.feed.FeedPost
import com.functiongram.app.data.feed.FeedRepository
import com.functiongram.app.data.feed.StoryPlayback
import com.functiongram.app.presentation.messaging.ScreenStatus
import com.functiongram.app.presentation.ui.FgErrorState
import com.functiongram.app.presentation.ui.FgInlineMessage
import com.functiongram.app.presentation.ui.FgLoading
import com.functiongram.app.presentation.ui.FgSecondaryButton
import com.functiongram.app.presentation.ui.FgTextButton
import java.time.ZoneId

@Composable
fun FeedRoute(
    repository: FeedRepository,
    profile: PublicProfile?,
    busy: Boolean,
    onSignOut: () -> Unit,
    zone: ZoneId = ZoneId.systemDefault(),
) {
    val viewModel: FeedViewModel = viewModel(factory = FeedViewModel.factory(repository))
    val state by viewModel.state.collectAsStateWithLifecycle()
    val stories = remember(state.posts, state.flags, state.storySettings, state.viewerId) {
        val visible = FeedDerive.stories(
            posts = state.posts,
            storiesFlag = state.flags.stories,
            settingsEnabled = state.storySettings.enabled,
            nowEpochMillis = System.currentTimeMillis(),
        )
        StoryPlayback.orderGroups(StoryPlayback.groupByAuthor(visible), state.viewerId)
    }
    val showTray = FeedDerive.showTray(state.flags.stories, state.storySettings, stories.flatten())
    Box(Modifier.fillMaxSize()) {
        when {
            state.status == ScreenStatus.Loading && state.posts.isEmpty() -> FgLoading("Loading feed", showSkeleton = true)
            state.status == ScreenStatus.Error && state.posts.isEmpty() -> Column(Modifier.fillMaxSize().padding(24.dp)) {
                FgErrorState(
                    title = "Couldn't load the feed",
                    message = state.message ?: "Something went wrong. Please try again.",
                    actionLabel = "Try again",
                    onAction = viewModel::refresh,
                )
            }
            else -> FeedList(
                state = state,
                stories = stories,
                showTray = showTray,
                zone = zone,
                repository = repository,
                profile = profile,
                busy = busy,
                onSignOut = onSignOut,
                onRefresh = viewModel::refresh,
                onTab = viewModel::selectTab,
                onLoadMore = viewModel::loadMore,
                onOpen = viewModel::openPost,
                onMedia = viewModel::openMedia,
                onStory = { authorId, pool -> viewModel.openStory(authorId, pool) },
                onDismissMessage = viewModel::dismissPageMessage,
            )
        }
        state.detail?.let { detail ->
            PostDetail(
                detail = detail,
                repository = repository,
                zone = zone,
                commentsEnabled = state.flags.comments,
                onClose = viewModel::closeDetail,
                onMedia = viewModel::openMedia,
                onLoadMoreComments = viewModel::loadMoreComments,
            )
        }
        state.story?.let { story ->
            StoryOverlay(
                story = story,
                settings = state.storySettings,
                repository = repository,
                onClose = viewModel::closeStory,
                onGesture = viewModel::storyGesture,
                onPause = viewModel::setStoryPaused,
                onAdvance = viewModel::advanceStory,
            )
        }
        state.media?.let { media ->
            MediaOverlay(
                session = media,
                repository = repository,
                onClose = viewModel::closeMedia,
                onShift = viewModel::shiftMedia,
            )
        }
    }
}

@Composable
private fun FeedList(
    state: FeedUiState,
    stories: List<List<FeedPost>>,
    showTray: Boolean,
    zone: ZoneId,
    repository: FeedRepository,
    profile: PublicProfile?,
    busy: Boolean,
    onSignOut: () -> Unit,
    onRefresh: () -> Unit,
    onTab: (HomeTab) -> Unit,
    onLoadMore: () -> Unit,
    onOpen: (FeedPost) -> Unit,
    onMedia: (FeedPost, Int) -> Unit,
    onStory: (String, List<FeedPost>) -> Unit,
    onDismissMessage: () -> Unit,
) {
    val column = if (state.tab == HomeTab.FOLLOWING) state.following else FeedDerive.columnPosts(state.posts)
    val listState = rememberLazyListState()
    val nearEnd by remember { derivedStateOf { listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index?.let { it >= column.size - 2 } ?: false } }
    LaunchedEffect(nearEnd, column.size, state.tab) {
        if (nearEnd) onLoadMore()
    }
    LazyColumn(
        state = listState,
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        item {
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Column {
                    Text("Home", style = MaterialTheme.typography.headlineSmall)
                    val who = profile?.name?.ifBlank { null } ?: profile?.email
                    if (!who.isNullOrBlank()) {
                        Text(who, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
                FgSecondaryButton(
                    text = if (busy) "Signing out" else "Log out",
                    onClick = onSignOut,
                    enabled = !busy,
                )
            }
        }
        item {
            Row(Modifier.padding(horizontal = 8.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                FgTextButton(text = "For you", onClick = { onTab(HomeTab.FOR_YOU) })
                if (state.flags.follow) {
                    FgTextButton(text = "Following", onClick = { onTab(HomeTab.FOLLOWING) })
                }
                FgTextButton(text = if (state.refreshing) "Refreshing" else "Refresh", onClick = onRefresh)
            }
        }
        if (state.pageMessage != null && state.tab == HomeTab.FOR_YOU) {
            item {
                FgInlineMessage(state.pageMessage, Modifier.padding(horizontal = 16.dp))
                FgTextButton(text = "Dismiss", onClick = onDismissMessage, modifier = Modifier.padding(horizontal = 8.dp))
            }
        }
        if (showTray && state.tab == HomeTab.FOR_YOU) {
            item { StoryTray(stories, state.viewerId, state.storySettings) { authorId -> onStory(authorId, state.posts) } }
        }
        if (state.tab == HomeTab.FOLLOWING && state.followingStatus == ScreenStatus.Loading && column.isEmpty()) {
            item { FgLoading("Loading posts you follow") }
        } else if (state.tab == HomeTab.FOLLOWING && state.followingStatus == ScreenStatus.Error && column.isEmpty()) {
            item {
                FgErrorState(
                    title = "Couldn't load Following",
                    message = state.followingMessage ?: "Something went wrong. Please try again.",
                    actionLabel = "Try again",
                    onAction = { onTab(HomeTab.FOLLOWING) },
                )
            }
        } else if (column.isEmpty() && !state.refreshing) {
            item {
                Column(Modifier.padding(24.dp)) {
                    Text(
                        text = if (state.tab == HomeTab.FOLLOWING) "No posts from people you follow yet." else "No posts yet.",
                        style = MaterialTheme.typography.titleMedium,
                    )
                    Text(
                        text = "Posts that the server returns will show up here.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 6.dp),
                    )
                }
            }
        }
        items(column, key = { it.id }) { post ->
            PostCard(
                post = post,
                repository = repository,
                zone = zone,
                onOpen = {
                    if (post.kind == "story") onStory(post.authorId, if (state.tab == HomeTab.FOLLOWING) state.following else state.posts) else onOpen(post)
                },
                onMedia = { index ->
                    if (post.kind == "story") onStory(post.authorId, if (state.tab == HomeTab.FOLLOWING) state.following else state.posts) else onMedia(post, index)
                },
            )
        }
        if (state.loadingMore) {
            item { FgLoading("Loading more") }
        }
    }
}
