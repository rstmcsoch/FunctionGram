package com.functiongram.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.functiongram.app.presentation.navigation.FunctionGramNavHost
import com.functiongram.app.presentation.theme.FunctionGramTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val app = application as FunctionGramApplication
        setContent {
            FunctionGramTheme {
                FunctionGramNavHost(app.authRepository, app.messagingRepository, app.feedRepository)
            }
        }
    }
}
