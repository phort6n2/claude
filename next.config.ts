import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '500mb',
    },
  },
  // The generated wordmark reads its font at runtime by path, which the build
  // tracer cannot see — without this the file is left out of the deployed
  // bundle and every wordmark 500s in production while working perfectly in
  // dev. Traced for the route that serves it and for the photo upload paths
  // that use it as a watermark.
  outputFileTracingIncludes: {
    '/api/clients/[id]/wordmark': ['./src/assets/**'],
    '/api/clients/[id]/photos': ['./src/assets/**'],
    '/api/portal/photos': ['./src/assets/**'],
  },
};

export default nextConfig;
