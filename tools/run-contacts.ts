#!/usr/bin/env tsx
/** Manual bounded recipient preparation. Selected companies need neither ATS nor qualified Lead.
 * --company-id <id> (repeat), --limit 20, --max-pages 4. --report is read-only.
 * No automatic task execution, provider activation or sending. */
import 'dotenv/config'
import { prisma, disconnectPrisma } from '../src/core/db/client.js'
import { env } from '../src/core/config/config.js'
import { FetchPolicyGate } from '../src/core/policy/fetch-policy-gate.js'
import { prepareRecipients } from '../src/outreach/contacts/prepare.js'
import { preparationLimit } from '../src/outreach/review/context.js'
import { tierAYield, providerVerdict } from '../src/outreach/contacts/yield-report.js'
const args = process.argv.slice(2)
const value = (flag: string) => args[args.indexOf(flag) + 1]
const db = prisma()
try {
  if (args.includes('--report')) console.log(providerVerdict(await tierAYield(db)))
  else {
    const companyIds = args.flatMap((a, i) => a === '--company-id' && args[i + 1] ? [args[i + 1]!] : [])
    if (!companyIds.length) throw new Error('Select companies with --company-id; discovery/ranking is a separate preparation stage.')
    const limit = preparationLimit(args.includes('--limit') ? Number(value('--limit')) : 20)
    const maxPages = preparationLimit(args.includes('--max-pages') ? Number(value('--max-pages')) : 4, 8)
    const config = env(), gate = new FetchPolicyGate(db, { userAgent: config.USER_AGENT, robotsTtlSeconds: config.ROBOTS_CACHE_TTL_SECONDS, defaultRateDelayMs: config.DEFAULT_HOST_RATE_DELAY_MS })
    const out = await prepareRecipients(db, gate, companyIds, { limit, maxPages, interPageDelayMs: config.DEFAULT_HOST_RATE_DELAY_MS })
    console.log(JSON.stringify(out, null, 2))
    console.log('Manual research tasks are resumable. Automatic execution remains isolation_blocked; no approval or sending occurred.')
  }
} finally { await disconnectPrisma() }
