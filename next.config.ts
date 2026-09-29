import type { NextConfig } from "next";

import { ADMIN_BASE_PATH } from "./lib/admin/config";

const nextConfig: NextConfig = {
  // The embedded dev database must run unbundled (its filesystem layer reads
  // its own wasm assets at runtime). It is only used by `next dev` without a
  // DATABASE_URL; production deployments never touch it.
  experimental: { authInterrupts: true },
  async headers() {
    return [ADMIN_BASE_PATH + '/:path*', '/api/admin/:path*'].map(source => ({
      source,
      headers: [
        { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        { key: 'Cache-Control', value: 'private, no-store' },
      ],
    }));
  },
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;
