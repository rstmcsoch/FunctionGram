package com.functiongram.app.presentation.directory

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.functiongram.app.data.directory.DirectoryCopy
import com.functiongram.app.data.directory.DirectoryDerive
import com.functiongram.app.data.directory.DirectoryFlags
import com.functiongram.app.data.directory.DirectoryRepository
import com.functiongram.app.data.feed.FeedRepository
import com.functiongram.app.presentation.feed.FeedImage
import com.functiongram.app.presentation.ui.FgInlineMessage
import com.functiongram.app.presentation.ui.FgLoading
import com.functiongram.app.presentation.ui.FgPrimaryButton
import com.functiongram.app.presentation.ui.FgTextButton
import com.functiongram.app.presentation.ui.FgTextField

@Composable
fun SearchRoute(
    repository: DirectoryRepository,
    feed: FeedRepository,
    recents: RecentSearchStore,
    viewerId: String,
    flags: DirectoryFlags,
    onOpenProfile: (String) -> Unit,
) {
    val viewModel: SearchViewModel = viewModel(
        key = "search-$viewerId",
        factory = SearchViewModel.factory(repository, recents, viewerId),
    )
    val state by viewModel.state.collectAsStateWithLifecycle()
    LaunchedEffect(flags) { viewModel.bind(flags) }
    Column(Modifier.fillMaxSize().padding(horizontal = 16.dp)) {
        Text("Search", style = MaterialTheme.typography.headlineSmall, modifier = Modifier.padding(top = 12.dp))
        Text(
            "People, places, and moments",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (!flags.search) {
            Text(DirectoryCopy.FEATURE_OFF, modifier = Modifier.padding(top = 16.dp))
            return@Column
        }
        FgTextField(
            value = state.query,
            onValueChange = viewModel::setQuery,
            label = "Search",
            modifier = Modifier.fillMaxWidth().padding(vertical = 12.dp),
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            if (state.query.isNotBlank()) FgTextButton(text = "Clear", onClick = { viewModel.setQuery("") })
            if (state.needle != null) FgPrimaryButton(text = "Save search", onClick = viewModel::remember)
        }
        state.notice?.let { FgInlineMessage(it, Modifier.padding(vertical = 8.dp)) }
        if (state.needle == null) {
            if (state.recents.isNotEmpty()) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("Recent", style = MaterialTheme.typography.titleMedium)
                    FgTextButton(text = "Clear all", onClick = viewModel::clearRecents)
                }
                state.recents.forEach { value ->
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(value, modifier = Modifier.clickable { viewModel.setQuery(value) }.padding(vertical = 8.dp))
                        FgTextButton(text = "Remove", onClick = { viewModel.forget(value) })
                    }
                }
            }
            Text("Discover people", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 8.dp))
            val people = DirectoryDerive.discover(state.directory.orEmpty(), viewerId)
            if (state.directory == null) {
                FgLoading("Loading people")
            } else if (people.isEmpty()) {
                Text("No suggestions right now.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            } else {
                LazyColumn(modifier = Modifier.weight(1f), contentPadding = PaddingValues(bottom = 24.dp)) {
                    items(people, key = { it.id }) { person ->
                        PersonLine(
                            repository = feed,
                            person = person,
                            trailing = {
                                if (flags.follow) {
                                    FgTextButton(
                                        text = if (person.followed) "Following" else "Follow",
                                        onClick = { viewModel.follow(person) },
                                        enabled = person.id !in state.pending,
                                    )
                                }
                            },
                            onOpen = { onOpenProfile(person.username) },
                        )
                    }
                }
            }
        } else if (state.searching && state.results == null) {
            FgLoading("Searching")
        } else {
            val results = state.results
            if (results == null) return@Column
            Text("People", style = MaterialTheme.typography.titleMedium)
            if (results.people.isEmpty()) {
                Text("No accounts match ${state.needle}.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            results.people.forEach { person ->
                PersonLine(
                    repository = feed,
                    person = person,
                    trailing = {
                        if (person.id == viewerId) {
                            Text("You")
                        } else if (flags.follow) {
                            FgTextButton(
                                text = if (person.followed) "Following" else "Follow",
                                onClick = { viewModel.follow(person) },
                                enabled = person.id !in state.pending,
                            )
                        }
                    },
                    onOpen = { if (person.username.isNotBlank()) onOpenProfile(person.username) },
                )
            }
            if (results.posts.isNotEmpty()) {
                Text("Posts", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 8.dp))
                LazyVerticalGrid(columns = GridCells.Fixed(3), modifier = Modifier.weight(1f).fillMaxWidth()) {
                    items(results.posts, key = { it.id }) { post ->
                        val media = post.media.firstOrNull()
                        if (media?.key != null) {
                            FeedImage(
                                repository = feed,
                                media = media,
                                modifier = Modifier.padding(1.dp).aspectRatio(1f).clickable { viewModel.openPost(post) },
                                maxSide = 480,
                            )
                        }
                    }
                }
            } else if (results.people.isEmpty()) {
                Text("Nothing found for ${state.needle}.", modifier = Modifier.padding(top = 8.dp))
            }
        }
    }
    state.openPost?.let { post ->
        com.functiongram.app.presentation.feed.PostDetail(
            detail = com.functiongram.app.presentation.feed.DetailState(post = post),
            repository = feed,
            zone = java.time.ZoneId.systemDefault(),
            commentsEnabled = false,
            onClose = viewModel::closePost,
            onMedia = { _, _ -> },
            onLoadMoreComments = {},
        )
    }
}
