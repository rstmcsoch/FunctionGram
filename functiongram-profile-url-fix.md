# Fix the FunctionGram profile URL system

This is a routing/canonical-URL change, not a database migration.

## CURRENT PROBLEM

1. Clicking a user's profile can produce a URL like:
   `/#/profile`
   or:
   `/#/profile/<internal-profile-id>`

2. The public profile URL must be the account's actual username directly at the site root. No hash, no `/profile` segment.

3. The "Share Profile" dialog currently generates the link using `profile.id`, so the copied/shared URL does not contain the username.

## REQUIRED CANONICAL FORMAT

Use:

`/<username>`

Example:

`https://functiongram.vercel.app/rstmc`

Never:

- `/#/profile/rstmc`
- `/profile/rstmc`
- `/#/rstmc`

The username must come from the profile's `username` field, never from the display name and never from the internal UUID.

## FILES TO REVIEW

- `components/social/app.tsx`
- `components/social/views.tsx`
- `app/api/social/route.ts`
- `lib/server.ts`
- `app/page.tsx` and `app/layout.tsx` (how the social app is mounted)
- `next.config.*`, `vercel.json`, and `middleware.ts` if present (rewrites, matchers)
- Any tests covering social/profile routing

## IMPLEMENTATION REQUIREMENTS

### 1. FIX PROFILE NAVIGATION

Update the central `navigate()` logic in `components/social/app.tsx`.

When `target === "profile"`:

- If an `id` is supplied, resolve that person from `data.people` and use `person.username` in the URL.
- If no `id` is supplied, this means the current user's profile; use `data.me.username`.
- The resulting URL must be:
  `/<encoded-username>`

Set it with the History API (or the Next.js router, whichever the app already uses). Do not append a hash.

When navigating to any non-profile target (feed, messages, search, etc.), reset the path to `/` and keep the existing hash route (for example `/#/messages`). A profile path must never linger in the URL after leaving a profile.

Do not expose internal profile IDs in canonical profile URLs.

### 2. SUPPORT USERNAME-BASED PATH ROUTING

Add a route that serves the same social app at `/<username>`. For example, in Next.js, `app/[username]/page.tsx` mounting the existing app component with the username as the initial profile route. Match the project's existing structure.

The route parser currently reads the hash segment and stores the second segment as `profileId`. Change it so that route state is derived like this:

- First, read `window.location.pathname`. If it is a single non-empty segment that is not a reserved path, treat it as a profile route with the decoded segment as `routeValue`.
- Otherwise, fall back to the existing hash parsing for all other views.

The client-side profile lookup must:

- Try exact username match first (`person.username === routeValue`).
- Fall back to profile ID (`person.id === routeValue`) so old links still work.

Do not make username matching case-sensitive if usernames are stored normalized to lowercase.

Listen to `popstate` as well as the existing `hashchange`, so back/forward works between profile paths and hash views.

### 3. KEEP INTERNAL IDs FOR API OPERATIONS

Do NOT replace internal IDs everywhere.

After resolving the profile route to a `Person`, continue using:

`profile.id`

for database/API operations such as:

`/api/social?profile=<profile.id>`

and profile post loading.

Only the public URL identifier should change from ID -> username.

### 4. FIX SHARE PROFILE LINK

In `ShareProfileDialog` inside `components/social/app.tsx`, change the generated link from:

`origin + "/#/profile/" + encodeURIComponent(profile.id)`

to:

`origin + "/" + encodeURIComponent(profile.username)`

Create one helper (for example `profileUrl(username)`) that builds the path, and use it in both `navigate()` and `ShareProfileDialog`.

This exact canonical link must be used for:

- displayed profile link
- Copy button
- `navigator.share()`
- sending the profile link in a FunctionGram message, if applicable

There must be one canonical link value so these paths cannot disagree.

### 5. OWN PROFILE

When the signed-in user clicks their own profile from:

- sidebar/profile navigation
- account card
- mobile/profile navigation
- any other "your profile" entry

the URL must still include their username.

Example:

`https://functiongram.vercel.app/rstmc`

