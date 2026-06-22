# DATABASE SCHEMA — Evershine Academy LMS

**Last Updated**: May 15, 2026
**ORM**: Prisma
**Database**: PostgreSQL (Neon)

---

## 1. CORE ENTITIES

### User (Authentication Base)
```prisma
model User {
  id                String    @id @default(cuid())
  email             String    @unique
  passwordHash      String
  role              Role      @default(STUDENT)
  isActive          Boolean   @default(true)
  lastLogin         DateTime?
  emailVerified     Boolean   @default(false)
  emailVerifiedAt   DateTime?
  resetToken        String?   @unique
  resetTokenExpiry  DateTime?
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt
  
  // Relationships
  student           Student?
  teacher           Teacher?
  admin             Admin?
  parent            Parent?
  accountant        Accountant?
  guardian          Guardian?
  auditLogs         AuditLog[]
  
  @@index([email])
  @@index([role])
}

enum Role {
  SUPER_ADMIN
  ADMIN
  TEACHER
  STUDENT
  PARENT
  ACCOUNTANT
  GUARDIAN
}
```

### Campus
```prisma
model Campus {
  id              String   @id @default(cuid())
  name            String   @unique // "Boys Campus", "Girls Campus"
  code            String   @unique // "BC", "GC"
  address         String
  phone           String
  email           String
  principalName   String
  isActive        Boolean  @default(true)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  
  // Relationships
  batches         Batch[]
  students        Student[]
  teachers        Teacher[]
  classes         Class[]
  
  @@index([code])
  @@index([isActive])
}
```

### Batch (Kids Campus → Intermediate)
```prisma
model Batch {
  id              String   @id @default(cuid())
  name            String   // "Kids Campus", "Junior", "Matriculation", "Intermediate"
  code            String   // "KC", "JR", "MAT", "INT"
  campusId        String
  academicLevel   String   // "PreSchool", "Elementary", "Secondary", "HigherSecondary"
  description     String?
  isActive        Boolean  @default(true)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  
  // Relationships
  campus          Campus   @relation(fields: [campusId], references: [id])
  classes         Class[]
  students        Student[]
  teachers        Teacher[]
  houses          House[]
  
  @@unique([name, campusId])
  @@index([campusId])
  @@index([isActive])
}
```

### House (Sports Gala System)
```prisma
model House {
  id              String   @id @default(cuid())
  name            String   // "Shaheen", "Parvaaz", "Junoon", "Udraan", "Pehchaan"
  color           String   // Hex color code
  batchId         String
  motto           String?
  points          Int      @default(0)
  captainId       String?
  viceCaptainId   String?
  isActive        Boolean  @default(true)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  
  // Relationships
  batch           Batch    @relation(fields: [batchId], references: [id])
  captain         Student? @relation("HouseCaptain", fields: [captainId], references: [id])
  viceCaptain     Student? @relation("HouseViceCaptain", fields: [viceCaptainId], references: [id])
  students        Student[]
  events          SportEvent[]
  
  @@unique([name, batchId])
  @@index([batchId])
}
```

