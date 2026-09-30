'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BarChart3, BookOpen, Download, ExternalLink, FileText, Images, LayoutDashboard, Megaphone,
  Menu, Palette, ScrollText, ShieldAlert, ShieldCheck, Tags, ToggleRight, Users, Wrench, X,
} from 'lucide-react';
import { Avatar } from './avatar';
import { Badge } from './badge';

export type AdminNavItem = { label: string; href: string; icon: string; group: string; external?: boolean };

const ICONS = {
  LayoutDashboard, Users, FileText, Palette, ToggleRight, Tags, Images, ShieldAlert, ScrollText,
  ShieldCheck, Megaphone, BarChart3, Download, Wrench, BookOpen, ExternalLink,
} as const;
type IconName = keyof typeof ICONS;

function Wordmark() {
  return <span className="admin-wordmark">RSTMC<span className="admin-wordmark-dot">.</span></span>;
}

export function AdminNav({ items, email, role, homeHref }: { items: AdminNavItem[]; email: string; role: string; homeHref: string }) {
  const pathname = usePathname() || homeHref;
  const [open, setOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement | null>(null);
  const closeButton = useRef<HTMLButtonElement | null>(null);
  const groups = items.reduce<{ label: string; items: AdminNavItem[] }[]>((all, item) => {
    const group = all.find((entry) => entry.label === item.group);
    if (group) group.items.push(item);
    else all.push({ label: item.group, items: [item] });
    return all;
  }, []);

  const close = useCallback((returnFocus = true) => {
    setOpen(false);
    if (returnFocus) menuButton.current?.focus();
  }, []);

  // The drawer is a navigation surface: Escape always closes it and the page
  // behind it must not scroll while it covers the screen.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    document.addEventListener('keydown', onKeyDown);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButton.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previous;
    };
  }, [open, close]);

  const isActive = (item: AdminNavItem) => item.href === homeHref ? pathname === homeHref : pathname === item.href || pathname.startsWith(item.href + '/');

  return <>
    <div className="admin-topbar">
      <button ref={menuButton} type="button" className="admin-menu-button" aria-label="Open navigation" aria-expanded={open} aria-controls="admin-navigation" onClick={() => setOpen(true)}>
        <Menu aria-hidden="true" focusable="false" />
      </button>
      <Wordmark />
    </div>
    {open ? <div className="admin-drawer-backdrop" onClick={() => close()} aria-hidden="true" /> : null}
    <aside id="admin-navigation" className={`admin-sidebar${open ? ' is-open' : ''}`}>
      <div className="admin-sidebar-head">
        <Wordmark />
        <button ref={closeButton} type="button" className="admin-menu-button admin-drawer-close" aria-label="Close navigation" onClick={() => close()}>
          <X aria-hidden="true" focusable="false" />
        </button>
      </div>
      <nav className="admin-nav" aria-label="Admin navigation">
        {groups.map(group => <div className="admin-nav-group" role="group" aria-label={group.label} key={group.label}>
          <p className="admin-nav-group-label">{group.label}</p>
          {group.items.map(item => {
            const Icon = ICONS[(item.icon as IconName) in ICONS ? (item.icon as IconName) : 'FileText'];
            const active = isActive(item);
            return <Link key={item.href} href={item.href} className="admin-nav-link" aria-current={active ? 'page' : undefined} aria-label={item.label} title={item.label} onClick={() => { if (open) setOpen(false); }}>
              <Icon className="admin-nav-icon" strokeWidth={1.75} aria-hidden="true" focusable="false" />
              <span className="admin-nav-label">{item.label}</span>
              {item.external ? <ExternalLink className="admin-nav-external" strokeWidth={1.75} aria-hidden="true" focusable="false" /> : null}
            </Link>;
          })}
        </div>)}
      </nav>
      <div className="admin-account">
        <Avatar seed={email} size={40} />
        <div className="admin-account-text">
          <p className="admin-account-email">{email}</p>
          <Badge tone="primary">{role}</Badge>
        </div>
      </div>
    </aside>
  </>;
}
