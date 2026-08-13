/**
 * Turning a VIN into what the shop actually needs to know.
 *
 * The quote form has always asked for the VIN and then done nothing with it.
 * Decoded, it answers the two questions that decide what a windscreen job is
 * worth: exactly which vehicle this is, and whether there is a camera behind
 * the glass that has to be recalibrated afterwards.
 *
 * Calibration is the priciest part of a modern windscreen replacement and the
 * one most often missed at quoting time — a shop that quotes a bare glass
 * price and then discovers a lane-keep camera either eats the difference or
 * has an awkward conversation with the customer.
 *
 * ---------------------------------------------------------------------------
 * Source
 * ---------------------------------------------------------------------------
 * NHTSA vPIC — the US DOT's own vehicle database. Free, no key, no signup, no
 * quota to negotiate. It is also the data manufacturers are required to file,
 * which is why it knows about driver-assist systems at all.
 *
 * What it is not: a glass catalogue. It will not give a part number or a
 * price — that is NAGS data, which is licensed. This tells you the vehicle
 * and the systems on it, and the shop takes it from there.
 */

const ENDPOINT = 'https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended'

/**
 * The systems that mount to the windscreen.
 *
 * Adaptive cruise is deliberately NOT here. It is frequently radar in the
 * grille rather than a camera behind the glass, so including it would flag
 * calibration on vehicles that do not need it — and a flag that cries wolf
 * gets ignored on the one that matters.
 */
const CAMERA_SYSTEMS: Array<[string, string]> = [
  ['ForwardCollisionWarning', 'Forward collision warning'],
  ['LaneDepartureWarning', 'Lane departure warning'],
  ['LaneKeepSystem', 'Lane keep assist'],
  ['LaneCenteringAssistance', 'Lane centering'],
  ['CIB', 'Automatic emergency braking'],
  ['PedestrianAutomaticEmergencyBraking', 'Pedestrian emergency braking'],
]

/**
 * Three states, and the absence of a fourth is the point.
 *
 * There is no "no camera" verdict, because vPIC cannot support one. For a
 * vehicle without these systems it returns the fields BLANK, not "Not
 * Available" — checked against a 2020 Malibu and a 2020 Jetta, both of which
 * come back empty across every driver-assist field. Blank means the
 * manufacturer did not file it, which is not the same as the car not having
 * it, and a shop told "no ADAS camera" would skip a calibration that was
 * required. So silence stays silence.
 */
export type CalibrationVerdict = 'likely' | 'possible' | 'unknown'

export interface VinSummary {
  vin: string
  year: string | null
  make: string | null
  model: string | null
  trim: string | null
  bodyClass: string | null
  /** Human-readable names of the windscreen-mounted systems found. */
  cameraSystems: string[]
  calibration: CalibrationVerdict
  /** One line fit for an email or a lead card. */
  headline: string
  /** Set when nothing usable came back. */
  error?: string
}

/** A VIN is 17 characters and never uses I, O or Q. */
export function looksLikeVin(value: string | null | undefined): boolean {
  if (!value) return false
  return /^[A-HJ-NPR-Z0-9]{17}$/i.test(value.trim())
}

function describe(summary: Omit<VinSummary, 'headline'>): string {
  const vehicle = [summary.year, summary.make, summary.model, summary.trim]
    .filter(Boolean)
    .join(' ')
  if (summary.calibration === 'likely') {
    return `${vehicle} — camera behind the glass (${summary.cameraSystems.join(', ')}). Plan for recalibration.`
  }
  if (summary.calibration === 'possible') {
    return `${vehicle} — camera systems optional on this model. Check the mirror mount before quoting.`
  }
  return vehicle || 'VIN could not be decoded'
}

/**
 * Decode one VIN. Never throws.
 *
 * Bounded, because this runs between a lead arriving and the shop being told
 * about it. An alert is worth more on time and slightly less informative than
 * late and complete, so a slow government API degrades to no decode rather
 * than a delayed alert.
 */
export async function decodeVin(rawVin: string): Promise<VinSummary | null> {
  const vin = (rawVin || '').trim().toUpperCase()
  if (!looksLikeVin(vin)) return null

  try {
    const res = await fetch(`${ENDPOINT}/${encodeURIComponent(vin)}?format=json`, {
      // Eight seconds, not five: a cold call to vPIC measurably exceeded five
      // in testing. This runs after the response has already gone back, so the
      // only thing it can delay is the shop's alert.
      signal: AbortSignal.timeout(8_000),
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) return { ...empty(vin), error: `vPIC returned HTTP ${res.status}` }

    const body = await res.json()
    const row = body?.Results?.[0] as Record<string, string> | undefined
    if (!row) return { ...empty(vin), error: 'vPIC returned nothing for this VIN' }

    // ErrorCode 0 is clean; 1 means the check digit does not compute, which is
    // common in VINs typed by hand off a windscreen and does NOT stop the
    // decode. Only treat it as fatal when no vehicle came back with it.
    const make = row.Make?.trim() || null
    const model = row.Model?.trim() || null
    if (!make && !model) {
      return { ...empty(vin), error: row.ErrorText?.split(';')[0] || 'VIN could not be decoded' }
    }

    const present: string[] = []
    let anyOptional = false
    for (const [field, label] of CAMERA_SYSTEMS) {
      const value = (row[field] || '').trim()
      if (/^standard$/i.test(value)) present.push(label)
      else if (/^optional$/i.test(value)) anyOptional = true
    }

    const calibration: CalibrationVerdict =
      present.length ? 'likely' : anyOptional ? 'possible' : 'unknown'

    const base = {
      vin,
      year: row.ModelYear?.trim() || null,
      make,
      model,
      trim: row.Trim?.trim() || row.Series?.trim() || null,
      bodyClass: row.BodyClass?.trim() || null,
      cameraSystems: present,
      calibration,
    }
    return { ...base, headline: describe(base) }
  } catch (error) {
    return {
      ...empty(vin),
      error: error instanceof Error ? error.message : 'VIN lookup failed',
    }
  }
}

function empty(vin: string): Omit<VinSummary, 'headline'> & { headline: string } {
  return {
    vin,
    year: null,
    make: null,
    model: null,
    trim: null,
    bodyClass: null,
    cameraSystems: [],
    calibration: 'unknown',
    headline: '',
  }
}

/** How the verdict should be worded to a shop, or nothing when it cannot say. */
export function calibrationLabel(verdict: CalibrationVerdict): string | null {
  switch (verdict) {
    case 'likely':
      return 'Needs ADAS recalibration'
    case 'possible':
      return 'ADAS optional on this model — check'
    default:
      // Silence, not "no camera". See CalibrationVerdict.
      return null
  }
}
