# Phase 6 messaging

The native app reads and sends messages through the existing FunctionGram HTTPS API. It does not create accounts, send messages on its own, or embed database credentials.

Production origin: `https://functiongram.vercel.app`

## Endpoints this client calls

| Call | Method and path | What the app does with it |
| --- | --- | --- |
| Conversation list | `GET /api/social?conversations=all&limit=100` | Renders the inbox. `unread_total` is shown as returned. |
| Thread | `GET /api/social?messages=<peer>&limit=50` and optional `cursor` | One page, newest first. The screen shows that page oldest-first. "Load earlier messages" sends the server cursor. |
| Text | `POST /api/social` `{"action":"message","id","body"}` | Sends the trimmed draft. `message_type` is omitted so the server treats it as text. |
| Photo upload | `POST /api/message-attachment` multipart `key`, `file`, `category=image` | The key is a new UUIDv4. Bytes are the picked file. |
| Photo message | `POST /api/social` `action=message`, `message_type=image`, `media_key`, `body` caption, `view_once=false` | Sent only after the attachment call returns a key. |
| Mark read | `POST /api/social` `{"action":"read_messages","id"}` | After a thread loads. A failure here does not hide messages already loaded. A 401 is shown. |
| Photo bytes | `GET /api/message-media/<message id>` | Loaded only when `media_url` is exactly `/api/message-media/<that id>`. The viewer is in-app. |

Writes send `Origin` set to the same public API origin, via the existing interceptor. The session cookie already stored for sign-in is attached. It is not logged.

An unauthenticated probe of these routes on 4 Oct 2026 returned `401` with `{"error":"Sign in to join the conversation."}`. `GET /api/health` still returned `{"status":"ready"}`. No account was created and no message was sent.

## Server decisions the UI shows

Blocked accounts, admin send/receive pauses, follower-only private accounts, maintenance, disabled `messages` or `uploads`, rate limits, and length limits are whatever the API returns in `error`. The app does not keep a second allow-list. Retry sends the same request again.

`403` with "This feature is currently unavailable." is the feature-policy response (`messages` for the list and thread, `uploads` for a photo). The text is shown as-is.

## Not in this phase

Voice, files, GIFs, stickers, replies, edits, reactions, pins, forwarding, search, typing, and presence are not called. View-once is not consumed; opening a view-once photo shows the server's refusal. The thread does not poll. Archived, unread, and favorite filters are not separate tabs; the list asks for `all`, which the server already limits to conversations that are not archived. Photos larger than the API's absolute upload ceiling (100 MB plus 64 KB) are not read into memory. Device QA was not run.
