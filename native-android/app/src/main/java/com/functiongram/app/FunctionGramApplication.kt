package com.functiongram.app

import android.app.Application
import com.functiongram.app.configuration.ApiEnvironment
import com.functiongram.app.security.ClientSecretPolicy

class FunctionGramApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        // Fail closed at process start if a build is pointed at a database or a secret.
        ClientSecretPolicy.requirePublicApiOrigin(ApiEnvironment.resolvedOrigin())
    }
}
