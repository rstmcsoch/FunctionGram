package com.functiongram.app

import android.app.Application
import com.functiongram.app.configuration.ApiEnvironment
import com.functiongram.app.data.auth.AuthSessionRepository
import com.functiongram.app.data.auth.EncryptedSessionStore
import com.functiongram.app.data.auth.OkHttpAuthTransport
import com.functiongram.app.data.auth.SessionCookieJar
import com.functiongram.app.data.remote.FunctionGramHttpClient
import com.functiongram.app.security.AppSecurityState
import com.functiongram.app.security.DeviceIdentityKeyStore
import com.functiongram.app.security.IntegrityEvaluator
import com.functiongram.app.security.IntegritySnapshotCodec
import com.functiongram.app.security.PackageIdentitySignal
import com.functiongram.app.security.ReleaseHardening
import com.functiongram.app.security.toSnapshot

class FunctionGramApplication : Application() {
    lateinit var authRepository: AuthSessionRepository
        private set

    override fun onCreate() {
        super.onCreate()
        val origin = ApiEnvironment.resolvedOrigin()
        ReleaseHardening.assertProcess(this)
        val deviceKey = DeviceIdentityKeyStore(this).ensure()
        val observation = PackageIdentitySignal(this).observe()
        val verdict = IntegrityEvaluator.evaluate(observation)
        securityState = AppSecurityState(
            apiOrigin = origin,
            deviceKey = deviceKey,
            integrityVerdict = verdict,
            integritySnapshotJson = IntegritySnapshotCodec.encode(observation.toSnapshot(verdict)),
        )
        val jar = SessionCookieJar(EncryptedSessionStore.open(this))
        val http = FunctionGramHttpClient(origin, jar)
        authRepository = AuthSessionRepository(
            transport = OkHttpAuthTransport(origin, http.okHttp()),
            jar = jar,
        )
    }

    companion object {
        var securityState: AppSecurityState? = null
            private set
    }
}
