'use client';
import {forwardRef,useState,type ComponentPropsWithoutRef,type FormEvent} from 'react';
import {toast} from 'sonner';
import {authClient} from '@/lib/auth-client';

export function AuthForm({initialMode='signin'}:{initialMode?:'signin'|'signup'}){
 const [register,setRegister]=useState(initialMode==='signup');
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(busy)return;setError('');
  const form=new FormData(event.currentTarget);
  const email=String(form.get('email')||'').trim(),password=String(form.get('password')||''),name=String(form.get('name')||'').trim();
  if(register&&!name){setError('Please enter your name.');return;}
  if(register&&password!==form.get('confirmPassword')){setError('Your passwords do not match.');return;}
  setBusy(true);
  try{
   const result=register?await authClient.signUp.email({email,password,name,callbackURL:'/'}):await authClient.signIn.email({email,password,callbackURL:'/'});
   if(result.error)throw new Error(result.error.message||'Unable to sign in.');
   window.location.assign('/');
  }catch(err){setError(err instanceof Error?err.message:'Unable to connect. Please try again.');}
  finally{setBusy(false);}
 }
 return <form onSubmit={submit} className="auth-form" aria-busy={busy}>
 <h2>{register?'Create your account':'Sign in to RSTMC'}</h2>
 <p>Use your email and password.</p>
 <fieldset disabled={busy}>
 {register&&<label>Name<input name="name" autoComplete="name" required minLength={1} maxLength={60}/></label>}
 <label>Email<input name="email" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} required maxLength={254}/></label>
 <label>Password<input name="password" type="password" autoComplete={register?'new-password':'current-password'} minLength={register?12:1} maxLength={128} required aria-describedby={register?'password-help':undefined}/></label>
 {register&&<><small id="password-help">Use at least 12 characters. Keep your password safe; email recovery isn’t available yet.</small><label>Confirm password<input name="confirmPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} required/></label></>}
 </fieldset>
 {error&&<p role="alert">{error}</p>}
 <button type="submit" className="primary-button wide" disabled={busy}>{busy?'Please wait…':register?'Create account':'Sign in'}</button>
 <button type="button" className="text-button" disabled={busy} onClick={()=>{setRegister(!register);setError('');}}>{register?'Already have an account? Sign in':'New here? Create an account'}</button>
 </form>;
}

// Forward menu props/ref so keyboard selection and focus work with Radix asChild.
export const SignOutButton=forwardRef<HTMLButtonElement,ComponentPropsWithoutRef<'button'>>(function SignOutButton({onClick,disabled,...props},ref){
 const [busy,setBusy]=useState(false);
 return <button {...props} ref={ref} type="button" disabled={disabled||busy} onClick={async event=>{
  onClick?.(event);if(event.defaultPrevented||busy)return;setBusy(true);
  try{const result=await authClient.signOut();if(result.error)throw new Error(result.error.message||'Unable to sign out.');window.location.assign('/');}
  catch(error){toast.error(error instanceof Error?error.message:'Unable to sign out. Please try again.');}
  finally{setBusy(false);}
 }}>{busy?'Signing out…':'Sign out'}</button>;
});
