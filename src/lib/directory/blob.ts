// ============================================
// DIRECTORY — BLOB STORAGE AVAILABILITY
// ============================================
// Vercel Blob authenticates two ways, and @vercel/blob v2 supports both:
//   • the classic static BLOB_READ_WRITE_TOKEN, or
//   • the newer token-less model — a connected store exposes BLOB_STORE_ID and
//     the SDK signs requests with the deployment's Vercel OIDC identity.
// The newer "connect store" flow only injects BLOB_STORE_ID (no static token),
// so every storage feature gates on *either* being present.

export function blobEnabled(): boolean {
  return !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID)
}
