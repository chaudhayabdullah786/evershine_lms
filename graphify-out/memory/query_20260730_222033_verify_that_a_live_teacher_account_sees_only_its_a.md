---
type: "verification"
date: "2026-07-30T22:20:33.317355+00:00"
question: "Verify that a live teacher account sees only its assigned class sections across dashboard, tasks, grade entry, and students."
contributor: "graphify"
outcome: "useful"
source_nodes: ["getTeacherClassSectionIds", "app/api/teacher-portal/sections/route.ts", "app/api/teacher-portal/classes/route.ts", "app/api/teacher-portal/my-students/route.ts", "app/dashboard/teacher/students/page.tsx"]
---

# Q: Verify that a live teacher account sees only its assigned class sections across dashboard, tasks, grade entry, and students.

## Answer

Live QA found two assigned legacy classes with section IDs and 5/11 enrolled students. Tasks loads the assignments. Grade Entry and dashboard omit them because teacher section routes filter ClassSection.isActive=true while both mapped sections are inactive. My Students loads all 16 but its class filter sends the legacy classId; using classSectionId returns the correct 5/11 counts.

## Outcome

- Signal: useful

## Source Nodes

- getTeacherClassSectionIds
- app/api/teacher-portal/sections/route.ts
- app/api/teacher-portal/classes/route.ts
- app/api/teacher-portal/my-students/route.ts
- app/dashboard/teacher/students/page.tsx