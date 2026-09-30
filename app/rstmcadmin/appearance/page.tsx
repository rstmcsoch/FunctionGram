import {assertAdminPagePermission,requireAdminPage} from '@/lib/admin/guard';
import {readSettings} from '@/lib/admin/settings';
import {appearanceFromSettings} from '@/lib/appearance';
import {localDevDatabase} from '@/lib/postgres';
import {AppearanceEditor} from '@/components/admin/appearance';
import { PageHead } from '@/components/admin/page-head';
export default async function AppearancePage(){
 const actor=await requireAdminPage();assertAdminPagePermission(actor,'settings.manage');const value=appearanceFromSettings(await readSettings());
 return <><PageHead breadcrumb="Control room / Appearance" title="Make this space yours">
  <p>Branding, theme, banners, footer and navigation. Save publishes the complete configuration in one audited transaction. Changes apply on the next page load; your personal theme choice takes precedence over the site default.</p>
  </PageHead><AppearanceEditor initial={value} localUploads={localDevDatabase()}/></>;
}
