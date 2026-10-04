package com.functiongram.app.presentation.messaging

import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts.PickVisualMedia
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.automirrored.outlined.Send
import androidx.compose.material.icons.outlined.Image
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.functiongram.app.data.messaging.ChatMessage
import com.functiongram.app.data.messaging.ConversationSummary
import com.functiongram.app.data.messaging.MessageMediaRef
import com.functiongram.app.data.messaging.MessagingCodec
import com.functiongram.app.data.messaging.MessagingCopy
import com.functiongram.app.data.messaging.MessagingRepository
import com.functiongram.app.presentation.ui.FgErrorState
import com.functiongram.app.presentation.ui.FgInlineMessage
import com.functiongram.app.presentation.ui.FgLoading
import com.functiongram.app.presentation.ui.FgTextButton
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

@Composable
fun MessagingRoute(
    repository: MessagingRepository,
    viewerId: String,
    shellBottom: Dp,
    pendingPeerId: String? = null,
    pendingTitle: String = "",
    onPendingPeerConsumed: () -> Unit = {},
) {
    val viewModel: MessagingViewModel = viewModel(
        key = "messages-$viewerId",
        factory = MessagingViewModel.factory(repository, viewerId),
    )
    val state by viewModel.state.collectAsStateWithLifecycle()
    LaunchedEffect(pendingPeerId) {
        val peer = pendingPeerId ?: return@LaunchedEffect
        viewModel.openPeer(peer, pendingTitle)
        onPendingPeerConsumed()
    }
    val context = LocalContext.current
    val picker = rememberLauncherForActivityResult(PickVisualMedia()) { uri: Uri? ->
        if (uri == null) return@rememberLauncherForActivityResult
        viewModel.sendPickedPhoto { PhotoPicker.read(context, uri) }
    }
    val density = LocalDensity.current
    val shellBottomPx = with(density) { shellBottom.roundToPx() }.coerceAtLeast(0)
    val imePx = WindowInsets.ime.getBottom(density).coerceAtLeast(0)
    val extraPx = MessagingLayout.remainingImePaddingPx(shellBottomPx, imePx)
    val extra = with(density) { extraPx.toDp() }

    BackHandler(enabled = state.viewer != null || state.openPeerId != null) {
        when {
            state.viewer != null -> viewModel.closePhoto()
            state.openPeerId != null -> viewModel.closeThread()
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .padding(bottom = extra),
    ) {
        if (state.openPeerId == null) {
            ConversationList(
                state = state,
                onRefresh = viewModel::refreshList,
                onOpen = viewModel::openThread,
            )
        } else {
            ThreadScreen(
                state = state,
                onBack = viewModel::closeThread,
                onRetry = viewModel::retryThread,
                onEarlier = viewModel::loadEarlier,
                onDraft = viewModel::onDraft,
                onSend = viewModel::sendText,
                onPhoto = {
                    picker.launch(PickVisualMediaRequest(PickVisualMedia.ImageOnly))
                },
                onOpenPhoto = viewModel::openPhoto,
            )
        }
    }

    val viewer = state.viewer
    if (viewer != null) {
        Dialog(
            onDismissRequest = viewModel::closePhoto,
            properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false),
        ) {
            PhotoViewer(
                bytes = viewer.bytes,
                status = viewer.status,
                message = viewer.message,
                onClose = viewModel::closePhoto,
                onRetry = viewModel::retryPhoto,
            )
        }
    }
}

