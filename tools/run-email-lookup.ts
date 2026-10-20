#!/usr/bin/env tsx
import 'dotenv/config'
import { emailLookupPlan, emailLookupBounds } from '../src/outreach/contacts/email-lookup.js'
import { preparationLimit } from '../src/outreach/review/context.js'

export function emailLookupDryRun(args: string[]) {
  if (!args.includes('--dry-run')) throw new Error('email_lookup_requires_authorized_run')
  const flags = new Map<string, string>()
  const usage = () => new Error('usage: --company-id <id> --dry-run [--people 1-100]')
  for (let i = 0; i < args.length; i++) {
    const flag = args[i]!
    if (!['--company-id', '--dry-run', '--people'].includes(flag) || flags.has(flag)) throw usage()
    if (flag === '--dry-run') { flags.set(flag, 'true'); continue }
    const value = args[++i]
    if (!value?.trim() || value.startsWith('--')) throw usage()
    flags.set(flag, value)
  }
  const companyId = flags.get('--company-id'), count = flags.get('--people') ?? '1'
  if (!companyId || !/^\d+$/.test(count)) throw usage()
  const people = preparationLimit(Number(count)), calls = emailLookupPlan(), bounds = emailLookupBounds(calls, people)
  return { companyId, dryRun: true, execution: 'isolation_blocked', people,
    order: ['cache', 'page_published', ...calls.map((s) => `${s.provider}.${s.operation}`)],
    plannedCalls: bounds.perPerson.calls, perPerson: bounds.perPerson, aggregate: bounds.aggregate,
    worstCaseCredits: Object.fromEntries(Object.entries(bounds.perPerson.providers).map(([p, v]) => [p, v.credits])),
    blockedProviders: [{ provider: 'prospeo', reason: 'free_plan_UNCONFIRMED' }],
    qualification: 'Structural maxima, not person selection, free entitlements or run authorization; intersect with balances, windows and research headroom.',
    blockers: ['explicit later authorized run required', 'Prospeo free enrichment access UNCONFIRMED', 'dashboard free balances and reset windows required'], vendorCredits: 0, billedUsd: 0 }
}
if (process.argv[1]?.endsWith('/run-email-lookup.ts')) {
  try { console.log(JSON.stringify(emailLookupDryRun(process.argv.slice(2)), null, 2)) }
  catch (error) { console.error(error instanceof Error ? error.message : 'email_lookup_requires_authorized_run'); process.exitCode = 2 }
}
