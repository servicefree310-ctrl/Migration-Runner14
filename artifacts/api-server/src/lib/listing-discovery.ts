/**
 * Listing Discovery Service
 *
 * Polls external sources (CoinGecko top markets + DexScreener trending) on a
 * leader-gated interval, normalizes the results into `listing_candidates`, and
 * either auto-lists or queues for manual review based on `listing_rules`.
 *
 * AUTO-LIST behavior (when a candidate matches an `auto`-mode rule):
 *  - scope=spot:  insert into `coins` (binance source if available, else manual),
 *                 optionally create a `pairs` row vs `quoteSymbol`.
 *  - scope=web3:  insert into `web3_tokens` keyed on `priceCoinSymbol` (uses
 *                 the candidate's own symbol; falls back to USDT if missing).
 *  - scope=both:  prefer spot if a CoinGecko candidate, else web3.
 *
 * MANUAL behavior:
 *  - status='pending' — admin reviews via /admin/listings UI.
 *
 * Idempotency: candidate insert uses ON CONFLICT (source, source_ref) DO UPDATE
 * so re-runs simply refresh the metrics without creating duplicates.
 */
import { db, listingRulesTable, listingSourcesTable, listingCandidatesTable, coinsTable, pairsTable, web3TokensTable, web3NetworksTable } from "@workspace/db";
import { eq, and, sql, desc } from "drizzle-orm";
import { isLeader } from "./leader";
import { logger } from "./logger";

/**
 * Sanitize external string data before DB insertion / UI rendering.
 * - strips ASCII control chars
 * - collapses whitespace
 * - hard-caps length so a malicious source can't bloat rows
 */
function sanitizeStr(s: string | null | undefined, maxLen = 80): string {
  if (s == null) return "";
  return String(s).replace(/[\x00-\x1f\x7f]/g, "").replace(/\s+/g, " ").trim().slice(0, maxLen);
}

function sanitizeUrl(u: string | null | undefined, maxLen = 500): string | null {
  if (!u) return null;
  const s = String(u).trim().slice(0, maxLen);
  return /^https?:\/\//i.test(s) ? s : null;
}

type Candidate = {
  source: string;
  sourceRef: string;
  chain: string | null;
  contractAddress: string | null;
  symbol: string;
  name: string;
  logoUrl: string | null;
  priceUsd: number;
  marketCapUsd: number;
  volume24hUsd: number;
  liquidityUsd: number;
  priceChange24h: number;
  ageDays: number;
  raw: unknown;
};

const TIMEOUT_MS = 12000;

async function fetchJson(url: string): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "Zebvix-Listing-Discovery/1.0", Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

