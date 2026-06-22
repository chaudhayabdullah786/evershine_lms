-- AlterTable
ALTER TABLE "AdmissionRequest" ADD COLUMN     "requestedGroupOther" TEXT,
ADD COLUMN     "requestedCoursesOther" TEXT;

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "requestedGroupOther" TEXT,
ADD COLUMN     "requestedCoursesOther" TEXT;
