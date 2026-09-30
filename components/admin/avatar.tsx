/** Admin avatar (redesign guide §8.10).
 *
 * Visual only. No image is ever fetched: the panel has no avatar data, so the
 * tile shows initials over a deterministic tint derived from an id/email that
 * the page already renders. Nothing here reads or changes application state.
 */

const TINTS = ['blue', 'green', 'purple', 'amber', 'red', 'cyan'] as const;
export type AvatarTint = typeof TINTS[number];

/** Stable, non-cryptographic hash so one account always keeps one colour. */
function hash(seed: string) {
  let value = 0;
  for (let index = 0; index < seed.length; index += 1) value = (value * 31 + seed.charCodeAt(index)) >>> 0;
  return value;
}

export function tintFor(seed: string): AvatarTint {
  return TINTS[hash(seed || '') % TINTS.length];
}

/** First letters of the first two words of the name; falls back to the handle
 *  or email local part, exactly as the guide specifies. */
export function initialsFor(...candidates: (string | null | undefined)[]) {
  for (const candidate of candidates) {
    const value = (candidate || '').trim();
    if (!value) continue;
    const words = value.replace(/^@/, '').split(/[\s._-]+/).filter(Boolean);
    const letters = words.slice(0, 2).map(word => word[0]).join('');
    const initials = letters.replace(/[^\p{L}\p{N}]/gu, '');
    if (initials) return initials.toUpperCase();
  }
  return '—';
}

export function Avatar({ seed, name, handle, email, size = 36 }: {
  seed: string;
  name?: string | null;
  handle?: string | null;
  email?: string | null;
  size?: 28 | 36 | 40 | 64;
}) {
  return <span className="admin-avatar" data-size={size} data-tint={tintFor(seed || email || handle || name || '')} aria-hidden="true">{initialsFor(name, handle, email, seed)}</span>;
}
