function replacePostgresParameters(input: string): string {
  return input.replace(/\$(\d+)/g, '?');
}

export function postgresQuery(input: string) {
  const ignore = /^INSERT OR IGNORE INTO /i.test(input);

  let result = input;

  // FunctionGram historically used both ? and PostgreSQL $1-style placeholders.
  // Turso/libSQL accepts ? placeholders.
  result = replacePostgresParameters(result);

  // SQLite/libSQL uses INSERT ... ON CONFLICT instead of PostgreSQL's
  // INSERT OR IGNORE translation path.
  if (ignore) {
    result = result.replace(/^INSERT OR IGNORE INTO /i, 'INSERT INTO ');
    result = result.replace(/;\s*$/, '');
    result += ' ON CONFLICT DO NOTHING';
  }

  // PostgreSQL row-lock syntax has no SQLite equivalent.
  result = result.replace(/\s+FOR\s+UPDATE\b/gi, '');

  return result;
}
