-- Add optional payment tracking fields to Expense records.
ALTER TABLE "Expense"
  ADD COLUMN "paymentSource" TEXT;

ALTER TABLE "Expense"
  ADD COLUMN "paymentReference" TEXT;

CREATE INDEX "Expense_paymentSource_idx" ON "Expense"("paymentSource");
