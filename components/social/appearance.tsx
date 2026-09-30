'use client';

import {useLabels} from "./labels";
import {useSyncExternalStore} from 'react';
import Image from 'next/image';
import NextLink from 'next/link';
import {navigationLabel} from '@/lib/admin/labels';
import {Home,Search,Compass,Clapperboard,Send,Heart,Plus,UserRound,Bookmark,Link} from 'lucide-react';
import {linkEnabled,type Appearance} from '@/lib/appearance';
export const navIcons={home:Home,search:Search,compass:Compass,film:Clapperboard,send:Send,heart:Heart,plus:Plus,user:UserRound,bookmark:Bookmark,link:Link};
export function Brand({appearance:a}:{appearance:Appearance}){
 return <>{a.logoLight&&<Image className="brand-image brand-image-light" src={a.logoLight} alt="" width={120} height={40} unoptimized/>}{(a.logoDark||a.logoLight)&&<Image className="brand-image brand-image-dark" src={a.logoDark||a.logoLight} alt="" width={120} height={40} unoptimized/>}<span className={a.logoLight?'sr-only':a.logoDark?'brand-wordmark brand-wordmark-dark-logo':'brand-wordmark'} data-initial={a.wordmark[0]}>{a.wordmark}</span></>;
}
export function Banners({appearance:a}:{appearance:Appearance}){
  const t=useLabels();
 const {announcement:n,hero:h}=a;
 return <>{n.enabled&&<aside className="appearance-announcement" aria-label={t("appearance.announcement")}><p>{n.text}</p>{n.url&&n.label&&linkEnabled(a,n.url)&&<a href={n.url}>{n.label}</a>}</aside>}{h.enabled&&<section className="appearance-hero" aria-label={t("appearance.featured_announcement")}>{h.image&&<Image loading="eager" src={h.image} alt="" width={1200} height={400} unoptimized/>}<div><h1>{h.title}</h1><p>{h.text}</p>{h.label&&h.url&&linkEnabled(a,h.url)&&<a className="primary-button" href={h.url}>{h.label}</a>}</div></section>}</>;
}
export type CmsFooterPage={slug:string;title:string};
export function PublicFooter({appearance:a,cmsPages=[]}:{appearance:Appearance;cmsPages?:CmsFooterPage[]}){
  const t=useLabels();
 if(!a.footer.enabled)return null;
 return <footer className="public-footer" aria-label={t("appearance.site_footer")}><div className="footer-columns">{a.footer.enabled&&a.footer.columns.map((column,index)=><section key={index}><h2>{column.title}</h2><ul>{column.links.filter(link=>linkEnabled(a,link.url)).map((link,i)=><li key={i}><a href={link.url}>{navigationLabel(t,link.url,link.label)}</a></li>)}</ul></section>)}{cmsPages.length>0&&<section><h2>{t('appearance.pages')}</h2><ul>{cmsPages.map(page=><li key={page.slug}><NextLink href={'/p/'+page.slug}>{page.title}</NextLink></li>)}</ul></section>}</div>{a.footer.enabled&&<p className="footer-legal">{a.footer.copyright}</p>}</footer>;
}

export type LiveAnnouncement={id:string;title:string;body:string;href:string|null;tone:'info'|'success'|'warning';dismissible:boolean};
const dismissalChangeEvent='rstmc-announcement-dismissals-change';
function readAnnouncementDismissals(){try{return typeof window==='undefined'?'[]':localStorage.getItem('rstmc-dismissed-announcements')||'[]';}catch{return '[]';}}
function subscribeAnnouncementDismissals(callback:()=>void){if(typeof window==='undefined')return()=>{};window.addEventListener('storage',callback);window.addEventListener(dismissalChangeEvent,callback);return()=>{window.removeEventListener('storage',callback);window.removeEventListener(dismissalChangeEvent,callback);};}
export function LiveAnnouncements({items}:{items:LiveAnnouncement[]}){
 const t=useLabels();
 const dismissedSnapshot=useSyncExternalStore(subscribeAnnouncementDismissals,readAnnouncementDismissals,()=> '[]');
 let dismissed:string[]=[];try{const stored=JSON.parse(dismissedSnapshot);if(Array.isArray(stored))dismissed=stored.filter((id):id is string=>typeof id==='string');}catch{}
 const hide=(id:string)=>{const next=[...new Set([...dismissed,id])].slice(-100);try{localStorage.setItem('rstmc-dismissed-announcements',JSON.stringify(next));window.dispatchEvent(new Event('rstmc-announcement-dismissals-change'));}catch{}};
 const visible=items.filter(item=>!dismissed.includes(item.id));
 if(!visible.length)return null;
 return <div className="live-announcements">{visible.map(item=><aside key={item.id} className={'live-announcement tone-'+item.tone} aria-label={item.title}><div><strong>{item.title}</strong><p>{item.body}</p>{item.href&&<a href={item.href}>{t('appearance.learn_more')}</a>}</div>{item.dismissible&&<button type="button" aria-label={t('appearance.dismiss_announcement')+item.title} onClick={()=>hide(item.id)}>{t('appearance.dismiss')}</button>}</aside>)}</div>;
}
