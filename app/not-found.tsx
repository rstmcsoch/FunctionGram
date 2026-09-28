import Link from "next/link";

export default function NotFound() {
  return (
    <main className="setup-page">
      <section className="setup-card">
        <p role="alert">This page does not exist (404).</p>
        <Link href="/" className="primary-button wide" style={{ display: "inline-block", textAlign: "center" }}>Back to home</Link>
      </section>
    </main>
  );
}
