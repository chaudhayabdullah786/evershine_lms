-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CertificateType" ADD VALUE 'TEACHER_ID_CARD';
ALTER TYPE "CertificateType" ADD VALUE 'TEACHER_EXPERIENCE_LETTER';
ALTER TYPE "CertificateType" ADD VALUE 'TEACHER_PROFILE';

-- DropForeignKey
ALTER TABLE "Accountant" DROP CONSTRAINT "Accountant_campusId_fkey";

-- AlterTable
ALTER TABLE "Accountant" ALTER COLUMN "campusId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "TeacherDocument" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "type" "CertificateType" NOT NULL,
    "title" TEXT NOT NULL,
    "pdfUrl" TEXT NOT NULL,
    "issuedBy" TEXT NOT NULL,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeacherDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TeacherDocument_teacherId_idx" ON "TeacherDocument"("teacherId");

-- CreateIndex
CREATE INDEX "TeacherDocument_type_idx" ON "TeacherDocument"("type");

-- CreateIndex
CREATE INDEX "TeacherDocument_issuedBy_idx" ON "TeacherDocument"("issuedBy");

-- AddForeignKey
ALTER TABLE "Accountant" ADD CONSTRAINT "Accountant_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherDocument" ADD CONSTRAINT "TeacherDocument_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
