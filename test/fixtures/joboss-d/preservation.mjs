import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { parse } from 'dotenv'
import { Client } from 'pg'
import { configuredTestTarget, verifyTestTarget } from '../../helpers/test-target.ts'
import { canonicalJson } from '../../../src/core/evidence/content-hash.ts'
import { MILESTONE_STAGE } from '../../../src/core/config/stage.ts'
const settings = parse(readFileSync('.env')), baseline = JSON.parse(readFileSync('scratch/joboss-baseline-20261014/protected-state.json', 'utf8'))
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
const targetUrl = new URL(settings.DATABASE_URL); targetUrl.pathname = '/outreach_test_joboss_d'
const source = { ...process.env, TEST_DATABASE_URL: targetUrl.href }
const target = configuredTestTarget(source); await verifyTestTarget(target)
async function inspect(url, test) {
  const client = new Client({ connectionString: url }); await client.connect(); await client.query('BEGIN READ ONLY')
  try {
    const name = (await client.query('SELECT current_database() AS name')).rows[0].name
    const indexRows = (await client.query("SELECT indexname, indexdef FROM pg_indexes WHERE schemaname='public' AND indexname=ANY($1) ORDER BY indexname", [baseline.indexes.map((r) => r.indexname)])).rows
    const indexesMatch = indexRows.length === 11 && baseline.indexes.every((r) => indexRows.some((i) => canonicalJson(r) === canonicalJson(i)))
    const migrations = (await client.query('SELECT migration_name, checksum FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name')).rows
    const expectedMigrations = readdirSync('prisma/migrations').filter((name) => existsSync(`prisma/migrations/${name}/migration.sql`))
    if (test) return { name, indexes: indexRows.length, indexesMatch, migrations: migrations.length,
      migrationsMatch: migrations.length === 13 && expectedMigrations.length === 13 && migrations.every((m) => m.checksum === hash(readFileSync(`prisma/migrations/${m.migration_name}/migration.sql`))), checksums: migrations }
    const drafts = (await client.query('SELECT id, lead_id, contact_id, touch_slot, status, subject, body_text, composition, approval_hash, approved_by, approved_at, prompt_version, cited_evidence_ids, approved_claim_ids FROM draft ORDER BY id')).rows
    return { name, drafts: drafts.length, fields: Object.keys(baseline.drafts[0]).length,
      draftsMatch: drafts.length === 57 && baseline.drafts.every((r) => drafts.some((d) => d.id === r.id && canonicalJson(d) === canonicalJson(r))), indexes: indexRows.length, indexesMatch,
      attempts: (await client.query('SELECT count(*)::int AS n FROM send_attempt')).rows[0].n,
      jobossMigrations: migrations.filter((m) => m.migration_name.includes('joboss')).length }
  } finally { await client.query('ROLLBACK'); await client.end() }
}
const live = await inspect(settings.DATABASE_URL, false), test = await inspect(target.url, true)
const manifest = JSON.parse(readFileSync('scratch/joboss-d/baseline-files.json', 'utf8'))
const changed = Object.entries(manifest.files).filter(([file, checksum]) => !existsSync(file) || hash(readFileSync(file)) !== checksum).map(([file]) => file)
const output = { live, test, stage: MILESTONE_STAGE, sendingEnabled: settings.SENDING_ENABLED === 'true', externalEnabled: settings.SEND_EXTERNAL_RECIPIENTS_ENABLED === 'true',
  headMatch: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() === manifest.head,
  indexMatch: hash(readFileSync('.git/index')) === manifest.index, envMatch: hash(readFileSync('.env')) === manifest.env, changed }
writeFileSync('scratch/joboss-d/preservation.json', JSON.stringify(output, null, 2)); console.log(JSON.stringify(output, null, 2))
if (!live.draftsMatch || !live.indexesMatch || live.attempts || live.jobossMigrations || !test.indexesMatch || !test.migrationsMatch || !output.headMatch || !output.indexMatch || !output.envMatch || output.sendingEnabled || output.externalEnabled || MILESTONE_STAGE !== 'F5') process.exitCode = 1
