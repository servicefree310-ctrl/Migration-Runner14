/**
 * seed-bots.ts — Advanced Market Bot Seed
 *
 * Creates / updates market_bots rows for all active trading pairs.
 *
 * Tier strategy (based on base-coin liquidity):
 *   TIER 1 (BTC, ETH)
 *     — Tightest spread (8 bps), 12 levels, large order size, aggressive market taker
 *   TIER 2 (BNB, SOL, ADA, XRP, AVAX, MATIC, DOT, LINK, ATOM, ARB, OP, APT, SUI, INJ, TIA)
 *     — Medium spread (14 bps), 10 levels, medium order size
 *   TIER 3 (everything else — mid-caps)
 *     — Wider spread (22 bps), 8 levels, smaller size
 *
 * INR-quoted pairs: add +4 bps spread (INR depth is shallower).
 * BTC-quoted pairs: add +6 bps spread (cross-rate noise).
 *
 * Run:
 *   pnpm --filter @workspace/scripts run seed:bots
 */
import { db, marketBotsTable, pairsTable, coinsTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";

// ─── Tier definitions ────────────────────────────────────────────────────────
const TIER1 = new Set(["BTC", "ETH"]);
const TIER2 = new Set([
  "BNB", "SOL", "ADA", "XRP", "AVAX", "MATIC", "DOT", "LINK", "ATOM",
  "ARB", "OP", "APT", "SUI", "INJ", "TIA", "NEAR", "FTM", "ALGO",
  "AAVE", "UNI", "LTC", "BCH", "DOGE", "SHIB", "TON", "TRX",
]);

// ─── Per-tier base config (for USDT-quoted pairs) ────────────────────────────
interface BotConfig {
  spreadBps: number;
  levels: number;
  orderSize: string;
  priceStepBps: number;
  topOfBookBoostPct: number;
  refreshSec: number;
  maxOrderAgeSec: number;
  fillOnCross: boolean;
  marketTakerEnabled: boolean;
  marketTakerSizeMult: string;
  priceMoveTriggerBps: number;
  bigOrderTriggerQty: string;
  bigOrderAbsorbMult: string;
  marketTakerCooldownSec: number;
}

function baseCfg(tier: 1 | 2 | 3): BotConfig {
  // NOTE: spreadBps and priceStepBps use the "×100 finer" unit system:
  //   halfSpread = spreadBps / 2_000_000   (not /20_000)
  //   stepFrac   = priceStepBps / 1_000_000 (not /10_000)
  // e.g. spreadBps=10 → ≈$1 spread on BTC at $95k; 33 → ≈$0.1 on ETH at $3k.
  // DB is updated per-pair-type in the seed loop below; these are fallback defaults.
  if (tier === 1) return {
    // TIER 1: BTC / ETH — institutional-grade depth
    spreadBps:            10,        // ≈$1 on BTC, ≈$0.03 on ETH (overridden per pair)
    levels:               12,
    orderSize:            "0.005",   // 0.005 BTC ≈ $475 per level at $95k
    priceStepBps:         10,        // ≈$1 step on BTC, ≈$0.03 on ETH
    topOfBookBoostPct:    120,       // top level = 2.2× size (thick best quote)
    refreshSec:           4,         // aggressive refresh
    maxOrderAgeSec:       45,
    fillOnCross:          true,
    marketTakerEnabled:   true,
    marketTakerSizeMult:  "3.50",   // large momentum bursts
    priceMoveTriggerBps:  12,        // chase on 0.12% move
    bigOrderTriggerQty:   "0.05",   // absorb user whale orders > 0.05 BTC
    bigOrderAbsorbMult:   "2.00",
    marketTakerCooldownSec: 20,
  };
  if (tier === 2) return {
    // TIER 2: large-cap alts — USDT pairs overridden per-pair in seed loop
    spreadBps:            100,       // ≈0.01% half-spread for alt USDT pairs
    levels:               10,
    orderSize:            "1.5",    // e.g. 1.5 SOL, 10 ADA, 2 BNB — varies by coin price
    priceStepBps:         50,
    topOfBookBoostPct:    90,
    refreshSec:           5,
    maxOrderAgeSec:       55,
    fillOnCross:          true,
    marketTakerEnabled:   true,
    marketTakerSizeMult:  "2.50",
    priceMoveTriggerBps:  18,
    bigOrderTriggerQty:   "5",
    bigOrderAbsorbMult:   "1.80",
    marketTakerCooldownSec: 25,
  };
  // TIER 3: mid-caps
  return {
    spreadBps:            100,       // tight but safe for mid-caps
    levels:               8,
    orderSize:            "8",
    priceStepBps:         50,
    topOfBookBoostPct:    60,
    refreshSec:           7,
    maxOrderAgeSec:       65,
    fillOnCross:          true,
    marketTakerEnabled:   true,
    marketTakerSizeMult:  "1.80",
    priceMoveTriggerBps:  28,
    bigOrderTriggerQty:   "20",
    bigOrderAbsorbMult:   "1.50",
    marketTakerCooldownSec: 35,
  };
}

// Per-symbol order size overrides (each coin has different unit price)
// Values chosen so nominal USD value per level is reasonable for that tier.
const SIZE_OVERRIDE: Record<string, string> = {
  // ─── TIER 1 ───────────────────────────────────────────────────────────────
  BTC:   "0.004",   // ~$380 per level
  ETH:   "0.06",    // ~$180 per level

  // ─── TIER 2 ───────────────────────────────────────────────────────────────
  BNB:   "0.30",    // ~$183 per level
  SOL:   "1.20",    // ~$180 per level
  ADA:   "280",     // ~$126 per level
  XRP:   "180",     // ~$108 per level
  AVAX:  "1.80",    // ~$108 per level
  MATIC: "180",     // ~$126 per level
  DOT:   "14",      // ~$98 per level
  LINK:  "8",       // ~$112 per level
  ATOM:  "10",      // ~$90 per level
  ARB:   "150",     // ~$105 per level
  OP:    "80",      // ~$104 per level
  APT:   "14",      // ~$98 per level
  SUI:   "65",      // ~$100 per level
  INJ:   "4",       // ~$100 per level
  TIA:   "15",      // ~$90 per level
  NEAR:  "30",      // ~$90 per level
  FTM:   "200",     // ~$80 per level
  ALGO:  "220",     // ~$77 per level
  AAVE:  "0.40",    // ~$96 per level
  UNI:   "9",       // ~$72 per level
  LTC:   "0.70",    // ~$63 per level
  BCH:   "0.18",    // ~$81 per level
  DOGE:  "700",     // ~$105 per level
  SHIB:  "6000000", // ~$90 per level
  TON:   "15",      // ~$75 per level
  TRX:   "500",     // ~$65 per level

  // ─── Notable TIER 3 ───────────────────────────────────────────────────────
  "1INCH": "80",
  AGIX:  "100",
  ANKR:  "500",
  APE:   "30",
  AUDIO: "80",
  BAND:  "15",
  CAKE:  "20",
  CHZ:   "250",
  COMP:  "0.25",
  CRV:   "45",
  ENS:   "2",
  FIL:   "8",
  FLOW:  "12",
  GMT:   "100",
  GRT:   "200",
  HBAR:  "400",
  HOT:   "10000",
  ICP:   "1.5",
  IOTA:  "80",
  KSM:   "0.5",
  MANA:  "60",
  MKR:   "0.02",
  OCEAN: "80",
  ONE:   "500",
  PEOPLE:"500",
  PERP:  "15",
  QNT:   "0.2",
  ROSE:  "200",
  RUNE:  "10",
  SAND:  "80",
  SNX:   "12",
  SPELL: "2000",
  STX:   "40",
  SUSHI: "25",
  THETA: "18",
  VET:   "1000",
  WAVES: "5",
  WRX:   "100",
  XLM:   "350",
  XMR:   "0.5",
  XTZ:   "30",
  YFI:   "0.002",
  ZEC:   "0.5",
  ZIL:   "1000",
};

// INR-quoted pairs: scale up size in rupee units (1 USDT ≈ ₹84)
// BTC-quoted pairs: much smaller (priced in BTC)
function adjustSizeForQuote(size: string, quoteSymbol: string, baseSymbol: string): string {
  const base = parseFloat(size);
  if (quoteSymbol === "INR") {
    // INR pairs: same base size (qty in base coin is same regardless of quote)
    return size;
  }
  if (quoteSymbol === "BTC") {
    // Pairs quoted in BTC are usually very small base sizes
    const btcAdj: Record<string, string> = {
      ADA: "500", ALGO: "400", APT: "3", ARB: "100", ATOM: "6",
      AVAX: "2", DOGE: "2000", DOT: "12", FTM: "500", LINK: "10",
      LTC: "1", MATIC: "300", NEAR: "40", SOL: "2", UNI: "10",
      XLM: "600", XRP: "300",
    };
    return btcAdj[baseSymbol] ?? "50";
  }
  return size;
}

function getTier(baseSymbol: string): 1 | 2 | 3 {
  if (TIER1.has(baseSymbol)) return 1;
  if (TIER2.has(baseSymbol)) return 2;
  return 3;
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log("🤖 Zebvix Advanced Bot Seed — starting…");

  // Load all active pairs with coin info
  const pairs = await db
    .select({
      id: pairsTable.id,
      symbol: pairsTable.symbol,
      status: pairsTable.status,
      tradingEnabled: pairsTable.tradingEnabled,
      baseCoinId: pairsTable.baseCoinId,
      quoteCoinId: pairsTable.quoteCoinId,
      baseSymbol: coinsTable.symbol,
    })
    .from(pairsTable)
    .innerJoin(coinsTable, eq(coinsTable.id, pairsTable.baseCoinId));

  const quoteCoinRows = await db.select({ id: coinsTable.id, symbol: coinsTable.symbol }).from(coinsTable);
  const coinById: Record<number, string> = {};
  for (const c of quoteCoinRows) coinById[c.id] = c.symbol;

  const activePairs = pairs.filter(p => p.status === "active" && p.tradingEnabled);
  console.log(`   Found ${activePairs.length} active pairs`);

  let created = 0, updated = 0, skipped = 0;

  for (const pair of activePairs) {
    const quoteSymbol = coinById[pair.quoteCoinId] ?? "USDT";
    const baseSymbol  = pair.baseSymbol;
    const tier        = getTier(baseSymbol);
    const cfg         = baseCfg(tier);

    // Spread adjustment by quote currency
    let spreadBps = cfg.spreadBps;
    if (quoteSymbol === "INR") spreadBps += 4;
    if (quoteSymbol === "BTC") spreadBps += 6;

    // Order size override
    const rawSize = SIZE_OVERRIDE[baseSymbol] ?? cfg.orderSize;
    const orderSize = adjustSizeForQuote(rawSize, quoteSymbol, baseSymbol);

    // Enable futures market-making for T1 (BTC/ETH) and T2 (major alts).
    // T3 mid-caps keep futures off — shallow liquidity on perps is risky.
    const futuresEnabled = tier === 1 || tier === 2;

    const botRow = {
      pairId:                 pair.id,
      enabled:                true,
      spreadBps,
      levels:                 cfg.levels,
      priceStepBps:           cfg.priceStepBps,
      orderSize,
      refreshSec:             cfg.refreshSec,
      maxOrderAgeSec:         cfg.maxOrderAgeSec,
      fillOnCross:            cfg.fillOnCross,
      spotEnabled:            true,
      futuresEnabled,
      topOfBookBoostPct:      cfg.topOfBookBoostPct,
      marketTakerEnabled:     cfg.marketTakerEnabled,
      marketTakerSizeMult:    cfg.marketTakerSizeMult,
      priceMoveTriggerBps:    cfg.priceMoveTriggerBps,
      bigOrderTriggerQty:     cfg.bigOrderTriggerQty,
      bigOrderAbsorbMult:     cfg.bigOrderAbsorbMult,
      marketTakerCooldownSec: cfg.marketTakerCooldownSec,
      status:                 "idle",
      updatedAt:              new Date(),
    };

    // Upsert — if a bot already exists for this pair, update params but
    // preserve enabled flag and lastMidPrice so the running bot doesn't reset.
    const existing = await db.select({ id: marketBotsTable.id })
      .from(marketBotsTable)
      .where(eq(marketBotsTable.pairId, pair.id))
      .limit(1);

    if (existing.length > 0) {
      await db.update(marketBotsTable)
        .set({
          spreadBps:              botRow.spreadBps,
          levels:                 botRow.levels,
          priceStepBps:           botRow.priceStepBps,
          orderSize:              botRow.orderSize,
          refreshSec:             botRow.refreshSec,
          maxOrderAgeSec:         botRow.maxOrderAgeSec,
          fillOnCross:            botRow.fillOnCross,
          spotEnabled:            botRow.spotEnabled,
          topOfBookBoostPct:      botRow.topOfBookBoostPct,
          marketTakerEnabled:     botRow.marketTakerEnabled,
          marketTakerSizeMult:    botRow.marketTakerSizeMult,
          priceMoveTriggerBps:    botRow.priceMoveTriggerBps,
          bigOrderTriggerQty:     botRow.bigOrderTriggerQty,
          bigOrderAbsorbMult:     botRow.bigOrderAbsorbMult,
          marketTakerCooldownSec: botRow.marketTakerCooldownSec,
          updatedAt:              new Date(),
        })
        .where(eq(marketBotsTable.pairId, pair.id));
      updated++;
    } else {
      await db.insert(marketBotsTable).values({ ...botRow, enabled: true });
      created++;
    }

    const tierLabel = tier === 1 ? "T1" : tier === 2 ? "T2" : "T3";
    console.log(`   ${tierLabel} [${pair.id.toString().padStart(3)}] ${baseSymbol}/${quoteSymbol} — spread=${spreadBps}bps levels=${cfg.levels} size=${orderSize} spot=✓ futures=${futuresEnabled ? "✓" : "✗"} mktTaker=${cfg.marketTakerEnabled ? "✓" : "✗"}`);
  }

  console.log("");
  console.log(`✅ Done — created: ${created}  updated: ${updated}  skipped: ${skipped}`);
  console.log(`   Total bots active: ${created + updated}`);
  console.log("");
  console.log("Tier summary:");
  console.log("  T1 (BTC/ETH)      — spread 8–12bps, 12 levels, spot+futures, aggressive mktTaker 3.5×");
  console.log("  T2 (major alts)   — spread 14–18bps, 10 levels, spot+futures, mktTaker 2.5×");
  console.log("  T3 (mid-caps)     — spread 22–28bps,  8 levels, spot only,    mktTaker 1.8×");
  console.log("");
  console.log("Bot engine features active:");
  console.log("  ✓ Exponential volume taper  — thick near mid, thin at edges");
  console.log("  ✓ Momentum-aware sizing     — bigger orders when price trends up");
  console.log("  ✓ Dynamic level count       — extra levels added on momentum side");
  console.log("  ✓ Scaled market taker       — burst size ∝ momentum strength");
  console.log("  ✓ Momentum burst mode       — oversized order on >100 bps move");
  console.log("  ✓ Futures enabled           — T1+T2 pairs serve orderbook depth on perps");
  process.exit(0);
}

main().catch(err => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
