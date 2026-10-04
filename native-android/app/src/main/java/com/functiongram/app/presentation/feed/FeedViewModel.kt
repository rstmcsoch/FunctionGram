package com.functiongram.app.presentation.feed

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.functiongram.app.data.feed.CommentPage
import com.functiongram.app.data.feed.FeedCall
import com.functiongram.app.data.feed.FeedComment
import com.functiongram.app.data.feed.FeedDerive
import com.functiongram.app.data.feed.FeedFlags
import com.functiongram.app.data.feed.FeedPost
import com.functiongram.app.data.feed.FeedRepository
import com.functiongram.app.data.feed.StorySettings
import com.functiongram.app.presentation.messaging.ScreenStatus
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

enum class HomeTab { FOR_YOU, FOLLOWING }

data class DetailState(
    val post: FeedPost,
    val commentsStatus: ScreenStatus = ScreenStatus.Idle,
    val comments: List<FeedComment> = emptyList(),
    val commentsCursor: String? = null,
    val commentsMessage: String? = null,
    val loadingMoreComments: Boolean = false,
)

data class StorySession(
    val groups: List<List<FeedPost>>,
    val authorIndex: Int,
    val segmentIndex: Int,
    val paused: Boolean = false,
)

data class MediaSession(
    val post: FeedPost,
    val index: Int,
)

data class FeedUiState(
    val status: ScreenStatus = ScreenStatus.Loading,
    val message: String? = null,
    val pageMessage: String? = null,
    val tab: HomeTab = HomeTab.FOR_YOU,
    val flags: FeedFlags = FeedFlags(),
    val storySettings: StorySettings = StorySettings(),
    val viewerId: String? = null,
    val posts: List<FeedPost> = emptyList(),
    val hasMore: Boolean = false,
    val following: List<FeedPost> = emptyList(),
    val followingHasMore: Boolean = false,
    val followingStatus: ScreenStatus = ScreenStatus.Idle,
    val followingMessage: String? = null,
    val loadingMore: Boolean = false,
    val refreshing: Boolean = false,
    val detail: DetailState? = null,
    val story: StorySession? = null,
    val media: MediaSession? = null,
)

