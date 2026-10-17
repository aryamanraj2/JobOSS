import { Client } from 'pg'
import type { Db } from '../../core/audit/audit-log.js'
/** A dedicated SESSION advisory, never a transaction or D lock across HTTP.
 * No TTL/overlapping lease. Connection loss fences this invocation; all future
 * checkpoints and the final D selection additionally verify its durable token. */
export async function ownRun(db: Db, connectionString: string, id: string) {
  const c = new Client({ connectionString, connectionTimeoutMillis: 5000, statement_timeout: 5000 }); let lost = false
  c.on('error', () => { lost = true })
  await c.connect()
  try {
    const identity = (await c.query('SELECT current_database() AS name, inet_server_port() AS port, inet_server_addr()::text AS addr, pg_postmaster_start_time()::text AS started')).rows[0]
    const actual = (await db.$queryRaw<{ name: string; port: number; addr: string; started: string }[]>`SELECT current_database() AS name,inet_server_port() AS port, inet_server_addr()::text AS addr, pg_postmaster_start_time()::text AS started`)[0]
    if (!actual || identity.name !== actual.name || identity.port !== actual.port || identity.addr !== actual.addr || identity.started !== actual.started) throw new Error('Preparation lock database identity mismatch')
    const row = (await c.query("SELECT pg_try_advisory_lock(hashtextextended($1,17)) AS locked,pg_backend_pid() AS pid", [`preparation:${id}`])).rows[0]
    if (!row.locked) { await c.end(); return null }
    return { pid: row.pid as number, assert: async () => {
      if (lost) throw new Error('Preparation ownership connection lost; resume exact run')
      await c.query('SELECT 1')
    }, close: async () => { await c.end() } }
  } catch (e) { await c.end().catch(() => undefined); throw e }
}
