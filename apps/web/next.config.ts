import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import type { NextConfig } from 'next';

loadEnv({ path: path.resolve(__dirname, '../../.env.local'), override: false });

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: false,
  transpilePackages: ['@buranchi/shared', '@buranchi/ui'],
};

export default nextConfig;
