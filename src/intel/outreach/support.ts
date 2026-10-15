/** Conservative own-product language; customer stories and person biographies invite research only. */
export function companyFitExcerpt(excerpt: string, companyName: string): boolean {
  if (/\b(customer|client|testimonial|case study|biography|previously at)\b/i.test(excerpt)) return false
  const normalized = excerpt.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  const name = companyName.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  return /\b(we|our)\b/.test(normalized) || (!!name && normalized.startsWith(`${name} `))
}
