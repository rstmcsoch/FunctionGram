package com.functiongram.app.presentation.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.functiongram.app.data.auth.AuthSessionRepository
import com.functiongram.app.presentation.auth.AuthPhase
import com.functiongram.app.presentation.auth.AuthViewModel
import com.functiongram.app.presentation.auth.SignInRoute
import com.functiongram.app.presentation.session.SessionHomeRoute
import com.functiongram.app.presentation.splash.SplashRoute

@Composable
fun FunctionGramNavHost(repository: AuthSessionRepository) {
    val viewModel: AuthViewModel = viewModel(factory = AuthViewModel.factory(repository))
    val state by viewModel.state.collectAsStateWithLifecycle()
    val navController = rememberNavController()
    NavHost(
        navController = navController,
        startDestination = AppDestination.Splash.route,
    ) {
        composable(AppDestination.Splash.route) {
            SplashRoute(onFinished = viewModel::onSplashFinished)
        }
        composable(AppDestination.SignIn.route) {
            SignInRoute(
                state = state,
                onSignIn = viewModel::signIn,
                onVerify = viewModel::verifyTotp,
                onRetry = viewModel::restore,
                onSignOut = viewModel::signOut,
                onStartOver = viewModel::startOver,
            )
        }
        composable(AppDestination.Home.route) {
            SessionHomeRoute(
                profile = state.profile,
                busy = state.busy,
                onSignOut = viewModel::signOut,
            )
        }
    }
    LaunchedEffect(state.splashFinished, state.phase) {
        if (!state.splashFinished || state.phase == AuthPhase.Checking) return@LaunchedEffect
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
