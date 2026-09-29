'use client';

import {useLabels} from "./labels";
import Image from 'next/image';
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
export function PublicFooter({appearance:a}:{appearance:Appearance}){
  const t=useLabels();
 if(!a.footer.enabled)return null;
 return <footer className="public-footer" aria-label={t("appearance.site_footer")}><div className="footer-columns">{a.footer.columns.map((column,index)=><section key={index}><h2>{column.title}</h2><ul>{column.links.filter(link=>linkEnabled(a,link.url)).map((link,i)=><li key={i}><a href={link.url}>{navigationLabel(t,link.url,link.label)}</a></li>)}</ul></section>)}</div><p className="footer-legal">{a.footer.copyright}</p></footer>;
}
