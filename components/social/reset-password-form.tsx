'use client';
import { useState, type FormEvent } from 'react';
import { authClient } from '@/lib/auth-client';

export function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError('');
    if (password.length < 12) { setError('Use at least 12 characters.'); return; }
    if (password !== confirm) { setError('Your passwords do not match.'); return; }
    setBusy(true);
    try {
      const result = await authClient.resetPassword({ token, newPassword: password });
      if (result.error) throw new Error(result.error.status === 429 ? 'Too many attempts. Please wait a minute and try again.' : result.error.message || 'Unable to update the password.');
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to connect. Please try again.');
    } finally { setBusy(false); }
  }
  if (done) {
    return <div className="auth-form">
      <h2>Password updated</h2>
      <p role="status">Your password has been changed and other signed-in devices were signed out.</p>
      <button type="button" className="primary-button wide" onClick={() => window.location.assign('/')}>Sign in with the new password</button>
    </div>;
  }
  return <form onSubmit={submit} className="auth-form" aria-busy={busy}>
    <h2>Choose a new password</h2>
    <p>Your current password will stop working everywhere you are signed in.</p>
    <fieldset disabled={busy}>
      <label>New password<input type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={password} onChange={event => setPassword(event.target.value)} /></label>
      <label>Confirm new password<input type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={confirm} onChange={event => setConfirm(event.target.value)} /></label>
    </fieldset>
    {error && <p role="alert">{error}</p>}
    <button type="submit" className="primary-button wide" disabled={busy}>{busy ? 'Updating…' : 'Update password'}</button>
  </form>;
}
