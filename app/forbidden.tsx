'use client';
import {useLabels} from '@/components/social/labels';
import Link from 'next/link';
export default function Forbidden() {
 const t=useLabels();
  return <main className="setup-page"><section className="setup-card"><h1>{t("page.access_denied")}</h1><p>{t("page.administrator_access_is_required_your_account_does_not_have_permi")}</p><Link className="inline-flex min-h-11 items-center underline" href="/">{t("page.return_to_rstmc")}</Link></section></main>;
}
