import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthForm, VerificationForm } from '@/components/social/auth-form';

export const metadata: Metadata = { title: 'Verify your email — RSTMC', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function VerifyEmail({ searchParams }: { searchParams: Promise<{ error?: string; verified?: string; changed?: string; deleted?: string }> }) {
  const params = await searchParams;
  return <main className="setup-page"><section className="setup-card">
    <Link href="/" className="brand" aria-label="RSTMC home">RSTMC<span>.</span></Link>
    {params.deleted === '1' ? <>
      <h2 className="setup-title">Your account was deleted</h2>
      <p role="status">Your profile, posts, and messages have been removed. Thanks for spending time with us.</p>
      <Link href="/" className="primary-button wide" style={{ display: 'inline-block', textAlign: 'center' }}>Go home</Link>
    </> : params.error ? <p role="alert">This link is invalid or has expired. Please try again from the email you received.</p>
      : params.changed === '1' ? <AuthForm initialNotice="Your email address was updated. Sign in with it." />
        : params.verified === '1' ? <AuthForm initialNotice="Email verified. Sign in to continue." />
          : <VerificationForm />}
  </section></main>;
}

