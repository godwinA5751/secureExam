/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    // pdfjs-dist mentions the Node-only "canvas" package; the browser never needs it.
    config.resolve.alias.canvas = false;
    return config;
  },
};

module.exports = nextConfig;