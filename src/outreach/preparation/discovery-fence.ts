import type { Db } from '../../core/audit/audit-log.js'
import { isStandaloneDatabaseClient } from '../../core/joboss/database-scope.js'
const writes = new Set(['create','createMany','createManyAndReturn','update','updateMany','updateManyAndReturn','upsert','delete','deleteMany'])
/** Ordinary standalone client facade, preserving its actual Prisma scope markers.
 * X's existing local transactions stay local transactions. Each direct mutation
 * is enclosed separately, never an outer transaction across discovery HTTP.
 * A preparation-row SHARE lock + current token read fences old X writes/catches
 * through COMMIT against a takeover's initial checkpoint CAS update. */
export function fencedDiscoveryDb(db: Db, id: string, owner: string, checkOwnership: () => Promise<void>): Db {
  if (!isStandaloneDatabaseClient(db)) throw new Error('Discovery fencing requires standalone client')
  const fence = async (tx: Db) => {
    const row = (await tx.$queryRaw<{ owner: string | null }[]>`SELECT checkpoint->>'owner' AS owner FROM preparation_run WHERE id=${id} FOR SHARE`)[0]
    if (row?.owner !== owner) throw new Error('Preparation discovery ownership lost; no source mutation')
  }
  const local = async (work: (tx: Db) => Promise<unknown>, options?: object) => {
    await checkOwnership()
    return db.$transaction(async tx => { await fence(tx); return work(tx) }, { ...options, isolationLevel: 'ReadCommitted', timeout: 30_000 })
  }
  const delegates = new Map<PropertyKey, object>()
  return new Proxy(db, { get(target, key, receiver) {
    if (key === '$transaction') return async (work: unknown, options?: object) => {
      if (typeof work !== 'function') throw new Error('Discovery requires callback transactions')
      return local(tx => work(tx), options)
    }
    if (key === '$executeRaw' || key === '$executeRawUnsafe') return (...args: unknown[]) => local(tx => Reflect.apply(Reflect.get(tx,key),tx,args))
    const value = Reflect.get(target,key,receiver)
    if (typeof key === 'string' && !key.startsWith('$') && value && typeof value === 'object' && typeof Reflect.get(value,'findMany') === 'function') {
      if (!delegates.has(key)) delegates.set(key,new Proxy(value,{get(model,operation){
        const method = Reflect.get(model,operation)
        if (typeof method !== 'function') return method
        if (typeof operation === 'string' && writes.has(operation)) return (...args:unknown[]) => local(tx=>{
          const delegate = Reflect.get(tx,key)
          return Reflect.apply(Reflect.get(delegate,operation),delegate,args)
        })
        return method.bind(model)
      }}))
      return delegates.get(key)
    }
    return typeof value === 'function' ? value.bind(target) : value
  } })
}
