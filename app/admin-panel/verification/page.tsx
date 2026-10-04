import { requireAdminPage } from '@/lib/admin/guard';
import { getPool } from '@/lib/postgres';
import { PageHead } from '@/components/admin/page-head';
import { overview } from '@/lib/verification';
import { VerificationDesk } from '@/components/admin/verification';

export default async function VerificationPage() {
  const actor = await requireAdminPage();
  const data = await overview(await getPool());
  return <>
    <PageHead breadcrumb="Control room / Verification" title="Verification" intro="Blue, Grey, and Golden. Names stay those three words. Grey and Golden stay cancellable for 48 hours and need a fresh 2-hour privileged check." />
    <VerificationDesk role={actor.role} data={data as never} />
  </>;
}
