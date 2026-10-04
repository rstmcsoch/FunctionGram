# Phase 9 — server feature policy / admin integration

The native app (`native-android/`, `com.functiongram.app`) keeps using `https://functiongram.vercel.app`. It does not talk to Turso, Postgres, Neon, or Supabase, and it does not ship a database credential. Capacitor `android/` is not part of this phase. There is no second admin panel and no second settings system on the device.

## Source of truth

Feature switches and maintenance live in the existing admin **Features** screen (`/admin-panel/features`), stored as `features.config`, and enforced on the server by `lib/feature-policy.ts` / `lib/features.ts`. The Android client only reads the resolved viewer flags from `GET /api/social` (`features`). It does not call `/api/admin/features` and does not invent rollouts.

`ServerFeatures` mirrors `FEATURE_KEYS`. Absent keys stay off. Numeric `0`/`1` booleans are accepted the same way earlier phases already did.

## Navigation (`VIEW_FEATURES`)

Shell destinations follow the same mapping as the website:

| Shell id | Admin flag |
| --- | --- |
| `reels` | `reels` |
| `search` | `search` |
| `explore` | `explore` |
| `messages` | `messages` |
| `notifications` | `notifications` |
| `saved` | `saves` |
| `create` | `uploads` |

Home and Profile have no feature key. When a flag is off, the dock / header / sidebar entry is hidden. If a previous selection becomes unavailable after flags load, the shell returns to Home. Opening Messages or Create while the flag is off is rejected on the client; the API would still answer `403` with `This feature is currently unavailable.`

## Surfaces already gated in earlier phases

Phase 7–8 already hid or skipped calls when the matching flag was off (stories tray, following tab, comments, search, notifications, follow, private accounts, saves, reels tab, reports, messages on a profile). Phase 9 keeps that behaviour and uses the full flag document for shell and messaging photo send (`uploads`).

## Maintenance

A maintenance `503` from `GET /api/social` keeps the server `error` string (same as earlier phases). The client does not invent maintenance copy. Admin accounts that bypass maintenance on the server are not special-cased in the APK.

## Not claimed here

Device QA, live admin mutations, and toggling production flags were not part of this phase. Unit tests use fixtures only.
