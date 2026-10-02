/**
 * HTTP-level performance harness.
 *
 * Boots the built Next.js server against a seeded local libSQL database,
 * signs a real account in through Better Auth, and measures the request
 * timings and payload sizes a browser would see:
 *
 *   - first HTML/RSC response time for `/`
 *   - bootstrap API duration and bytes
 *   - per-interaction API durations (like, comment, follow, save, block)
 *   - how many feed images the first screen requests eagerly
 *   - database round trips per request when FUNCTIONGRAM_PERF_LOG=1
 *
 * Usage:
 *   TURSO_DATABASE_URL=file:/tmp/fg-perf.db node scripts/perf-http.mjs
 */
import { spawn } from 'node:child_process';

const url = process.env.TURSO_DATABASE_URL;
if (!url) throw new Error('Set TURSO_DATABASE_URL to a seeded local database.');
const port = Number(process.env.PERF_PORT || 3100);
const origin = `http://127.0.0.1:${port}`;
const rounds = Number(process.env.PERF_ROUNDS || 5);

const env = {
  ...process.env,
  PORT: String(port),
  HOSTNAME: '127.0.0.1',
  NODE_ENV: 'production',
  DATABASE_URL: process.env.DATABASE_URL || 'postgres://placeholder',
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET || 'x'.repeat(40),
  BREVO_API_KEY: process.env.BREVO_API_KEY || 'perf-key',
  BREVO_SENDER_EMAIL: process.env.BREVO_SENDER_EMAIL || 'perf@example.test',
  BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN || 'vercel_blob_rw_perf',
  NEXT_PUBLIC_DEV_MODE: '0',
  FUNCTIONGRAM_PERF_LOG: '1',
  BETTER_AUTH_URL: origin,
};

const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(port)], {
  cwd: process.cwd(), env, stdio: ['ignore', 'pipe', 'pipe'],
});
const logLines = [];
if (process.env.PERF_SERVER_LOG) {
  const { createWriteStream } = await import('node:fs');
  const sink = createWriteStream(process.env.PERF_SERVER_LOG);
  server.stdout.pipe(sink);
  server.stderr.pipe(sink);
}
for (const stream of [server.stdout, server.stderr]) {
  stream.setEncoding('utf8');
  let buffer = '';
  stream.on('data', chunk => {
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) logLines.push(line);
  });
}
server.on('exit', code => { if (code && code !== 0 && code !== null) console.error('server exited', code); });

