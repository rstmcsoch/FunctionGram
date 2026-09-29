/** Public, serializable appearance schema. Never contains secrets or arbitrary CSS/HTML. */
export const NAV_TARGETS = ['home','search','explore','reels','messages','notifications','create','profile','saved'] as const;
export const NAV_ICONS = ['home','search','compass','film','send','heart','plus','user','bookmark','link'] as const;
export type NavItem = {id:string;label:string;icon:typeof NAV_ICONS[number];target:string;enabled:boolean;sidebar:boolean;dock:boolean;header:boolean;badge:string};
export type Palette = {primary:string;background:string;foreground:string;card:string;canvas:string;muted:string;border:string};
export type Appearance = {
 name:string;wordmark:string;logoLight:string;logoDark:string;favicon:string;
 light:Palette;dark:Palette;radius:number;blur:number;defaultTheme:'light'|'dark'|'system';
 announcement:{enabled:boolean;text:string;label:string;url:string};
 hero:{enabled:boolean;title:string;text:string;image:string;label:string;url:string};
 footer:{enabled:boolean;columns:{title:string;links:{label:string;url:string}[]}[];copyright:string};
 nav:NavItem[];headerPosition:'fixed'|'static';sidebarMode:'auto'|'compact'|'hidden';
};
export const DEFAULT_APPEARANCE:Appearance = {
 name:'RSTMC.',wordmark:'RSTMC.',logoLight:'',logoDark:'',favicon:'/favicon.svg',
 light:{primary:'#eb456e',background:'#ffffff',foreground:'#141417',card:'#ffffff',canvas:'#fbfbfc',muted:'#86868f',border:'#e9e9ee'},
 dark:{primary:'#eb456e',background:'#0b0b0e',foreground:'#f3f3f5',card:'#141419',canvas:'#08080a',muted:'#9b9ba7',border:'#232329'},
 radius:13,blur:22,defaultTheme:'system',
 announcement:{enabled:false,text:'',label:'',url:''},hero:{enabled:false,title:'',text:'',image:'',label:'',url:''},
 footer:{enabled:true,columns:[{title:'Discover',links:[{label:'Home',url:'/#/home'},{label:'Explore',url:'/#/explore'}]},{title:'Community',links:[{label:'Reels',url:'/#/reels'},{label:'Search',url:'/#/search'}]},{title:'Your space',links:[{label:'Profile',url:'/#/profile'},{label:'Saved',url:'/#/saved'}]}],copyright:'© RSTMC. All rights reserved.'},
 nav:NAV_TARGETS.map((target,i)=>({id:target,target,label:['Home','Search','Explore','Reels','Messages','Notifications','Create','Profile','Saved'][i],icon:['home','search','compass','film','send','heart','plus','user','bookmark'][i] as NavItem['icon'],enabled:true,sidebar:true,dock:['home','search','explore','create','reels','profile'].includes(target),header:['messages','notifications'].includes(target),badge:''})),
 headerPosition:'fixed',sidebarMode:'auto',
};
export function safeUrl(value:string,blank=true):boolean {
 if(!value)return blank;
 if(value!==value.trim()||value.length>500||/[\x00-\x20\x7f\\]/.test(value))return false;
 if(/^\/(?!\/)/.test(value))return true;
 try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password;}catch{return false;}
}
export function mediaUrl(value:string):boolean {
 return value===''||/^\/api\/media\/[a-f0-9-]{36}$/.test(value)||/^\/media\/[a-zA-Z0-9_-]+\.(png|jpg|jpeg|webp|gif)$/.test(value)||value==='/favicon.svg';
}
export function validateAppearance(input:unknown):Appearance {
 function object(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Expected appearance fields.');return value as Record<string,unknown>;}
 function text(v:unknown,max:number,required=false){if(typeof v!=='string'||v.length>max||/[\x00-\x1f\x7f]/.test(v)||(required&&!v.trim()))throw new Error('Invalid appearance text.');return v.trim();}
 function bool(v:unknown){if(typeof v!=='boolean')throw new Error('Expected on/off.');return v;}
 function choice<T extends string>(v:unknown,choices:readonly T[]):T{if(!choices.includes(v as T))throw new Error('Invalid appearance choice.');return v as T;}
 function number(v:unknown,max:number){if(typeof v!=='number'||!Number.isInteger(v)||v<0||v>max)throw new Error('Invalid appearance size.');return v;}
 function url(v:unknown){const s=text(v,500);if(!safeUrl(s))throw new Error('Use a relative URL or HTTPS URL without credentials.');return s;}
 function media(v:unknown){const s=text(v,100);if(!mediaUrl(s))throw new Error('Use a verified image upload or bundled image.');return s;}
 function palette(v:unknown):Palette{const p=object(v);return Object.fromEntries(Object.keys(DEFAULT_APPEARANCE.light).map(k=>{if(typeof p[k]!=='string'||!/^#[0-9a-fA-F]{6}$/.test(p[k] as string))throw new Error('Colours must be six-digit hex values.');return[k,p[k]];})) as Palette;}
 const a=object(input),announcement=object(a.announcement),hero=object(a.hero),footer=object(a.footer);
 if(!Array.isArray(a.nav)||a.nav.length>12)throw new Error('Choose at most 12 navigation items.');
 const nav=a.nav.map(v=>{const n=object(v),target=text(n.target,500,true),id=text(n.id,40,true);if(!/^[a-z][a-z0-9-]*$/.test(id))throw new Error('Invalid navigation ID.');if(!NAV_TARGETS.includes(target as typeof NAV_TARGETS[number])&&!safeUrl(target,false))throw new Error('Invalid navigation target.');return {id,target,label:text(n.label,30,true),icon:choice(n.icon,NAV_ICONS),enabled:bool(n.enabled),sidebar:bool(n.sidebar),dock:bool(n.dock),header:bool(n.header),badge:text(n.badge,8)};});
 if(new Set(nav.map(n=>n.id)).size!==nav.length)throw new Error('Navigation IDs must be unique.');
 if(nav.filter(n=>n.enabled&&n.dock).length>6||nav.filter(n=>n.enabled&&n.header).length>2)throw new Error('Choose at most 6 dock items and 2 header items.');
 if(!Array.isArray(footer.columns)||footer.columns.length>3)throw new Error('Choose at most 3 footer columns.');
 const columns=footer.columns.map(v=>{const c=object(v);if(!Array.isArray(c.links)||c.links.length>6)throw new Error('Choose at most 6 links per column.');return{title:text(c.title,40,true),links:c.links.map(v=>{const l=object(v);const target=url(l.url);if(!target)throw new Error('Footer links need a URL.');return{label:text(l.label,50,true),url:target};})};});
 return {name:text(a.name,80,true),wordmark:text(a.wordmark,30,true),logoLight:media(a.logoLight),logoDark:media(a.logoDark),favicon:media(a.favicon),light:palette(a.light),dark:palette(a.dark),radius:number(a.radius,32),blur:number(a.blur,40),defaultTheme:choice(a.defaultTheme,['light','dark','system']),
 announcement:{enabled:bool(announcement.enabled),text:text(announcement.text,300),label:text(announcement.label,40),url:url(announcement.url)},
 hero:{enabled:bool(hero.enabled),title:text(hero.title,100),text:text(hero.text,400),image:media(hero.image),label:text(hero.label,40),url:url(hero.url)},
 footer:{enabled:bool(footer.enabled),columns,copyright:text(footer.copyright,160)},nav,headerPosition:choice(a.headerPosition,['fixed','static']),sidebarMode:choice(a.sidebarMode,['auto','compact','hidden'])};
}
export function appearanceFromSettings(settings:Record<string,unknown>):Appearance {
 if(settings['appearance.config'])try{return validateAppearance(JSON.parse(String(settings['appearance.config'])));}catch{/* Fall back to registry defaults. */}
 const result=structuredClone(DEFAULT_APPEARANCE);
 if(typeof settings['brand.name']==='string')result.name=result.wordmark=settings['brand.name'] as string;
 if(typeof settings['theme.primary']==='string'&&/^#[0-9a-fA-F]{6}$/.test(settings['theme.primary'] as string))result.light.primary=settings['theme.primary'] as string;
 if(['light','dark','system'].includes(String(settings['theme.defaultTheme'])))result.defaultTheme=settings['theme.defaultTheme'] as Appearance['defaultTheme'];
 return result;
}
export function targetEnabled(a:Appearance,target:string):boolean {return !NAV_TARGETS.includes(target as typeof NAV_TARGETS[number])||a.nav.some(n=>n.enabled&&(n.target===target||n.target==='/#/'+target||n.target==='/#'+target));}
export function linkEnabled(a:Appearance,url:string):boolean {const match=url.match(/^\/?#\/?([^/?#]+)/);return !match||targetEnabled(a,match[1]);}
export function appearanceCss(a:Appearance):string {
 const block=(p:Palette)=>`--primary:${p.primary};--ring:${p.primary};--sidebar-primary:${p.primary};--background:${p.background};--foreground:${p.foreground};--card:${p.card};--card-foreground:${p.foreground};--canvas:${p.canvas};--popover:${p.card};--popover-foreground:${p.foreground};--muted-foreground:${p.muted};--border:${p.border};--input:${p.border};--radius:${a.radius}px;--glass-blur:blur(${a.blur}px) saturate(160%);--dock-blur:blur(${a.blur}px) saturate(170%);`;
 return `html:root{${block(a.light)}}html:root[data-theme="dark"]{${block(a.dark)}}@media(prefers-color-scheme:dark){html:root:not([data-theme]){${block(a.dark)}}}`;
}
