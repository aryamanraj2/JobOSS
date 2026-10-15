import type { ReasonCodeValue } from '../../core/reason-codes/registry.js'
import { classifyLocal } from '../contacts/classify.js'
import { recipientSuitability } from '../contacts/suitability.js'

/**
 * §10.7 — which contacts at one company may become drafts, and how many.
 *
 * ## One choke point, by design
 *
 * Every draft is created through `selectContactSlots`, and every send reads an
 * approved draft, so this function is the only place a human's address can enter the
 * sending path. Two policy questions therefore live here rather than in the callers:
 * *who* may be written to (`contactSlotRefusal`) and *how many* people at one company
 * (the slot count). F6 found the cost of leaving the first one out: the composer had
 * produced drafts to an IT Support Specialist, a Machine Learning Intern and a Website
 * Operations Manager, because `TIER_ORDER` ranked `named_employee` and never looked at
 * the title.
 *
 * ## How many: every eligible contact gets its own message (operator, F6 step 1)
 *
 * The operator's F4 decision was one slot at a small company and two at a company of
 * 100+. Their F6 decision replaces it: *"best would be to send them individually (if
 * Strava has 3 people)"* — every contact who passes `contactSlotRefusal` is a separate
 * message to a separate human, with no company ceiling.
 *
 * What still bounds this, now that the company ceiling is gone:
 *
 * - **A2's per-contact partial unique index** — one first touch per human per cycle,
 *   regardless of track. A slot-allocation bug cannot send one person two messages.
 * - **`one_first_touch_per_company_slot_per_cycle`** `(company_id, campaign_cycle,
 *   touch_slot)` still caps each *slot number* at one send, so a re-run cannot
 *   duplicate a slot. It no longer caps the company, because the number of slots is
 *   now the number of eligible contacts. That is the deliberate consequence of the
 *   operator's decision, recorded because the F5 migration's comment claims otherwise.
 * - **The per-domain cap** (3/day at F6), which spreads a company's contacts over days.
 *
 * The number of eligible contacts per company is 1 to 6 in the live corpus today.
 */

export type SlotCandidate = {
  id: string
  contactType: string
  verified: boolean
  emailNormalized: string
  publicTitle: string | null
}

export type SlotRefusal = { reason: ReasonCodeValue; detail: string }

/**
 * Why this contact may not take a slot, or `null` if it may.
 *
 * It **fails closed**: a title this does not recognise is refused. The asymmetry is
 * the same one `executive-filter.ts` is built on — a false negative mails a stranger
 * in a role that has nothing to do with hiring, a false positive costs one lead out of
 * a corpus of 3,000.
 *
 * `verified` is deliberately NOT checked here: it is a different fact with a different
 * reason code (`outreach_not_permitted` via `decideOutreachCase`), and `compose.ts`
 * reports the two separately so the operator can tell "we may not write to this
 * person" from "we have not confirmed this address".
 */
export function contactSlotRefusal(c: SlotCandidate): SlotRefusal | null {
  // A generic company inbox is not a recruiting route. `classifyLocal` types
  // `hello@`, `info@`, `contact@`, `team@` and `enquiries@` as `fallback_alias` and
  // then stores them as `careers_alias`, which ranked them beside a real `careers@`.
  // The operator's F6 decision: drop them. Measured 2026-10-05, 11 of 36 drafts went
  // to one, including `hello@fi.money` scraped beside a bank's phishing warning.
  if (classifyLocal(c.emailNormalized).kind === 'fallback_alias') {
    return { reason: 'no_public_recruiting_route', detail: 'generic company inbox, not a careers route (§8)' }
  }

  // A role alias IS the recruiting route — its local part says so, and its
  // `publicTitle` holds whatever page text sat beside the address, which is not a
  // title at all. Only a named human is judged on a title.
  if (!c.contactType.startsWith('named')) return null

  const suitability = recipientSuitability(c)
  return suitability.suitable ? null : { reason: 'outreach_not_permitted', detail: suitability.reason }
}

/**
 * Which contacts at a company become drafts, in the order they should be used.
 *
 * H2's tier ordering decides the order, which is still what the pilot measures
 * (B5 found the `careers@`-first premise unverified). It no longer decides *whether*
 * a contact is reached, because every eligible contact now gets a slot.
 *
 * Unverified contacts are excluded outright. An unverified contact opens no outreach
 * case at all (`outreach-case.ts`), so admitting one here would produce a draft that
 * the predicate then refuses — a wasted row and a confusing audit trail.
 */
export function selectContactSlots(contacts: SlotCandidate[]): { contactId: string; touchSlot: number }[] {
  return contacts
    .filter((c) => c.verified && contactSlotRefusal(c) === null)
    .sort((a, b) => {
      const rank = recipientSuitability(a).priority - recipientSuitability(b).priority
      // Ties break on id so a re-run selects the same contacts rather than reshuffling
      // the operator's review queue — F3 §4.4's rule, for the same reason.
      return rank !== 0 ? rank : a.id.localeCompare(b.id)
    })
    .map((c, i) => ({ contactId: c.id, touchSlot: i }))
}
