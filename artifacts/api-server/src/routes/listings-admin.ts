/**
 * Admin Listings API
 *
 * Manages auto-listing rules, source connectors, and the candidate review
 * queue. Admins can create rules (volume + mcap + liquidity thresholds),
 * toggle sources on/off, manually trigger discovery, and approve/reject
 * candidates from the queue.
 */
import { Router, type IRouter } from "express";
import { eq, desc, and, sql, inArray } from "drizzle-orm";
import { db, listingRulesTable, listingSourcesTable, listingCandidatesTable, coinsTable, pairsTable, web3TokensTable, web3NetworksTable } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/auth";
import { logAdminAction } from "../lib/audit";
import { runDiscoveryOnce } from "../lib/listing-discovery";

const router: IRouter = Router();
const ADMIN_GUARD = [requireAuth, requireRole("admin", "superadmin")];

router.get("/admin/listings/rules", ...ADMIN_GUARD, async (_req, res): Promise<void> => {
  const rows = await db.select().from(listingRulesTable).orderBy(desc(listingRulesTable.priority), desc(listingRulesTable.id));
  res.json({ rules: rows });
});

router.post("/admin/listings/rules", ...ADMIN_GUARD, async (req, res): Promise<void> => {
  const b = req.body ?? {};
  if (!b.name) { res.status(400).json({ error: "name required" }); return; }
  const mode = ["auto", "manual", "off"].includes(b.mode) ? b.mode : "manual";
  const scope = ["spot", "web3", "both"].includes(b.scope) ? b.scope : "both";
  const numStr = (v: unknown, fallback: string): string => {
    const n = Number(v ?? fallback);
    return Number.isFinite(n) && n >= 0 ? String(n) : fallback;
  };
  const [row] = await db.insert(listingRulesTable).values({
    name: String(b.name).slice(0, 80),
    mode, scope,
    minVolume24hUsd: numStr(b.minVolume24hUsd, "100000"),
    minMarketCapUsd: numStr(b.minMarketCapUsd, "1000000"),
    minLiquidityUsd: numStr(b.minLiquidityUsd, "50000"),
    minAgeDays: Math.max(0, Math.min(3650, Number(b.minAgeDays ?? 7) || 0)),
    chainsAllowed: Array.isArray(b.chainsAllowed) ? b.chainsAllowed : [],
    sourceFilter: Array.isArray(b.sourceFilter) ? b.sourceFilter : [],
    autoCreatePair: b.autoCreatePair !== false,
    quoteSymbol: String(b.quoteSymbol ?? "USDT"),
    isActive: b.isActive !== false,
    priority: Number(b.priority ?? 10),
  }).returning();
  await logAdminAction(req, { action: "listing.rule.create", entity: "listing_rule", entityId: row!.id, payload: { name: row!.name, mode, scope } });
  res.status(201).json({ rule: row });
});

router.patch("/admin/listings/rules/:id", ...ADMIN_GUARD, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const b = req.body ?? {};
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  const safeNumStr = (v: unknown): string | null => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? String(n) : null;
  };
  if (b.name !== undefined) patch.name = String(b.name).slice(0, 80);
  if (b.mode !== undefined && ["auto", "manual", "off"].includes(b.mode)) patch.mode = b.mode;
  if (b.scope !== undefined && ["spot", "web3", "both"].includes(b.scope)) patch.scope = b.scope;
  if (b.minVolume24hUsd !== undefined) { const v = safeNumStr(b.minVolume24hUsd); if (v) patch.minVolume24hUsd = v; }
  if (b.minMarketCapUsd !== undefined) { const v = safeNumStr(b.minMarketCapUsd); if (v) patch.minMarketCapUsd = v; }
  if (b.minLiquidityUsd !== undefined) { const v = safeNumStr(b.minLiquidityUsd); if (v) patch.minLiquidityUsd = v; }
  if (b.minAgeDays !== undefined) patch.minAgeDays = Math.max(0, Math.min(3650, Number(b.minAgeDays) || 0));
  if (Array.isArray(b.chainsAllowed)) patch.chainsAllowed = b.chainsAllowed;
  if (Array.isArray(b.sourceFilter)) patch.sourceFilter = b.sourceFilter;
  if (b.autoCreatePair !== undefined) patch.autoCreatePair = !!b.autoCreatePair;
  if (b.quoteSymbol !== undefined) patch.quoteSymbol = String(b.quoteSymbol);
  if (b.isActive !== undefined) patch.isActive = !!b.isActive;
  if (b.priority !== undefined) patch.priority = Number(b.priority);
  const [row] = await db.update(listingRulesTable).set(patch).where(eq(listingRulesTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "rule not found" }); return; }
  await logAdminAction(req, {action: "listing.rule.update", entity: "listing_rule", entityId: id, payload: patch});
  res.json({ rule: row });
});

