#!/usr/bin/env tsx
import { pathToFileURL } from 'node:url'
import { parsePreparationArgs } from '../src/outreach/preparation/cli.js'
/** Import-safe entrypoint. CLI validation precedes dotenv, DB and gate setup. */
export async function main(args = process.argv.slice(2)) {
  const request = parsePreparationArgs(args)
  await import('dotenv/config')
  const [{ prisma, disconnectPrisma }, { env }, { FetchPolicyGate }, { prepareOutreach }, { preparationStatus }] = await Promise.all([
    import('../src/core/db/client.js'), import('../src/core/config/config.js'), import('../src/core/policy/fetch-policy-gate.js'),
    import('../src/outreach/preparation/run.js'), import('../src/outreach/preparation/status.js'),
  ])
  const config = env(), db = prisma()
  try {
    if (request.statusOnly) { console.log(JSON.stringify(await preparationStatus(db, request.runId!), null, 2)); return }
    const gate = new FetchPolicyGate(db, { userAgent: config.USER_AGENT, robotsTtlSeconds: config.ROBOTS_CACHE_TTL_SECONDS, defaultRateDelayMs: config.DEFAULT_HOST_RATE_DELAY_MS })
    const result = await prepareOutreach(db, gate, config.DATABASE_URL, request)
    console.log(`Preparation ${result.runId}: ${result.status}\nReview/status handoff: ${result.reviewUrl}\nNo browser was opened. No email was approved or sent.`)
    const status=await preparationStatus(db,result.runId)
    if(status){console.log(status.discoveryMessage);for(const gap of status.discoveryGaps)console.log(`${gap.source}: ${gap.reason}; remaining scope: ${JSON.stringify(gap.remaining)}`)}
    console.log(`Resume: npm run outreach:prepare -- --resume --run-id ${result.runId}`)
    console.log('Automatic execution remains isolation_blocked. Use llm:next / llm:fulfil for this run’s recorded manual tasks.')
  } finally { await disconnectPrisma() }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error instanceof Error ? error.message : 'Preparation failed'); process.exitCode = 1 })
}
