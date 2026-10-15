import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createOfflineSubscriptionFixture } from '../helpers/joboss-offline-runner.js'

const request = { provider: 'codex' as const, timeoutMs: 500 }
const fixtureDirectories: string[] = []
afterEach(async () => { for (const dir of fixtureDirectories.splice(0)) await rm(dir, { recursive: true, force: true }) })
function alive(pid: number) { try { process.kill(pid, 0); return true } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false; throw error } }

describe('R-A5: entire owned process group stops before packet cleanup', () => {
  it.each(['timeout', 'overflow'])('terminates an ignoring, stream-disconnected descendant even when its parent exits on SIGTERM: %s', async (mode) => {
    const fixture = await mkdtemp(join(tmpdir(), 'joboss-owned-process-fixture-')); fixtureDirectories.push(fixture)
    const pidPath = join(fixture, 'descendant.pid')
    let cwd = ''
    const descendantCode = `require('node:fs').writeFileSync(${JSON.stringify(pidPath)},String(process.pid));process.on('SIGTERM',()=>{});setInterval(()=>{},1000)`
    const script = `const {spawn}=require('node:child_process');const fs=require('node:fs');fs.writeFileSync(${JSON.stringify(join(fixture, 'parent.pid'))},String(process.pid));const d=spawn(process.execPath,['-e',${JSON.stringify(descendantCode)}],{stdio:'ignore'});d.unref();process.on('SIGTERM',()=>process.exit(0));${mode === 'overflow' ? "setTimeout(()=>process.stdout.write('x'.repeat(1000001)),300);" : ''}setInterval(()=>{},1000)`
    const execute = createOfflineSubscriptionFixture({ command: (_req, directory) => { cwd = directory; return { command: process.execPath, args: ['-e', script] } } })
    const result = await execute({ ...request, timeoutMs: mode === 'timeout' ? 500 : 5000 })
    const descendantPid = Number(await readFile(pidPath, 'utf8'))
    const parentPid = Number(await readFile(join(fixture, 'parent.pid'), 'utf8'))
    try {
      expect(result).toMatchObject({ ok: false, state: mode === 'timeout' ? 'timed_out' : 'failed' })
      expect(alive(descendantPid)).toBe(false)
      expect(alive(parentPid)).toBe(false)
      expect(existsSync(cwd)).toBe(false)
    } finally {
      // Only this fixture's own PIDs, if a regression occurs; never scan user processes.
      if (alive(descendantPid)) process.kill(descendantPid, 'SIGKILL')
      if (alive(parentPid)) process.kill(parentPid, 'SIGKILL')
    }
  })
  it('cleans its own temporary artifacts after a launch failure', async () => {
    let cwd = ''
    const execute = createOfflineSubscriptionFixture({ command: (_req, directory) => { cwd = directory; return { command: join(directory, 'missing-executable'), args: [] } } })
    expect(await execute(request)).toMatchObject({ ok: false, state: 'failed' })
    expect(existsSync(cwd)).toBe(false)
  })
})