@Composable
private fun ConversationList(
    state: MessagingUiState,
    onRefresh: () -> Unit,
    onOpen: (ConversationSummary) -> Unit,
) {
    Column(Modifier.fillMaxSize().padding(horizontal = 16.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(top = 8.dp, bottom = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = "Messages",
                style = MaterialTheme.typography.headlineSmall,
                modifier = Modifier.weight(1f),
            )
            if (state.unreadTotal > 0) {
                Text(
                    text = state.unreadTotal.toString(),
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.padding(end = 4.dp),
                )
            }
            IconButton(onClick = onRefresh) {
                Icon(Icons.Outlined.Refresh, contentDescription = "Refresh conversations")
            }
        }
        if (state.listMessage != null && state.conversations.isNotEmpty()) {
            FgInlineMessage(text = state.listMessage)
            FgTextButton(text = "Try again", onClick = onRefresh)
        }
        when {
            state.listStatus == ScreenStatus.Loading && state.conversations.isEmpty() ->
                FgLoading(message = "Loading conversations", showSkeleton = true)
            state.listStatus == ScreenStatus.Error && state.conversations.isEmpty() ->
                FgErrorState(
                    title = "Messages",
                    message = state.listMessage ?: MessagingCopy.GENERIC,
                    actionLabel = "Try again",
                    onAction = onRefresh,
                )
            state.listStatus == ScreenStatus.Empty ->
                EmptyCopy(
                    title = "No conversations yet",
                    body = "When you message someone, the conversation shows up here.",
                )
            else -> LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(bottom = 12.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                items(state.conversations, key = { it.peerId }) { item ->
                    ConversationRow(item, onClick = { onOpen(item) })
                }
            }
        }
    }
}

