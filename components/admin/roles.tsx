'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AdminPermission } from '@/lib/admin/permissions';
import { PERMISSION_LABELS } from '@/lib/admin/permissions';

type Matrix = { admin: AdminPermission[]; moderator: AdminPermission[] };
type Staff = { id: string; name: string; email: string; emailHidden: boolean; role: string; twoFactorEnabled: boolean; sessions: { id: string; ipAddress?: string; userAgent?: string }[]; devices: { fingerprint_hash: string }[] };
type Pending = { id: string; target_type: string; target_id: string; reason: string; execute_at: number };

export function RoleControls({
  role, matrix, permissions, staff, pending,
}: {
  role: string;
  matrix: Matrix;
  permissions: AdminPermission[];
  staff: Staff[];
  pending: Pending[];
}) {
  const router = useRouter();
  const owner = role === 'owner';
  const canGrantAdmin = owner || permissions.includes('roles.grantAdmin');
  const canGrantMod = owner || permissions.includes('roles.grantModerator');
  const canEditMatrix = owner || permissions.includes('roles.manage');
  const [draft, setDraft] = useState(matrix);
  const [reason, setReason] = useState('');
  const [email, setEmail] = useState('');
  const [grantRole, setGrantRole] = useState(canGrantAdmin ? 'admin' : 'moderator');
  const [message, setMessage] = useState('');
  const [pendingMsg, setPendingMsg] = useState('');

  function toggle(target: 'admin' | 'moderator', permission: AdminPermission) {
    if (!canEditMatrix) return;
    setDraft(current => {
      const list = new Set(current[target]);
      if (list.has(permission)) list.delete(permission); else list.add(permission);
      return { ...current, [target]: [...list] };
    });
  }

  async function post(body: Record<string, unknown>) {
    const response = await fetch('/api/admin/security', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const result = await response.json() as { error?: string };
    if (!response.ok) throw new Error(result.error || 'Request failed.');
    return result;
  }

  return <>
    <section className="admin-card">
      <h2>Role permission matrix</h2>
      <p>{canEditMatrix ? 'Owner can change admin and moderator rules at any time. The owner column is fixed and always has every control. A reason is stored in the audit log.' : 'You can read this matrix. Controls you cannot change are disabled.'}</p>
      <div className="admin-table-scroll"><table><thead><tr><th>Permission</th><th>owner</th><th>admin</th><th>moderator</th></tr></thead>
        <tbody>{(Object.keys(PERMISSION_LABELS) as AdminPermission[]).map(permission => <tr key={permission}>
          <th>{PERMISSION_LABELS[permission]}</th>
          <td className="admin-matrix-cell" data-allowed="yes"><span className="admin-matrix-mark" aria-hidden="true">✓</span><span className="admin-visually-hidden">Allowed</span></td>
          {(['admin', 'moderator'] as const).map(target => {
            const allowed = draft[target].includes(permission);
            return <td key={target} className="admin-matrix-cell" data-allowed={allowed ? 'yes' : 'no'}>
              <label className="admin-matrix-toggle">
                <input type="checkbox" checked={allowed} disabled={!canEditMatrix} onChange={() => toggle(target, permission)} />
                <span className="admin-matrix-mark" aria-hidden="true">{allowed ? '✓' : '—'}</span>
                <span className="admin-visually-hidden">{allowed ? 'Allowed' : 'Not allowed'}</span>
              </label>
            </td>;
          })}
        </tr>)}</tbody></table></div>
      <div className="admin-save-row">
        <label>Reason for rule change<textarea value={reason} onChange={event => setReason(event.target.value)} maxLength={500} disabled={!canEditMatrix} required /></label>
        <button className="admin-button admin-primary" type="button" disabled={!canEditMatrix || !reason.trim()} onClick={async () => {
          setMessage('');
          try { await post({ action: 'saveMatrix', matrix: draft, reason }); setMessage('Role rules saved.'); router.refresh(); }
          catch (error) { setMessage(error instanceof Error ? error.message : 'Save failed.'); }
        }}>Save role rules</button>
        {message && <p role="status">{message}</p>}
      </div>
    </section>
    <section className="admin-card">
      <h2>Grant or revoke a role</h2>
      <p>Type the exact email. The account must already exist, have a verified email, and have finished the panel two-factor setup. An admin can only appoint moderators. Moderators cannot appoint anyone.</p>
      <form className="admin-detail" onSubmit={async event => {
        event.preventDefault(); setPendingMsg('');
        try { await post({ action: 'grantRole', email, role: grantRole, reason }); setPendingMsg('Role updated.'); setEmail(''); router.refresh(); }
        catch (error) { setPendingMsg(error instanceof Error ? error.message : 'Grant failed.'); }
      }}>
        <label>Account email<input value={email} onChange={event => setEmail(event.target.value)} type="email" required disabled={!canGrantAdmin && !canGrantMod} /></label>
        <label>Role<select value={grantRole} onChange={event => setGrantRole(event.target.value)} disabled={!canGrantAdmin && !canGrantMod}>
          <option value="admin" disabled={!canGrantAdmin}>Admin</option>
          <option value="moderator" disabled={!canGrantMod}>Moderator</option>
          <option value="user" disabled={!canGrantAdmin && !canGrantMod}>Revoke role</option>
        </select></label>
        <label>Reason<textarea value={reason} onChange={event => setReason(event.target.value)} required disabled={!canGrantAdmin && !canGrantMod} /></label>
        <button className="admin-button admin-primary" type="submit" disabled={!canGrantAdmin && !canGrantMod}>Verify email and grant</button>
        {pendingMsg && <p role="status">{pendingMsg}</p>}
      </form>
    </section>
    {role !== 'moderator' && <section className="admin-card"><h2>Administration directory</h2>
      <p>{role === 'admin' ? 'Owner email addresses are hidden. You can see the owner name and role tag.' : 'Owner sees name, email, device fingerprint, session and activity for every administrator below.'}</p>
      <div className="admin-table-scroll"><table><thead><tr><th>Name</th><th>Role</th><th>Email</th><th>2FA</th><th>Sessions</th></tr></thead><tbody>
        {staff.map(person => <tr key={person.id}><td>{person.name}</td><td>{person.role}</td><td>{person.emailHidden ? 'Hidden' : person.email}</td><td>{person.twoFactorEnabled ? 'On' : 'Off'}</td><td>{person.sessions.length}{person.devices.length ? ` · ${person.devices.length} devices` : ''}</td></tr>)}
        {!staff.length && <tr><td colSpan={5}>No visible administrators.</td></tr>}
      </tbody></table></div>
    </section>}
    {role !== 'moderator' && <section className="admin-card"><h2>Moderator deletion queue</h2>
      <p>Moderator deletions wait 48 hours unless an admin or owner approves them. A reason is required.</p>
      <div className="admin-table-scroll"><table><thead><tr><th>Item</th><th>Reason</th><th>Executes</th><th></th></tr></thead><tbody>
        {pending.map(item => <tr key={item.id}><td>{item.target_type} {item.target_id}</td><td>{item.reason}</td><td>{new Date(item.execute_at).toISOString()}</td><td>
          <button className="admin-button" type="button" onClick={async () => { await post({ action: 'decideDeletion', id: item.id, decision: 'approve' }); router.refresh(); }}>Approve now</button>
          <button className="admin-button" type="button" onClick={async () => { await post({ action: 'decideDeletion', id: item.id, decision: 'reject' }); router.refresh(); }}>Reject</button>
        </td></tr>)}
        {!pending.length && <tr><td colSpan={4}>No pending deletions.</td></tr>}
      </tbody></table></div>
    </section>}
  </>;
}
