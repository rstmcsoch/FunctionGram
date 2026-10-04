import type { NextConfig } from "next";

import { ADMIN_BASE_PATH } from "./lib/admin/config";
import { ADMIN_SECURITY_HEADERS, BASELINE_SECURITY_HEADERS } from "./lib/security-headers";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // The embedded dev database must run unbundled (its filesystem layer reads
  // its own wasm assets at runtime). It is only used by `next dev` without a
  // DATABASE_URL; production deployments never touch it.
  // Profile URLs are /<username> and usernames may contain dots (john.doe).
  // Do not add extension-based rewrites or skip-trailing-slash rules that
  // would treat dotted paths as static files.
  experimental: {
    authInterrupts: true,
    // The social shell (dialogs, dropdowns, tabs, carousels) imports these
    // icon/primitive packages heavily; rewriting the imports lets the bundler
    // include only the modules actually used.
    optimizePackageImports: ['lucide-react', 'radix-ui', 'date-fns'],
  },
  async headers() {
    const baseline = ['/', '/:path*'].map(source => ({
      source,
      headers: BASELINE_SECURITY_HEADERS,
    }));
    const admin = [ADMIN_BASE_PATH, ADMIN_BASE_PATH + '/:path*', '/api/admin/:path*'].map(source => ({
      source,
      headers: ADMIN_SECURITY_HEADERS,
    }));
    return [...baseline, ...admin];
  },
  serverExternalPackages: ["@electric-sql/pglite", "@libsql/kysely-libsql", "@libsql/client", "libsql"],
};

export default nextConfig;
