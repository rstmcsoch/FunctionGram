/**
 * Timestamp storage differs per runtime. The deployed libSQL/Turso database
 * stores Better Auth dates as Unix milliseconds (Kysely's libSQL dialect turns
 * a `Date` into its epoch milliseconds), while the local PostgreSQL/PGlite
 * fallback keeps `timestamptz` columns. SQL that compares these timestamps must
 * therefore be written per dialect; `now()` alone is not enough.
 *
 * Executors that do not declare a dialect are treated as the deployed
 * libSQL/Turso runtime; only the local PGlite fallback and PostgreSQL test
 * doubles declare `storageDialect: 'postgres'`.
 */
export type SqlDialect = 'sqlite' | 'postgres';

export function dialectOf(executor: { storageDialect?: SqlDialect }): SqlDialect {
  return executor.storageDialect === 'postgres' ? 'postgres' : 'sqlite';
}

function replacePostgresParameters(input: string): string {
  // Keep the parameter number: $2 -> ?2. SQLite binds ?N by position in the
  // args array, so reused or out-of-order $N values stay correct.
  return input.replace(/\$(\d+)/g, '?$1');
}

/**
 * PostgreSQL's `= ANY($1::text[])` has no SQLite/libSQL equivalent: libSQL has
 * no `ANY` aggregate and the translated `ANY(?1[])` is a parse error — this is
 * exactly how the message-send path failed in production. Both dialects accept
 * a plain `IN` list, so callers expand the array into positional placeholders
 * instead of passing it as a single argument.
 */
export function inPlaceholders(count: number, start = 1): string {
  return Array.from({ length: Math.max(0, count) }, (_, index) => `$${start + index}`).join(',');
}

export function postgresQuery(input: string) {
  let result = input;

  result = replacePostgresParameters(result);

  // PostgreSQL transaction/advisory-lock syntax has no SQLite equivalent.
  // Turso transactions already provide the required atomic write boundary.
  result = result.replace(/\bSELECT\s+pg_advisory_xact_lock\s*\([^)]*\)\s*;?/gi, 'SELECT 1');
  // `FOR UPDATE OF a,b` is PostgreSQL row-locking syntax. SQLite has no row
  // locks, so the whole clause — including the optional table list — is
  // dropped; leaving `OF a,b` behind is a parse error.
  result = result.replace(/\s+FOR\s+(?:UPDATE|SHARE)\b(?:\s+OF\s+[A-Za-z_][\w$]*(?:\s*,\s*[A-Za-z_][\w$]*)*)?/gi, '');

  // PostgreSQL time helpers -> SQLite/libSQL equivalents.
  result = result.replace(/extract\s*\(\s*epoch\s+FROM\s+now\(\)\s*\)/gi, 'unixepoch()');
  result = result.replace(/\bnow\(\)/gi, '(unixepoch()*1000)');

  // SQLite has dynamic typing; these PostgreSQL casts are unnecessary.
  // Handle jsonb text extraction before removing the cast itself.
  result = result.replace(/([A-Za-z_][\w.]*)\s*::jsonb\s*#>>\s*'\{\}'/gi, '$1');
  result = result.replace(/::(?:bigint|integer|int|smallint|numeric|real|double\s+precision|text|jsonb|json)\b/gi, '');

  // SQLite LIKE is case-insensitive for ordinary ASCII text.
  result = result.replace(/\bILIKE\b/gi, 'LIKE');

  return result;
}
