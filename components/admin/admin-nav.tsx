'use client';

/** Admin shell navigation (redesign guide §6.2, §7, §10.3).
 *
 * VISUAL ONLY. The link set, order, labels, hrefs and permission filtering are
 * decided on the server and passed in unchanged; this component adds the
 * active state, the grouped presentation, the icon rail and the mobile drawer.
 * The same <nav> serves desktop and mobile, so links are never duplicated in
 * the DOM.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3, BookOpen, Download, ExternalLink, FileText, Images, LayoutDashboard,
  Megaphone, Menu, Palette, ScrollText, ShieldAlert, ShieldCheck, Tags, ToggleRight,
  Users, Wrench,
} from 'lucide-react';
import { Avatar } from './avatar';
import { Badge, toneFor } from './badge';
import { ThemeToggle, ThemeToggleButton } from './theme';

/** Decorative icons only; every one is aria-hidden (§11). */
const ICONS = {
  LayoutDashboard, Users, FileText, Palette, ToggleRight, Tags, Images, ShieldAlert,
  ScrollText, ShieldCheck, Megaphone, BarChart3, Download, Wrench, BookOpen, ExternalLink,
} as const;

export type AdminNavIcon = keyof typeof ICONS;
export type AdminNavItem = { label: string; href: string; icon: AdminNavIcon; match: 'exact' | 'prefix' | 'none'; external?: boolean };
export type AdminNavGroup = { label: string; items: AdminNavItem[] };

const FOCUSABLE = 'a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function AdminNav({ groups, wordmark, account }: {
  groups: AdminNavGroup[];
  wordmark: string;
  account: { email: string; role: string };
}) {
  const pathname = usePathname() || '';
  const [open, setOpen] = useState(false);
  const sidebar = useRef<HTMLElement | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);

  /** Escape, backdrop and link taps all return focus to the menu button. */
  const close = useCallback(() => {
    setOpen(false);
    trigger.current?.focus();
  }, []);

  // Leaving the mobile breakpoint must not strand a locked page behind an
  // invisible drawer.
  useEffect(() => {
    const query = window.matchMedia('(min-width: 768px)');
    const sync = () => { if (query.matches) setOpen(false); };
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  // On load (and route change) bring the active link into view inside the
  // sidebar's own scroll container; `nearest` never scrolls the page itself.
  useEffect(() => {
    sidebar.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const node = sidebar.current;
    if (!node) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusable = () => Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE));
    focusable()[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close(); return; }
      if (event.key !== 'Tab') return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, close]);

  // Exact for Overview, prefix for every other panel route (§6.2).
  const isActive = (item: AdminNavItem) => item.match === 'exact'
    ? pathname === item.href
    : item.match === 'prefix' && (pathname === item.href || pathname.startsWith(item.href + '/'));

  const brand = <span className="admin-brand">{wordmark}<span>.</span></span>;

  return <>
    <div className="admin-topbar">
      <button
        ref={trigger}
        type="button"
        className="admin-topbar-button"
        aria-label="Open navigation"
        aria-expanded={open}
        aria-controls="admin-sidebar"
        onClick={() => setOpen(value => !value)}
      ><Menu aria-hidden="true" size={22} strokeWidth={1.75} /></button>
      {brand}
      <ThemeToggleButton />
    </div>

    <button
      type="button"
      className="admin-backdrop"
      data-open={open}
      tabIndex={-1}
      aria-hidden="true"
      onClick={close}
    />

    <aside ref={sidebar} id="admin-sidebar" className="admin-sidebar" data-open={open}>
      {brand}
      <nav className="admin-nav" aria-label="Admin navigation">
        {groups.map(group => <div key={group.label} className="admin-nav-group" role="group" aria-label={group.label}>
          <p className="admin-nav-group-label">{group.label}</p>
          {group.items.map(item => {
            const Icon = ICONS[item.icon];
            return <Link
              key={item.href + item.label}
              href={item.href}
              prefetch={false}
              className="admin-nav-link"
              title={item.label}
              aria-label={item.label}
              aria-current={isActive(item) ? 'page' : undefined}
              onClick={() => setOpen(false)}
            >
              <Icon aria-hidden="true" size={18} strokeWidth={1.75} />
              <span className="admin-nav-label">{item.label}</span>
              {item.external && <ExternalLink className="admin-nav-external" aria-hidden="true" size={14} strokeWidth={1.75} />}
            </Link>;
          })}
        </div>)}
      </nav>
      <ThemeToggle />
      <div className="admin-account">
        <Avatar seed={account.email} email={account.email} size={40} />
        <span className="admin-account-body">
          <span className="admin-account-email" title={account.email}>{account.email}</span>
          <Badge tone={toneFor(account.role)}>{account.role}</Badge>
        </span>
      </div>
    </aside>
  </>;
}
