import { createInterface } from 'node:readline'
import { createPrismaClient } from '../../src/core/db/client.js'
import { HandoffLlmGateway } from '../../src/core/llm/handoff-gateway.js'
import { configuredTestTarget, verifyTestTarget } from './test-target.js'

const target = configuredTestTarget()
await verifyTestTarget(target)
const db = createPrismaClient(target.url)
const connected = await db.$queryRaw<Array<{ name: string }>>`SELECT current_database() AS name`
if (connected[0]?.name !== target.database) { await db.$disconnect(); throw new Error('Enqueue child database mismatch') }
const lines = createInterface({ input: process.stdin })
process.stdout.write('READY\n')
for await (const line of lines) {
  if (line === 'GO') {
    try {
      const result = await new HandoffLlmGateway(db).enqueue({ kind: 'research_urls', promptVersion: 'research_urls@1',
        subjectType: 'Company', subjectId: 'independent-process-race', input: {}, allowedEvidenceIds: [] })
      process.stdout.write(JSON.stringify(result) + '\n')
    } finally { await db.$disconnect(); lines.close() }
    break
  }
}
