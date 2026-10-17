import type { Db } from '../../core/audit/audit-log.js'
/** Conservative ownership check: another run recording the same ID makes stage
 * attribution ambiguous. Never cancel/fulfil it or instruct another run to stop. */
export async function sharedTaskIds(db: Db, runId: string, ids: string[]): Promise<string[]> {
  if(!ids.length)return []
  const shared=new Set<string>(),wanted=new Set(ids)
  const rows=await db.preparationRun.findMany({where:{id:{not:runId},OR:ids.map(id=>({checkpoint:{path:['entries'],array_contains:[{taskIds:[id]}]}}))},select:{checkpoint:true}})
  for(const row of rows){const c=row.checkpoint as {entries?:unknown[]}|null
    if(!Array.isArray(c?.entries))continue
    for(const entry of c.entries){const tasks=(entry as {taskIds?:unknown[]}|null)?.taskIds
      if(Array.isArray(tasks))for(const id of tasks)if(typeof id==='string'&&wanted.has(id))shared.add(id)
    }
  }
  return [...shared]
}
