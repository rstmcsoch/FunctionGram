package com.functiongram.app.presentation.messaging

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.functiongram.app.data.messaging.ChatMessage
import com.functiongram.app.data.messaging.ConversationSummary
import com.functiongram.app.data.messaging.MessageMediaRef
import com.functiongram.app.data.messaging.MessagingCall
import com.functiongram.app.data.messaging.MessagingRepository
import com.functiongram.app.data.messaging.PhotoPayload
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class MessagingViewModel(
    private val repository: MessagingRepository,
    private val viewerId: String,
) : ViewModel() {
    private val _state = kotlinx.coroutines.flow.MutableStateFlow(MessagingUiState(viewerId = viewerId))
    val state: kotlinx.coroutines.flow.StateFlow<MessagingUiState> = _state

    private var listJob: Job? = null
    private var threadJob: Job? = null
    private var listGeneration = 0
    private var threadGeneration = 0

    init {
        refreshList()
    }

    fun refreshList() {
        val generation = ++listGeneration
        listJob?.cancel()
        listJob = viewModelScope.launch {
            _state.update { current ->
                current.copy(
                    listStatus = if (current.conversations.isEmpty()) ScreenStatus.Loading else current.listStatus,
                    listMessage = null,
                )
            }
            val result = withContext(Dispatchers.IO) { repository.listConversations() }
            if (generation != listGeneration) return@launch
            when (result) {
                is MessagingCall.Err -> _state.update { current ->
                    current.copy(
                        listStatus = if (current.conversations.isEmpty()) ScreenStatus.Error else ScreenStatus.Ready,
                        listMessage = result.failure.message,
                    )
                }
                is MessagingCall.Ok -> _state.update { current ->
                    current.copy(
                        listStatus = if (result.value.items.isEmpty()) ScreenStatus.Empty else ScreenStatus.Ready,
                        conversations = result.value.items,
                        unreadTotal = result.value.unreadTotal,
                        listMessage = null,
                    )
                }
            }
        }
    }

    fun openThread(summary: ConversationSummary) {
        _state.update {
            it.copy(
                openPeerId = summary.peerId,
                openTitle = titleFor(summary),
                threadStatus = ScreenStatus.Loading,
                messages = emptyList(),
                nextCursor = null,
                threadMessage = null,
                sendMessage = null,
                viewer = null,
            )
        }
        loadThread(summary.peerId, cursor = null, prepend = false)
    }

    fun closeThread() {
        threadGeneration++
        threadJob?.cancel()
        _state.update {
            it.copy(
                openPeerId = null,
                openTitle = "",
                threadStatus = ScreenStatus.Idle,
                messages = emptyList(),
                nextCursor = null,
                threadMessage = null,
                sendMessage = null,
                draft = "",
                sending = false,
                viewer = null,
            )
        }
    }

    fun retryThread() {
        val peer = _state.value.openPeerId ?: return
        loadThread(peer, cursor = null, prepend = false)
    }

    fun loadEarlier() {
        val current = _state.value
        val peer = current.openPeerId ?: return
        val cursor = current.nextCursor ?: return
        if (current.loadingEarlier) return
        loadThread(peer, cursor, prepend = true)
    }

    fun onDraft(value: String) {
        _state.update { it.copy(draft = value) }
    }

    fun sendText() {
        val current = _state.value
        val peer = current.openPeerId ?: return
        val body = current.draft
        if (body.trim().isEmpty() || current.sending) return
        send(peer, body) {
            withContext(Dispatchers.IO) { repository.sendText(peer, body) }
        }
    }

    fun sendPickedPhoto(read: () -> PhotoPayload) {
        val peer = _state.value.openPeerId ?: return
        if (_state.value.sending) return
        _state.update { it.copy(sending = true, sendMessage = null) }
        viewModelScope.launch {
            val photo = try {
                withContext(Dispatchers.IO) { read() }
            } catch (error: IllegalStateException) {
                _state.update { it.copy(sendMessage = error.message ?: com.functiongram.app.data.messaging.MessagingCopy.CHOOSE_FILE, sending = false) }
                return@launch
            } catch (_: SecurityException) {
                _state.update { it.copy(sendMessage = com.functiongram.app.data.messaging.MessagingCopy.CHOOSE_FILE, sending = false) }
                return@launch
            }
            val caption = _state.value.draft
            send(peer, caption) {
                withContext(Dispatchers.IO) { repository.sendPhoto(peer, caption, photo) }
            }
        }
    }

    fun noteSendFailure(message: String) {
        _state.update { it.copy(sendMessage = message, sending = false) }
    }

    fun sendPhoto(photo: PhotoPayload) {
        val current = _state.value
        val peer = current.openPeerId ?: return
        if (current.sending) return
        val caption = current.draft
        send(peer, caption) {
            withContext(Dispatchers.IO) { repository.sendPhoto(peer, caption, photo) }
        }
    }

    fun openPhoto(message: ChatMessage) {
        val id = MessageMediaRef.inAppMessageId(message.mediaUrl, message.id) ?: run {
            _state.update {
                it.copy(
                    viewer = PhotoViewerState(
                        messageId = message.id,
                        status = ScreenStatus.Error,
                        bytes = null,
                        message = "This photo cannot be opened in the app.",
                    ),
                )
            }
            return
        }
        _state.update {
            it.copy(viewer = PhotoViewerState(messageId = id, status = ScreenStatus.Loading, bytes = null, message = null))
        }
        viewModelScope.launch {
            val result = withContext(Dispatchers.IO) { repository.loadPhoto(id) }
            _state.update { current ->
                val viewer = current.viewer
                if (viewer == null || viewer.messageId != id) return@update current
                when (result) {
                    is MessagingCall.Err -> current.copy(
                        viewer = viewer.copy(status = ScreenStatus.Error, bytes = null, message = result.failure.message),
                    )
                    is MessagingCall.Ok -> current.copy(
                        viewer = viewer.copy(status = ScreenStatus.Ready, bytes = result.value, message = null),
                    )
                }
            }
        }
    }

    fun retryPhoto() {
        val viewer = _state.value.viewer ?: return
        val message = _state.value.messages.firstOrNull { it.id == viewer.messageId } ?: return
        openPhoto(message)
    }

    fun closePhoto() {
        _state.update { it.copy(viewer = null) }
    }

    fun dismissSendError() {
        _state.update { it.copy(sendMessage = null) }
    }

    private fun loadThread(peerId: String, cursor: String?, prepend: Boolean) {
        val generation = if (prepend) threadGeneration else ++threadGeneration
        if (!prepend) threadJob?.cancel()
        threadJob = viewModelScope.launch {
            if (prepend) {
                _state.update { it.copy(loadingEarlier = true, threadMessage = null) }
            } else {
                _state.update { current ->
                    current.copy(
                        threadStatus = if (current.messages.isEmpty()) ScreenStatus.Loading else current.threadStatus,
                        threadMessage = null,
                    )
                }
            }
            val result = withContext(Dispatchers.IO) { repository.loadThread(peerId, cursor) }
            if (generation != threadGeneration || _state.value.openPeerId != peerId) return@launch
            when (result) {
                is MessagingCall.Err -> _state.update { current ->
                    current.copy(
                        loadingEarlier = false,
                        threadStatus = if (current.messages.isEmpty()) ScreenStatus.Error else ScreenStatus.Ready,
                        threadMessage = result.failure.message,
                    )
                }
                is MessagingCall.Ok -> {
                    _state.update { current ->
                        val page = result.value.chronological()
                        val merged = if (prepend) page + current.messages else page
                        current.copy(
                            loadingEarlier = false,
                            threadStatus = if (merged.isEmpty()) ScreenStatus.Empty else ScreenStatus.Ready,
                            messages = merged,
                            nextCursor = result.value.nextCursor,
                            threadMessage = null,
                        )
                    }
                    if (!prepend) markRead(peerId)
                }
            }
        }
    }

    private fun markRead(peerId: String) {
        viewModelScope.launch {
            val result = withContext(Dispatchers.IO) { repository.markRead(peerId) }
            if (result is MessagingCall.Err && _state.value.openPeerId == peerId) {
                // The thread itself loaded. A failed read receipt must not hide it.
                // A dead session is the one case the banner has to surface.
                if (result.failure.kind == com.functiongram.app.data.messaging.MessagingFailureKind.SIGN_IN) {
                    _state.update { it.copy(threadMessage = result.failure.message) }
                }
            } else if (result is MessagingCall.Ok) {
                refreshList()
            }
        }
    }

    private fun send(peerId: String, draftSnapshot: String, call: suspend () -> MessagingCall<ChatMessage>) {
        _state.update { it.copy(sending = true, sendMessage = null) }
        viewModelScope.launch {
            val result = call()
            if (_state.value.openPeerId != peerId) {
                _state.update { it.copy(sending = false) }
                return@launch
            }
            when (result) {
                is MessagingCall.Err -> _state.update { it.copy(sending = false, sendMessage = result.failure.message) }
                is MessagingCall.Ok -> _state.update { current ->
                    val withoutDuplicate = current.messages.filterNot { it.id == result.value.id }
                    current.copy(
                        sending = false,
                        sendMessage = null,
                        draft = if (current.draft == draftSnapshot) "" else current.draft,
                        threadStatus = ScreenStatus.Ready,
                        messages = withoutDuplicate + result.value,
                    )
                }
            }
            if (result is MessagingCall.Ok) refreshList()
        }
    }

    private fun titleFor(summary: ConversationSummary): String {
        if (summary.isSelf) return "Note to self"
        return summary.name.ifBlank { summary.username.ifBlank { "Conversation" } }
    }

    private inline fun kotlinx.coroutines.flow.MutableStateFlow<MessagingUiState>.update(
        block: (MessagingUiState) -> MessagingUiState,
    ) {
        while (true) {
            val current = value
            val next = block(current)
            if (compareAndSet(current, next)) return
        }
    }

    companion object {
        fun factory(repository: MessagingRepository, viewerId: String): ViewModelProvider.Factory {
            return object : ViewModelProvider.Factory {
                @Suppress("UNCHECKED_CAST")
                override fun <T : ViewModel> create(modelClass: Class<T>): T {
                    return MessagingViewModel(repository, viewerId) as T
                }
            }
        }
    }
}
