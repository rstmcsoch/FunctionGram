package com.functiongram.app.presentation.directory

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.functiongram.app.data.directory.DirectoryPerson
import com.functiongram.app.data.feed.FeedMedia
import com.functiongram.app.data.feed.FeedRepository
import com.functiongram.app.data.feed.PostMediaRef
import com.functiongram.app.presentation.feed.FeedImage

@Composable
fun AccountAvatar(
    repository: FeedRepository,
    username: String,
    avatarPath: String,
    size: Dp,
    onClick: (() -> Unit)? = null,
) {
    val key = PostMediaRef.keyFromPath(avatarPath)
    val modifier = Modifier
        .size(size)
        .clip(CircleShape)
        .then(if (onClick != null) Modifier.clickable(role = Role.Button, onClick = onClick) else Modifier)
    if (key == null) {
        Box(modifier.background(MaterialTheme.colorScheme.surfaceVariant), contentAlignment = Alignment.Center) {
            Text(
                text = username.trim().take(1).uppercase().ifBlank { "?" },
                style = MaterialTheme.typography.titleMedium,
            )
        }
    } else {
        FeedImage(
            repository = repository,
            media = FeedMedia(path = avatarPath, key = key, aspect = 1.0, alt = username),
            modifier = modifier,
            maxSide = 256,
        )
    }
}

@Composable
fun PersonLine(
    repository: FeedRepository,
    person: DirectoryPerson,
    trailing: @Composable () -> Unit,
    onOpen: () -> Unit,
) {
    Row(Modifier.padding(horizontal = 16.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        AccountAvatar(repository, person.username, person.avatarPath, 46.dp, onOpen)
        Column(
            Modifier
                .weight(1f)
                .padding(horizontal = 12.dp)
                .clickable(role = Role.Button, onClick = onOpen),
        ) {
            Text(person.username, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
            val subtitle = buildString {
                append(person.name)
                if (person.demo) append(" · Sample")
            }
            if (subtitle.isNotBlank()) {
                Text(
                    subtitle,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        trailing()
    }
}

@Composable
fun Stat(value: Int, label: String, onClick: (() -> Unit)?) {
    val content: @Composable () -> Unit = {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(value.toString(), fontWeight = FontWeight.SemiBold)
            Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
    if (onClick == null) {
        Box(Modifier.padding(end = 16.dp)) { content() }
    } else {
        Box(Modifier.padding(end = 16.dp).clickable(role = Role.Button, onClick = onClick)) { content() }
    }
}

@Composable
fun FillLoading(message: String) {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Text(message, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
