/**
 * seed-earn-plans.ts — Seeds default Earn / Staking products.
 *
 * Run after the main coin seed (api-server seed) so coin IDs exist.
 *   pnpm --filter @workspace/scripts run seed:earn
 *
 * Safe to re-run — upserts by (coin_id, name).
 */
import { db, earnProductsTable, coinsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

interface PlanDef {
  coin:                     string;
  name:                     string;
  description:              string;
  type:                     string;
  durationDays:             number;
  apy:                      string;
  minAmount:                string;
  maxAmount:                string;
  totalCap:                 string;
  payoutInterval:           string;
  compounding:              boolean;
  earlyRedemption:          boolean;
  earlyRedemptionPenaltyPct:string;
  featured:                 boolean;
  displayOrder:             number;
}

const PLANS: PlanDef[] = [
  // ── USDT ─────────────────────────────────────────────────────────────────
  {
    coin: "USDT", name: "USDT Flexible Savings",
    description: "Earn daily interest on your USDT. Withdraw anytime — no lock-up period.",
    type: "flexible", durationDays: 0, apy: "5.00",
    minAmount: "10", maxAmount: "500000", totalCap: "10000000",
    payoutInterval: "daily", compounding: false,
    earlyRedemption: true, earlyRedemptionPenaltyPct: "0",
    featured: true, displayOrder: 1,
  },
  {
    coin: "USDT", name: "USDT 30-Day Fixed",
    description: "Lock USDT for 30 days and earn a higher fixed rate. Interest paid at maturity.",
    type: "fixed", durationDays: 30, apy: "8.00",
    minAmount: "100", maxAmount: "200000", totalCap: "5000000",
    payoutInterval: "maturity", compounding: false,
    earlyRedemption: false, earlyRedemptionPenaltyPct: "0",
    featured: true, displayOrder: 2,
  },
  {
    coin: "USDT", name: "USDT 90-Day Fixed",
    description: "Best rate for USDT. Lock for 90 days with daily compounding.",
    type: "fixed", durationDays: 90, apy: "12.00",
    minAmount: "500", maxAmount: "500000", totalCap: "10000000",
    payoutInterval: "daily", compounding: true,
    earlyRedemption: false, earlyRedemptionPenaltyPct: "0",
    featured: true, displayOrder: 3,
  },
  // ── BTC ──────────────────────────────────────────────────────────────────
  {
    coin: "BTC", name: "BTC Flexible Savings",
    description: "Earn passive BTC yield. No minimum lock-up. Ideal for long-term holders.",
    type: "flexible", durationDays: 0, apy: "2.50",
    minAmount: "0.001", maxAmount: "50", totalCap: "1000",
    payoutInterval: "daily", compounding: false,
    earlyRedemption: true, earlyRedemptionPenaltyPct: "0",
    featured: false, displayOrder: 10,
  },
  {
    coin: "BTC", name: "BTC 60-Day Fixed",
    description: "Higher Bitcoin yield for disciplined savers. Compounding daily.",
    type: "fixed", durationDays: 60, apy: "4.50",
    minAmount: "0.005", maxAmount: "100", totalCap: "2000",
    payoutInterval: "daily", compounding: true,
    earlyRedemption: false, earlyRedemptionPenaltyPct: "0",
    featured: false, displayOrder: 11,
  },
  // ── ETH ──────────────────────────────────────────────────────────────────
  {
    coin: "ETH", name: "ETH Flexible Savings",
    description: "Earn ETH rewards daily. Backed by Zebvix liquid staking pool.",
    type: "flexible", durationDays: 0, apy: "3.80",
    minAmount: "0.01", maxAmount: "1000", totalCap: "20000",
    payoutInterval: "daily", compounding: false,
    earlyRedemption: true, earlyRedemptionPenaltyPct: "0",
    featured: false, displayOrder: 20,
  },
  {
    coin: "ETH", name: "ETH 90-Day Staking",
    description: "Participate in Ethereum staking via Zebvix pool. Best ETH rate on platform.",
    type: "fixed", durationDays: 90, apy: "6.50",
    minAmount: "0.05", maxAmount: "2000", totalCap: "50000",
    payoutInterval: "daily", compounding: true,
    earlyRedemption: false, earlyRedemptionPenaltyPct: "0",
    featured: true, displayOrder: 21,
  },
  // ── BNB ──────────────────────────────────────────────────────────────────
  {
    coin: "BNB", name: "BNB Flexible Savings",
    description: "Earn daily on your BNB. Participate in Zebvix BNB liquidity pool.",
    type: "flexible", durationDays: 0, apy: "4.20",
    minAmount: "0.1", maxAmount: "500", totalCap: "10000",
    payoutInterval: "daily", compounding: false,
    earlyRedemption: true, earlyRedemptionPenaltyPct: "0",
    featured: false, displayOrder: 30,
  },
  // ── SOL ──────────────────────────────────────────────────────────────────
  {
    coin: "SOL", name: "SOL Staking",
    description: "Stake Solana and earn validator rewards distributed daily.",
    type: "flexible", durationDays: 0, apy: "7.00",
    minAmount: "1", maxAmount: "5000", totalCap: "100000",
    payoutInterval: "daily", compounding: true,
    earlyRedemption: true, earlyRedemptionPenaltyPct: "0",
    featured: true, displayOrder: 40,
  },
  // ── ZBX (Native Token) ────────────────────────────────────────────────────
  {
    coin: "ZBX", name: "ZBX Flexible Staking",
    description: "Stake ZBX tokens to earn platform revenue share + emissions. Unlock VIP benefits.",
    type: "flexible", durationDays: 0, apy: "18.00",
    minAmount: "100", maxAmount: "10000000", totalCap: "500000000",
    payoutInterval: "daily", compounding: false,
    earlyRedemption: true, earlyRedemptionPenaltyPct: "0",
    featured: true, displayOrder: 0,
  },
  {
    coin: "ZBX", name: "ZBX 90-Day Power Staking",
    description: "Maximum ZBX yield. Lock for 90 days with compounding and boosted trading fee rebates.",
    type: "fixed", durationDays: 90, apy: "28.00",
    minAmount: "1000", maxAmount: "100000000", totalCap: "1000000000",
    payoutInterval: "daily", compounding: true,
    earlyRedemption: false, earlyRedemptionPenaltyPct: "0",
    featured: true, displayOrder: 0,
  },
  // ── USDC ─────────────────────────────────────────────────────────────────
  {
    coin: "USDC", name: "USDC Flexible Savings",
    description: "USDC earns the same rate as USDT. Withdraw anytime.",
    type: "flexible", durationDays: 0, apy: "5.00",
    minAmount: "10", maxAmount: "500000", totalCap: "5000000",
    payoutInterval: "daily", compounding: false,
    earlyRedemption: true, earlyRedemptionPenaltyPct: "0",
    featured: false, displayOrder: 50,
  },
];

async function main() {
  console.log("💰 Earn Plans seed — starting…");

  const allCoins = await db.select({ id: coinsTable.id, symbol: coinsTable.symbol }).from(coinsTable);
  const bySymbol: Record<string, number> = {};
  for (const c of allCoins) bySymbol[c.symbol] = c.id;

  let created = 0, updated = 0, skipped = 0;

  for (const plan of PLANS) {
    const coinId = bySymbol[plan.coin];
    if (!coinId) {
      console.warn(`   ⚠  Coin ${plan.coin} not found — skipping "${plan.name}"`);
      skipped++;
      continue;
    }

    const existing = await db
      .select({ id: earnProductsTable.id })
      .from(earnProductsTable)
      .where(and(
        eq(earnProductsTable.coinId, coinId),
        eq(earnProductsTable.name, plan.name),
      ))
      .limit(1);

    const row: typeof earnProductsTable.$inferInsert = {
      coinId,
      name:                      plan.name,
      description:               plan.description,
      type:                      plan.type,
      durationDays:              plan.durationDays,
      apy:                       plan.apy,
      minAmount:                 plan.minAmount,
      maxAmount:                 plan.maxAmount,
      totalCap:                  plan.totalCap,
      currentSubscribed:         "0",
      payoutInterval:            plan.payoutInterval,
      compounding:               plan.compounding,
      earlyRedemption:           plan.earlyRedemption,
      earlyRedemptionPenaltyPct: plan.earlyRedemptionPenaltyPct,
      featured:                  plan.featured,
      displayOrder:              plan.displayOrder,
      status:                    "active",
    };

    if (existing.length > 0) {
      const { coinId: _c, name: _n, currentSubscribed: _s, ...updateFields } = row;
      await db
        .update(earnProductsTable)
        .set(updateFields)
        .where(eq(earnProductsTable.id, existing[0].id));
      console.log(`   ↻  Updated : ${plan.coin} — ${plan.name} (${plan.apy}% APY)`);
      updated++;
    } else {
      await db.insert(earnProductsTable).values(row);
      console.log(`   ✅ Created : ${plan.coin} — ${plan.name} (${plan.apy}% APY)`);
      created++;
    }
  }

  console.log(`\n✅ Earn seed complete — created: ${created}  updated: ${updated}  skipped: ${skipped}`);
  process.exit(0);
}

main().catch(err => {
  console.error("❌ Earn seed failed:", err.message ?? err);
  process.exit(1);
});
