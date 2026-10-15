import { classifyLocal } from './classify.js'

export type RecipientSuitability = {
  suitable: boolean
  category: 'founder' | 'technical_leader' | 'engineer' | 'recruiter' | 'role_alias' | 'unsuitable' | 'unknown'
  reason: string
  priority: number
}

const RECRUITING = /\b(recruit\w*|talent|sourcer|staffing|people|hr|human resources|campus|university relations)\b/i
const COMMERCIAL = /\b(field engineer\w*|field engineering|sales|pre[- ]?sales|solutions? engineer\w*|solutions? architect|customer engineer\w*|customer success|support|helpdesk|help desk|information technology|it|intern\w*|website|operations|office manager|facilities|marketing|finance|accounting|legal|counsel|procurement|administrator|receptionist)\b/i
const FOUNDER = /\b(founder|co[- ]?founder|ceo|chief executive)\b/i
const TECH_LEADER = /\b(cto|chief technology|chief technical|chief product|vp\s+(?:of\s+)?engineering|(?:head|director|lead|manager)\s+(?:of\s+)?(?:engineering|software|mobile|ai|machine learning|product)|engineering (?:manager|lead|director))\b/i
const ENGINEERING = /\b(engineer|engineering|developer|software|swe|programmer|sre|architect|tech lead|technical lead|research scientist)\b/i

/** Responsibility matters: a commercial engineering title is not product engineering. */
export function recipientSuitability(contact: { emailNormalized: string; contactType: string; publicTitle: string | null }, verifiedResponsibilities: string[] = []): RecipientSuitability {
  const local = classifyLocal(contact.emailNormalized)
  if (local.kind === 'fallback_alias') return { suitable: false, category: 'unsuitable', priority: 99, reason: 'Generic company inbox; no recruiting responsibility.' }
  if (!contact.contactType.startsWith('named') && local.kind === 'alias') return { suitable: true, category: 'role_alias', priority: contact.contactType === 'university_recruiting' ? 4 : contact.contactType === 'talent_alias' ? 5 : 6, reason: 'Published recruiting route.' }
  const title = contact.publicTitle?.trim()
  if (!title) return { suitable: false, category: 'unknown', priority: 99, reason: 'No supported public responsibility.' }
  if (RECRUITING.test(title)) return { suitable: true, category: 'recruiter', priority: 3, reason: `Recruiting responsibility: ${title}` }
  if (/\b(former|previous|ex-)\b/i.test(title)) return { suitable: false, category: 'unknown', priority: 99, reason: 'Current company responsibility is unconfirmed.' }
  if (FOUNDER.test(title)) return { suitable: true, category: 'founder', priority: 0, reason: `Startup decision-maker: ${title}` }
  const commercial = title.match(COMMERCIAL)
  if (commercial && verifiedResponsibilities.some((text) => /\b(?:builds?|develops?|implements?|maintains?)\b.{0,65}\b(?:iOS|Android|mobile|software|AI|machine learning)\b.{0,30}\b(?:app|sdk|product|model|platform)\b/i.test(text) && !/\b(customer|sales|demo|quoted|former)\b/i.test(text))) return { suitable: true, category: 'engineer', priority: 2, reason: 'Verified employer work includes building a relevant product despite a commercial title.' }
  if (commercial) return { suitable: false, category: 'unsuitable', priority: 99, reason: `Responsibility is outside product engineering or recruiting: ${commercial[0]}` }
  if (TECH_LEADER.test(title) || /\b(?:applied\s+)?(?:ai|mobile|ml|machine learning|software)\s+(?:lead|manager|director)\b/i.test(title)) return { suitable: true, category: 'technical_leader', priority: 1, reason: `Technical leadership: ${title}` }
  if (ENGINEERING.test(title)) return { suitable: true, category: 'engineer', priority: 2, reason: `Product engineering responsibility: ${title}` }
  return { suitable: false, category: 'unknown', priority: 99, reason: `Responsibility is not supported as engineering or recruiting: ${title}` }
}
