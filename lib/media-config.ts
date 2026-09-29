import {mediaTypes} from './media-type';
export const MIB=1024*1024;
export type MediaConfig={enabled:boolean;maxFileMb:number;dailyQuotaMb:number;allowedTypes:string[];maxMedia:number;imageQuality:number;imageMaxDimension:number;imageFormat:'jpeg'|'png'|'webp';videoMaxSeconds:number};
export const DEFAULT_MEDIA:MediaConfig={enabled:true,maxFileMb:20,dailyQuotaMb:250,allowedTypes:[...mediaTypes],maxMedia:6,imageQuality:88,imageMaxDimension:1800,imageFormat:'jpeg',videoMaxSeconds:0};
export function validateMedia(value:unknown):MediaConfig {
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid media configuration.');const c=value as MediaConfig;
 const integer=(v:number,min:number,max:number)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
 if(typeof c.enabled!=='boolean'||!integer(c.maxFileMb,1,100)||!integer(c.dailyQuotaMb,1,10000)||!integer(c.maxMedia,1,20)||!integer(c.imageQuality,1,100)||!integer(c.imageMaxDimension,320,4096)||!integer(c.videoMaxSeconds,0,3600))throw new Error('Check media limits: file 1–100 MB, daily quota 1–10000 MB, items 1–20, quality 1–100, dimension 320–4096, duration 0–3600 seconds.');
 if(!Array.isArray(c.allowedTypes)||!c.allowedTypes.length||new Set(c.allowedTypes).size!==c.allowedTypes.length||c.allowedTypes.some(type=>!mediaTypes.includes(type))||!['jpeg','png','webp'].includes(c.imageFormat))throw new Error('Choose supported media types and an image output format.');
 if(c.allowedTypes.some(type=>type.startsWith('image/')&&type!=='image/gif')&&!c.allowedTypes.includes('image/'+c.imageFormat))throw new Error('The image output type must also be allowed.');
 return {enabled:c.enabled,maxFileMb:c.maxFileMb,dailyQuotaMb:c.dailyQuotaMb,allowedTypes:[...c.allowedTypes],maxMedia:c.maxMedia,imageQuality:c.imageQuality,imageMaxDimension:c.imageMaxDimension,imageFormat:c.imageFormat,videoMaxSeconds:c.videoMaxSeconds};
}
export function mediaConfig(settings:Record<string,unknown>):MediaConfig {
 if(settings['media.config']){try{return validateMedia(JSON.parse(String(settings['media.config'])));}catch{return {...DEFAULT_MEDIA,enabled:false};}}
 return {...DEFAULT_MEDIA,allowedTypes:[...DEFAULT_MEDIA.allowedTypes],maxFileMb:Number(settings['upload.maxFileMb']||20),dailyQuotaMb:Number(settings['upload.dailyQuotaMb']||250)};
}
