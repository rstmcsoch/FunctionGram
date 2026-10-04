import {assertAdminPagePermission,requireAdminPage} from '@/lib/admin/guard';
import {loadSettings} from '@/lib/admin/core';
import {getPool} from '@/lib/postgres';
import {featureConfig} from '@/lib/features';
import {FeatureEditor} from '@/components/admin/features';
import { PageHead } from '@/components/admin/page-head';
export default async function FeaturePage(){const actor=await requireAdminPage();assertAdminPagePermission(actor,'settings.manage');return <><PageHead breadcrumb="Control room / Features" title="Features & availability" /><FeatureEditor initial={featureConfig(await loadSettings(await getPool()))}/></>;}