async function pullCoinGeckoMarkets(maxItems: number): Promise<Candidate[]> {
  const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=volume_desc&per_page=${Math.min(250, maxItems)}&page=1&sparkline=false&price_change_percentage=24h`;
  const data = await fetchJson(url) as Array<Record<string, unknown>>;
  if (!Array.isArray(data)) return [];
  const out: Candidate[] = [];
  for (const c of data) {
    const id = typeof c.id === "string" ? c.id : null;
    const symbol = typeof c.symbol === "string" ? c.symbol.toUpperCase() : null;
    const name = typeof c.name === "string" ? c.name : null;
    if (!id || !symbol || !name) continue;
    const genesisStr = typeof c.atl_date === "string" ? c.atl_date : null;
    const ageDays = genesisStr ? Math.max(0, Math.floor((Date.now() - new Date(genesisStr).getTime()) / 86400000)) : 0;
    out.push({
      source: "coingecko",
      sourceRef: sanitizeStr(id, 120),
      chain: null,
      contractAddress: null,
      symbol: sanitizeStr(symbol, 20),
      name: sanitizeStr(name, 80),
      logoUrl: sanitizeUrl(typeof c.image === "string" ? c.image : null),
      priceUsd: Number(c.current_price ?? 0) || 0,
      marketCapUsd: Number(c.market_cap ?? 0) || 0,
      volume24hUsd: Number(c.total_volume ?? 0) || 0,
      liquidityUsd: 0,
      priceChange24h: Number(c.price_change_percentage_24h ?? 0) || 0,
      ageDays,
      raw: c,
    });
  }
  return out;
}

async function pullDexScreenerBoosts(maxItems: number, kind: "boosts" | "latest"): Promise<Candidate[]> {
  const url = kind === "boosts"
    ? "https://api.dexscreener.com/token-boosts/top/v1"
    : "https://api.dexscreener.com/token-profiles/latest/v1";
  const list = await fetchJson(url) as Array<Record<string, unknown>>;
  if (!Array.isArray(list)) return [];
  const slice = list.slice(0, maxItems);
  const out: Candidate[] = [];
  for (const item of slice) {
    const chain = typeof item.chainId === "string" ? item.chainId : null;
    const addr = typeof item.tokenAddress === "string" ? item.tokenAddress : null;
    if (!chain || !addr) continue;
    let pair: Record<string, unknown> | null = null;
    try {
      const detail = await fetchJson(`https://api.dexscreener.com/latest/dex/tokens/${addr}`) as { pairs?: Array<Record<string, unknown>> };
      const pairs = Array.isArray(detail.pairs) ? detail.pairs : [];
      pair = pairs.sort((a, b) => Number((b.liquidity as Record<string, unknown> | undefined)?.usd ?? 0) - Number((a.liquidity as Record<string, unknown> | undefined)?.usd ?? 0))[0] ?? null;
    } catch { /* skip token if detail fails */ }
    if (!pair) continue;
    const baseToken = (pair.baseToken as Record<string, unknown>) ?? {};
    const symbol = typeof baseToken.symbol === "string" ? baseToken.symbol.toUpperCase() : null;
    const name = typeof baseToken.name === "string" ? baseToken.name : symbol;
    if (!symbol || !name) continue;
    const liq = (pair.liquidity as Record<string, unknown> | undefined)?.usd;
    const vol = (pair.volume as Record<string, unknown> | undefined)?.h24;
    const price = pair.priceUsd;
    const change = (pair.priceChange as Record<string, unknown> | undefined)?.h24;
    const fdv = pair.fdv;
    const createdAt = pair.pairCreatedAt;
    const ageDays = typeof createdAt === "number" ? Math.max(0, Math.floor((Date.now() - createdAt) / 86400000)) : 0;
    out.push({
      source: kind === "boosts" ? "dexscreener" : "dexscreener_latest",
      sourceRef: sanitizeStr(`${chain}:${addr.toLowerCase()}`, 120),
      chain: sanitizeStr(chain, 32),
      contractAddress: sanitizeStr(addr, 80),
      symbol: sanitizeStr(symbol, 20),
      name: sanitizeStr(name ?? symbol, 80),
      logoUrl: sanitizeUrl(typeof item.icon === "string" ? item.icon : null),
      priceUsd: Number(price ?? 0) || 0,
      marketCapUsd: Number(fdv ?? 0) || 0,
      volume24hUsd: Number(vol ?? 0) || 0,
      liquidityUsd: Number(liq ?? 0) || 0,
      priceChange24h: Number(change ?? 0) || 0,
      ageDays,
      raw: { item, pair },
    });
    // gentle throttle so we don't hammer DexScreener
    await new Promise((r) => setTimeout(r, 80));
  }
  return out;
}

function scoreRisk(c: Candidate): { score: number; flags: string[] } {
  const flags: string[] = [];
  let score = 50;
  if (c.ageDays < 3) { flags.push("very_new"); score += 25; }
  else if (c.ageDays < 14) { flags.push("new"); score += 10; }
  if (c.liquidityUsd > 0 && c.liquidityUsd < 25000) { flags.push("low_liquidity"); score += 20; }
  if (c.marketCapUsd > 0 && c.marketCapUsd < 500000) { flags.push("micro_cap"); score += 15; }
  if (c.volume24hUsd > 0 && c.marketCapUsd > 0 && c.volume24hUsd / c.marketCapUsd > 5) { flags.push("vol_to_mcap_anomaly"); score += 15; }
  if (Math.abs(c.priceChange24h) > 50) { flags.push("extreme_move_24h"); score += 10; }
  return { score: Math.max(0, Math.min(100, score)), flags };
}

function ruleAccepts(rule: typeof listingRulesTable.$inferSelect, c: Candidate): boolean {
  if (!rule.isActive) return false;
  if (rule.scope === "spot" && c.source.startsWith("dexscreener")) return false;
  if (rule.scope === "web3" && c.source === "coingecko") return false;
  if (Number(rule.minVolume24hUsd) > c.volume24hUsd) return false;
  if (Number(rule.minMarketCapUsd) > c.marketCapUsd) return false;
  if (Number(rule.minLiquidityUsd) > 0 && c.liquidityUsd > 0 && Number(rule.minLiquidityUsd) > c.liquidityUsd) return false;
  if (rule.minAgeDays > 0 && c.ageDays < rule.minAgeDays) return false;
  const chainsAllowed = isStringArray(rule.chainsAllowed) ? rule.chainsAllowed : [];
  if (chainsAllowed.length > 0 && c.chain && !chainsAllowed.includes(c.chain)) return false;
  const sourceFilter = isStringArray(rule.sourceFilter) ? rule.sourceFilter : [];
  if (sourceFilter.length > 0 && !sourceFilter.includes(c.source)) return false;
  return true;
}

