import { Router, type IRouter } from "express";
import { eq, and, desc, inArray } from "drizzle-orm";
import crypto from "node:crypto";
import {
  db,
  coinsTable,
  networksTable,
  pairsTable,
  legalPagesTable,
  settingsTable,
  earnProductsTable,
  depositAddressesTable,
  walletAddressesTable,
  ordersTable,
  tradesTable,
} from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { deriveEvmWallet, deriveBtcWallet, deriveTrxWallet, deriveSolWallet } from "../lib/hd-wallet";
import { encryptSecret } from "../lib/crypto-vault";

const router: IRouter = Router();

// Public coins (only active + listed)
router.get("/coins", async (_req, res): Promise<void> => {
  const rows = await db.select().from(coinsTable).where(eq(coinsTable.isListed, true)).orderBy(coinsTable.symbol);
  res.json(rows);
});

router.get("/networks", async (req, res): Promise<void> => {
  const coinId = req.query.coinId ? Number(req.query.coinId) : null;
  const rows = coinId
    ? await db.select().from(networksTable).where(and(eq(networksTable.coinId, coinId), eq(networksTable.status, "active")))
    : await db.select().from(networksTable).where(eq(networksTable.status, "active"));
  res.json(rows);
});

router.get("/pairs", async (_req, res): Promise<void> => {
  // Only active + trading-enabled pairs whose BOTH coins are listed+active.
  // We enrich each row with baseSymbol/quoteSymbol so the UI can build a
  // canonical "BASE/QUOTE" set without a second round-trip to /coins.
  const [pairs, coins] = await Promise.all([
    db.select().from(pairsTable).where(and(
      eq(pairsTable.status, "active"),
      eq(pairsTable.tradingEnabled, true),
    )).orderBy(pairsTable.symbol),
    db.select({ id: coinsTable.id, symbol: coinsTable.symbol, isListed: coinsTable.isListed, status: coinsTable.status })
      .from(coinsTable),
  ]);
  const coinById = new Map(coins.map((c: any) => [c.id, c]));
  const out = pairs
    .map((p: any) => {
      const b = coinById.get(p.baseCoinId);
      const q = coinById.get(p.quoteCoinId);
      if (!b || !q) return null;
      if (!b.isListed || b.status !== "active") return null;
      if (!q.isListed || q.status !== "active") return null;
      return { ...p, baseSymbol: b.symbol, quoteSymbol: q.symbol };
    })
    .filter(Boolean);
  res.json(out);
});

router.get("/legal/:slug", async (req, res): Promise<void> => {
  const slug = Array.isArray(req.params.slug) ? req.params.slug[0] : req.params.slug;
  if (!slug) { res.status(400).json({ error: "slug required" }); return; }
  const [p] = await db.select().from(legalPagesTable).where(eq(legalPagesTable.slug, slug)).limit(1);
  if (!p) { res.status(404).json({ error: "Not found" }); return; }
  res.json(p);
});

router.get("/settings", async (_req, res): Promise<void> => {
  const rows = await db.select().from(settingsTable);
  const map: Record<string, string> = {};
  rows.forEach((s: any) => { map[s.key] = s.value; });
  res.json(map);
});

router.get("/settings/:key", async (req, res): Promise<void> => {
  const key = Array.isArray(req.params.key) ? req.params.key[0] : req.params.key;
  if (!key) { res.status(400).json({ error: "key required" }); return; }
  const [s] = await db.select().from(settingsTable).where(eq(settingsTable.key, key)).limit(1);
  if (!s) { res.status(404).json({ error: "Not found" }); return; }
  res.json(s);
});

router.get("/earn-products", async (_req, res): Promise<void> => {
  const rows = await db.select().from(earnProductsTable).where(eq(earnProductsTable.status, "active")).orderBy(desc(earnProductsTable.apy));
  res.json(rows);
});

