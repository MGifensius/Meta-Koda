import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    typedRoutes: true,
  },
  transpilePackages: ['@buranchi/shared', '@buranchi/ui'],
};

export default nextConfig;