async function autoListSpot(c: Candidate, rule: typeof listingRulesTable.$inferSelect): Promise<{ coinId: number; pairId?: number } | null> {
  // Race-proof upsert: even if a parallel worker inserted the same symbol between
  // the SELECT and INSERT, ON CONFLICT DO UPDATE returns the canonical row.
  const [upserted] = await db.insert(coinsTable).values({
    symbol: c.symbol,
    name: c.name,
    type: "crypto",
    decimals: 8,
    logoUrl: c.logoUrl,
    status: "active",
    isListed: true,
    currentPrice: String(c.priceUsd),
    change24h: String(c.priceChange24h),
    binanceSymbol: `${c.symbol}USDT`,
    priceSource: "binance",
  }).onConflictDoUpdate({
    target: coinsTable.symbol,
    set: { isListed: true, status: "active", logoUrl: sql`COALESCE(${coinsTable.logoUrl}, EXCLUDED.logo_url)`, updatedAt: new Date() },
  }).returning({ id: coinsTable.id });
  if (!upserted) return null;
  const coinId = upserted.id;
  if (!rule.autoCreatePair) return { coinId };
  const quote = await db.select().from(coinsTable).where(eq(coinsTable.symbol, rule.quoteSymbol)).limit(1);
  if (!quote.length) return { coinId };
  const sym = `${c.symbol}/${rule.quoteSymbol}`;
  const existingPair = await db.select().from(pairsTable).where(eq(pairsTable.symbol, sym)).limit(1);
  if (existingPair.length > 0) return { coinId, pairId: existingPair[0]!.id };
  const [pair] = await db.insert(pairsTable).values({
    symbol: sym,
    baseCoinId: coinId,
    quoteCoinId: quote[0]!.id,
    tradingEnabled: true,
    lastPrice: String(c.priceUsd),
  }).returning({ id: pairsTable.id });
  return { coinId, pairId: pair?.id };
}

async function autoListWeb3(c: Candidate): Promise<{ tokenId: number; networkId: number } | null> {
  if (!c.chain || !c.contractAddress) return null;
  const chainKeyMap: Record<string, string> = {
    ethereum: "eth", eth: "eth", bsc: "bsc", "binance-smart-chain": "bsc",
    polygon: "polygon", "polygon-pos": "polygon", arbitrum: "arbitrum",
    optimism: "optimism", base: "base", avalanche: "avalanche", solana: "solana",
  };
  const key = chainKeyMap[c.chain.toLowerCase()] ?? c.chain.toLowerCase();
  const net = await db.select().from(web3NetworksTable).where(eq(web3NetworksTable.chainKey, key)).limit(1);
  if (!net.length) return null;
  const networkId = net[0]!.id;
  const existing = await db.select().from(web3TokensTable)
    .where(and(eq(web3TokensTable.networkId, networkId), eq(web3TokensTable.contractAddress, c.contractAddress.toLowerCase())))
    .limit(1);
  if (existing.length > 0) {
    await db.update(web3TokensTable).set({ status: "active" }).where(eq(web3TokensTable.id, existing[0]!.id));
    return { tokenId: existing[0]!.id, networkId };
  }
  const priceCoin = await db.select().from(coinsTable).where(eq(coinsTable.symbol, c.symbol)).limit(1);
  const priceCoinSymbol = priceCoin.length ? priceCoin[0]!.symbol : "USDT";
  const [tok] = await db.insert(web3TokensTable).values({
    networkId,
    symbol: c.symbol,
    name: c.name,
    contractAddress: c.contractAddress.toLowerCase(),
    decimals: 18,
    isNative: false,
    logoUrl: c.logoUrl,
    priceCoinSymbol,
    status: "active",
  }).returning({ id: web3TokensTable.id });
  return { tokenId: tok!.id, networkId };
}

