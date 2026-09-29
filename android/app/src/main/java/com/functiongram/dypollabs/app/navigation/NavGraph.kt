package com.functiongram.dypollabs.app.navigation

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.functiongram.dypollabs.app.data.SessionManager
import com.functiongram.dypollabs.app.ui.screens.*
import com.functiongram.dypollabs.app.ui.theme.ScreenSizeInfo

sealed class Screen(val route: String, val label: String, val icon: ImageVector) {
    object Login : Screen("login", "Login", Icons.Filled.Login)
    object Signup : Screen("signup", "Sign Up", Icons.Filled.PersonAdd)
    object VerifyEmail : Screen("verify_email", "Verify", Icons.Filled.MarkEmailRead)
    object ForgotPassword : Screen("forgot_password", "Forgot", Icons.Filled.LockReset)
    object Feed : Screen("feed", "Home", Icons.Filled.Home)
    object Explore : Screen("explore", "Explore", Icons.Filled.Explore)
    object Reels : Screen("reels", "Reels", Icons.Filled.VideoLibrary)
    object Messages : Screen("messages", "Messages", Icons.Filled.Message)
    object Notifications : Screen("notifications", "Activity", Icons.Filled.Favorite)
    object Profile : Screen("profile", "Profile", Icons.Filled.Person)
    object Create : Screen("create", "Create", Icons.Filled.AddBox)
    object Settings : Screen("settings", "Settings", Icons.Filled.Settings)
    object Search : Screen("search", "Search", Icons.Filled.Search)
}

val bottomNavItems = listOf(
    Screen.Feed,
    Screen.Explore,
    Screen.Create,
    Screen.Reels,
    Screen.Profile
)

val allScreens = listOf(
    Screen.Feed,
    Screen.Explore,
    Screen.Reels,
    Screen.Messages,
    Screen.Notifications,
    Screen.Profile
)

