'use client';
import {useLabels} from '@/components/social/labels';
import Link from 'next/link';
export default function Unauthorized() {
 const t=useLabels();
  return <main className="setup-page"><section className="setup-card"><h1>{t("page.sign_in_to_continue")}</h1><p>{t("page.sign_in_to_rstmc_with_your_verified_admin_account_then_return_to_")}</p><Link className="inline-flex min-h-11 items-center underline" href="/">{t("page.open_rstmc_to_sign_in")}</Link></section></main>;
}
