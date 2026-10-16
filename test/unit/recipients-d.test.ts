import { describe, expect, it } from 'vitest'
import { recipientSuitability } from '../../src/outreach/contacts/suitability.js'
import { observePersonPage } from '../../src/outreach/contacts/person-research.js'
import { validatePersonHook } from '../../src/outreach/draft/v5.js'
import { supportSentences, validateSupportCoverage } from '../../src/outreach/draft/support.js'
import { wordCount } from '../../src/outreach/draft/email.js'
import type { DraftComposition } from '../../src/outreach/draft/message.js'

const named = (title: string | null) => ({ emailNormalized: 'jamie@acme.example', contactType: 'named_employee', publicTitle: title })
describe('D supported responsibility', () => {
  it.each(['Founder', 'CEO', 'Co-Founder & CEO', 'CTO', 'Head of Engineering', 'Engineering Manager', 'Applied AI Lead', 'Senior iOS Engineer', 'Recruiter'])('permits a supported responsibility: %s', (title) => expect(recipientSuitability(named(title)).suitable).toBe(true))
  it.each(['Sales Engineer', 'Field Engineering', 'Solutions Architect', 'Customer Success Engineer', 'Unknown', 'AI', 'Mobile Evangelist', null])('does not infer responsibility from a title fragment: %s', (title) => expect(recipientSuitability(named(title)).suitable).toBe(false))
  it('can use captured employer product responsibility despite a commercial title', () => {
    expect(recipientSuitability(named('Field Engineer'), ['Jamie Rao, Field Engineer. Builds the iOS SDK product.']).suitable).toBe(true)
    expect(recipientSuitability(named('Field Engineer'), ['Jamie Rao makes mobile demos for sales customers.']).suitable).toBe(false)
  })
})
const observation = (html: string, extra: { url?: string; employerLinked?: boolean } = {}) => observePersonPage({ html: `<html><body>${html}</body></html>`, url: extra.url ?? 'https://acme.example/team', companyDomain: 'acme.example', fullName: 'Jamie Rao', publicTitle: 'CTO', ...extra })
describe('D identity and authorship boundaries', () => {
  it('requires a person card or explicit metadata, not a third-person title mention', () => {
    expect(observation('<p>Otherco quoted Jamie Rao, CTO, about their product.</p>').identityVerified).toBe(false)
    expect(observation('<section><h2>Jamie Rao</h2><p>CTO</p></section>').identityVerified).toBe(true)
  })
  it('rejects wrong worksFor and unrelated external bylines', () => {
    const metadata = `<script type="application/ld+json">${JSON.stringify({ '@type': 'Person', name: 'Jamie Rao', jobTitle: 'CTO', worksFor: { url: 'https://otherco.example' } })}</script>`
    expect(observation(metadata + '<p>Jamie Rao, CTO.</p>').identityVerified).toBe(false)
    expect(observation('<article><a rel="author">Jamie Rao</a>Authored product article.</article>', { url: 'https://otherco.example/blog' }).authorshipVerified).toBe(false)
    expect(observation('<blockquote><a rel="author">Jamie Rao</a>Quoted author</blockquote>').authorshipVerified).toBe(false)
  })
  it('does not confuse a quoted author or unrelated metadata with the actual article author', () => {
    const meta = `<script type="application/ld+json">${JSON.stringify({ '@type': 'Quotation', author: { name: 'Jamie Rao' } })}</script>`
    expect(observation(meta + '<article>Jamie Rao said something about software.</article>').authorshipVerified).toBe(false)
  })
  it('an article byline does not prove product ownership or leadership', () => {
    const target = { companyId: 'c', contactId: 'p', identityVerified: true }, evidence = [{ id: 'e', companyId: 'c', contactId: 'p', excerpt: 'Article about a mobile receipt review app.' }]
    const hooks = [{ text: evidence[0]!.excerpt, evidenceIds: ['e'], authorshipVerified: true }]
    expect(validatePersonHook({ text: 'You built the receipt review app.', evidenceIds: ['e'], contactId: 'p' }, target, evidence, hooks).join()).toContain('responsibility')
    expect(validatePersonHook({ text: 'I read your article about receipt review.', evidenceIds: ['e'], contactId: 'p' }, target, evidence, hooks)).toEqual([])
    expect(validatePersonHook({ text: 'You wrote that article.', evidenceIds: ['e'], contactId: 'wrong' }, target, evidence, hooks).length).toBeGreaterThan(0)
  })
})
describe('D exact support units and counting', () => {
  const composition: DraftComposition = { subject: 'A subject about the app', promptVersion: 'outreach_draft@5', composedAt: '2026-10-15T00:00:00Z', layout: 'v5', sentences: [
    { role: 'company', text: 'The app reviews receipts. Users check amounts.', evidenceIds: ['e'], approvedClaimIds: [], source: 'llm', templateId: null },
  ] }
  it('includes every generated sentence and the subject rather than only one paragraph label', () => {
    expect(supportSentences(composition).map((s) => s.text)).toEqual(['A subject about the app', 'The app reviews receipts.', 'Users check amounts.'])
    expect(validateSupportCoverage(composition, { claims: [], overall: 'supported', limitations: [] }).supported).toBe(false)
  })
  it('keeps the established 280-word counting semantics excluding URL tokens', () => {
    expect(wordCount(`${'word '.repeat(280)}https://example.com/project`)).toBe(280)
    expect(wordCount('word '.repeat(281))).toBe(281)
  })
})
it('rejects an employer-linked same-name article explicitly attributed to another company', () => {
  const html = `<script type="application/ld+json">${JSON.stringify({ '@type': 'BlogPosting', author: { name: 'Jamie Rao', worksFor: { url: 'https://otherco.example' } } })}</script><article><a rel="author">Jamie Rao</a><p>${'Article about a mobile review app. '.repeat(20)}</p></article>`
  expect(observation(html, { url: 'https://writing.example/article', employerLinked: true }).authorshipVerified).toBe(false)
})

