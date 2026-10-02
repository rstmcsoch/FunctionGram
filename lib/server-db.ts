import { database } from './postgres';

/**
 * The single statement factory the server-side query layer uses.
 *
 * It lives in its own module so query helpers (`lib/messaging.ts`,
 * `lib/server.ts`) can share one implementation without importing each other:
 * a helper that both prepares statements and is consumed by `lib/server.ts`
 * would otherwise create an import cycle at module-initialization time.
 */
export function db() {
  return database();
}
