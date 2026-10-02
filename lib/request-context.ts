import { AsyncLocalStorage } from 'node:async_hooks';
import { cache } from 'react';

/**
 * Request-scoped memoization.
 *
 * A single page render or API request resolves the same things repeatedly:
 * the Better Auth session, the app user, the feature policy, the cached
 * settings snapshot. Doing that work once and reusing the resolved value
 * inside the same request removes several database round trips per request
 * without caching anything across requests (which would leak one user's
 * authorization state into another's).
 *
 * Two mechanisms, because the two server entry points differ:
 *
 *  - Route handlers run inside an AsyncLocalStorage scope that the handler
 *    opens with `runWithRequestContext`.
 *  - Server components render inside React's own per-request cache, so a
 *    zero-argument `cache()` call is a stable, request-scoped container.
 *
 * `requestMemo` uses whichever store exists. When neither is available (for
 * example a unit test calling a helper directly) it computes the value and
 * does not memoize — memoization is an optimization, never a correctness
 * requirement.
 */
type RequestStore = Map<string, unknown>;

// Stored on globalThis: Next.js can instantiate a server module more than once
// (route handler bundle vs. shared chunk), and two AsyncLocalStorage instances
// would mean two different request stores — the memoization would silently do
// nothing. One shared instance per process fixes that.
const globalScope = globalThis as typeof globalThis & { __functiongramRequestStorage__?: AsyncLocalStorage<RequestStore> };
const requestStorage = globalScope.__functiongramRequestStorage__ ??= new AsyncLocalStorage<RequestStore>();

// React's cache is per request in the server renderer. Calling it with no
// arguments gives one stable Map for the whole render tree.
const reactStore = cache((): RequestStore => new Map());

function store(): RequestStore | undefined {
  const scoped = requestStorage.getStore();
  if (scoped) return scoped;
  try {
    return reactStore();
  } catch {
    // Outside a render (or in a runtime without React's cache): no memo scope.
    return undefined;
  }
}

/**
 * Opens a request scope. Route handlers call this with their whole body so
 * every helper they call shares one memo table.
 */
export function runWithRequestContext<T>(run: () => T): T {
  if (requestStorage.getStore()) return run();
  return requestStorage.run(new Map(), run);
}

/** Memoizes a promise or value for the lifetime of the current request. */
export function requestMemo<T>(key: string, factory: () => T): T {
  const current = store();
  if (!current) return factory();
  if (current.has(key)) return current.get(key) as T;
  const value = factory();
  current.set(key, value);
  // A rejected promise must not be memoized: the caller may legitimately retry
  // (for example after a transient database error) within the same request.
  if (value instanceof Promise) {
    value.catch(() => { if (current.get(key) === value) current.delete(key); });
  }
  return value;
}

/** Drops a memoized value (used when a write invalidates a cached read). */
export function forgetRequestMemo(key: string) {
  store()?.delete(key);
}

/** Observability helper: how many values this request memoized. */
export function requestMemoSize() {
  return store()?.size ?? 0;
}
