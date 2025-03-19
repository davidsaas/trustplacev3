import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable static optimization where possible
  swcMinify: true,
  
  // Add image domains if you're using next/image
  images: {
    domains: ['images.unsplash.com'], // Add any other domains you use
  },

  // Optional: Add headers for security
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'origin-when-cross-origin',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
