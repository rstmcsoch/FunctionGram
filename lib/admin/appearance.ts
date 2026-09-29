import { validateAppearance, appearanceFromSettings, type Appearance } from '../appearance';
import { authorizeAdmin, saveSetting, loadSettings } from './core';
import type { PoolLike } from '../postgres';
import { AdminError } from './validation';
/** Reusing a registered image must not let an administrator claim another user's asset. */
export async function saveAppearance(pool:PoolLike,actorId:string,input:unknown) {
 await authorizeAdmin(pool,actorId);
 let appearance:Appearance;try{appearance=validateAppearance(input);}catch(error){throw new AdminError(error instanceof Error?error.message:'Invalid appearance.');}
 const previous=appearanceFromSettings(await loadSettings(pool));
 const existing=[previous.logoLight,previous.logoDark,previous.favicon,previous.hero.image];
 for(const url of [appearance.logoLight,appearance.logoDark,appearance.favicon,appearance.hero.image]){
  if(!url.startsWith('/api/media/')||existing.includes(url))continue;
  const {rows:[asset]}=await pool.query('SELECT mime,size FROM assets WHERE key=$1 AND owner_id=$2',[url.slice(11),actorId]);
  if(!asset||Number(asset.size)>2*1024*1024||!['image/png','image/jpeg','image/webp','image/gif'].includes(asset.mime))throw new AdminError('Choose a verified image owned by this administrator.');
 }
 await saveSetting(pool,actorId,'appearance.config',JSON.stringify(appearance));
 return appearance;
}
