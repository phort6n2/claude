import type { NextConfig } from "next";

// EVERYTHING BELOW DEPENDS ON THE BUILD RUNNING ON WEBPACK — `next build
// --webpack` in package.json. Next 16 builds with Turbopack by default, and a
// Turbopack build SILENTLY IGNORES outputFileTracingIncludes. It is silent in
// the worst way: the trace still lists sharp's JS and its package.json, just
// not libvips-cpp.so, so the function deploys and then dies at module load
// with ERR_DLOPEN_FAILED. Every image feature in production — wordmarks,
// photo uploads, the white footer logo, the importer's mirroring — was broken
// this way, and the entries below had been sitting here for days doing
// nothing. Proof, if this ever needs re-checking: build both ways and read
// .next/server/app/**/route.js.nft.json — webpack lists
// @img/sharp-libvips-linux-x64/lib/libvips-cpp.so.8.18.3, Turbopack does not.
//
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
    // The wordmark route reaches sharp through wordmark-image, and was
    // 500ing on libvips in production with only its fonts listed here. Every
    // entry below was found the same way — in the runtime logs, after the
    // route had already failed in front of somebody. The list must cover
    // EVERY route that reaches sharp, directly or through a lib.
    '/api/clients/[id]/wordmark': ['./src/assets/**', ...SHARP_FILES],
    '/api/clients/[id]/photos': ['./src/assets/**', ...SHARP_FILES],
    '/api/portal/photos': ['./src/assets/**', ...SHARP_FILES],
    // Needs the fonts too: an imported photo is stamped on the way in, and a
    // shop with no logo is stamped with their generated wordmark, which reads
    // its font by path.
    '/api/clients/[id]/import-site': ['./src/assets/**', ...SHARP_FILES],
    '/api/clients/[id]/logo': SHARP_FILES,
    '/api/clients/[id]': SHARP_FILES,
    '/api/admin/derive-footer-logos': SHARP_FILES,
    '/api/admin/restamp-photos': ['./src/assets/**', ...SHARP_FILES],
    '/api/admin/mirror-photos': SHARP_FILES,
    '/api/widget/photo': SHARP_FILES,
  },
};

export default nextConfig;
