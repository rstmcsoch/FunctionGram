# Phase 4 authentication

The native app signs in through the existing FunctionGram website. It does not create accounts, store passwords, or embed database or server secrets.

Production origin: `https://functiongram.vercel.app`

## Endpoints this client calls

All routes are Better Auth handlers mounted at `app/api/auth/[...all]/route.ts` (better-auth 1.7.3).

| Call | Method and path | What the app does with it |
| --- | --- | --- |
| Health probe (not auth) | `GET /api/health` | Already used by earlier phases. A live unauthenticated call returned `200` `{"status":"ready"}`. |
| Sign in | `POST /api/auth/sign-in/email` | JSON body `email`, `password`, `rememberMe: true`. No `callbackURL`. |
| Session check | `GET /api/auth/get-session` | Reads the signed session cookie. `200` with JSON `null` means no usable session. |
| Authenticator code | `POST /api/auth/two-factor/verify-totp` | JSON body `code` only. Sent only after sign-in returns `twoFactorRedirect`. |
| Logout | `POST /api/auth/sign-out` | JSON `{}`. Deletes the current server session and expires the auth cookies. |

The app sends `Origin: https://functiongram.vercel.app` (the same public origin it calls) and `Accept: application/json`. Better Auth checks `Origin` once a cookie is present, and on the first sign-in when `Origin` is set. `trustDevice` is not sent. Server config sets `trustDeviceMaxAge` to `0`.

## Cookies

Production responses use the `__Secure-` prefix because the site is HTTPS:

- `__Secure-better-auth.session_token` is the session. The value is an opaque signed cookie. The app stores that value and sends it back. It does not keep the raw `token` field from the JSON body.
- `__Secure-better-auth.session_data` and `__Secure-better-auth.dont_remember` are accepted if the server sets them. Cookie cache is not enabled in `lib/auth-config.ts`, so `session_data` is not expected on a normal sign-in.
- `__Secure-better-auth.two_factor` is the short challenge cookie between password sign-in and TOTP. Server `twoFactorCookieMaxAge` is 300 seconds.

Any other `Set-Cookie` name is ignored. Cookie values are not written to log lines. `StoredAuthCookie.toString()` and auth request `toString()` redact secrets.

Persistence uses `EncryptedSharedPreferences` (AndroidX Security Crypto 1.0.0) with a Keystore-backed master key, on top of the in-memory jar OkHttp reads. If the Keystore cannot open, the app keeps the session in process memory only and does not fall back to plaintext `SharedPreferences`. Backup and device transfer already exclude shared preferences. Passwords exist only in the sign-in request body for that call.

## Session length, refresh, and revocation

`lib/auth-config.ts` sets both `session.expiresIn` and `session.updateAge` to three days (259200 seconds). Better Auth extends a session from `GET /get-session` only when `expiresAt - expiresIn + updateAge <= now`. With those two values equal, that is `expiresAt <= now`, which is already an expired session. The window is not extended by use. Signing in again creates a new session.

`POST /api/auth/get-session` is not a refresh. A live unauthenticated call returned `405` with code `METHOD_NOT_ALLOWED_DEFER_SESSION_REQUIRED`. `deferSessionRefresh` is not enabled, so this client never POSTs that path and does not invent a refresh token. If a future server config emits a new `Set-Cookie` on `GET /get-session`, the jar will store that cookie. That is not a client-side extension.

Logout revokes the current session with `POST /api/auth/sign-out`. A live call with no cookie returned `200` `{"success":true}` and `Set-Cookie` `Max-Age=0` for `session_token`, `session_data`, and `dont_remember`. The app always deletes its local copy after that call. If the network fails, the local copy is still deleted and the UI says the server session could not be revoked. It then expires on its own (three days from creation).

These Better Auth routes also exist and are intentionally not called:

- `POST /api/auth/revoke-session` requires the raw session token. This client does not store that token.
- `POST /api/auth/revoke-sessions` revokes every session for the user, including the website.
- `POST /api/auth/revoke-other-sessions` revokes other devices. There is no session list in this phase.

## Error mapping checked against the live API

These calls used no real account and were not repeated as guesses:

- `POST /api/auth/sign-in/email` with a syntactically invalid email returned `400` `{"message":"Invalid email","code":"INVALID_EMAIL"}`.
- One call with `phase4-unauthenticated-probe@example.invalid` and a non-password returned `401` `{"message":"Invalid email or password","code":"INVALID_EMAIL_OR_PASSWORD"}`.
- `GET /api/auth/get-session` with no cookie returned `200` and body `null`.
- `POST /api/auth/two-factor/verify-totp` with no challenge cookie returned `401` `{"message":"Invalid two factor cookie","code":"INVALID_TWO_FACTOR_COOKIE"}`.

No real account was signed in. TOTP success, email-not-verified, account-unavailable, rate limit, and lockout were mapped from the server source and unit-tested with fixtures, not observed on a live account.

Other codes the client maps when the server sends them: `EMAIL_NOT_VERIFIED`, `PASSWORD_TOO_SHORT`, `PASSWORD_TOO_LONG`, `INVALID_CODE`, `TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE`, `ACCOUNT_TEMPORARILY_LOCKED`, HTTP 429, and HTTP 503. The sign-in route can also return HTTP 403 with message `This account is unavailable.` from the account hook. HTTP 503 from the auth route wrapper uses the message `Sign-in is temporarily unavailable. Please try again later.`

## Not implemented

- Creating accounts, password reset, email change, and account deletion.
- Backup-code sign-in (`/two-factor/verify-backup-code`) and email OTP. The server plugin does not configure `sendOTP`. The UI asks for an authenticator code when the challenge says `totp` or lists no method.
- Trusting this device.
- A multi-session manager.
- Detecting a banned account on `GET /get-session`. Suspension of an existing session is enforced by the website's `getAppUser` on later routes, not by the session payload. New sign-in is blocked with `This account is unavailable.`
