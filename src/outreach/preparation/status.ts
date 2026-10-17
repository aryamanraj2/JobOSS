import { discoveryPresentation } from './discovery-window.js'
import { sharedTaskIds } from './task-sharing.js'
import type { Db } from '../../core/audit/audit-log.js'
import { decodeCheckpoint, discoveryOf } from './contracts.js'
/** Read-only presentation path: no coordinator/gateway/task/approval/send calls. */
export async function preparationStatus(db: Db, id: string) {
  if (!/^[A-Za-z0-9_-]{1,90}$/.test(id)) return null
  const row = await db.preparationRun.findUnique({ where: { id } })
  if (!row) return null
  try {
    const checkpoint = decodeCheckpoint(row.checkpoint, id)
    const discovery = checkpoint.discovery ? discoveryOf(checkpoint) : null
    const shared=await sharedTaskIds(db,id,checkpoint.entries.flatMap(e=>e.orphanedTaskIds))
    const ambiguous=new Set([...shared,...checkpoint.entries.flatMap(e=>e.ambiguousTaskIds)])
    const orphaned = new Set(checkpoint.entries.flatMap(e => e.orphanedTaskIds).filter(t=>!ambiguous.has(t)))
    const recorded = await db.llmTask.findMany({ where: { id: { in: [...new Set(checkpoint.entries.flatMap(e => e.taskIds))] } }, select: { id:true,kind:true,status:true,subjectType:true,promptVersion:true,input:true,allowedEvidenceIds:true,allowedApprovedClaimIds:true } })
    const tasks = recorded.filter(t => !orphaned.has(t.id)&&!ambiguous.has(t.id))
    const stopOrphaned = checkpoint.entries.flatMap(e => e.orphanedTaskIds.filter(t=>orphaned.has(t)).map(id => ({ id, companyId: e.companyId, subjectType: recorded.find(t=>t.id===id)?.subjectType ?? null, kind: recorded.find(t => t.id === id)?.kind ?? null, status: recorded.find(t => t.id === id)?.status ?? null })))
    const recipients = await db.contact.findMany({where:{id:{in:checkpoint.entries.flatMap(e=>e.contactId?[e.contactId]:[])}},select:{id:true,emailNormalized:true,fullName:true,status:true}})
    const ambiguousShared=[...ambiguous].map(id=>({id,classification:'ambiguous_shared',kind:recorded.find(t=>t.id===id)?.kind??null,subjectType:recorded.find(t=>t.id===id)?.subjectType??null}))
    return { id, status: row.status, ...discoveryPresentation(discovery,checkpoint.discoveryFinished,checkpoint.discoveryPending), checkpoint, recipients, sources: discovery?.sources ?? [], tasks, stopOrphaned, ambiguousShared,
      stopOrphanedInstruction: 'Stop-orphaned tasks were created during the stage window in which this company was stopped. Do not fulfil, claim or apply them; they are left as-is for the operator and are excluded from this run.',
      resume: `npm run outreach:prepare -- --resume --run-id ${id}`, manual: 'npm run llm:next -- --kind <recorded-kind>; npm run llm:fulfil -- --id <recorded-task-id> --file <validated-output.json> [--claim-token <token-if-claimed>]. Use only the recorded task IDs; status includes their bounded input. llm:next can claim other backlog work: verify its ID before continuing', error: null }
  } catch (e) {
    return { id, status: 'invalid_checkpoint', checkpoint: null, recipients: [], sources: [], tasks: [], stopOrphaned: [], ambiguousShared: [], ...discoveryPresentation(null,false), stopOrphanedInstruction: '', resume: '', manual: '', error: `This checkpoint is incompatible or damaged. Inspect this exact run; no replacement or reset was performed. ${e instanceof Error && e.message.startsWith('Unsupported preparation checkpoint version') ? e.message : ''}`.trim() }
  }
}
