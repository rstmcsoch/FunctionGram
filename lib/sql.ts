// Translate only SQL authored by the application; values remain bound parameters.
export function postgresQuery(input: string) {
  const ignore = /^INSERT OR IGNORE INTO /i.test(input);
  const sql = input.replace(/^INSERT OR IGNORE INTO /i, 'INSERT INTO ');
  let result = '', quoted = false, index = 0;
  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];
    if (char === "'") {
      result += char;
      if (quoted && sql[i+1] === "'") { result += sql[++i]; continue; }
      quoted = !quoted;
    } else result += char === '?' && !quoted ? '$' + (++index) : char;
  }
  if (ignore) result = result.replace(/;\s*$/, '') + ' ON CONFLICT DO NOTHING';
  return result;
}
