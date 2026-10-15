import { execFileSync } from 'node:child_process'
import { describe, expect, it, vi } from 'vitest'
import { APPROVED_TEST_DATABASES, configuredTestTarget, validateTestTarget } from '../helpers/test-target.js'
import { deployTestMigrations } from '../global-setup.js'
import { truncateAll } from '../helpers/db.js'
import * as database from '../../src/core/db/client.js'
import { Client } from 'pg'

const live = ['loopback:5432/outreach_dev']
describe('R-A1: test target safety before any migration or fixture write', () => {
  it.each(APPROVED_TEST_DATABASES)('accepts only the approved local target %s', (name) => {
    expect(validateTestTarget(`postgresql://user:password@localhost/${name}`, live).database).toBe(name)
  })
  it.each([
    'postgresql://localhost/outreach_dev', 'postgresql://localhost/customer_test_data',
    'postgresql://localhost/outreach_test_joboss_unknown', 'postgresql://remote.example/outreach_test_joboss_a',
    'https://localhost/outreach_test_joboss_a', 'file:///outreach_test_joboss_a',
    'postgresql://localhost/%6futreach_test_joboss_a', 'postgresql://localhost/outreach_test_joboss_a?database=outreach_dev',
    'postgresql://localhost/outreach_test_joboss_a?host=remote.example', 'postgresql://localhost/outreach_test_joboss_a#other',
  ])('refuses invalid/remote/unapproved/overridden target %s', (url) => {
    expect(() => validateTestTarget(url, live)).toThrow()
  })
  it.each(['localhost', '127.0.0.1', '[::1]'])('excludes aliases for the configured live database at %s', (host) => {
    expect(() => validateTestTarget(`postgresql://${host}/outreach_test_joboss_a`, ['loopback:5432/outreach_test_joboss_a'])).toThrow(/distinct/)
  })
  it('does not permit NODE_ENV or environment substitution to erase the captured live identity', () => {
    const source = { TEST_DATABASE_URL: 'postgresql://localhost/outreach_test_joboss_a', DATABASE_URL: 'postgresql://localhost/outreach_test_joboss_ra' }
    configuredTestTarget(source)
    source.DATABASE_URL = source.TEST_DATABASE_URL
    source.TEST_DATABASE_URL = 'postgresql://127.0.0.1/outreach_test_joboss_ra'
    expect(() => configuredTestTarget(source)).toThrow(/distinct/)
  })
  it('requires independently captured live identity, even for a syntactically safe target', () => {
    expect(() => validateTestTarget('postgresql://localhost/outreach_test_joboss_a', [])).toThrow(/distinct/)
  })
  it('global setup does not launch migration or identity probe for an unsafe target', async () => {
    const launch = vi.fn(), verify = vi.fn().mockResolvedValue(undefined)
    await expect(deployTestMigrations({ TEST_DATABASE_URL: 'postgresql://localhost/outreach_dev', DATABASE_URL: 'postgresql://localhost/outreach_dev' }, launch as unknown as typeof execFileSync, verify)).rejects.toThrow()
    expect(launch).not.toHaveBeenCalled()
    expect(verify).not.toHaveBeenCalled()
  })
  it('global setup checks actual identity before migration and preserves the live connection setting', async () => {
    const sequence: string[] = []
    const source = { TEST_DATABASE_URL: 'postgresql://localhost/outreach_test_joboss_a', DATABASE_URL: 'postgresql://localhost/outreach_dev' }
    const launch = vi.fn((_file, _args, options) => { sequence.push('deploy'); expect(options.env.DATABASE_URL).toBe(source.TEST_DATABASE_URL) })
    await deployTestMigrations(source, launch as unknown as typeof execFileSync, async (target) => { sequence.push('identity'); expect(target.database).toBe('outreach_test_joboss_a') })
    expect(sequence).toEqual(['identity', 'deploy'])
    expect(source.DATABASE_URL).toBe('postgresql://localhost/outreach_dev')
  })
  it('does not launch migration when the actual identity check fails', async () => {
    const launch = vi.fn()
    await expect(deployTestMigrations({ TEST_DATABASE_URL: 'postgresql://localhost/outreach_test_joboss_a', DATABASE_URL: 'postgresql://localhost/outreach_dev' }, launch as unknown as typeof execFileSync, async () => { throw new Error('Connected database mismatch') })).rejects.toThrow('mismatch')
    expect(launch).not.toHaveBeenCalled()
  })
})


