# Bundled assets

## fonts/Inter-latin.woff2, fonts/InterTight-latin.woff2

The two webfonts the whole app renders in, loaded by `next/font/local` from
`src/app/layout.tsx`.

They are bundled rather than fetched by `next/font/google` because that
downloads from `fonts.gstatic.com` **at build time**. That download failed once
on Vercel and took a production deploy with it — the identical commit having
built green on the branch two seconds earlier. A build that reaches the network
fails for reasons that have nothing to do with the commit.

- Variable fonts, latin subset only — byte-for-byte what `subsets: ["latin"]`
  was fetching before, so nothing about the rendering changed.
- Source: Google Fonts `css2?family=Inter:wght@100..900` and
  `Inter+Tight:wght@100..900`, the `/* latin */` face of each.
- License: SIL Open Font License 1.1 — `fonts/OFL.txt`, which must stay
  alongside the font files for redistribution to be valid.

Refreshing them means re-reading that CSS: Google revs the URL when the font
revs (`/inter/v20/`, `/intertight/v9/`), so the hashes are not stable.

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
