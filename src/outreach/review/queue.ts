import { isStandaloneDatabaseClient } from '../../core/joboss/database-scope.js'
import type { Db } from '../../core/audit/audit-log.js'
import { evaluateOutreachReadiness } from './readiness.js'
import { supportSnapshot, reviewSnapshot } from './snapshot.js'
import { currentCompanyContext, preparationLimit } from './context.js'
import { wordCount } from '../draft/email.js'
import { findTaskSchema, type DraftSupportResponse } from '../../core/llm/tasks.js'
import { listedRoleContextV5Error } from '../draft/role-v5.js'
import { DraftComposition } from '../draft/message.js'
import { recipientState, personFacts } from '../contacts/verification.js'

/** A displayed review is one PostgreSQL MVCC snapshot, including readiness and token.
 * Caller-owned transactions must explicitly use REPEATABLE READ or SERIALIZABLE.
 * READ COMMITTED is refused before construction; retry in a fresh supported scope. */
export async function outreachReview(db: Db, draftId: string, now: Date = new Date()) {
  if (isStandaloneDatabaseClient(db)) return db.$transaction(async (tx) => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`
    return coherentReview(tx, draftId, now)
  }, { isolationLevel: 'RepeatableRead', timeout: 30_000 })
  const isolation = await db.$queryRaw<{ transaction_isolation: string }[]>`SHOW transaction_isolation`
  if (!['repeatable read', 'serializable'].includes(isolation[0]?.transaction_isolation ?? '')) throw new Error('Outreach review requires a fresh REPEATABLE READ or SERIALIZABLE transaction; READ COMMITTED cannot produce a coherent displayed review.')
  return coherentReview(db, draftId, now)
}
async function coherentReview(db: Db, draftId: string, now: Date) {
  const exists = await db.draft.findUnique({ where: { id: draftId }, select: { id: true } })
  if (!exists) return null
  const source = await supportSnapshot(db, draftId)
  const { draft, company, person, claims } = source
  const context = await currentCompanyContext(db, company.id, now)
  const recipientVerification = draft.contact ? await recipientState(db, draft.contact, company.canonicalDomain, now) : { ready: false, detail: 'No recipient.' }
  const readiness = await evaluateOutreachReadiness(db, draftId, now)
  const tasks = await db.llmTask.findMany({ where: { OR: [{ kind: 'outreach_draft', subjectId: draft.id }, { kind: 'draft_support', subjectId: `${draft.id}:${source.hash}` }] }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { id: true, kind: true, status: true, output: true, fulfilledBy: true } })
  const support = tasks.find((t) => t.kind === 'draft_support')
  const citedIds = new Set([...draft.citedEvidenceIds, ...(person?.citedEvidenceIds ?? []), ...(context?.assessment.citedEvidenceIds ?? []), ...(draft.contact ? [draft.contact.evidenceId] : [])])
  const parsedSupport = support?.output ? findTaskSchema('draft_support', 'draft_support@1')!.schema.safeParse(support.output) : null
  const supportClaims = parsedSupport?.success ? (parsedSupport.data as DraftSupportResponse).claims : []
  const role = context?.currentRoles.find((o) => o.id === draft.lead.opportunityId)
  const parsedComposition = DraftComposition.safeParse(draft.composition)
  const roleContext = role && parsedComposition.success ? listedRoleContextV5Error(parsedComposition.data, role, company.evidence) : 'Current role context needs review.'
  const intent = draft.lead.leadKind === 'posted_role' ? { kind: 'listed' as const, title: company.opportunities.find((o) => o.id === draft.lead.opportunityId)?.title ?? null, supported: !roleContext, detail: roleContext ?? 'Current posting is related to this internship inquiry.' } : { kind: 'speculative' as const, title: null, supported: true, detail: 'Internship availability inquiry; no vacancy is asserted.' }
  const pending = !draft.promptVersion || support?.status === 'pending' || support?.status === 'claimed'
  return { draft, company: { id: company.id, name: company.displayName, domain: company.canonicalDomain },
    assessment: context?.assessment ?? null, contact: draft.contact, suitability: 'suitability' in recipientVerification ? recipientVerification.suitability : null,
    research: person ? { identityStatus: person.identityStatus, verifiedAt: person.verifiedAt, researchedAt: person.researchedAt, facts: personFacts(person.facts), hooks: personFacts(person.hooks), limitations: person.limitations } : null,
    evidence: company.evidence.filter((e) => citedIds.has(e.id)).map((e) => ({ ...e, ageDays: Math.floor((now.getTime() - e.observedAt.getTime()) / 86_400_000) })),
    intent, claims, tasks, support, supportClaims, recipientVerification: { ready: recipientVerification.ready, detail: recipientVerification.detail }, readiness, state: readiness.ready ? 'ready' : pending ? 'pending' : 'blocked', snapshot: await reviewSnapshot(db, draftId), words: wordCount(draft.bodyText ?? ''),
    limitations: [...new Set([...(person?.limitations ?? ['Company hook only; no verified personal work.']), 'International eligibility, sponsorship, relocation and remote arrangements remain unconfirmed.'])],
  }
}
export type OutreachReview = NonNullable<Awaited<ReturnType<typeof outreachReview>>>

export async function outreachReviewQueue(db: Db, opts: { limit?: number; now?: Date } = {}) {
  const ids = await db.draft.findMany({ where: { OR: [{ promptVersion: 'outreach_draft@5' }, { composition: { path: ['layout'], equals: 'v5' } }] },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: preparationLimit(opts.limit), select: { id: true } })
  const rows: OutreachReview[] = []
  for (const { id } of ids) { const row = await outreachReview(db, id, opts.now); if (row) rows.push(row) }
  return rows
}
