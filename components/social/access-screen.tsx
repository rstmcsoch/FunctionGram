'use client';
import {useLabels} from "./labels";

import {useState} from 'react';
import {AuthForm} from './auth-form';
import {FeatureContext} from './features';
import {Brand,PublicFooter} from './appearance';
import type {Appearance} from '@/lib/appearance';
import type {Flags} from '@/lib/features';
export function AccessScreen({title,message,appearance,flags,maintenance}:{title:string;message:string;appearance:Appearance;flags:Flags;maintenance:boolean}){
  const t=useLabels();
 const [login,setLogin]=useState(!maintenance);
 return <FeatureContext value={flags}><main className="access-screen"><section className="glass-card"><div className="brand"><Brand appearance={appearance}/></div><h1>{title}</h1><p>{message}</p>{login?<AuthForm/>:<button className="primary-button" onClick={()=>setLogin(true)}>{t("access_screen.administrator_sign_in")}</button>}</section>{!maintenance&&<PublicFooter appearance={appearance}/>}</main></FeatureContext>;
}
