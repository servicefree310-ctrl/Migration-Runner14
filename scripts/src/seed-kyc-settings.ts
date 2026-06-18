/**
 * seed-kyc-settings.ts — Seeds default KYC level configuration.
 *
 * Populates kyc_settings table for levels 1, 2, 3.
 * Limits are set per PMLA / FIU-IND guidelines for Indian crypto exchanges.
 *
 *   pnpm --filter @workspace/scripts run seed:kyc
 *
 * Safe to re-run — upserts by level (primary key).
 */
import { db, kycSettingsTable } from "@workspace/db";
import { DEFAULT_KYC_TEMPLATES, type KycFieldDef } from "@workspace/db";

const INR_10L  = "1000000";   // ₹10 lakh
const INR_50L  = "5000000";   // ₹50 lakh
const INR_1CR  = "10000000";  // ₹1 crore
const INR_5CR  = "50000000";  // ₹5 crore
const INR_10CR = "100000000"; // ₹10 crore
const UNLIMITED = "999999999999";

// Feature keys displayed on KYC level cards
const FEATURES_L1 = JSON.stringify([
  "spot_trading",
  "fiat_deposit",
  "crypto_deposit",
  "inr_withdraw",
  "crypto_withdraw",
]);

const FEATURES_L2 = JSON.stringify([
  "spot_trading",
  "futures_trading",
  "fiat_deposit",
  "crypto_deposit",
  "inr_withdraw",
  "crypto_withdraw",
  "p2p_trading",
  "ai_trading",
]);

const FEATURES_L3 = JSON.stringify([
  "spot_trading",
  "futures_trading",
  "options_trading",
  "fiat_deposit",
  "crypto_deposit",
  "inr_withdraw",
  "crypto_withdraw",
  "p2p_trading",
  "ai_trading",
  "copy_trading",
  "api_access",
  "high_limits",
]);

function fields(level: 1 | 2 | 3): string {
  const tpl = DEFAULT_KYC_TEMPLATES[level];
  return JSON.stringify(tpl?.fields ?? []);
}

const LEVELS: typeof kycSettingsTable.$inferInsert[] = [
  {
    level:         1,
    name:          "Basic Verification",
    description:   "Confirm your identity with PAN. Unlocks deposits, spot trading and INR withdrawals up to base limits.",
    depositLimit:  INR_10L,
    withdrawLimit: INR_10L,
    tradeLimit:    INR_50L,
    features:      FEATURES_L1,
    fields:        fields(1),
    enabled:       true,
  },
  {
    level:         2,
    name:          "Intermediate Verification",
    description:   "Add Aadhaar + document photos to access P2P, futures, AI trading and higher limits.",
    depositLimit:  INR_50L,
    withdrawLimit: INR_50L,
    tradeLimit:    INR_5CR,
    features:      FEATURES_L2,
    fields:        fields(2),
    enabled:       true,
  },
  {
    level:         3,
    name:          "Advanced Verification",
    description:   "Full EDD with selfie + address. Institutional limits, options trading, and API access.",
    depositLimit:  INR_5CR,
    withdrawLimit: INR_5CR,
    tradeLimit:    INR_10CR,
    features:      FEATURES_L3,
    fields:        fields(3),
    enabled:       true,
  },
];

async function main() {
  console.log("🪪  KYC Settings seed — starting…");

  for (const level of LEVELS) {
    await db
      .insert(kycSettingsTable)
      .values(level)
      .onConflictDoUpdate({
        target: kycSettingsTable.level,
        set: {
          name:          level.name,
          description:   level.description,
          depositLimit:  level.depositLimit,
          withdrawLimit: level.withdrawLimit,
          tradeLimit:    level.tradeLimit,
          features:      level.features,
          fields:        level.fields,
          enabled:       level.enabled,
        },
      });

    const wdL = (Number(level.withdrawLimit) / 1e7).toFixed(0);
    const trL = (Number(level.tradeLimit)    / 1e7).toFixed(0);
    console.log(`   ✅ Level ${level.level}: ${level.name} — withdraw ₹${wdL}Cr/day, trade ₹${trL}Cr/day`);
  }

  console.log("\n✅ KYC settings seed complete.");
  process.exit(0);
}

main().catch(err => {
  console.error("❌ KYC settings seed failed:", err.message ?? err);
  process.exit(1);
});
