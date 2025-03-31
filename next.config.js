/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: [
      'images.unsplash.com',
      'tailwindcss.com',
      'widget.getyourguide.com'
    ],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  // Fix for dynamic params error
  output: "standalone",
  webpack: (config) => {
    config.resolve.fallback = { fs: false, net: false, tls: false };
    return config;
  },
  async redirects() {
    return [
      {
        source: '/safety-report', // The path in your Next.js app
        destination: 'https://trustplace.app', // The external WordPress URL
        permanent: true, // Use true for permanent redirect (SEO friendly)
      },
      // Add other redirects here if needed
    ]
  },
};

module.exports = nextConfig; 