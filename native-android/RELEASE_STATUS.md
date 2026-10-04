# Native Android release status (phases 11–12 closeout)

Checked on 4 Oct 2026 from branch `phase-10-android-fcm` at `93ff068` (head of https://github.com/rstmcsoch/FunctionGram/pull/78). This file does not add a feature. No device was used. No production keystore was created. No certificate fingerprint is recorded here.

## App

- Package / `applicationId` / namespace: `com.functiongram.app` (`native-android/app/build.gradle.kts`).
- `minSdk` 28. `compileSdk` and `targetSdk` 36. `versionCode` 10. `versionName` `0.10.0-phase10` (debug suffix `-debug` on the debug variant).
- ABI filters in that Gradle file: `armeabi-v7a`, `arm64-v8a`, `x86`, `x86_64`.
- `aapt dump badging` of the debug APK built below reported `name='com.functiongram.app'`, `sdkVersion:'28'`, `targetSdkVersion:'36'`, `versionCode='10'`, `versionName='0.10.0-phase10-debug'`, and `native-code: 'arm64-v8a' 'armeabi-v7a' 'x86' 'x86_64'`.

## Phases 1–10

These pull requests exist and are stacked. They are not all on `main`.

| PR | Head branch | Base | GitHub state |
| --- | --- | --- | --- |
| [#61](https://github.com/rstmcsoch/FunctionGram/pull/61) | `phase-1-android-foundation` | `main` | MERGED |
| [#62](https://github.com/rstmcsoch/FunctionGram/pull/62) | `phase-2-android-security` | `phase-1-android-foundation` | MERGED |
| [#63](https://github.com/rstmcsoch/FunctionGram/pull/63) | `phase-3-android-signing` | `phase-2-android-security` | MERGED |
| [#65](https://github.com/rstmcsoch/FunctionGram/pull/65) | `phase-4-android-auth` | `phase-3-android-signing` | MERGED |
| [#67](https://github.com/rstmcsoch/FunctionGram/pull/67) | `phase-5-android-ui` | `phase-4-android-auth` | MERGED |
| [#69](https://github.com/rstmcsoch/FunctionGram/pull/69) | `phase-6-android-messaging` | `phase-5-android-ui` | MERGED |
| [#72](https://github.com/rstmcsoch/FunctionGram/pull/72) | `phase-7-android-feed` | `phase-6-android-messaging` | MERGED |
| [#73](https://github.com/rstmcsoch/FunctionGram/pull/73) | `phase-8-android-profiles` | `phase-7-android-feed` | MERGED |
| [#74](https://github.com/rstmcsoch/FunctionGram/pull/74) | `phase-9-android-policy` | `phase-8-android-profiles` | MERGED |
| [#78](https://github.com/rstmcsoch/FunctionGram/pull/78) | `phase-10-android-fcm` | `phase-9-android-policy` | MERGED |

GitHub compare of #61's merge commit `3bfe0233fdc821777c62ee147510ff8502c33ebb` to `main` was `ahead` with `behind_by` 0, so that commit is an ancestor of `main`. `origin/main`'s `native-android/app/build.gradle.kts` still has `versionName` `0.1.0-phase1` and the same four ABI filters. These paths are not on `origin/main`: `native-android/FCM.md`, `SIGNING.md`, `AUTH.md`, `MESSAGING.md`, `FEED.md`, `PROFILES.md`, `POLICY.md`, and `native-android/app/src/main/java/com/functiongram/app/push/PushCodec.kt`.

GitHub compare of each later merge commit to `main` was `diverged` (#62 `6949e308`, #63 `e47e8378`, #65 `da8145f8`, #67 `a162f96d`, #69 `700163d5`, #72 `30848032`, #73 `919b4348`, #74 `30e13276`, #78 `2c16efe8`). Compare of `93ff068` to `main` was `diverged` (`ahead_by` 9, `behind_by` 12).

## Push

- `native-android/app/google-services.json` is not in this checkout. Only `google-services.json.example` is present. `google-services.json` is gitignored.
- `app/build.gradle.kts` applies `com.google.gms.google-services` only when that JSON file exists, and sets `BuildConfig.FCM_CONFIGURED` from the same check. It was absent for the build below.
- `lib/push-tokens.ts` sets `PUSH_DELIVERY` to `"not_configured"` and returns that as `pushDelivery`. The comment there says no Firebase Admin credential is read. This closeout did not call the live API.
- Zip listing of the debug APK had no entry path matching `google-services`, `firebase`, `keystore`, or `.jks`. That is a filename check only.

## Signing

- Release signing in `app/build.gradle.kts` loads a keystore from the environment or gitignored `native-android/keystore.properties`. `assembleRelease` depends on `verifyReleaseSigning`, which fails when that configuration is missing. The debug keystore is not assigned as the release signing config.
- This checkout has no `keystore.properties`, `*.jks`, or `*.keystore` under `native-android/`. No production keystore was created. `assembleRelease` was not run. No `app-release.apk` was produced. There is no production-signed APK from this closeout.

## What was run

From `native-android/`, with gitignored `local.properties` pointing `sdk.dir` at the existing SDK on this machine (`/home/box/android-sdk`, platforms `android-36`, build-tools `36.0.0`):

```bash
./gradlew :app:assembleDebug :app:testDebugUnitTest --offline
```

Result: `BUILD SUCCESSFUL` (4 Oct 2026, 13:08 IST). Debug APK: `native-android/app/build/outputs/apk/debug/app-debug.apk` (gitignored).

`:app:testDebugUnitTest`: 89 tests, 0 failures, 0 errors, 0 skipped.

| Class | Tests |
| --- | ---: |
| `AuthSessionTest` | 12 |
| `PushPhaseTest` | 8 |
| `SecurityFoundationTest` | 15 |
| `FeedMappingTest` | 14 |
| `ApiContractTest` | 4 |
| `ThemeSystemTest` | 9 |
| `MessagingMappingTest` | 12 |
| `DirectoryMappingTest` | 9 |
| `FeaturePolicyTest` | 6 |

Not run: `testReleaseUnitTest`, `testNonProductionReleaseUnitTest`, instrumentation tests, `assembleRelease`, and any device or emulator install.

## Known gaps

- No device QA in this closeout.
- No production signature and no production-signed APK.
- No live push. FCM is not configured in this tree, and `pushDelivery` in source is `not_configured`.
- Shell destinations Explore and Saved are placeholders (`SignedInShell.placeholderCopy`). The own-profile Saved tab is separate and is not that shell placeholder.
- No voice-message capture or send UI. `MessagingCodec.preview` only labels an existing `voice` type as "Voice message". `ServerFeatures.voiceMessages` defaults to false.

Nothing in this note is a pentest result, a Play review, or a claim that the debug APK is free of secrets beyond the filename listing above.
