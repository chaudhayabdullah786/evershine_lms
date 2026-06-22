-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SessionShift') THEN
    CREATE TYPE "SessionShift" AS ENUM ('MORNING', 'EVENING');
  END IF;
END $$;

-- AlterTable
ALTER TABLE "Attendance" ADD COLUMN "shift" "SessionShift" NOT NULL DEFAULT 'MORNING';

-- AlterTable
ALTER TABLE "Class" ADD COLUMN "shift" "SessionShift" NOT NULL DEFAULT 'MORNING';

-- AlterTable
ALTER TABLE "Student" ADD COLUMN "shift" "SessionShift" NOT NULL DEFAULT 'MORNING';

-- AlterTable
ALTER TABLE "TeacherAttendance" ADD COLUMN "shift" "SessionShift" NOT NULL DEFAULT 'MORNING';

-- AlterTable
ALTER TABLE "Timetable" ADD COLUMN "shift" "SessionShift" NOT NULL DEFAULT 'MORNING';

-- DropIndex
DROP INDEX IF EXISTS "Attendance_studentId_classId_date_key";

-- DropIndex
DROP INDEX IF EXISTS "Class_grade_section_campusId_academicYear_key";

-- DropIndex
DROP INDEX IF EXISTS "TeacherAttendance_teacherId_date_key";

-- CreateIndex
CREATE UNIQUE INDEX "Attendance_studentId_classId_date_shift_key" ON "Attendance"("studentId", "classId", "date", "shift");

-- CreateIndex
CREATE INDEX "Attendance_classId_date_shift_idx" ON "Attendance"("classId", "date", "shift");

-- CreateIndex
CREATE INDEX "Attendance_shift_idx" ON "Attendance"("shift");

-- CreateIndex
CREATE UNIQUE INDEX "Class_grade_section_campusId_academicYear_shift_key" ON "Class"("grade", "section", "campusId", "academicYear", "shift");

-- CreateIndex
CREATE INDEX "Class_shift_idx" ON "Class"("shift");

-- CreateIndex
CREATE UNIQUE INDEX "TeacherAttendance_teacherId_date_shift_key" ON "TeacherAttendance"("teacherId", "date", "shift");

-- CreateIndex
CREATE INDEX "TeacherAttendance_shift_idx" ON "TeacherAttendance"("shift");

-- CreateIndex
CREATE INDEX "Timetable_shift_idx" ON "Timetable"("shift");
