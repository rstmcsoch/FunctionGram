function replacePostgresParameters(input: string): string {
  // Keep the parameter number: $2 -> ?2. SQLite binds ?N by position in the
  // args array, so reused or out-of-order $N values stay correct.
  return input.replace(/\$(\d+)/g, '?$1');
}

export function postgresQuery(input: string) {
  let result = input;

  result = replacePostgresParameters(result);

  // PostgreSQL transaction/advisory-lock syntax has no SQLite equivalent.
  // Turso transactions already provide the required atomic write boundary.
  result = result.replace(/\bSELECT\s+pg_advisory_xact_lock\s*\([^)]*\)\s*;?/gi, 'SELECT 1');
  result = result.replace(/\s+FOR\s+(UPDATE|SHARE)\b/gi, '');

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
