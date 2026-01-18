import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '500mb',
    },
  },
  // Enable instrumentation hook for automatic database setup on startup
  instrumentationHook: true,
};

export default nextConfig;