Never leave it as just:

- `/`
- `/#/profile`

### 6. OTHER USERS

Clicking another user's:

- avatar
- username
- search result
- suggestion
- follower/following result
- notification profile
- tagged profile

must navigate to that user's username URL.

Example:

`/alice`

not:

- `/#/profile/<uuid>`
- `/profile/alice`

### 7. BACKWARD COMPATIBILITY

Do not break existing shared profile URLs.

If someone opens any of these:

- `/#/profile/<old-id>`
- `/#/profile/<username>`
- `/#/profile` (own profile, if signed in)

the app should still resolve it to the correct profile and display it.

After resolving a legacy hash URL, rewrite the address bar to `/<username>` using `history.replaceState` (no new history entry).

For normal navigation/share operations, generate the new root-level username URL.

### 8. USERNAME VALIDATION / ENCODING

Use `encodeURIComponent(profile.username)` when constructing URLs.

When reading the route, decode it safely (wrap `decodeURIComponent` in try/catch; a malformed value must show "profile not found", not crash).

Do not use display names.

Do not manually concatenate unescaped usernames.

Usernames containing `.` (for example `john.doe`) must not be treated as static files. Check that `middleware.ts` matchers, `next.config.*` rewrites and `vercel.json` do not exclude or intercept paths containing a dot.

### 9. USERNAME CHANGES

After a user changes their username, all newly generated profile links must use the new username automatically because the link is generated from the current `profile.username`.

Do not store a stale profile URL in local storage or component state.

Do not add username-history or redirects from old usernames. Mention in the final report that old `/<old-username>` links will stop resolving.

### 10. RESERVED PATHS AND COLLISIONS

A root-level `/<username>` route must not shadow anything that already exists.

- List every existing top-level route (for example `/api`, `/admin`, and any other folder under `app/`).
- Existing routes must keep priority over `/<username>`.
- Reserved paths must never resolve as a profile.
- Check whether any existing username equals an existing top-level route name, and report it in the final summary. Do not change the profile schema or signup/auth logic to fix it.

### 11. DO NOT CHANGE

Do not modify:

- authentication behavior
- password/email verification
- database provider
- Turso connection
- Neon migration
- profile schema
- follow/block logic
- post IDs
- message IDs
- media URLs
- admin routes
- hash routes of non-profile views
- unrelated UI

This should be a focused routing/canonical-link fix.

### 12. TEST CASES

Add or update tests covering at minimum:

**A. Own profile navigation**

Given username `rstmc`, clicking own profile results in:

`/rstmc`

**B. Other profile navigation**

Given username `alice`, clicking Alice's profile results in:

`/alice`

**C. Share profile**

The Share Profile dialog displays:

`<origin>/alice`

and Copy copies exactly that URL.

**D. Native share**

`navigator.share()` receives the same username URL.

**E. Direct username route**

Opening:

`/alice`

loads Alice's profile.

**F. Legacy ID route**

Opening:

`/#/profile/<alice-id>`

still loads Alice's profile, and the address bar becomes `/alice`.

**G. Legacy username hash route**

Opening:

`/#/profile/alice`

still loads Alice's profile, and the address bar becomes `/alice`.

**H. Username with special valid characters**

Examples such as:

`john_doe`
`john.doe`

must produce correctly encoded URLs and resolve correctly.

**I. Leaving a profile**

Navigating from `/alice` to messages results in `/#/messages`, not `/alice#/messages`.

**J. Reserved paths**

`/api/...` and `/admin` are unaffected and never treated as profiles.

### 13. FINAL VERIFICATION

Run the project's existing lint/typecheck/test/build commands.

Verify there are no TypeScript errors.

Do not create a second routing system. Keep the central `navigate()` as the single place URLs are produced, and keep hash routing for non-profile views.

## EXPECTED RESULT

Before:

`/#/profile`

`/#/profile/550e8400-e29b-41d4-a716-446655440000`

After:

`https://functiongram.vercel.app/rstmc`

`https://functiongram.vercel.app/alice`

The profile page must still internally use the resolved profile ID for database/API requests.
