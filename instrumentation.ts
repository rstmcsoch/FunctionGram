/**
 * Server startup. Two things happen here rather than on the first user
 * request:
 *
 *  1. `ensureSchema()` creates/updates the schema (idempotent, isolated per
 *     deployment) so page renders and API calls never carry migration work;
 *  2. the demo content check runs once per isolate instead of on every
 *     bootstrap.
 *
 * Failures are logged and never block the server: the runtime keeps its
 * lazy fallback (`ensureSchema()` on first query), so a database that is
 * temporarily unreachable at boot still recovers.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  try {
    const { initializeDatabase } = await import('./lib/postgres');
    await initializeDatabase();
    const { ensureDemoSeed, publishReady } = await import('./lib/publish');
    // Serve the first request as soon as the schema is ready; the demo seed
    // continues in the background and never delays a response.
    void ensureDemoSeed().finally(() => void publishReady());
  } catch (error) {
    console.error('FunctionGram database initialization failed', error instanceof Error ? error.message : 'Unknown error');
  }
}
