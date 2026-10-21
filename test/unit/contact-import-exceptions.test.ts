import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it, vi } from 'vitest'
import type { Db } from '../../src/core/audit/audit-log.js'
import {
  CONTACT_IMPORT_COLUMNS, importContactRow, importContacts, readHumanApprovedExceptions,
} from '../../src/outreach/contacts/import.js'
import { readProviderVerdict } from '../../src/outreach/contacts/verify-backfill.js'
import { parseCsv } from '../../src/ingest/file/csv.js'

const approvalPath = 'scratch/joboss-contacts-manual-02/approved-pairs.json'
const approvals = readHumanApprovedExceptions(approvalPath)
const opts = { provider: 'human-supplied', operator: 'fixture', humanApprovedExceptions: approvals }
const now = new Date('2026-10-20T00:00:00Z')
const dir = mkdtempSync(join(tmpdir(), 'manual-contact-exceptions-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))
let counter = 0
function csv(lines: string[]) {
  const file = join(dir, `input-${counter++}.csv`)
  writeFileSync(file, CONTACT_IMPORT_COLUMNS.join(',') + '\n' + lines.join('\n') + '\n')
  return file
}
function line(domain = 'aidyhq.com', email = 'peter.crocker@aidygrants.com') {
  return `${domain},${email},,Co-founder,named_employee,hunter.io,https://unconfirmed.example/person,,valid`
}
function row(domain?: string, email?: string) {
  return parseCsv(CONTACT_IMPORT_COLUMNS.join(',') + '\n' + line(domain, email)).rows[0]!
}
function fakeDb() {
  const mocks = {
    company: { findUnique: vi.fn(async ({ where }: { where: { canonicalDomain: string } }) => ({ id: `company-${where.canonicalDomain}`, displayName: where.canonicalDomain })) },
    contact: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: 'contact-new' }) },
    evidence: { create: vi.fn().mockResolvedValue({ id: 'evidence-new' }) },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  }
  return { mocks, db: mocks as unknown as Db }
}

describe('explicit human-approved contact import exceptions (no DB or network)', () => {
  it('still refuses off-domain rows by default, even with a human provider and valid status', async () => {
    const { db, mocks } = fakeDb()
    expect((await importContactRow(db, row(), { provider: 'human-supplied', operator: 'fixture' }, now)).outcome).toBe('off_domain')
    expect(mocks.contact.create).not.toHaveBeenCalled()
    expect(mocks.evidence.create).not.toHaveBeenCalled()
    expect(mocks.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'contact.import_refused' }) }))
  })

  it.each(approvals.pairs)('accepts only the approved pair $domain / $email as unverified', async ({ domain, email }) => {
    const { db, mocks } = fakeDb()
    expect((await importContactRow(db, row(domain, email), opts, now)).outcome).toBe('imported')
    expect(mocks.contact.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ companyId: `company-${domain}`, emailNormalized: email, verified: false, identitySourceUrl: null, fullName: null }) }))
  })

  it('refuses an unlisted email on an approved alternate domain', async () => {
    const { db, mocks } = fakeDb()
    expect((await importContactRow(db, row('aidyhq.com', 'other@aidygrants.com'), opts, now)).outcome).toBe('off_domain')
    expect(mocks.contact.create).not.toHaveBeenCalled()
  })

  it('refuses an approved email associated with another company', async () => {
    const { db, mocks } = fakeDb()
    expect((await importContactRow(db, row('driver.ai', 'peter.crocker@aidygrants.com'), opts, now)).outcome).toBe('off_domain')
    expect(mocks.contact.create).not.toHaveBeenCalled()
  })

  it('cannot turn exception rows into provider-valid contacts or captured person evidence', async () => {
    const { db, mocks } = fakeDb()
    await importContactRow(db, row(), { ...opts, provider: 'hunter.io', providerApi: true }, now)
    const evidence = mocks.evidence.create.mock.calls[0]![0].data
    expect(evidence).toMatchObject({ sourceUrl: 'operator-entry://human-supplied/fixture', sourceType: 'user_hint', fetchedVia: 'user_hint' })
    expect(evidence.excerpt).toContain('Human-approved exact-pair exception: aidyhq.com + peter.crocker@aidygrants.com')
    expect(evidence.excerpt).toContain(approvals.approvalReference)
    expect(readProviderVerdict({ excerpt: evidence.excerpt, sourceUrl: evidence.sourceUrl, emailNormalized: 'peter.crocker@aidygrants.com' }).ok).toBe(false)
    expect(mocks.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'contact.created', metadata: expect.objectContaining({ provider: 'human-supplied', verified: false, humanApprovedException: { domain: 'aidyhq.com', email: 'peter.crocker@aidygrants.com', approvalReference: approvals.approvalReference } }) }) }))
  })

  it('dry-runs all seven approved rows without contact, evidence or audit writes', async () => {
    const { db, mocks } = fakeDb()
    const file = csv(approvals.pairs.map(p => line(p.domain, p.email)))
    const result = await importContacts(db, file, { ...opts, dryRun: true })
    expect(result.counts.imported).toBe(7)
    expect(mocks.contact.create).not.toHaveBeenCalled()
    expect(mocks.evidence.create).not.toHaveBeenCalled()
    expect(mocks.auditLog.create).not.toHaveBeenCalled()
  })

  it('skips an existing approved contact without changing it or adding row evidence', async () => {
    const { db, mocks } = fakeDb()
    mocks.contact.findUnique.mockResolvedValue({ id: 'existing' })
    expect((await importContactRow(db, row(), opts, now)).outcome).toBe('already_present')
    expect(mocks.contact.create).not.toHaveBeenCalled()
    expect(mocks.evidence.create).not.toHaveBeenCalled()
    expect(mocks.auditLog.create).not.toHaveBeenCalled()
  })

  it('preserves provider-valid behavior for unrelated own-domain imports', async () => {
    const { db, mocks } = fakeDb()
    await importContactRow(db, row('driver.ai', 'person@driver.ai'), opts, now)
    expect(mocks.contact.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ verified: true }) }))
  })

  it.each([
    { domain: '*.aidyhq.com', email: 'peter.crocker@aidygrants.com' },
    { domain: 'aidyhq.com', email: '*@aidygrants.com' },
  ])('rejects wildcard approval input: $domain / $email', pair => {
    const file = join(dir, `approval-${counter++}.json`)
    writeFileSync(file, JSON.stringify({ approvalReference: approvals.approvalReference, pairs: [pair] }))
    expect(() => readHumanApprovedExceptions(file)).toThrow()
  })

  it('keeps the task input limited to exactly seven distinct approved pairs', () => {
    expect(approvals.pairs).toHaveLength(7)
    expect(new Set(approvals.pairs.map(p => `${p.domain}:${p.email}`)).size).toBe(7)
    expect(readFileSync(approvalPath, 'utf8')).not.toContain('wgarman702')
    expect(readFileSync(approvalPath, 'utf8')).not.toContain('me.yashasvijain')
  })
})
