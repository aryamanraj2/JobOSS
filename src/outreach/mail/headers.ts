import { normalizeEmail } from '../../core/crypto/secret-store.js'

export function normalizedHeaders(headers: Record<string, string> = {}): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers)) {
    const name = key.trim().toLowerCase()
    out[name] = out[name] === undefined ? value : `${out[name]}, ${value}`
  }
  return out
}

/** One supported mailbox only. A display name cannot hide unquoted list/address
 * material. Quoted commas and quoted-pair escapes are supported; comments, groups,
 * obsolete routes and other unsupported mailbox syntax fail closed. */
export function senderAddress(from: string): string | null {
  const value = from.trim()
  if ([...value].some((char) => (char.charCodeAt(0) < 32 && char !== '\t') || char.charCodeAt(0) === 127)) return null
  const angle = /^([^<>]*)<([^<>]+)>$/.exec(value)
  if (angle && !supportedDisplayName((angle[1] ?? '').trim())) return null
  const address = normalizeEmail(angle?.[2] ?? value)
  if (['"', '\\', '[', ']'].some((char) => address.includes(char))) return null
  return /^[^\s<>@,;:()]+@[^\s<>@,;:()]+\.[^\s<>@,;:()]+$/.test(address) ? address : null
}

function supportedDisplayName(display: string): boolean {
  let index = 0
  while (index < display.length) {
    if (display[index] === '"') {
      index += 1
      let closed = false
      while (index < display.length) {
        const char = display[index++]
        if (char === '\\') {
          if (index === display.length) return false
          index += 1
        } else if (char === '"') { closed = true; break }
      }
      if (!closed || (index < display.length && !/[ \t]/.test(display[index]!))) return false
    } else {
      while (index < display.length && !/[ \t]/.test(display[index]!)) {
        if ('(),:;<>@[]\\"'.includes(display[index]!)) return false
        index += 1
      }
    }
    while (index < display.length && /[ \t]/.test(display[index]!)) index += 1
  }
  return true
}

/** RFC 3834 keyword with RFC 2822 CFWS. Parameters do not change its meaning.
 * Return null for malformed keyword/CFWS, including an unfinished comment, bare
 * newline or whitespace splitting a token. The caller must surface uncertainty. */
export function autoSubmittedKeyword(value: string): string | null {
  const unfolded = value.replace(/\r\n[ \t]+/g, ' ')
  if (/[\r\n]/.test(unfolded)) return null
  let clean = ''
  let depth = 0
  let escaped = false
  for (const char of unfolded) {
    if (depth > 0) {
      if (escaped) { escaped = false; continue }
      if (char === '\\') { escaped = true; continue }
      if (char === '(') depth += 1
      if (char === ')') depth -= 1
      continue
    }
    if (char === '(') { depth = 1; clean += ' '; continue }
    if (char === ')') return null
    if (char === ';') break
    clean += char
  }
  if (depth || escaped) return null
  const keyword = clean.trim()
  return /^[!#$%&'*+\-.^_`|~0-9A-Za-z{}]+$/.test(keyword) ? keyword.toLowerCase() : null
}
