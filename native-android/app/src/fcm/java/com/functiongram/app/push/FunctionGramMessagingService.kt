package com.functiongram.app.push

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import com.functiongram.app.MainActivity
import com.functiongram.app.R
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

class FunctionGramMessagingService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        val trimmed = token.trim()
        if (PushToken.isValid(trimmed)) PushEvents.publish(trimmed)
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val destination = PushLinks.parse(null, message.data)
        val kind = message.data["kind"]?.trim()?.takeIf { it.isNotEmpty() }
        val peer = (destination as? PushDestination.Conversation)?.peerId
        val settings = AndroidPushSnapshot(this).settings()
            ?: PushSettings(notificationsEnabled = false, kinds = emptyMap(), mutedPeerIds = emptySet(), pushDelivery = "unknown")
        if (!PushPolicy.shouldDisplay(settings, kind, peer)) return
        if (destination == null && message.notification == null) return
        val manager = getSystemService(NotificationManager::class.java) ?: return
        if (Build.VERSION.SDK_INT >= 26) {
            manager.createNotificationChannel(
                NotificationChannel(CHANNEL, "FunctionGram", NotificationManager.IMPORTANCE_DEFAULT),
            )
        }
        val open = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
            destination?.let { putExtra(PushLinks.EXTRA_TARGET, PushLinks.targetValue(it)) }
            PushLinks.idValue(destination)?.let { putExtra(PushLinks.EXTRA_ID, it) }
        }
        val pending = PendingIntent.getActivity(
            this,
            0,
            open,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val title = message.notification?.title?.takeIf { it.isNotBlank() } ?: "FunctionGram"
        val body = message.notification?.body?.takeIf { it.isNotBlank() }
            ?: message.data["body"]?.takeIf { it.isNotBlank() }
            ?: "Open FunctionGram"
        val notification = NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setContentIntent(pending)
            .build()
        manager.notify((peer ?: kind ?: "functiongram").hashCode(), notification)
    }

    private companion object {
        const val CHANNEL = "functiongram_alerts"
    }
}
