import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'
import { configuredTestTarget } from '../helpers/test-target.js'
import { config as loadDotenv } from 'dotenv'
loadDotenv({ quiet: true })
const target = configuredTestTarget()
if (target.database !== 'outreach_test_joboss_b') throw new Error('B tests require their dedicated database')
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
