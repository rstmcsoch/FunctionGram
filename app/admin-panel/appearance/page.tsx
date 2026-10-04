import {assertAdminPagePermission,requireAdminPage} from '@/lib/admin/guard';
import {readSettings} from '@/lib/admin/settings';
import {appearanceFromSettings} from '@/lib/appearance';
import {localDevDatabase} from '@/lib/postgres';
import {AppearanceEditor} from '@/components/admin/appearance';
import { PageHead } from '@/components/admin/page-head';
import {hasPermission} from '@/lib/admin/permissions';
export default async function AppearancePage(){
 const actor=await requireAdminPage();
 const canEdit=hasPermission(actor.role,'settings.manage',actor.permissions);
 if(!canEdit)assertAdminPagePermission(actor,'settings.read');
 const value=appearanceFromSettings(await readSettings());
 return <><PageHead breadcrumb="Control room / Appearance" title="Make this space yours" intro={canEdit?'Branding, theme, banners, footer and navigation. Save publishes the complete configuration in one audited transaction.':'View only. Your role cannot edit appearance.'} /><fieldset disabled={!canEdit}><AppearanceEditor initial={value} localUploads={localDevDatabase()}/></fieldset></>;
}
