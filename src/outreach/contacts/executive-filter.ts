/** Historical title/local-part classifier, retained for @1-@4 compatibility.
 * This is descriptive, not a targeting exclusion. JOBOSS permits supported founders,
 * technical leaders, engineers and recruiting contacts through recipientSuitability
 * and current recipientState evidence checks.
 */

/**
 * Executive title patterns. Word-anchored, because substring matching turns
 * "Head of..." into a match inside "Overhead" and "VP" into a match inside "VPN".
 */
export const HEAD_OF_FUNCTION =
  /\bhead\b[\s\p{P}]*(?:of\b[\s\p{P}]*)?(engineering|product|people|talent|hr|operations|design|marketing|sales|finance|legal)\b/iu

const EXECUTIVE_TITLE_PATTERNS: RegExp[] = [
  /\bfounder(s)?\b/i,
  /\bco[- ]?founder(s)?\b/i,
  /\bchief\b/i,
  /\bc[eoftmiprsdx]o\b/i, // CEO CTO CFO CMO CIO CPO CRO CSO CDO COO CXO
  /\bpresident\b/i,
  /\bvice[- ]president\b/i,
  /\bvp\b/i,
  /\bsvp\b/i,
  /\bevp\b/i,
  /\bmanaging director\b/i,
  /\bexecutive director\b/i,
  /\bboard member\b/i,
  /\bchair(man|woman|person)?\b/i,
  /\bproprietor\b/i,
  /\bowner\b/i,
  // "Head" + optional punctuation/whitespace + optional "of" + a function word. F6
  // widened this from a literal `head of `: a provider export wrote Rapido's head of
  // talent as "Head -Talent Acquisition", which the old rule passed. Titles are typed by
  // people and vendors, so the separator is noise and the function word is the signal.
  // `\bhead\b` keeps "Overhead" and "Headspace" out.
  HEAD_OF_FUNCTION,
]

/**
 * "Partner" is genuinely ambiguous and needed its own rule.
 *
 * At a VC or a law firm it is an executive. In a recruiting org it is an individual
 * contributor: "Talent Partner", "People Partner", "HR Business Partner" and
 * "Recruiting Partner" are standard IC titles for precisely the person Tier B wants to
 * reach. A bare `\bpartner\b` rejected "Talent Partner Associate", which is a recruiter.
 *
 * So the word is executive only when it is NOT preceded by one of those qualifiers.
 */
const PARTNER_PATTERN = /(?<!\b(?:talent|people|hr|human resources|business|recruiting|recruitment|staffing)\s)\bpartner\b/i

/**
 * Local parts that are an executive route regardless of any title text.
 *
 * `office-of-the-ceo` and `founders` show up on real contact pages, and an address is
 * a target even when nobody wrote a job title next to it.
 */
const EXECUTIVE_LOCALS = [
  /^founder(s)?$/,
  /^cofounder(s)?$/,
  /^ceo$/,
  /^cto$/,
  /^cfo$/,
  /^coo$/,
  /^cmo$/,
  /^cpo$/,
  /^cio$/,
  /^cro$/,
  /^cso$/,
  /^cdo$/,
  /^president$/,
  /^chairman$/,
  /^exec(utive)?s?$/,
  /^leadership$/,
  /^board$/,
  /^officeofthe/,
  /^vp[._-]?/,
]

export type ExecutiveVerdict =
  | { isExecutive: false }
  | { isExecutive: true; matched: string; where: 'title' | 'local' }

/**
 * Whether this contact has a historically executive title or local part. This alone is not a refusal.
 *
 * `title` may be null — a page that publishes an address with no role text at all —
 * in which case the local part is the only signal and is checked alone.
 */
export function isExecutiveContact(email: string, title: string | null): ExecutiveVerdict {
  const local = email.slice(0, email.lastIndexOf('@')).toLowerCase()
  const bare = local.replace(/[._-]/g, '')

  for (const pattern of EXECUTIVE_LOCALS) {
    if (pattern.test(local) || pattern.test(bare)) {
      return { isExecutive: true, matched: pattern.source, where: 'local' }
    }
  }

  if (title) {
    for (const pattern of EXECUTIVE_TITLE_PATTERNS) {
      const hit = title.match(pattern)
      if (hit) return { isExecutive: true, matched: hit[0], where: 'title' }
    }
    const partner = title.match(PARTNER_PATTERN)
    if (partner) return { isExecutive: true, matched: partner[0], where: 'title' }
  }

  return { isExecutive: false }
}
