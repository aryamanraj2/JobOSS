// Process-only D target. Shared guards capture live identity before substitution.
import { readFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { parse } from 'dotenv'
import { configuredTestTarget, verifyTestTarget } from '../../helpers/test-target.ts'
const settings = parse(readFileSync('.env'))
const url = new URL(settings.DATABASE_URL)
url.pathname = '/outreach_test_joboss_d'
const source = { ...process.env, ...settings, TEST_DATABASE_URL: url.href }
const target = configuredTestTarget(source)
await verifyTestTarget(target)
source.DATABASE_URL = target.url
const [command, ...args] = process.argv.slice(2)
if (!command) throw new Error('Command required')
const child = spawn(command, args, { env: source, stdio: 'inherit' })
child.on('exit', (code) => { process.exitCode = code ?? 1 })
