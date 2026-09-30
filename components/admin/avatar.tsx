import type { CSSProperties } from 'react';

export type AvatarSize = 28 | 36 | 40 | 64;
const TINTS = ['blue', 'green', 'purple', 'amber', 'red', 'cyan'] as const;

function tintIndex(seed: string) {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) hash = (hash * 31 + seed.charCodeAt(index)) | 0;
  return Math.abs(hash) % TINTS.length;
}

/** First letters of the first two words; falls back to the first two characters. */
export function initialsFor(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((part) => [...part][0] ?? '').join('');
  if (letters) return letters.toUpperCase();
  const fallback = [...name.trim()].filter((character) => /[\p{L}\p{N}]/u.test(character)).slice(0, 2).join('');
  return (fallback || '?').toUpperCase();
}

/** Display-only avatar. Decorative: the real name and email stay next to it. */
export function Avatar({ name, seed, size = 36 }: { name?: string | null; seed?: string | null; size?: AvatarSize }) {
  const label = (name || seed || '').trim();
  const style = { '--adm-avatar-size': `${size}px` } as CSSProperties;
  return <span className={`admin-avatar admin-avatar-${TINTS[tintIndex(seed || label)]}`} style={style} aria-hidden="true">{initialsFor(label)}</span>;
}
