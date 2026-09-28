"use client";

import { useEffect } from "react";

/**
 * Route-level error boundary: a throw while rendering any page is caught here
 * and turned into a retryable state instead of a blank screen or a white
 * crash overlay.
 */
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]); // captured by Next in production
  return (
    <main className="setup-page">
      <section className="setup-card" role="alert">
        <h2 className="setup-title">Something went wrong</h2>
        <p>The page could not be loaded. Your data is safe — try again in a moment.</p>
        <button type="button" className="primary-button wide" style={{ display: "inline-block" }} onClick={reset}>Try again</button>
      </section>
    </main>
  );
}
