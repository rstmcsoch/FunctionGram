import {getTranslator} from '@/lib/public-labels';
import {identity} from '@/lib/server';
import {featurePolicy} from '@/lib/feature-policy';
import {AccessScreen} from '@/components/social/access-screen';
import { publicAppearance } from '@/lib/public-appearance';
import {bootstrap} from '@/lib/server';
import {missingConfiguration} from '@/lib/config';
import type {SocialData} from '@/lib/types';
import { activePublicAnnouncements, publicCmsFooterPages } from '@/lib/public-communications';
import RstmcApp from '@/components/social/app';

export async function SocialHome({ initialUsername }: { initialUsername?: string } = {}){
 const t=await getTranslator();
 const missing=missingConfiguration();
 if(missing.length)return <main className="setup-page"><section className="setup-card"><span className="brand">{t("page.rstmc")}<span>{t("page._")}</span></span><p className="eyebrow">{t("page.functiongram_deployment_preview")}</p><h1>{t("page.a_home_for_your_moments_")}</h1><p>{t("page.the_app_has_been_prepared_for_vercel_its_database_media_storage_o")}</p><p>{t("page.project_owner_connect_neon_postgresql_a_public_vercel_blob_store_")}</p><ul>{missing.map(key=><li key={key}><code>{key}</code></li>)}</ul><p>{t("page.the_existing_rstmc_site_is_a_separate_deployment_its_accounts_and")}</p></section></main>;
 const viewer=await identity();const policy=await featurePolicy(viewer);const appearance=await publicAppearance();
 if(policy.config.maintenance.enabled&&!policy.admin)return <AccessScreen title={policy.config.maintenance.title} message={policy.config.maintenance.message} appearance={appearance} flags={{...policy.flags,signups:false}} maintenance/>;
 if(!viewer&&!policy.flags.guestBrowsing)return <AccessScreen title={t("page.sign_in_to_continue")} message={t("page.browsing_is_available_to_signed_in_members_")} appearance={appearance} flags={policy.flags} maintenance={false}/>;
 let initial:SocialData|null=null;
 try{initial=await bootstrap();}catch(error){console.error('Feed unavailable',error);}
 const [cmsPages,announcements]=await Promise.all([publicCmsFooterPages(),activePublicAnnouncements(!!viewer)]);
 return <RstmcApp initial={initial} appearance={appearance} cmsPages={cmsPages} announcements={announcements} initialUsername={initialUsername}/>;
}
