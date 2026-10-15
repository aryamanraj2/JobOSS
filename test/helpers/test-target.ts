import { existsSync, readFileSync } from 'node:fs'
import { parse } from 'dotenv'
import { Client } from 'pg'

/** Named targets approved in the JOBOSS assignment packets; never a substring match. */
export const APPROVED_TEST_DATABASES = [
  'outreach_test', 'outreach_test_joboss_a', 'outreach_test_joboss_b',
  'outreach_test_joboss_c', 'outreach_test_joboss_d', 'outreach_test_joboss_ra',
] as const
export type TestTarget = { url: string; database: string; identity: string }

function databaseIdentity(url: URL): string {
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.search || url.hash ||
      !url.hostname || !/^\/[A-Za-z0-9_.%-]+$/.test(url.pathname)) throw new Error('Indeterminate live database identity')
  const database = decodeURIComponent(url.pathname.slice(1))
  if (!/^[A-Za-z0-9_.-]+$/.test(database)) throw new Error('Indeterminate live database identity')
  const host = url.hostname.toLowerCase().replace(/\.+$/, '')
  const local = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(host)
  const port = url.port || '5432'
  if (!host || !Number.isSafeInteger(Number(port)) || Number(port) < 1 || Number(port) > 65535) throw new Error('Indeterminate live database identity')
  return `${local ? 'loopback' : host}:${Number(port)}/${database}`
}

function capturedIdentity(value: unknown): { identity: string; database: string } {
  if (typeof value !== 'string') throw new Error('Invalid captured live database identity')
  const parts = /^(.+):([0-9]+)\/([A-Za-z0-9_.-]+)$/.exec(value)
  if (!parts || !/^(?:[A-Za-z0-9_.-]+|\[[A-Fa-f0-9:.]+\])$/.test(parts[1]!)) throw new Error('Invalid captured live database identity')
  try {
    const identity = databaseIdentity(new URL(`postgresql://${parts[1]}:${parts[2]}/${parts[3]}`))
    return { identity, database: parts[3]! }
  } catch { throw new Error('Invalid captured live database identity') }
}

/** Pure validation; errors never echo a connection string or credentials. */
export function validateTestTarget(input: string | undefined, liveIdentities: string[]): TestTarget {
  if (!input) throw new Error('TEST_DATABASE_URL is not set')
  let url: URL
  try { url = new URL(input) } catch { throw new Error('Invalid test database URL') }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) ||
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname.toLowerCase()) ||
      url.hash || url.search || !APPROVED_TEST_DATABASES.some((name) => url.pathname === `/${name}`)) {
    throw new Error('Unsafe test target: require a local PostgreSQL URL with an explicitly approved database name and no URL overrides')
  }
  const identity = databaseIdentity(url)
  const captured = liveIdentities.map(capturedIdentity)
  // Name exclusion is conservative across ALL endpoints: aliases/ports cannot license writes.
  if (!captured.length || captured.some((live) => live.identity === identity || live.database === url.pathname.slice(1))) {
    throw new Error('Test target must be independently distinct from configured live database name and endpoint')
  }
  return { url: input, database: url.pathname.slice(1), identity }
}

/** Capture before setup replaces DATABASE_URL; independently retain .env's live identity. */
export function configuredTestTarget(source: NodeJS.ProcessEnv = process.env): TestTarget {
  const identities = new Set<string>()
  const saved = source.JOBOSS_TEST_LIVE_IDENTITIES
  if (saved !== undefined) {
    try {
      const values: unknown = JSON.parse(saved)
      if (!Array.isArray(values) || !values.length) throw new Error('Empty or malformed capture')
      for (const value of values) identities.add(capturedIdentity(value).identity)
    }
    catch { throw new Error('Invalid captured live database identity') }
  }
  const envFile = new URL('../../.env', import.meta.url)
  const configuredLive = existsSync(envFile) ? parse(readFileSync(envFile)).DATABASE_URL : undefined
  for (const value of [configuredLive, ...(saved === undefined && source.DATABASE_URL ? [source.DATABASE_URL] : [])]) {
    if (value) {
      try { identities.add(databaseIdentity(new URL(value))) } catch { throw new Error('Invalid configured live database identity') }
    }
  }
  const target = validateTestTarget(source.TEST_DATABASE_URL, [...identities])
  source.JOBOSS_TEST_LIVE_IDENTITIES = JSON.stringify([...identities])
  return target
}

/** Read-only identity probe, shared by pre-migration and pre-fixture guards. */
export async function verifyTestTarget(target: TestTarget): Promise<void> {
  const client = new Client({ connectionString: target.url })
  await client.connect()
  try {
    await client.query('BEGIN READ ONLY')
    const result = await client.query<{ name: string }>('SELECT current_database() AS name')
    if (result.rows[0]?.name !== target.database) throw new Error('Connected database does not match the validated test target')
    await client.query('ROLLBACK')
  } finally { await client.end() }
}
