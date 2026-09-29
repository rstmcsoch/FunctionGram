import Link from 'next/link';
export default function Forbidden() {
  return <main className="setup-page"><section className="setup-card"><h1>Access denied</h1><p>Administrator access is required. Your account does not have permission to view this page.</p><Link className="inline-flex min-h-11 items-center underline" href="/">Return to RSTMC</Link></section></main>;
}
