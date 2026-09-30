'use client';
import {useState} from 'react';
import {authClient} from '@/lib/auth-client';
export function TwoFactorChallenge(){
 const [code,setCode]=useState(''),[backup,setBackup]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function submit(event:React.FormEvent){
  event.preventDefault();setBusy(true);setError('');
  try{
   const result=backup?await authClient.twoFactor.verifyBackupCode({code:code.trim()}):await authClient.twoFactor.verifyTotp({code:code.replace(/\s/g,'')});
   if(result.error)throw new Error(result.error.message||'The verification code was not accepted.');
   window.location.assign('/');
  }catch(cause){setError(cause instanceof Error?cause.message:'Verification failed.');}
  finally{setBusy(false);}
 }
 return <main className="admin-two-factor-page"><section className="admin-card admin-two-factor-card"><p className="admin-eyebrow">RSTMC / Sign in</p><h1>Two-factor verification</h1><p>Enter the code from your authenticator app. Use a recovery code only if you cannot access the app.</p><form className="admin-confirm" onSubmit={submit}><label>{backup?'Recovery code':'Authenticator code'}<input autoFocus autoComplete={backup?'off':'one-time-code'} inputMode={backup?'text':'numeric'} pattern={backup?undefined:'[0-9]{6}'} minLength={backup?1:6} maxLength={backup?64:6} required value={code} onChange={event=>setCode(event.target.value)}/></label>{error&&<p role="alert">{error}</p>}<button className="admin-button admin-primary" disabled={busy}>{busy?'Verifying…':'Verify and continue'}</button></form><button className="admin-button" type="button" disabled={busy} onClick={()=>{setBackup(!backup);setCode('');setError('');}}>{backup?'Use authenticator code instead':'Use a recovery code instead'}</button><p className="admin-muted">This challenge expires after five minutes. You must complete it before any administrator route can be opened.</p></section></main>;
}
