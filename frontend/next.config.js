
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  webpack: (config) => {
    // pdfjs-dist mentions the Node-only "canvas" package;
    // the browser never needs it.
    config.resolve.alias.canvas = false;
    return config;
  },

  async rewrites() {
    const apiTarget = process.env.API_PROXY_TARGET;

    if (!apiTarget) return [];

    return [
      {
        source: "/api/:path*",
        destination: `${apiTarget.replace(/\/$/, "")}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;