@Composable
private fun ConversationRow(item: ConversationSummary, onClick: () -> Unit) {
    val title = if (item.isSelf) "Note to self" else item.name.ifBlank { item.username.ifBlank { "Conversation" } }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .clickable(role = Role.Button, onClick = onClick)
            .padding(horizontal = 8.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(44.dp)
                .clip(CircleShape)
                .background(MaterialTheme.colorScheme.surfaceVariant),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = title.firstOrNull()?.uppercase() ?: "?",
                fontWeight = FontWeight.SemiBold,
            )
        }
        Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(
                text = MessagingCodec.preview(item.lastType, item.lastBody),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Column(horizontalAlignment = Alignment.End) {
            item.lastCreatedAt?.let { created ->
                Text(
                    text = formatWhen(created),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (item.unreadCount > 0 || item.markedUnread) {
                val count = if (item.unreadCount > 0) item.unreadCount.toString() else "1"
                Text(
                    text = count,
                    modifier = Modifier
                        .padding(top = 4.dp)
                        .clip(CircleShape)
                        .background(MaterialTheme.colorScheme.primary)
                        .padding(horizontal = 7.dp, vertical = 2.dp),
                    color = MaterialTheme.colorScheme.onPrimary,
                    style = MaterialTheme.typography.labelSmall,
                )
            }
        }
    }
}

@Composable
private fun ThreadScreen(
    state: MessagingUiState,
    onBack: () -> Unit,
    onRetry: () -> Unit,
    onEarlier: () -> Unit,
    onDraft: (String) -> Unit,
    onSend: () -> Unit,
    onPhoto: () -> Unit,
    onOpenPhoto: (ChatMessage) -> Unit,
) {
    val listState = rememberLazyListState()
    val latestId = state.messages.lastOrNull()?.id
    LaunchedEffect(latestId, state.openPeerId) {
        val last = state.messages.lastIndex
        if (last >= 0) listState.scrollToItem(last)
    }
    Column(Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(start = 4.dp, end = 12.dp, top = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onBack) {
                Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Back to conversations")
            }
            Text(
                text = state.openTitle,
                style = MaterialTheme.typography.titleLarge,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Box(Modifier.weight(1f).fillMaxWidth()) {
            when {
                state.threadStatus == ScreenStatus.Loading && state.messages.isEmpty() ->
                    FgLoading(message = "Loading messages")
                state.threadStatus == ScreenStatus.Error && state.messages.isEmpty() ->
                    FgErrorState(
                        title = "Messages",
                        message = state.threadMessage ?: MessagingCopy.GENERIC,
                        actionLabel = "Try again",
                        onAction = onRetry,
                        modifier = Modifier.padding(horizontal = 16.dp),
                    )
                state.threadStatus == ScreenStatus.Empty ->
                    EmptyCopy(title = "No messages yet", body = "Say hello.")
                else -> LazyColumn(
                    state = listState,
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    if (state.nextCursor != null) {
                        item(key = "earlier") {
                            FgTextButton(
                                text = if (state.loadingEarlier) "Loading…" else "Load earlier messages",
                                onClick = onEarlier,
                                enabled = !state.loadingEarlier,
                                modifier = Modifier.fillMaxWidth(),
                            )
                        }
                    }
                    items(state.messages, key = { it.id }) { message ->
                        MessageBubble(
                            message = message,
                            mine = message.senderId == state.viewerId && state.viewerId.isNotBlank(),
                            onOpenPhoto = { onOpenPhoto(message) },
                        )
                    }
                }
            }
        }
        state.threadMessage?.takeIf { state.messages.isNotEmpty() }?.let { message ->
            FgInlineMessage(text = message, modifier = Modifier.padding(horizontal = 12.dp))
            FgTextButton(text = "Try again", onClick = onRetry, modifier = Modifier.padding(horizontal = 12.dp))
        }
        state.sendMessage?.let { message ->
            FgInlineMessage(text = message, modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp))
        }
        Composer(
            draft = state.draft,
            sending = state.sending,
            onDraft = onDraft,
            onSend = onSend,
            onPhoto = onPhoto,
        )
    }
}

@Composable
private fun MessageBubble(message: ChatMessage, mine: Boolean, onOpenPhoto: () -> Unit) {
    val canOpen = message.messageType == "image" &&
        MessageMediaRef.inAppMessageId(message.mediaUrl, message.id) != null
    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = if (mine) Alignment.End else Alignment.Start,
    ) {
        Column(
            modifier = Modifier
                .widthIn(max = 300.dp)
                .clip(RoundedCornerShape(18.dp))
                .background(
                    if (mine) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant,
                )
                .padding(horizontal = 12.dp, vertical = 8.dp),
        ) {
            if (message.messageType == "image") {
                Text(
                    text = if (canOpen) "Photo" else "Photo unavailable",
                    color = if (mine) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface,
                    fontWeight = FontWeight.SemiBold,
                    modifier = if (canOpen) {
                        Modifier.clickable(role = Role.Button, onClick = onOpenPhoto)
                    } else {
                        Modifier
                    },
                )
            } else if (message.messageType != "text") {
                Text(
                    text = MessagingCodec.preview(message.messageType, null),
                    color = if (mine) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant,
                    style = MaterialTheme.typography.labelMedium,
                )
            }
            if (message.body.isNotBlank()) {
                Text(
                    text = message.body,
                    color = if (mine) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface,
                )
            }
            Text(
                text = formatWhen(message.createdAt),
                style = MaterialTheme.typography.labelSmall,
                color = if (mine) MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.8f)
                else MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun Composer(
    draft: String,
    sending: Boolean,
    onDraft: (String) -> Unit,
    onSend: () -> Unit,
    onPhoto: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 8.dp, vertical = 8.dp),
        verticalAlignment = Alignment.Bottom,
    ) {
        IconButton(onClick = onPhoto, enabled = !sending) {
            Icon(Icons.Outlined.Image, contentDescription = "Send a photo")
        }
        androidx.compose.material3.OutlinedTextField(
            value = draft,
            onValueChange = onDraft,
            modifier = Modifier.weight(1f),
            placeholder = { Text("Message") },
            maxLines = 6,
            enabled = !sending,
        )
        if (sending) {
            CircularProgressIndicator(
                modifier = Modifier.padding(12.dp).size(22.dp),
                strokeWidth = 2.dp,
            )
        } else {
            IconButton(onClick = onSend, enabled = draft.isNotBlank()) {
                Icon(Icons.AutoMirrored.Outlined.Send, contentDescription = "Send")
            }
        }
    }
}

@Composable
private fun EmptyCopy(title: String, body: String) {
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(title, style = MaterialTheme.typography.headlineSmall)
        Text(
            text = body,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 8.dp),
        )
    }
}

private val whenFormat: DateTimeFormatter =
    DateTimeFormatter.ofPattern("d MMM, HH:mm", Locale.US)

internal fun formatWhen(epochMillis: Long, zone: ZoneId = ZoneId.systemDefault()): String {
    if (epochMillis <= 0L) return ""
    return Instant.ofEpochMilli(epochMillis).atZone(zone).format(whenFormat)
}
