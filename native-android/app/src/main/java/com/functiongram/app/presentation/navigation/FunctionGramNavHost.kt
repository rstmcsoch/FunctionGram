package com.functiongram.app.presentation.navigation

import androidx.compose.runtime.Composable
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.functiongram.app.presentation.home.FoundationHomeRoute
import com.functiongram.app.presentation.splash.SplashRoute

@Composable
fun FunctionGramNavHost() {
    val navController = rememberNavController()
    NavHost(
        navController = navController,
        startDestination = AppDestination.Splash.route,
    ) {
        composable(AppDestination.Splash.route) {
            SplashRoute(
                onFinished = {
                    navController.navigate(AppDestination.Home.route) {
                        popUpTo(AppDestination.Splash.route) { inclusive = true }
                    }
                },
            )
        }
        composable(AppDestination.Home.route) {
            FoundationHomeRoute()
        }
    }
}
