# Native Android release signing

Phase 3 wires release signing for `native-android/` only. The Capacitor project under `android/` is unchanged.

This repository does **not** contain a production keystore, a production certificate pin, or signing passwords. `assembleRelease` is not production-signed unless you supply a keystore you control and, separately, you know that keystore is the production key. A local proof keystore is not a production key.

## What the release build does

`versionCode` is 3. `versionName` is `0.3.0-phase3`. Debug adds the suffix `-debug`. The non-production task adds `-nonprod`.

Universal ABI filters stay `armeabi-v7a`, `arm64-v8a`, `x86`, and `x86_64`.

`:app:assembleRelease` and `:app:bundleRelease` require a complete release signing configuration. If it is missing, or the keystore file does not exist, those tasks fail. They do **not** fall back to the Android debug keystore.

`:app:assembleNonProductionRelease` is the only minified release-like task that signs with the debug keystore. Its `SIGNING_PROFILE` is `debug-keystore-not-production`. It is not a store artifact.

`BuildConfig.SIGNING_PROFILE` for the release variant is `release-keystore-required`. That string means the variant is wired to an external keystore. It does not mean the APK was signed, and it does not name a production certificate.

`ReleaseCertificatePin.sha256Hex` stays empty. Do not paste a debug certificate or a local proof certificate into the app.

## Supplying a keystore

Either export all four variables:

- `FUNCTIONGRAM_RELEASE_STORE_FILE`
- `FUNCTIONGRAM_RELEASE_STORE_PASSWORD`
- `FUNCTIONGRAM_RELEASE_KEY_ALIAS`
- `FUNCTIONGRAM_RELEASE_KEY_PASSWORD`

or copy `keystore.properties.example` to `native-android/keystore.properties` (gitignored) and fill the same keys: `storeFile`, `storePassword`, `keyAlias`, `keyPassword`.

`FUNCTIONGRAM_RELEASE_SIGNING_FILE` may point at a properties file outside the repository. Environment variables override file values. Relative `storeFile` paths are resolved from `native-android/`. Prefer an absolute path outside the repo, for example under a secrets directory that is not part of this checkout.

A partial configuration is an error. Values are not printed.

`keystore.properties`, `*.jks`, and `*.keystore` are gitignored. Do not commit them. Do not generate a production keystore into the tree.

## Build

From `native-android/`, with `sdk.dir` in the gitignored `local.properties`:

```bash
# Fails closed when no release keystore is configured.
./gradlew :app:assembleRelease

# Minified, not debuggable, debug-signed. Not production.
./gradlew :app:assembleNonProductionRelease

# Unit tests do not need a keystore.
./gradlew :app:testDebugUnitTest :app:testReleaseUnitTest :app:testNonProductionReleaseUnitTest
```

When a release keystore is configured and the file exists, `:app:assembleRelease` signs with that keystore (JAR/APK Signature Scheme as produced by the Android Gradle Plugin). The output is `app/build/outputs/apk/release/app-release.apk`. That directory is gitignored.

## Checksum and fingerprint

Extraction runs only when `app-release.apk` exists. `:app:assembleRelease` finalizes with `:app:extractReleaseArtifactFingerprint`, which writes `app/build/outputs/signing/release-apk-fingerprint.txt` only after `apksigner verify` succeeds. If the APK is absent, the task logs that there is nothing to fingerprint and does not invent a checksum.

You can run the same check directly:

```bash
bash scripts/verify-release-apk.sh app/build/outputs/apk/release/app-release.apk
```

The script prints `apkSha256`, the signer certificate SHA-256 from `apksigner verify --print-certs`, and `productionSigned`. `productionSigned` stays `false` unless `FUNCTIONGRAM_PRODUCTION_CERT_SHA256` is set to the expected production certificate SHA-256 (hex, colons optional) and it matches a signer. This repo does not set that variable and does not know a production fingerprint.

A signer of `CN=Android Debug` is reported as the debug certificate.

Manual checks when a signed APK exists:

```bash
SDK="$(sed -n 's/^sdk.dir=//p' local.properties)"
APKSIGNER="$(find "$SDK/build-tools" -name apksigner | sort | tail -1)"
AAPT="$(find "$SDK/build-tools" -name aapt | sort | tail -1)"
"$APKSIGNER" verify --print-certs app/build/outputs/apk/release/app-release.apk
sha256sum app/build/outputs/apk/release/app-release.apk
"$AAPT" dump badging app/build/outputs/apk/release/app-release.apk | head -n 20
```

`aapt dump badging` should show package `com.functiongram.app`, `versionCode` 3, `versionName` `0.3.0-phase3`, `minSdkVersion:'28'`, and native-code `armeabi-v7a`, `arm64-v8a`, `x86`, `x86_64`. The release APK must not contain `application-debuggable`.

## What is not true yet

No production key exists in this project. Do not upload `app-release.apk` to Play, and do not describe a locally signed APK as production-signed, even when `apksigner` says the signature verifies. Verification only proves the APK matches whatever keystore the build was given.
