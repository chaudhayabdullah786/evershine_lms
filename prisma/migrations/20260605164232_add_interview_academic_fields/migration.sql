-- DropForeignKey
ALTER TABLE "TimetableChangeRequest" DROP CONSTRAINT "TimetableChangeRequest_timetableId_fkey";

-- AlterTable
ALTER TABLE "AdmissionRequest" ADD COLUMN     "bFormDocUrl" TEXT,
ADD COLUMN     "boardName" TEXT,
ADD COLUMN     "disabilityDetails" TEXT,
ADD COLUMN     "district" TEXT,
ADD COLUMN     "domicile" TEXT,
ADD COLUMN     "fatherCnic" TEXT,
ADD COLUMN     "fatherOccupation" TEXT,
ADD COLUMN     "fatherQualification" TEXT,
ADD COLUMN     "guardianBusinessDealsIn" TEXT,
ADD COLUMN     "guardianBusinessName" TEXT,
ADD COLUMN     "guardianDesignation" TEXT,
ADD COLUMN     "guardianEmploymentStatus" TEXT,
ADD COLUMN     "guardianOrganization" TEXT,
ADD COLUMN     "hasDisability" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hasSiblingAtAcademy" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "interviewDate" TIMESTAMP(3),
ADD COLUMN     "interviewNotes" TEXT,
ADD COLUMN     "interviewOutcome" TEXT,
ADD COLUMN     "interviewerName" TEXT,
ADD COLUMN     "lastClassPassed" INTEGER,
ADD COLUMN     "lastPercentage" TEXT,
ADD COLUMN     "medicalConditions" TEXT,
ADD COLUMN     "motherName" TEXT,
ADD COLUMN     "permanentAddress" TEXT,
ADD COLUMN     "placeOfBirth" TEXT,
ADD COLUMN     "previousGroup" TEXT,
ADD COLUMN     "previousMarksObtained" INTEGER,
ADD COLUMN     "previousResultUrl" TEXT,
ADD COLUMN     "repeaterSubjects" TEXT,
ADD COLUMN     "requestedCourses" TEXT[],
ADD COLUMN     "requestedGroup" TEXT,
ADD COLUMN     "siblingClass" TEXT,
ADD COLUMN     "siblingName" TEXT,
ADD COLUMN     "sourceOfInfo" TEXT,
ADD COLUMN     "tehsil" TEXT,
ADD COLUMN     "termsAccepted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "termsAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "yearOfPassing" INTEGER;

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "bFormDocUrl" TEXT,
ADD COLUMN     "boardName" TEXT,
ADD COLUMN     "disabilityDetails" TEXT,
ADD COLUMN     "district" TEXT,
ADD COLUMN     "domicile" TEXT,
ADD COLUMN     "fatherCnic" TEXT,
ADD COLUMN     "fatherOccupation" TEXT,
ADD COLUMN     "fatherQualification" TEXT,
ADD COLUMN     "guardianBusinessDealsIn" TEXT,
ADD COLUMN     "guardianBusinessName" TEXT,
ADD COLUMN     "guardianDesignation" TEXT,
ADD COLUMN     "guardianEmploymentStatus" TEXT,
ADD COLUMN     "guardianOrganization" TEXT,
ADD COLUMN     "hasDisability" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hasSiblingAtAcademy" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "interviewDate" TIMESTAMP(3),
ADD COLUMN     "interviewGroup" TEXT,
ADD COLUMN     "interviewInstitute" TEXT,
ADD COLUMN     "interviewMarksObtained" INTEGER,
ADD COLUMN     "interviewNotes" TEXT,
ADD COLUMN     "interviewOutcome" TEXT,
ADD COLUMN     "interviewPercentage" TEXT,
ADD COLUMN     "interviewYear" INTEGER,
ADD COLUMN     "interviewerName" TEXT,
ADD COLUMN     "lastClassPassed" INTEGER,
ADD COLUMN     "lastPercentage" TEXT,
ADD COLUMN     "medicalConditions" TEXT,
ADD COLUMN     "motherName" TEXT,
ADD COLUMN     "permanentAddress" TEXT,
ADD COLUMN     "placeOfBirth" TEXT,
ADD COLUMN     "previousGroup" TEXT,
ADD COLUMN     "previousMarksObtained" INTEGER,
ADD COLUMN     "previousResultUrl" TEXT,
ADD COLUMN     "repeaterSubjects" TEXT,
ADD COLUMN     "requestedCourses" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "requestedGroup" TEXT,
ADD COLUMN     "siblingClass" TEXT,
ADD COLUMN     "siblingName" TEXT,
ADD COLUMN     "sourceOfInfo" TEXT,
ADD COLUMN     "tehsil" TEXT,
ADD COLUMN     "yearOfPassing" INTEGER;

-- AlterTable
ALTER TABLE "TimetableChangeRequest" ADD COLUMN     "originalClass" TEXT,
ADD COLUMN     "originalDay" INTEGER,
ADD COLUMN     "originalEnd" TEXT,
ADD COLUMN     "originalStart" TEXT,
ADD COLUMN     "originalSubject" TEXT,
ADD COLUMN     "slotSource" TEXT NOT NULL DEFAULT 'legacy',
ADD COLUMN     "timetableSlotId" TEXT,
ALTER COLUMN "timetableId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "AdmissionRequest_createdAt_idx" ON "AdmissionRequest"("createdAt");

-- CreateIndex
CREATE INDEX "TimetableChangeRequest_timetableSlotId_idx" ON "TimetableChangeRequest"("timetableSlotId");

-- AddForeignKey
ALTER TABLE "TimetableChangeRequest" ADD CONSTRAINT "TimetableChangeRequest_timetableId_fkey" FOREIGN KEY ("timetableId") REFERENCES "Timetable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimetableChangeRequest" ADD CONSTRAINT "TimetableChangeRequest_timetableSlotId_fkey" FOREIGN KEY ("timetableSlotId") REFERENCES "TimetableSlot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
