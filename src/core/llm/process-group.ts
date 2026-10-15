import { setTimeout as delay } from 'node:timers/promises'

/** Only used with a detached child PID created by this runner, never discovered user processes. */
export function ownedProcessGroupExists(pid: number): boolean {
  try { process.kill(-pid, 0); return true }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false
    throw error
  }
}
function signal(pid: number, value: NodeJS.Signals): void {
  try { process.kill(-pid, value) }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error }
}

/** Escalation is independent of parent close. Resolve only once the entire group is gone. */
export async function terminateOwnedProcessGroup(pid: number): Promise<boolean> {
  signal(pid, 'SIGTERM')
  const graceEnd = Date.now() + 1000
  while (Date.now() < graceEnd) {
    if (!ownedProcessGroupExists(pid)) return true
    await delay(20)
  }
  signal(pid, 'SIGKILL')
  const killEnd = Date.now() + 5000
  while (Date.now() < killEnd) {
    if (!ownedProcessGroupExists(pid)) return true
    await delay(20)
  }
  return !ownedProcessGroupExists(pid)
}
