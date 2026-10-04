package com.functiongram.app.presentation.navigation

import androidx.compose.foundation.background
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.functiongram.app.data.auth.AuthSessionRepository
import com.functiongram.app.presentation.auth.AuthPhase
import com.functiongram.app.presentation.auth.AuthViewModel
import com.functiongram.app.presentation.auth.SignInRoute
import com.functiongram.app.presentation.shell.SignedInShell
import com.functiongram.app.presentation.splash.SplashReveal
import com.functiongram.app.presentation.theme.SystemBarIcons
import com.functiongram.app.presentation.ui.FgLoading

@Composable
fun FunctionGramNavHost(repository: AuthSessionRepository) {
    val viewModel: AuthViewModel = viewModel(factory = AuthViewModel.factory(repository))
    val state by viewModel.state.collectAsStateWithLifecycle()
    val navController = rememberNavController()
    val dark = isSystemInDarkTheme()
    SystemBarIcons(light = !dark || !state.splashFinished)
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
    ) {
        NavHost(
            navController = navController,
            startDestination = AppDestination.SignIn.route,
        ) {
            composable(AppDestination.SignIn.route) {
                if (state.phase == AuthPhase.Checking) {
                    FgLoading(message = "Checking your session", showSkeleton = true)
                } else {
                    SignInRoute(
                        state = state,
                        onSignIn = viewModel::signIn,
                        onVerify = viewModel::verifyTotp,
                        onRetry = viewModel::restore,
                        onSignOut = viewModel::signOut,
                        onStartOver = viewModel::startOver,
                    )
                }
            }
            composable(AppDestination.Home.route) {
                SignedInShell(
                    profile = state.profile,
                    busy = state.busy,
                    onSignOut = viewModel::signOut,
                )
            }
        }
        if (!state.splashFinished) {
            SplashReveal(onFinished = viewModel::onSplashFinished)
        }
    }
    LaunchedEffect(state.phase) {
        if (state.phase == AuthPhase.Checking) return@LaunchedEffect
        val route = if (state.phase == AuthPhase.SignedIn) {
            AppDestination.Home.route
        } else {
            AppDestination.SignIn.route
        }
        if (navController.currentDestination?.route == route) return@LaunchedEffect
        navController.navigate(route) {
            popUpTo(navController.graph.id) { inclusive = true }
            launchSingleTop = true
        }
    }
}
