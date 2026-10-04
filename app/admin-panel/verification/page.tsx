import { requireAdminPage } from '@/lib/admin/guard';
import { getPool } from '@/lib/postgres';
import { PageHead } from '@/components/admin/page-head';
import { overview } from '@/lib/verification';
import { VerificationDesk } from '@/components/admin/verification';

export default async function VerificationPage() {
  const actor = await requireAdminPage();
  try {
    const data = await overview(await getPool());
    return <>
      <PageHead breadcrumb="Control room / Verification" title="Verification" intro="Blue, Grey, and Golden. Names stay those three words. Grey and Golden stay cancellable for 48 hours and need a fresh 2-hour privileged check." />
      <VerificationDesk role={actor.role} data={data} />
    </>;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Verification could not be loaded.';
    return <>
      <PageHead breadcrumb="Control room / Verification" title="Verification" intro="The verification desk could not be loaded." />
      <section className="admin-card"><h2>Verification could not load</h2><p>{message}</p></section>
    </>;
  }
}
