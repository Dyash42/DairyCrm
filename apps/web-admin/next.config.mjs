/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@jharanai/shared'],
  experimental: {
    typedRoutes: false,
  },
};

export default nextConfig;
