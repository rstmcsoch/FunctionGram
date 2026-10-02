import { seed } from './seed';
import { database } from './postgres';

/**
 * Demo seeding used to run inside `bootstrap()`, so with the seed switch
 * enabled every feed request paid two extra round trips (a control read and an
 * existence check) before doing any real work. It remains fully controllable
 * from the Admin Panel (`admin_demo_seed_control`) and still runs for a brand
 * new environment, but once per isolate: at startup via `instrumentation.ts`,
 * or on the first request in runtimes without instrumentation (tests, scripts).
 */
let seedPromise: Promise<void> | undefined;

/** True once the demo seed has been started (successfully or not). */
export function publishReady() {
  return seedPromise !== undefined;
}

export function ensureDemoSeed(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    seedPromise ??= (async () => {
      const store = database();
      // Keep the production database free of bundled demo identities/content.
      // These statements also create/disable the seed-control row so an older
      // isolate cannot recreate the profiles after this cleanup.
      await store.prepare(
        'INSERT INTO admin_demo_seed_control(id,enabled) VALUES(1,0) ON CONFLICT(id) DO UPDATE SET enabled=0'
      ).run();
      await store.prepare('DELETE FROM profiles WHERE is_demo=1').run();
    })().catch(error => {
      console.error('Production demo cleanup failed', error instanceof Error ? error.message : 'Unknown error');
    });
    return seedPromise;
  }
  seedPromise ??= seed().catch(error => {
    // Keep the started marker: a failed seed must not turn every later request
    // into another attempt. The Admin Panel switch and the next deployment
    // both provide a retry path.
    console.error('Demo seed failed', error instanceof Error ? error.message : 'Unknown error');
  });
  return seedPromise;
}
