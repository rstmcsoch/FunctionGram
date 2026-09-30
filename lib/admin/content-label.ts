export function contentConfirmationName(item: Record<string, unknown>) {
  const value = String(item.caption || item.body || 'Untitled').trim();
  return value.slice(0, 80) || String(item.id || 'Untitled');
}
