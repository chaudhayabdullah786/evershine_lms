-- DropForeignKey
ALTER TABLE "TermResult" DROP CONSTRAINT "TermResult_teacherId_fkey";

-- AddForeignKey
ALTER TABLE "TermResult" ADD CONSTRAINT "TermResult_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE SET NULL ON UPDATE CASCADE;
