import {ensureSchema,getPool} from './postgres';
import {loadSettings} from './admin/core';
import {accountEnabled} from './account-policy';
import {featureConfig,resolveFeatures,type Feature,type FeatureConfig,type Flags} from './features';
export class FeatureError extends Error {constructor(message:string,public status=403){super(message);}}
export type FeaturePolicy={config:FeatureConfig;flags:Flags;admin:boolean};
export async function featurePolicy(viewer:string|null):Promise<FeaturePolicy>{
 await ensureSchema();const db=await getPool();const settings=await loadSettings(db);const config=featureConfig(settings);const flags=resolveFeatures(config,viewer);
 let admin=false;
 if(viewer&&config.maintenance.enabled){const {rows:[row]}=await db.query('SELECT role,"emailVerified",banned,"banExpires",deleted_at FROM "user" WHERE id=$1',[viewer]);admin=!!row&&row.emailVerified===true&&['admin','owner'].includes(row.role)&&accountEnabled(row);}
 return {config,flags,admin};
}
export function requirePublic(policy:FeaturePolicy,viewer:string|null){if(policy.config.maintenance.enabled&&!policy.admin)throw new FeatureError(policy.config.maintenance.message,503);if(!viewer&&!policy.flags.guestBrowsing)throw new FeatureError('Sign in to browse.',401);}
export function requireFeature(policy:FeaturePolicy,key:Feature){if(!policy.flags[key])throw new FeatureError('This feature is currently unavailable.');}
export async function requireUpload(owner:string){const p=await featurePolicy(owner);requirePublic(p,owner);requireFeature(p,'uploads');}
