// scripts/backup-and-delete-pl-snapshots.js
// Usage (dry-run): node ./scripts/backup-and-delete-pl-snapshots.js
// To execute deletion (IRREVERSIBLE): CONFIRM_DELETE=1 node ./scripts/backup-and-delete-pl-snapshots.js

const fs = require('fs')
const path = require('path')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function main() {
  console.log('Fetching all Profit & Loss snapshots...')
  const statements = await prisma.profitLossStatement.findMany({ include: { reserveEntry: true } })

  if (!statements || statements.length === 0) {
    console.log('No Profit & Loss snapshots found. Nothing to do.')
    process.exit(0)
  }

  const backupDir = path.resolve(process.cwd(), 'tmp')
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true })

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = path.join(backupDir, `pl-snapshots-backup-${timestamp}.json`)

  fs.writeFileSync(backupPath, JSON.stringify(statements, null, 2))
  console.log(`Backup written to ${backupPath}`)

  console.log(`Found ${statements.length} snapshots. Summary:`)
  let totalReserve = 0
  statements.forEach((s, i) => {
    const reserve = Number(s.reserveEntry?.contributionAmount ?? 0)
    totalReserve += reserve
    console.log(`${i + 1}. id=${s.id} period="${s.periodLabel}" campusId=${s.campusId ?? 'All'} reserve=${reserve.toFixed(2)}`)
  })
  console.log(`Total reserve contribution across statements: ${totalReserve.toFixed(2)}`)

  if (process.env.CONFIRM_DELETE !== '1') {
    console.log('\nDRY RUN: no deletions performed. To delete these snapshots, re-run with:\n')
    console.log('  CONFIRM_DELETE=1 node ./scripts/backup-and-delete-pl-snapshots.js\n')
    await prisma.$disconnect()
    process.exit(0)
  }

  console.log('\nCONFIRM_DELETE=1 detected. Proceeding to delete snapshots (this is irreversible).')

  for (const s of statements) {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.reserveFundLedger.deleteMany({ where: { profitLossId: s.id } })
        await tx.profitLossStatement.delete({ where: { id: s.id } })
      })
      console.log(`Deleted snapshot id=${s.id}`)
    } catch (err) {
      console.error(`Failed to delete snapshot id=${s.id}:`, err)
    }
  }

  console.log('Deletion complete. Recommend running a quick check in the app and exporting again.')
  await prisma.$disconnect()
}

main().catch(async (err) => {
  console.error(err)
  try { await prisma.$disconnect() } catch (e) {}
  process.exit(1)
})
