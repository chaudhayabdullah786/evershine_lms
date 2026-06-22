-- Add optional teacher ownership metadata to TermResult.
-- Existing rows remain unchanged; new and updated teacher portal results will record the teacher owner.

ALTER TABLE "TermResult"
  ADD COLUMN "teacherId" TEXT;

ALTER TABLE "TermResult"
  ADD CONSTRAINT "TermResult_teacherId_fkey"
  FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE SET NULL;

CREATE INDEX "TermResult_teacherId_idx" ON "TermResult" ("teacherId");
