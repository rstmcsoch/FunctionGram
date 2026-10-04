package com.functiongram.app.presentation.navigation

sealed class AppDestination(val route: String) {
    data object Splash : AppDestination("splash")
    data object SignIn : AppDestination("sign-in")
    data object Home : AppDestination("home")
}
