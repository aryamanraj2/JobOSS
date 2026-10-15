import { readFileSync, writeFileSync } from 'node:fs'
import { testDb, closeTestDb } from '../../helpers/db.ts'
import { configuredTestTarget, verifyTestTarget } from '../../helpers/test-target.ts'
const target = configuredTestTarget()
if (target.database !== 'outreach_test_joboss_d') throw new Error('D preview only')
await verifyTestTarget(target)
const preview = JSON.parse(readFileSync('scratch/joboss-d/preview.json', 'utf8'))
const db = testDb()
const draft = await db.draft.findUniqueOrThrow({ where: { id: preview.readyDraftId }, include: { contact: true } })
if (draft.contact?.emailNormalized !== 'jamie@ready.example' || draft.approvedAt) throw new Error('Unexpected synthetic preview state')
await db.contact.update({ where: { id: draft.contactId }, data: { publicTitle: 'CTO (synthetic changed snapshot)' } })
writeFileSync('scratch/joboss-d/browser-snapshot-change.json', JSON.stringify({ draftId: draft.id, company: 'ReadyCo', target: target.database, field: 'Contact.publicTitle', changedForUiRefusal: true }, null, 2))
console.log('Changed synthetic D recipient for browser refusal verification; no live data or approval.')
await closeTestDb()
