import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'
import { config as loadDotenv } from 'dotenv'
loadDotenv({ quiet: true })
const url = process.env.TEST_DATABASE_URL
if (!url || new URL(url).pathname !== '/outreach_test_joboss_b') throw new Error('B tests require their dedicated database')
const live = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null
const test = new URL(url)
if (live && live.pathname === test.pathname && live.hostname === test.hostname && (live.port || '5432') === (test.port || '5432')) throw new Error('B database must differ from live')
process.env.JOBOSS_B_LIVE_DATABASE_ID = live ? `${live.hostname}:${live.port || '5432'}${live.pathname}` : ''
export default defineConfig({
  resolve: { alias: [{ find: /^\.\.\/helpers\/db\.js$/, replacement: fileURLToPath(new URL('./db.ts', import.meta.url)) }] },
  test: {
    globalSetup: ['./test/global-setup.ts'], setupFiles: ['./test/setup.ts'],
    fileParallelism: false, testTimeout: 30_000, hookTimeout: 60_000,
    include: ['test/delivery/**/*.test.ts', 'test/policy/outcome-ingestion.test.ts',
      'test/policy/send-gate.test.ts', 'test/policy/owned-inbox.test.ts',
      'test/unit/classify-outcome.test.ts', 'test/integration/send-attempt-indexes.test.ts'],
  },
})
