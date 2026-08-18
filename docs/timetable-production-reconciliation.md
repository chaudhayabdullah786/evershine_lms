# Timetable production schema reconciliation

The timetable engine stores subject periods and non-teaching blocks in
`TimetableSlot`. The automated template workflow additionally needs
`slotType`, `templateId`, and `TimetableTemplate`.

Production uses MySQL, while this repository contains historical PostgreSQL
migration metadata. Do not run `prisma migrate deploy` for this one-time repair.
After taking a verified database backup, run the additive reconciliation script
from the deployed source directory:

```sh
export PATH="/opt/alt/alt-nodejs22/root/usr/bin:$PATH"
npm ci --ignore-scripts
npx prisma generate --schema prisma/schema.prisma
npm run db:reconcile:timetable
```

The script only adds missing timetable columns, indexes, constraints, or the
template table. It does not drop tables, delete rows, or rewrite existing
timetable entries. If a required base academic table is missing, it stops
without changing the database so the schema backup can be reviewed first.

After reconciliation, restart the application and verify the following flow:

1. Select an active academic year and class section.
2. Select a subject offering and teacher, then add a slot.
3. Add a break or prayer period block without a teacher.
4. Edit and delete a draft slot.
5. Publish the section timetable and confirm the status changes to Published.
6. Generate a weekly template and confirm the generated slots appear in the
   selected section.

If the schema is still unavailable, timetable endpoints return a controlled
`SCHEMA_OUT_OF_DATE` response instead of an opaque HTTP 500.
