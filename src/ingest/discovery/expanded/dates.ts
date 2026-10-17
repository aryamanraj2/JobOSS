/** Declared source formats only: Gregorian YYYY-MM-DD, or an ISO datetime with seconds and timezone.
 * Calendar/time components are checked before offset conversion; JS rollover is never accepted. */
export function sourceDate(value: unknown, datetimeOnly = false): Date | null {
  if (typeof value !== 'string') return null
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2}))?$/.exec(value)
  if (!match || (datetimeOnly && !match[4])) return null
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3])
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1]!) return null
  const hour = Number(match[4] ?? 0), minute = Number(match[5] ?? 0), second = Number(match[6] ?? 0)
  if (hour > 23 || minute > 59 || second > 59) return null
  const zone = match[8] ?? 'Z', zh = zone === 'Z' ? 0 : Number(zone.slice(1, 3)), zm = zone === 'Z' ? 0 : Number(zone.slice(4, 6))
  if (zh > 14 || zm > 59 || (zh === 14 && zm !== 0)) return null
  const date = new Date(0)
  date.setUTCFullYear(year, month - 1, day); date.setUTCHours(hour, minute, second, Number((match[7] ?? '').padEnd(3, '0')))
  const offset = (zh * 60 + zm) * (zone.startsWith('-') ? -1 : 1)
  date.setTime(date.getTime() - offset * 60000)
  return Number.isFinite(date.getTime()) ? date : null
}
export function runtimeDate(value: unknown): Date | null {
  return value instanceof Date ? Number.isFinite(value.getTime()) ? sourceDate(value.toISOString(), true) : null : sourceDate(value, true)
}
