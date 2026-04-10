/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'logo.clearbit.com',
      },
      {
        // Yahoo Finance / Yimg CDN (company logos, chart images)
        protocol: 'https',
        hostname: 's.yimg.com',
      },
      {
        protocol: 'https',
        hostname: '*.yimg.com',
      },
    ],
  },
};

export default nextConfig;
