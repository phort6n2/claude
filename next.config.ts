import type { NextConfig } from "next";

// sharp's linux-x64 native binaries, forced into every function that touches
// image processing. The build tracer misses the transitively-optional
// @img/* packages on some routes, and the function then dies at module load
// with ERR_DLOPEN_FAILED (libvips-cpp.so not found) — which took the site
// importer down in production while every local build and dev run passed.
// Same disease as the wordmark font below: runtime files the tracer cannot
// see must be listed by hand.
const SHARP_FILES = [
  './node_modules/sharp/**',
  './node_modules/@img/sharp-linux-x64/**',
  './node_modules/@img/sharp-libvips-linux-x64/**',
];

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
    '/api/clients/[id]/photos': ['./src/assets/**', ...SHARP_FILES],
    '/api/portal/photos': ['./src/assets/**', ...SHARP_FILES],
    '/api/clients/[id]/import-site': SHARP_FILES,
    '/api/clients/[id]/logo': SHARP_FILES,
    '/api/clients/[id]': SHARP_FILES,
    '/api/admin/mirror-photos': SHARP_FILES,
    '/api/widget/photo': SHARP_FILES,
  },
};

export default nextConfig;
