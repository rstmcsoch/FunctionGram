/** Admin badges and chips (redesign guide §8.5).
 *
 * Visual only. `toneFor` maps an ALREADY RENDERED string to a colour tone; it
 * never rewrites, translates or shortens the text it is given, and an unknown
 * value falls back to the neutral tone.
 */

import type { ReactNode } from 'react';

export const TONES = ['neutral', 'primary', 'purple', 'warning', 'success', 'danger'] as const;
export type Tone = typeof TONES[number];

/** Tones that read as a live state carry a dot in front of the text (§8.5). */
const DOTTED: Tone[] = ['success', 'danger'];

const EXACT: Record<string, Tone> = {
  // Roles
  user: 'neutral', admin: 'primary', owner: 'purple', moderator: 'warning',
  // Content kinds
  post: 'neutral', comment: 'neutral', reel: 'purple', story: 'warning',
  // Content and account state
  'in trash': 'neutral', trash: 'danger', pinned: 'primary', hidden: 'warning',
  unhidden: 'success', active: 'success', banned: 'danger',
  verified: 'success', unverified: 'warning',
  // Report queue state
  new: 'danger', 'in triage': 'warning', triage: 'warning',
  resolved: 'success', actioned: 'success', dismissed: 'neutral',
  // Generic outcomes
  failed: 'danger', error: 'danger', pending: 'warning', applied: 'success',
  ready: 'success', quarantined: 'warning', purging: 'danger',
};

/** Returns a tone name for a visible label. Text is never modified. */
export function toneFor(text: unknown): Tone {
  const value = String(text ?? '').trim().toLowerCase();
  if (!value) return 'neutral';
  if (EXACT[value]) return EXACT[value];
  if (value.includes('trash')) return value.includes('in trash') ? 'neutral' : 'danger';
  if (value.startsWith('unverified') || value.includes('triage')) return 'warning';
  if (value.startsWith('unhidden')) return 'success';
  if (value.startsWith('hidden')) return 'warning';
  if (value.startsWith('verified')) return 'success';
  if (value.includes('fail') || value.includes('denied') || value.includes('ban')) return 'danger';
  return 'neutral';
}

export function Badge({ tone, dot, children, className }: {
  tone?: Tone;
  dot?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const resolved: Tone = tone ?? 'neutral';
  const showDot = dot ?? DOTTED.includes(resolved);
  return <span className={'admin-badge' + (className ? ' ' + className : '')} data-tone={resolved}>{showDot && <i className="admin-badge-dot" aria-hidden="true" />}{children}</span>;
}

/** Badge whose tone is derived from the text it already shows. */
export function AutoBadge({ children, dot, className }: { children: string; dot?: boolean; className?: string }) {
  return <Badge tone={toneFor(children)} dot={dot} className={className}>{children}</Badge>;
}

/** Destructive operations get the danger button style (§8.1). The name comes
 *  from the operation the button already performs; word boundaries keep
 *  `unban` and `unhide` out of the danger set. No behaviour changes. */
const DANGER_OPERATION = /\b(delete|purge|ban|trash|revoke|hide)\b/i;

export function dangerTone(operation: string): 'danger' | undefined {
  return DANGER_OPERATION.test(operation) ? 'danger' : undefined;
}

/** Audit action tone (§9.6). Derived from the action name already shown. */
export function auditTone(action: string): Tone {
  const value = String(action || '').toLowerCase();
  if (/\.(delete|purge|ban|revoke|trash)\b/.test(value)) return 'danger';
  if (/\.(hide|quarantine|expire|demote)\b/.test(value)) return 'warning';
  if (/\.(edit|update|promote|create|grant)\b/.test(value)) return 'primary';
  return 'neutral';
}
