import { contentHashOf } from '../../../core/evidence/content-hash.js'

/** Access recorded from first-party evidence. Only permitted/limited/retained-contract routes issue requests. */
export type RouteAccess = 'permitted' | 'limited' | 'retained_contract' | 'unsupported' | 'unavailable' | 'access_blocked' | 'stale'
export type ExpandedRoute = {
  id: string; family: string; kind: 'yc' | 'directory' | 'jobs' | 'startupdb' | 'hn' | 'unavailable'
  url: string | null; parser: string; hosts: string[]; scope: string
  access: RouteAccess; accessReason: string; evidence: string[]
  remaining: string; relationship: string; period?: string
  /** yc-oss feed for `yc` routes. */
  feed?: 'all' | 'hiring'
  /** Voluntary same-route spacing floor, above the caller's delay. */
  minDelayMs?: number
}
const PRE = 'scratch/joboss-source-access-preflight-01-20261018-a/raw/'
const PREFLIGHT = 'docs/JOBOSS-SOURCE-ACCESS-PREFLIGHT-01.md'
const PRE2 = 'scratch/joboss-source-access-preflight-02-20261018-a/raw/'
const PREFLIGHT2 = 'docs/JOBOSS-SOURCE-ACCESS-PREFLIGHT-02-REPORT.md'
export const routeRunnable = (route: ExpandedRoute) => route.kind !== 'unavailable' && ['permitted', 'limited', 'retained_contract'].includes(route.access)

