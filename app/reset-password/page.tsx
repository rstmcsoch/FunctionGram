import type { Metadata } from 'next';
import Link from 'next/link';
import { ResetPasswordForm } from '@/components/social/reset-password-form';

export const metadata: Metadata = { title: 'Reset your password — RSTMC', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function ResetPassword({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const params = await searchParams;
  return <main className="setup-page"><section className="setup-card">
    <Link href="/" className="brand" aria-label="RSTMC home">RSTMC<span>.</span></Link>
    {params.error || !params.token
      ? <>
        <p role="alert">This reset link is invalid or has expired. Reset links work once and last 15 minutes.</p>
        <Link href="/" className="primary-button wide" style={{ display: 'inline-block', textAlign: 'center' }}>Back to sign in</Link>
      </>
      : <ResetPasswordForm token={params.token} />}
  </section></main>;
}