router.delete("/admin/listings/rules/:id", ...ADMIN_GUARD, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  await db.delete(listingRulesTable).where(eq(listingRulesTable.id, id));
  await logAdminAction(req, {action: "listing.rule.delete", entity: "listing_rule", entityId: id});
  res.json({ ok: true });
});

router.get("/admin/listings/sources", ...ADMIN_GUARD, async (_req, res): Promise<void> => {
  const rows = await db.select().from(listingSourcesTable).orderBy(listingSourcesTable.id);
  res.json({ sources: rows });
});

router.patch("/admin/listings/sources/:id", ...ADMIN_GUARD, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const b = req.body ?? {};
  const patch: Record<string, unknown> = {};
  if (b.isEnabled !== undefined) patch.isEnabled = !!b.isEnabled;
  if (b.syncIntervalMin !== undefined) patch.syncIntervalMin = Number(b.syncIntervalMin);
  if (b.maxItemsPerSync !== undefined) patch.maxItemsPerSync = Number(b.maxItemsPerSync);
  const [row] = await db.update(listingSourcesTable).set(patch).where(eq(listingSourcesTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "source not found" }); return; }
  await logAdminAction(req, {action: "listing.source.update", entity: "listing_source", entityId: id, payload: patch});
  res.json({ source: row });
});

