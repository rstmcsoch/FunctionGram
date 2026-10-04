package com.functiongram.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.getValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.functiongram.app.data.directory.ThemeChoice
import com.functiongram.app.presentation.navigation.FunctionGramNavHost
import com.functiongram.app.presentation.theme.FunctionGramTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val app = application as FunctionGramApplication
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
                )
            }
        }
    }
}
