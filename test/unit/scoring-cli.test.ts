import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * RS-02, coupled to the entrypoint source: `intel:run` must not create or activate a
 * score version before any company passes the scorer's guards. Only a successful
 * guarded `scoreCompanyAndPersist` may initialize its version, inside its own
 * transaction. The B-guarded behaviour is in test/integration/scorer-s.test.ts.
 */
describe('intel:run startup is observational about the score version', () => {
  const cli = readFileSync('tools/run-intelligence.ts', 'utf8')

  it('never creates or activates a score version outside the guarded scorer', () => {
    expect(cli).not.toMatch(/ensureScoreVersion|\.scoreVersion\b/)
    expect(cli.match(/scoreCompanyAndPersist\(/g)).toHaveLength(1)
  })

  it('announces the requested version without claiming it is in use', () => {
    const line = cli.split('\n').find((l) => l.includes('ACTIVE_SCORE_VERSION.label'))
    expect(line).toMatch(/Requested score version/)
  })
})
