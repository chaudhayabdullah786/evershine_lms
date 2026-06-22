-- AlterTable
ALTER TABLE "AdmissionRequest" ADD COLUMN     "admissionFee" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "requestedCourseFee" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "totalAcademicFee" DECIMAL(10,2) NOT NULL DEFAULT 0;
