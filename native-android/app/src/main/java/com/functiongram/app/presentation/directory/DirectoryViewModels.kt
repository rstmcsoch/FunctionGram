package com.functiongram.app.presentation.directory

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.functiongram.app.data.directory.AccountShell
import com.functiongram.app.data.directory.AppNotification
import com.functiongram.app.data.directory.DirectoryCopy
import com.functiongram.app.data.directory.DirectoryDerive
import com.functiongram.app.data.directory.DirectoryFlags
import com.functiongram.app.data.directory.DirectoryPerson
import com.functiongram.app.data.directory.DirectoryRepository
import com.functiongram.app.data.directory.NotificationGroup
import com.functiongram.app.data.directory.ProfilePaths
import com.functiongram.app.data.directory.ProfileTab
import com.functiongram.app.data.directory.SavedCollection
import com.functiongram.app.data.directory.SearchPage
import com.functiongram.app.data.directory.ThemeChoice
import com.functiongram.app.data.feed.FeedCall
import com.functiongram.app.data.feed.FeedPost
import com.functiongram.app.data.feed.FeedRepository
import com.functiongram.app.presentation.feed.DetailState
import com.functiongram.app.presentation.feed.MediaSession
import com.functiongram.app.presentation.messaging.ScreenStatus
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class ShellSessionViewModel(
    private val repository: DirectoryRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(ShellSessionState())
    val state: StateFlow<ShellSessionState> = _state.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            _state.update { it.copy(status = if (it.shell == null) ScreenStatus.Loading else it.status) }
            when (val result = withContext(Dispatchers.IO) { repository.loadShell() }) {
                is FeedCall.Err -> _state.update {
                    it.copy(
                        status = if (it.shell == null) ScreenStatus.Error else ScreenStatus.Ready,
                        message = result.failure.message,
                    )
                }
                is FeedCall.Ok -> _state.update {
                    it.copy(status = ScreenStatus.Ready, message = null, shell = result.value)
                }
            }
        }
    }

    companion object {
        fun factory(repository: DirectoryRepository) = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T =
                ShellSessionViewModel(repository) as T
        }
    }
}

data class ShellSessionState(
    val status: ScreenStatus = ScreenStatus.Loading,
    val message: String? = null,
    val shell: AccountShell? = null,
)

