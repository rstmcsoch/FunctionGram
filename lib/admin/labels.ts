/** Public, English-first registry. Keys are stable; values are plain text, never HTML. */
import { LABEL_DEFAULTS } from './label-defaults';
export { LABEL_DEFAULTS };
export type LabelKey = keyof typeof LABEL_DEFAULTS;
export type LabelOverrides = Partial<Record<LabelKey, string>>;
export type LabelValues = Record<string, string | number>;
export const MAX_LABEL_BYTES = 196608;
// Full, pretty-printed backups include defaults and formatting as well as overrides.
export const MAX_LABEL_IMPORT_BYTES = MAX_LABEL_BYTES + new TextEncoder().encode(JSON.stringify(LABEL_DEFAULTS, null, 2)).length;
export function parseLabelsImport(text: string): LabelOverrides {
 if(new TextEncoder().encode(text).length>MAX_LABEL_IMPORT_BYTES)throw new Error('Label import file is too large.');
 return validateLabels(JSON.parse(text));
}
const placeholders = (value: string) => [...value.matchAll(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g)].map(match => match[1]).sort().join(',');
export function validateLabels(input: unknown): LabelOverrides {
 if(!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Labels must be a JSON object keyed by label ID.');
 const output: LabelOverrides = {};
 for(const [key,value] of Object.entries(input)) {
  if(!Object.hasOwn(LABEL_DEFAULTS,key)) throw new Error('Unknown label key: '+key.slice(0,100));
  if(typeof value!=='string' || !value.trim() || value.length>2000 || /[\x00-\x08\x0b-\x1f\x7f]/.test(value)) throw new Error('Labels must be nonempty text, at most 2000 characters.');
  if(placeholders(value)!==placeholders(LABEL_DEFAULTS[key as LabelKey])) throw new Error('Keep the original placeholders for '+key+'.');
  if(value!==LABEL_DEFAULTS[key as LabelKey]) output[key as LabelKey]=value;
 }
 if(new TextEncoder().encode(JSON.stringify(output)).length>MAX_LABEL_BYTES)throw new Error('Label overrides exceed the 192 KiB limit.');
 return output;
}
export function labelsFromSettings(settings:Record<string,unknown>):LabelOverrides {
 try{return settings['labels.config']?validateLabels(JSON.parse(String(settings['labels.config']))):{};}catch{return {};}
}
const byText=new Map<string,LabelKey>(Object.entries(LABEL_DEFAULTS).map(([key,value])=>[value,key as LabelKey]));
export type Translator = ((key: LabelKey, values?: LabelValues) => string) & { text:(value:string)=>string; overrides:LabelOverrides };
export function createTranslator(overrides:LabelOverrides = {}):Translator {
 const renameReels=(value:string)=>overrides['nav.reels']?value.replace(/\bReels?\b|\breels?\b/g,()=>overrides['nav.reels']!):value;
 const t = ((key:LabelKey, values:LabelValues={})=>{
  const template=overrides[key]??LABEL_DEFAULTS[key];
  // Substitute before returning text, with no recursive interpolation or HTML evaluation.
  const copy=key==='nav.reels'||Object.hasOwn(overrides,key)?template:renameReels(template);
  return copy.replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g,(match,name)=>Object.hasOwn(values,name)?String(values[name]):match);
 }) as Translator;
 t.text=(value:string)=>{const key=byText.get(value);return key?t(key):value;};
 t.overrides=overrides;
 return t;
}
export const defaultTranslator=createTranslator();
/** Label overrides beat appearance labels only when explicitly configured. */
export function navigationLabel(t:Translator,target:string,fallback:string){
 const key=('nav.'+target.replace(/^\/#\/?/,'')) as LabelKey;
 return Object.hasOwn(t.overrides,key)?t(key):fallback;
}
