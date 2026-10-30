import type { ContentPatch } from '@/lib/content-patch'

/**
 * Speedy Windshield Repair — Riverside County, and every address a live ad
 * points at, October 2026.
 *
 * TWO JOBS.
 *
 * 1. RIVERSIDE COUNTY, at the owner's request: a page for the county and for
 *    its ten largest cities by the 2020 census (Riverside, Moreno Valley,
 *    Corona, Murrieta, Temecula, Jurupa Valley, Menifee, Hemet, Indio,
 *    Perris). Indio is in the Coachella Valley, about seventy miles east of
 *    the rest — it is on the list because it is tenth, and the county page
 *    names the cities rather than claiming the whole county.
 *
 * 2. LANDING-PAGE PARITY. Every final URL on an ENABLED ad, asset group or
 *    sitelink in an ENABLED AGMP campaign (read 2026-10-30) was requested
 *    against /sites/speedy-windshield-repair. Ten paths had nothing behind
 *    them, so moving speedywindshield.com or la.speedywindshield.com onto the
 *    app would have 404'd live ads:
 *    - three flat city addresses the LA+OC campaign uses — Irvine, Orange
 *      County, Los Angeles County — become city pages, with copy, the same
 *      way as the Riverside ones;
 *    - six render an existing page at their own address, through aliases in
 *      code rather than redirects (see the note at the foot);
 *    - /insurance-claims renders the general claims page, which this patch
 *      switches on. It has no publish gate: its coverage copy is the reviewed
 *      per-state rule.
 *    The /windshield-crack-repair, /windshield-chip-repair, /auto-glass-repair
 *    and /auto-glass-replacement ads already resolved through SERVICE_ALIASES.
 *
 * THE COPY is about the PLACE — its roads, its weather, its neighbourhoods —
 * and claims only what this shop's own flags say, which the patch asserts
 * below so a changed flag refuses rather than publishing a sentence that is
 * no longer true: mobile (we come to you), rock chip repair (a chip can
 * usually be repaired), ADAS calibration. No timing, no insurance handling
 * (not asserted), no warranty, no shop in any of these cities, no phone
 * number. scripts/check-speedy-locations.ts runs every page through
 * copy-claims.ts with flags no more generous than these.
 */