class FeedViewModel(
    private val repository: FeedRepository,
    private val clock: () -> Long = { System.currentTimeMillis() },
) : ViewModel() {
    private val _state = MutableStateFlow(FeedUiState())
    val state: StateFlow<FeedUiState> = _state.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            _state.update { it.copy(refreshing = it.posts.isNotEmpty(), status = if (it.posts.isEmpty()) ScreenStatus.Loading else it.status, pageMessage = null) }
            val result = withContext(Dispatchers.IO) { repository.loadHome() }
            when (result) {
                is FeedCall.Err -> _state.update {
                    it.copy(
                        status = if (it.posts.isEmpty()) ScreenStatus.Error else ScreenStatus.Ready,
                        message = result.failure.message,
                        pageMessage = if (it.posts.isEmpty()) null else result.failure.message,
                        refreshing = false,
                    )
                }
                is FeedCall.Ok -> {
                    repository.noteHome(result.value.posts)
                    _state.update {
                        val flags = result.value.flags
                        val tab = if (!flags.follow && it.tab == HomeTab.FOLLOWING) HomeTab.FOR_YOU else it.tab
                        it.copy(
                            status = if (result.value.posts.isEmpty()) ScreenStatus.Empty else ScreenStatus.Ready,
                            message = null,
                            pageMessage = null,
                            flags = flags,
                            storySettings = result.value.storySettings,
                            viewerId = result.value.viewerId,
                            posts = result.value.posts,
                            hasMore = result.value.hasMore,
                            refreshing = false,
                            tab = tab,
                            following = emptyList(),
                            followingHasMore = false,
                            followingStatus = ScreenStatus.Idle,
                            followingMessage = null,
                        )
                    }
                    if (_state.value.tab == HomeTab.FOLLOWING) loadFollowing(reset = true)
                }
            }
        }
    }

    fun selectTab(tab: HomeTab) {
        val flags = _state.value.flags
        if (tab == HomeTab.FOLLOWING && !flags.follow) return
        _state.update { it.copy(tab = tab, pageMessage = null) }
        val status = _state.value.followingStatus
        if (tab == HomeTab.FOLLOWING && (status == ScreenStatus.Idle || status == ScreenStatus.Error)) {
            loadFollowing(reset = true)
        }
    }

    fun loadMore() {
        val current = _state.value
        if (current.loadingMore) return
        if (current.tab == HomeTab.FOLLOWING) {
            if (!current.followingHasMore) return
            loadFollowing(reset = false)
            return
        }
        if (!current.hasMore) return
        viewModelScope.launch {
            _state.update { it.copy(loadingMore = true, pageMessage = null) }
            val offset = current.posts.size
            val result = withContext(Dispatchers.IO) { repository.loadOffset(offset) }
            when (result) {
                is FeedCall.Err -> _state.update { it.copy(loadingMore = false, pageMessage = result.failure.message) }
                is FeedCall.Ok -> {
                    val merged = com.functiongram.app.data.feed.FeedPaging.append(current.posts, result.value)
                    repository.noteHome(merged)
                    _state.update {
                        it.copy(
                            loadingMore = false,
                            posts = merged,
                            hasMore = com.functiongram.app.data.feed.FeedPaging.offsetHasMore(result.value.size),
                            status = if (merged.isEmpty()) ScreenStatus.Empty else ScreenStatus.Ready,
                        )
                    }
                }
            }
        }
    }

    fun openPost(post: FeedPost) {
        _state.update {
            it.copy(
                detail = DetailState(
                    post = post,
                    commentsStatus = if (it.flags.comments) ScreenStatus.Loading else ScreenStatus.Idle,
                ),
            )
        }
        viewModelScope.launch {
            val fresh = withContext(Dispatchers.IO) { repository.loadPost(post.id) }
            when (fresh) {
                is FeedCall.Err -> _state.update { state ->
                    val detail = state.detail ?: return@update state
                    if (detail.post.id != post.id) state else state.copy(pageMessage = fresh.failure.message)
                }
                is FeedCall.Ok -> {
                    val resolved = fresh.value
                    if (resolved == null) {
                        _state.update { it.copy(detail = null, pageMessage = "This post is no longer available.") }
                    } else {
                        _state.update { state ->
                            val detail = state.detail ?: return@update state
                            if (detail.post.id != post.id) state else state.copy(detail = detail.copy(post = resolved))
                        }
                    }
                }
            }
        }
        if (_state.value.flags.comments) loadComments(post.id, cursor = null)
    }

    fun closeDetail() {
        _state.update { it.copy(detail = null) }
    }

    fun loadMoreComments() {
        val detail = _state.value.detail ?: return
        val cursor = detail.commentsCursor ?: return
        if (detail.loadingMoreComments || !_state.value.flags.comments) return
        loadComments(detail.post.id, cursor)
    }

    fun openStory(authorId: String, pool: List<FeedPost>) {
        val current = _state.value
        val visible = FeedDerive.stories(
            posts = pool,
            storiesFlag = current.flags.stories,
            settingsEnabled = current.storySettings.enabled,
            nowEpochMillis = clock(),
        )
        val groups = com.functiongram.app.data.feed.StoryPlayback.orderGroups(
            com.functiongram.app.data.feed.StoryPlayback.groupByAuthor(visible),
            current.viewerId,
        )
        if (groups.isEmpty()) return
        val cursor = com.functiongram.app.data.feed.StoryPlayback.cursorForAuthor(
            groups.map { it.first().authorId },
            authorId,
        )
        _state.update {
            it.copy(story = StorySession(groups, cursor.author, cursor.segment, paused = false))
        }
    }

    fun storyGesture(durationMs: Long, dx: Float, dy: Float, startXRatio: Float) {
        when (val gesture = com.functiongram.app.data.feed.StoryPlayback.classify(durationMs, dx, dy, startXRatio)) {
            is com.functiongram.app.data.feed.StoryGesture.Tap -> stepStory(if (gesture.side == "left") -1 else 1, wholeAuthor = false)
            is com.functiongram.app.data.feed.StoryGesture.Swipe -> stepStory(if (gesture.direction == "next") 1 else -1, wholeAuthor = true)
            com.functiongram.app.data.feed.StoryGesture.Hold -> Unit
        }
    }

    fun setStoryPaused(paused: Boolean) {
        _state.update { state ->
            val story = state.story ?: return@update state
            state.copy(story = story.copy(paused = paused))
        }
    }

    fun advanceStory() {
        stepStory(1, wholeAuthor = false)
    }

    fun closeStory() {
        _state.update { it.copy(story = null) }
    }

    fun openMedia(post: FeedPost, index: Int) {
        if (post.media.isEmpty()) return
        val safe = index.coerceIn(0, post.media.lastIndex)
        _state.update { it.copy(media = MediaSession(post, safe)) }
    }

    fun shiftMedia(delta: Int) {
        _state.update { state ->
            val media = state.media ?: return@update state
            if (media.post.media.isEmpty()) return@update state
            val next = (media.index + delta).coerceIn(0, media.post.media.lastIndex)
            state.copy(media = media.copy(index = next))
        }
    }

    fun closeMedia() {
        _state.update { it.copy(media = null) }
    }

    fun dismissPageMessage() {
        _state.update { it.copy(pageMessage = null) }
    }

    private fun stepStory(direction: Int, wholeAuthor: Boolean) {
        val story = _state.value.story ?: return
        val lengths = story.groups.map { it.size }
        val cursor = com.functiongram.app.data.feed.StoryCursor(story.authorIndex, story.segmentIndex)
        val next = if (wholeAuthor) {
            com.functiongram.app.data.feed.StoryPlayback.stepAuthor(lengths, cursor, direction)
        } else {
            com.functiongram.app.data.feed.StoryPlayback.stepSegment(lengths, cursor, direction)
        }
        if (next == null) {
            closeStory()
        } else {
            _state.update {
                it.copy(story = story.copy(authorIndex = next.author, segmentIndex = next.segment, paused = false))
            }
        }
    }

    private fun loadFollowing(reset: Boolean) {
        val current = _state.value
        if (current.loadingMore && !reset) return
        viewModelScope.launch {
            _state.update {
                it.copy(
                    loadingMore = !reset && it.following.isNotEmpty(),
                    followingStatus = if (reset && it.following.isEmpty()) ScreenStatus.Loading else it.followingStatus,
                    followingMessage = null,
                )
            }
            val offset = if (reset) 0 else current.following.size
            val result = withContext(Dispatchers.IO) { repository.loadFollowing(offset) }
            when (result) {
                is FeedCall.Err -> _state.update {
                    it.copy(
                        loadingMore = false,
                        followingStatus = if (it.following.isEmpty() || reset) ScreenStatus.Error else it.followingStatus,
                        followingMessage = result.failure.message,
                    )
                }
                is FeedCall.Ok -> {
                    val merged = if (reset) result.value.posts else com.functiongram.app.data.feed.FeedPaging.append(current.following, result.value.posts)
                    _state.update {
                        it.copy(
                            loadingMore = false,
                            following = merged,
                            followingHasMore = result.value.hasMore,
                            followingStatus = if (merged.isEmpty()) ScreenStatus.Empty else ScreenStatus.Ready,
                            followingMessage = null,
                        )
                    }
                }
            }
        }
    }

    private fun loadComments(postId: String, cursor: String?) {
        viewModelScope.launch {
            if (cursor != null) {
                _state.update { state ->
                    val detail = state.detail ?: return@update state
                    if (detail.post.id != postId) state else state.copy(detail = detail.copy(loadingMoreComments = true))
                }
            }
            val result = withContext(Dispatchers.IO) { repository.loadComments(postId, cursor) }
            _state.update { state ->
                val detail = state.detail ?: return@update state
                if (detail.post.id != postId) return@update state
                when (result) {
                    is FeedCall.Err -> state.copy(
                        detail = detail.copy(
                            commentsStatus = if (detail.comments.isEmpty()) ScreenStatus.Error else ScreenStatus.Ready,
                            commentsMessage = result.failure.message,
                            loadingMoreComments = false,
                        ),
                    )
                    is FeedCall.Ok -> state.copy(detail = applyComments(detail, result.value, cursor))
                }
            }
        }
    }

    private fun applyComments(detail: DetailState, page: CommentPage, cursor: String?): DetailState {
        val merged = if (cursor == null) page.items else detail.comments + page.items.filter { item ->
            detail.comments.none { it.id == item.id }
        }
        return detail.copy(
            commentsStatus = if (merged.isEmpty()) ScreenStatus.Empty else ScreenStatus.Ready,
            comments = merged,
            commentsCursor = page.nextCursor,
            commentsMessage = null,
            loadingMoreComments = false,
        )
    }

    companion object {
        fun factory(repository: FeedRepository): ViewModelProvider.Factory {
            return object : ViewModelProvider.Factory {
                @Suppress("UNCHECKED_CAST")
                override fun <T : ViewModel> create(modelClass: Class<T>): T {
                    return FeedViewModel(repository) as T
                }
            }
        }
    }
}
