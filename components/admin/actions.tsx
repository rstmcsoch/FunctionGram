'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import type { UserAction } from '@/lib/admin/users';
import type { UserFilters } from '@/lib/admin/queries';

const labels: Record<UserAction, string> = { ban: 'Ban account', unban: 'Unban account', promote: 'Promote to admin', promoteModerator: 'Promote to moderator', demote: 'Demote to user', signout: 'Force sign-out', verify: 'Mark email verified', delete: 'Move account to trash', restore: 'Restore account', resetPassword: 'Send password reset' };
export function UserActions({ id, email, actions }: { id: string; email: string; actions: UserAction[] }) {
  const router = useRouter();
  const trigger = useRef<HTMLButtonElement | null>(null);
  const [selected, setSelected] = useState<UserAction | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [reason, setReason] = useState('');
  const [expires, setExpires] = useState('');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setPending(true); setMessage('');
    try {
      const response = await fetch('/api/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: selected, id, confirmation, reason, expires: expires ? new Date(expires).toISOString() : null }) });
      const result = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(result.error || 'Unable to update this account.');
      setSelected(null); setMessage(result.message || 'Account updated. The action was recorded in the audit log.'); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Request failed.'); }
    finally { setPending(false); }
  }
  return <div className="admin-actions">
    <p className="admin-muted admin-alert">Every action is permission-checked and audited. Ban and trash revoke all sessions. Account trash disables login and hides the profile and its content. Restoring an account preserves separate content moderation decisions.</p>
    <div className="admin-action-grid">{actions.map(action => <button className="admin-button" data-tone={['ban', 'delete'].includes(action) ? 'danger' : undefined} key={action} onClick={event => { trigger.current = event.currentTarget; setSelected(action); setConfirmation(''); setReason(''); setExpires(''); setMessage(''); }}>{labels[action]}</button>)}</div>
    {!actions.length && <p className="admin-alert">This account is protected. No actions are available for your role.</p>}
    {!selected && message && <p role="status">{message}</p>}
    <ConfirmDialog onRestoreFocus={() => { trigger.current?.focus(); }} open={selected !== null} title={selected ? labels[selected] : 'Confirm action'} onClose={() => { if (!pending) setSelected(null); }}>
      <form onSubmit={submit} className="admin-confirm">
        <DialogDescription>This action affects {email}. Type the exact email to confirm.</DialogDescription>
        {selected === 'verify' && <p>Only verify after independently confirming ownership of this email.</p>}
        {['promote','promoteModerator','demote'].includes(String(selected))&&<p>Only an owner may grant or revoke roles. A role change requires an audit reason, exact account email, email verification and enabled two-factor authentication before admin access becomes available.</p>}
        <label>Confirmation email<input autoComplete="off" value={confirmation} onChange={e => setConfirmation(e.target.value)} maxLength={320} required /></label>
        <label>Reason {selected === 'ban' ? '(required)' : '(optional)'}<textarea value={reason} onChange={e => setReason(e.target.value)} maxLength={500} required={['ban','promote','promoteModerator','demote'].includes(String(selected))} /></label>
        {selected === 'ban' && <label>Ban until (your local time; blank means indefinite)<input type="datetime-local" value={expires} onChange={e => setExpires(e.target.value)} /></label>}
        {message && <p role="alert">{message}</p>}
        <DialogFooter><button className="admin-button" type="button" disabled={pending} onClick={() => setSelected(null)}>Cancel</button><button className="admin-button admin-primary" data-tone={selected && ['ban', 'delete'].includes(selected) ? 'danger' : undefined} type="submit" disabled={pending || confirmation !== email}>{pending ? 'Saving…' : 'Confirm action'}</button></DialogFooter>
      </form>
    </ConfirmDialog>
  </div>;
}
export function ConfirmDialog({ open, title, onClose, onRestoreFocus, children }: { open: boolean; title: string; onClose: () => void; onRestoreFocus: () => void; children: React.ReactNode }) {
  return <Dialog open={open} onOpenChange={value => { if (!value) onClose(); }}><DialogContent className="admin-confirm-dialog" onCloseAutoFocus={event => { event.preventDefault(); onRestoreFocus(); }}><DialogTitle>{title}</DialogTitle>{children}</DialogContent></Dialog>;
}
export function ExportUsers({ filters }: { filters: UserFilters }) {
  const [pending, setPending] = useState(false); const [error, setError] = useState('');
  return <div><button className="admin-button" disabled={pending} onClick={async () => {
    setPending(true); setError('');
    try {
      const response = await fetch('/api/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'exportUsers', ...filters }) });
      if (!response.ok) throw new Error((await response.json() as { error?: string }).error || 'Export failed.');
      const url = URL.createObjectURL(await response.blob()); const link = document.createElement('a'); link.href = url; link.download = 'users-page.csv'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { setError(error instanceof Error ? error.message : 'Export failed.'); }
    finally { setPending(false); }
  }}>{pending ? 'Exporting…' : 'Export this page (CSV)'}</button>{error && <p role="alert">{error}</p>}</div>;
}
