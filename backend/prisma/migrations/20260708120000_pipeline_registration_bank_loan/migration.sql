-- Rename the final closing pipeline stage from CONVERTED to REGISTRATION,
-- and add a dedicated BANK_LOAN stage for tracking financing approvals.
-- (LeadStatus.CONVERTED is unchanged — it still represents the "deal closed" status;
-- only the Kanban pipeline stage naming/shape changes.)

ALTER TYPE "PipelineStage" ADD VALUE 'BANK_LOAN' BEFORE 'SHARED_TO_PARTNER';

ALTER TYPE "PipelineStage" RENAME VALUE 'CONVERTED' TO 'REGISTRATION';
