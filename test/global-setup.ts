import { execFileSync } from 'node:child_process'
import { config as loadDotenv } from 'dotenv'
import { configuredTestTarget, verifyTestTarget } from './helpers/test-target.js'

/**
 * Applies migrations to the test database once per run.
 *
 * `migrate deploy` rather than `db push`: the two partial unique indexes in
 * prisma/migrations/*_partial_unique_indexes cannot be expressed in schema.prisma,
 * and db push would report them as drift and offer to drop them. Running deploy
 * here means the suite exercises exactly the migration path production uses.
 */
export async function deployTestMigrations(
  source: NodeJS.ProcessEnv = process.env,
  deploy: typeof execFileSync = execFileSync,
  verify: typeof verifyTestTarget = verifyTestTarget,
): Promise<void> {
  const target = configuredTestTarget(source)
  await verify(target)
  deploy('npx', ['prisma', 'migrate', 'deploy'], {
    env: { ...source, DATABASE_URL: target.url }, stdio: 'pipe', timeout: 120_000,
  })
}

export default async function setup(): Promise<void> {
  loadDotenv({ quiet: true })
  await deployTestMigrations()
}