router.post("/admin/listings/discover/run", ...ADMIN_GUARD, async (req, res): Promise<void> => {
  const sourceKind = typeof req.body?.sourceKind === "string" ? req.body.sourceKind : undefined;
  try {
    const r = await runDiscoveryOnce({ forceSourceKind: sourceKind });
    await logAdminAction(req, {action: "listing.discover.run", entity: "listing_source", payload: r});
    res.json({ ok: true, ...r });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.get("/admin/listings/candidates", ...ADMIN_GUARD, async (req, res): Promise<void> => {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  const source = typeof req.query.source === "string" ? req.query.source : undefined;
  const limit = Math.min(500, Math.max(1, Number(req.query.limit ?? 100)));
  const conds = [];
  if (status) conds.push(eq(listingCandidatesTable.status, status));
  if (source) conds.push(eq(listingCandidatesTable.source, source));
  if (search) conds.push(sql`(${listingCandidatesTable.symbol} ILIKE ${"%" + search + "%"} OR ${listingCandidatesTable.name} ILIKE ${"%" + search + "%"})`);
  const where = conds.length ? and(...conds) : undefined;
  const rows = await db.select().from(listingCandidatesTable).where(where).orderBy(desc(listingCandidatesTable.discoveredAt)).limit(limit);
  const stats = await db.select({ s: listingCandidatesTable.status, n: sql<number>`count(*)::int` }).from(listingCandidatesTable).groupBy(listingCandidatesTable.status);
  res.json({ candidates: rows, stats });
});

router.post("/admin/listings/candidates/:id/approve", ...ADMIN_GUARD, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const b = req.body ?? {};
  const target: "spot" | "web3" = b.target === "web3" ? "web3" : "spot";
  const [c] = await db.select().from(listingCandidatesTable).where(eq(listingCandidatesTable.id, id));
  if (!c) { res.status(404).json({ error: "candidate not found" }); return; }
  if (c.status === "listed") { res.status(409).json({ error: "already listed" }); return; }
  const userId = req.user?.id ?? null;
  let listedCoinId: number | null = null;
  let listedTokenId: number | null = null;
  let listedNetworkId: number | null = null;
  try {
    if (target === "spot") {
      const existing = await db.select().from(coinsTable).where(eq(coinsTable.symbol, c.symbol)).limit(1);
      let coinId: number;
      if (existing.length > 0) {
        coinId = existing[0]!.id;
        await db.update(coinsTable).set({ isListed: true, status: "active", logoUrl: c.logoUrl ?? existing[0]!.logoUrl, updatedAt: new Date() }).where(eq(coinsTable.id, coinId));
      } else {
        const [ins] = await db.insert(coinsTable).values({
          symbol: c.symbol, name: c.name, type: "crypto", decimals: 8,
          logoUrl: c.logoUrl, status: "active", isListed: true,
          currentPrice: c.priceUsd, change24h: c.priceChange24h,
          binanceSymbol: `${c.symbol}USDT`, priceSource: "binance",
        }).returning({ id: coinsTable.id });
        coinId = ins!.id;
      }
      listedCoinId = coinId;
      const quote = await db.select().from(coinsTable).where(eq(coinsTable.symbol, "USDT")).limit(1);
      if (quote.length && b.createPair !== false) {
        const sym = `${c.symbol}/USDT`;
        const ep = await db.select().from(pairsTable).where(eq(pairsTable.symbol, sym)).limit(1);
        if (!ep.length) {
          await db.insert(pairsTable).values({ symbol: sym, baseCoinId: coinId, quoteCoinId: quote[0]!.id, tradingEnabled: true, lastPrice: c.priceUsd });
        }
      }
    } else {
      if (!c.chain || !c.contractAddress) { res.status(400).json({ error: "candidate has no chain/contract for web3 listing" }); return; }
      const chainKeyMap: Record<string, string> = { ethereum: "eth", eth: "eth", bsc: "bsc", "binance-smart-chain": "bsc", polygon: "polygon", "polygon-pos": "polygon", arbitrum: "arbitrum", optimism: "optimism", base: "base", avalanche: "avalanche", solana: "solana" };
      const key = chainKeyMap[c.chain.toLowerCase()] ?? c.chain.toLowerCase();
      const net = await db.select().from(web3NetworksTable).where(eq(web3NetworksTable.chainKey, key)).limit(1);
      if (!net.length) { res.status(400).json({ error: `network ${key} not registered` }); return; }
      listedNetworkId = net[0]!.id;
      const existing = await db.select().from(web3TokensTable).where(and(eq(web3TokensTable.networkId, listedNetworkId), eq(web3TokensTable.contractAddress, c.contractAddress.toLowerCase()))).limit(1);
      if (existing.length > 0) {
        await db.update(web3TokensTable).set({ status: "active" }).where(eq(web3TokensTable.id, existing[0]!.id));
        listedTokenId = existing[0]!.id;
      } else {
        const priceCoin = await db.select().from(coinsTable).where(eq(coinsTable.symbol, c.symbol)).limit(1);
        const priceCoinSymbol = priceCoin.length ? priceCoin[0]!.symbol : "USDT";
        const [tok] = await db.insert(web3TokensTable).values({
          networkId: listedNetworkId, symbol: c.symbol, name: c.name,
          contractAddress: c.contractAddress.toLowerCase(), decimals: 18,
          isNative: false, logoUrl: c.logoUrl, priceCoinSymbol, status: "active",
        }).returning({ id: web3TokensTable.id });
        listedTokenId = tok!.id;
      }
    }
    const [updated] = await db.update(listingCandidatesTable).set({
      status: "listed",
      decidedBy: userId, decidedAt: new Date(),
      decisionNote: typeof b.note === "string" ? b.note : null,
      listedCoinId, listedTokenId, listedNetworkId,
      updatedAt: new Date(),
    }).where(eq(listingCandidatesTable.id, id)).returning();
    await logAdminAction(req, { action: "listing.candidate.approve", entity: "listing_candidate", entityId: id, payload: { target, symbol: c.symbol, listedCoinId, listedTokenId } });
    res.json({ candidate: updated });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `approval failed: ${msg}` });
  }
});

router.post("/admin/listings/candidates/:id/reject", ...ADMIN_GUARD, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const note = typeof req.body?.note === "string" ? req.body.note : null;
  const userId = req.user?.id ?? null;
  const [updated] = await db.update(listingCandidatesTable).set({
    status: "rejected", decidedBy: userId, decidedAt: new Date(),
    decisionNote: note, updatedAt: new Date(),
  }).where(eq(listingCandidatesTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "candidate not found" }); return; }
  await logAdminAction(req, { action: "listing.candidate.reject", entity: "listing_candidate", entityId: id, payload: { note } });
  res.json({ candidate: updated });
});

router.post("/admin/listings/candidates/bulk", ...ADMIN_GUARD, async (req, res): Promise<void> => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map((x: unknown) => Number(x)).filter((x: number) => Number.isFinite(x)) : [];
  const action = req.body?.action;
  if (!ids.length || !["reject", "skip"].includes(action)) { res.status(400).json({ error: "ids[] + action(reject|skip) required" }); return; }
  const status = action === "reject" ? "rejected" : "skipped";
  await db.update(listingCandidatesTable).set({ status, decidedBy: req.user?.id ?? null, decidedAt: new Date(), updatedAt: new Date() }).where(inArray(listingCandidatesTable.id, ids));
  await logAdminAction(req, { action: `listing.candidate.bulk_${action}`, entity: "listing_candidate", payload: { count: ids.length } });
  res.json({ ok: true, count: ids.length });
});

export default router;
