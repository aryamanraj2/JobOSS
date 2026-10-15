import { configuredTestTarget } from './test-target.js'
import { createPrismaClient, type PrismaClient } from '../../src/core/db/client.js'

const TABLES = [
  'funding_record', 'discovery_run', 'outreach_assessment', 'contact_research', 'preparation_run',
  'audit_log', 'secret_record', 'kill_switch', 'robots_cache', 'host_policy',
  'research_budget', 'suppression', 'opt_out', 'bounce', 'reply', 'delivery_event',
  'send_attempt', 'draft', 'lead', 'application_packet', 'research_brief',
  'contact', 'opportunity', 'company_signal', 'evidence', 'company',
  'role_track', 'resume_version', 'approved_claim', 'candidate_profile',
  'score_version', 'lead_hint', 'llm_task',
]

let client: PrismaClient | undefined

/** Fail closed before any test database writes, including truncation. */
export function assertSafeTestDatabase(): string {
  return configuredTestTarget().url
}

export function testDb(): PrismaClient {
  if (!client) {
    const url = assertSafeTestDatabase()
    client = createPrismaClient(url)
  }
  return client
}

export async function truncateAll(): Promise<void> {
  assertSafeTestDatabase()
  const db = testDb()
  const identity = await db.$queryRaw<Array<{ name: string }>>`SELECT current_database() AS name`
  if (identity[0]?.name !== configuredTestTarget().database) throw new Error('Refusing truncation outside the validated selected test target')
  await db.$executeRawUnsafe(
    `TRUNCATE TABLE ${TABLES.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`,
  )
}

export async function closeTestDb(): Promise<void> {
  if (client) {
    await client.$disconnect()
    client = undefined
  }
}
