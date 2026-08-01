---
type: "debugging"
date: "2026-07-30T23:25:05.379079+00:00"
question: "Why did teacher Grade Entry crash after selecting an assigned class section, and how was the live teacher class workflow repaired?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["app/api/teacher-portal/sections/route.ts", "app/api/teacher-portal/my-assignments/route.ts", "app/api/teacher-portal/my-students/route.ts", "app/dashboard/teacher/students/page.tsx", "app/dashboard/teacher/grade-entry/page.tsx"]
---

# Q: Why did teacher Grade Entry crash after selecting an assigned class section, and how was the live teacher class workflow repaired?

## Answer

The sections and assignment APIs excluded authorized migrated sections solely because ClassSection.isActive was false even though active-year enrollments remained. My Students also sent legacy classId values and displayed legacy-only class fields. The API visibility rule now remains teacher-scoped while allowing active-year enrollments, My Students uses authorized classSectionId filtering and enrollment-backed display data, and the Grade Entry page keeps offerings undefined during query loading so its synchronization effect cannot loop on a newly allocated empty array. Live revision 4556b04 verified two sections, 16 students, per-class rosters of 5 and 11, functional Grade Entry selection, and no console errors.

## Outcome

- Signal: useful

## Source Nodes

- app/api/teacher-portal/sections/route.ts
- app/api/teacher-portal/my-assignments/route.ts
- app/api/teacher-portal/my-students/route.ts
- app/dashboard/teacher/students/page.tsx
- app/dashboard/teacher/grade-entry/page.tsx