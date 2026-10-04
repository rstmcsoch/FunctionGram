package com.functiongram.app.presentation.feed

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
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
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.functiongram.app.data.feed.FeedCall
import com.functiongram.app.data.feed.FeedDerive
import com.functiongram.app.data.feed.FeedPaging
import com.functiongram.app.data.feed.FeedPost
import com.functiongram.app.data.feed.FeedRepository
import com.functiongram.app.presentation.messaging.ScreenStatus
import com.functiongram.app.presentation.ui.FgErrorState
import com.functiongram.app.presentation.ui.FgInlineMessage
import com.functiongram.app.presentation.ui.FgLoading
import com.functiongram.app.presentation.ui.FgTextButton
import java.time.ZoneId
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

data class ReelsUiState(
    val status: ScreenStatus = ScreenStatus.Loading,
    val message: String? = null,
    val pageMessage: String? = null,
    val posts: List<FeedPost> = emptyList(),
    val fetched: Int = 0,
    val hasMore: Boolean = false,
    val loadingMore: Boolean = false,
    val media: MediaSession? = null,
)

class ReelsViewModel(private val repository: FeedRepository) : ViewModel() {
    private val _state = MutableStateFlow(ReelsUiState())
    val state: StateFlow<ReelsUiState> = _state.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            _state.update { it.copy(status = if (it.posts.isEmpty()) ScreenStatus.Loading else it.status, pageMessage = null) }
            val result = withContext(Dispatchers.IO) { repository.loadReels(0) }
            when (result) {
                is FeedCall.Err -> _state.update {
                    it.copy(
                        status = if (it.posts.isEmpty()) ScreenStatus.Error else ScreenStatus.Ready,
                        message = result.failure.message,
                        pageMessage = if (it.posts.isEmpty()) null else result.failure.message,
                    )
                }
                is FeedCall.Ok -> {
                    val merged = FeedDerive.reelsPlaylist(result.value, repository.notedHome())
                    _state.update {
                        it.copy(
                            status = if (merged.isEmpty()) ScreenStatus.Empty else ScreenStatus.Ready,
                            message = null,
                            posts = merged,
                            fetched = result.value.size,
                            hasMore = FeedPaging.reelsHasMore(result.value.size),
                        )
                    }
                }
            }
        }
    }

    fun loadMore() {
        val current = _state.value
        if (current.loadingMore || !current.hasMore) return
        viewModelScope.launch {
            _state.update { it.copy(loadingMore = true, pageMessage = null) }
            val result = withContext(Dispatchers.IO) { repository.loadReels(current.fetched) }
            when (result) {
                is FeedCall.Err -> _state.update { it.copy(loadingMore = false, pageMessage = result.failure.message) }
                is FeedCall.Ok -> {
                    val merged = FeedDerive.reelsPlaylist(
                        FeedPaging.append(current.posts, result.value),
                        emptyList(),
                    )
                    _state.update {
                        it.copy(
                            loadingMore = false,
                            posts = merged,
                            fetched = current.fetched + result.value.size,
                            hasMore = FeedPaging.reelsHasMore(result.value.size),
                            status = if (merged.isEmpty()) ScreenStatus.Empty else ScreenStatus.Ready,
                        )
                    }
                }
            }
        }
    }

    fun open(post: FeedPost) {
        _state.update { it.copy(media = MediaSession(post, 0)) }
    }

    fun shift(delta: Int) {
        _state.update { state ->
            val media = state.media ?: return@update state
            if (media.post.media.isEmpty()) return@update state
            state.copy(media = media.copy(index = (media.index + delta).coerceIn(0, media.post.media.lastIndex)))
        }
    }

    fun close() {
        _state.update { it.copy(media = null) }
    }

    companion object {
        fun factory(repository: FeedRepository): ViewModelProvider.Factory {
            return object : ViewModelProvider.Factory {
                @Suppress("UNCHECKED_CAST")
                override fun <T : ViewModel> create(modelClass: Class<T>): T = ReelsViewModel(repository) as T
            }
        }
    }
}

@Composable
fun ReelsRoute(repository: FeedRepository, zone: ZoneId = ZoneId.systemDefault()) {
    val viewModel: ReelsViewModel = viewModel(factory = ReelsViewModel.factory(repository))
    val state by viewModel.state.collectAsStateWithLifecycle()
    val listState = rememberLazyListState()
    val nearEnd by remember { derivedStateOf { listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index?.let { it >= state.posts.size - 2 } ?: false } }
    LaunchedEffect(nearEnd, state.posts.size) {
        if (nearEnd) viewModel.loadMore()
    }
    Box(Modifier.fillMaxSize()) {
        when {
            state.status == ScreenStatus.Loading && state.posts.isEmpty() -> FgLoading("Loading reels", showSkeleton = true)
            state.status == ScreenStatus.Error && state.posts.isEmpty() -> FgErrorState(
                title = "Couldn't load reels",
                message = state.message ?: "Something went wrong. Please try again.",
                actionLabel = "Try again",
                onAction = viewModel::refresh,
                modifier = Modifier.padding(24.dp),
            )
            else -> LazyColumn(state = listState, contentPadding = PaddingValues(bottom = 24.dp)) {
                item {
                    Text("Reels", style = MaterialTheme.typography.headlineSmall, modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp))
                    FgTextButton(text = "Refresh", onClick = viewModel::refresh)
                    if (state.pageMessage != null) {
                        FgInlineMessage(state.pageMessage.orEmpty(), Modifier.padding(horizontal = 16.dp))
                    }
                }
                if (state.posts.isEmpty()) {
                    item {
                        Text(
                            "No reels yet.",
                            style = MaterialTheme.typography.titleMedium,
                            modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
                        )
                    }
                }
                items(state.posts, key = { it.id }) { post ->
                    PostCard(
                        post = post,
                        repository = repository,
                        zone = zone,
                        onOpen = { viewModel.open(post) },
                        onMedia = { viewModel.open(post) },
                    )
                }
                if (state.loadingMore) item { FgLoading("Loading more") }
            }
        }
        state.media?.let { media ->
            MediaOverlay(
                session = media,
                repository = repository,
                onClose = viewModel::close,
                onShift = viewModel::shift,
            )
        }
    }
}
