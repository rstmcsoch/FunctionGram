# Phase 10 — optional FCM and notification deep links

The native app (`native-android/`, `com.functiongram.app`) still talks only to the public HTTPS API. Login and messaging do not require Firebase. Capacitor `android/` is unchanged. There is no Play Integrity dependency, so a directly installed debug APK still runs.

## What is wired

`GET`, `POST`, and `DELETE /api/push` store or remove an Android device token for the signed-in account. The session cookie is the same Better Auth session the rest of the app uses. `POST` is rejected when the admin `notifications` feature is off. `DELETE` still runs on sign-out so a token is not left behind when that call can be authenticated. The response field `pushDelivery` is always `not_configured`.

The server does not send pushes. No Firebase Admin SDK, service account, or server key is read. Do not put those values in the APK.

## Client without a Firebase project

`assembleDebug` does not need a Firebase Android app. The Google services plugin is applied only when `native-android/app/google-services.json` exists. That file is gitignored. A non-secret template is `native-android/app/google-services.json.example`. Copy it into place only after a real Firebase Android app exists, and do not commit it.

Without that file:

- `BuildConfig.FCM_CONFIGURED` is false
- Firebase Messaging is not on the classpath
- `FcmBridge` does not request a token
- sign-in, messaging, and the rest of the shell behave as before
- the app does not ask for notification permission

With that file, the alternate sources under `src/fcm/java` register a token and can show a notification. A tap uses the same destination parser as a cold or warm `VIEW` intent. This repository build did not include a real `google-services.json`, and push delivery was not verified on a device.

## Deep links

Supported while signed in, after feature flags load for gated screens:

| Target | Examples |
| --- | --- |
| Conversation | `functiongram://conversation/<peerId>`, `functiongram://messages/<peerId>`, `https://functiongram.vercel.app/#/messages/<peerId>`, extras `fg_target=conversation` and `fg_id` |
| Notifications | `functiongram://notifications`, `https://functiongram.vercel.app/#/notifications`, extra `fg_target=notifications` |
| Profile | `functiongram://profile/<id-or-username>`, `https://functiongram.vercel.app/#/profile/<id>`, `https://functiongram.vercel.app/<username>`, extra `fg_target=profile` |

A profile link with no id opens the signed-in account. Reserved site paths such as `api` and `admin-panel` are not treated as profiles. Messages and notifications stay closed when those admin flags are off. A muted peer id from `GET /api/push`, or a notification kind the admin templates mark disabled, suppresses a displayed alert when a message is received. Registration itself follows the `notifications` flag only.

Cold start keeps the destination until the signed-in shell can apply it. Warm start uses `singleTop` and `onNewIntent`. Signing out clears the local token and asks `DELETE /api/push` first. A failed unregister does not block sign-out. FCM is not required to sign in or to send messages.
