package com.functiongram.app.presentation.auth

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.functiongram.app.R
import com.functiongram.app.data.auth.AuthCopy
import com.functiongram.app.presentation.ui.FgErrorState
import com.functiongram.app.presentation.ui.FgGlassCard
import com.functiongram.app.presentation.ui.FgInlineMessage
import com.functiongram.app.presentation.ui.FgPrimaryButton
import com.functiongram.app.presentation.ui.FgTextButton
import com.functiongram.app.presentation.ui.FgTextField
import com.functiongram.app.presentation.ui.FgWordmark

@Composable
fun SignInRoute(
    state: AuthUiState,
    onSignIn: (email: String, password: String) -> Unit,
    onVerify: (code: String) -> Unit,
    onRetry: () -> Unit,
    onSignOut: () -> Unit,
    onStartOver: () -> Unit,
) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    LaunchedEffect(state.phase) {
        if (state.phase != AuthPhase.SignIn) password = ""
        if (state.phase != AuthPhase.TwoFactor) code = ""
    }
    BoxWithConstraints(
        modifier = Modifier
            .fillMaxSize()
            .systemBarsPadding()
            .imePadding()
            .padding(horizontal = 20.dp, vertical = 24.dp),
        contentAlignment = Alignment.Center,
    ) {
        val cardWidth = (maxWidth).coerceAtMost(460.dp)
        Column(
            modifier = Modifier
                .width(cardWidth)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.Center,
        ) {
            FgGlassCard(modifier = Modifier.fillMaxWidth(), contentPadding = 24.dp) {
                Image(
                    painter = painterResource(R.drawable.fg_mark),
                    contentDescription = null,
                    contentScale = ContentScale.Fit,
                    modifier = Modifier.size(56.dp),
                )
                Spacer(Modifier.height(12.dp))
                FgWordmark(compact = false)
                Spacer(Modifier.height(16.dp))
                when (state.phase) {
                    AuthPhase.Offline -> OfflineContent(state, onRetry, onSignOut)
                    AuthPhase.TwoFactor -> TwoFactorContent(
                        state = state,
                        code = code,
                        onCode = { code = it },
                        onVerify = onVerify,
                        onStartOver = onStartOver,
                    )
                    else -> PasswordContent(
                        state = state,
                        email = email,
                        onEmail = { email = it },
                        password = password,
                        onPassword = { password = it },
                        onSignIn = onSignIn,
                    )
                }
            }
        }
    }
}

@Composable
private fun PasswordContent(
    state: AuthUiState,
    email: String,
    onEmail: (String) -> Unit,
    password: String,
    onPassword: (String) -> Unit,
    onSignIn: (String, String) -> Unit,
) {
    Text(
        text = "Sign in with your FunctionGram account",
        style = MaterialTheme.typography.bodyLarge,
    )
    Spacer(Modifier.height(8.dp))
    Text(
        text = "The password is sent once to the website and is not saved on this device.",
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
    if (!state.banner.isNullOrBlank()) {
        Spacer(Modifier.height(12.dp))
        FgInlineMessage(state.banner)
    }
    Spacer(Modifier.height(16.dp))
    FgTextField(
        value = email,
        onValueChange = onEmail,
        label = "Email",
        modifier = Modifier.fillMaxWidth(),
        enabled = !state.busy,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
    )
    Spacer(Modifier.height(12.dp))
    FgTextField(
        value = password,
        onValueChange = onPassword,
        label = "Password",
        modifier = Modifier.fillMaxWidth(),
        enabled = !state.busy,
        visualTransformation = PasswordVisualTransformation(),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
    )
    Spacer(Modifier.height(20.dp))
    FgPrimaryButton(
        text = "Sign in",
        onClick = { onSignIn(email, password) },
        enabled = !state.busy,
        loading = state.busy,
        modifier = Modifier.fillMaxWidth(),
    )
}

@Composable
private fun TwoFactorContent(
    state: AuthUiState,
    code: String,
    onCode: (String) -> Unit,
    onVerify: (String) -> Unit,
    onStartOver: () -> Unit,
) {
    Text(
        text = "Enter the code from your authenticator app",
        style = MaterialTheme.typography.bodyLarge,
    )
    if (!state.banner.isNullOrBlank()) {
        Spacer(Modifier.height(12.dp))
        FgInlineMessage(state.banner)
    }
    Spacer(Modifier.height(16.dp))
    FgTextField(
        value = code,
        onValueChange = { next -> onCode(next.filter { it.isDigit() }.take(8)) },
        label = "Authenticator code",
        modifier = Modifier.fillMaxWidth(),
        enabled = !state.busy,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
    )
    Spacer(Modifier.height(20.dp))
    FgPrimaryButton(
        text = if (state.busy) "Checking" else "Continue",
        onClick = { onVerify(code) },
        enabled = !state.busy,
        loading = state.busy,
        modifier = Modifier.fillMaxWidth(),
    )
    FgTextButton(text = "Start over", onClick = onStartOver, enabled = !state.busy)
}

@Composable
private fun OfflineContent(
    state: AuthUiState,
    onRetry: () -> Unit,
    onSignOut: () -> Unit,
) {
    FgErrorState(
        title = "Can't reach FunctionGram",
        message = state.banner ?: AuthCopy.OFFLINE_HOLDING,
        actionLabel = if (state.busy) "Trying again" else "Try again",
        onAction = onRetry,
        secondaryLabel = "Sign out on this device",
        onSecondary = onSignOut,
    )
}
