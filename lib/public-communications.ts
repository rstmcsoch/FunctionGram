import 'server-only';
import { ensureSchema, getPool } from './postgres';
import { cmsFooterPages, publicAnnouncements } from './admin/communications';

export async function publicCmsFooterPages() {
  try { await ensureSchema(); return await cmsFooterPages(await getPool()); }
  catch { return []; }
}
export async function activePublicAnnouncements(signedIn: boolean) {
  try { await ensureSchema(); return await publicAnnouncements(await getPool(), signedIn); }
  catch { return []; }
}
export async function publicCmsPage(slug: string) {
  await ensureSchema();
  const { rows: [page] } = await (await getPool()).query('SELECT id,slug,title,body,seo_title,seo_description,og_image FROM site_pages WHERE slug=$1 AND published=true', [slug]);
  return page as { id: string; slug: string; title: string; body: string; seo_title: string | null; seo_description: string | null; og_image: string | null } | undefined;
}
