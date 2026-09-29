import 'server-only';
import { readSettings } from './admin/settings';
import { appearanceFromSettings, DEFAULT_APPEARANCE } from './appearance';
import { missingConfiguration } from './config';
export async function publicAppearance(){
 if(missingConfiguration().length)return DEFAULT_APPEARANCE;
 try{return appearanceFromSettings(await readSettings());}catch{return DEFAULT_APPEARANCE;}
}
