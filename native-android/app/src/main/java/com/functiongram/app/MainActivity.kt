package com.functiongram.app

import android.content.Intent
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.getValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.functiongram.app.data.directory.ThemeChoice
import com.functiongram.app.presentation.navigation.FunctionGramNavHost
import com.functiongram.app.presentation.theme.FunctionGramTheme

class MainActivity : ComponentActivity() {
    private val notificationPermission = registerForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val app = application as FunctionGramApplication
        app.deepLinks.offer(intent)
        if (BuildConfig.FCM_CONFIGURED && Build.VERSION.SDK_INT >= 33) {
            notificationPermission.launch(android.Manifest.permission.POST_NOTIFICATIONS)
        }
        setContent {
            val choice by app.devicePreferences.theme.collectAsStateWithLifecycle()
            val dark = ThemeChoice.isDark(choice, isSystemInDarkTheme())
            FunctionGramTheme(darkTheme = dark) {
                FunctionGramNavHost(
                    repository = app.authRepository,
                    messaging = app.messagingRepository,
                    feed = app.feedRepository,
                    directory = app.directoryRepository,
                    preferences = app.devicePreferences,
                    darkTheme = dark,
                    deepLinks = app.deepLinks,
                    push = app.pushCoordinator,
                )
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        (application as FunctionGramApplication).deepLinks.offer(intent)
    }
}
