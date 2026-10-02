/**
 * Database-level performance baseline: executes the real hot-path functions
 * against a seeded local libSQL database and reports, for each one, the number
 * of database round trips and the wall-clock time they take.
 *
 * On the deployed runtime every round trip is an HTTP request to Turso, so the
 * trip count is the part of request latency the application controls.
 *
 * Usage:
 *   TURSO_DATABASE_URL=file:/tmp/fg-perf.db node --import tsx scripts/perf-queries.mts
 */
process.env.DATABASE_URL ||= 'postgres://placeholder';
process.env.BETTER_AUTH_SECRET ||= 'x'.repeat(40);

const url = process.env.TURSO_DATABASE_URL;
if (!url) throw new Error('Set TURSO_DATABASE_URL to a seeded local database.');

const { ensureSchema, getPool } = await import('../lib/postgres');
const server = await import('../lib/server');

type Counter = { trips: number; ms: number };
const pool = await getPool() as unknown as {
  query: (...args: unknown[]) => Promise<unknown>;
  batch?: (...args: unknown[]) => Promise<unknown>;
};
const originalQuery = pool.query.bind(pool);
const originalBatch = pool.batch?.bind(pool);
const state: Counter = { trips: 0, ms: 0 };
pool.query = async (...args: unknown[]) => { state.trips += 1; const started = Date.now(); try { return await originalQuery(...args); } finally { state.ms += Date.now() - started; } };
if (originalBatch) pool.batch = async (...args: unknown[]) => { state.trips += 1; const started = Date.now(); try { return await originalBatch(...args); } finally { state.ms += Date.now() - started; } };

await ensureSchema();

async function measure(label: string, run: () => Promise<unknown>, repeats = 3) {
  // One warm-up call so first-call memoization is not counted as steady state.
  await run();
  state.trips = 0; state.ms = 0;
  const started = Date.now();
  let result: unknown;
  for (let i = 0; i < repeats; i += 1) result = await run();
  const wall = Date.now() - started;
  const rows = Array.isArray(result) ? result.length : (result as { results?: unknown[] })?.results?.length ?? 1;
  const perCall = (value: number) => Math.round((value / repeats) * 10) / 10;
  console.log(
    `${label.padEnd(34)} trips/call=${String(perCall(state.trips)).padStart(6)}  ` +
    `db_ms/call=${String(perCall(state.ms)).padStart(6)}  wall_ms/call=${String(perCall(wall)).padStart(6)}  rows=${rows}`,
  );
}

const viewer = 'u1';
const postId = (await server.feed(viewer, 1))[0]?.id ?? 'p0';

await measure('feed(12)', () => server.feed(viewer, 12));
await measure('feed(24)', () => server.feed(viewer, 24));
await measure('feed(40)', () => server.feed(viewer, 40));
await measure('people(300)', () => server.people(viewer));
await measure('notifications(100)', () => server.notifications(viewer));
await measure('postCounters(1)', () => server.postCounters(viewer, postId));
await measure('availablePost(1)', () => server.availablePost(viewer, postId));
await measure('savedCollections', () => server.savedCollections(viewer));
await measure('bootstrap DB work', async () => {
  const [users, posts, notifs, unread] = await Promise.all([
    server.people(viewer),
    server.feed(viewer, 40),
    server.notifications(viewer),
    (await getPool()).query('SELECT COUNT(*) count FROM messages WHERE recipient_id=? AND sender_id!=? AND read_at IS NULL AND deleted_at IS NULL', [viewer, viewer]),
  ]);
  return { users, posts, notifs, unread };
}, 2);
