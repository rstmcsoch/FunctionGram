package com.functiongram.app.presentation.directory

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.functiongram.app.data.directory.AccountShell
import com.functiongram.app.data.directory.DirectoryRepository
import com.functiongram.app.data.directory.ThemeChoice
import com.functiongram.app.presentation.ui.FgDialog
import com.functiongram.app.presentation.ui.FgInlineMessage
import com.functiongram.app.presentation.ui.FgPrimaryButton
import com.functiongram.app.presentation.ui.FgSecondaryButton
import com.functiongram.app.presentation.ui.FgTextButton
import com.functiongram.app.presentation.ui.FgTextField

@Composable
fun SettingsRoute(
    repository: DirectoryRepository,
    preferences: DevicePreferences,
    shell: AccountShell?,
    viewerId: String,
    email: String,
    onBack: () -> Unit,
    onSignOut: () -> Unit,
) {
    val viewModel: SettingsViewModel = viewModel(
        key = "settings-$viewerId",
        factory = SettingsViewModel.factory(repository, preferences, viewerId, email),
    )
    val state by viewModel.state.collectAsStateWithLifecycle()
    LaunchedEffect(shell?.me?.id, shell?.flags) { viewModel.bind(shell) }
    Column(Modifier.fillMaxSize()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack) {
                Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Back")
            }
            Text("Settings and privacy", style = MaterialTheme.typography.titleLarge)
        }
        Column(Modifier.verticalScroll(rememberScrollState()).padding(horizontal = 16.dp)) {
            state.notice?.let { FgInlineMessage(it, Modifier.padding(bottom = 8.dp)) }
            Text("Appearance", style = MaterialTheme.typography.titleMedium)
            Text(
                "Theme is kept on this device. FunctionGram does not store it on your account.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(bottom = 8.dp),
            )
            Row {
                ThemeChoice.entries.forEach { choice ->
                    val label = when (choice) {
                        ThemeChoice.LIGHT -> "Light"
                        ThemeChoice.DARK -> "Dark"
                        ThemeChoice.SYSTEM -> "System"
                    }
                    if (state.theme == choice) {
                        FgPrimaryButton(text = label, onClick = { viewModel.setTheme(choice) }, modifier = Modifier.padding(end = 8.dp))
                    } else {
                        FgSecondaryButton(text = label, onClick = { viewModel.setTheme(choice) }, modifier = Modifier.padding(end = 8.dp))
                    }
                }
            }
            val person = state.person
            Text("Account", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 20.dp))
            Text(person?.username?.let { "@$it" } ?: "Signed in", style = MaterialTheme.typography.bodyLarge)
            if (email.isNotBlank()) {
                Text(email, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            if (state.flags?.privateAccounts == true && person != null) {
                Row(Modifier.fillMaxWidth().padding(top = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("Private account", fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold)
                        Text(
                            "Only approved followers can see your posts.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    Switch(
                        checked = person.privateAccount,
                        onCheckedChange = viewModel::setPrivacy,
                        enabled = state.busy != "privacy",
                    )
                }
            }
            if (state.flags?.saves == true) {
                Text("Collections", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 20.dp))
                FgTextField(
                    value = state.collectionDraft,
                    onValueChange = viewModel::setCollectionDraft,
                    label = "New collection",
                    modifier = Modifier.fillMaxWidth(),
                )
                FgPrimaryButton(
                    text = if (state.busy == "collection") "Adding" else "Add",
                    onClick = { viewModel.addCollection(state.collectionDraft) },
                    enabled = state.busy != "collection" && state.collectionDraft.trim().length >= 2,
                    modifier = Modifier.padding(top = 8.dp),
                )
                state.collections.orEmpty().forEach { collection ->
                    Row(Modifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text("${collection.name} · ${collection.postIds.size}", modifier = Modifier.weight(1f))
                        FgTextButton(
                            text = "Delete",
                            onClick = { viewModel.deleteCollection(collection.id) },
                            enabled = state.busy != collection.id,
                        )
                    }
                }
            }
            Text("Email", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 20.dp))
            Text(
                "Changing your email sends a confirmation to the new address. Nothing changes until you open it.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            FgTextField(
                value = state.emailDraft,
                onValueChange = viewModel::setEmailDraft,
                label = "New email",
                modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
            )
            FgSecondaryButton(
                text = if (state.busy == "email") "Sending" else "Change email",
                onClick = viewModel::changeEmail,
                enabled = state.busy != "email" && state.emailDraft.isNotBlank(),
                modifier = Modifier.padding(top = 8.dp),
            )
            Text("Danger zone", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 20.dp))
            Text(
                "Deleting your account emails you a link first. The account stays until you confirm.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            FgSecondaryButton(
                text = "Delete account",
                onClick = { viewModel.setConfirmDelete(true) },
                enabled = state.busy != "delete",
                modifier = Modifier.padding(top = 8.dp),
            )
            FgTextButton(text = "Sign out of this device", onClick = onSignOut, modifier = Modifier.padding(vertical = 12.dp))
        }
    }
    if (state.confirmDelete) {
        FgDialog(
            title = "Delete your account?",
            body = "We'll email you a deletion link. This screen does not delete the account by itself.",
            onDismiss = { viewModel.setConfirmDelete(false) },
            confirmLabel = if (state.busy == "delete") "Sending" else "Email me the link",
            onConfirm = viewModel::deleteAccount,
        )
    }
}
