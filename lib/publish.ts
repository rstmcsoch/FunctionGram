import { seed } from './seed';

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
  seedPromise ??= seed().catch(error => {
    // Keep the started marker: a failed seed must not turn every later request
    // into another attempt. The Admin Panel switch and the next deployment
    // both provide a retry path.
    console.error('Demo seed failed', error instanceof Error ? error.message : 'Unknown error');
  });
  return seedPromise;
}
