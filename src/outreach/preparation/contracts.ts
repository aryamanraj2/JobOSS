import { z } from 'zod'
import { contentHashOf } from '../../core/evidence/content-hash.js'
import { expandedManifestHash, EXPANDED_ROUTES } from '../../ingest/discovery/expanded/registry.js'
import { endedForSelection, sourceWindow, nextWindow } from './discovery-window.js'
import type { DiscoverySummary } from '../../ingest/discovery/prepare.js'

export const Options = z.object({ limit: z.number().int().min(1).max(100).default(20),
  discoveryPasses: z.number().int().min(1).max(10).default(3), discoveryLimit: z.number().int().min(1).max(200).default(20), provider: z.enum(['codex', 'claude', 'manual']).default('codex'),
  campaignCycle: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/), primaryPages: z.number().int().min(1).max(3).default(2),
  upgradeExisting: z.boolean().default(false) }).strict()
export type PreparationOptions = z.infer<typeof Options>
const Id = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/)
const Hint = z.object({ title: z.string(), url: z.string(), applicationUrl: z.string().nullable() }).strict()
export const Entry = z.object({ companyId: Id, name: z.string(), domain: z.string(), priority: z.number(), reason: z.string(),
  selected: z.boolean(), sourceRoutes: z.array(z.string()), provenance: z.array(z.unknown()), hints: z.array(Hint), unresolved: z.boolean(),
  intent: z.enum(['listed', 'speculative']), opportunityId: Id.nullable(), roleHash: z.string().nullable(), associationId: Id.nullable(), contactId: Id.nullable(),
  stage: z.enum(['ranked', 'research', 'recipients', 'composing', 'support', 'ready', 'blocked']), blockers: z.array(z.string()),
  pages: z.array(z.object({ url: z.string(), status: z.string(), detail: z.string().nullable(), evidenceId: z.string().nullable(), observedAt: z.iso.datetime(), recordedAt: z.iso.datetime(), urls: z.array(z.string()).max(4), baselineIds: z.array(Id).max(2000) }).strict()),
  taskIds: z.array(Id), draftIds: z.array(Id), refreshAttempted: z.boolean(),
  /** Created by a stage whose post-stage stop check failed: never fulfil or apply them. */
  orphanedTaskIds: z.array(Id).default([]), ambiguousTaskIds: z.array(Id).default([]) }).strict()
export type PreparationEntry = z.infer<typeof Entry>
// @3 freezes discovery windows/pass receipts and shared-task classifications.
// Older versions lack this scope; reject them without modifying forensic state.
export const CHECKPOINT_VERSION = 'preparation-e@3'
export const Checkpoint = z.object({ version: z.literal(CHECKPOINT_VERSION), runId: Id, options: Options, optionsHash: z.string(),
  batchId: Id, manifestHash: z.string(), scopeHash: z.string(), discovery: z.unknown().nullable(), candidateIds: z.array(Id).max(2000),
  entries: z.array(Entry).max(2000), errors: z.array(z.string()).max(100), usage: z.array(z.unknown()), owner: z.string().nullable(),
  status: z.enum(['discovery', 'working', 'paused', 'review']), discoveryFinished: z.boolean(), discoveryPass: z.number().int().min(0).max(10), discoveryPending: z.boolean() }).strict()
