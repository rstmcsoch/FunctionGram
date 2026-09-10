# FunctionGram

The RSTMC social app, adapted for Vercel with Next.js, PostgreSQL, Better Auth, and Vercel Blob.

## Features

Responsive feed, stories, reels, image/video uploads, likes, comments, saved posts, profiles, follows, notifications, and private messages between registered members. Starter profiles are samples.

## Vercel setup

1. Deploy this branch with the Next.js framework preset and project name `functiongram`.
2. In the Vercel project, connect a **Neon PostgreSQL** database through Storage/Marketplace. The app accepts `DATABASE_URL` or `POSTGRES_URL`. Use the provider-generated connection string with TLS enabled. Do not reuse another application's database.
3. Connect a **public Vercel Blob** store. Ensure `BLOB_READ_WRITE_TOKEN` is available to the deployment. Uploaded social media is publicly accessible; messages remain stored in PostgreSQL and are restricted to their participants.
4. Add `BETTER_AUTH_SECRET` (at least 32 random characters). Generate it locally with `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` and paste it into Vercel's encrypted environment-variable settings. Never commit this value.
5. Set `BETTER_AUTH_URL` to the stable production origin once known. It is optional for previews; Vercel's deployment origin is used automatically.
6. Select the deployment environments for these variables, then redeploy.

The app shows a setup page while required configuration is missing. `/api/health` returns HTTP 503 until configuration and the database are ready. Database schema creation is automatic, transactional, versioned, and guarded by a PostgreSQL advisory lock on first use. Repeated startup does not reset data.

This is a separate backend from the original Sites deployment. Existing Sites accounts, posts and uploaded media have **not** been migrated. Vercel users register with email and password. Email verification and password-reset email delivery are not configured; the sign-up screen discloses the lack of email recovery. Passwords and session handling use Better Auth. Never trust client-supplied Sites identity headers on Vercel.

## Local development

Requires Node.js 22.13 or newer and npm.

```sh
npm ci
# Populate the variables listed in .env.example in an ignored .env.local file.
npm run dev
```

Set `BETTER_AUTH_URL=http://localhost:3000` for local development. Use a separate development database and Blob store. Files upload directly from the browser to Blob with a short-lived token scoped to one immutable UUID, MIME type and exact size. The server authorizes the user, reserves quota, checks uploaded magic bytes and records ownership before the file can be attached to a post. This supports the 20 MB app limit without sending large videos through a Vercel Function request body.

## Verification

```sh
npm run test:vercel
npm run build
```

The migration tests use an isolated PostgreSQL-compatible PGlite database and exercise the actual feed/profile SQL, duplicate reaction handling, participant-only message queries, author-only deletion, transaction rollback, cascades, unique usernames, upload quota totals and file-type checks. The Next.js production build and TypeScript check were run locally without production credentials.

Live account registration, durable uploads, cross-account messaging, provider quota behavior and deployment-domain cookies still need end-to-end validation after the Vercel resources are connected. `tests/integration.mjs` and the original `VERIFICATION.md` describe the earlier Sites/Cloudflare version; those 43 checks are not proof of this Vercel deployment.

## Source history

The earlier Sites implementation is preserved in the repository history at `b61f33a5d64cadfd45aeb634c120a9a45d4a99e7`. The old Drizzle SQLite schema, hosting scripts and configuration are retained only as migration reference; Next.js builds use `next.config.ts` and `vercel.json`, and the current PostgreSQL schema is in `lib/postgres-schema.ts`.

Media credits are in `public/media/photo-credits.json` and `public/media/portrait-credits.json` and the app's About dialog.