describe('RD-1 one person per identity record', () => {
  it.each([
    '<section><div><h2>Jamie Rao</h2><p>Analyst</p></div><div><h2>Alex Chen</h2><p>CTO</p></div></section>',
    '<section><div><h2>Jamie Rao</h2><p>Analyst</p></div><div><h2>Jamie Rao Singh</h2><p>CTO</p></div></section>',
    '<section><div><h2>Jamie Rao</h2><p>CTO</p></div><div><h2>Jamie Rao</h2><p>Analyst</p></div></section>',
  ])('refuses neighboring, similar or conflicting names: %s', (html) => expect(observation(html).identityVerified).toBe(false))
  it('retains an isolated target card among other people and explicit employer metadata', () => {
    expect(observation('<section><div><h2>Jamie Rao</h2><p>CTO</p></div><div><h2>Alex Chen</h2><p>CEO</p></div></section>').identityVerified).toBe(true)
    const meta = `<script type="application/ld+json">${JSON.stringify({ '@type': 'Person', name: 'Jamie Rao', jobTitle: 'CTO', worksFor: { url: 'https://acme.example' } })}</script>`
    expect(observation(meta).identityVerified).toBe(true)
  })
})

describe('RD-1a/RD-1b structured identity residuals', () => {
  const person = (worksFor: unknown) => `<script type="application/ld+json">${JSON.stringify({ '@type': 'Person', name: 'Jamie Rao', jobTitle: 'CTO', worksFor })}</script>`
  it('RD-1a refuses an explicitly named different employer with no URL', () => {
    expect(observation(person({ name: 'Otherco' })).identityVerified).toBe(false)
  })
  it('RD-1b refuses matching structured identity inside a blockquote', () => {
    expect(observation(`<blockquote>${person({ url: 'https://acme.example' })}</blockquote>`).identityVerified).toBe(false)
  })
})

