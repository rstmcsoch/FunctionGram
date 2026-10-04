package com.functiongram.app.push

import android.app.Service
import android.content.Intent
import android.os.IBinder

/** Present so the manifest entry resolves when messaging libraries are not packaged. */
class FunctionGramMessagingService : Service() {
    override fun onBind(intent: Intent?): IBinder? = null
}
