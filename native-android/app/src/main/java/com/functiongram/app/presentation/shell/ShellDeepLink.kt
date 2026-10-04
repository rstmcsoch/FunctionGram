package com.functiongram.app.presentation.shell

import com.functiongram.app.data.policy.FeaturePolicy
import com.functiongram.app.data.policy.ServerFeatures
import com.functiongram.app.push.PushDestination

object ShellDeepLink {
    data class Applied(
        val selectedId: String?,
        val profileLookup: String?,
        val messagePeer: String?,
        val messageTitle: String,
    )

    sealed class Decision {
        data class Open(val applied: Applied) : Decision()
        data object Blocked : Decision()
        data object Waiting : Decision()
    }

    fun decide(
        destination: PushDestination,
        features: ServerFeatures,
        shellReady: Boolean,
        selfLookup: String,
    ): Decision = when (destination) {
        is PushDestination.Conversation -> {
            if (!shellReady) Decision.Waiting
            else if (!FeaturePolicy.canOpenMessages(features)) Decision.Blocked
            else Decision.Open(
                Applied(
                    selectedId = ShellDestination.MESSAGES.id,
                    profileLookup = null,
                    messagePeer = destination.peerId,
                    messageTitle = "",
                ),
            )
        }
        PushDestination.Notifications -> {
            if (!shellReady) Decision.Waiting
            else if (!features.notifications) Decision.Blocked
            else Decision.Open(
                Applied(
                    selectedId = ShellDestination.NOTIFICATIONS.id,
                    profileLookup = null,
                    messagePeer = null,
                    messageTitle = "",
                ),
            )
        }
        is PushDestination.Profile -> {
            val lookup = destination.idOrUsername?.takeIf { it.isNotBlank() }
                ?: selfLookup.takeIf { it.isNotBlank() }
            if (lookup == null) {
                if (shellReady) Decision.Blocked else Decision.Waiting
            } else {
                Decision.Open(
                    Applied(
                        selectedId = null,
                        profileLookup = lookup,
                        messagePeer = null,
                        messageTitle = "",
                    ),
                )
            }
        }
    }
}
