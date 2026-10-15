'use server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { db } from '../lib/db.js'
import { reviewAction } from '../../src/outreach/review/actions.js'

export async function decideOutreach(form: FormData): Promise<void> {
  const draftId = String(form.get('draftId') ?? ''), snapshot = String(form.get('snapshot') ?? ''), by = String(form.get('by') ?? '')
  const action = form.get('decision')
  if (!/^[a-zA-Z0-9-]+$/.test(draftId) || !/^[a-f0-9]{64}$/.test(snapshot) || (action !== 'approve' && action !== 'revoke')) throw new Error('Invalid review decision.')
  const result = await reviewAction(db, { draftId, snapshot, by, action })
  revalidatePath('/outreach'); revalidatePath(`/outreach/${draftId}`)
  redirect(`/outreach/${draftId}?message=${encodeURIComponent(result.detail)}&result=${result.ok ? 'ok' : 'refused'}`)
}
