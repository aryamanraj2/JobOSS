import { senderAddress } from './headers.js'

type DsnField = { name: string; value: string; block: number }
export type DsnEvidence = {
  /** Null preserves an explicit but unreadable/unsupported recipient field. */
  recipients: Array<string | null>
  issue: string | null
}

// Apply the same action convention to every available outcome class, even when
// Status is absent. Preserve the supported failed+4 temporary-failure convention.
const ACTION_CLASSES: Readonly<Record<string, readonly string[]>> = {
  failed: ['4', '5'], delayed: ['4'],
  delivered: ['2'], relayed: ['2'], expanded: ['2'],
}

/** Conservative consistency gate over flattened DSN fields. This does not select
 * a convenient status block: mixed recipients or unbindable outcomes quarantine
 * before the existing whole-body classifier can consume another recipient's code. */
export function readDsnEvidence(body: string): DsnEvidence {
  const fields: DsnField[] = []
  let block = 0
  let previous: DsnField | undefined
  for (const line of body.replace(/\r\n/g, '\n').split('\n')) {
    if (!line.trim()) { block += 1; previous = undefined; continue }
    const field = /^[ \t]*(final-recipient|original-recipient|status|action|diagnostic-code)\b[ \t]*:(.*)$/i.exec(line)
    if (field) {
      previous = { name: field[1]!.toLowerCase(), value: field[2]!.trim(), block }
      fields.push(previous)
    } else if (/^[ \t]*(final|original)-recipient\b/i.test(line)) {
      // A recognizable malformed recipient declaration cannot disappear in parsing.
      previous = { name: 'unreadable-recipient', value: line.trim(), block }
      fields.push(previous)
    } else if (/^[ \t]*(status|action|diagnostic-code)\b/i.test(line)) {
      previous = { name: 'unreadable-outcome', value: line.trim(), block }
      fields.push(previous)
    } else if (/^[ \t]+/.test(line) && previous) {
      previous.value += ` ${line.trim()}`
    } else { previous = undefined }
  }
  const recipientFields = fields.filter((f) => f.name.endsWith('recipient'))
  const recipients = recipientFields.map((field) => {
    const parsed = /^rfc822[ \t]*;[ \t]*(.+)$/i.exec(field.value)
    return parsed ? senderAddress(parsed[1]!) : null
  })
  const outcomeFields = fields.filter((f) => ['status', 'action', 'diagnostic-code'].includes(f.name))
  const result = (issue: string | null): DsnEvidence => ({ recipients, issue })
  if (fields.some((field) => field.name === 'unreadable-outcome')) return result('unreadable explicit DSN outcome field')
  if (recipients.some((recipient) => recipient === null)) return result('unreadable or unsupported explicit DSN recipient')
  if (new Set(recipients).size > 1) return result('mixed explicit DSN recipients, including unknown contacts')
  if (new Set(recipientFields.map((f) => f.block)).size > 1 ||
      ['final-recipient', 'original-recipient'].some((name) => recipientFields.filter((f) => f.name === name).length > 1)) {
    return result('repeated DSN recipient blocks have ambiguous outcome association')
  }
  if (['status', 'action', 'diagnostic-code'].some((name) => outcomeFields.filter((f) => f.name === name).length > 1)) {
    return result('multiple DSN outcome fields cannot be attributed as one outcome')
  }
  if (new Set(outcomeFields.map((f) => f.block)).size > 1 ||
      (recipientFields.length && outcomeFields.some((f) => f.block !== recipientFields[0]!.block))) {
    return result('DSN outcome fields are not bound to the explicit recipient block')
  }
  const status = outcomeFields.find((f) => f.name === 'status')?.value
  const action = outcomeFields.find((f) => f.name === 'action')?.value.toLowerCase()
  const diagnostic = outcomeFields.find((f) => f.name === 'diagnostic-code')?.value
  if (status !== undefined && !/^[245]\.\d{1,3}\.\d{1,3}(?:[ \t].*)?$/.test(status)) return result('unreadable DSN status')
  if (action !== undefined && !Object.hasOwn(ACTION_CLASSES, action)) return result('unreadable DSN action')
  const klass = status?.[0]
  const allowed = action ? ACTION_CLASSES[action] : undefined
  if (allowed && klass && !allowed.includes(klass)) return result('DSN action contradicts status')
  const diagnosticClass = diagnostic?.match(/\b([245])\d{2}\b/)?.[1]
  if (klass && diagnosticClass && klass !== diagnosticClass) return result('DSN diagnostic contradicts status')
  if (allowed && diagnosticClass && !allowed.includes(diagnosticClass)) return result('DSN action contradicts diagnostic')
  if (!klass && ((action && ['delivered', 'relayed', 'expanded'].includes(action)) || diagnosticClass === '2')) {
    return result('successful DSN action/diagnostic lacks a bindable status')
  }
  return result(null)
}
