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
const ENGINEERING = /\b(engineer|engineering|developer|software|swe|programmer|ios|android|mobile|frontend|front[- ]end|backend|back[- ]end|full[- ]?stack|platform|infrastructure|devops|sre|machine learning|ml|ai|architect|tech lead|technical lead|research scientist)\b/i

/** Responsibility matters: a commercial engineering title is not product engineering. */
export function recipientSuitability(contact: { emailNormalized: string; contactType: string; publicTitle: string | null }): RecipientSuitability {
  const local = classifyLocal(contact.emailNormalized)
  if (local.kind === 'fallback_alias') return { suitable: false, category: 'unsuitable', priority: 99, reason: 'Generic company inbox; no recruiting responsibility.' }
  if (!contact.contactType.startsWith('named') && local.kind === 'alias') return { suitable: true, category: 'role_alias', priority: 4, reason: 'Published recruiting route.' }
  const title = contact.publicTitle?.trim()
  if (!title) return { suitable: false, category: 'unknown', priority: 99, reason: 'No supported public responsibility.' }
  if (RECRUITING.test(title)) return { suitable: true, category: 'recruiter', priority: 3, reason: `Recruiting responsibility: ${title}` }
  const commercial = title.match(COMMERCIAL)
  if (commercial) return { suitable: false, category: 'unsuitable', priority: 99, reason: `Responsibility is outside product engineering or recruiting: ${commercial[0]}` }
  if (FOUNDER.test(title)) return { suitable: true, category: 'founder', priority: 0, reason: `Startup decision-maker: ${title}` }
  if (TECH_LEADER.test(title)) return { suitable: true, category: 'technical_leader', priority: 1, reason: `Technical leadership: ${title}` }
  if (ENGINEERING.test(title)) return { suitable: true, category: 'engineer', priority: 2, reason: `Product engineering responsibility: ${title}` }
  return { suitable: false, category: 'unknown', priority: 99, reason: `Responsibility is not supported as engineering or recruiting: ${title}` }
}
