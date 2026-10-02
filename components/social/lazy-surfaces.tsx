"use client";
import {LoaderCircle} from "lucide-react";

/**
 * Placeholder shown while a code-split surface is fetched. Kept deliberately
 * tiny: it is the only thing the initial bundle pays for the surfaces the user
 * has not opened yet.
 */
export function IconSpinner() {
  return <div className="loading-row" role="status" aria-hidden="true"><LoaderCircle className="spin" size={22} /></div>;
}
