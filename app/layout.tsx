import {getLabels,getTranslator} from '@/lib/public-labels';
import {LabelsProvider} from '@/components/social/labels';
import type { Metadata } from 'next';
import { publicAppearance } from '@/lib/public-appearance';
import { appearanceCss } from '@/lib/appearance';
import './globals.css';
export const dynamic='force-dynamic';
export async function generateMetadata():Promise<Metadata>{
 const a=await publicAppearance();const t=await getTranslator();return {title:t('metadata.title',{site:a.name}),description:t('metadata.description',{site:a.name}),icons:{icon:a.favicon||'/favicon.svg',shortcut:a.favicon||'/favicon.svg'}};
}
export default async function RootLayout({children}:{children:React.ReactNode}) {
 const a=await publicAppearance();
 // Static executable code; only the validated theme enum appears in a data attribute.
 const themeScript=`(function(){var d=document.documentElement,t;try{t=localStorage.getItem('rstmc-theme')}catch(e){}if(t!=='dark'&&t!=='light'){t=d.dataset.defaultTheme;if(t==='system')t=matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light'}d.dataset.theme=t})();`;
 return <html lang="en" suppressHydrationWarning data-default-theme={a.defaultTheme} data-theme={a.defaultTheme==='system'?undefined:a.defaultTheme}><head><style id="appearance-tokens" dangerouslySetInnerHTML={{__html:appearanceCss(a)}}/><script dangerouslySetInnerHTML={{__html:themeScript}}/></head><body className="antialiased"><LabelsProvider labels={await getLabels()}>{children}</LabelsProvider></body></html>;
}
