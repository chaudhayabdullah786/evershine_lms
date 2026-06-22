-- CreateEnum
CREATE TYPE "EnrollmentType" AS ENUM ('REGULAR', 'SUPPLEMENTARY', 'PRACTICAL_ONLY', 'AUDIT');

-- CreateEnum
CREATE TYPE "ResultDeclarationStatus" AS ENUM ('DRAFT', 'DECLARED');

-- AlterEnum
ALTER TYPE "CertificateType" ADD VALUE 'STUDENT_PROFILE';

-- AlterTable
ALTER TABLE "Batch" ADD COLUMN     "forceGenderSeparation" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "StudentEnrollment" ADD COLUMN     "courseScope" JSONB,
ADD COLUMN     "enrollmentType" "EnrollmentType" NOT NULL DEFAULT 'REGULAR',
ADD COLUMN     "timetableScope" JSONB;

-- CreateTable
CREATE TABLE "EnrollmentTypeAuditLog" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "previousType" "EnrollmentType" NOT NULL,
    "newType" "EnrollmentType" NOT NULL,
    "changedById" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnrollmentTypeAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamDateSheet" (
    "id" TEXT NOT NULL,
    "classSectionId" TEXT NOT NULL,
    "examSessionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExamDateSheet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamDateSheetSlot" (
    "id" TEXT NOT NULL,
    "dateSheetId" TEXT NOT NULL,
    "subjectOfferingId" TEXT NOT NULL,
    "examDate" DATE NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "roomNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExamDateSheetSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamDateSheetOverride" (
    "id" TEXT NOT NULL,
    "dateSheetId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "subjectOfferingId" TEXT NOT NULL,
    "examDate" DATE NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExamDateSheetOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TermResult" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "classSectionId" TEXT NOT NULL,
    "examSessionId" TEXT NOT NULL,
    "overallPercentage" DECIMAL(5,2) NOT NULL,
    "grade" TEXT NOT NULL,
    "classPosition" INTEGER,
    "performanceBatch" TEXT NOT NULL,
    "declarationStatus" "ResultDeclarationStatus" NOT NULL DEFAULT 'DRAFT',
    "declaredAt" TIMESTAMP(3),
    "declaredById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TermResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubjectResult" (
    "id" TEXT NOT NULL,
    "termResultId" TEXT NOT NULL,
    "subjectOfferingId" TEXT NOT NULL,
    "totalMarks" INTEGER NOT NULL,
    "obtainedMarks" DECIMAL(5,2),
    "isAbsent" BOOLEAN NOT NULL DEFAULT false,
    "isNotApplicable" BOOLEAN NOT NULL DEFAULT false,
    "percentage" DECIMAL(5,2),
    "grade" TEXT,
    "remarks" TEXT,
    "performanceBatch" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubjectResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyPerformanceScore" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "subjectOfferingId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "score" DECIMAL(5,2) NOT NULL,
    "isAbsent" BOOLEAN NOT NULL DEFAULT false,
    "remarks" TEXT,
    "markedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyPerformanceScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetroactiveScoreEditLog" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "previousMarks" TEXT,
    "newMarks" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "editedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetroactiveScoreEditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TargetAssignment" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "subjectOfferingId" TEXT NOT NULL,
    "targetGrade" TEXT NOT NULL,
    "minPercentage" DECIMAL(5,2) NOT NULL,
    "maxPercentage" DECIMAL(5,2) NOT NULL,
    "assignedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TargetAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EnrollmentTypeAuditLog_studentId_idx" ON "EnrollmentTypeAuditLog"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "ExamDateSheet_classSectionId_examSessionId_key" ON "ExamDateSheet"("classSectionId", "examSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "ExamDateSheetSlot_dateSheetId_subjectOfferingId_key" ON "ExamDateSheetSlot"("dateSheetId", "subjectOfferingId");

-- CreateIndex
CREATE UNIQUE INDEX "ExamDateSheetOverride_studentId_dateSheetId_subjectOffering_key" ON "ExamDateSheetOverride"("studentId", "dateSheetId", "subjectOfferingId");

-- CreateIndex
CREATE INDEX "TermResult_classSectionId_examSessionId_idx" ON "TermResult"("classSectionId", "examSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "TermResult_studentId_classSectionId_examSessionId_key" ON "TermResult"("studentId", "classSectionId", "examSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "SubjectResult_termResultId_subjectOfferingId_key" ON "SubjectResult"("termResultId", "subjectOfferingId");

-- CreateIndex
CREATE INDEX "DailyPerformanceScore_subjectOfferingId_date_idx" ON "DailyPerformanceScore"("subjectOfferingId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "DailyPerformanceScore_studentId_subjectOfferingId_date_key" ON "DailyPerformanceScore"("studentId", "subjectOfferingId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "TargetAssignment_studentId_subjectOfferingId_key" ON "TargetAssignment"("studentId", "subjectOfferingId");

-- AddForeignKey
ALTER TABLE "EnrollmentTypeAuditLog" ADD CONSTRAINT "EnrollmentTypeAuditLog_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnrollmentTypeAuditLog" ADD CONSTRAINT "EnrollmentTypeAuditLog_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamDateSheet" ADD CONSTRAINT "ExamDateSheet_classSectionId_fkey" FOREIGN KEY ("classSectionId") REFERENCES "ClassSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamDateSheet" ADD CONSTRAINT "ExamDateSheet_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamDateSheetSlot" ADD CONSTRAINT "ExamDateSheetSlot_dateSheetId_fkey" FOREIGN KEY ("dateSheetId") REFERENCES "ExamDateSheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamDateSheetSlot" ADD CONSTRAINT "ExamDateSheetSlot_subjectOfferingId_fkey" FOREIGN KEY ("subjectOfferingId") REFERENCES "SubjectOffering"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamDateSheetOverride" ADD CONSTRAINT "ExamDateSheetOverride_dateSheetId_fkey" FOREIGN KEY ("dateSheetId") REFERENCES "ExamDateSheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamDateSheetOverride" ADD CONSTRAINT "ExamDateSheetOverride_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamDateSheetOverride" ADD CONSTRAINT "ExamDateSheetOverride_subjectOfferingId_fkey" FOREIGN KEY ("subjectOfferingId") REFERENCES "SubjectOffering"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TermResult" ADD CONSTRAINT "TermResult_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TermResult" ADD CONSTRAINT "TermResult_classSectionId_fkey" FOREIGN KEY ("classSectionId") REFERENCES "ClassSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TermResult" ADD CONSTRAINT "TermResult_declaredById_fkey" FOREIGN KEY ("declaredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubjectResult" ADD CONSTRAINT "SubjectResult_termResultId_fkey" FOREIGN KEY ("termResultId") REFERENCES "TermResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubjectResult" ADD CONSTRAINT "SubjectResult_subjectOfferingId_fkey" FOREIGN KEY ("subjectOfferingId") REFERENCES "SubjectOffering"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyPerformanceScore" ADD CONSTRAINT "DailyPerformanceScore_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyPerformanceScore" ADD CONSTRAINT "DailyPerformanceScore_subjectOfferingId_fkey" FOREIGN KEY ("subjectOfferingId") REFERENCES "SubjectOffering"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyPerformanceScore" ADD CONSTRAINT "DailyPerformanceScore_markedById_fkey" FOREIGN KEY ("markedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetroactiveScoreEditLog" ADD CONSTRAINT "RetroactiveScoreEditLog_editedById_fkey" FOREIGN KEY ("editedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TargetAssignment" ADD CONSTRAINT "TargetAssignment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TargetAssignment" ADD CONSTRAINT "TargetAssignment_subjectOfferingId_fkey" FOREIGN KEY ("subjectOfferingId") REFERENCES "SubjectOffering"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TargetAssignment" ADD CONSTRAINT "TargetAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
