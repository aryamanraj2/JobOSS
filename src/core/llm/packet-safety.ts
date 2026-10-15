import { redact } from '../logging/redact.js'

/** Credential check for JSON task data and responses, preserving typed authorship provenance. */
export function assertCredentialFreeTaskData(value: unknown): void {
  if (Array.isArray(value)) { value.forEach(assertCredentialFreeTaskData); return }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      // These are typed provenance fields, not authentication data. The broad
      // logging redactor intentionally masks any key containing 'auth'.
      const provenance = (key === 'authorshipVerified' && typeof child === 'boolean') ||
        (key === 'verifiedAuthorshipEvidenceIds' && Array.isArray(child) && child.every((id) => typeof id === 'string'))
      if (!provenance && JSON.stringify(redact({ [key]: null })) !== JSON.stringify({ [key]: null })) {
        throw new Error('Task input contains credential-shaped data')
      }
      assertCredentialFreeTaskData(child)
    }
  } else if (JSON.stringify(redact(value)) !== JSON.stringify(value)) throw new Error('Task input contains credential-shaped data')
}
