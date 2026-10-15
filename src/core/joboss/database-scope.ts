import type { Db } from '../audit/audit-log.js'
import type { PrismaClient } from '../../../generated/prisma/client.js'

/**
 * Prisma 7.10 transaction scopes still expose $transaction (nested savepoints).
 * A method-presence check therefore does not establish a committed reservation.
 * These markers are verified against the installed runtime and real PG tests;
 * retain the transaction-boundary regressions when upgrading Prisma.
 */
export function isStandaloneDatabaseClient(db: Db): db is PrismaClient {
  return typeof (db as { $transaction?: unknown }).$transaction === 'function' &&
    Reflect.get(db, Symbol.for('prisma.client.transaction.scope_context')) === undefined &&
    Reflect.get(db, Symbol.for('prisma.client.transaction.id')) === undefined
}
