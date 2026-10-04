package com.functiongram.app.presentation.session

import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.functiongram.app.data.auth.PublicProfile
import com.functiongram.app.presentation.ui.FgCard
import com.functiongram.app.presentation.ui.FgSecondaryButton
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

@Composable
fun SessionHomeRoute(
    profile: PublicProfile?,
    busy: Boolean,
    onSignOut: () -> Unit,
) {
    FgCard(modifier = Modifier.fillMaxWidth()) {
        Text(
            text = profile?.name?.ifBlank { "Signed in" } ?: "Signed in",
            style = MaterialTheme.typography.titleLarge,
        )
        if (!profile?.email.isNullOrBlank()) {
            Spacer(Modifier.height(4.dp))
            Text(
                text = profile?.email.orEmpty(),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.bodyMedium,
            )
        }
        Spacer(Modifier.height(12.dp))
        Text(
            text = expiryLine(profile?.sessionExpiresAtEpochMillis),
            style = MaterialTheme.typography.bodyMedium,
        )
        Spacer(Modifier.height(8.dp))
        Text(
            text = "This session is not extended while you use the app. Sign in again after it expires.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(16.dp))
        FgSecondaryButton(
            text = if (busy) "Signing out" else "Log out",
            onClick = onSignOut,
            enabled = !busy,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

internal fun expiryLine(epochMillis: Long?): String {
    if (epochMillis == null || epochMillis <= 0L || epochMillis == Long.MAX_VALUE) {
        return "Session expiry is set by the server."
    }
    val formatted = Instant.ofEpochMilli(epochMillis)
        .atZone(ZoneId.systemDefault())
        .format(EXPIRY)
    return "Session expires $formatted"
}

private val EXPIRY: DateTimeFormatter = DateTimeFormatter.ofPattern("d MMM yyyy, HH:mm z")
