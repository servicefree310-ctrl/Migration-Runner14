/**
 * Public Listings Discovery API (user-portal)
 *
 * Read-only endpoints powering the "Discover / Trending" page. Returns
 * recently-discovered tokens (status='listed' OR high-quality 'pending')
 * with sort/filter for a DexScreener-style table.
 */
import { Router, type IRouter } from "express";
import { and, desc, eq, gt, sql, inArray } from "drizzle-orm";
import { db, listingCandidatesTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/listings/discover", async (req, res): Promise<void> => {
  const chain = typeof req.query.chain === "string" ? req.query.chain : undefined;
  const source = typeof req.query.source === "string" ? req.query.source : undefined;
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  const sort = typeof req.query.sort === "string" ? req.query.sort : "volume";
  const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 50)));

  const conds = [inArray(listingCandidatesTable.status, ["listed", "pending"])];
  if (chain) conds.push(eq(listingCandidatesTable.chain, chain));
  if (source) conds.push(eq(listingCandidatesTable.source, source));
  if (search) conds.push(sql`(${listingCandidatesTable.symbol} ILIKE ${"%" + search + "%"} OR ${listingCandidatesTable.name} ILIKE ${"%" + search + "%"})`);
  const orderCol = sort === "mcap" ? listingCandidatesTable.marketCapUsd
    : sort === "change" ? listingCandidatesTable.priceChange24h
    : sort === "age" ? listingCandidatesTable.discoveredAt
    : listingCandidatesTable.volume24hUsd;

  const rows = await db.select({
    id: listingCandidatesTable.id,
    source: listingCandidatesTable.source,
    chain: listingCandidatesTable.chain,
    contractAddress: listingCandidatesTable.contractAddress,
    symbol: listingCandidatesTable.symbol,
    name: listingCandidatesTable.name,
    logoUrl: listingCandidatesTable.logoUrl,
    priceUsd: listingCandidatesTable.priceUsd,
    marketCapUsd: listingCandidatesTable.marketCapUsd,
    volume24hUsd: listingCandidatesTable.volume24hUsd,
    liquidityUsd: listingCandidatesTable.liquidityUsd,
    priceChange24h: listingCandidatesTable.priceChange24h,
    ageDays: listingCandidatesTable.ageDays,
    riskScore: listingCandidatesTable.riskScore,
    riskFlags: listingCandidatesTable.riskFlags,
    status: listingCandidatesTable.status,
    listedCoinId: listingCandidatesTable.listedCoinId,
    listedTokenId: listingCandidatesTable.listedTokenId,
    discoveredAt: listingCandidatesTable.discoveredAt,
  }).from(listingCandidatesTable)
    .where(and(...conds))
    .orderBy(desc(orderCol))
    .limit(limit);
  res.json({ items: rows });
});

router.get("/listings/trending", async (_req, res): Promise<void> => {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const rows = await db.select().from(listingCandidatesTable)
    .where(and(inArray(listingCandidatesTable.status, ["listed", "pending"]), gt(listingCandidatesTable.discoveredAt, since)))
    .orderBy(desc(listingCandidatesTable.priceChange24h))
    .limit(20);
  res.json({ items: rows });
});

router.get("/listings/chains", async (_req, res): Promise<void> => {
  const rows = await db.select({ chain: listingCandidatesTable.chain, n: sql<number>`count(*)::int` })
    .from(listingCandidatesTable).groupBy(listingCandidatesTable.chain);
  res.json({ chains: rows.filter((r) => !!r.chain) });
});

export default router;
