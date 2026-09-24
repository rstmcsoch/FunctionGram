'use client';
import {forwardRef,useEffect,useState,type ComponentPropsWithoutRef,type FormEvent} from 'react';
import {toast} from 'sonner';
import Link from 'next/link';
import {authClient} from '@/lib/auth-client';
import {devMode} from './common';

// Local preview only: signs the browser in as the local "Preview" account.
async function previewSession(){try{const response=await fetch('/api/dev-session',{method:'POST'});if(!response.ok)throw new Error();window.location.reload();}catch{toast.error('Could not start the preview account.');}}
export function PreviewAccountButton({label='Use the local preview account'}:{label?:string}){
  const [busy,setBusy]=useState(false);
  return <button type="button" className="text-button" disabled={busy} onClick={async()=>{setBusy(true);await previewSession();}}>{busy?'Setting up preview…':label}</button>;
}

export function VerificationForm({initialEmail='',recentlyRequested=false,onBack}:{initialEmail?:string;recentlyRequested?:boolean;onBack?:()=>void}){
 const [email,setEmail]=useState(initialEmail),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [cooldown,setCooldown]=useState(recentlyRequested),[requested,setRequested]=useState(recentlyRequested);
 useEffect(()=>{if(!cooldown)return;const timer=setTimeout(()=>setCooldown(false),60000);return()=>clearTimeout(timer);},[cooldown]);
 async function resend(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(busy||cooldown)return;setBusy(true);setError('');
  try{
   const result=await authClient.sendVerificationEmail({email:email.trim(),callbackURL:'/verify-email?verified=1'});
   if(result.error)throw new Error(result.error.status===429?'Please wait a minute before requesting another email.':result.error.message||'Unable to request a verification email.');
   setRequested(true);setCooldown(true);
  }catch(err){setError(err instanceof Error?err.message:'Unable to connect. Please try again.');}
  finally{setBusy(false);}
 }
 return <form onSubmit={resend} className="auth-form" aria-busy={busy}>
  <h2>Verify your email</h2>
  <p role="status">{requested?'Check your inbox and spam folder. If this address belongs to an unverified account, a link will arrive shortly.':'Enter your account email to request a new verification link.'}</p>
  <p>Links expire after 15 minutes. Once verified, sign in with your email and password.</p>
  <label>Email<input type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} required maxLength={254} value={email} disabled={busy} onChange={event=>setEmail(event.target.value)}/></label>
  {error&&<p role="alert">{error}</p>}
  <button type="submit" className="primary-button wide" disabled={busy||cooldown}>{busy?'Please wait…':cooldown?'You can resend in one minute':requested?'Resend verification email':'Send verification email'}</button>
  {onBack?<button type="button" className="text-button" onClick={onBack}>Back to sign in</button>:<Link className="text-button" href="/">Back to home and sign in</Link>}
 </form>;
}

export function AuthForm({initialMode='signin',initialNotice=''}:{initialMode?:'signin'|'signup';initialNotice?:string}){
 const [register,setRegister]=useState(initialMode==='signup');
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const [pendingEmail,setPendingEmail]=useState<string|null>(null);
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(busy)return;setError('');
  const form=new FormData(event.currentTarget);
  const email=String(form.get('email')||'').trim(),password=String(form.get('password')||''),name=String(form.get('name')||'').trim();
  if(register&&!name){setError('Please enter your name.');return;}
  if(register&&password!==form.get('confirmPassword')){setError('Your passwords do not match.');return;}
  setBusy(true);
  try{
   const result=register?await authClient.signUp.email({email,password,name,callbackURL:'/'}):await authClient.signIn.email({email,password,callbackURL:'/'});
   if(result.error){
    if(result.error.code==='EMAIL_NOT_VERIFIED'){setPendingEmail(email);return;}
    throw new Error(result.error.status===429?'Too many attempts. Please wait a minute and try again.':result.error.message||'Unable to sign in.');
   }
   if(register){setPendingEmail(email);return;}
   window.location.assign('/');
  }catch(err){setError(err instanceof Error?err.message:'Unable to connect. Please try again.');}
  finally{setBusy(false);}
 }
 if(pendingEmail!==null)return <VerificationForm initialEmail={pendingEmail} recentlyRequested={Boolean(pendingEmail)} onBack={()=>{setPendingEmail(null);setRegister(false);setError('');}}/>;
 return <form onSubmit={submit} className="auth-form" aria-busy={busy}>
 <h2>{register?'Create your account':'Sign in to RSTMC'}</h2>
 <p>Use your email and password.</p>
 {initialNotice&&<p role="status">{initialNotice}</p>}
 <fieldset disabled={busy}>
 {register&&<label>Name<input name="name" autoComplete="name" required minLength={1} maxLength={60}/></label>}
 <label>Email<input name="email" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} required maxLength={254}/></label>
 <label>Password<input name="password" type="password" autoComplete={register?'new-password':'current-password'} minLength={register?12:1} maxLength={128} required aria-describedby={register?'password-help':undefined}/></label>
 {register&&<><small id="password-help">Use at least 12 characters. We’ll email you a verification link. Keep your password safe; password recovery isn’t available yet.</small><label>Confirm password<input name="confirmPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} required/></label></>}
 </fieldset>
  {error&&<p role="alert">{error}</p>}
  <button type="submit" className="primary-button wide" disabled={busy}>{busy?'Please wait…':register?'Create account':'Sign in'}</button>
  {devMode&&<PreviewAccountButton/>}
  <button type="button" className="text-button" disabled={busy} onClick={()=>{setRegister(!register);setError('');}}>{register?'Already have an account? Sign in':'New here? Create an account'}</button>
 {!register&&<button type="button" className="text-button" disabled={busy} onClick={()=>setPendingEmail('')}>Resend verification email</button>}
 </form>;
}

// Forward menu props/ref so keyboard selection and focus work with Radix asChild.
export const SignOutButton=forwardRef<HTMLButtonElement,ComponentPropsWithoutRef<'button'>>(function SignOutButton({onClick,disabled,...props},ref){
 const [busy,setBusy]=useState(false);
 return <button {...props} ref={ref} type="button" disabled={disabled||busy} onClick={async event=>{
  onClick?.(event);if(event.defaultPrevented||busy)return;setBusy(true);
  try{
    if(devMode){const response=await fetch('/api/dev-session',{method:'DELETE'});if(!response.ok)throw new Error();window.location.assign('/');return;}
    const result=await authClient.signOut();if(result.error)throw new Error(result.error.message||'Unable to sign out.');window.location.assign('/');
  }
  catch(error){toast.error(error instanceof Error?error.message:'Unable to sign out. Please try again.');}
  finally{setBusy(false);}
 }}>{busy?'Signing out…':'Sign out'}</button>;
});
