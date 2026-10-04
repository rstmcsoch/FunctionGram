package com.functiongram.app.presentation.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.functiongram.app.data.auth.AuthCopy
import com.functiongram.app.presentation.theme.BrandPinkDeep

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
    Column(
        modifier = Modifier
            .fillMaxSize()
            .systemBarsPadding()
            .imePadding()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 28.dp, vertical = 32.dp),
        verticalArrangement = Arrangement.Center,
    ) {
        Text(
            text = "FunctionGram",
            style = MaterialTheme.typography.headlineLarge,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.primary,
        )
        Spacer(Modifier.height(12.dp))
        when (state.phase) {
            AuthPhase.Offline -> OfflineContent(state, onRetry, onSignOut)
            AuthPhase.TwoFactor -> TwoFactorContent(state, code, { code = it }, onVerify, onStartOver)
            else -> PasswordContent(state, email, { email = it }, password, { password = it }, onSignIn)
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
    Banner(state.banner)
    Spacer(Modifier.height(16.dp))
    OutlinedTextField(
        value = email,
        onValueChange = onEmail,
        modifier = Modifier.fillMaxWidth(),
        label = { Text("Email") },
        singleLine = true,
        enabled = !state.busy,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
    )
    Spacer(Modifier.height(12.dp))
    OutlinedTextField(
        value = password,
        onValueChange = onPassword,
        modifier = Modifier.fillMaxWidth(),
        label = { Text("Password") },
        singleLine = true,
        enabled = !state.busy,
        visualTransformation = PasswordVisualTransformation(),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
    )
    Spacer(Modifier.height(20.dp))
    Button(
        onClick = { onSignIn(email, password) },
        enabled = !state.busy,
        modifier = Modifier.fillMaxWidth(),
    ) {
        if (state.busy) {
            CircularProgressIndicator()
        } else {
            Text("Sign in")
        }
    }
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
    Banner(state.banner)
    Spacer(Modifier.height(16.dp))
    OutlinedTextField(
        value = code,
        onValueChange = { next -> onCode(next.filter { it.isDigit() }.take(8)) },
        modifier = Modifier.fillMaxWidth(),
        label = { Text("Authenticator code") },
        singleLine = true,
        enabled = !state.busy,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
    )
    Spacer(Modifier.height(20.dp))
    Button(
        onClick = { onVerify(code) },
        enabled = !state.busy,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Text(if (state.busy) "Checking" else "Continue")
    }
    TextButton(onClick = onStartOver, enabled = !state.busy) {
        Text("Start over")
    }
}

@Composable
private fun OfflineContent(
    state: AuthUiState,
    onRetry: () -> Unit,
    onSignOut: () -> Unit,
) {
    Text(
        text = state.banner ?: AuthCopy.OFFLINE_HOLDING,
        style = MaterialTheme.typography.bodyLarge,
    )
    Spacer(Modifier.height(20.dp))
    Button(onClick = onRetry, enabled = !state.busy, modifier = Modifier.fillMaxWidth()) {
        Text("Try again")
    }
    TextButton(onClick = onSignOut, enabled = !state.busy) {
        Text("Sign out on this device")
    }
}

@Composable
private fun Banner(text: String?) {
    if (text.isNullOrBlank()) return
    Spacer(Modifier.height(12.dp))
    Text(text = text, color = BrandPinkDeep, style = MaterialTheme.typography.bodyMedium)
}
