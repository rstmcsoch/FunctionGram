import {getPool} from './postgres';
import {accountEnabled,flagIsTrue} from './account-policy';
import {featureConfig,resolveFeatures,type Feature,type FeatureConfig,type Flags} from './features';
import {readAppSettings} from './settings-cache';
import {requestMemo} from './request-context';
export class FeatureError extends Error {constructor(message:string,public status=403){super(message);}}
export type FeaturePolicy={config:FeatureConfig;flags:Flags;admin:boolean};
/**
 * Resolves the feature policy for one viewer.
 *
 * Settings come from the shared settings cache (global, tag-invalidated), and
 * the resolved policy is memoized per request per viewer so a page that asks
 * for it from several helpers performs the work once. Nothing is cached
 * across requests: rollout cohorts and the administrator check depend on the
 * viewer.
 */
export async function featurePolicy(viewer:string|null):Promise<FeaturePolicy>{
 return requestMemo('feature-policy:'+(viewer||'guest'),async()=>{
  const settings=await readAppSettings();
  const config=featureConfig(settings);const flags=resolveFeatures(config,viewer);
  let admin=false;
  if(viewer&&config.maintenance.enabled){const {rows:[row]}=await (await getPool()).query('SELECT role,"emailVerified",banned,"banExpires",deleted_at FROM "user" WHERE id=$1',[viewer]);admin=!!row&&flagIsTrue(row.emailVerified)&&['admin','owner'].includes(String(row.role))&&accountEnabled(row);}
  return {config,flags,admin} satisfies FeaturePolicy;
 });
}
export function requirePublic(policy:FeaturePolicy,viewer:string|null){if(policy.config.maintenance.enabled&&!policy.admin)throw new FeatureError(policy.config.maintenance.message,503);if(!viewer&&!policy.flags.guestBrowsing)throw new FeatureError('Sign in to browse.',401);}
export function requireFeature(policy:FeaturePolicy,key:Feature){if(!policy.flags[key])throw new FeatureError('This feature is currently unavailable.');}
export async function requireUpload(owner:string){const p=await featurePolicy(owner);requirePublic(p,owner);requireFeature(p,'uploads');}