@Composable
fun AppNavGraph(
    sessionManager: SessionManager,
    screenInfo: ScreenSizeInfo
) {
    val navController = rememberNavController()
    var isLoggedIn by remember { mutableStateOf(sessionManager.isLoggedIn()) }
    
    // Responsive: use different layouts for tablets vs phones
    val isTablet = screenInfo.isTablet
    val isLargeScreen = screenInfo.diagonalInches >= 6.5

    Scaffold(
        bottomBar = {
            // Only show bottom bar for logged-in users and not on auth screens
            val navBackStackEntry by navController.currentBackStackEntryAsState()
            val currentDestination = navBackStackEntry?.destination
            val showBottomBar = currentDestination?.route !in listOf(
                Screen.Login.route,
                Screen.Signup.route,
                Screen.VerifyEmail.route,
                Screen.ForgotPassword.route
            ) && isLoggedIn

            if (showBottomBar) {
                NavigationBar(
                    modifier = Modifier
                        .windowInsetsPadding(WindowInsets.navigationBars)
                        .height(if (isLargeScreen) 80.dp else 64.dp),
                    tonalElevation = 8.dp
                ) {
                    bottomNavItems.forEach { screen ->
                        val selected = currentDestination?.hierarchy?.any { it.route == screen.route } == true
                        NavigationBarItem(
                            icon = { 
                                Icon(
                                    screen.icon, 
                                    contentDescription = screen.label,
                                    modifier = Modifier.size(if (isLargeScreen) 28.dp else 24.dp)
                                ) 
                            },
                            label = { 
                                Text(
                                    screen.label,
                                    style = if (isLargeScreen) MaterialTheme.typography.labelLarge 
                                           else MaterialTheme.typography.labelSmall
                                ) 
                            },
                            selected = selected,
                            onClick = {
                                navController.navigate(screen.route) {
                                    popUpTo(navController.graph.findStartDestination().id) {
                                        saveState = true
                                    }
                                    launchSingleTop = true
                                    restoreState = true
                                }
                            }
                        )
                    }
                }
            }
        }
    ) { innerPadding ->
        NavHost(
            navController = navController,
            startDestination = if (isLoggedIn) Screen.Feed.route else Screen.Login.route,
            modifier = Modifier
                .padding(innerPadding)
                .fillMaxSize()
        ) {
            composable(Screen.Login.route) {
                LoginScreen(
                    sessionManager = sessionManager,
                    screenInfo = screenInfo,
                    onLoginSuccess = {
                        isLoggedIn = true
                        navController.navigate(Screen.Feed.route) {
                            popUpTo(Screen.Login.route) { inclusive = true }
                        }
                    },
                    onNavigateToSignup = {
                        navController.navigate(Screen.Signup.route)
                    },
                    onNavigateToForgotPassword = {
                        navController.navigate(Screen.ForgotPassword.route)
                    },
                    onNavigateToVerify = {
                        navController.navigate(Screen.VerifyEmail.route)
                    }
                )
            }
            
            composable(Screen.Signup.route) {
                SignupScreen(
                    sessionManager = sessionManager,
                    screenInfo = screenInfo,
                    onSignupSuccess = {
                        navController.navigate(Screen.VerifyEmail.route)
                    },
                    onNavigateToLogin = {
                        navController.popBackStack()
                    }
                )
            }
            
            composable(Screen.VerifyEmail.route) {
                VerifyEmailScreen(
                    sessionManager = sessionManager,
                    screenInfo = screenInfo,
                    onVerified = {
                        isLoggedIn = true
                        navController.navigate(Screen.Feed.route) {
                            popUpTo(Screen.Login.route) { inclusive = true }
                        }
                    },
                    onBackToLogin = {
                        navController.navigate(Screen.Login.route) {
                            popUpTo(Screen.Login.route) { inclusive = true }
                        }
                    }
                )
            }
            
            composable(Screen.ForgotPassword.route) {
                ForgotPasswordScreen(
                    sessionManager = sessionManager,
                    screenInfo = screenInfo,
                    onBack = {
                        navController.popBackStack()
                    }
                )
            }
            
            composable(Screen.Feed.route) {
                FeedScreen(
                    sessionManager = sessionManager,
                    screenInfo = screenInfo,
                    onNavigateToProfile = { userId ->
                        // Handle profile navigation
                    },
                    onNavigateToCreate = {
                        navController.navigate(Screen.Create.route)
                    }
                )
            }
            
            composable(Screen.Explore.route) {
                ExploreScreen(
                    sessionManager = sessionManager,
                    screenInfo = screenInfo
                )
            }
            
            composable(Screen.Reels.route) {
                ReelsScreen(
                    sessionManager = sessionManager,
                    screenInfo = screenInfo
                )
            }
            
            composable(Screen.Messages.route) {
                MessagesScreen(
                    sessionManager = sessionManager,
                    screenInfo = screenInfo
                )
            }
            
            composable(Screen.Notifications.route) {
                NotificationsScreen(
                    sessionManager = sessionManager,
                    screenInfo = screenInfo
                )
            }
            
            composable(Screen.Profile.route) {
                ProfileScreen(
                    sessionManager = sessionManager,
                    screenInfo = screenInfo,
                    onLogout = {
                        isLoggedIn = false
                        navController.navigate(Screen.Login.route) {
                            popUpTo(Screen.Feed.route) { inclusive = true }
                        }
                    }
                )
            }
            
            composable(Screen.Create.route) {
                CreatePostScreen(
                    sessionManager = sessionManager,
                    screenInfo = screenInfo,
                    onPostCreated = {
                        navController.popBackStack()
                    },
                    onBack = {
                        navController.popBackStack()
                    }
                )
            }
            
            composable(Screen.Settings.route) {
                SettingsScreen(
                    sessionManager = sessionManager,
                    screenInfo = screenInfo,
                    onBack = {
                        navController.popBackStack()
                    },
                    onLogout = {
                        isLoggedIn = false
                        navController.navigate(Screen.Login.route) {
                            popUpTo(Screen.Feed.route) { inclusive = true }
                        }
                    }
                )
            }
            
            composable(Screen.Search.route) {
                ExploreScreen(
                    sessionManager = sessionManager,
                    screenInfo = screenInfo,
                    initialIsSearch = true
                )
            }
        }
    }
}
