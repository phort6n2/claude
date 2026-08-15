import type { FaqItem } from '@/lib/site-content'
import { insuranceForState, stateNameFor } from '@/lib/insurance-rules'

/**
 * The questions every glass customer asks, answered once for every shop.
 *
 * The FAQ section previously rendered nothing at all unless a shop had
 * written their own — which almost none had — so the page silently dropped
 * its entire objection-handling block. These four are the objections that
 * actually stop a booking: the rate-increase fear, the cash-vs-claim
 * arithmetic, repair-vs-replace, and whether the car needs recalibration.
 *
 * Every answer is true of any competent glass shop and asserts nothing
 * shop-specific. Deliberately absent, because the platform cannot promise
 * them on a shop's behalf: turnaround times, prices, and any claim about a
 * relationship with an insurer. The deductible answer includes the case
 * where insurance is the WRONG choice — which is what makes it read as
 * advice rather than a sales pitch, and it is the reason to keep it.
 *
 * A shop's own FAQs always come first; these fill in behind them, and any
 * default whose question a shop has already answered is dropped so the list
 * never asks the same thing twice.
 */

function rateAnswer(): string {
  return (
    'Glass damage is handled under the comprehensive part of your policy, not collision or ' +
    'liability, and comprehensive claims are generally treated differently from an at-fault ' +
    'accident. Every carrier and policy is different, though, so your carrier is the one who ' +
    'can confirm it for yours. Either way, nothing is filed until you tell us to.'
  )
}

function deductibleAnswer(state?: string | null): string {
  const rule = insuranceForState(state)
  const name = stateNameFor(state)
  if (rule.rule === 'automatic' && name) {
    return (
      `In ${name}, a comprehensive policy cannot apply a deductible to a windshield ` +
      'replacement, so for most drivers going through insurance costs nothing out of pocket. ' +
      'If you do not carry comprehensive, we will give you a straight cash price instead — ' +
      'and either way you get the number before any work starts.'
    )
  }
  return (
    'It comes down to two numbers: your comprehensive deductible and the price of the glass. ' +
    'If your deductible is $250 and the replacement is $550, claiming saves you $300. If your ' +
    'deductible is $500 and the glass is $420, paying directly is cheaper — and there is no ' +
    'claim on your record. We will price it both ways before you decide.'
  )
}

const REPAIR_ANSWER =
  'Often, yes. Damage smaller than a dollar bill, outside the driver’s line of sight and away ' +
  'from the edge of the glass can usually be repaired rather than replaced. A repair is ' +
  'quicker, costs less, and keeps the original factory seal. Send a photo with your quote and ' +
  'we will tell you straight — including when it is the smaller job.'

const ADAS_ANSWER =
  'If there is a camera mounted behind your windshield — lane keeping, automatic emergency ' +
  'braking, adaptive cruise — the manufacturer generally requires recalibration after the ' +
  'glass is replaced, so the system aims where it is supposed to. Your VIN tells us whether ' +
  'yours has one, and if it does we include it in the quote up front rather than after the job.'

/** Normalised for duplicate detection: a shop asking the same thing wins. */
const key = (q: string) => q.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

export function defaultFaq(opts: {
  state?: string | null
  offersAdasCalibration?: boolean
  offersWindshieldRepair?: boolean
}): FaqItem[] {
  const items: FaqItem[] = [
    { q: 'Will filing a glass claim raise my rates?', a: rateAnswer() },
    { q: 'Should I use insurance or just pay cash?', a: deductibleAnswer(opts.state) },
  ]
  if (opts.offersWindshieldRepair !== false) {
    items.push({ q: 'Can my windshield be repaired instead of replaced?', a: REPAIR_ANSWER })
  }
  if (opts.offersAdasCalibration) {
    items.push({ q: 'Does my car need a camera recalibration?', a: ADAS_ANSWER })
  }
  return items
}

/** Shop's own FAQs first, defaults filling in behind, no question twice. */
export function withDefaultFaq(
  own: FaqItem[],
  opts: Parameters<typeof defaultFaq>[0]
): FaqItem[] {
  const seen = new Set(own.map((f) => key(f.q)))
  return [...own, ...defaultFaq(opts).filter((f) => !seen.has(key(f.q)))]
}
