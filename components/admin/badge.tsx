import type { ReactNode } from 'react';

export type BadgeTone = 'neutral' | 'primary' | 'purple' | 'warning' | 'success' | 'danger';

/** Visual meaning only. It never changes the text it wraps. */
const TONES: Record<string, BadgeTone> = {
  user: 'neutral', post: 'neutral', 'in trash': 'neutral', comment: 'neutral', 'dismissed': 'neutral', 'in triage': 'warning',
  admin: 'primary', pinned: 'primary',
  owner: 'purple', reel: 'purple',
  moderator: 'warning', hidden: 'warning', story: 'warning', unverified: 'warning', triage: 'warning',
  active: 'success', unhidden: 'success', verified: 'success', resolved: 'warning', ready: 'success', released: 'success',
  banned: 'danger', trash: 'danger', 'new report': 'danger', new: 'danger', failed: 'danger', quarantined: 'warning', purging: 'danger',
};

export function toneFor(text: string): BadgeTone {
  return TONES[text.trim().toLowerCase()] || 'neutral';
}

export function Badge({ children, tone, dot }: { children: ReactNode; tone?: BadgeTone; dot?: boolean }) {
  const resolved = tone || (typeof children === 'string' ? toneFor(children) : 'neutral');
  return <span className={`admin-badge admin-badge-${resolved}${dot ?? ['active', 'unhidden', 'verified', 'banned', 'trash', 'new', 'failed'].includes(String(children).toLowerCase()) ? ' admin-badge-dot' : ''}`}>{children}</span>;
}
