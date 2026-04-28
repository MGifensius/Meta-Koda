import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import type { NextConfig } from 'next';

// Load env vars from the workspace root .env.local so the app can run without
// duplicating credentials inside apps/web. Existing process.env values win.
loadEnv({ path: path.resolve(__dirname, '../../.env.local'), override: false });

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // typedRoutes is intentionally disabled until later tasks land /dashboard
  // and other referenced routes; otherwise typecheck flags missing routes.
  typedRoutes: false,
  transpilePackages: ['@buranchi/shared', '@buranchi/ui'],
  turbopack: {
    // Match the webpack `extensionAlias` below so Turbopack can resolve `.js`
    // specifiers in the workspace packages back to their `.ts`/`.tsx` source.
    // Without this, Tailwind's @source globs find nothing in @buranchi/ui and
    // dev pages render unstyled.
    resolveExtensions: ['.tsx', '.ts', '.jsx', '.js', '.mjs', '.mts', '.json'],
  },
  webpack(config) {
    // The internal packages export ESM with `.js` specifiers that resolve to
    // `.ts`/`.tsx` source files. Tell webpack to fall back to TS extensions.
    config.resolve = config.resolve ?? {};
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    };
    return config;
  },
};

export default nextConfig;
