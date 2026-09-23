import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthForm, VerificationForm } from '@/components/social/auth-form';

export const metadata: Metadata = { title: 'Verify your email — RSTMC', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function VerifyEmail({ searchParams }: { searchParams: Promise<{ error?: string; verified?: string }> }) {
  const params = await searchParams;
  return <main className="setup-page"><section className="setup-card">
    <Link href="/" className="brand" aria-label="RSTMC home">RSTMC<span>.</span></Link>
    {params.error ? <>
      <p role="alert">This verification link is invalid or has expired. Request a new one below.</p>
      <VerificationForm />
    </> : params.verified === '1' ? <AuthForm initialNotice="Email verified. Sign in to continue." /> : <VerificationForm />}
  </section></main>;
}
