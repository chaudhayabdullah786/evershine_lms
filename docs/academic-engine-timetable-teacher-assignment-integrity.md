# Academic Engine timetable and teacher-assignment integrity

## Scope

The Academic Engine is the source of truth for current-year sections,
teacher scope, and published timetables. Legacy `ClassTeacher`, `SubjectTeacher`,
and `Timetable` rows remain available for migration and historical reporting,
but they must not grant current portal access or populate current timetable
views by themselves.

## Bug 1 — published teacher conflicts were not visible

### Root cause

The Academic Engine screen loaded slots by `academicYearId` and
`classSectionId` only. It did not query the selected teacher's existing slots
when the assignment form opened. Conflict detection ran only after submit in
`validateTimetableSlot`, so the server correctly rejected a duplicate while
the form gave the administrator no context.

### Affected components

- `app/dashboard/academic/page.tsx`
- `app/api/timetable/slots/route.ts`
- `lib/academic/engine.ts`
- `lib/academic/timetable-errors.ts`

### Fix

The form now requests:

```text
GET /api/timetable/slots?academicYearId=<active-year>&teacherId=<teacher>&published=true
```

The API applies the teacher/campus authorization checks and returns the
teacher's published slots across all assigned sections. The form renders the
day, time, section, and subject before submission. The server-side validator
remains authoritative and now includes the conflicting slot summary in the
validation details, so the client can explain exactly which slot conflicts.
When editing an existing slot, the form may pass `excludeSlotId` so the slot
does not conflict with itself.

Publishing also validates every slot in the selected year/section transaction
before setting `isPublished=true`; invalid schedules are not partially
published.

## Bug 2 — published timetable data was missing or false in portals

### Root cause

Teacher timetable reads combined current Academic Engine slots with legacy
`Timetable` rows and derived the academic year from the calendar or newest
available year. Because legacy rows have no reliable current-year ownership,
the merge returned stale or unrelated records. The shared `/api/timetable` GET
endpoint had the same problem: it read `Timetable` directly, including rows
that were not published by the Academic Engine.

### Affected components

- `app/api/teachers/[id]/timetable/route.ts`
- `app/api/timetable/route.ts`
- `app/api/student-portal/enrollment/route.ts`
- `app/api/guardian-portal/children/[studentId]/academic/route.ts`

### Fix

Teacher and shared timetable reads now:

1. Resolve the explicit academic year, or the single active academic year.
2. Restrict records to `TimetableSlot.academicYearId` for that year.
3. Require `isPublished = true`.
4. Require canonical active teacher-section assignments when the request is
   teacher-scoped.
5. Restrict student requests to active `StudentEnrollment` rows.
6. Apply campus, teacher, day, and shift authorization on the server.

The portal response keeps compatibility display fields such as `subjectName`
and `shift`, but every row is marked as `source: "engine"`. No legacy timetable
row is merged into current teacher or student views.

## Bug 3 — teachers saw sections that were not assigned to them

### Root cause

Teacher scope was inferred from a union of historical and indirect records:
subject offerings, timetable slots, legacy class-teacher rows, tasks, results,
and fuzzy legacy class matching. A historical offering or an old task could
therefore make a section appear assigned even when the staff-directory
assignment was absent or revoked.

### Affected components

- `app/api/teachers/[id]/classes/route.ts`
- `app/api/teachers/profile/route.ts`
- `lib/academic/teacher-scope.ts`
- `app/api/teacher-portal/classes/route.ts`
- section offerings/students, tasks, announcements, and results routes

### Fix and data model

The migration adds `TeacherSectionAssignment`:

```text
(teacherId, classSectionId, academicYearId) UNIQUE
status: ACTIVE | REVOKED
isClassTeacher: boolean
```

It backfills active-year assignments from subject offerings and safely
matching legacy homeroom assignments. The profile assignment API upserts this
row in the same workflow and revokes it on removal. Published timetable
history is retained, while unpublished slots owned by a revoked assignment are
cleared.

Assigning a section never assigns an arbitrary subject offering. Subject
ownership remains an explicit, separate operation, so a class teacher can
manage a section without silently taking the first available subject.

All teacher portal section lists now query only:

```text
TeacherSectionAssignment
WHERE teacherId = current teacher
  AND academicYearId = active year
  AND status = ACTIVE
  AND classSection.isActive = true
```

Subject offerings are then filtered by the same year and section. Class
teachers may see all offerings in their assigned section; subject teachers
see only offerings owned by them. Student rosters require an active
`StudentEnrollment` in that same year and section.

Task creation and announcements use the same canonical assignment guard;
legacy class-teacher rows, timetable rows, and batch-wide fallbacks no longer
authorize a teacher or notify unrelated students.

## Migration and operational notes

The additive migration is:

```text
prisma/migrations/20260820090000_add_teacher_section_assignments/migration.sql
```

It creates indexes for teacher/year/status and section/year/status, adds
composite indexes for published teacher/section timetable reads, preserves
legacy rows, and performs no deletes. On production, apply it only after a
database backup and after regenerating Prisma Client from the deployed source.

## Acceptance checks

- Selecting a teacher in Academic Engine shows their already-published slots
  before save.
- A duplicate teacher/time submission is rejected with the conflicting
  section, subject, day, and time.
- Publishing a timetable makes the same engine slots visible to the assigned
  teacher and enrolled students only.
- Revoking a teacher-section assignment removes that section from the teacher
  profile, dashboard, task, announcement, results, roster, and timetable
  scopes.
- Historical legacy rows do not appear in current-year portal lists.
- Full Vitest suite passes: 76 files, 215 tests.