class ProfileViewModel(
    private val repository: DirectoryRepository,
    private val feed: FeedRepository,
    private val lookup: String,
    private val viewerId: String,
) : ViewModel() {
    private val _state = MutableStateFlow(ProfileUiState())
    val state: StateFlow<ProfileUiState> = _state.asStateFlow()
    private var generation = 0

    init {
        refresh()
    }

    fun refresh() {
        val ticket = ++generation
        viewModelScope.launch {
            _state.update { it.copy(status = ScreenStatus.Loading, message = null) }
            val person = withContext(Dispatchers.IO) { repository.loadPerson(lookup) }
            if (ticket != generation) return@launch
            when (person) {
                is FeedCall.Err -> _state.update {
                    it.copy(status = ScreenStatus.Error, message = person.failure.message, person = null)
                }
                is FeedCall.Ok -> {
                    val value = person.value
                    if (value == null) {
                        _state.update {
                            it.copy(status = ScreenStatus.Empty, message = "This profile is not available.", person = null)
                        }
                    } else {
                        _state.update {
                            it.copy(
                                status = ScreenStatus.Ready,
                                message = null,
                                person = value,
                                linkPath = ProfilePaths.linkPath(value.username),
                            )
                        }
                        loadGrid(value, _state.value.tab, ticket)
                    }
                }
            }
        }
    }

    fun selectTab(tab: ProfileTab, flags: DirectoryFlags) {
        val person = _state.value.person ?: return
        if (tab == ProfileTab.REELS && !flags.reels) return
        if (tab == ProfileTab.SAVED && (person.id != viewerId || !flags.saves)) return
        _state.update { it.copy(tab = tab) }
        loadGrid(person, tab, generation)
    }

    fun follow(flags: DirectoryFlags) {
        val person = _state.value.person ?: return
        if (!flags.follow || person.id == viewerId || person.blocked) return
        val next = !person.followed
        viewModelScope.launch {
            _state.update { it.copy(busy = "follow") }
            val result = withContext(Dispatchers.IO) { repository.follow(person.id, next) }
            _state.update { current ->
                val updated = if (result is FeedCall.Ok && current.person?.id == person.id) {
                    current.person.copy(followed = next)
                } else {
                    current.person
                }
                current.copy(
                    busy = null,
                    person = updated,
                    notice = (result as? FeedCall.Err)?.failure?.message,
                )
            }
        }
    }

    fun block() {
        val person = _state.value.person ?: return
        if (person.id == viewerId) return
        viewModelScope.launch {
            _state.update { it.copy(busy = "block") }
            val result = withContext(Dispatchers.IO) {
                if (person.blocked) repository.unblock(person.id) else repository.block(person.id)
            }
            _state.update { current ->
                if (result is FeedCall.Ok && current.person?.id == person.id) {
                    current.copy(
                        busy = null,
                        notice = null,
                        person = current.person.copy(
                            blocked = !person.blocked,
                            followed = if (person.blocked) current.person.followed else false,
                        ),
                    )
                } else {
                    current.copy(busy = null, notice = (result as? FeedCall.Err)?.failure?.message)
                }
            }
            if (result is FeedCall.Ok) loadGrid(person.copy(blocked = !person.blocked), _state.value.tab, generation)
        }
    }

    fun report(reason: String, details: String) {
        val person = _state.value.person ?: return
        viewModelScope.launch {
            _state.update { it.copy(busy = "report") }
            val result = withContext(Dispatchers.IO) {
                repository.reportProfile(person.id, viewerId, reason, details)
            }
            _state.update {
                it.copy(
                    busy = null,
                    reporting = result is FeedCall.Err,
                    notice = if (result is FeedCall.Ok) "Report sent." else (result as FeedCall.Err).failure.message,
                )
            }
        }
    }

    fun saveProfile(username: String, name: String, bio: String, website: String) {
        val person = _state.value.person ?: return
        if (person.id != viewerId) return
        viewModelScope.launch {
            _state.update { it.copy(busy = "edit", notice = null) }
            val result = withContext(Dispatchers.IO) {
                repository.updateProfile(username, name, bio, website, person.avatarPath)
            }
            if (result is FeedCall.Err) {
                _state.update { it.copy(busy = null, notice = result.failure.message) }
                return@launch
            }
            _state.update { it.copy(busy = null, editing = false) }
            refresh()
        }
    }

    fun openPost(post: FeedPost, commentsEnabled: Boolean) {
        viewModelScope.launch {
            _state.update {
                it.copy(detail = DetailState(post = post, commentsStatus = if (commentsEnabled) ScreenStatus.Loading else ScreenStatus.Idle))
            }
            if (!commentsEnabled) return@launch
            val page = withContext(Dispatchers.IO) { feed.loadComments(post.id, null) }
            _state.update { current ->
                val detail = current.detail ?: return@update current
                if (detail.post.id != post.id) return@update current
                when (page) {
                    is FeedCall.Err -> current.copy(
                        detail = detail.copy(commentsStatus = ScreenStatus.Error, commentsMessage = page.failure.message),
                    )
                    is FeedCall.Ok -> current.copy(
                        detail = detail.copy(
                            commentsStatus = if (page.value.items.isEmpty()) ScreenStatus.Empty else ScreenStatus.Ready,
                            comments = page.value.items,
                            commentsCursor = page.value.nextCursor,
                        ),
                    )
                }
            }
        }
    }

    fun loadMoreComments() {
        val detail = _state.value.detail ?: return
        val cursor = detail.commentsCursor ?: return
        if (detail.loadingMoreComments) return
        viewModelScope.launch {
            _state.update { it.copy(detail = it.detail?.copy(loadingMoreComments = true)) }
            val page = withContext(Dispatchers.IO) { feed.loadComments(detail.post.id, cursor) }
            _state.update { current ->
                val open = current.detail ?: return@update current
                if (open.post.id != detail.post.id) return@update current
                when (page) {
                    is FeedCall.Err -> current.copy(
                        detail = open.copy(loadingMoreComments = false, commentsMessage = page.failure.message),
                    )
                    is FeedCall.Ok -> current.copy(
                        detail = open.copy(
                            loadingMoreComments = false,
                            comments = open.comments + page.value.items,
                            commentsCursor = page.value.nextCursor,
                        ),
                    )
                }
            }
        }
    }

    fun closePost() {
        _state.update { it.copy(detail = null, media = null) }
    }

    fun openMedia(post: FeedPost, index: Int) {
        _state.update { it.copy(media = MediaSession(post, index)) }
    }

    fun shiftMedia(delta: Int) {
        _state.update { current ->
            val media = current.media ?: return@update current
            val next = (media.index + delta).coerceIn(0, media.post.media.lastIndex)
            current.copy(media = media.copy(index = next))
        }
    }

    fun closeMedia() {
        _state.update { it.copy(media = null) }
    }

    fun setEditing(open: Boolean) {
        _state.update { it.copy(editing = open, notice = null) }
    }

    fun setReporting(open: Boolean) {
        _state.update { it.copy(reporting = open) }
    }

    fun clearNotice() {
        _state.update { it.copy(notice = null) }
    }

    fun loadRelations(kind: String, flags: DirectoryFlags) {
        val person = _state.value.person ?: return
        if (!flags.follow) return
        if (kind != "followers" && kind != "following") return
        viewModelScope.launch {
            _state.update { it.copy(relationsKind = kind, relationsMessage = null, relations = emptyList()) }
            when (val result = withContext(Dispatchers.IO) { repository.loadRelations(person.id, kind) }) {
                is FeedCall.Err -> _state.update { it.copy(relationsMessage = result.failure.message) }
                is FeedCall.Ok -> _state.update { it.copy(relations = result.value, relationsMessage = null) }
            }
        }
    }

    fun closeRelations() {
        _state.update { it.copy(relations = null, relationsKind = null, relationsMessage = null) }
    }

    private fun loadGrid(person: DirectoryPerson, tab: ProfileTab, ticket: Int) {
        viewModelScope.launch {
            _state.update { it.copy(postsStatus = ScreenStatus.Loading, postsMessage = null) }
            val result = withContext(Dispatchers.IO) {
                if (tab == ProfileTab.SAVED) repository.loadSaved() else repository.loadProfilePosts(person.id)
            }
            if (ticket != generation && tab != ProfileTab.SAVED) return@launch
            when (result) {
                is FeedCall.Err -> _state.update {
                    it.copy(postsStatus = ScreenStatus.Error, postsMessage = result.failure.message, posts = emptyList())
                }
                is FeedCall.Ok -> {
                    val grid = DirectoryDerive.profileGrid(result.value, person.id, tab)
                    _state.update {
                        it.copy(
                            postsStatus = if (grid.isEmpty()) ScreenStatus.Empty else ScreenStatus.Ready,
                            posts = grid,
                            postsMessage = null,
                        )
                    }
                }
            }
        }
    }

    companion object {
        fun factory(
            repository: DirectoryRepository,
            feed: FeedRepository,
            lookup: String,
            viewerId: String,
        ) = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T =
                ProfileViewModel(repository, feed, lookup, viewerId) as T
        }
    }
}

