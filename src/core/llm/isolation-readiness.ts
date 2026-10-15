export type IsolationBlocker = {
  code: 'isolation_unverified'
  readiness: 'unverified'
  provider: 'codex' | 'claude'
  capabilityClass: 'candidate_url_search' | 'writer_support' | 'unclassified'
  manualAvailable: true
  detail: string
}

/**
 * No provider/runtime/config/capability evidence has independent acceptance.
 * Deliberately no environment, packet, executor or caller-provided enablement.
 * Future acceptance needs a separately reviewed enforced evidence mechanism.
 */
export function isolationBlocker(provider: 'codex' | 'claude', kind: string): IsolationBlocker {
  const capabilityClass = kind === 'research_urls' ? 'candidate_url_search' :
    ['contact_research', 'draft_support', 'outreach_draft', 'research_brief', 'company_research', 'packet_answers'].includes(kind) ? 'writer_support' : 'unclassified'
  return {
    code: 'isolation_unverified', readiness: 'unverified', provider, capabilityClass, manualAvailable: true,
    detail: `Automatic ${provider} execution is unavailable: isolation for the provider/runtime/config and ${capabilityClass} capabilities has not been independently accepted. Resume through the existing manual handoff; no provider fallback or task claim was made.`,
  }
}
