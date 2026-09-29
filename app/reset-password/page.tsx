import {getTranslator} from '@/lib/public-labels';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ResetPasswordForm } from '@/components/social/reset-password-form';

export async function generateMetadata():Promise<Metadata>{const t=await getTranslator();return {title:t('reset.title'),robots:{index:false,follow:false}};}
export const dynamic = 'force-dynamic';

export default async function ResetPassword({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
 const t=await getTranslator();
  const params = await searchParams;
  return <main className="setup-page"><section className="setup-card">
    <Link href="/" className="brand" aria-label={t("page.rstmc_home")}>{t("page.rstmc")}<span>{t("page._")}</span></Link>
    {params.error || !params.token
      ? <>
        <p role="alert">{t("page.this_reset_link_is_invalid_or_has_expired_reset_links_work_once_a")}</p>
        <Link href="/" className="primary-button wide" style={{ display: 'inline-block', textAlign: 'center' }}>{t("page.back_to_sign_in")}</Link>
      </>
      : <ResetPasswordForm token={params.token} />}
  </section></main>;
}
