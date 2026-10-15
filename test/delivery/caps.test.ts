import { describe, expect, it, vi } from 'vitest'
import { capsForStage, checkCaps } from '../../src/outreach/send/caps.js'
import type { Db } from '../../src/core/audit/audit-log.js'

describe('delivery cap preservation', () => {
  it('retains the conservative pilot floor without automatic escalation', () => {
    expect(capsForStage('F6')).toEqual({ perDay: 5, perDomainPerDay: 3 })
    expect(capsForStage('F7')).toEqual({ perDay: 5, perDomainPerDay: 3 })
  })
  it.each([5, 10, 20])('enforces an explicitly selected %i/day ramp cap including ambiguous attempts', async (perDay) => {
    const count = vi.fn().mockResolvedValueOnce(perDay - 1).mockResolvedValueOnce(0)
      .mockResolvedValueOnce(perDay)
    const db = { sendAttempt: { count } } as unknown as Db
    const opts = { caps: { perDay, perDomainPerDay: 3 } }
    expect((await checkCaps(db, 'person@example.com', opts)).allowed).toBe(true)
    expect(await checkCaps(db, 'person@example.com', opts)).toMatchObject({ allowed: false, reason: 'cap_exceeded' })
    expect(count.mock.calls[0]?.[0].where.status).toEqual({ in: ['sent', 'in_flight'] })
  })
})
