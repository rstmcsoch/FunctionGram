import {requireAdminPage} from '@/lib/admin/guard';
import {readSettings} from '@/lib/admin/settings';
import {appearanceFromSettings} from '@/lib/appearance';
import {localDevDatabase} from '@/lib/postgres';
import {AppearanceEditor} from '@/components/admin/appearance';
export default async function AppearancePage(){
 await requireAdminPage();const value=appearanceFromSettings(await readSettings());
 return <><p className="admin-eyebrow">Control room / Appearance</p><h1>Make this space yours</h1><p>Branding, theme, banners, footer and navigation. Save publishes the complete configuration in one audited transaction. Changes apply on the next page load; your personal theme choice takes precedence over the site default.</p><AppearanceEditor initial={value} localUploads={localDevDatabase()}/></>;
}
