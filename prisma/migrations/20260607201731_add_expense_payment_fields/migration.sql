/*
  Warnings:

  - You are about to drop the column `allowances` on the `SalarySlip` table. All the data in the column will be lost.
  - You are about to drop the column `deductions` on the `SalarySlip` table. All the data in the column will be lost.
  - You are about to drop the `GradingSchema` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `salaryPeriodEnd` to the `SalarySlip` table without a default value. This is not possible if the table is not empty.
  - Added the required column `salaryPeriodStart` to the `SalarySlip` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "GradingSchema" DROP CONSTRAINT "GradingSchema_classId_fkey";

-- DropForeignKey
ALTER TABLE "GradingSchema" DROP CONSTRAINT "GradingSchema_subjectId_fkey";

-- DropForeignKey
ALTER TABLE "GradingSchema" DROP CONSTRAINT "GradingSchema_teacherId_fkey";

-- AlterTable
ALTER TABLE "SalarySlip" DROP COLUMN "allowances",
DROP COLUMN "deductions",
ADD COLUMN     "accountNumber" TEXT,
ADD COLUMN     "bankName" TEXT,
ADD COLUMN     "customFields" JSONB,
ADD COLUMN     "department" TEXT,
ADD COLUMN     "designation" TEXT,
ADD COLUMN     "employeeNumber" TEXT,
ADD COLUMN     "isDeleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "lunchDues" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "overtimeAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "paymentSource" TEXT,
ADD COLUMN     "salaryPeriodEnd" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "salaryPeriodStart" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "totalAdditions" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "totalDeductions" DECIMAL(10,2) NOT NULL DEFAULT 0,
ALTER COLUMN "status" SET DEFAULT 'ISSUED';

-- AlterTable
ALTER TABLE "SubjectResult" ADD COLUMN     "customFieldValues" JSONB,
ADD COLUMN     "resultStatus" TEXT DEFAULT 'Pending';

-- AlterTable
ALTER TABLE "TermResult" ADD COLUMN     "customFields" JSONB,
ADD COLUMN     "teacherRemarks" TEXT;

-- DropTable
DROP TABLE "GradingSchema";

-- CreateTable
CREATE TABLE "SalarySlipEditLog" (
    "id" TEXT NOT NULL,
    "salarySlipId" TEXT NOT NULL,
    "editedById" TEXT NOT NULL,
    "beforeState" JSONB NOT NULL,
    "afterState" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalarySlipEditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfitLossStatement" (
    "id" TEXT NOT NULL,
    "campusId" TEXT,
    "periodLabel" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "totalIncome" DECIMAL(12,2) NOT NULL,
    "totalExpenses" DECIMAL(12,2) NOT NULL,
    "grossMargin" DECIMAL(12,2) NOT NULL,
    "profitPercentage" DECIMAL(5,2) NOT NULL,
    "superAdminAllocation" DECIMAL(12,2) NOT NULL,
    "superAdminMonthlyDraw" DECIMAL(12,2) NOT NULL,
    "reserveContribution" DECIMAL(12,2) NOT NULL,
    "remainingAmount" DECIMAL(12,2) NOT NULL,
    "generatedBy" TEXT NOT NULL,
    "snapshotData" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProfitLossStatement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReserveFundLedger" (
    "id" TEXT NOT NULL,
    "profitLossId" TEXT NOT NULL,
    "campusId" TEXT,
    "contributionAmount" DECIMAL(12,2) NOT NULL,
    "cumulativeTotal" DECIMAL(12,2) NOT NULL,
    "periodLabel" TEXT NOT NULL,
    "transactionDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "ReserveFundLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthlyMonitoringReport" (
    "id" TEXT NOT NULL,
    "classSectionId" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "generatedById" TEXT NOT NULL,
    "reportData" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MonthlyMonitoringReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SalarySlipEditLog_salarySlipId_idx" ON "SalarySlipEditLog"("salarySlipId");

-- CreateIndex
CREATE INDEX "SalarySlipEditLog_editedById_idx" ON "SalarySlipEditLog"("editedById");

-- CreateIndex
CREATE INDEX "ProfitLossStatement_campusId_idx" ON "ProfitLossStatement"("campusId");

-- CreateIndex
CREATE INDEX "ProfitLossStatement_periodStart_idx" ON "ProfitLossStatement"("periodStart");

-- CreateIndex
CREATE INDEX "ProfitLossStatement_generatedBy_idx" ON "ProfitLossStatement"("generatedBy");

-- CreateIndex
CREATE UNIQUE INDEX "ReserveFundLedger_profitLossId_key" ON "ReserveFundLedger"("profitLossId");

-- CreateIndex
CREATE INDEX "ReserveFundLedger_transactionDate_idx" ON "ReserveFundLedger"("transactionDate");

-- CreateIndex
CREATE INDEX "ReserveFundLedger_campusId_idx" ON "ReserveFundLedger"("campusId");

-- CreateIndex
CREATE INDEX "MonthlyMonitoringReport_classSectionId_idx" ON "MonthlyMonitoringReport"("classSectionId");

-- CreateIndex
CREATE INDEX "MonthlyMonitoringReport_generatedById_idx" ON "MonthlyMonitoringReport"("generatedById");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyMonitoringReport_classSectionId_month_year_academicY_key" ON "MonthlyMonitoringReport"("classSectionId", "month", "year", "academicYearId");

-- CreateIndex
CREATE INDEX "SalarySlip_generatedBy_idx" ON "SalarySlip"("generatedBy");

-- CreateIndex
CREATE INDEX "SalarySlip_isDeleted_idx" ON "SalarySlip"("isDeleted");

-- CreateIndex
CREATE INDEX "TermResult_declarationStatus_idx" ON "TermResult"("declarationStatus");

-- AddForeignKey
ALTER TABLE "SalarySlipEditLog" ADD CONSTRAINT "SalarySlipEditLog_salarySlipId_fkey" FOREIGN KEY ("salarySlipId") REFERENCES "SalarySlip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfitLossStatement" ADD CONSTRAINT "ProfitLossStatement_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReserveFundLedger" ADD CONSTRAINT "ReserveFundLedger_profitLossId_fkey" FOREIGN KEY ("profitLossId") REFERENCES "ProfitLossStatement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyMonitoringReport" ADD CONSTRAINT "MonthlyMonitoringReport_classSectionId_fkey" FOREIGN KEY ("classSectionId") REFERENCES "ClassSection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
