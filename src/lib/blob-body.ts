/**
 * Make a sharp output buffer safe to hand to Vercel Blob.
 *
 * THE BUG THIS EXISTS FOR, because the error message names nothing useful:
 *
 *     TypeError: ArrayBuffer: SharedArrayBuffer is not allowed
 *         at fetch (...)
 *
 * `@vercel/blob`'s `put()` uploads via `fetch`, and undici refuses a body
 * whose backing store is — or looks to it like — a SharedArrayBuffer. sharp
 * allocates its output from a pooled native allocator, so `.toBuffer()` can
 * hand back exactly that. Nothing about the image is wrong; the upload never
 * leaves the function.
 *
 * It failed silently in the worst way. Every call site wrapped `put()` in a
 * try/catch that returned a friendly "Upload failed. Please try again.", so a
 * shop owner photographing a cracked windscreen got a retry prompt that could
 * never succeed, and the only trace was one line in a server log. It broke
 * three things at once: the damage photo on the quote form, site photo
 * uploads, and the imported-photo backfill — which is why shops that had been
 * "backfilled" still had logos hot-linked from their old CDN.
 *
 * The fix is two steps and both matter. `new Uint8Array(view)` copies into a
 * fresh ArrayBuffer — the TypedArray constructor always allocates a plain
 * %ArrayBuffer%, never a shared one. Then `Buffer.from(buffer, offset, len)`
 * wraps THAT exact ArrayBuffer without copying again, because `put()` wants a
 * Buffer. What it must not do is `Buffer.from(typedArray)`, which copies back
 * into Node's shared buffer pool and lands straight back on the bug.
 *
 * It costs one copy of an already-resized image, a rounding error next to the
 * re-encode that produced it.
 *
 * NOT needed for every upload — only for bytes that came out of sharp. A
 * buffer built from `fetch`'s own `arrayBuffer()` (call recordings, say) is
 * already backed by an ordinary ArrayBuffer and copying it would just waste
 * memory proportional to the file.
 */
export function toBlobBody(view: Uint8Array): Buffer {
  const copy = new Uint8Array(view)
  return Buffer.from(copy.buffer, copy.byteOffset, copy.byteLength)
}
