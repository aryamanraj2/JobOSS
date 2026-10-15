-- Additive JOBOSS provenance and resumable preparation. Existing drafts remain revision 1.
-- SendAttempt partial uniqueness, approval hashes, suppression and stored text are untouched.
BEGIN;
ALTER TYPE "evidence_source_type" ADD VALUE IF NOT EXISTS 'external_source';
ALTER TABLE "company" ADD COLUMN "ats_ownership_evidence_id" TEXT, ADD COLUMN "ats_ownership_verified_at" TIMESTAMP(3);
ALTER TABLE "evidence" ADD COLUMN "contact_id" TEXT, ADD COLUMN "published_at" TIMESTAMP(3);
ALTER TABLE "contact" ADD COLUMN "full_name" TEXT, ADD COLUMN "identity_source_url" TEXT,
  ADD COLUMN "identity_verified_at" TIMESTAMP(3), ADD COLUMN "suitability" TEXT, ADD COLUMN "suitability_reason" TEXT;
ALTER TABLE "draft" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1, ADD COLUMN "revision_of_id" TEXT;
CREATE UNIQUE INDEX "draft_lead_id_contact_id_touch_slot_revision_key" ON "draft"("lead_id", "contact_id", "touch_slot", "revision");
DROP INDEX "draft_lead_id_contact_id_touch_slot_key";
ALTER TABLE "draft" ADD CONSTRAINT "draft_revision_of_id_fkey" FOREIGN KEY ("revision_of_id") REFERENCES "draft"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "draft" ADD CONSTRAINT "draft_revision_positive" CHECK ("revision" > 0);
ALTER TABLE "send_attempt" ADD COLUMN "provider_rfc822_message_id" TEXT;
ALTER TABLE "bounce" ADD COLUMN "provider_message_id" TEXT;
ALTER TABLE "opt_out" ADD COLUMN "provider_message_id" TEXT;
CREATE UNIQUE INDEX "bounce_provider_message_id_key" ON "bounce"("provider_message_id");
CREATE UNIQUE INDEX "opt_out_provider_message_id_key" ON "opt_out"("provider_message_id");
ALTER TABLE "llm_task" ADD COLUMN "claim_token" TEXT, ADD COLUMN "lease_expires_at" TIMESTAMP(3), ADD COLUMN "runner_metadata" JSONB;
CREATE TABLE "funding_record" (
 "id" TEXT PRIMARY KEY, "company_id" TEXT NOT NULL, "source_key" TEXT NOT NULL,
 "source_url" TEXT NOT NULL, "evidence_id" TEXT NOT NULL, "stage" TEXT, "amount" DECIMAL(20,2),
 "currency" TEXT, "announced_at" TIMESTAMP(3), "date_precision" TEXT NOT NULL, "date_text" TEXT,
 "investor_names" TEXT[] NOT NULL, "verification_status" TEXT NOT NULL, "observed_at" TIMESTAMP(3) NOT NULL, "metadata" JSONB,
 CONSTRAINT "funding_record_date_precision_check" CHECK ("date_precision" IN ('date','month','year','unknown')),
 CONSTRAINT "funding_record_verification_status_check" CHECK ("verification_status" IN ('indexed','primary_verified')),
 CONSTRAINT "funding_record_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "funding_record_evidence_id_fkey" FOREIGN KEY ("evidence_id") REFERENCES "evidence"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "funding_record_company_id_source_key_key" ON "funding_record"("company_id","source_key");
CREATE INDEX "funding_record_announced_at_idx" ON "funding_record"("announced_at");
CREATE TABLE "discovery_run" (
 "id" TEXT PRIMARY KEY, "source" TEXT NOT NULL, "status" TEXT NOT NULL, "cursor" JSONB, "counts" JSONB,
 "coverage" JSONB, "errors" JSONB, "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updated_at" TIMESTAMP(3) NOT NULL, "completed_at" TIMESTAMP(3)
);
CREATE INDEX "discovery_run_source_status_idx" ON "discovery_run"("source","status");
CREATE TABLE "outreach_assessment" (
 "id" TEXT PRIMARY KEY, "company_id" TEXT NOT NULL, "research_priority" INTEGER NOT NULL,
 "primary_track" "role_track_key", "status" TEXT NOT NULL, "blockers" TEXT[] NOT NULL,
 "eligibility" JSONB, "fit" JSONB, "trigger" JSONB, "selected_contact_id" TEXT,
 "cited_evidence_ids" TEXT[] NOT NULL, "assessed_at" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "outreach_assessment_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "outreach_assessment_company_id_key" ON "outreach_assessment"("company_id");
CREATE INDEX "outreach_assessment_research_priority_idx" ON "outreach_assessment"("research_priority");
CREATE TABLE "contact_research" (
 "id" TEXT PRIMARY KEY, "contact_id" TEXT NOT NULL, "company_id" TEXT NOT NULL, "identity_status" TEXT NOT NULL,
 "facts" JSONB NOT NULL, "hooks" JSONB, "cited_evidence_ids" TEXT[] NOT NULL, "limitations" TEXT[] NOT NULL,
 "researched_at" TIMESTAMP(3) NOT NULL, "verified_at" TIMESTAMP(3),
 CONSTRAINT "contact_research_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contact"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "contact_research_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "contact_research_contact_id_key" ON "contact_research"("contact_id");
CREATE TABLE "preparation_run" (
 "id" TEXT PRIMARY KEY, "status" TEXT NOT NULL, "limit" INTEGER NOT NULL, "provider" TEXT NOT NULL,
 "checkpoint" JSONB NOT NULL, "usage" JSONB, "errors" JSONB, "cohort" JSONB,
 "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL, "completed_at" TIMESTAMP(3)
);
CREATE INDEX "preparation_run_status_idx" ON "preparation_run"("status");
CREATE INDEX "evidence_contact_id_idx" ON "evidence"("contact_id");
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- Company/person binding is enforced even for writers outside the application.
CREATE UNIQUE INDEX "contact_id_company_id_key" ON "contact"("id", "company_id");
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_person_has_company" CHECK ("contact_id" IS NULL OR "company_id" IS NOT NULL);
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_contact_company_fkey" FOREIGN KEY ("contact_id", "company_id") REFERENCES "contact"("id", "company_id") ON DELETE SET NULL ("contact_id") ON UPDATE CASCADE;
ALTER TABLE "contact_research" ADD CONSTRAINT "contact_research_contact_company_fkey" FOREIGN KEY ("contact_id", "company_id") REFERENCES "contact"("id", "company_id") ON DELETE CASCADE ON UPDATE CASCADE;
COMMIT;
