-- Canonical current-year teacher scope. Existing legacy rows are retained for
-- audit and compatibility, but portal authorization will use this table.
CREATE TABLE `TeacherSectionAssignment` (
  `id` VARCHAR(191) NOT NULL,
  `teacherId` VARCHAR(191) NOT NULL,
  `classSectionId` VARCHAR(191) NOT NULL,
  `academicYearId` VARCHAR(191) NOT NULL,
  `isClassTeacher` BOOLEAN NOT NULL DEFAULT false,
  `status` ENUM('ACTIVE', 'REVOKED') NOT NULL DEFAULT 'ACTIVE',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`),
  UNIQUE KEY `TeacherSectionAssignment_teacherId_classSectionId_academicYearId_key`
    (`teacherId`, `classSectionId`, `academicYearId`),
  KEY `TeacherSectionAssignment_teacherId_academicYearId_status_idx`
    (`teacherId`, `academicYearId`, `status`),
  KEY `TeacherSectionAssignment_classSectionId_academicYearId_status_idx`
    (`classSectionId`, `academicYearId`, `status`),
  CONSTRAINT `TeacherSectionAssignment_teacherId_fkey`
    FOREIGN KEY (`teacherId`) REFERENCES `Teacher` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `TeacherSectionAssignment_classSectionId_fkey`
    FOREIGN KEY (`classSectionId`) REFERENCES `ClassSection` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `TeacherSectionAssignment_academicYearId_fkey`
    FOREIGN KEY (`academicYearId`) REFERENCES `AcademicYear` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Seed only the active academic year. Historical records remain available for
-- reporting but must not grant current portal access.
INSERT INTO `TeacherSectionAssignment`
  (`id`, `teacherId`, `classSectionId`, `academicYearId`, `isClassTeacher`, `status`, `createdAt`, `updatedAt`)
SELECT
  CONCAT('tsa_so_', LEFT(MD5(CONCAT(so.teacherId, ':', so.classSectionId, ':', so.academicYearId)), 24)),
  so.teacherId,
  so.classSectionId,
  so.academicYearId,
  false,
  'ACTIVE',
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3)
FROM `SubjectOffering` so
JOIN `AcademicYear` ay ON ay.id = so.academicYearId AND ay.isActive = 1
WHERE so.teacherId IS NOT NULL
ON DUPLICATE KEY UPDATE `updatedAt` = CURRENT_TIMESTAMP(3);

-- Also preserve explicit current-year homeroom assignments where the legacy
-- Class row can be matched to the canonical section identifiers.
INSERT INTO `TeacherSectionAssignment`
  (`id`, `teacherId`, `classSectionId`, `academicYearId`, `isClassTeacher`, `status`, `createdAt`, `updatedAt`)
SELECT
  CONCAT('tsa_ct_', LEFT(MD5(CONCAT(ct.teacherId, ':', cs.id, ':', ay.id)), 24)),
  ct.teacherId,
  cs.id,
  ay.id,
  true,
  'ACTIVE',
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3)
FROM `ClassTeacher` ct
JOIN `Class` c ON c.id = ct.classId
JOIN `AcademicYear` ay ON ay.name = ct.academicYear AND ay.isActive = 1
JOIN `Shift` sh ON sh.code = c.shift
JOIN `ClassSection` cs
  ON cs.campusId = c.campusId
 AND cs.batchId = c.batchId
 AND cs.shiftId = sh.id
 AND cs.grade = c.grade
 AND cs.sectionName = COALESCE(c.section, '')
WHERE ct.isClassTeacher = 1
ON DUPLICATE KEY UPDATE
  `isClassTeacher` = 1,
  `updatedAt` = CURRENT_TIMESTAMP(3);
