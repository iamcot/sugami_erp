import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  transpilePackages: ['@sugami/shared', '@sugami/ui'],
  // Same-origin API: the browser calls /api/*, Next forwards to the NestJS API, so the
  // session cookie stays first-party.
  async rewrites() {
    const api = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';
    return [{ source: '/api/:path*', destination: `${api}/api/:path*` }];
  },
};

export default nextConfig;
