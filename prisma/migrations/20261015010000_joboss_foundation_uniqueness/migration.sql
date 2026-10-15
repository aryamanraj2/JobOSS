-- Corrections only. Previously applied migrations and all historical rows remain unchanged.
BEGIN;
-- Keep duplicate inspection and creation atomic against concurrent writers.
LOCK TABLE "research_budget", "llm_task" IN SHARE ROW EXCLUSIVE MODE;
DO $$
DECLARE duplicates TEXT;
BEGIN
  SELECT string_agg(period_month || ' (' || n || ' rows)', ', ') INTO duplicates
    FROM (SELECT period_month, count(*) AS n FROM research_budget WHERE company_id IS NULL GROUP BY period_month HAVING count(*) > 1) AS groups;
  IF duplicates IS NOT NULL THEN
    RAISE EXCEPTION 'Duplicate global budget periods: %. Explicit reconciliation required; no rows or caps changed.', duplicates;
  END IF;
  SELECT string_agg(kind || '/' || prompt_version || '/' || subject_type || '/' || subject_id || ' (' || n || ' rows)', ', ') INTO duplicates
    FROM (SELECT kind, prompt_version, subject_type, subject_id, count(*) AS n FROM llm_task
      WHERE status IN ('pending', 'claimed') GROUP BY kind, prompt_version, subject_type, subject_id HAVING count(*) > 1) AS groups;
  IF duplicates IS NOT NULL THEN
    RAISE EXCEPTION 'Duplicate open task identities: %. Explicit reconciliation required; no tasks changed.', duplicates;
  END IF;
END $$;
CREATE UNIQUE INDEX "one_global_research_budget_per_period" ON "research_budget"("period_month") WHERE "company_id" IS NULL;
CREATE UNIQUE INDEX "one_open_llm_task_per_identity" ON "llm_task"("kind", "prompt_version", "subject_type", "subject_id") WHERE "status" IN ('pending', 'claimed');
COMMIT;
