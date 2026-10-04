'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Desk = {
  config: { minAgeDays: number; minPosts: number };
  eligible: { id: string; username: string; email: string; posts: number }[];
  pending: { id: string; profile_id: string; batch: string; execute_at: number; reason?: string }[];
  counts: { blue: number; grey: number; golden: number; grey_pending: number; golden_pending: number };
  privilege: { actor_id: string; expires_at: number }[];
};

export function VerificationDesk({ role, data }: { role: string; data: Desk }) {
  const router = useRouter();
  const owner = role === 'owner';
  const [age, setAge] = useState(data.config.minAgeDays);
  const [posts, setPosts] = useState(data.config.minPosts);
  const [reason, setReason] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [stepCode, setStepCode] = useState('');
  const [query, setQuery] = useState('');
  const [batch, setBatch] = useState<'grey' | 'golden'>('grey');
  const [message, setMessage] = useState('');
  const [selected, setSelected] = useState<string[]>([]);

  async function post(body: Record<string, unknown>) {
    const response = await fetch('/api/admin/verification', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const result = await response.json() as { error?: string; message?: string };
    if (!response.ok) throw new Error(result.error || 'Request failed.');
    return result;
  }

  return <>
    <section className="admin-card"><h2>Overview</h2>
      <p>Blue {Number(data.counts?.blue || 0)} · Grey {Number(data.counts?.grey || 0)} · Golden {Number(data.counts?.golden || 0)} · Grey pending {Number(data.counts?.grey_pending || 0)} · Golden pending {Number(data.counts?.golden_pending || 0)}</p>
      <p>{data.privilege?.length ? `Privileged window open until ${new Date(Number(data.privilege[0].expires_at)).toISOString()}` : 'Grey/Golden privileged window is closed.'}</p>
    </section>
    <section className="admin-card"><h2>Blue criteria</h2>
      <p>Eligible accounts are not verified until an admin or owner finalizes Blue. This form is disabled for admins.</p>
      <label>Minimum account age (days)<input type="number" value={age} disabled={!owner} onChange={event => setAge(Number(event.target.value))} /></label>
      <label>Minimum posts<input type="number" value={posts} disabled={!owner} onChange={event => setPosts(Number(event.target.value))} /></label>
      <button className="admin-button" type="button" disabled={!owner} onClick={async () => { try { await post({ action: 'saveConfig', config: { minAgeDays: age, minPosts: posts }, reason: reason || 'Update Blue criteria' }); setMessage('Blue criteria saved.'); router.refresh(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Save failed.'); } }}>Save Blue rules</button>
    </section>
    <section className="admin-card"><h2>Eligible for Blue</h2>
      <ul>{data.eligible.map(user => <li key={user.id}><label><input type="checkbox" checked={selected.includes(user.id)} onChange={() => setSelected(current => current.includes(user.id) ? current.filter(id => id !== user.id) : [...current, user.id])} /> {user.username} · {user.email} · {user.posts} posts</label></li>)}{!data.eligible.length && <li>No eligible accounts.</li>}</ul>
      <button className="admin-button admin-primary" type="button" onClick={async () => { try { await post({ action: 'finalizeBlue', ids: selected, reason: reason || 'Finalize Blue' }); setMessage('Blue finalized for eligible accounts.'); router.refresh(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Blue failed.'); } }}>Finalize Blue</button>
    </section>
    <section className="admin-card"><h2>Grey and Golden</h2>
      <p>Search by username or email, then assign. The 2-hour window starts only after email code and step-up code both match. Assignments stay cancellable for 48 hours.</p>
      <button className="admin-button" type="button" onClick={async () => { try { const result = await post({ action: 'issuePrivilege' }); setMessage(result.message || 'Codes issued.'); } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not issue codes.'); } }}>Send privileged codes</button>
      <label>Email code<input value={emailCode} onChange={event => setEmailCode(event.target.value)} /></label>
      <label>Step-up code<input value={stepCode} onChange={event => setStepCode(event.target.value)} /></label>
      <button className="admin-button" type="button" onClick={async () => { try { await post({ action: 'confirmPrivilege', emailCode, stepCode }); setMessage('2-hour window open.'); router.refresh(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Verification failed.'); } }}>Confirm and open 2-hour window</button>
      <label>Username or email<input value={query} onChange={event => setQuery(event.target.value)} /></label>
      <label>Batch<select value={batch} onChange={event => setBatch(event.target.value as 'grey' | 'golden')}><option value="grey">Grey</option><option value="golden">Golden</option></select></label>
      <button className="admin-button admin-primary" type="button" onClick={async () => { try { await post({ action: 'assign', batch, ids: query.split(/[\s,]+/).filter(Boolean), reason: reason || 'Assign batch' }); setMessage('Submitted into the 48-hour review window.'); router.refresh(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Assign failed.'); } }}>Assign selected</button>
    </section>
    <section className="admin-card"><h2>48-hour review</h2>
      <ul>{data.pending.map(item => <li key={item.id}><label><input type="checkbox" checked={selected.includes(item.id)} onChange={() => setSelected(current => current.includes(item.id) ? current.filter(id => id !== item.id) : [...current, item.id])} /> {item.batch} · {item.profile_id} · until {new Date(Number(item.execute_at)).toISOString()}</label></li>)}{!data.pending.length && <li>No pending Grey or Golden assignments.</li>}</ul>
      <button className="admin-button" type="button" onClick={async () => { try { await post({ action: 'cancel', ids: selected, reason: reason || 'Stop assignment' }); setMessage('Selected assignments stopped.'); router.refresh(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Cancel failed.'); } }}>Stop selected</button>
      {message && <p role="status">{message}</p>}
      <label>Reason<textarea value={reason} onChange={event => setReason(event.target.value)} /></label>
    </section>
  </>;
}