/** URLs and access come from the SX1 first-party pre-flight, not inferred APIs. No access exemption. */
export const EXPANDED_ROUTES: readonly ExpandedRoute[] = [
  { id: 'yc:companies', family: 'yc', kind: 'yc', feed: 'all', url: 'https://yc-oss.github.io/api/companies/all.json', hosts: ['yc-oss.github.io'], parser: 'yc-oss@1',
    access: 'permitted', accessReason: 'yc-oss robots.txt 404 (no rules, RR1-08); no licence: seed index only', evidence: [PREFLIGHT, `${PRE}https_yc_oss_github_io_robots_txt`, `${PRE}https_api_github_com_repos_yc_oss_api_license`, `${PRE}https_raw_githubusercontent_com_yc_oss_api_main_README_md`],
    scope: 'all feed; recent/mobile/AI/small first, no batch/size/lifecycle exclusion; uncapped remainder stays visible as pending scope', relationship: 'yc_batch_index', remaining: 'Later authorized source run; seed index only, verify each company on its own site before citing anything.' },
  { id: 'yc:hiring', family: 'yc', kind: 'yc', feed: 'hiring', url: 'https://yc-oss.github.io/api/companies/hiring.json', hosts: ['yc-oss.github.io'], parser: 'yc-oss-hiring@1',
    access: 'permitted', accessReason: 'yc-oss robots.txt 404 (no rules, RR1-08); no licence: seed index only', evidence: [PREFLIGHT, `${PRE}https_yc_oss_github_io_robots_txt`, `${PRE}https_api_github_com_repos_yc_oss_api_license`, `${PRE}https_raw_githubusercontent_com_yc_oss_api_main_README_md`],
    scope: 'yc-oss hiring feed (isHiring) as a listing signal only; never a job posting, role or recipient', relationship: 'yc_hiring_signal', remaining: 'Employer hiring and any role must be verified on the employer site/ATS; the signal is not a current listing.' },
  { id: 'yc:jobs', family: 'yc', kind: 'jobs', url: 'https://www.ycombinator.com/jobs', hosts: ['www.ycombinator.com'], parser: 'public-jobposting@1',
    access: 'access_blocked', accessReason: 'G decision: the YC site is gated/barred; replaced by yc:hiring (yc-oss). No request is made.', evidence: [PREFLIGHT],
    scope: 'superseded YC official jobs entry; never requested', relationship: 'listed_role_index', remaining: 'Blocked by decision. Current YC hiring comes from the yc:hiring signal plus employer verification.' },
  { id: 'yc:work-at-a-startup', family: 'yc', kind: 'unavailable', url: null, hosts: [], parser: 'none', access: 'unsupported', accessReason: 'No documented public representation; login/private API excluded.', evidence: [PREFLIGHT],
    scope: 'Work at a Startup current listings', relationship: 'listed_role_index', remaining: 'Supply a documented public entry/representation and access proof; no private API or login bypass.' },
  { id: 'southparkcommons:companies', family: 'southparkcommons', kind: 'directory', url: 'https://www.southparkcommons.com/companies', hosts: ['www.southparkcommons.com'], parser: 'spc-public@2',
    access: 'permitted', accessReason: 'robots.txt User-agent: * Allow: /; terms have no automated-access clause', evidence: [PREFLIGHT, `${PRE}https_www_southparkcommons_com_robots_txt`, `${PRE}https_www_southparkcommons_com_terms_of_service`, `${PRE}https_www_southparkcommons_com_companies_`, PREFLIGHT2, `${PRE2}www.southparkcommons.com_companies_baseten`, `${PRE2}www.southparkcommons.com_companies_goodfire`],
    scope: '28 static detail links (16 highlight cards + 12 SSR rows); identity only from the same-source /companies/{slug} detail page; detail pages count in the page/request budget', relationship: 'association_unspecified',
    remaining: 'Detail-page parser verified against real baseten and goodfire pages (pre-flight 02): the Website anchor in main > section[data-section=company-hero] binds; aside, nav and footer never do. SPC acquisition and relationship signals come from the identity group only (the h1 and its Website link), so association_unspecified does not mean no investment. Entries without a detail website stay unresolved. Client-side directory beyond the SSR rows is not covered.' },
  { id: 'alchemist:highlights', family: 'alchemist', kind: 'directory', url: 'https://www.alchemistaccelerator.com/portfolio-2', hosts: ['www.alchemistaccelerator.com'], parser: 'alchemist-public@2',
    access: 'permitted', accessReason: 'robots.txt User-agent: * disallows only /_hcms/preview/ and /hs/; /legal has no automated-access clause', evidence: [PREFLIGHT, `${PRE}https_www_alchemistaccelerator_com_robots_txt`, `${PRE}https_www_alchemistaccelerator_com_legal`, `${PRE}https_www_alchemistaccelerator_com_portfolio_2`],
    scope: 'public /portfolio-2: 40 static highlight cards plus paged HubDB grid (pno); names, descriptions, investors, country and class only', relationship: 'accelerator_portfolio',
    remaining: 'No company website links: every entry stays unresolved until a separate own-site match or operator import. Vault profiles are never followed.' },
  { id: 'alchemist:class29', family: 'alchemist', kind: 'directory', url: 'https://www.alchemistaccelerator.com/portfolio?class=29', hosts: ['www.alchemistaccelerator.com'], parser: 'alchemist-public@1',
    access: 'stale', accessReason: 'Observed by X on 15 Oct; not retained in the SX1 pre-flight, and the current public page is /portfolio-2. No request is made.', evidence: [PREFLIGHT, 'docs/JOBOSS-DISCOVERY-SOURCE-EXPANSION.md'],
    scope: 'superseded class=29 filter view; never requested', relationship: 'accelerator_class', period: 'class29', remaining: 'Stale. Re-verify with a fresh pre-flight before any use; /portfolio-2 is the current public page.' },
  { id: 'alchemist:details', family: 'alchemist', kind: 'unavailable', url: null, hosts: [], parser: 'none', access: 'unsupported', accessReason: 'vault.alchemistaccelerator.com is a JavaScript SPA (its /robots.txt returns app HTML).', evidence: [PREFLIGHT, `${PRE}https_vault_alchemistaccelerator_com_robots_txt`],
    scope: 'vault.alchemistaccelerator.com detail links', relationship: 'accelerator_portfolio', remaining: 'Unsupported. Host is not allowlisted; no Vault request.' },
  { id: 'ef:companies', family: 'ef', kind: 'directory', url: 'https://www.joinef.com/portfolio/', hosts: ['www.joinef.com'], parser: 'ef-public@1',
    access: 'unavailable', accessReason: 'records_not_in_static_html_undocumented_endpoint: records load through undocumented admin-ajax.php (never called); the 48 static tiles carry no company website', evidence: [PREFLIGHT, `${PRE}https_www_joinef_com_robots_txt`, `${PRE}https_www_joinef_com_portfolio_`],
    scope: 'public portfolio; never requested', relationship: 'ef_portfolio', remaining: 'Unavailable. Alternative: manual or operator import of EF portfolio companies.' },
  { id: 'masschallenge:ch-uk-2026', family: 'masschallenge', kind: 'directory', url: 'https://masschallenge.org/news/switzerland-uk-2026-cohort/', hosts: ['masschallenge.org'], parser: 'cohort-public@1',
    access: 'access_blocked', accessReason: 'robots.txt and terms returned 403: refusal under RR1-08. No request is made.', evidence: [PREFLIGHT, `${PRE}https_masschallenge_org_robots_txt`, `${PRE}https_masschallenge_org_website_terms_of_use_`],
    scope: 'Switzerland/UK 2026 cohort announcement; never requested', relationship: 'historical_program_cohort', period: '2026', remaining: 'Blocked. Alternative: operator-provided authorized import.' },
  { id: 'masschallenge:us-2023', family: 'masschallenge', kind: 'directory', url: 'https://more.masschallenge.org/uses-2023-cohort', hosts: ['more.masschallenge.org'], parser: 'cohort-public@1',
    access: 'access_blocked', accessReason: 'masschallenge.org robots.txt and terms returned 403: refusal under RR1-08. No request is made.', evidence: [PREFLIGHT, `${PRE}https_masschallenge_org_robots_txt`, `${PRE}https_masschallenge_org_website_terms_of_use_`],
    scope: 'US 2023 cohort announcement; never requested', relationship: 'historical_program_cohort', period: '2023', remaining: 'Blocked. Alternative: operator-provided authorized import.' },
  { id: 'masschallenge:alumni', family: 'masschallenge', kind: 'unavailable', url: null, hosts: [], parser: 'none', access: 'access_blocked', accessReason: 'Profile-only alumni directory; masschallenge.org robots/terms 403.', evidence: [PREFLIGHT, `${PRE}https_masschallenge_org_robots_txt`],
    scope: 'profile-only alumni directory; /startups/ redirect/home is not a directory', relationship: 'historical_program_cohort', remaining: 'Permitted public alumni representation or operator-provided authorized import; do not bypass profile access.' },
  { id: 'seedcamp:companies', family: 'seedcamp', kind: 'directory', url: 'https://seedcamp.com/our-companies/', hosts: ['seedcamp.com'], parser: 'seedcamp-public@2',
    access: 'permitted', accessReason: 'robots.txt User-agent: * with empty Disallow; no website terms page', evidence: [PREFLIGHT, `${PRE}https_seedcamp_com_robots_txt`, `${PRE}https_seedcamp_com_our_companies_`],
    scope: 'one static list of 318 cards (316 with "Link to {name}\'s website"); client-side year/sector filters only; separate from the indirect StartupDB seed', relationship: 'investment_portfolio',
    remaining: 'Investment year is not a funding date. Cards without a bound website stay unresolved.' },
  { id: 'seedcamp:talent', family: 'seedcamp', kind: 'jobs', url: 'https://talent.seedcamp.com/jobs', hosts: ['talent.seedcamp.com'], parser: 'public-jobposting@1', minDelayMs: 10_000,
    access: 'permitted', accessReason: 'robots.txt has rules only for named bots (Crawl-delay 10) and no * group; HTML only, the Getro API is barred; voluntary >=10 s same-host spacing', evidence: [PREFLIGHT, `${PRE}https_talent_seedcamp_com_robots_txt`, PREFLIGHT2, `${PRE2}talent.seedcamp.com_jobs`, `${PRE2}talent.seedcamp.com_companies_seedcamp_jobs_94426887-legal-analyst-associate_content`],
    scope: 'public company/job HTML; listing signals only', relationship: 'listed_role_index',
    remaining: 'Listing representation verified (pre-flight 02): JobPosting microdata cards, first 20 of 2111 static, load-more never called (visible capped limitation). Employer stays unresolved (name and logo only). The job-page representation is unverified for portfolio employers: only Seedcamp\'s own job was saved; hiringOrganization on seedcamp.com never binds. Listings need employer verification.' },
  { id: 'startupdb', family: 'startupdb', kind: 'startupdb', url: 'https://startupdb.com/api', hosts: ['startupdb.com'], parser: 'accepted-startupdb@2',
    access: 'limited', accessReason: 'Documented keyless API (120/min per IP, 429 + retry-after), CC BY 4.0 facts; robots Disallow: /api/v1/ conflict disclosed; exact documented endpoints only (existing decision)', evidence: [PREFLIGHT, `${PRE}https_startupdb_com_robots_txt`, `${PRE}https_startupdb_com_api`, `${PRE}https_startupdb_com_legal`],
    scope: 'existing five investor seeds, detail and documented funding activity paging; accepted caps/attribution', relationship: 'indexed_investor_portfolio', remaining: 'Later authorized source execution; CC BY 4.0 credit; descriptions and third-party text are outside the licence.' },
  { id: 'hn', family: 'hn', kind: 'hn', url: 'https://hacker-news.firebaseio.com/v0', hosts: ['hacker-news.firebaseio.com'], parser: 'accepted-hn@2',
    access: 'retained_contract', accessReason: 'Outside the SX1 pre-flight: accepted documented Firebase API contract (handover §5); news.ycombinator.com is not requested', evidence: ['docs/JOBOSS-ORCHESTRATOR-HANDOVER.md'],
    scope: 'existing frozen three monthly hiring threads', relationship: 'public_hiring_invitation', remaining: 'Later authorized execution; public invitation is not verified employer/recipient identity.' },
]
export function expandedManifest() {
  return { version: 'expanded-v1', cursorVersion: 1, routes: structuredClone(EXPANDED_ROUTES),
    bounds: { requestsPerRoute: 250, bytesPerRoute: 100 * 1024 * 1024, bytesPerPage: 2 * 1024 * 1024,
      pagesPerRoute: 6, recordsPerPage: 500, scansPerInvocation: 500, ycScanCap: 10_000,
      unionPerInvocation: 2000, companiesPerRouteInvocation: 'limit1-200' },
    callerSerializationRequired: true, exhaustive: false }
}
export const expandedManifestHash = () => contentHashOf(expandedManifest())