export const SPEEDY_2026_10_LOCATIONS: ContentPatch = {
  id: 'speedy-2026-10-locations',
  title: 'Speedy: Riverside County pages, and a page for every live ad',
  client: 'speedy-windshield-repair',

  clientFields: [
    { field: 'offersMobileService', from: true, to: true },
    { field: 'offersWindshieldRepair', from: true, to: true },
    { field: 'offersRockChipRepair', from: true, to: true },
    { field: 'offersAdasCalibration', from: true, to: true },
  ],

  serviceAreasAdd: [
    'Riverside County',
    'Riverside',
    'Moreno Valley',
    'Corona',
    'Murrieta',
    'Temecula',
    'Jurupa Valley',
    'Menifee',
    'Hemet',
    'Indio',
    'Perris',
    'Orange County',
    'Irvine',
    'Los Angeles County',
  ],

  cityContent: [
    {
      city: 'Riverside County',
      heading: 'Mobile windshield service across Riverside County',
      body: 'Riverside County covers a lot of road, and these are the cities we work: Riverside, Corona and Jurupa Valley in the west; Moreno Valley, Perris and Menifee along the 215; Murrieta and Temecula, where the 215 meets the 15; Hemet in the San Jacinto Valley; and Indio in the Coachella Valley. Between the truck traffic on the 15, the 215, the 60 and the 91 and the summer heat inland, chipped and cracked windshields are an everyday problem here. We come to you — at home, at work, or wherever the car is parked — for chip repairs and windshield replacements, and we calibrate driver-assist cameras after a replacement. Not sure we reach you? Ask when you request your quote.',
    },
    {
      city: 'Riverside',
      heading: 'Windshield repair and replacement in Riverside',
      body: 'Riverside sits where the 91, the 60 and the 215 meet, and all three carry heavy truck traffic to and from the Inland Empire’s warehouses. Gravel and debris thrown up at freeway speed are what put most chips in a windshield here. We bring the repair or the replacement to you — your driveway in Arlington or La Sierra, the lot at work downtown, or a parking space near UC Riverside. A small chip can usually be repaired before it spreads, and Riverside’s summer heat is a reason not to wait: sun-heated glass meeting cold air-conditioning is how a chip becomes a crack. If your windshield carries a driver-assist camera, we calibrate it after the replacement.',
    },
    {
      city: 'Moreno Valley',
      heading: 'Windshield repair and replacement in Moreno Valley',
      body: 'Moreno Valley runs along the 60 between Riverside and the Badlands, with the 215 on its western side and March Air Reserve Base to the southwest. The distribution centers across the city keep the 60 and the 215 busy with trucks, and trucks are what throw the stones that chip a windshield. We come to you — at home, at work, or wherever the car is parked — for a chip repair or a full windshield replacement. Catch a chip while it is small and a repair is usually possible; leave it through a summer of hot afternoons and cold air-conditioning and it can spread into a crack. If your car has a camera behind the windshield, we calibrate it after the new glass goes in.',
    },
    {
      city: 'Corona',
      heading: 'Windshield repair and replacement in Corona',
      body: 'Corona’s commute is the 91, one of the busiest freeways in Southern California, where it crosses the 15 between Orange County and the Inland Empire. Stop-and-go traffic beside gravel trucks and road work is hard on a windshield. We bring the work to you, whether you are in South Corona, Eagle Glen or Dos Lagos, at home or at the office, so the car does not have to sit in 91 traffic to get fixed. A chip caught early can usually be repaired; one left alone tends to spread. And if your vehicle has a lane-keeping or emergency-braking camera, we calibrate it after a replacement so it reads the road correctly.',
    },
    {
      city: 'Murrieta',
      heading: 'Windshield repair and replacement in Murrieta',
      body: 'Murrieta is where the 15 and the 215 come together, so much of southwest Riverside County passes through it, along with the trucks running between San Diego and the Inland Empire. New construction across town adds gravel and grit to the roads. We come to your driveway, your office or wherever the car is parked, from Murrieta Hot Springs to the neighborhoods near the Santa Rosa Plateau. A small chip can usually be repaired before it spreads; a crack that has run across the glass means a replacement. When your windshield carries a driver-assist camera, we calibrate it after the replacement, because the camera has to be aimed correctly through the new glass.',
    },
    {
      city: 'Temecula',
      heading: 'Windshield repair and replacement in Temecula',
      body: 'Temecula stretches from Old Town and the 15 out through wine country along Rancho California Road. The 15 carries heavy traffic between San Diego and the Inland Empire, and the roads out to the wineries see their share of gravel and grit. We come to you — at home, at work, or wherever the car is parked in Temecula — for chip repairs and windshield replacements. Hot, dry summers are hard on a damaged windshield: the glass heats in the sun, cools under the air-conditioning, and a chip can spread into a crack. If your car has a camera behind the windshield, we calibrate it after the new glass is in.',
    },
    {
      city: 'Jurupa Valley',
      heading: 'Windshield repair and replacement in Jurupa Valley',
      body: 'Jurupa Valley brought Mira Loma, Rubidoux, Glen Avon and Pedley together when it became a city in 2011. It runs along the 60, with the 15 on its western side and some of the region’s largest warehouses in Mira Loma, which means a steady stream of trucks — the most common source of the stones that chip a windshield. We come to you, wherever the car is parked in Jurupa Valley. A chip caught while it is small can usually be repaired; once it has spread into a crack, the windshield needs replacing. If your vehicle has a driver-assist camera behind the glass, we calibrate it after a replacement.',
    },
    {
      city: 'Menifee',
      heading: 'Windshield repair and replacement in Menifee',
      body: 'Menifee brought Sun City, Menifee Lakes, Quail Valley and its other communities together as a city in 2008, and it has kept growing since. New housing tracts mean construction traffic and loose gravel, and the 215 through the middle of town carries commuters toward Riverside and Temecula. We come to you at home or at work in Menifee for a chip repair or a full windshield replacement. A chip is worth fixing while it is small, before the inland summer heat spreads it into a crack. If your car’s windshield carries a camera for lane-keeping or emergency braking, we calibrate it after the replacement.',
    },
    {
      city: 'Hemet',
      heading: 'Windshield repair and replacement in Hemet',
      body: 'Hemet sits in the San Jacinto Valley, with the 74 and the 79 as its main roads in and out and Diamond Valley Lake just to the southwest. Summer afternoons in the valley are hot, and a chipped windshield is under the most stress when sun-heated glass meets cold air-conditioning. We come to you — at home, at work, or wherever the car is parked in Hemet — for a chip repair before it spreads, or a full replacement once it has. If your vehicle has a driver-assist camera behind the windshield, we calibrate it after the replacement so lane-keeping and emergency braking read the road correctly.',
    },
    {
      city: 'Indio',
      heading: 'Windshield repair and replacement in Indio',
      body: 'Indio is in the Coachella Valley, along the 10, and its summers are among the hottest in California. Desert heat is hard on damaged glass: a windshield that bakes in a parking lot and then meets the air-conditioning can turn a small chip into a long crack, and windblown sand pits the glass over time. We come to you in Indio — at home, at work, or wherever the car is parked. A chip caught early can usually be repaired; a crack across the glass means a replacement. If your vehicle has a camera behind the windshield, we calibrate it after the new glass is in.',
    },
    {
      city: 'Perris',
      heading: 'Windshield repair and replacement in Perris',
      body: 'Perris sits on the 215 south of Moreno Valley, with Lake Perris to the northeast and the Ramona Expressway running east toward the San Jacinto Valley. The warehouses along the 215 and the Ramona Expressway put a lot of trucks on the road, and trucks throw the stones that chip windshields. We come to you, wherever the car is parked in Perris. A chip is worth repairing while it is small; one left alone through a hot summer tends to spread into a crack, and then the windshield needs replacing. If your car has a driver-assist camera behind the glass, we calibrate it after a replacement.',
    },
    {
      city: 'Orange County',
      heading: 'Mobile windshield service in Orange County',
      body: 'Orange County runs on its freeways — the 5, the 405, the 55, the 57 and the 91 — and on the toll roads that climb into the south county hills. Heavy traffic at highway speed is where most windshield chips start, and a chip in the driver’s line of sight is worth fixing before it spreads. We come to you across our Orange County service area, at home or at work. A small chip can usually be repaired; a long crack means a replacement. If your vehicle has a driver-assist camera behind the windshield, we calibrate it after the new glass is in, so lane-keeping and emergency braking read the road correctly.',
    },
    {
      city: 'Irvine',
      heading: 'Windshield repair and replacement in Irvine',
      body: 'Irvine is crossed by the 5 and the 405, with the 133 and the 261 toll roads running up into the hills, and much of its working day happens in the business districts near the Spectrum and John Wayne Airport. Freeway driving at speed is where most windshield chips start. We come to you — at home, at the office, or in the parking structure at work — so the car is fixed where it already is. A chip caught early can usually be repaired. Many newer cars on Irvine’s roads carry a camera behind the windshield for lane-keeping and emergency braking, and we calibrate it after a replacement.',
    },
    {
      city: 'Los Angeles County',
      heading: 'Mobile windshield service in Los Angeles County',
      body: 'Los Angeles County’s freeways — the 405, the 5, the 10, the 110 and the 101 among them — carry some of the heaviest traffic in the country, and that much driving at speed is where windshield chips come from. Sitting in that traffic to get the glass fixed is the last thing anyone wants, so we come to you: your driveway, your office, or the lot where the car is parked, across our LA County service area. A chip caught early can usually be repaired before it spreads; a crack across the glass means a replacement. If your car has a camera behind the windshield, we calibrate it after the replacement.',
    },
  ],

  // NO REDIRECTS, at the owner's call: every ad address renders a page
  // itself. /home, /free-quote, /mobile-service, the car-window and door-glass
  // addresses and /insurance-claims are aliases in code (HOME_ALIASES,
  // SERVICE_ALIASES, the general programme's `aliases`); this switches on the
  // one page an alias needs that Speedy did not have.
  insuranceProgram: { programKey: 'general' },
}
