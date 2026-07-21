# HV Auto Glass Denver — Landing Page

A self-contained, conversion-optimized redesign of the HighLevel landing page at
`quote.hvautoglassdenver.com`. Single file, no build step, no dependencies —
open `hv-auto-glass-denver.html` in any browser or drop it on any host
(Vercel, Netlify, S3, a plain web server).

## What's in it

- Dark, premium reinterpretation of the yellow/black brand
- Above-the-fold quote form (demo) + click-to-call
- **$0-deductible / Colorado insurance hook** as the primary conversion lever
- Services grid, 3-step process, Google-style reviews, branded SVG service-area map
- Lifetime-warranty risk reversal, objection-handling FAQ, sticky mobile call bar
- Fully responsive; light/dark theme aware; accessible focus states

## Going live

1. **Form:** replace the `<form id="quoteForm">` block (in the hero quote card)
   with your HighLevel form embed. The `.embed-note` marker shows where.
2. **Reviews:** the three review cards and the "4.9 / 200+" counts are
   illustrative placeholders — swap in real text/counts from your Google
   Business Profile, or embed a live reviews widget.
3. **Map:** the SVG map is a branded stand-in. Replace with a Google Maps
   embed if you want a live interactive map (note: external embeds won't work
   inside the Claude artifact preview, but work fine on your own host).
4. **Phone / claims:** all CTAs point to `tel:+17202320320`. Search-replace to
   change.

## Notes on the CRO decisions

See the accompanying conversation for the full rationale. The headline change
from the original is leading with **"we come to you — often $0 with insurance"**
instead of a long service list, and surfacing Colorado's near-zero-deductible
glass coverage as a dedicated band rather than burying it as "insurance
preferred shop."