describe('C1/C2: conservative live-name exclusion and portable selected targets', () => {
  it.each([
    'localhost.', 'LOCALHOST.', 'localhost', '127.0.0.1', '[::1]',
    '127.000.000.001', 'db.internal.example', 'ambiguous-alias',
  ])('refuses same-name live alias %s before any probe/migration/fixture connection', async (host) => {
    const source = { TEST_DATABASE_URL: 'postgresql://localhost/outreach_test_joboss_ra', DATABASE_URL: `postgresql://${host}:6543/outreach_test_joboss_ra` }
    const migrate = vi.fn(), verify = vi.fn(), connect = vi.spyOn(Client.prototype, 'connect')
    const create = vi.spyOn(database, 'createPrismaClient')
    try {
      expect(() => configuredTestTarget(source)).toThrow(/distinct/)
      await expect(deployTestMigrations(source, migrate as unknown as typeof execFileSync, verify)).rejects.toThrow(/distinct/)
      vi.stubEnv('TEST_DATABASE_URL', source.TEST_DATABASE_URL)
      vi.stubEnv('DATABASE_URL', source.DATABASE_URL)
      vi.stubEnv('JOBOSS_TEST_LIVE_IDENTITIES', JSON.stringify([`${host}:6543/outreach_test_joboss_ra`]))
      await expect(truncateAll()).rejects.toThrow(/distinct/)
      for (const spy of [migrate, verify, connect, create]) expect(spy).not.toHaveBeenCalled()
    } finally { vi.unstubAllEnvs(); vi.restoreAllMocks() }
  })
  it.each(['localhost.', 'LOCALHOST', '127.0.0.1', '[::1]'])('excludes live default-port/case/loopback form %s', async (host) => {
    const migrate = vi.fn(), verify = vi.fn()
    await expect(deployTestMigrations({ TEST_DATABASE_URL: 'postgresql://localhost:5432/outreach_test_joboss_a', DATABASE_URL: `postgresql://${host}/outreach_test_joboss_a` }, migrate as unknown as typeof execFileSync, verify)).rejects.toThrow(/distinct/)
    expect(migrate).not.toHaveBeenCalled(); expect(verify).not.toHaveBeenCalled()
  })
  it.each(['{}', 'null', '1', '"loopback:5432/outreach_dev"', '[]', '[null]', '[{}]', '["indeterminate"]', '["loopback:0/outreach_dev"]', '["user@host:5432/outreach_dev"]'])('fails closed on malformed/indeterminate captured identity %s', async (saved) => {
    const migrate = vi.fn(), verify = vi.fn()
    await expect(deployTestMigrations({ TEST_DATABASE_URL: 'postgresql://localhost/outreach_test_joboss_a', DATABASE_URL: 'postgresql://localhost/outreach_dev', JOBOSS_TEST_LIVE_IDENTITIES: saved }, migrate as unknown as typeof execFileSync, verify)).rejects.toThrow(/identity/)
    expect(migrate).not.toHaveBeenCalled(); expect(verify).not.toHaveBeenCalled()
  })
  it.each(['not a URL', 'file:///outreach_dev', 'postgresql://localhost/', 'postgresql://localhost/outreach_dev?host=other', 'postgresql://localhost/%ZZ'])('refuses indeterminate configured live identity without connecting: %s', (liveUrl) => {
    expect(() => configuredTestTarget({ TEST_DATABASE_URL: 'postgresql://localhost/outreach_test_joboss_a', DATABASE_URL: liveUrl })).toThrow(/identity/)
  })
  it.each(APPROVED_TEST_DATABASES)('selects portable child/parent target %s when the independent live name differs', async (name) => {
    const source = { TEST_DATABASE_URL: `postgresql://localhost/${name}`, DATABASE_URL: 'postgresql://LOCALHOST.:6432/outreach_dev' }
    const selected = configuredTestTarget(source)
    expect(selected.database).toBe(name)
    const migrate = vi.fn(), verify = vi.fn().mockResolvedValue(undefined)
    await deployTestMigrations(source, migrate as unknown as typeof execFileSync, verify)
    expect(verify).toHaveBeenCalledWith(selected)
    expect(migrate.mock.calls[0]?.[2]?.env.DATABASE_URL).toBe(selected.url)
  })
})
