/**
 * seed-all.ts — Master seed orchestrator for VPS deployment.
 *
 * Runs all seeds in dependency order:
 *   1. coins    — coins, networks, pairs (required by all other seeds)
 *   2. admin    — superadmin user + platform wallets
 *   3. kyc      — KYC level settings
 *   4. ai-plans — AI trading plan catalogue
 *   5. earn     — earn/staking products
 *   6. bots     — market bot configuration per pair
 *   7. ai-accounts (optional) — demo AI trader accounts for leaderboard
 *
 * Run:
 *   pnpm --filter @workspace/scripts run seed:all
 *
 * Or run individual steps:
 *   pnpm --filter @workspace/scripts run seed:coins
 *   pnpm --filter @workspace/scripts run seed:admin
 *   ... etc
 */

import { execFileSync } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { readFileSync, existsSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Auto-load .env from project root if DATABASE_URL not already set
if (!process.env.DATABASE_URL) {
  const envPath = resolve(__dirname, "../../.env");
  if (existsSync(envPath)) {
    const lines = readFileSync(envPath, "utf-8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^['"]|['"]$/g, "");
      if (key && !(key in process.env)) process.env[key] = val;
    }
    console.log("   Loaded .env from project root\n");
  }
}

function runSeed(name: string, scriptFile: string) {
  const file = resolve(__dirname, scriptFile);
  console.log(`\n${"─".repeat(60)}`);
  console.log(`🌱 Running: ${name}`);
  console.log(`${"─".repeat(60)}`);
  try {
    execFileSync(
      process.execPath,
      ["--import", "tsx/esm", file],
      { stdio: "inherit", env: process.env }
    );
  } catch (err: any) {
    console.error(`\n❌ ${name} FAILED — aborting seed:all`);
    process.exit(1);
  }
}

async function main() {
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║           Zebvix — Full VPS Seed (seed:all)               ║");
  console.log("╚════════════════════════════════════════════════════════════╝");
  console.log("");
  console.log("Seeds run in dependency order.");
  console.log("Each step is idempotent — safe to re-run on existing data.\n");

  const start = Date.now();

  // 1. Coins + networks + pairs (foundation — everything else depends on this)
  runSeed("Step 1/7 — Coins, Networks & Pairs", "./seed-coins.ts");

  // 2. Admin user + platform wallets
  runSeed("Step 2/7 — Admin User & Platform Wallets", "./seed-admin.ts");

  // 3. KYC level configuration
  runSeed("Step 3/7 — KYC Level Settings", "./seed-kyc-settings.ts");

  // 4. AI trading plans
  runSeed("Step 4/7 — AI Trading Plans", "./seed-ai-plans.ts");

  // 5. Earn / staking products
  runSeed("Step 5/7 — Earn & Staking Products", "./seed-earn-plans.ts");

  // 6. Market bot config per pair
  runSeed("Step 6/7 — Market Bots", "./seed-bots.ts");

  // 7. Demo AI trader accounts (leaderboard + dashboard data)
  runSeed("Step 7/7 — AI Demo Accounts (leaderboard data)", "./seed-ai-accounts.ts");

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log(`║  ✅ seed:all complete in ${elapsed.padStart(5)}s                          ║`);
  console.log("╠════════════════════════════════════════════════════════════╣");
  console.log("║  Default credentials:                                      ║");
  console.log("║    Admin   → admin@zebvix.com   / Admin1234!               ║");
  console.log("║    AI bots → *@aitrader.bot     / AiTrader2025!            ║");
  console.log("╠════════════════════════════════════════════════════════════╣");
  console.log("║  Start the API server:                                     ║");
  console.log("║    pnpm --filter @workspace/api-server run dev             ║");
  console.log("╚════════════════════════════════════════════════════════════╝");
  console.log("");
  process.exit(0);
}

main();