async function persistCandidate(c: Candidate, rules: Array<typeof listingRulesTable.$inferSelect>): Promise<void> {
  const { score, flags } = scoreRisk(c);
  const matched = rules.find((r) => ruleAccepts(r, c));
  let status: "pending" | "listed" | "skipped" = matched ? (matched.mode === "auto" ? "listed" : matched.mode === "manual" ? "pending" : "skipped") : "pending";
  let listedCoinId: number | null = null;
  let listedTokenId: number | null = null;
  let listedNetworkId: number | null = null;
  if (matched && matched.mode === "auto") {
    try {
      if (matched.scope === "spot" || (matched.scope === "both" && c.source === "coingecko")) {
        const r = await autoListSpot(c, matched);
        if (r) listedCoinId = r.coinId;
      } else if (matched.scope === "web3" || (matched.scope === "both" && c.source !== "coingecko")) {
        const r = await autoListWeb3(c);
        if (r) { listedTokenId = r.tokenId; listedNetworkId = r.networkId; }
      }
      if (!listedCoinId && !listedTokenId) status = "pending";
    } catch (err) {
      logger.warn({ err: err instanceof Error ? err.message : String(err), symbol: c.symbol }, "auto-list failed; falling back to pending");
      status = "pending";
    }
  }
  await db.insert(listingCandidatesTable).values({
    source: c.source, sourceRef: c.sourceRef, chain: c.chain, contractAddress: c.contractAddress?.toLowerCase() ?? null,
    symbol: c.symbol, name: c.name, logoUrl: c.logoUrl,
    priceUsd: String(c.priceUsd), marketCapUsd: String(c.marketCapUsd), volume24hUsd: String(c.volume24hUsd),
    liquidityUsd: String(c.liquidityUsd), priceChange24h: String(c.priceChange24h), ageDays: c.ageDays,
    riskScore: score, riskFlags: flags, rawData: c.raw as object,
    status, ruleId: matched?.id ?? null,
    listedCoinId, listedTokenId, listedNetworkId,
    decidedAt: status === "listed" || status === "skipped" ? new Date() : null,
  }).onConflictDoUpdate({
    target: [listingCandidatesTable.source, listingCandidatesTable.sourceRef],
    set: {
      priceUsd: String(c.priceUsd), marketCapUsd: String(c.marketCapUsd),
      volume24hUsd: String(c.volume24hUsd), liquidityUsd: String(c.liquidityUsd),
      priceChange24h: String(c.priceChange24h), ageDays: c.ageDays,
      riskScore: score, riskFlags: flags, updatedAt: new Date(),
    },
  });
}

export async function runDiscoveryOnce(opts?: { forceSourceKind?: string }): Promise<{ scanned: number; listed: number; pending: number; bySource: Record<string, number> }> {
  const sources = await db.select().from(listingSourcesTable).where(eq(listingSourcesTable.isEnabled, true));
  const rules = await db.select().from(listingRulesTable).where(eq(listingRulesTable.isActive, true)).orderBy(desc(listingRulesTable.priority));
  let scanned = 0, listed = 0, pending = 0;
  const bySource: Record<string, number> = {};
  for (const src of sources) {
    if (opts?.forceSourceKind && src.kind !== opts.forceSourceKind) continue;
    try {
      let cands: Candidate[] = [];
      if (src.kind === "coingecko") cands = await pullCoinGeckoMarkets(src.maxItemsPerSync);
      else if (src.kind === "dexscreener") cands = await pullDexScreenerBoosts(src.maxItemsPerSync, "boosts");
      else if (src.kind === "dexscreener_latest") cands = await pullDexScreenerBoosts(src.maxItemsPerSync, "latest");
      bySource[src.kind] = cands.length;
      for (const c of cands) {
        await persistCandidate(c, rules);
        scanned++;
      }
      await db.update(listingSourcesTable).set({ lastSyncAt: new Date(), lastSyncCount: cands.length, lastError: null }).where(eq(listingSourcesTable.id, src.id));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn({ src: src.name, err: msg }, "discovery source failed");
      await db.update(listingSourcesTable).set({ lastSyncAt: new Date(), lastError: msg }).where(eq(listingSourcesTable.id, src.id));
    }
  }
  const counts = await db.select({ s: listingCandidatesTable.status, n: sql<number>`count(*)::int` }).from(listingCandidatesTable).groupBy(listingCandidatesTable.status);
  for (const r of counts) {
    if (r.s === "listed") listed = Number(r.n);
    if (r.s === "pending") pending = Number(r.n);
  }
  return { scanned, listed, pending, bySource };
}

let timer: NodeJS.Timeout | null = null;
const DEFAULT_INTERVAL_MS = 15 * 60 * 1000;

export function startListingDiscovery(intervalMs: number = DEFAULT_INTERVAL_MS): void {
  if (timer) return;
  const tick = async () => {
    try {
      if (!isLeader()) return;
      const r = await runDiscoveryOnce();
      logger.info({ ...r }, "listing discovery tick");
    } catch (err) {
      logger.error({ err: err instanceof Error ? err.message : String(err) }, "listing discovery tick failed");
    }
  };
  timer = setInterval(tick, intervalMs);
  setTimeout(tick, 30_000);
  logger.info({ intervalMs }, "listing discovery worker started");
}

export function stopListingDiscovery(): void {
  if (timer) { clearInterval(timer); timer = null; }
}
