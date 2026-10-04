import {assertAdminPagePermission,requireAdminPage} from '@/lib/admin/guard';
import {loadSettings} from '@/lib/admin/core';
import {getPool} from '@/lib/postgres';
import {featureConfig} from '@/lib/features';
import {FeatureEditor} from '@/components/admin/features';
import { PageHead } from '@/components/admin/page-head';
import {hasPermission} from '@/lib/admin/permissions';
export default async function FeaturePage(){
 const actor=await requireAdminPage();
 const canEdit=hasPermission(actor.role,'settings.manage',actor.permissions);
 if(!canEdit)assertAdminPagePermission(actor,'settings.read');
 return <><PageHead breadcrumb="Control room / Features" title="Features & availability" intro={canEdit?'':'View only. Your role cannot change feature rollout or primary navigation.'} />
  <fieldset disabled={!canEdit}><FeatureEditor initial={featureConfig(await loadSettings(await getPool()))}/></fieldset></>;
}
