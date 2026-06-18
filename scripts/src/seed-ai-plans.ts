/**
 * seed-ai-plans.ts — Seeds the default AI Trading Plans.
 *
 * Run after seed-admin.ts (coins must exist first if you add coin-linked plans).
 *   pnpm --filter @workspace/scripts run seed:ai-plans
 *
 * Safe to re-run — uses upsert by name.
 *
 * Engine cap: MAX_DAILY_PCT = 1.3%  (ai-credit-engine.ts)
 * Admin can set higher dailyReturnPercent but users will be capped at 1.3%.
 */
import { db, aiTradingPlansTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const PLANS: typeof aiTradingPlansTable.$inferInsert[] = [
  {
    name:                "Starter",
    description:         "Entry-level AI strategy. Conservative algo trades BTC/ETH spot — ideal for first-time investors. Low drawdown, steady compounding.",
    dailyReturnPercent:  "0.50",
    minInvestment:       "100",
    maxInvestment:       "5000",
    durationDays:        30,
    riskLevel:           "low",
    isActive:            true,
  },
  {
    name:                "Growth",
    description:         "Balanced multi-asset strategy. Trades top-10 pairs with momentum filters and position sizing. Suitable for medium-term investors.",
    dailyReturnPercent:  "0.85",
    minInvestment:       "500",
    maxInvestment:       "25000",
    durationDays:        60,
    riskLevel:           "medium",
    isActive:            true,
  },
  {
    name:                "Pro",
    description:         "High-frequency algo strategy. Trades 30+ pairs including mid-caps with dynamic rebalancing and trend-following signals.",
    dailyReturnPercent:  "1.20",
    minInvestment:       "2000",
    maxInvestment:       "100000",
    durationDays:        90,
    riskLevel:           "high",
    isActive:            true,
  },
  {
    name:                "Elite",
    description:         "Institutional-grade quant strategy. Cross-market arbitrage, funding-rate capture, and options hedging. For experienced investors only.",
    dailyReturnPercent:  "1.80",
    minInvestment:       "5000",
    maxInvestment:       "500000",
    durationDays:        180,
    riskLevel:           "ultra",
    isActive:            true,
  },
];

async function main() {
  console.log("🤖 AI Trading Plans seed — starting…");

  let created = 0, updated = 0;

  for (const plan of PLANS) {
    const existing = await db
      .select({ id: aiTradingPlansTable.id })
      .from(aiTradingPlansTable)
      .where(eq(aiTradingPlansTable.name, plan.name!))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(aiTradingPlansTable)
        .set({
          description:        plan.description,
          dailyReturnPercent: plan.dailyReturnPercent,
          minInvestment:      plan.minInvestment,
          maxInvestment:      plan.maxInvestment,
          durationDays:       plan.durationDays,
          riskLevel:          plan.riskLevel,
          isActive:           plan.isActive,
          updatedAt:          new Date(),
        })
        .where(eq(aiTradingPlansTable.name, plan.name!));
      console.log(`   ↻  Updated : ${plan.name} (${plan.riskLevel}) — ${plan.dailyReturnPercent}%/day`);
      updated++;
    } else {
      await db.insert(aiTradingPlansTable).values(plan);
      console.log(`   ✅ Created : ${plan.name} (${plan.riskLevel}) — ${plan.dailyReturnPercent}%/day`);
      created++;
    }
  }

  console.log(`\n✅ AI Plans seed complete — created: ${created}  updated: ${updated}`);
  console.log("   Note: engine caps effective daily yield at 1.3% regardless of plan rate.");
  process.exit(0);
}

main().catch(err => {
  console.error("❌ AI plans seed failed:", err.message ?? err);
  process.exit(1);
});
