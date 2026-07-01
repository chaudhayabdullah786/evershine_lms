# Hostinger Finance Schema Sync

Use this runbook after this PR is deployed if Expense Ledger still shows that payment metadata is unavailable, or if P&L / reserve fund tables are missing in production.

## 1. Open SSH and enter the app directory

```bash
cd /home/u668799501/domains/evershineacadmey.com/nodejs
export PATH=/opt/alt/alt-nodejs20/root/usr/bin:$PATH
node -v
npx prisma -v
```

Expected Node version is 20.x and Prisma is 5.22.x for this project.

## 2. Reinstall the matching Prisma packages if generate fails

```bash
npm install prisma@5.22.0 @prisma/client@5.22.0
npx prisma generate
```

## 3. Verify the finance columns and tables

```bash
printf '%s\n' 'SHOW COLUMNS FROM `Expense` LIKE "paymentSource";' | npx prisma db execute --stdin
printf '%s\n' 'SHOW COLUMNS FROM `Expense` LIKE "paymentReference";' | npx prisma db execute --stdin
printf '%s\n' 'SHOW TABLES LIKE "ProfitLossStatement";' | npx prisma db execute --stdin
printf '%s\n' 'SHOW TABLES LIKE "ReserveFundLedger";' | npx prisma db execute --stdin
```

If both Expense columns exist, the Expense Ledger will store payment method and payment reference. If they do not exist, the code still records core expenses, but payment metadata is intentionally hidden.

## 4. Add only the missing optional Expense columns

Run these only when the checks above show the column is missing. They are additive and safe for existing data.

```bash
printf '%s\n' 'ALTER TABLE `Expense` ADD COLUMN `paymentSource` VARCHAR(191) NULL;' | npx prisma db execute --stdin
printf '%s\n' 'ALTER TABLE `Expense` ADD COLUMN `paymentReference` VARCHAR(191) NULL;' | npx prisma db execute --stdin
printf '%s\n' 'CREATE INDEX `Expense_paymentSource_idx` ON `Expense`(`paymentSource`);' | npx prisma db execute --stdin
```

If an index already exists, MariaDB/MySQL will report a duplicate index error. That is not a data-loss issue; continue after confirming the column exists.

## 5. Preferred full schema sync after backup

Because this production database is MySQL/MariaDB and the old Prisma migration folder contains PostgreSQL-era migration SQL, do not run `npx prisma migrate deploy` blindly. After taking a Hostinger database backup, use Prisma db push for additive schema alignment:

```bash
npx prisma db push --skip-generate
npx prisma generate
```

## 6. Functional smoke checks

After deployment and schema sync:

1. Open `/dashboard/accountant/fees`, search a student, issue a challan, and export defaulters.
2. Open `/dashboard/accountant/expenses`, record an expense with payment method/reference, edit it, export Excel, then soft-delete a test entry if needed.
3. Open `/dashboard/accountant/reports`, generate a P&L snapshot for a known period, export P&L, and confirm reserve contribution appears.
4. Open `/dashboard` as SuperAdmin and confirm the Reserve Fund card shows the current cumulative balance.
5. Open `/dashboard/admin/reserve-fund` and confirm the append-only ledger entries are visible.
