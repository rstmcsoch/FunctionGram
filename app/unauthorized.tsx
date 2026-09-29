import Link from 'next/link';
export default function Unauthorized() {
  return <main className="setup-page"><section className="setup-card"><h1>Sign in to continue</h1><p>Sign in to RSTMC with your verified admin account, then return to this address.</p><Link className="inline-flex min-h-11 items-center underline" href="/">Open RSTMC to sign in</Link></section></main>;
}
