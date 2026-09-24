import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The embedded dev database must run unbundled (its filesystem layer reads
  // its own wasm assets at runtime). It is only used by `next dev` without a
  // DATABASE_URL; production deployments never touch it.
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;
