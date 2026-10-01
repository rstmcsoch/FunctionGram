'use client';
import { ADMIN_BASE_PATH } from '@/lib/admin/config';
import {useState} from 'react';
import {authClient} from '@/lib/auth-client';

export function AdminTwoFactorSetup({email}:{email:string}){
 const [password,setPassword]=useState(''),[code,setCode]=useState(''),[totpUri,setTotpUri]=useState(''),[backupCodes,setBackupCodes]=useState<string[]>([]),[verified,setVerified]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const secret=(()=>{try{return new URL(totpUri).searchParams.get('secret')||'';}catch{return '';}})();
 async function begin(event:React.FormEvent){
  event.preventDefault();setBusy(true);setError('');
  try{
   const result=await authClient.twoFactor.enable({password,method:'totp',issuer:'RSTMC admin'});
   if(result.error)throw new Error(result.error.message||'Could not start authenticator setup.');
   const data=result.data as {totpURI?:string;backupCodes?:string[]}|undefined;
   if(!data?.totpURI||!Array.isArray(data.backupCodes))throw new Error('The authenticator setup response was incomplete.');
   setTotpUri(data.totpURI);setBackupCodes(data.backupCodes);setPassword('');
  }catch(cause){setError(cause instanceof Error?cause.message:'Setup failed.');}
  finally{setBusy(false);}
 }
 async function verify(event:React.FormEvent){
  event.preventDefault();setBusy(true);setError('');
  try{
   const result=await authClient.twoFactor.verifyTotp({code:code.replace(/\s/g,'')});
   if(result.error)throw new Error(result.error.message||'That authenticator code was not accepted.');
   setVerified(true);setCode('');
  }catch(cause){setError(cause instanceof Error?cause.message:'Code verification failed.');}
  finally{setBusy(false);}
 }
 return <main className="admin-two-factor-page"><section className="admin-card admin-two-factor-card"><p className="admin-eyebrow">RSTMC / Account security</p><h1>Secure your administrator account</h1><p>Signed in as <strong>{email}</strong>. The admin panel stays locked until you verify an authenticator app. Save backup codes somewhere private; they are shown only during this setup.</p>
  {!totpUri&&!verified&&<form className="admin-confirm" onSubmit={begin}><label>Current password<input type="password" autoComplete="current-password" required value={password} onChange={event=>setPassword(event.target.value)}/></label><button className="admin-button admin-primary" disabled={busy}>{busy?'Checking…':'Set up authenticator'}</button></form>}
  {totpUri&&!verified&&<><h2>Add your authenticator</h2><ol><li>In an authenticator app, add a new account and choose manual setup / enter a setup key.</li><li>Use issuer <strong>RSTMC admin</strong> and account <strong>{email}</strong>.</li><li>Enter the secret below, then type the current six-digit code from the app.</li></ol><label>Authenticator setup key<code className="admin-totp-secret">{secret||'Secret unavailable'}</code></label><form className="admin-confirm" onSubmit={verify}><label>Six-digit authenticator code<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required value={code} onChange={event=>setCode(event.target.value.replace(/\D/g,'').slice(0,6))}/></label><button className="admin-button admin-primary" disabled={busy||code.length!==6}>{busy?'Verifying…':'Verify and enable 2FA'}</button></form></>}
  {verified&&<><h2>Save your recovery codes</h2><p>Each code works once. Keep them offline and do not share them.</p><ul className="admin-backup-codes">{backupCodes.map(value=><li key={value}><code>{value}</code></li>)}</ul><button type="button" className="admin-button admin-primary" onClick={()=>window.location.assign(ADMIN_BASE_PATH)}>I saved these codes — open admin</button></>}
  {error&&<p role="alert">{error}</p>}
  <p className="admin-muted">If you did not request administrator access, sign out and contact an owner. Administrators cannot switch off 2FA from this screen.</p>
 </section></main>;
}
