package com.functiongram.app.presentation.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.functiongram.app.data.auth.AuthCallResult
import com.functiongram.app.data.auth.AuthSessionRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class AuthViewModel(
    private val repository: AuthSessionRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(AuthUiState())
    val state: StateFlow<AuthUiState> = _state.asStateFlow()

    init {
        restore()
    }

    fun onSplashFinished() {
        _state.update { it.copy(splashFinished = true) }
    }

    fun restore() {
        viewModelScope.launch {
            _state.update { it.copy(busy = true, phase = AuthPhase.Checking) }
            val result = withContext(Dispatchers.IO) { repository.restore() }
            publish(result, AuthApplySource.RESTORE)
        }
    }

    fun signIn(email: String, password: String) {
        viewModelScope.launch {
            _state.update { it.copy(busy = true, banner = null) }
            val result = withContext(Dispatchers.IO) { repository.signIn(email, password) }
            if (result is AuthCallResult.TwoFactorRequired && result.methods.none { it == "totp" } && result.methods.isNotEmpty()) {
                withContext(Dispatchers.IO) { repository.abandonChallenge() }
            }
            publish(result, AuthApplySource.SIGN_IN)
        }
    }

    fun verifyTotp(code: String) {
        viewModelScope.launch {
            _state.update { it.copy(busy = true, banner = null) }
            val result = withContext(Dispatchers.IO) { repository.verifyTotp(code) }
            publish(result, AuthApplySource.VERIFY)
        }
    }

    fun signOut() {
        viewModelScope.launch {
            _state.update { it.copy(busy = true, banner = null) }
            val result = withContext(Dispatchers.IO) { repository.signOut() }
            publish(result, AuthApplySource.SIGN_OUT)
        }
    }

    fun startOver() {
        viewModelScope.launch {
            withContext(Dispatchers.IO) { repository.abandonChallenge() }
            _state.update {
                it.copy(
                    phase = AuthPhase.SignIn,
                    busy = false,
                    banner = null,
                    profile = null,
                    twoFactorMethods = emptyList(),
                )
            }
        }
    }

    private fun publish(result: AuthCallResult, source: AuthApplySource) {
        _state.update { current ->
            reduceAuthUi(
                previous = current,
                result = result,
                source = source,
                hasSession = repository.hasSession(),
            )
        }
    }

    companion object {
        fun factory(repository: AuthSessionRepository): ViewModelProvider.Factory {
            return object : ViewModelProvider.Factory {
                @Suppress("UNCHECKED_CAST")
                override fun <T : ViewModel> create(modelClass: Class<T>): T {
                    return AuthViewModel(repository) as T
                }
            }
        }
    }
}
