import type { RoleTrackKey } from '../../../generated/prisma/enums.js'

export type PreparationProvider = 'codex' | 'claude' | 'manual'
export type PreparationStage = 'discovery' | 'rank' | 'company_research' | 'recipients' | 'drafts' | 'support' | 'cohort'

/** Priority invites research; it never substitutes for contact/evidence/approval gates. */
export type RankedOutreachCompany = {
  companyId: string
  name: string
  domain: string
  priority: number
  primaryTrack: RoleTrackKey | null
  status: string
  blockers: string[]
  eligibility: unknown
  fit: OutreachFit
  trigger: unknown
  citedEvidenceIds: string[]
}

export type PreparationBlocker = { companyId: string; reason: string }
export type PreparationCheckpoint = {
  stage: PreparationStage
  discoveryRunId?: string
  companyIds: string[]
  completedStages: PreparationStage[]
}

/** Stable persistence contracts; fields retain their on-disk Prisma names. */
export type { FundingRecord, DiscoveryRun, OutreachAssessment, ContactResearch, PreparationRun,
  Evidence, Draft, LlmTask } from '../../../generated/prisma/client.js'
export type FundingDatePrecision = 'date' | 'month' | 'year' | 'unknown'
export type FundingVerificationStatus = 'indexed' | 'primary_verified'
export type OutreachFit = {
  supported: boolean
  primaryTrack: RoleTrackKey | null
  confidence: number
  evidenceIds: string[]
  earlyStageVerified: boolean
  [key: string]: unknown
}
