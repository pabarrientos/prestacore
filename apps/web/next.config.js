/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@prestamos/shared'],
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://api:3001/api/:path*',
      },
    ];
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': require('path').resolve(__dirname, 'src'),
      '@prestamos/shared': require('path').resolve(__dirname, '../../packages/shared/src'),
    };
    return config;
  },
};

module.exports = nextConfig;
