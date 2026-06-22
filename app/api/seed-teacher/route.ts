import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    // 1. Find teacher user
    const teacherUser = await prisma.user.findFirst({
      where: { email: 'teacher1@evershineacademy.edu.pk' }
    })
    if (!teacherUser) {
      return NextResponse.json({ error: 'Teacher user teacher1@evershineacademy.edu.pk not found. Please seed the DB first.' }, { status: 404 })
    }

    // 2. Find teacher profile
    const teacher = await prisma.teacher.findFirst({
      where: { userId: teacherUser.id }
    })
    if (!teacher) {
      return NextResponse.json({ error: 'Teacher profile not found for the user Ahmed Khan.' }, { status: 404 })
    }

    // 3. Find Matriculation Class (Class 10-A) in Boys Campus
    const boysCampus = await prisma.campus.findFirst({
      where: { code: 'BC' }
    })
    if (!boysCampus) {
      return NextResponse.json({ error: 'Boys Campus (BC) not found.' }, { status: 404 })
    }

    const matricClass = await prisma.class.findFirst({
      where: {
        name: { contains: '10' },
        campusId: boysCampus.id
      }
    })
    if (!matricClass) {
      return NextResponse.json({ error: 'Class 10-A (Boys Campus) not found.' }, { status: 404 })
    }

    // 4. Create Subjects for Class 10-A
    const mathSubject = await prisma.subject.upsert({
      where: { code_classId: { code: 'MATH-10', classId: matricClass.id } },
      update: {},
      create: {
        name: 'Mathematics',
        code: 'MATH-10',
        classId: matricClass.id,
        totalMarks: 100,
        passingMarks: 33,
      },
    })

    const physicsSubject = await prisma.subject.upsert({
      where: { code_classId: { code: 'PHY-10', classId: matricClass.id } },
      update: {},
      create: {
        name: 'Physics',
        code: 'PHY-10',
        classId: matricClass.id,
        totalMarks: 100,
        passingMarks: 33,
      },
    })

    const englishSubject = await prisma.subject.upsert({
      where: { code_classId: { code: 'ENG-10', classId: matricClass.id } },
      update: {},
      create: {
        name: 'English',
        code: 'ENG-10',
        classId: matricClass.id,
        totalMarks: 100,
        passingMarks: 33,
      },
    })

    // 5. Assign teacher as ClassTeacher of Class 10-A
    const classTeacher = await prisma.classTeacher.upsert({
      where: { classId_teacherId_academicYear: { classId: matricClass.id, teacherId: teacher.id, academicYear: '2024-2025' } },
      update: {},
      create: {
        classId: matricClass.id,
        teacherId: teacher.id,
        isClassTeacher: true,
        academicYear: '2024-2025',
      },
    })

    // 6. Assign teacher as SubjectTeacher for Mathematics and Physics in Class 10-A
    const mathAss = await prisma.subjectTeacher.upsert({
      where: { subjectId_teacherId: { subjectId: mathSubject.id, teacherId: teacher.id } },
      update: {},
      create: {
        subjectId: mathSubject.id,
        teacherId: teacher.id,
      },
    })

    const phyAss = await prisma.subjectTeacher.upsert({
      where: { subjectId_teacherId: { subjectId: physicsSubject.id, teacherId: teacher.id } },
      update: {},
      create: {
        subjectId: physicsSubject.id,
        teacherId: teacher.id,
      },
    })

    // Also let's check if there are students in this class
    const studentsCount = await prisma.student.count({
      where: { classId: matricClass.id }
    })

    return NextResponse.json({
      success: true,
      message: 'Successfully seeded teacher assignments and subjects!',
      teacher: {
        id: teacher.id,
        name: `${teacher.firstName} ${teacher.lastName}`,
      },
      class: {
        id: matricClass.id,
        name: matricClass.name,
        section: matricClass.section,
        studentsCount,
      },
      subjects: [mathSubject.name, physicsSubject.name, englishSubject.name],
      classTeacherAssigned: true,
      subjectTeacherAssignedCount: 2
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
