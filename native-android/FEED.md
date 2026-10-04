# Phase 7 — native feed, posts, stories, and media

The native app (`native-android/`, `com.functiongram.app`) reads the existing social API at `https://functiongram.vercel.app`. It does not talk to Turso, Postgres, Neon, or Supabase, and it does not ship a database credential. Capacitor `android/` is not part of this phase.

This phase does not create posts, stories, comments, likes, or messages. The repository has no write method for those actions.

## Routes used

| Call | What the app does |
| --- | --- |
| `GET /api/social` | Home bootstrap: feature flags, public story settings, `me`, and the first posts (`hasMore` when the server says so). |
| `GET /api/social?offset=` | Next discovery page. A bare array. A full page of 40 means there may be more. The offset is the number of rows already taken from this feed, including stories and reels, matching the website. |
| `GET /api/social?following=1&offset=` | Following tab. Shown only when `features.follow` is true. The body is `{posts, hasMore}`. |
| `GET /api/social?post=` | Refresh the open post. An empty array means it is gone. |
| `GET /api/social?comments=&limit=` | Read comments when `features.comments` is true. `next_cursor` loads the next page. |
| `GET /api/social?reels=1&offset=` | Reels tab. A full page of 20 means there may be more. Video posts already on the home payload are merged the same way the website merges them. |
| `GET /api/media/<36-character key>` | Photo bytes and video playback. Only paths shaped `/api/media/<key>` are requested. |

Production media answers `307` to `https://*.public.blob.vercel-storage.com`. OkHttp follows that HTTPS redirect. The session cookie is host-scoped to the API, so it is not attached to the blob host. Absolute URLs in a post are not requested.

## What the home screen shows

- For you: posts whose `kind` is not `story` and not `reel`.
- Story tray: `kind=story` rows from the home payload that have not expired, and only when `features.stories`, `stories.enabled`, and `stories.tray` are all true. There is no separate stories list route. Stories that are not in the pages already loaded do not appear.
- Multi-image posts: the `media` array, with `aspects` and `media_options`.
- Counts: `display_likes`, `display_comments`, and `display_views` only when the server sends a number. `null` means that counter is hidden.
- Liked and Saved are labels when the server says so. They are not buttons.
- Photos are kept in memory (about 24 MB) and are not written to disk. Pulling Refresh loads the bootstrap again.

## Routes that exist and are not opened here

- `GET /api/social?explore=` and `GET /api/social?hashtag=` — Explore is still a placeholder.
- `GET /api/social?search=`, `GET /api/social?person=`, `GET /api/social?profile=`, `GET /api/social?notifications=`, and account settings are Phase 8. See `PROFILES.md`.
- The Saved destination in the dock is still a placeholder. A profile's saved tab uses `GET /api/social?saved=` when that profile is your own and saves are enabled.
- `GET /api/social?highlights=<owner>` — story highlights. Not shown. An unknown owner returned `200 []` while signed out.
- `GET /api/social?story-viewers=<id>` — owner-only. Not shown. Signed out it returned `401` `{"error":"Sign in to join the conversation."}`.
- `POST /api/social` actions `create_post`, `reaction`, `comment`, `highlight`, and story replies — not called.

## Unauthenticated probe

No account was created and no content was posted. Guest browsing was enabled on the server, so some reads returned `200` and real rows. Those rows were not copied into the app or the tests.

- `GET /api/health` → `200` `{"status":"ready"}`
- `GET /api/social` → `200` bootstrap object
- `GET /api/social?offset=0` → `200` JSON array
- `GET /api/social?following=1&offset=0` → `401` `{"error":"Sign in to join the conversation."}`
- `GET /api/social?post=not-a-real-post` → `200` `[]`
- `GET /api/social?reels=1&offset=0` → `200` JSON array
- `GET /api/social?comments=not-a-real-post` → `404` `{"error":"This post is no longer available."}`
- `GET /api/social?highlights=not-a-real-user` → `200` `[]`
- `GET /api/social?story-viewers=not-a-real-story` → `401` `{"error":"Sign in to join the conversation."}`
- `GET /api/media/not-a-key` and `GET /api/media/<unknown uuid>` → `404` `{"error":"Media not found."}`

## Not in this build

- No device or emulator QA.
- No publishing, likes, saves, comments, or story replies.
- The feed does not autoplay video. A video plays in the viewer. Story photos advance using `photoSeconds`. Story videos advance when playback ends.
- Seen is not recorded (`reaction` / `seen` is a write).
- Hold-to-pause and swipe use the same rules as `lib/story-playback.ts` and are covered by unit tests. The viewer applies them on pointer up.
- Photos larger than 20 MB are not decoded.
- The thread and the feed do not share a disk cache.
