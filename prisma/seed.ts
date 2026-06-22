/**
 * Evershaheen Academy LMS — Database Seed Script
 *
 * Purpose: Populate the database with initial required data.
 * Run with: npx ts-node --compiler-options '{"module":"CommonJS"}' prisma/seed.ts
 *
 * WHY this structure: Seeding is idempotent — upsert is used everywhere
 * so this script can be run safely multiple times without duplicate errors.
 */

import { PrismaClient, Role, Gender, EnrollmentStatus, FeeStatus } from '@prisma/client'
import { hash } from '@node-rs/argon2'

const prisma = new PrismaClient()

// WHY Argon2id params: OWASP recommends memory >= 64MB, iterations >= 3
// These values are tuned for a development machine; increase memoryCost in prod.
const ARGON2_OPTIONS = {
  memoryCost: 65536,  // 64 MB
  timeCost: 3,
  parallelism: 4,
  outputLen: 32,
}

async function hashPassword(plain: string): Promise<string> {
  return hash(plain, ARGON2_OPTIONS)
}

async function main() {
  console.log('🌱 Starting database seed...')

  // ── Campuses ────────────────────────────────────────────────────────────────
  const boysCampus = await prisma.campus.upsert({
    where: { code: 'BC' },
    update: {},
    create: {
      name: 'Boys Campus',
      code: 'BC',
      address: 'Main Road, Evershine Academy, City',
      phone: '+92-328-4010522',
      email: 'boys@evershineacademy.edu.pk',
      principalName: 'Mr. Principal Boys',
    },
  })

  const girlsCampus = await prisma.campus.upsert({
    where: { code: 'GC' },
    update: {},
    create: {
      name: 'Girls Campus',
      code: 'GC',
      address: 'Girls Block, Evershine Academy, City',
      phone: '+92-324-8985526',
      email: 'girls@evershineacademy.edu.pk',
      principalName: 'Ms. Principal Girls',
    },
  })

  console.log('✅ Campuses created:', boysCampus.code, girlsCampus.code)

  // ── Batches (Boys Campus) ────────────────────────────────────────────────────
  const batchData = [
    { name: 'Kids Campus', code: 'KC', academicLevel: 'Elementary', description: 'Class 1 to Class 5' },
    { name: 'Junior', code: 'JR', academicLevel: 'Middle', description: 'Class 6 to Class 8' },
    { name: 'Matriculation', code: 'MAT', academicLevel: 'Secondary', description: 'Class 9 to Class 10' },
    { name: 'Intermediate', code: 'INT', academicLevel: 'HigherSecondary', description: 'Class 11 to Class 12' },
  ]

  const batches: Record<string, { id: string; name: string; campusId: string }> = {}

  for (const b of batchData) {
    const batch = await prisma.batch.upsert({
      where: { name_campusId: { name: b.name, campusId: boysCampus.id } },
      update: {},
      create: {
        name: b.name,
        code: b.code,
        campusId: boysCampus.id,
        academicLevel: b.academicLevel,
        description: b.description,
      },
    })
    batches[b.code] = batch
  }

  // Also create remaining batches for Girls Campus
  for (const b of batchData) {
    await prisma.batch.upsert({
      where: { name_campusId: { name: b.name, campusId: girlsCampus.id } },
      update: {},
      create: {
        name: b.name,
        code: b.code,
        campusId: girlsCampus.id,
        academicLevel: b.academicLevel as any,
        description: b.description + ' (Girls)',
      },
    })
  }
  
  // Re-fetch girls batches
  const girlsBatches = await prisma.batch.findMany({ where: { campusId: girlsCampus.id } })
  const girlsBatchMap: Record<string, any> = {}
  for (const gb of girlsBatches) {
    let code = ''
    if (gb.name === 'Kids Campus') code = 'KC'
    else if (gb.name === 'Junior') code = 'JR'
    else if (gb.name === 'Matriculation') code = 'MAT'
    else if (gb.name === 'Intermediate') code = 'INT'
    girlsBatchMap[code] = gb
  }

  console.log('✅ Batches created for both campuses')

  // ── Houses (Matriculation batch — Boys) ─────────────────────────────────────
  const matricHouses = [
    { name: 'Shaheen', color: '#1E40AF' },   // Blue
    { name: 'Parvaaz', color: '#15803D' },   // Green
    { name: 'Junoon',  color: '#DC2626' },   // Red
  ]

  for (const h of matricHouses) {
    await prisma.house.upsert({
      where: { name_batchId: { name: h.name, batchId: batches['MAT'].id } },
      update: {},
      create: {
        name: h.name,
        color: h.color,
        batchId: batches['MAT'].id,
        motto: `${h.name} — Excellence in every endeavour`,
      },
    })
  }

  // Also seed Matriculation houses for Girls Campus if batch exists
  if (girlsBatchMap['MAT']) {
    for (const h of matricHouses) {
      await prisma.house.upsert({
        where: { name_batchId: { name: h.name, batchId: girlsBatchMap['MAT'].id } },
        update: {},
        create: {
          name: h.name,
          color: h.color,
          batchId: girlsBatchMap['MAT'].id,
          motto: `${h.name} — Excellence in every endeavour (Girls)`,
        },
      })
    }
  }

  // ── Houses (Intermediate batch — Boys) ──────────────────────────────────────
  const interHouses = [
    { name: 'Udraan',  color: '#D97706' },   // Amber
    { name: 'Pehchaan', color: '#7C3AED' },  // Purple
  ]

  for (const h of interHouses) {
    await prisma.house.upsert({
      where: { name_batchId: { name: h.name, batchId: batches['INT'].id } },
      update: {},
      create: {
        name: h.name,
        color: h.color,
        batchId: batches['INT'].id,
        motto: `${h.name} — Pride of Evershine`,
      },
    })
  }

  // Also seed Intermediate houses for Girls Campus if batch exists
  if (girlsBatchMap['INT']) {
    for (const h of interHouses) {
      await prisma.house.upsert({
        where: { name_batchId: { name: h.name, batchId: girlsBatchMap['INT'].id } },
        update: {},
        create: {
          name: h.name,
          color: h.color,
          batchId: girlsBatchMap['INT'].id,
          motto: `${h.name} — Pride of Evershine (Girls)`,
        },
      })
    }
  }

  console.log('✅ Houses created for Matriculation and Intermediate batches')

  // ── Sample Classes for ALL Batches ──────────────────────────────────────────
  const classDefinitions = [
    // Kids (1-5)
    { name: 'Class 1-A', grade: 1, batchCode: 'KC' },
    { name: 'Class 2-A', grade: 2, batchCode: 'KC' },
    { name: 'Class 3-A', grade: 3, batchCode: 'KC' },
    { name: 'Class 4-A', grade: 4, batchCode: 'KC' },
    { name: 'Class 5-A', grade: 5, batchCode: 'KC' },
    // Junior (6-8)
    { name: 'Class 6-A', grade: 6, batchCode: 'JR' },
    { name: 'Class 7-A', grade: 7, batchCode: 'JR' },
    { name: 'Class 8-A', grade: 8, batchCode: 'JR' },
    // Matriculation (9-10)
    { name: 'Class 9-A', grade: 9, batchCode: 'MAT' },
    { name: 'Class 10-A', grade: 10, batchCode: 'MAT' },
    // Intermediate (11-12)
    { name: 'Class 11-A', grade: 11, batchCode: 'INT' },
    { name: 'Class 12-A', grade: 12, batchCode: 'INT' },
  ]

  let matricClassId = ''

  for (const cd of classDefinitions) {
    // Boys Campus Class
    const clsBoys = await prisma.class.upsert({
      where: {
        grade_section_campusId_academicYear_shift: {
          grade: cd.grade,
          section: 'A',
          campusId: boysCampus.id,
          academicYear: '2024-2025',
          shift: 'MORNING',
        },
      },
      update: {},
      create: {
        name: cd.name,
        grade: cd.grade,
        section: 'A',
        shift: 'MORNING',
        campusId: boysCampus.id,
        batchId: batches[cd.batchCode].id,
        academicYear: '2024-2025',
        capacity: 40,
        roomNumber: `R-${cd.grade}01`,
      },
    })
    if (cd.batchCode === 'MAT') matricClassId = clsBoys.id
    
    // Girls Campus Class
    if (girlsBatchMap[cd.batchCode]) {
      await prisma.class.upsert({
        where: {
          grade_section_campusId_academicYear_shift: {
            grade: cd.grade,
            section: 'A',
            campusId: girlsCampus.id,
            academicYear: '2024-2025',
            shift: 'MORNING',
          },
        },
        update: {},
        create: {
          name: cd.name,
          grade: cd.grade,
          section: 'A',
          shift: 'MORNING',
          campusId: girlsCampus.id,
          batchId: girlsBatchMap[cd.batchCode].id,
          academicYear: '2024-2025',
          capacity: 40,
          roomNumber: `R-${cd.grade}02`, // Girls campus rooms
        },
      })
    }
  }

  console.log('✅ Sample classes created for all batches')

  // ── Super Admin User ─────────────────────────────────────────────────────────
  // SECURITY: Default password must be changed on first login in production.
  const superAdminHash = await hashPassword('Admin@2026!')

  const superAdminUser = await prisma.user.upsert({
    where: { email: 'admin@evershineacademy.edu.pk' },
    update: {},
    create: {
      email: 'admin@evershineacademy.edu.pk',
      passwordHash: superAdminHash,
      role: Role.SUPER_ADMIN,
      isActive: true,
      emailVerified: true,
    },
  })

  await prisma.admin.upsert({
    where: { userId: superAdminUser.id },
    update: {},
    create: {
      userId: superAdminUser.id,
      firstName: 'Super',
      lastName: 'Admin',
      campusId: boysCampus.id,
      department: 'Administration',
    },
  })

  console.log('✅ Super Admin created: admin@evershineacademy.edu.pk / Admin@2026!')

  // ── Sample Teacher ────────────────────────────────────────────────────────────
  const teacherHash = await hashPassword('Teacher@2026!')

  const teacherUser = await prisma.user.upsert({
    where: { email: 'teacher1@evershineacademy.edu.pk' },
    update: {},
    create: {
      email: 'teacher1@evershineacademy.edu.pk',
      passwordHash: teacherHash,
      role: Role.TEACHER,
      isActive: true,
    },
  })

  const teacher = await prisma.teacher.upsert({
    where: { employeeId: 'ESA-TCH-001' },
    update: {},
    create: {
      userId: teacherUser.id,
      employeeId: 'ESA-TCH-001',
      firstName: 'Ahmed',
      lastName: 'Khan',
      cnic: '3520100000001',
      dateOfBirth: new Date('1985-03-15'),
      gender: Gender.MALE,
      qualification: 'M.Sc. Mathematics',
      specialization: 'Mathematics',
      experienceYears: 8,
      joiningDate: new Date('2018-09-01'),
      phoneNumber: '+92-300-1111001',
      email: 'teacher1@evershineacademy.edu.pk',
      address: 'House #1, Street 5, City',
      city: 'Lahore',
      emergencyContact: '+92-300-1111002',
      campusId: boysCampus.id,
      batchId: batches['MAT'].id,
      designation: 'Senior Teacher',
      monthlySalary: 45000,
    },
  })

  console.log('✅ Sample teacher created: teacher1@evershineacademy.edu.pk')

  // Create subjects for the matriculation class (Class 10-A)
  const mathSubject = await prisma.subject.upsert({
    where: { code_classId: { code: 'MATH-10', classId: matricClassId } },
    update: {},
    create: {
      name: 'Mathematics',
      code: 'MATH-10',
      classId: matricClassId,
      totalMarks: 100,
      passingMarks: 33,
    },
  })

  const physicsSubject = await prisma.subject.upsert({
    where: { code_classId: { code: 'PHY-10', classId: matricClassId } },
    update: {},
    create: {
      name: 'Physics',
      code: 'PHY-10',
      classId: matricClassId,
      totalMarks: 100,
      passingMarks: 33,
    },
  })

  const englishSubject = await prisma.subject.upsert({
    where: { code_classId: { code: 'ENG-10', classId: matricClassId } },
    update: {},
    create: {
      name: 'English',
      code: 'ENG-10',
      classId: matricClassId,
      totalMarks: 100,
      passingMarks: 33,
    },
  })

  console.log('✅ Subjects created for Class 10-A')

  // Assign teacher as ClassTeacher of Class 10-A
  await prisma.classTeacher.upsert({
    where: { classId_teacherId_academicYear: { classId: matricClassId, teacherId: teacher.id, academicYear: '2024-2025' } },
    update: {},
    create: {
      classId: matricClassId,
      teacherId: teacher.id,
      isClassTeacher: true,
      academicYear: '2024-2025',
    },
  })

  // Assign teacher as SubjectTeacher for Mathematics and Physics in Class 10-A
  await prisma.subjectTeacher.upsert({
    where: { subjectId_teacherId: { subjectId: mathSubject.id, teacherId: teacher.id } },
    update: {},
    create: {
      subjectId: mathSubject.id,
      teacherId: teacher.id,
    },
  })

  await prisma.subjectTeacher.upsert({
    where: { subjectId_teacherId: { subjectId: physicsSubject.id, teacherId: teacher.id } },
    update: {},
    create: {
      subjectId: physicsSubject.id,
      teacherId: teacher.id,
    },
  })

  console.log('✅ Seeded ClassTeacher and SubjectTeacher assignments for teacher1')

  // ── Sample Students ───────────────────────────────────────────────────────────
  const studentSeeds = [
    {
      email: 'student1@evershineacademy.edu.pk',
      regNumber: 'ESA/2024/0001',
      firstName: 'Ali',
      lastName: 'Hassan',
      fatherName: 'Muhammad Hassan',
      cnicBForm: '3520200000001',
      dob: new Date('2009-05-12'),
      phone: '+92-300-2222001',
    },
    {
      email: 'student2@evershineacademy.edu.pk',
      regNumber: 'ESA/2024/0002',
      firstName: 'Usman',
      lastName: 'Shah',
      fatherName: 'Tariq Shah',
      cnicBForm: '3520200000002',
      dob: new Date('2009-08-22'),
      phone: '+92-300-2222002',
    },
    {
      email: 'student3@evershineacademy.edu.pk',
      regNumber: 'ESA/2024/0003',
      firstName: 'Bilal',
      lastName: 'Ahmed',
      fatherName: 'Rashid Ahmed',
      cnicBForm: '3520200000003',
      dob: new Date('2010-01-30'),
      phone: '+92-300-2222003',
    },
  ]

  const studentHash = await hashPassword('Student@2026!')

  for (const s of studentSeeds) {
    const stuUser = await prisma.user.upsert({
      where: { email: s.email },
      update: {},
      create: {
        email: s.email,
        passwordHash: studentHash,
        role: Role.STUDENT,
        isActive: true,
      },
    })

    await prisma.student.upsert({
      where: { registrationNumber: s.regNumber },
      update: {},
      create: {
        userId: stuUser.id,
        registrationNumber: s.regNumber,
        firstName: s.firstName,
        lastName: s.lastName,
        fatherName: s.fatherName,
        cnicBForm: s.cnicBForm,
        dateOfBirth: s.dob,
        gender: Gender.MALE,
        address: 'House #1, Street 5, City',
        city: 'Lahore',
        province: 'Punjab',
        phoneNumber: s.phone,
        emergencyContact: s.phone,
        email: s.email,
        campusId: boysCampus.id,
        batchId: batches['MAT'].id,
        classId: matricClassId,
        section: 'A',
        academicYear: '2024-2025',
        enrollmentStatus: EnrollmentStatus.ACTIVE,
        feeStatus: FeeStatus.PENDING,
        totalFeeAmount: 18000,
        dueAmount: 18000,
        idCardQRCode: `ESA-QR-${s.regNumber.replace(/\//g, '-')}`,
      },
    })
  }

  console.log('✅ 3 sample students created')
  console.log('\n🎉 Seed completed successfully!')
  console.log('\n📋 Login credentials:')
  console.log('   Super Admin : admin@evershineacademy.edu.pk  / Admin@2026!')
  console.log('   Teacher     : teacher1@evershineacademy.edu.pk / Teacher@2026!')
  console.log('   Students    : student1–3@evershineacademy.edu.pk / Student@2026!')
}

main()
  .catch((error) => {
    console.error('[SEED ERROR]', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
