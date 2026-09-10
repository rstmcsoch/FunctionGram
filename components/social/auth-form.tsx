'use client';
import {useState,type FormEvent} from 'react';
import {authClient} from '@/lib/auth-client';
export function AuthForm(){
 const [register,setRegister]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();setBusy(true);setError('');const form=new FormData(event.currentTarget);try{
  const email=String(form.get('email')),password=String(form.get('password'));
  const result=register?await authClient.signUp.email({email,password,name:String(form.get('name')).trim(),callbackURL:'/'}):await authClient.signIn.email({email,password,callbackURL:'/'});
  if(result.error)throw new Error(result.error.message||'Unable to sign in.');window.location.assign('/');
 }catch(err){setError(err instanceof Error?err.message:'Unable to connect.');}finally{setBusy(false);}}
 return <form onSubmit={submit} className="auth-form"><span className="brand">RSTMC<span>.</span></span>
 {register&&<label>Name<input name="name" autoComplete="name" required minLength={1} maxLength={60}/></label>}
 <label>Email<input name="email" type="email" autoComplete="email" required maxLength={254}/></label>
 <label>Password<input name="password" type="password" autoComplete={register?'new-password':'current-password'} minLength={register?12:1} maxLength={128} required/></label>
 {register&&<small>Use at least 12 characters. Keep your password safe; email recovery isn’t configured yet.</small>}
 {error&&<p role="alert">{error}</p>}
 <button className="primary-button wide" disabled={busy}>{busy?'Please wait…':register?'Create account':'Sign in'}</button>
 <button type="button" className="text-button" disabled={busy} onClick={()=>{setRegister(!register);setError('');}}>{register?'Already have an account? Sign in':'New here? Create an account'}</button></form>;
}
export function SignOutButton(){return <button onClick={async()=>{const result=await authClient.signOut();if(!result.error)window.location.assign('/');}}>Sign out</button>;}