// ─── Auto deposit address generation ──────────────────────────────────────────
function deterministicAddress(userId: number, networkChain: string): { address: string; memo: string | null } {
  const seed = crypto.createHash("sha256").update(`cx:${userId}:${networkChain}`).digest("hex");
  const chain = networkChain.toLowerCase();
  if (chain.includes("btc") || chain === "bitcoin") {
    return { address: "bc1q" + seed.slice(0, 38), memo: null };
  }
  if (chain.includes("trc")) {
    return { address: "T" + Buffer.from(seed.slice(0, 30), "hex").toString("base64").replace(/[+/=]/g, "").slice(0, 33), memo: null };
  }
  if (chain.includes("sol")) {
    return { address: Buffer.from(seed.slice(0, 32), "hex").toString("base64").replace(/[+/=]/g, "").slice(0, 44), memo: null };
  }
  if (chain.includes("xrp") || chain.includes("ripple")) {
    return { address: "r" + seed.slice(0, 33), memo: String(parseInt(seed.slice(0, 8), 16)) };
  }
  // EVM-style default (ETH/BSC/Arbitrum/Polygon etc)
  return { address: "0x" + seed.slice(0, 40), memo: null };
}

function isEvmChain(chain: string, providerType?: string): boolean {
  const c = (chain || "").toUpperCase();
  if (["BNB", "BSC", "ETH", "POLYGON", "MATIC", "ARBITRUM", "BASE", "AVAX"].includes(c)) return true;
  const p = (providerType || "").toLowerCase();
  return p === "alchemy" || p === "infura";
}

router.get("/deposit-address", requireAuth, async (req, res): Promise<void> => {
  const coinId = Number(req.query.coinId);
  const networkId = Number(req.query.networkId);
  if (!coinId || !networkId) { res.status(400).json({ error: "coinId and networkId required" }); return; }
  const userId = req.user!.id;

  const [network] = await db.select().from(networksTable).where(eq(networksTable.id, networkId)).limit(1);
  if (!network) { res.status(404).json({ error: "Network not found" }); return; }
  if (network.coinId !== coinId) { res.status(400).json({ error: "Network does not belong to this coin" }); return; }
  if (network.status !== "active") { res.status(400).json({ error: "Network is not active" }); return; }

  // Shared address per (userId, networkId) — same across all coins on this network
  const [existing] = await db.select().from(walletAddressesTable).where(and(
    eq(walletAddressesTable.userId, userId),
    eq(walletAddressesTable.networkId, networkId),
  )).limit(1);

  // If existing record is a placeholder (no privateKeyEnc) and chain is EVM, regenerate as real HD wallet
  if (existing && existing.privateKeyEnc) {
    res.json({ address: existing.address, memo: existing.memo, networkId, coinId, status: existing.status });
    return;
  }

  try {
    if (isEvmChain(network.chain, network.providerType)) {
      const w = await deriveEvmWallet(userId);
      const pkEnc = encryptSecret(w.privateKey);
      if (existing) {
        const [updated] = await db.update(walletAddressesTable).set({
          address: w.address, privateKeyEnc: pkEnc, derivationPath: w.path, derivationIndex: w.index, status: "active",
        }).where(eq(walletAddressesTable.id, existing.id)).returning();
        res.json({ address: updated.address, memo: updated.memo, networkId, coinId, status: updated.status });
        return;
      }
      const [created] = await db.insert(walletAddressesTable).values({
        userId, networkId, address: w.address, memo: null,
        privateKeyEnc: pkEnc, derivationPath: w.path, derivationIndex: w.index, status: "active",
      }).returning();
      res.json({ address: created.address, memo: created.memo, networkId, coinId, status: created.status });
      return;
    }
    // Non-EVM chains: BTC, TRX (real HD derivation), SOL + others (deterministic)
    const chain = (network.chain || "").toLowerCase();
    let nonEvmAddr: string;
    let nonEvmKey: string | null = null;
    let nonEvmPath: string | null = null;
    let nonEvmMemo: string | null = null;
    if (chain.includes("btc") || chain === "bitcoin") {
      const w = await deriveBtcWallet(userId);
      nonEvmAddr = w.address; nonEvmKey = w.privateKey; nonEvmPath = w.path;
    } else if (chain.includes("trc") || chain.includes("trx") || chain === "tron") {
      const w = await deriveTrxWallet(userId);
      nonEvmAddr = w.address; nonEvmKey = w.privateKey; nonEvmPath = w.path;
    } else if (chain.includes("sol") || chain === "solana") {
      const w = await deriveSolWallet(userId);
      nonEvmAddr = w.address; nonEvmPath = w.path;
    } else {
      const fallback = deterministicAddress(userId, network.chain);
      nonEvmAddr = fallback.address; nonEvmMemo = fallback.memo;
    }
    const pkEnc = nonEvmKey ? encryptSecret(nonEvmKey) : null;
    const [created] = await db.insert(walletAddressesTable).values({
      userId, networkId,
      address: nonEvmAddr,
      memo: nonEvmMemo,
      privateKeyEnc: pkEnc,
      derivationPath: nonEvmPath,
      derivationIndex: nonEvmPath ? userId : null,
      status: "active",
    }).returning();
    res.json({ address: created.address, memo: created.memo, networkId, coinId, status: created.status });
  } catch (e: any) {
    const [row] = await db.select().from(walletAddressesTable).where(and(
      eq(walletAddressesTable.userId, userId),
      eq(walletAddressesTable.networkId, networkId),
    )).limit(1);
    if (!row) { res.status(500).json({ error: e?.message || "Address creation failed" }); return; }
    res.json({ address: row.address, memo: row.memo, networkId, coinId, status: row.status });
  }
});

