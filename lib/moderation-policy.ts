import {AdminError} from './admin/errors';
import {getPool} from './postgres';
export type ModerationConfig={enabled:boolean;regexMode:boolean;blockedWords:string[];blockedDomains:string[]};
export const DEFAULT_MODERATION:ModerationConfig={enabled:false,regexMode:false,blockedWords:[],blockedDomains:[]};
function safePattern(source:string){
 if(source.length>120||/[()|]/.test(source)||/\\[1-9]/.test(source)||/\(\?/.test(source))return false;
 let escaped=false,inClass=false,quantifiers=0;
 for(let i=0;i<source.length;i++){
  const ch=source[i];if(escaped){escaped=false;continue;}if(ch==='\\'){escaped=true;continue;}
  if(ch==='['){if(inClass)return false;inClass=true;continue;}if(ch===']'){if(!inClass)return false;inClass=false;continue;}
  if(!inClass&&'*+?{'.includes(ch))quantifiers++;
 }
 if(escaped||inClass||quantifiers>1)return false;
 try{new RegExp(source,'iu');return true;}catch{return false;}
}
function normalizeDomain(value:string){
 let candidate=value.trim().toLowerCase().replace(/^\.+|\.+$/g,'');if(candidate.includes('://')||candidate.includes('/')||candidate.includes(':'))return '';
 try{candidate=new URL('https://'+candidate).hostname.toLowerCase();}catch{return '';}
 return /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(candidate)?candidate:'';
}
export function validateModeration(value:unknown):ModerationConfig{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new AdminError('Invalid moderation configuration.');const c=value as ModerationConfig;
 if(typeof c.enabled!=='boolean'||typeof c.regexMode!=='boolean'||!Array.isArray(c.blockedWords)||!Array.isArray(c.blockedDomains)||c.blockedWords.length>50||c.blockedDomains.length>50)throw new AdminError('Use at most 50 blocked words and 50 blocked domains.');
 const words=c.blockedWords.map(word=>{if(typeof word!=='string'||!word.trim()||word.length>120||/[\u0000-\u001f\u007f]/.test(word))throw new AdminError('Each blocked word or pattern must contain 1–120 plain characters.');const text=word.trim().normalize('NFKC');if(c.regexMode&&!safePattern(text))throw new AdminError('A regex is invalid or too complex. Use a pattern with at most one repetition and no groups, alternation or backreferences.');return text;});
 if(new Set(words.map(word=>word.toLowerCase())).size!==words.length)throw new AdminError('Blocked words must be unique.');
 const domains=c.blockedDomains.map(domain=>{if(typeof domain!=='string'||domain.length>253||/[\u0000-\u0020\u007f]/.test(domain))throw new AdminError('Enter a valid domain.');const normalized=normalizeDomain(domain);if(!normalized)throw new AdminError('Enter a hostname such as example.com, without a path or port.');return normalized;});
 if(new Set(domains).size!==domains.length)throw new AdminError('Blocked domains must be unique.');
 return {enabled:c.enabled,regexMode:c.regexMode,blockedWords:words,blockedDomains:domains};
}
export function moderationConfig(settings:Record<string,unknown>):ModerationConfig{
 const value=settings['moderation.config'];if(!value)return DEFAULT_MODERATION;try{return validateModeration(JSON.parse(String(value)));}catch{return {...DEFAULT_MODERATION};}
}
function normalizeText(value:string){return value.normalize('NFKC').toLocaleLowerCase('en-US');}
function domainMatches(text:string,blocked:string[]){
 const candidates=text.match(/(?:https?:\/\/|www\.)[^\s<>"']+|\b(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}(?:\/[^\s<>"']*)?/giu)||[];
 return candidates.some(raw=>{const clean=raw.replace(/[.,!?;:)}\]]+$/g,'');let host='';try{host=new URL(/^https?:\/\//i.test(clean)?clean:'https://'+clean).hostname.toLowerCase();}catch{return false;}return blocked.some(domain=>host===domain||host.endsWith('.'+domain));});
}
export function inspectModeratedText(config:ModerationConfig,value:string){
 if(!config.enabled)return {blocked:false,kind:null as 'word'|'domain'|null};const normalized=normalizeText(value);
 for(const word of config.blockedWords){if(config.regexMode){if(new RegExp(word,'iu').test(value))return {blocked:true,kind:'word' as const};}
  else{const pattern=new RegExp('(?:^|[^\\p{L}\\p{N}_])'+word.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?:$|[^\\p{L}\\p{N}_])','iu');if(pattern.test(normalized))return {blocked:true,kind:'word' as const};}}
 return domainMatches(value,config.blockedDomains)?{blocked:true,kind:'domain' as const}:{blocked:false,kind:null};
}
let moderationCache:{until:number;value:ModerationConfig}|null=null;
export function invalidateModerationConfig(){moderationCache=null;}
export async function readModerationConfig(){if(moderationCache&&moderationCache.until>Date.now())return moderationCache.value;const {rows:[row]}=await (await getPool()).query("SELECT value FROM app_settings WHERE key='moderation.config'");let stored='';try{stored=row?JSON.parse(String(row.value)):'';}catch{}const value=moderationConfig({'moderation.config':stored});moderationCache={until:Date.now()+3000,value};return value;}
export async function requireAllowedText(value:string){const verdict=inspectModeratedText(await readModerationConfig(),value);if(verdict.blocked)throw new AdminError('This text contains content that is not allowed.',422);}
export async function requireCommentPermission(db:{query(sql:string,values?:unknown[]):Promise<{rows:Record<string,unknown>[]}>},userId:string){
 const {rows:[row]}=await db.query('SELECT comment_banned FROM profile_moderation WHERE profile_id=$1',[userId]);if(row?.comment_banned===true)throw new AdminError('This account is not allowed to comment.',403);
}
