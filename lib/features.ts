/** Rollouts are deterministic by account ID; anonymous visitors share one cohort. */
export const FEATURE_KEYS=['reels','stories','explore','search','messages','notifications','comments','likes','saves','shares','follow','reports','uploads','signups','guestBrowsing','privateAccounts','tagging','postEditing','messageDeletion','messageSearch','readReceipts','emojiPicker','messageReplies','messageReactions','messageEditing','messageForwarding','messagePinning','messageSaving','disappearingMessages','voiceMessages','fileMessages','gifMessages','stickerMessages','chatThemes','messageTyping'] as const;
export type Feature=typeof FEATURE_KEYS[number];
export type Flags=Record<Feature,boolean>;
export type FeatureConfig={flags:Record<Feature,{enabled:boolean;percent:number}>;maintenance:{enabled:boolean;title:string;message:string};counters:{multiplier:number;jitter:number;hide:boolean}};
export const DEFAULT_FEATURES:FeatureConfig={flags:Object.fromEntries(FEATURE_KEYS.map(key=>[key,{enabled:true,percent:100}])) as FeatureConfig['flags'],maintenance:{enabled:false,title:'We’ll be back soon',message:'We’re making a few improvements. Please check back shortly.'},counters:{multiplier:1,jitter:0,hide:false}};
export function validateFeatures(value:unknown):FeatureConfig {
 if(!value||typeof value!=='object')throw new Error('Invalid feature configuration.');const input=value as FeatureConfig;
 if(!input.flags||typeof input.flags!=='object'||Array.isArray(input.flags))throw new Error('Invalid feature configuration.');
 const flags={} as FeatureConfig['flags'];
 for(const key of FEATURE_KEYS){
  // A stored configuration written before a key existed keeps that key's
  // default instead of failing the whole document, which would otherwise
  // silently reset every other switch whenever a new feature is added.
  const f=Object.hasOwn(input.flags,key)?input.flags[key]:undefined;
  if(f===undefined){flags[key]={enabled:true,percent:100};continue;}
  if(typeof f.enabled!=='boolean'||!Number.isInteger(f.percent)||f.percent<0||f.percent>100)throw new Error('Each feature needs an on/off value and a rollout from 0 to 100.');
  flags[key]={enabled:f.enabled,percent:f.percent};
 }
 const m=input.maintenance,c=input.counters;
 if(!m||typeof m.enabled!=='boolean'||typeof m.title!=='string'||!m.title.trim()||m.title.length>100||typeof m.message!=='string'||m.message.length>500||/[\x00-\x1f]/.test(m.title+m.message))throw new Error('Invalid maintenance text.');
 if(!c||typeof c.multiplier!=='number'||!Number.isFinite(c.multiplier)||c.multiplier<0||c.multiplier>100||!Number.isInteger(c.jitter)||c.jitter<0||c.jitter>1000||typeof c.hide!=='boolean')throw new Error('Counters require multiplier 0–100, jitter 0–1000 and hide on/off.');
 return{flags,maintenance:{enabled:m.enabled,title:m.title.trim(),message:m.message.trim()},counters:{multiplier:c.multiplier,jitter:c.jitter,hide:c.hide}};
}
export function rolloutBucket(feature:Feature,id:string|null):number {let hash=2166136261;for(const char of feature+':'+(id||'anonymous'))hash=Math.imul(hash^char.charCodeAt(0),16777619);return(hash>>>0)%100;}
export function resolveFeatures(config:FeatureConfig,id:string|null):Flags{return Object.fromEntries(FEATURE_KEYS.map(key=>[key,config.flags[key].enabled&&rolloutBucket(key,id)<config.flags[key].percent])) as Flags;}
export const ALL_FEATURES=resolveFeatures(DEFAULT_FEATURES,null);
export function featureConfig(settings:Record<string,unknown>):FeatureConfig {if(!settings['features.config'])return structuredClone(DEFAULT_FEATURES);try{return validateFeatures(JSON.parse(String(settings['features.config'])));}catch{return structuredClone(DEFAULT_FEATURES);}}
export const VIEW_FEATURES:Record<string,Feature>={reels:'reels',search:'search',tag:'search',explore:'explore',messages:'messages',notifications:'notifications',saved:'saves',create:'uploads'};
export const QUERY_FEATURES:Record<string,Feature>={comments:'comments',messages:'messages',inbox:'messages',conversations:'messages',conversation_content:'messages',messages_search:'messageSearch',message_reactions:'messageReactions',message_pins:'messagePinning',saved_messages:'messageSaving',stickers:'stickerMessages',gifs:'gifMessages',highlights:'stories','story-viewers':'stories',tagged:'tagging',accounts:'search',search:'search',hashtag:'search',reels:'reels',explore:'explore',saved:'saves',collections:'saves',following:'follow',relations:'follow'};
export const ACTION_FEATURES:Record<string,Feature>={comment:'comments',delete_comment:'comments',follow:'follow',message:'messages',delete_message:'messageDeletion',read_notifications:'notifications',set_privacy:'privateAccounts',report:'reports',highlight:'stories',create_collection:'saves',delete_collection:'saves',save_to_collection:'saves',update_post:'postEditing',create_post:'uploads',
  // Messaging actions
  reply_message:'messageReplies',react_message:'messageReactions',edit_message:'messageEditing',forward_message:'messageForwarding',pin_message:'messagePinning',save_message:'messageSaving',set_conversation_state:'messages',update_presence:'messages',set_typing:'messageTyping',report_message:'reports',mark_unread:'messages',update_disappearing:'disappearingMessages',clear_chat:'messages',consume_view_once:'messages',hide_message:'messageDeletion',
  // `read_messages` records the recipient's real read state, which unread counts
  // and the Unread filter depend on. It therefore follows the global messaging
  // switch, not `readReceipts`: that flag decides whether a *sender* is shown
  // "Seen", and turning it off must not stop the server knowing the truth. The
  // visibility half is enforced where the conversation is read.
  read_messages:'messages'};