// Orders endpoints moved to routes/orders.ts (transactional with wallet locks)

// Aggregated order book from open orders (top 20 bids + top 20 asks)
router.get("/orderbook", async (req, res): Promise<void> => {
  const pairId = Number(req.query.pairId);
  const depth = Math.max(1, Math.min(Number(req.query.depth) || 20, 50));
  if (!pairId) { res.status(400).json({ error: "pairId required" }); return; }

  const bidRows = await db.execute(sql`
    SELECT price::text AS price, SUM(qty - filled_qty)::text AS qty
    FROM ${ordersTable}
    WHERE pair_id = ${pairId} AND side = 'buy' AND status IN ('open', 'partial') AND type IN ('limit', 'post_only')
    GROUP BY price
    ORDER BY price DESC
    LIMIT ${depth}
  `);
  const askRows = await db.execute(sql`
    SELECT price::text AS price, SUM(qty - filled_qty)::text AS qty
    FROM ${ordersTable}
    WHERE pair_id = ${pairId} AND side = 'sell' AND status IN ('open', 'partial') AND type IN ('limit', 'post_only')
    GROUP BY price
    ORDER BY price ASC
    LIMIT ${depth}
  `);
  const mapRow = (r: any) => {
    const price = Number(r.price);
    const qty = Number(r.qty);
    return { price, qty, total: price * qty };
  };
  res.json({
    pairId,
    bids: (bidRows as any).rows.map(mapRow).filter((r: any) => r.qty > 0),
    asks: (askRows as any).rows.map(mapRow).filter((r: any) => r.qty > 0),
    ts: Date.now(),
  });
});

// Public recent trades for a pair (no PII)
// Only taker rows (isTaker=1) — each match produces one taker + one maker row
// in the DB; showing only the taker avoids duplicates and correctly represents
// the aggressive side (the order that crossed the book, whether user or bot).
router.get("/recent-trades", async (req, res): Promise<void> => {
  const pairId = Number(req.query.pairId);
  const limit = Math.max(1, Math.min(Number(req.query.limit) || 30, 100));
  if (!pairId) { res.status(400).json({ error: "pairId required" }); return; }
  const rows = await db.select({
    id: tradesTable.id,
    price: tradesTable.price,
    qty: tradesTable.qty,
    side: tradesTable.side,
    createdAt: tradesTable.createdAt,
  }).from(tradesTable)
    .where(and(eq(tradesTable.pairId, pairId), eq(tradesTable.isTaker, 1)))
    .orderBy(desc(tradesTable.createdAt))
    .limit(limit);
  res.json(rows.map(r => ({
    id: r.id,
    price: Number(r.price),
    qty: Number(r.qty),
    side: r.side,
    ts: new Date(r.createdAt).getTime(),
  })));
});

export default router;
