'use client';
import {useLabels} from "./labels";

import { useState, type FormEvent } from 'react';
import { authClient } from '@/lib/auth-client';

export function ResetPasswordForm({ token }: { token: string }) {
  const t=useLabels();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError('');
    if (password.length < 12) { setError(t("reset_password_form.use_at_least_12_characters")); return; }
    if (password !== confirm) { setError(t("auth_form.your_passwords_do_not_match")); return; }
    setBusy(true);
    try {
      const result = await authClient.resetPassword({ token, newPassword: password });
      if (result.error) throw new Error(result.error.status === 429 ? t("auth_form.too_many_attempts_please_wait_a_minute_and_try_again") : result.error.message || t("reset_password_form.unable_to_update_the_password"));
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth_form.unable_to_connect_please_try_again"));
    } finally { setBusy(false); }
  }
  if (done) {
    return <div className="auth-form">
      <h2>{t("reset_password_form.password_updated")}</h2>
      <p role="status">{t("reset_password_form.your_password_has_been_changed_and_other_signed_in_devices_were_s")}</p>
      <button type="button" className="primary-button wide" onClick={() => window.location.assign('/')}>{t("reset_password_form.sign_in_with_the_new_password")}</button>
    </div>;
  }
  return <form onSubmit={submit} className="auth-form" aria-busy={busy}>
    <h2>{t("reset_password_form.choose_a_new_password")}</h2>
    <p>{t("reset_password_form.your_current_password_will_stop_working_everywhere_you_are_signed")}</p>
    <fieldset disabled={busy}>
      <label>{t("reset_password_form.new_password")}<input type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={password} onChange={event => setPassword(event.target.value)} /></label>
      <label>{t("reset_password_form.confirm_new_password")}<input type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={confirm} onChange={event => setConfirm(event.target.value)} /></label>
    </fieldset>
    {error && <p role="alert">{error}</p>}
    <button type="submit" className="primary-button wide" disabled={busy}>{busy ? t("reset_password_form.updating") : t("reset_password_form.update_password")}</button>
  </form>;
}