### Student
```prisma
model Student {
  id                    String    @id @default(cuid())
  userId                String    @unique
  registrationNumber    String    @unique
  admissionNumber       String?   @unique
  firstName             String
  lastName              String
  fatherName            String
  cnicBForm             String    @unique
  dateOfBirth           DateTime
  gender                Gender
  bloodGroup            String?
  religion              String?
  nationality           String    @default("Pakistani")
  address               String
  city                  String
  province              String
  postalCode            String?
  
  // Contact Information
  phoneNumber           String
  emergencyContact      String
  email                 String?
  
  // Academic Information
  campusId              String
  batchId               String
  classId               String?
  section               String?
  rollNumber            String?
  houseId               String?
  admissionDate         DateTime  @default(now())
  academicYear          String    // "2024-2025"
  
  // Fee Information
  feeStatus             FeeStatus @default(PENDING)
  totalFeeAmount        Decimal   @db.Decimal(10, 2)
  paidAmount            Decimal   @default(0) @db.Decimal(10, 2)
  dueAmount             Decimal   @default(0) @db.Decimal(10, 2)
  
  // Documents & Images
  profilePicture        String?   // Cloudinary URL
  idCardQRCode          String?   // QR code data
  idCardIssueDate       DateTime?
  idCardExpiryDate      DateTime?
  
  // Status
  enrollmentStatus      EnrollmentStatus @default(ACTIVE)
  isActive              Boolean   @default(true)
  
  // Timestamps
  createdAt             DateTime  @default(now())
  updatedAt             DateTime  @updatedAt
  
  // Relationships
  user                  User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  campus                Campus    @relation(fields: [campusId], references: [id])
  batch                 Batch     @relation(fields: [batchId], references: [id])
  class                 Class?    @relation(fields: [classId], references: [id])
  house                 House?    @relation(fields: [houseId], references: [id])
  
  // Additional Relationships
  parents               Parent[]
  guardians             Guardian[]
  attendance            Attendance[]
  feePayments           FeePayment[]
  feeInvoices           FeeInvoice[]
  results               Result[]
  achievements          Achievement[]
  certificates          Certificate[]
  sportEvents           SportEventParticipant[]
  houseCaptainOf        House[]   @relation("HouseCaptain")
  houseViceCaptainOf    House[]   @relation("HouseViceCaptain")
  
  @@unique([registrationNumber])
  @@index([userId])
  @@index([campusId])
  @@index([batchId])
  @@index([classId])
  @@index([enrollmentStatus])
  @@index([feeStatus])
}
```

### Teacher
```prisma
model Teacher {
  id                    String   @id @default(cuid())
  userId                String   @unique
  employeeId            String   @unique
  firstName             String
  lastName              String
  cnic                  String   @unique
  dateOfBirth           DateTime
  gender                Gender
  qualification         String
  specialization        String?
  experienceYears       Int      @default(0)
  joiningDate           DateTime
  
  // Contact Information
  phoneNumber           String
  email                 String   @unique
  address               String
  city                  String
  emergencyContact      String
  
  // Assignment
  campusId              String
  batchId               String?
  designation           String   // "Teacher", "Senior Teacher", "Head Teacher"
  
  // Financial
  monthlySalary         Decimal? @db.Decimal(10, 2)
  
  // Documents
  profilePicture        String?  // Cloudinary URL
  
  // Status
  isActive              Boolean  @default(true)
  
  // Timestamps
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt
  
  // Relationships
  user                  User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  campus                Campus   @relation(fields: [campusId], references: [id])
  batch                 Batch?   @relation(fields: [batchId], references: [id])
  
  // Additional Relationships
  classes               ClassTeacher[]
  subjects              SubjectTeacher[]
  attendance            TeacherAttendance[]
  timetable             Timetable[]
  
  @@index([userId])
  @@index([campusId])
  @@index([employeeId])
}
```

### Audit Log
```prisma
model AuditLog {
  id              String   @id @default(cuid())
  userId          String
  action          String   // "CREATE", "UPDATE", "DELETE", "LOGIN", "LOGOUT"
  entityType      String   // "Student", "Teacher", "Payment", etc.
  entityId        String?
  changes         Json?    // Before/after values
  ipAddress       String?
  userAgent       String?
  timestamp       DateTime @default(now())
  
  // Relationships
  user            User     @relation(fields: [userId], references: [id])
  
  @@index([userId])
  @@index([entityType])
  @@index([timestamp])
  @@index([action])
}
```

---

## 2. RELATIONSHIPS SUMMARY

- **User**: Base authentication model for all roles.
- **Campus → Batch**: One-to-many relationship (Multi-campus support).
- **Batch → Student**: Students are grouped by batch.
- **Student → FeeInvoice/Payment**: Financial tracking per student.
- **AuditLog**: Captures all mutations tied to a `User`.

---

## 3. INDEXING STRATEGY

- **Primary Keys**: Using CUIDs for distributed scalability.
- **Foreign Keys**: Indexed for performance in relational queries.
- **Searchable Fields**: Email, RegistrationNumber, and EmployeeId are indexed.
- **Temporal Fields**: Timestamp fields are indexed for audit logging performance.
