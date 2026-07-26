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
     PLACE_ID=ChIJ...     override the baked-in place id below

   The place id is public information (it appears in Google Maps URLs), so it
   lives in the source. Only the API key is a secret.

   Fails safe: on any error it leaves the existing reviews.json untouched and
   exits 0, so a transient API problem can never blank the reviews on the site
   or break the weekly build.
*/

const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'reviews.json');
const KEY = process.env.GOOGLE_PLACES_API_KEY;
const BUSINESS = 'HV Auto Glass Denver, 1440 Sheridan Blvd, Denver, CO 80214';
// An earlier id, ChIJQ9b9Z0iHa4cRhCqizeWC2IM, resolved to "All Nations Autos"
// at 1395 Sheridan Blvd — a different business — and its 3.9 stars were
// published across the whole site before anyone noticed. Hence the checks
// below: a wrong place id is otherwise completely silent, because the numbers
// it returns look perfectly plausible.
const DEFAULT_PLACE_ID = 'ChIJBUQzsIiLxUMRtPOB1aq2YcE';

// The listing must be an auto glass business...
const EXPECT_NAME = /(auto\s*glass|windshield)/i;
// ...and it must be in Colorado. Name alone would happily accept an auto glass
// shop on the other side of the world.
const EXPECT_ADDRESS = /(,\s*CO\b|Colorado)/i;

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
    // 1. Resolve the place id. Normally the baked-in one is used and this
    //    costs nothing; the Text Search fallback only runs if it's cleared.
    let placeId = process.env.PLACE_ID || DEFAULT_PLACE_ID;
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
      // displayName/formattedAddress ride along free — `reviews` already puts
      // this request in the highest SKU tier — and let the log confirm we hit
      // the right business.
      'displayName,formattedAddress,rating,userRatingCount,googleMapsUri,reviews'
    );
    const placeName = (d.displayName && d.displayName.text) || '';
    console.log(`place ${placeId} → ${placeName} — ${d.formattedAddress}`);

    // Refuse to publish a listing that is not this business, in this state.
    const addr = d.formattedAddress || '';
    const wrong = !EXPECT_NAME.test(placeName) ? 'the name is not an auto glass business'
                : !EXPECT_ADDRESS.test(addr)   ? 'the address is not in Colorado'
                : null;
    if (wrong) {
      bail(`resolved listing is "${placeName}" (${addr}) — ${wrong}. Refusing to ` +
           `publish its rating and reviews. Check the place id.`);
    }

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
