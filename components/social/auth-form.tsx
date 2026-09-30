'use client';
import {useLabels} from "./labels";
import {defaultTranslator,type Translator} from "@/lib/admin/labels";

import {Feature,useFeatures} from './features';
import {forwardRef,useEffect,useState,type ComponentPropsWithoutRef,type FormEvent} from 'react';
import {toast} from 'sonner';
import Link from 'next/link';
import {authClient} from '@/lib/auth-client';
import {devMode} from './common';

// Local preview only: signs the browser in as the local "Preview" account.
async function previewSession(t: Translator = defaultTranslator){try{const response=await fetch('/api/dev-session',{method:'POST'});if(!response.ok)throw new Error();window.location.reload();}catch{toast.error(t("auth_form.could_not_start_the_preview_account"));}}
export function PreviewAccountButton({label}:{label?:string}){
  const t=useLabels();
  const [busy,setBusy]=useState(false);
  return <button type="button" className="text-button" disabled={busy} onClick={async()=>{setBusy(true);await previewSession(t);}}>{busy?t("auth_form.setting_up_preview"):(label||t("auth.previewAccount"))}</button>;
}

export function VerificationForm({initialEmail='',recentlyRequested=false,onBack}:{initialEmail?:string;recentlyRequested?:boolean;onBack?:()=>void}){
  const t=useLabels();
 const [email,setEmail]=useState(initialEmail),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [cooldown,setCooldown]=useState(recentlyRequested),[requested,setRequested]=useState(recentlyRequested);
 useEffect(()=>{if(!cooldown)return;const timer=setTimeout(()=>setCooldown(false),60000);return()=>clearTimeout(timer);},[cooldown]);
 async function resend(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(busy||cooldown)return;setBusy(true);setError('');
  try{
   const result=await authClient.sendVerificationEmail({email:email.trim(),callbackURL:'/verify-email?verified=1'});
   if(result.error)throw new Error(result.error.status===429?t("auth_form.please_wait_a_minute_before_requesting_another_email"):result.error.message||t("auth_form.unable_to_request_a_verification_email"));
   setRequested(true);setCooldown(true);
  }catch(err){setError(err instanceof Error?err.message:t("auth_form.unable_to_connect_please_try_again"));}
  finally{setBusy(false);}
 }
 return <form onSubmit={resend} className="auth-form" aria-busy={busy}>
  <h2>{t("auth_form.verify_your_email")}</h2>
  <p role="status">{requested?t("auth_form.check_your_inbox_and_spam_folder_if_this_address_belongs_to_an_un"):t("auth_form.enter_your_account_email_to_request_a_new_verification_link")}</p>
  <p>{t("auth_form.links_expire_after_15_minutes_once_verified_sign_in_with_your_ema")}</p>
  <label>{t("auth_form.email")}<input type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} required maxLength={254} value={email} disabled={busy} onChange={event=>setEmail(event.target.value)}/></label>
  {error&&<p role="alert">{error}</p>}
  <button type="submit" className="primary-button wide" disabled={busy||cooldown}>{busy?t("auth_form.please_wait"):cooldown?t("auth_form.you_can_resend_in_one_minute"):requested?t("auth_form.resend_verification_email"):t("auth_form.send_verification_email")}</button>
  {onBack?<button type="button" className="text-button" onClick={onBack}>{t("auth_form.back_to_sign_in")}</button>:<Link className="text-button" href="/">{t("auth_form.back_to_home_and_sign_in")}</Link>}
 </form>;
}

export function ForgotPasswordForm({onDone,onBack}:{onDone:(message:string)=>void;onBack:()=>void}){
  const t=useLabels();
 const [email,setEmail]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[requested,setRequested]=useState(false);
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(busy)return;setError('');
  const address=email.trim();if(!address){setError(t("auth_form.please_enter_your_account_email"));return;}
  setBusy(true);
  try{
   const result=await authClient.requestPasswordReset({email:address,redirectTo:'/reset-password'});
   if(result.error)throw new Error(result.error.status===429?t("auth_form.please_wait_a_minute_before_requesting_another_email"):result.error.message||t("auth_form.unable_to_request_a_reset_email"));
   setRequested(true);
  }catch(err){setError(err instanceof Error?err.message:t("auth_form.unable_to_connect_please_try_again"));}
  finally{setBusy(false);}
 }
 return <form onSubmit={submit} className="auth-form" aria-busy={busy}>
  <h2>{t("auth_form.reset_your_password")}</h2>
  <p role="status">{requested?t("auth_form.if_that_address_has_an_account_a_reset_link_is_on_its_way_it_expi"):t("auth_form.enter_the_email_you_signed_up_with_and_we_ll_send_a_reset_link")}</p>
  <label>{t("auth_form.email")}<input type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} required maxLength={254} value={email} disabled={busy||requested} onChange={event=>setEmail(event.target.value)}/></label>
  {error&&<p role="alert">{error}</p>}
  <button type="submit" className="primary-button wide" disabled={busy||requested}>{busy?t("auth_form.please_wait"):t("auth_form.send_reset_email")}</button>
  {requested&&<button type="button" className="text-button" onClick={()=>onDone(t("auth_form.reset_link_sent_check_your_inbox_and_spam_it_expires_in_15_minute"))}>{t("auth_form.done")}</button>}
  <button type="button" className="text-button" onClick={onBack}>{t("auth_form.back_to_sign_in")}</button>
 </form>;
}