data class ProfileUiState(
    val status: ScreenStatus = ScreenStatus.Loading,
    val message: String? = null,
    val person: DirectoryPerson? = null,
    val linkPath: String = "",
    val tab: ProfileTab = ProfileTab.POSTS,
    val postsStatus: ScreenStatus = ScreenStatus.Idle,
    val postsMessage: String? = null,
    val posts: List<FeedPost> = emptyList(),
    val relations: List<DirectoryPerson>? = null,
    val relationsKind: String? = null,
    val relationsMessage: String? = null,
    val detail: DetailState? = null,
    val media: MediaSession? = null,
    val editing: Boolean = false,
    val reporting: Boolean = false,
    val busy: String? = null,
    val notice: String? = null,
)

class SearchViewModel(
    private val repository: DirectoryRepository,
    private val recents: RecentSearchStore,
    private val viewerId: String,
) : ViewModel() {
    private val _state = MutableStateFlow(SearchUiState(recents = recents.read()))
    val state: StateFlow<SearchUiState> = _state.asStateFlow()
    private var searchJob: Job? = null
    private var directoryStarted = false

    fun bind(flags: DirectoryFlags) {
        _state.update { it.copy(flags = flags) }
        if (!flags.search || directoryStarted) return
        directoryStarted = true
        loadDirectory()
    }

    fun setQuery(value: String) {
        val needle = DirectoryDerive.searchNeedle(value)
        _state.update { it.copy(query = value, needle = needle, notice = null) }
        searchJob?.cancel()
        if (needle == null || _state.value.flags?.search != true) {
            _state.update { it.copy(results = null, searching = false) }
            return
        }
        searchJob = viewModelScope.launch {
            delay(300)
            _state.update { it.copy(searching = true) }
            when (val result = withContext(Dispatchers.IO) { repository.search(needle) }) {
                is FeedCall.Err -> _state.update {
                    it.copy(searching = false, results = null, notice = result.failure.message)
                }
                is FeedCall.Ok -> _state.update {
                    it.copy(searching = false, results = result.value, notice = null)
                }
            }
        }
    }

    fun remember() {
        val value = _state.value.query
        val next = DirectoryDerive.rememberRecent(_state.value.recents, value)
        recents.write(next)
        _state.update { it.copy(recents = next) }
    }

    fun forget(value: String) {
        val next = DirectoryDerive.forgetRecent(_state.value.recents, value)
        recents.write(next)
        _state.update { it.copy(recents = next) }
    }

    fun clearRecents() {
        recents.write(emptyList())
        _state.update { it.copy(recents = emptyList()) }
    }

    fun openPost(post: FeedPost) {
        _state.update { it.copy(openPost = post) }
    }

    fun closePost() {
        _state.update { it.copy(openPost = null) }
    }

    fun follow(person: DirectoryPerson) {
        val flags = _state.value.flags ?: return
        if (!flags.follow || person.id == viewerId) return
        viewModelScope.launch {
            _state.update { it.copy(pending = it.pending + person.id) }
            val result = withContext(Dispatchers.IO) { repository.follow(person.id, !person.followed) }
            _state.update { current ->
                val results = current.results
                val directory = current.directory
                current.copy(
                    pending = current.pending - person.id,
                    notice = (result as? FeedCall.Err)?.failure?.message,
                    results = if (result is FeedCall.Ok && results != null) {
                        results.copy(people = results.people.map { flip(it, person.id) })
                    } else {
                        results
                    },
                    directory = if (result is FeedCall.Ok && directory != null) {
                        directory.map { flip(it, person.id) }
                    } else {
                        directory
                    },
                )
            }
        }
    }

    private fun loadDirectory() {
        viewModelScope.launch {
            when (val result = withContext(Dispatchers.IO) { repository.loadPeople() }) {
                is FeedCall.Err -> _state.update { it.copy(notice = result.failure.message) }
                is FeedCall.Ok -> _state.update { it.copy(directory = result.value) }
            }
        }
    }

    private fun flip(person: DirectoryPerson, id: String): DirectoryPerson =
        if (person.id == id) person.copy(followed = !person.followed) else person

    companion object {
        fun factory(repository: DirectoryRepository, recents: RecentSearchStore, viewerId: String) =
            object : ViewModelProvider.Factory {
                @Suppress("UNCHECKED_CAST")
                override fun <T : ViewModel> create(modelClass: Class<T>): T =
                    SearchViewModel(repository, recents, viewerId) as T
            }
    }
}

