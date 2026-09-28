"use client";

import { useEffect } from "react";

/**
 * Global error boundary: catches errors thrown in the root layout itself.
 * This file must provide its own <html> and <body>.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]); // captured by Next in production
  return (
    <html lang="en">
      <head>
        <title>RSTMC — Something went wrong</title>
      </head>
      <body className="antialiased">
        <main className="setup-page">
          <section className="setup-card" role="alert">
            <h2 className="setup-title">Something went wrong</h2>
            <p>The application could not start. Please refresh the page.</p>
            <button type="button" className="primary-button wide" style={{ display: "inline-block" }} onClick={reset}>Reload</button>
          </section>
        </main>
      </body>
    </html>
  );
}