export function AuthForm({initialMode='signin',initialNotice=''}:{initialMode?:'signin'|'signup';initialNotice?:string}){
  const t=useLabels();
 const flags=useFeatures();
 const [wantsRegister,setRegister]=useState(initialMode==='signup');const register=wantsRegister&&flags.signups;
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const [pendingEmail,setPendingEmail]=useState<string|null>(null);
 const [forgot,setForgot]=useState(false);
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(busy)return;setError('');
  const form=new FormData(event.currentTarget);
  const email=String(form.get('email')||'').trim(),password=String(form.get('password')||''),name=String(form.get('name')||'').trim();
  if(register&&!name){setError(t("auth_form.please_enter_your_name"));return;}
  if(register&&password!==form.get('confirmPassword')){setError(t("auth_form.your_passwords_do_not_match"));return;}
  setBusy(true);
  try{
   const result=register?await authClient.signUp.email({email,password,name,callbackURL:'/'}):await authClient.signIn.email({email,password,callbackURL:'/'});
   if(result.error){
    if(result.error.code==='EMAIL_NOT_VERIFIED'){setPendingEmail(email);return;}
    throw new Error(result.error.status===429?t("auth_form.too_many_attempts_please_wait_a_minute_and_try_again"):result.error.message||t("auth_form.unable_to_sign_in"));
   }
   if(register){setPendingEmail(email);return;}
   if((result.data as {twoFactorRedirect?:boolean}|undefined)?.twoFactorRedirect)return;
   let setupRequired=false;
   try{const status=await fetch('/api/admin/security-status',{cache:'no-store'});if(status.ok)setupRequired=(await status.json() as {twoFactorSetupRequired?:boolean}).twoFactorSetupRequired===true;}catch{}
   window.location.assign(setupRequired?'/admin-two-factor/setup':'/');
  }catch(err){setError(err instanceof Error?err.message:t("auth_form.unable_to_connect_please_try_again"));}
  finally{setBusy(false);}
 }
 if(forgot)return <ForgotPasswordForm onDone={message=>{setForgot(false);setRegister(false);setError('');toast(message);}} onBack={()=>{setForgot(false);setError('');}}/>;
 if(pendingEmail!==null)return <VerificationForm initialEmail={pendingEmail} recentlyRequested={Boolean(pendingEmail)} onBack={()=>{setPendingEmail(null);setRegister(false);setError('');}}/>;
 return <form onSubmit={submit} className="auth-form" aria-busy={busy}>
 <h2>{register?t("auth_form.create_your_account"):t("auth_form.sign_in_to_rstmc")}</h2>
 <p>{t("auth_form.use_your_email_and_password")}</p>
 {initialNotice&&<p role="status">{initialNotice}</p>}
 <fieldset disabled={busy}>
 {register&&<label>{t("auth_form.name")}<input name="name" autoComplete="name" required minLength={1} maxLength={60}/></label>}
 <label>{t("auth_form.email")}<input name="email" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} required maxLength={254}/></label>
 <label>{t("auth_form.password")}<input name="password" type="password" autoComplete={register?'new-password':'current-password'} minLength={register?12:1} maxLength={128} required aria-describedby={register?'password-help':undefined}/></label>
 {register&&<><small id="password-help">{t("auth_form.use_at_least_12_characters_we_ll_email_you_a_verification_link_fo")}</small><label>{t("auth_form.confirm_password")}<input name="confirmPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} required/></label></>}
 </fieldset>
  {error&&<p role="alert">{error}</p>}
  <button type="submit" className="primary-button wide" disabled={busy}>{busy?t("auth_form.please_wait"):register?t("auth_form.create_account"):t("auth.signIn")}</button>
  {devMode&&<PreviewAccountButton/>}
  <Feature name="signups"><button type="button" className="text-button" disabled={busy} onClick={()=>{setRegister(!register);setError('');}}>{register?t("auth_form.already_have_an_account_sign_in"):t("auth_form.new_here_create_an_account")}</button></Feature>
 {!register&&<div className="auth-links">
  <button type="button" className="text-button" disabled={busy} onClick={()=>setForgot(true)}>{t("auth_form.forgot_your_password")}</button>
  <button type="button" className="text-button" disabled={busy} onClick={()=>setPendingEmail('')}>{t("auth_form.resend_verification_email")}</button>
 </div>}
 </form>;
}

// Forward menu props/ref so keyboard selection and focus work with Radix asChild.
export const SignOutButton=forwardRef<HTMLButtonElement,ComponentPropsWithoutRef<'button'>>(function SignOutButton({onClick,disabled,...props},ref){
  const t=useLabels();
 const [busy,setBusy]=useState(false);
 return <button {...props} ref={ref} type="button" disabled={disabled||busy} onClick={async event=>{
  onClick?.(event);if(event.defaultPrevented||busy)return;setBusy(true);
  try{
    if(devMode){const response=await fetch('/api/dev-session',{method:'DELETE'});if(!response.ok)throw new Error();window.location.assign('/');return;}
    const result=await authClient.signOut();if(result.error)throw new Error(result.error.message||t("auth_form.unable_to_sign_out"));window.location.assign('/');
  }
  catch(error){toast.error(error instanceof Error?error.message:t("auth_form.unable_to_sign_out_please_try_again"));}
  finally{setBusy(false);}
 }}>{busy?t("auth_form.signing_out"):t("auth_form.sign_out")}</button>;
});
