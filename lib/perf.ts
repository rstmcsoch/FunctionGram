import { forgetRequestMemo, requestMemo } from './request-context';

/**
 * Lightweight, opt-in performance instrumentation.
 *
 * Disabled by default: with `FUNCTIONGRAM_PERF_LOG` unset every counter is a
 * cheap no-op and nothing is written to the logs. When enabled (set it to `1`
 * in a preview deployment) each request logs a single line with the database
 * round trips it performed, so a regression that adds a query becomes visible
 * in the deployment logs instead of being discovered by feel.
 *
 * This measures *round trips*, not wall-clock time: on the deployed runtime
 * every round trip is an HTTP request to Turso, so the trip count is the part
 * of latency the application controls. It is request-scoped (never a module
 * global) so concurrent requests cannot mix their counts.
 */
const enabled = process.env.FUNCTIONGRAM_PERF_LOG === '1';

export type RequestPerf = { trips: number; started: number; labels: string[] };

const PERF_KEY = 'perf:stats';

function perf(): RequestPerf | undefined {
  if (!enabled) return undefined;
  return requestMemo(PERF_KEY, () => ({ trips: 0, started: Date.now(), labels: [] as string[] }));
}

/** Records one database round trip for the current request. */
export function countDbTrip(label?: string) {
  const current = perf();
  if (!current) return;
  current.trips += 1;
  if (label && current.labels.length < 12) current.labels.push(label);
}

/** Logs the request's round-trip total once, then clears the counter. */
export function flushPerf(label: string, extra?: Record<string, unknown>) {
  if (!enabled) return;
  const current = perf();
  if (!current) return;
  const parts = [`[perf] ${label} db_trips=${current.trips} ms=${Date.now() - current.started}`];
  for (const [key, value] of Object.entries(extra ?? {})) parts.push(`${key}=${String(value)}`);
  if (current.labels.length) parts.push(`db=${current.labels.join(',')}`);
  console.log(parts.join(' '));
  forgetRequestMemo(PERF_KEY);
}
