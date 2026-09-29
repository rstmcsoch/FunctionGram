import {identity} from '@/lib/server';
import {featurePolicy} from '@/lib/feature-policy';
import {AccessScreen} from '@/components/social/access-screen';
import { publicAppearance } from '@/lib/public-appearance';
import {bootstrap} from '@/lib/server';
import {missingConfiguration} from '@/lib/config';
import type {SocialData} from '@/lib/types';
import RstmcApp from '@/components/social/app';
export const dynamic='force-dynamic';
export default async function Home(){
 const missing=missingConfiguration();
 if(missing.length)return <main className="setup-page"><section className="setup-card"><span className="brand">RSTMC<span>.</span></span><p className="eyebrow">FunctionGram · deployment preview</p><h1>A home for your moments.</h1><p>The app has been prepared for Vercel. Its database, media storage, or account email delivery still needs configuration before accounts, posts, and messages can be used.</p><p>Project owner: connect Neon PostgreSQL, a public Vercel Blob store, and Brevo transactional email, then configure the missing environment variables and redeploy.</p><ul>{missing.map(key=><li key={key}><code>{key}</code></li>)}</ul><p>The existing RSTMC site is a separate deployment. Its accounts and data have not been migrated.</p></section></main>;
 const viewer=await identity();const policy=await featurePolicy(viewer);const appearance=await publicAppearance();
 if(policy.config.maintenance.enabled&&!policy.admin)return <AccessScreen title={policy.config.maintenance.title} message={policy.config.maintenance.message} appearance={appearance} flags={{...policy.flags,signups:false}} maintenance/>;
 if(!viewer&&!policy.flags.guestBrowsing)return <AccessScreen title="Sign in to continue" message="Browsing is available to signed-in members." appearance={appearance} flags={policy.flags} maintenance={false}/>;
 let initial:SocialData|null=null;
 try{initial=await bootstrap();}catch(error){console.error('Feed unavailable',error);}
 return <RstmcApp initial={initial} appearance={await publicAppearance()}/>;
}