export type PreparationCheckpoint = z.infer<typeof Checkpoint>
export function decodeCheckpoint(raw: unknown, id: string): PreparationCheckpoint {
  const version = (raw as { version?: unknown } | null)?.version
  if (version !== CHECKPOINT_VERSION) throw new Error(`Unsupported preparation checkpoint version ${String(version)}; forensic state preserved unchanged. Start a new run; no reselection or migration is performed.`)
  const c = Checkpoint.parse(raw)
  if(c.discoveryPass > c.options.discoveryPasses || c.discoveryPending && (!c.discoveryPass || c.discoveryFinished)) throw new Error('Invalid discovery window progress')
  if (c.scopeHash !== scopeHash(c)) throw new Error('Changed frozen candidate/selection scope')
  if (c.runId !== id || c.optionsHash !== contentHashOf(c.options) || c.manifestHash !== expandedManifestHash() || c.batchId !== `prep_${id}` ||
    new Set(c.candidateIds).size !== c.candidateIds.length || new Set(c.entries.map(e => e.companyId)).size !== c.entries.length ||
    c.entries.some(e => !c.candidateIds.includes(e.companyId)) || c.entries.filter(e => e.selected).length > c.options.limit ||
    c.entries.some(e => e.intent === 'speculative' && (e.hints.length || e.unresolved || e.opportunityId))) throw new Error('Incompatible/foreign preparation checkpoint; forensic state preserved')
  if (c.entries.length && (c.discovery === null || !c.discoveryFinished)) throw new Error('Cohort entries require finished bounded discovery')
  if (c.discovery !== null) {
    const d = discoveryOf(c)
    if(d.sources.some(s=>{const w=sourceWindow(s);if(!w || w.passes>c.options.discoveryPasses || w.lastPass>c.discoveryPass || w.passes>w.lastPass)return true
      const expected=nextWindow(s,w.passes===1?null:{...w,passes:w.passes-1},w.lastPass,c.options.discoveryPasses,c.candidateIds.length===2000 && w.gap==='candidate_bound_reached')
      if(w.gap==='candidate_bound_reached' && c.candidateIds.length!==2000 || c.candidateIds.length===2000 && !w.ended)return true
      return w.ended!==expected.ended || w.gap!==expected.gap})) throw new Error('Invalid source window receipt')
    if (JSON.stringify([...d.companyIds].sort()) !== JSON.stringify([...c.candidateIds].sort()) && c.entries.length) throw new Error('Foreign candidate checkpoint')
  }
  return c
}
export function discoveryOf(c: PreparationCheckpoint): DiscoverySummary {
  const d = c.discovery as DiscoverySummary | null
  if (!d || d.manifestVersion !== 'expanded-v1' || d.mode !== 'expanded-v1' || d.batchId !== c.batchId || d.manifestHash !== c.manifestHash || !d.handoff ||
    !Array.isArray(d.companyIds) || !Array.isArray(d.sources) || d.sources.length !== EXPANDED_ROUTES.length ||
    new Set(d.sources.map(s => s.source)).size !== EXPANDED_ROUTES.length || d.sources.some(s => !EXPANDED_ROUTES.some(r => r.id === s.source)) ||
    !Array.isArray(d.runIds) || d.runIds.length !== d.sources.length || d.sources.some(s => !d.runIds.includes(s.runId)) ||
    !Array.isArray(d.handoff.items) || new Set(d.runIds).size !== d.sources.length ||
    !z.array(Id).safeParse(d.companyIds).success || new Set(d.companyIds).size !== d.companyIds.length ||
    contentHashOf([...d.companyIds].sort()) !== contentHashOf([...c.candidateIds].sort()) ||
    d.sources.some(s => s.coverage.batchId !== c.batchId || s.coverage.manifestHash !== c.manifestHash || contentHashOf(s.coverage.manifest) !== c.manifestHash) ||
    d.handoff.items.length !== d.companyIds.length || new Set(d.handoff.items.map(i=>i.companyId)).size !== d.companyIds.length ||
    d.handoff.items.some(i=>!d.companyIds.includes(i.companyId) || typeof i.domain !== 'string' || !Array.isArray(i.listingHints) || !Array.isArray(i.unresolvedAdvertisedHints) || !Array.isArray(i.sourceRoutes)) ||
    c.entries.some(e => !d.handoff!.items.some(i=>i.companyId === e.companyId && i.domain === e.domain)) ||
    c.discoveryFinished !== d.sources.every(sourceEnded)) throw new Error('Invalid exact discovery checkpoint; inspect recorded batch')
  return d
}
export const json = (v: unknown) => JSON.parse(JSON.stringify(v))
export const sourceEnded = endedForSelection

export function scopeHash(c: Pick<PreparationCheckpoint, 'candidateIds'|'entries'>) {
  return contentHashOf({ candidateIds: c.candidateIds, entries: c.entries.map(e => ({ companyId:e.companyId,name:e.name,domain:e.domain,priority:e.priority,selected:e.selected,intent:e.intent,sourceRoutes:e.sourceRoutes,provenance:e.provenance,hints:e.hints,unresolved:e.unresolved })) })
}