async function waitForServer() {
  for (let i = 0; i < 120; i += 1) {
    try {
      const response = await fetch(origin + '/api/health');
      if (response.status === 200) return;
    } catch { /* not up yet */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('server did not start');
}

const timings = [];
async function timed(label, path, init = {}) {
  const samples = [];
  let bytes = 0;
  let status = 0;
  for (let i = 0; i < rounds; i += 1) {
    const started = performance.now();
    const response = await fetch(origin + path, { redirect: 'manual', ...init });
    const body = await response.text();
    samples.push(performance.now() - started);
    bytes = body.length ? body.length : bytes;
    status = response.status;
  }
  samples.sort((a, b) => a - b);
  const median = samples[Math.floor(samples.length / 2)];
  timings.push({ label, median, status, bytes });
  console.log(`${label.padEnd(32)} median=${median.toFixed(0).padStart(6)}ms  status=${status}  bytes=${bytes}`);
  return { median, status, bytes };
}

function cookieFrom(response) {
  const header = response.headers.getSetCookie?.() ?? [];
  return header.map(value => value.split(';')[0]).join('; ');
}

async function authenticate() {
  const email = `perf${Date.now()}@example.test`;
  const password = 'Perf-password-123!';
  await fetch(origin + '/api/auth/sign-up/email', {
    method: 'POST', headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify({ email, password, name: 'Perf User', callbackURL: '/' }),
  });
  // Verify out-of-band (the real flow does this through the emailed link).
  const { createClient } = await import('@libsql/client');
  const client = createClient({ url });
  await client.execute({ sql: 'UPDATE "user" SET "emailVerified"=1 WHERE email=?', args: [email] });
  await client.close?.();
  const signin = await fetch(origin + '/api/auth/sign-in/email', {
    method: 'POST', headers: { 'content-type': 'application/json', origin, host: new URL(origin).host },
    body: JSON.stringify({ email, password, callbackURL: '/' }),
  });
  if (signin.status !== 200) throw new Error('sign-in failed: ' + signin.status + ' ' + await signin.text());
  return cookieFrom(signin);
}

await waitForServer();
console.log(`\n— anonymous —`);
await timed('GET / (HTML/RSC)', '/');
await timed('GET /api/social (bootstrap)', '/api/social');

const cookie = await authenticate();
const authed = { headers: { cookie } };
console.log(`\n— signed in —`);
const bootstrap = await timed('GET /api/social (bootstrap)', '/api/social', authed);
const feed = JSON.parse(await (await fetch(origin + '/api/social', authed)).text());
await timed('GET / (HTML/RSC)', '/', authed);
await timed('GET /api/social?activity=1', '/api/social?activity=1', authed);
const firstPost = feed.posts?.[0];
if (firstPost) {
  await timed('GET /api/social?post=', '/api/social?post=' + encodeURIComponent(firstPost.id), authed);
  await timed('POST like', '/api/social', {
    ...authed, method: 'POST',
    headers: { ...authed.headers, 'content-type': 'application/json', origin, host: new URL(origin).host },
    body: JSON.stringify({ action: 'reaction', id: firstPost.id, kind: 'like', active: true }),
  });
  await timed('POST comment', '/api/social', {
    ...authed, method: 'POST',
    headers: { ...authed.headers, 'content-type': 'application/json', origin, host: new URL(origin).host },
    body: JSON.stringify({ action: 'comment', id: firstPost.id, body: 'perf harness comment' }),
  });
}
await timed('GET /api/social?profile=', '/api/social?profile=' + encodeURIComponent('u3'), authed);
await timed('GET /api/social?explore', '/api/social?explore', authed);
await timed('GET /api/social?saved=1', '/api/social?saved=1', authed);
await timed('GET /api/social?following=1', '/api/social?following=1', authed);
await timed('GET /api/social?collections', '/api/social?collections', authed);
await timed('GET /api/social?inbox=1', '/api/social?inbox=1', authed);

const legacy = process.env.PERF_LEGACY === '1';
if (firstPost && !legacy) {
  await timed('GET comments page', '/api/social?comments=' + encodeURIComponent(firstPost.id) + '&limit=20', authed);
  await timed('GET people page', '/api/social?people=1&limit=40', authed);
  await timed('GET conversation', '/api/social?messages=' + encodeURIComponent('u5') + '&limit=50', authed);
  await timed('GET notifications view', '/api/social?notifications=1', authed);
  await timed('GET lazy person', '/api/social?person=' + encodeURIComponent('u3'), authed);
  await timed('GET account search', '/api/social?accounts=u', authed);
  await timed('GET highlights', '/api/social?highlights=' + encodeURIComponent('u3'), authed);
  await timed('GET tagged feed', '/api/social?tagged=' + encodeURIComponent('u3'), authed);
  await timed('POST follow', '/api/social', {
    ...authed, method: 'POST',
    headers: { ...authed.headers, 'content-type': 'application/json', origin, host: new URL(origin).host },
    body: JSON.stringify({ action: 'follow', id: 'u5', active: true }),
  });
  await timed('POST save', '/api/social', {
    ...authed, method: 'POST',
    headers: { ...authed.headers, 'content-type': 'application/json', origin, host: new URL(origin).host },
    body: JSON.stringify({ action: 'reaction', id: firstPost.id, kind: 'save', active: true }),
  });
}

const html = await (await fetch(origin + '/', authed)).text();
const eager = (html.match(/loading="eager"/g) || []).length;
const lazy = (html.match(/loading="lazy"/g) || []).length;
const mediaUrls = new Set(html.match(/\/api\/media\/[a-f0-9-]{36}/g) || []);
console.log(`\n— first screen media —\nimg eager=${eager} lazy=${lazy} distinct /api/media urls=${mediaUrls.size} rsc_bytes=${bootstrap.bytes}`);

await new Promise(resolve => setTimeout(resolve, 300));
const perf = logLines.filter(line => line.startsWith('[perf] '));
if (perf.length) {
  // Group by endpoint so each path shows one trip count, not every sample.
  const grouped = new Map();
  for (const line of perf) {
    const match = /^\[perf\] (.*?) db_trips=(\d+)/.exec(line);
    if (!match) continue;
    const key = match[1].replace(/=[^&]*/g, '=…');
    const entry = grouped.get(key) ?? { trips: [], count: 0 };
    entry.trips.push(Number(match[2]));
    entry.count += 1;
    grouped.set(key, entry);
  }
  console.log(`\n— database round trips per request —`);
  for (const [key, entry] of grouped) {
    const max = Math.max(...entry.trips);
    console.log(`${key.padEnd(44)} samples=${String(entry.count).padStart(2)}  db_trips=${entry.trips.join(',')}  max=${max}`);
  }
}
const errors = logLines.filter(line => /error|failed|rejected/i.test(line) && !line.includes('[perf]'));
if (errors.length) {
  console.log(`\n— server errors observed —`);
  for (const line of [...new Set(errors)]) console.log(line.slice(0, 240));
}

server.kill('SIGTERM');
setTimeout(() => process.exit(0), 500);
