'use client';
import {useLabels} from '@/components/social/labels';
import Link from "next/link";

export default function NotFound() {
 const t=useLabels();
  return (
    <main className="setup-page">
      <section className="setup-card">
        <p role="alert">{t("page.this_page_does_not_exist_404_")}</p>
        <Link href="/" className="primary-button wide" style={{ display: "inline-block", textAlign: "center" }}>{t("page.back_to_home")}</Link>
      </section>
    </main>
  );
}
