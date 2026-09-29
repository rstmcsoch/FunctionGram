package com.functiongram.dypollabs.app

import android.app.Application
import com.functiongram.dypollabs.app.data.SessionManager

class FunctionGramApp : Application() {
    lateinit var sessionManager: SessionManager
        private set

    override fun onCreate() {
        super.onCreate()
        sessionManager = SessionManager(this)
    }
}
