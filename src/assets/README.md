# Bundled assets

## InterTight-Bold.ttf

Inter Tight Bold, the display face the hosted client sites already use via
`next/font`. Bundled here as a **TTF** because Satori (which backs
`next/og`'s `ImageResponse`) cannot read the WOFF2 that `next/font` emits, and
without a real bold the generated wordmark falls back to a regular weight and
reads as a placeholder rather than a mark.

- Source: `https://fonts.gstatic.com/s/intertight/v9/` (Google Fonts, `wght@700`)
- License: SIL Open Font License 1.1 — full text in `InterTight-OFL.txt`,
  which must stay alongside the font file for redistribution to be valid.

Read at runtime by `src/lib/wordmark-image.tsx`. That read happens by path,
which the Next build tracer cannot follow, so the routes that need it are
listed under `outputFileTracingIncludes` in `next.config.ts` — if a new route
starts rendering wordmarks, add it there or the font will be missing from the
deployed bundle.
