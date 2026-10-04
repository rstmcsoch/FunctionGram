# Phase 8 — native profiles, search, notifications, and settings

The native app (`native-android/`, `com.functiongram.app`) keeps using `https://functiongram.vercel.app`. It does not talk to Turso, Postgres, Neon, or Supabase, and it does not ship a database credential. Capacitor `android/` is not part of this phase. There is no second admin client.

Profiles use the website's username route. A normal account is `/<username>`. A name reserved for an application path (`api`, `admin-panel`, and the rest of `lib/profile-url.ts`) stays on the legacy `/#/profile/<username>` link and is never opened as that root path. The screen does not use a generic `/profile` destination. `GET /api/social?person=` accepts the username or the account id. `GET /api/social?profile=` is only the post grid, and only after that lookup, and its value is the account id.

## Routes used

| Call | What the app does |
| --- | --- |
| `GET /api/social` | Feature flags and `me`. Posts in that payload are not shown on these screens. |
| `GET /api/social?person=` | One profile. `null` means there is no such account. |
| `GET /api/social?profile=` | That account's posts. Stories are hidden. Reels stay on the Reels tab. |
| `GET /api/social?saved=1` | The signed-in account's saved posts, and only on their own profile when `features.saves` is true. |
| `GET /api/social?people=1&limit=` | Suggestions on Search. Sample accounts (`is_demo`) are not listed. |
| `GET /api/social?search=` | People and posts after two characters. Requires `features.search`. |
| `GET /api/social?notifications=1` | The notification list. Requires `features.notifications`. The body is `{results}`. |
| `POST /api/social` `read_notifications` | Marks the list read after it loads. The same notifications flag gates it. |
| `GET /api/social?relations=&kind=` | Followers or following. Requires `features.follow`. `kind` is only `followers` or `following`. |
| `POST /api/social` `follow`, `block`, `unblock`, `report` | Profile actions. Follow needs `features.follow`. Report needs `features.reports`. Block has no separate flag. |
| `POST /api/social` `profile` | Saves username, name, bio, and website. The current avatar path is sent again. A new photo is not uploaded here. |
| `POST /api/social` `set_privacy` | Private account. Shown only when `features.privateAccounts` is true. |
| `GET /api/social?collections=1` and `create_collection` / `delete_collection` | Settings collections when `features.saves` is true. |
| `POST /api/auth/change-email` | Asks Better Auth to email a confirmation. The address does not change in the app. |
| `POST /api/auth/delete-user` | Asks Better Auth to email a deletion link. The account is not deleted in the app. |
| `GET /api/media/<key>` | Avatars and post thumbnails, same rule as the feed. |

A flag that is off is not called when the screen already knows. If the server still answers `403` with `This feature is currently unavailable.`, that sentence is shown. `401` stays `Sign in to join the conversation.` Maintenance `503` is shown and these screens do not continue.

Theme is light, dark, or system, stored on the device under `rstmc-theme`. The website does the same in local storage. There is no account theme field on `/api/social`, and the admin appearance API is not called.

## Unauthenticated probe

No account was created, changed, or deleted. Guest browsing was on, so some reads returned `200` and empty results. Live rows were not copied into the app or the tests.

- `GET /api/social?notifications=1` → `401` `{"error":"Sign in to join the conversation."}`
- `GET /api/social?activity=1` → `401` `{"error":"Sign in to join the conversation."}`
- `GET /api/social?collections=1` → `401` `{"error":"Sign in to join the conversation."}`
- `GET /api/social?person=` → `400` `{"error":"Please complete the required fields."}`
- `GET /api/social?person=not-a-real-user` → `200` `null`
- `GET /api/social?profile=not-a-real-user` → `200` `[]`
- `GET /api/social?search=` → `200` `{"people":[],"posts":[]}`
- `GET /api/social?search=` with an 81-character term → `400` `{"error":"Please check the length of your text."}`
- `GET /api/social?relations=not-a-real-user&kind=nope` → `400` `{"error":"Invalid relationship."}`
- `POST /api/social` `set_privacy`, `profile`, and `read_notifications` without a session → `401` `{"error":"Sign in to join the conversation."}`

`GET /api/social?activity=1` exists and is not polled.

## Not in this build

- No device or emulator QA.
- No avatar upload. Edit profile keeps the current avatar path.
- Search does not open `GET /api/social?hashtag=` or Explore.
- A post opened from search does not load its comment thread.
- Email change and account deletion only start the existing email confirmation. They were not called against the live service.
- Highlights, tagging grids, and the dock Saved destination are not screens here.

Feature-policy / admin flag consumption for the shell is Phase 9. See `POLICY.md`.
