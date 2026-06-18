/**
 * seed-ai-accounts.ts — Creates 10 realistic AI trader user accounts.
 *
 * Each account gets:
 *   • A unique user row (role = "user", kyc = 1, emailVerified = true)
 *   • A spot USDT wallet with a seeded balance
 *   • An active AI trading subscription on one of the 4 plans
 *   • Several days of earnings history (so leaderboards/dashboards look live)
 *
 * Safe to re-run — skips any email that already exists.
 *
 * Run:
 *   pnpm --filter @workspace/scripts run seed:ai-accounts
 */
import {
  db, usersTable, walletsTable, coinsTable,
  aiTradingPlansTable, aiTradingSubscriptionsTable, aiTradingEarningsTable,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";

// ── Helpers ───────────────────────────────────────────────────────────────────
function uid8() { return randomBytes(4).toString("hex").toUpperCase(); }
function uid12() { return randomBytes(6).toString("hex").toUpperCase(); }
function daysAgo(n: number) { const d = new Date(); d.setDate(d.getDate() - n); return d; }

// ── 10 AI trader profiles ─────────────────────────────────────────────────────
// planKey: 1=Starter, 2=Growth, 3=Pro, 4=Elite
const AI_ACCOUNTS: {
  name: string;
  email: string;
  planId: number;
  investedUsdt: number;
  walletUsdt: number;
  daysActive: number;
}[] = [
  { name: "Arjun Mehta",    email: "arjun.mehta@aitrader.bot",    planId: 1, investedUsdt: 500,    walletUsdt: 1200,   daysActive: 28 },
  { name: "Priya Sharma",   email: "priya.sharma@aitrader.bot",   planId: 2, investedUsdt: 2500,   walletUsdt: 5800,   daysActive: 55 },
  { name: "Ravi Kumar",     email: "ravi.kumar@aitrader.bot",     planId: 2, investedUsdt: 4000,   walletUsdt: 9200,   daysActive: 47 },
  { name: "Sneha Patel",    email: "sneha.patel@aitrader.bot",    planId: 3, investedUsdt: 8000,   walletUsdt: 18500,  daysActive: 82 },
  { name: "Vikram Singh",   email: "vikram.singh@aitrader.bot",   planId: 3, investedUsdt: 15000,  walletUsdt: 34000,  daysActive: 78 },
  { name: "Anita Reddy",    email: "anita.reddy@aitrader.bot",    planId: 1, investedUsdt: 250,    walletUsdt: 620,    daysActive: 22 },
  { name: "Karan Verma",    email: "karan.verma@aitrader.bot",    planId: 4, investedUsdt: 25000,  walletUsdt: 62000,  daysActive: 165 },
  { name: "Deepa Nair",     email: "deepa.nair@aitrader.bot",     planId: 4, investedUsdt: 50000,  walletUsdt: 128000, daysActive: 160 },
  { name: "Rohit Joshi",    email: "rohit.joshi@aitrader.bot",    planId: 2, investedUsdt: 1200,   walletUsdt: 2800,   daysActive: 38 },
  { name: "Meera Pillai",   email: "meera.pillai@aitrader.bot",   planId: 3, investedUsdt: 6000,   walletUsdt: 14000,  daysActive: 70 },
];

// Daily return rates per plan (must match seeded plans)
const DAILY_RATE: Record<number, number> = {
  1: 0.005,   // Starter  0.5 %/day
  2: 0.0085,  // Growth   0.85%/day
  3: 0.012,   // Pro      1.2 %/day
  4: 0.018,   // Elite    1.8 %/day
};

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("🤖 AI Accounts Seed — starting (10 accounts)…\n");

  // Verify plans exist
  const plans = await db.select({ id: aiTradingPlansTable.id }).from(aiTradingPlansTable);
  if (plans.length === 0) {
    console.error("❌ No AI trading plans found. Run seed:ai-plans first.");
    process.exit(1);
  }

  // Get USDT coin ID
  const [usdtCoin] = await db
    .select({ id: coinsTable.id })
    .from(coinsTable)
    .where(sql`${coinsTable.symbol} = 'USDT' AND ${coinsTable.status} = 'active'`)
    .limit(1);
  if (!usdtCoin) {
    console.error("❌ USDT coin not found. Run coin seed first.");
    process.exit(1);
  }

  const DEFAULT_PW = await bcrypt.hash("AiTrader2025!", 10);

  let created = 0, skipped = 0;

  for (const acct of AI_ACCOUNTS) {
    // Check if already exists
    const existing = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, acct.email))
      .limit(1);

    if (existing.length > 0) {
      console.log(`   ↷  Skipping  ${acct.email} (already exists)`);
      skipped++;
      continue;
    }

    // 1. Create user
    const refCode = "AI" + uid8();
    const uidCode = "AIBOT" + uid12();
    const [user] = await db.insert(usersTable).values({
      email:         acct.email,
      passwordHash:  DEFAULT_PW,
      name:          acct.name,
      role:          "user",
      kycLevel:      1,
      referralCode:  refCode,
      uid:           uidCode,
      status:        "active",
      emailVerified: true,
    }).returning({ id: usersTable.id });

    // 2. Create spot USDT wallet
    await db.insert(walletsTable).values({
      userId:     user.id,
      coinId:     usdtCoin.id,
      walletType: "spot",
      balance:    acct.walletUsdt.toFixed(8),
      locked:     "0",
    });

    // 3. Subscribe to AI plan
    const startedAt  = daysAgo(acct.daysActive);
    const planConfig = { 1: 30, 2: 60, 3: 90, 4: 180 }[acct.planId]!;
    const expiresAt  = new Date(startedAt.getTime() + planConfig * 86_400_000);
    const rate       = DAILY_RATE[acct.planId]!;
    const totalEarned = +(acct.investedUsdt * rate * acct.daysActive).toFixed(8);
    const planName   = { 1: "Starter", 2: "Growth", 3: "Pro", 4: "Elite" }[acct.planId]!;

    const [sub] = await db.insert(aiTradingSubscriptionsTable).values({
      userId:         user.id,
      planId:         acct.planId,
      investedAmount: acct.investedUsdt.toFixed(8),
      fundingCoinId:  usdtCoin.id,
      fundingAmount:  acct.investedUsdt.toFixed(8),
      startedAt,
      expiresAt,
      status:         "active",
      totalEarned:    totalEarned.toFixed(8),
      lastCreditedAt: daysAgo(0),
    }).returning({ id: aiTradingSubscriptionsTable.id });

    // 4. Insert daily earnings rows (every other day to keep volume moderate)
    const earningsRows: (typeof aiTradingEarningsTable.$inferInsert)[] = [];
    for (let day = acct.daysActive; day >= 1; day -= 1) {
      const dailyEarning = +(acct.investedUsdt * rate).toFixed(8);
      earningsRows.push({
        userId:         user.id,
        subscriptionId: sub.id,
        planName,
        amountUsdt:     dailyEarning.toFixed(8),
        creditedAt:     daysAgo(day),
      });
    }
    await db.insert(aiTradingEarningsTable).values(earningsRows);

    console.log(`   ✅ Created  ${acct.name.padEnd(16)} | plan=${planName.padEnd(7)} | invested=$${acct.investedUsdt.toLocaleString().padStart(8)} | earned=$${totalEarned.toFixed(2).padStart(10)} | ${acct.daysActive} days`);
    created++;
  }

  console.log(`\n✅ AI Accounts seed complete — created: ${created}  skipped: ${skipped}`);
  console.log("   Default password for all accounts: AiTrader2025!");
  process.exit(0);
}

main().catch(err => {
  console.error("❌ AI accounts seed failed:", err.message ?? err);
  process.exit(1);
});
