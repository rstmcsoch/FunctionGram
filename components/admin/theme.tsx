'use client';

/** Admin/control-panel theme controller (single source of truth).
 *
 * The panel has its own theme channel, separate from the public site:
 *
 *   - the inline script below stamps `data-admin-theme` (the resolved light or
 *     dark palette) and `data-admin-theme-mode` (light | dark | system) on
 *     <html> before the first paint, so there is no flash;
 *   - the store keeps both attributes, `localStorage` and every mounted
 *     toggle in sync, follows the OS while the mode is `system`, and removes
 *     the attributes again when the last admin view unmounts so a
 *     client-side navigation to the public site can never inherit them;
 *   - the toggle's *visual* state is driven by those attributes in
 *     `admin-theme.css`, so it is correct at first paint and never depends on
 *     React having hydrated.
 *
 * The public site keeps its own `rstmc-theme` key and `data-theme` attribute,
 * so switching the admin theme changes nothing outside the admin panel.
 */

import { useEffect, useSyncExternalStore } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';

export type AdminTheme = 'light' | 'dark' | 'system';
export type ResolvedAdminTheme = 'light' | 'dark';

const STORAGE_KEY = 'rstmc-admin-theme';
const ATTRIBUTE = 'data-admin-theme';
const MODE_ATTRIBUTE = 'data-admin-theme-mode';
const MEDIA_QUERY = '(prefers-color-scheme: dark)';

const isTheme = (value: unknown): value is AdminTheme => value === 'light' || value === 'dark' || value === 'system';

/** Executed while the SSR document parses, before any admin markup paints. */
export const THEME_SCRIPT = `(function(){var d=document.documentElement,m='system',t='light';try{var s=localStorage.getItem('${STORAGE_KEY}');if(s==='light'||s==='dark'||s==='system')m=s}catch(e){}t=m==='system'?(matchMedia('${MEDIA_QUERY}').matches?'dark':'light'):m;d.setAttribute('${ATTRIBUTE}',t);d.setAttribute('${MODE_ATTRIBUTE}',m)})();`;

let mode: AdminTheme = 'system';
let resolved: ResolvedAdminTheme = 'light';
let started = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function systemTheme(): ResolvedAdminTheme {
  return typeof window !== 'undefined' && window.matchMedia(MEDIA_QUERY).matches ? 'dark' : 'light';
}

function apply() {
  if (typeof document === 'undefined') return;
  resolved = mode === 'system' ? systemTheme() : mode;
  document.documentElement.setAttribute(ATTRIBUTE, resolved);
  document.documentElement.setAttribute(MODE_ATTRIBUTE, mode);
}

function start() {
  if (started || typeof window === 'undefined') return;
  started = true;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isTheme(stored)) mode = stored;
  } catch { /* Storage may be blocked; keep following the system theme. */ }
  apply();
  window.matchMedia(MEDIA_QUERY).addEventListener('change', () => {
    if (mode !== 'system') return;
    apply();
    emit();
  });
  window.addEventListener('storage', event => {
    if (event.key !== STORAGE_KEY || !isTheme(event.newValue) || event.newValue === mode) return;
    mode = event.newValue;
    apply();
    emit();
  });
}

// Runs in the browser bundle before React's first client render.
if (typeof window !== 'undefined') start();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Persist and apply a theme choice. */
export function setAdminTheme(next: AdminTheme) {
  if (!isTheme(next) || next === mode) return;
  mode = next;
  try { window.localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
  apply();
  emit();
}

function getModeSnapshot() { return mode; }
function getModeServerSnapshot(): AdminTheme { return 'system'; }
function getResolvedSnapshot() { return resolved; }
function getResolvedServerSnapshot(): ResolvedAdminTheme { return 'light'; }

/** The stored choice: light, dark or system. */
export function useAdminThemeMode(): AdminTheme {
  return useSyncExternalStore(subscribe, getModeSnapshot, getModeServerSnapshot);
}

/** The palette actually painted right now. */
export function useResolvedAdminTheme(): ResolvedAdminTheme {
  return useSyncExternalStore(subscribe, getResolvedSnapshot, getResolvedServerSnapshot);
}

/** Inline, pre-paint theme script. Rendered once per admin document. */
export function AdminThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />;
}

/** Keeps <html> themed while an admin view is mounted and cleans up after it. */
export function AdminThemeScope() {
  useEffect(() => {
    start();
    apply();
    // Returning to the public site (client-side) must not keep admin tokens.
    return () => {
      document.documentElement.removeAttribute(ATTRIBUTE);
      document.documentElement.removeAttribute(MODE_ATTRIBUTE);
    };
  }, []);
  return <AdminThemeScript />;
}

const OPTIONS: { value: AdminTheme; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

/** Light / Dark / System segmented control (sidebar and mobile drawer). */
export function ThemeToggle() {
  const current = useAdminThemeMode();
  return (
    <div className="admin-theme-row">
      <p className="admin-theme-label" id="admin-theme-label">Theme</p>
      <div className="admin-theme-toggle" role="group" aria-labelledby="admin-theme-label">
        {OPTIONS.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            className="admin-theme-option"
            data-theme-value={value}
            aria-pressed={current === value}
            aria-label={`${label} theme`}
            title={`${label} theme`}
            onClick={() => setAdminTheme(value)}
          >
            <Icon aria-hidden="true" size={16} strokeWidth={1.75} />
            <span className="admin-theme-option-label">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Compact light/dark switch for the mobile top bar (44px touch target). */
export function ThemeToggleButton() {
  const resolvedTheme = useResolvedAdminTheme();
  const next = resolvedTheme === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      className="admin-topbar-button admin-theme-cycle"
      aria-label={`Switch to ${next} theme`}
      aria-pressed={resolvedTheme === 'dark'}
      title={`Switch to ${next} theme`}
      onClick={() => setAdminTheme(next)}
    >
      <span className="admin-theme-glyph" data-glyph="sun" aria-hidden="true">
        <Sun size={20} strokeWidth={1.75} />
      </span>
      <span className="admin-theme-glyph" data-glyph="moon" aria-hidden="true">
        <Moon size={20} strokeWidth={1.75} />
      </span>
    </button>
  );
}