describe('RD-1a supported employer representations', () => {
  it.each([
    ['canonical URL object', { url: 'https://acme.example' }, true],
    ['subdomain URL object', { url: 'https://careers.acme.example' }, true],
    ['URL string', 'https://acme.example', true],
    ['named URL Organization', { '@type': 'Organization', name: 'Acme', url: 'https://acme.example' }, true],
    ['different name', { name: 'Otherco' }, false], ['matching name only', { name: 'Acme' }, false],
    ['name string', 'Otherco', false], ['matching name string', 'Acme', false],
    ['conflicting named URL', { name: 'Otherco', url: 'https://acme.example' }, false],
    ['wrong employer URL', { url: 'https://otherco.example' }, false],
    ['foreign suffix', { url: 'https://acme.example.otherco.example' }, false],
    ['reference only', { '@id': 'https://acme.example' }, false],
    ['array', ['https://acme.example'], false], ['empty', {}, false], ['null', null, false], ['boolean', false, false],
    ['malformed URL', { url: 'acme.example' }, false], ['numeric URL', { url: 42 }, false],
    ['nested URL', { url: { url: 'https://acme.example' } }, false], ['unsupported type', { '@type': 'Thing', url: 'https://acme.example' }, false],
    ['non-web URL', { url: 'file://acme.example/team' }, false],
  ])('%s has an honest attribution result', (_name, worksFor, expected) => {
    const html = `<html><body><script type="application/ld+json">${JSON.stringify({ '@type': 'Person', name: 'Jamie Rao', jobTitle: 'CTO', worksFor })}</script></body></html>`
    expect(observePersonPage({ html, url: 'https://acme.example/team', companyDomain: 'acme.example', companyName: 'Acme', fullName: 'Jamie Rao', publicTitle: 'CTO' }).identityVerified).toBe(expected)
  })
})

describe('RD-1b source context, not script placement alone', () => {
  const meta = `<script type="application/ld+json">${JSON.stringify({ '@type': 'Person', name: 'Jamie Rao', jobTitle: 'CTO', worksFor: { url: 'https://acme.example' } })}</script>`
  it.each(['q', 'pre', 'code', 'samp', 'template', 'div data-example', 'div data-quoted', 'div role="doc-example"', 'div class="example"'])('excludes a nested %s boundary', (tag) => {
    const closing = tag.split(' ')[0]
    expect(observation(`<${tag}><div><section>${meta}</section></div></${closing}>`).identityVerified).toBe(false)
    expect(observation(`<${tag}><div><section><h2>Jamie Rao</h2><p>CTO</p></section></div></${closing}>`).identityVerified).toBe(false)
  })
  it('ignores quoted conflicts while preserving a real isolated graph record and its whole source', () => {
    const graph = `<script type="application/ld+json">${JSON.stringify({ '@graph': [{ '@type': 'Person', name: 'Jamie Rao', jobTitle: 'CTO', worksFor: 'https://acme.example' }] })}</script>`
    const html = `<html><head>${graph}</head><body><blockquote>${meta.replaceAll('CTO', 'Marketing analyst')}</blockquote></body></html>`
    const seen = observePersonPage({ html, url: 'https://acme.example/team', companyDomain: 'acme.example', fullName: 'Jamie Rao', publicTitle: 'CTO' })
    expect(seen.identityVerified).toBe(true); expect(seen.identityRecord).toEqual({ version: 3, html })
  })
  it('excludes semantic quotation/example JSON containers', () => {
    for (const type of ['Quotation', 'SoftwareSourceCode', 'ExampleObject']) {
      const script = `<script type="application/ld+json">${JSON.stringify({ '@type': type, '@graph': [{ '@type': 'Person', name: 'Jamie Rao', jobTitle: 'CTO', worksFor: { url: 'https://acme.example' } }] })}</script>`
      expect(observation(script).identityVerified).toBe(false)
    }
  })
  it('retains contradictory supported records instead of serializing away a conflicting sibling', () => {
    expect(observation(meta + meta.replace('https://acme.example', 'https://otherco.example')).identityVerified).toBe(false)
  })
  it('refuses the full oversized source without truncating away context', () => {
    const seen = observation(meta + ' '.repeat(32_001) + `<blockquote>${meta}</blockquote>`)
    expect(seen.identityVerified).toBe(false); expect(seen.identityRecord).toBeUndefined(); expect(seen.limitation).toContain('32,000')
  })
})
