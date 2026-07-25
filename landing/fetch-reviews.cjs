#!/usr/bin/env node
/* Pulls the live Google rating, review count and top reviews for
   HV Auto Glass Denver, and writes them to landing/reviews.json.

   Designed to be called SPARINGLY — once a week from CI, not per page view.
   One Place Details request per run (plus one Text Search only the first
   time, to resolve the place id). The values are then baked into the static
   HTML by build-pages.cjs, so visitors never trigger an API call and the key
   is never exposed in the browser.

   Usage:
     GOOGLE_PLACES_API_KEY=xxx node landing/fetch-reviews.cjs
   Optional:
     PLACE_ID=ChIJ...     skip the lookup call (recommended once you have it)

   Fails safe: on any error it leaves the existing reviews.json untouched and
   exits 0, so a transient API problem can never blank the reviews on the site
   or break the weekly build.
*/

const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'reviews.json');
const KEY = process.env.GOOGLE_PLACES_API_KEY;
const BUSINESS = 'HV Auto Glass Denver, 1440 Sheridan Blvd, Denver, CO 80214';

function bail(msg) {
  console.error('fetch-reviews: ' + msg);
  console.error('fetch-reviews: leaving existing reviews.json untouched.');
  process.exit(0);                       // never fail the build
}

async function post(url, body, fieldMask) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': KEY,
      'X-Goog-FieldMask': fieldMask,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

async function get(url, fieldMask) {
  const res = await fetch(url, {
    headers: { 'X-Goog-Api-Key': KEY, 'X-Goog-FieldMask': fieldMask },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

(async () => {
  if (!KEY) bail('GOOGLE_PLACES_API_KEY is not set.');

  try {
    // 1. Resolve the place id (only when not supplied — saves a call every run)
    let placeId = process.env.PLACE_ID;
    if (!placeId) {
      const search = await post(
        'https://places.googleapis.com/v1/places:searchText',
        { textQuery: BUSINESS, maxResultCount: 1 },
        'places.id,places.displayName,places.formattedAddress'
      );
      const hit = search.places && search.places[0];
      if (!hit) bail('Text Search returned no match for the business.');
      placeId = hit.id;
      console.log(`resolved place id: ${placeId}  (${hit.displayName?.text} — ${hit.formattedAddress})`);
      console.log('→ set PLACE_ID to this value to skip the lookup on future runs.');
    }

    // 2. One Place Details call. Narrow field mask = cheapest possible request.
    const d = await get(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
      'rating,userRatingCount,googleMapsUri,reviews'
    );

    if (typeof d.rating !== 'number' || typeof d.userRatingCount !== 'number') {
      bail('Response did not include rating/userRatingCount.');
    }

    // 3. Keep the strongest 5-star reviews that are substantial enough to read well
    const reviews = (d.reviews || [])
      .filter(r => r.rating >= 5 && r.text && r.text.text)
      .map(r => ({
        author: (r.authorAttribution && r.authorAttribution.displayName) || 'Google user',
        rating: r.rating,
        text: r.text.text.replace(/\s+/g, ' ').trim(),
        when: r.relativePublishTimeDescription || '',
      }))
      .filter(r => r.text.length >= 60 && r.text.length <= 400)
      .slice(0, 3);

    const out = {
      rating: Math.round(d.rating * 10) / 10,
      count: d.userRatingCount,
      mapsUri: d.googleMapsUri || 'https://maps.google.com/?cid=13934619566903784372',
      reviews,
      fetchedAt: new Date().toISOString(),
      placeId,
    };

    // Sanity check before overwriting good data
    if (out.rating < 1 || out.rating > 5 || out.count < 1) bail('Implausible values returned.');

    fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
    console.log(`wrote ${path.relative(process.cwd(), OUT)}: ${out.rating}★ from ${out.count} reviews, ${reviews.length} quotes`);
  } catch (err) {
    bail(err.message);
  }
})();