data class SearchUiState(
    val query: String = "",
    val needle: String? = null,
    val searching: Boolean = false,
    val results: SearchPage? = null,
    val directory: List<DirectoryPerson>? = null,
    val recents: List<String> = emptyList(),
    val notice: String? = null,
    val pending: Set<String> = emptySet(),
    val flags: DirectoryFlags? = null,
    val openPost: FeedPost? = null,
)

class NotificationsViewModel(
    private val repository: DirectoryRepository,
    private val feed: FeedRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(NotificationsUiState())
    val state: StateFlow<NotificationsUiState> = _state.asStateFlow()

    fun bind(flags: DirectoryFlags) {
        if (_state.value.flags == flags && _state.value.status != ScreenStatus.Idle) return
        _state.update { it.copy(flags = flags) }
        if (!flags.notifications) {
            _state.update { it.copy(status = ScreenStatus.Error, message = DirectoryCopy.FEATURE_OFF, items = emptyList()) }
            return
        }
        refresh(markRead = true)
    }

    fun refresh(markRead: Boolean) {
        viewModelScope.launch {
            _state.update { it.copy(status = if (it.items.isEmpty()) ScreenStatus.Loading else it.status, message = null) }
            when (val result = withContext(Dispatchers.IO) { repository.loadNotifications() }) {
                is FeedCall.Err -> _state.update {
                    it.copy(
                        status = if (it.items.isEmpty()) ScreenStatus.Error else ScreenStatus.Ready,
                        message = result.failure.message,
                    )
                }
                is FeedCall.Ok -> {
                    _state.update {
                        it.copy(
                            status = if (result.value.isEmpty()) ScreenStatus.Empty else ScreenStatus.Ready,
                            items = result.value,
                            message = null,
                        )
                    }
                    if (markRead && result.value.any { item -> item.readAt == null }) {
                        withContext(Dispatchers.IO) { repository.markNotificationsRead() }
                    }
                }
            }
        }
    }

    fun setFilter(filter: String) {
        _state.update { it.copy(filter = filter) }
    }

    fun openPost(postId: String, commentsEnabled: Boolean) {
        viewModelScope.launch {
            _state.update { it.copy(opening = postId) }
            when (val result = withContext(Dispatchers.IO) { feed.loadPost(postId) }) {
                is FeedCall.Err -> _state.update { it.copy(opening = null, message = result.failure.message) }
                is FeedCall.Ok -> {
                    val post = result.value
                    if (post == null) {
                        _state.update { it.copy(opening = null, message = DirectoryCopy.POST_GONE) }
                    } else {
                        _state.update {
                            it.copy(
                                opening = null,
                                detail = DetailState(
                                    post = post,
                                    commentsStatus = if (commentsEnabled) ScreenStatus.Loading else ScreenStatus.Idle,
                                ),
                            )
                        }
                        if (commentsEnabled) loadComments(post)
                    }
                }
            }
        }
    }

    fun closePost() {
        _state.update { it.copy(detail = null, media = null) }
    }

    fun openMedia(post: FeedPost, index: Int) {
        _state.update { it.copy(media = MediaSession(post, index)) }
    }

    fun shiftMedia(delta: Int) {
        _state.update { current ->
            val media = current.media ?: return@update current
            current.copy(media = media.copy(index = (media.index + delta).coerceIn(0, media.post.media.lastIndex)))
        }
    }

    fun closeMedia() {
        _state.update { it.copy(media = null) }
    }

    private fun loadComments(post: FeedPost) {
        viewModelScope.launch {
            val page = withContext(Dispatchers.IO) { feed.loadComments(post.id, null) }
            _state.update { current ->
                val detail = current.detail ?: return@update current
                if (detail.post.id != post.id) return@update current
                when (page) {
                    is FeedCall.Err -> current.copy(
                        detail = detail.copy(commentsStatus = ScreenStatus.Error, commentsMessage = page.failure.message),
                    )
                    is FeedCall.Ok -> current.copy(
                        detail = detail.copy(
                            commentsStatus = if (page.value.items.isEmpty()) ScreenStatus.Empty else ScreenStatus.Ready,
                            comments = page.value.items,
                            commentsCursor = page.value.nextCursor,
                        ),
                    )
                }
            }
        }
    }

    companion object {
        fun factory(repository: DirectoryRepository, feed: FeedRepository) = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T =
                NotificationsViewModel(repository, feed) as T
        }
    }
}

