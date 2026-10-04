// Baseline browser-hardening headers. Values only — no secrets, roles, or
// account data. Applied to the public site and the admin panel so a normal
// session, View Source, or desktop DevTools cannot be framed, sniff a payload,
// or keep an admin document in a shared cache.

export const BASELINE_SECURITY_HEADERS: { key: string; value: string }[] = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
  { key: 'Origin-Agent-Cluster', value: '?1' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "media-src 'self' blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https:",
      "worker-src 'self' blob:",
      "manifest-src 'self'",
    ].join('; '),
  },
];

export const ADMIN_SECURITY_HEADERS: { key: string; value: string }[] = [
  { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
  { key: 'Cache-Control', value: 'private, no-store, max-age=0' },
  { key: 'Pragma', value: 'no-cache' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
];
