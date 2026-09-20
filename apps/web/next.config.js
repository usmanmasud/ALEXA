/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXUS_API_URL: process.env.NEXUS_API_URL ?? "http://localhost:4000",
  },
};

module.exports = nextConfig;
