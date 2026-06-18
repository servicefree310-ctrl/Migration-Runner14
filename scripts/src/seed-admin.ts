/**
 * seed-admin.ts — Creates the default superadmin user + bot operator wallets.
 *
 * Run FIRST before seed-bots.ts.
 *   pnpm --filter @workspace/scripts run seed:admin
 *
 * Safe to re-run — checks for existing admin before inserting.
 */
import { db, usersTable, walletsTable, coinsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";

function uid8() {
  return randomBytes(4).toString("hex").toUpperCase();
}

async function main() {
  console.log("🌱 Zebvix Admin Seed — starting…");

  // ── 1. Check for existing admin ────────────────────────────────────────
  const existing = await db.select({ id: usersTable.id, role: usersTable.role })
    .from(usersTable)
    .where(sql`${usersTable.role} IN ('admin','superadmin')`)
    .limit(1);

  let adminId: number;

  if (existing.length > 0) {
    adminId = existing[0].id;
    console.log(`   Admin user already exists: id=${adminId} role=${existing[0].role}`);
  } else {
    // referralCode + uid must be unique — generate random values
    const refCode  = "ADMIN" + uid8();
    const uidCode  = "ADM" + uid8();
    const [admin] = await db.insert(usersTable).values({
      email:          "admin@zebvix.com",
      passwordHash:   await bcrypt.hash("Admin1234!", 10),
      name:           "Zebvix Admin",
      role:           "superadmin",
      kycLevel:       3,
      referralCode:   refCode,
      uid:            uidCode,
      status:         "active",
      emailVerified:  true,
    }).returning({ id: usersTable.id });
    adminId = admin.id;
    console.log(`   ✅ Created superadmin: id=${adminId} email=admin@zebvix.com`);
  }

  // ── 2. Create wallet rows for every active coin ─────────────────────────
  const coins = await db.select({ id: coinsTable.id, symbol: coinsTable.symbol })
    .from(coinsTable)
    .where(eq(coinsTable.status, "active"));

  console.log(`   Ensuring 'spot' wallet rows for ${coins.length} coins…`);
  let created = 0;
  for (const coin of coins) {
    const w = await db.select({ id: walletsTable.id }).from(walletsTable)
      .where(sql`${walletsTable.userId} = ${adminId} AND ${walletsTable.coinId} = ${coin.id} AND ${walletsTable.walletType} = 'spot'`)
      .limit(1);
    if (!w.length) {
      await db.insert(walletsTable).values({
        userId:     adminId,
        coinId:     coin.id,
        walletType: "spot",
        balance:    "999999999",  // unlimited supply — bot places orders on behalf of platform
        locked:     "0",
      });
      created++;
    }
  }
  console.log(`   ✅ Wallets: ${created} created, ${coins.length - created} already existed`);
  console.log(`\n✅ Admin seed complete. Bot user id: ${adminId}`);
  process.exit(0);
}

main().catch(err => {
  console.error("❌ Admin seed failed:", err.message ?? err);
  process.exit(1);
});
