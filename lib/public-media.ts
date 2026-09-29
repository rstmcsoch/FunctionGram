import 'server-only';
import {readSettings} from './admin/settings';
import {mediaConfig,DEFAULT_MEDIA} from './media-config';
import {missingConfiguration} from './config';
export async function publicMedia(){if(missingConfiguration().length)return DEFAULT_MEDIA;try{return mediaConfig(await readSettings());}catch{return {...DEFAULT_MEDIA,enabled:false};}}
