import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  transpilePackages: ['@sugami/shared', '@sugami/ui'],
};

export default nextConfig;
