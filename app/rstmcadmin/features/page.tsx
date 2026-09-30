import {assertAdminPagePermission,requireAdminPage} from '@/lib/admin/guard';
import {loadSettings} from '@/lib/admin/core';
import {getPool} from '@/lib/postgres';
import {featureConfig} from '@/lib/features';
import {FeatureEditor} from '@/components/admin/features';
export default async function FeaturePage(){const actor=await requireAdminPage();assertAdminPagePermission(actor,'settings.manage');return <><p className="admin-eyebrow">Control room / Features</p><h1>Features & availability</h1><FeatureEditor initial={featureConfig(await loadSettings(await getPool()))}/></>;}
