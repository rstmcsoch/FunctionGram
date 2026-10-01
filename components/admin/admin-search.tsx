'use client';

import Link from 'next/link';
import { Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { AdminSearchItem } from '@/lib/admin/search-index';

function normalize(value: string) {
  return value.trim().toLocaleLowerCase('en-US').replace(/\s+/g, ' ');
}

function score(item: AdminSearchItem, query: string) {
  const title = normalize(item.title);
  const path = normalize(item.path.join(' '));
  const keywords = normalize((item.keywords ?? []).join(' '));
  const haystack = [title, path, keywords].join(' ');
  const terms = query.split(' ').filter(Boolean);
  let total = 0;

  for (const term of terms) {
    if (title === term) total += 1000;
    else if (title.startsWith(term)) total += 700;
    else if (title.includes(term)) total += 500;
    else if (path.includes(term)) total += 300;
    else if (keywords.includes(term)) total += 120;
    else if (!haystack.includes(term)) return -1;
  }

  total -= item.path.length * 3;
  total -= Math.min(item.title.length, 80) * 0.05;
  return total;
}

function Tree({ path }: { path: string[] }) {
  return <span className="admin-search-tree" aria-label={path.join(' / ')}>
    {path.map((part, index) => (
      <span className="admin-search-tree-line" key={part + index}>
        {index === 0 ? part : '│  ' + '   '.repeat(Math.max(0, index - 1)) + '└── ' + part}
      </span>
    ))}
  </span>;
}

export function AdminUniversalSearch({ items }: { items: AdminSearchItem[] }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement | null>(null);
  const input = useRef<HTMLInputElement | null>(null);

  const results = useMemo(() => {
    const normalized = normalize(query);
    if (!normalized) return [];

    return items
      .map(entry => ({ entry, score: score(entry, normalized) }))
      .filter(result => result.score >= 0)
      .sort((a, b) =>
        b.score - a.score ||
        a.entry.path.length - b.entry.path.length ||
        a.entry.title.localeCompare(b.entry.title),
      )
      .slice(0, 16)
      .map(result => result.entry);
  }, [items, query]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === 'k') {
        event.preventDefault();
        input.current?.focus();
        setOpen(true);
      }
      if (event.key === 'Escape' && document.activeElement === input.current) {
        setQuery('');
        setOpen(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  return <div className="admin-universal-search" ref={root}>
    <div className="admin-search-control">
      <Search aria-hidden="true" size={17} strokeWidth={1.8} />
      <input
        ref={input}
        type="search"
        value={query}
        placeholder="Search admin settings…"
        aria-label="Search admin settings"
        role="combobox"
        aria-expanded={open && Boolean(query)}
        aria-controls="admin-universal-search-results"
        autoComplete="off"
        onFocus={() => { if (query) setOpen(true); }}
        onChange={event => {
          setQuery(event.target.value);
          setOpen(Boolean(event.target.value.trim()));
        }}
      />
      {query && <button
        type="button"
        className="admin-search-clear"
        aria-label="Clear admin search"
        onClick={() => {
          setQuery('');
          input.current?.focus();
          setOpen(false);
        }}
      ><X aria-hidden="true" size={15} /></button>}
    </div>

    {open && query && <div
      className="admin-search-results"
      id="admin-universal-search-results"
      role="listbox"
      aria-label="Admin search results"
    >
      {results.length ? results.map((result, index) => (
        <Link
          key={result.href + '|' + result.path.join('|') + '|' + index}
          href={result.href}
          className="admin-search-result"
          role="option"
          aria-label={result.path.join(' / ')}
          onClick={() => {
            setOpen(false);
            setQuery('');
          }}
        >
          <Tree path={result.path} />
        </Link>
      )) : <p className="admin-search-empty">No matching setting or admin destination.</p>}
    </div>}
  </div>;
}
