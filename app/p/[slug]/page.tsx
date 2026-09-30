import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { publicCmsPage, publicCmsFooterPages } from '@/lib/public-communications';
import { publicAppearance } from '@/lib/public-appearance';
import { Brand, PublicFooter } from '@/components/social/appearance';
import { renderCmsMarkdown } from '@/lib/cms-markdown';

type RouteProps = { params: Promise<{ slug: string }> };
async function getPage(params: RouteProps['params']) {
  const { slug } = await params;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null;
  try { return await publicCmsPage(slug); } catch { return null; }
}
export async function generateMetadata({ params }: RouteProps): Promise<Metadata> {
  const page = await getPage(params);
  if (!page) return { title: 'Page unavailable' };
  const title = page.seo_title || page.title;
  const description = page.seo_description || undefined;
  return {
    title,
    description,
    openGraph: { title, description, type: 'article', ...(page.og_image ? { images: [page.og_image] } : {}) },
    robots: { index: true, follow: true },
  };
}
export default async function CmsPage({ params }: RouteProps) {
  const page = await getPage(params);
  if (!page) notFound();
  const [appearance, footerPages] = await Promise.all([publicAppearance(), publicCmsFooterPages()]);
  return <main className="cms-page-shell">
    <header className="cms-page-header"><Link className="cms-brand" href="/" aria-label={`Return to ${appearance.name}`}><Brand appearance={appearance}/></Link><Link href="/">Home</Link></header>
    <article className="cms-page-card">
      <h1>{page.title}</h1>
      <div className="cms-markdown">{renderCmsMarkdown(page.body)}</div>
    </article>
    <PublicFooter appearance={appearance} cmsPages={footerPages}/>
  </main>;
}
