# FunctionGram Android App

**Package:** `com.functiongram.dypollabs.app`  
**App Name:** FunctionGram  
**Version:** 1.0.0

## Requirements

- **Minimum Android Version:** Android 9 (API 28)
- **Target Android Version:** Android 14 (API 34)
- **Minimum RAM:** 3GB (3072 MB) for smooth operation
- **Minimum Storage:** 32GB (32768 MB) for smooth operation
- **Supported Architectures:** armeabi-v7a, arm64-v8a, x86, x86_64 (all supported, universal APK)
- **Supported DPIs:** ldpi, mdpi, hdpi, xhdpi, xxhdpi, xxxhdpi (all supported)
- **Screen Sizes:** Responsive design supporting 6.1", 6.5", 6.9" and all screen sizes (small, normal, large, xlarge)
- **Theme:** Adapts to device dark/light theme automatically

## Features

Same backend as web app:
- **Sign Up / Login:** Email/password with Better Auth, email verification via Brevo
- **Content:** Feed, Explore, Reels, Stories, Posts, Comments, Likes, Saves
- **Social:** Follow, Profiles, Notifications, Messages, Search, Hashtags
- **Media:** Image/video uploads via Vercel Blob, same processing pipeline
- **Email:** Verification, password reset, same Brevo integration

## Splash Screen

- Shows **RSTMC** logo (enhanced from website favicon `/favicon.svg`)
- Background: Dark theme (#0B0B0E) with gradient
- Logo: High-quality R letter on #ef476f background with white dot (from favicon)
- Bottom watermark: **by DYPOL LABS** in grey (#888888)
- Responsive: Adjusts logo size based on screen size (6.1", 6.5", 6.9")
- Animation: Fade + scale animation, 2 seconds

## Logo Enhancement

- Original favicon: `/public/favicon.svg` - pink #ef476f background, white R, white dot
- Enhanced: High-resolution PNGs generated via ImageMagick
  - 48x48 (mdpi), 72x72 (hdpi), 96x96 (xhdpi), 144x144 (xxhdpi), 192x192 (xxxhdpi), 512x512 (Play Store)
  - Adaptive icon: background #ef476f solid, foreground R with dot centered (108dp, safe zone 72dp)
  - Scaled with anti-aliasing for crisp display on all densities

## Responsive Design

- Uses `WindowSizeClass` and `ScreenSizeInfo` to detect screen size
- Adjusts:
  - Logo sizes: 80dp (small), 100dp (medium), 120dp (large), 140dp (xlarge)
  - Icon sizes: 24dp normal, 28dp large screens
  - Padding: 12dp small, 16dp medium, 20dp large, 32dp tablet
  - Grid columns: 3 columns on all, but card elevation and spacing responsive
  - Text sizes: Scales with screen size
- Supports:
  - Small (4.5"-5.0")
  - Medium (5.0"-6.0")
  - Large (6.1"-6.5")
  - XLarge (6.5"-6.9")
  - Tablet (7.0"+)

## Architecture

- **Language:** Kotlin
- **UI:** Jetpack Compose + Material3 (adaptive to dark/light theme)
- **Navigation:** Navigation Compose
- **Networking:** Retrofit + OkHttp with persistent CookieJar (Better Auth session)
- **Image Loading:** Coil
- **Video:** Media3 ExoPlayer for reels
- **Storage:** DataStore + SharedPreferences for session
- **DI:** Manual (no Hilt for simplicity)

## Backend Integration

- Base URL: `https://functiongram.vercel.app` (configurable via Settings)
- Auth endpoints: `/api/auth/*` (same as web)
- Social endpoints: `/api/social/*` (same as web)
- Upload endpoints: `/api/mobile/upload` (new, mobile-optimized) + `/api/upload` (Vercel Blob client)
- Same database: Neon PostgreSQL, same schema
- Same email: Brevo

## Build

### Debug APK (Universal)
```bash
cd android
./gradlew assembleDebug
# APK at: app/build/outputs/apk/debug/app-debug.apk
```

### Release APK (Optimized, minified, shrunk)
```bash
cd android
./gradlew assembleRelease
# APK at: app/build/outputs/apk/release/app-release.apk
```

### GitHub Actions
- Workflow: `.github/workflows/android-apk.yml`
- Triggers on push to `arena/01a0ecce-functiongram` and `main` when android files change
- Builds both debug and release APKs
- Uploads artifacts: `FunctionGram-debug-APK`, `FunctionGram-release-APK`

## APK Size Optimization

- R8 minification enabled for release
- Resource shrinking enabled
- ProGuard rules for Retrofit, OkHttp, Gson, Coil, Media3
- Universal APK (all ABIs, all DPIs) - larger but supports all devices
- Estimated size: ~15-25MB debug, ~10-20MB release (good size as requested)

## Installation

1. Download APK from GitHub Actions artifacts or Releases
2. Enable "Install unknown apps" for your browser/file manager
3. Install APK
4. Open app - splash screen shows RSTMC logo with DYPOL LABS watermark
5. Sign up / Login with same credentials as web app
6. Enjoy!

## Device Compatibility Check

On launch, app checks:
- RAM >= 3GB
- Storage >= 32GB
- Android >= 9 (API 28)

If not met, shows warning but allows continuation (degraded performance).

## Permissions

- INTERNET
- ACCESS_NETWORK_STATE
- READ_MEDIA_IMAGES / READ_MEDIA_VIDEO (Android 13+)
- READ_EXTERNAL_STORAGE (Android <=12)
- CAMERA (optional)
- RECORD_AUDIO (optional for video)

## Package Name Preference

- Preferred: `com.functiongram.dypollabs.app` (as requested)
- Fallback: `com.functiongram.dypollabs` (if .app not allowed)
- Current: `com.functiongram.dypollabs.app` (using preferred)

## Credits

- Original web app: FunctionGram (RSTMC)
- Android app: DYPOL LABS
- Logo: Enhanced from `/public/favicon.svg`
- Backend: Vercel + Neon PostgreSQL + Better Auth + Vercel Blob + Brevo