data class NotificationsUiState(
    val status: ScreenStatus = ScreenStatus.Idle,
    val message: String? = null,
    val items: List<AppNotification> = emptyList(),
    val filter: String = "all",
    val flags: DirectoryFlags? = null,
    val opening: String? = null,
    val detail: DetailState? = null,
    val media: MediaSession? = null,
) {
    val groups: List<NotificationGroup>
        get() = DirectoryDerive.visibleGroups(DirectoryDerive.groups(items), filter)
}

class SettingsViewModel(
    private val repository: DirectoryRepository,
    private val preferences: DevicePreferences,
    private val viewerId: String,
    private val email: String,
) : ViewModel() {
    private val _state = MutableStateFlow(SettingsUiState(email = email, theme = preferences.theme.value))
    val state: StateFlow<SettingsUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            preferences.theme.collect { choice -> _state.update { it.copy(theme = choice) } }
        }
    }

    fun bind(shell: AccountShell?) {
        val me = shell?.me
        _state.update {
            it.copy(
                flags = shell?.flags,
                person = if (me?.id == viewerId) me else it.person,
            )
        }
        if (shell == null) return
        if (_state.value.person?.id != viewerId) loadPerson()
        if (shell.flags.saves && _state.value.collections == null) loadCollections()
    }

    fun setTheme(choice: ThemeChoice) {
        preferences.setTheme(choice)
    }

    fun setPrivacy(privateAccount: Boolean) {
        val flags = _state.value.flags ?: return
        if (!flags.privateAccounts) return
        val previous = _state.value.person?.privateAccount
        _state.update { current ->
            current.copy(person = current.person?.copy(privateAccount = privateAccount), notice = null)
        }
        viewModelScope.launch {
            _state.update { it.copy(busy = "privacy") }
            when (val result = withContext(Dispatchers.IO) { repository.setPrivacy(privateAccount) }) {
                is FeedCall.Err -> _state.update { current ->
                    current.copy(
                        busy = null,
                        notice = result.failure.message,
                        person = if (previous == null) current.person else current.person?.copy(privateAccount = previous),
                    )
                }
                is FeedCall.Ok -> _state.update { current ->
                    current.copy(
                        busy = null,
                        person = current.person?.copy(privateAccount = result.value.privateAccount),
                    )
                }
            }
        }
    }

    fun addCollection(name: String) {
        if (_state.value.flags?.saves != true) return
        viewModelScope.launch {
            _state.update { it.copy(busy = "collection", notice = null) }
            when (val result = withContext(Dispatchers.IO) { repository.createCollection(name) }) {
                is FeedCall.Err -> _state.update { it.copy(busy = null, notice = result.failure.message) }
                is FeedCall.Ok -> {
                    _state.update { it.copy(busy = null, collectionDraft = "") }
                    loadCollections()
                }
            }
        }
    }

    fun deleteCollection(id: String) {
        viewModelScope.launch {
            _state.update { it.copy(busy = id) }
            when (val result = withContext(Dispatchers.IO) { repository.deleteCollection(id) }) {
                is FeedCall.Err -> _state.update { it.copy(busy = null, notice = result.failure.message) }
                is FeedCall.Ok -> _state.update { current ->
                    current.copy(busy = null, collections = current.collections?.filter { it.id != id })
                }
            }
        }
    }

    fun setCollectionDraft(value: String) {
        _state.update { it.copy(collectionDraft = value) }
    }

    fun setEmailDraft(value: String) {
        _state.update { it.copy(emailDraft = value, notice = null) }
    }

    fun changeEmail() {
        viewModelScope.launch {
            _state.update { it.copy(busy = "email") }
            when (val result = withContext(Dispatchers.IO) { repository.requestEmailChange(_state.value.emailDraft) }) {
                is FeedCall.Err -> _state.update { it.copy(busy = null, notice = result.failure.message) }
                is FeedCall.Ok -> _state.update {
                    it.copy(busy = null, emailDraft = "", notice = DirectoryCopy.EMAIL_SENT)
                }
            }
        }
    }

    fun deleteAccount() {
        viewModelScope.launch {
            _state.update { it.copy(busy = "delete") }
            when (val result = withContext(Dispatchers.IO) { repository.requestAccountDeletion() }) {
                is FeedCall.Err -> _state.update { it.copy(busy = null, confirmDelete = true, notice = result.failure.message) }
                is FeedCall.Ok -> _state.update {
                    it.copy(busy = null, confirmDelete = false, notice = DirectoryCopy.DELETE_SENT)
                }
            }
        }
    }

    fun setConfirmDelete(open: Boolean) {
        _state.update { it.copy(confirmDelete = open) }
    }

    private fun loadPerson() {
        viewModelScope.launch {
            when (val result = withContext(Dispatchers.IO) { repository.loadPerson(viewerId) }) {
                is FeedCall.Err -> _state.update { it.copy(notice = result.failure.message) }
                is FeedCall.Ok -> _state.update { it.copy(person = result.value) }
            }
        }
    }

    private fun loadCollections() {
        viewModelScope.launch {
            when (val result = withContext(Dispatchers.IO) { repository.loadCollections() }) {
                is FeedCall.Err -> _state.update { it.copy(collections = emptyList(), notice = result.failure.message) }
                is FeedCall.Ok -> _state.update { it.copy(collections = result.value) }
            }
        }
    }

    companion object {
        fun factory(
            repository: DirectoryRepository,
            preferences: DevicePreferences,
            viewerId: String,
            email: String,
        ) = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T =
                SettingsViewModel(repository, preferences, viewerId, email) as T
        }
    }
}

data class SettingsUiState(
    val email: String = "",
    val theme: ThemeChoice = ThemeChoice.SYSTEM,
    val flags: DirectoryFlags? = null,
    val person: DirectoryPerson? = null,
    val collections: List<SavedCollection>? = null,
    val collectionDraft: String = "",
    val emailDraft: String = "",
    val busy: String? = null,
    val notice: String? = null,
    val confirmDelete: Boolean = false,
)
