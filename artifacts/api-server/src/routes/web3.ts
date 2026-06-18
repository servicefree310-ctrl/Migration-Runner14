/**
 * Web3 multi-chain trading — user-facing routes.
 *
 *   GET    /web3/networks                    — list active chains
 *   GET    /web3/tokens?networkId=X          — tokens for a given chain
 *   GET    /web3/wallets                     — caller's saved wallets
 *   POST   /web3/wallets                     — track an address
 *   DELETE /web3/wallets/:id                 — remove
 *   POST   /web3/quote                       — swap quote (no wallet movement)
 *   POST   /web3/swap                        — execute simulated swap (wallet move)
 *   POST   /web3/bridge/quote                — bridge quote
 *   POST   /web3/bridge                      — execute simulated bridge
 *   GET    /web3/swaps                       — user's swap history
 *   GET    /web3/bridges                     — user's bridge history
 *   GET    /web3/portfolio?address=X&networkId=Y — read-only on-chain balance view
 *
 * Note on simulation: swap/bridge moves balances inside the user's exchange
 * spot wallets keyed on coins.symbol, NOT on real chain TXs. The token's
 * priceCoinSymbol pins the ledger row. This gives a real-feeling UX with
 * realistic prices and fees, while keeping zero on-chain risk.
 */
import { Router, type IRouter } from "express";
import { and, eq, desc, sql, asc, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, web3NetworksTable, web3TokensTable, web3WalletsTable, web3SwapsTable, web3BridgesTable, walletsTable, coinsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { getSwapQuote, getBridgeQuote, fakeTxHash } from "../lib/web3-quote";

const router: IRouter = Router();

// ─── Zod schemas ─────────────────────────────────────────────────────────────
const saveWalletSchema = z.object({
  networkId: z.number({ invalid_type_error: "networkId must be a number" }).int().positive(),
  address:   z.string().min(24).max(100),
  label:     z.string().max(80).optional(),
  kind:      z.enum(["watch", "external"]).default("watch"),
});

const swapInputSchema = z.object({
  networkId:   z.number({ invalid_type_error: "networkId must be a number" }).int().positive(),
  fromTokenId: z.number({ invalid_type_error: "fromTokenId must be a number" }).int().positive(),
  toTokenId:   z.number({ invalid_type_error: "toTokenId must be a number" }).int().positive(),
  fromAmount:  z.number({ invalid_type_error: "fromAmount must be a number" }).positive("fromAmount must be > 0"),
  slippageBps: z.number().int().min(0).max(3000).optional(),
});

const bridgeInputSchema = z.object({
  fromNetworkId: z.number({ invalid_type_error: "fromNetworkId must be a number" }).int().positive(),
  toNetworkId:   z.number({ invalid_type_error: "toNetworkId must be a number" }).int().positive(),
  tokenSymbol:   z.string().min(1).max(20).transform(s => s.toUpperCase()),
  fromAmount:    z.number({ invalid_type_error: "fromAmount must be a number" }).positive("fromAmount must be > 0"),
});

// ─── Networks & tokens (public) ──────────────────────────────────────────────
router.get("/web3/networks", async (_req, res): Promise<void> => {
  const rows = await db.select().from(web3NetworksTable).where(eq(web3NetworksTable.status, "active")).orderBy(asc(web3NetworksTable.id));
  res.json({ networks: rows });
});

router.get("/web3/tokens", async (req, res): Promise<void> => {
  const networkId = Number(req.query.networkId ?? 0);
  if (!networkId) { res.json({ tokens: [] }); return; }
  const rows = await db.select().from(web3TokensTable).where(
    and(eq(web3TokensTable.networkId, networkId), eq(web3TokensTable.status, "active")),
  ).orderBy(desc(web3TokensTable.isNative), asc(web3TokensTable.symbol));
  res.json({ tokens: rows });
});

// ─── Saved wallets ───────────────────────────────────────────────────────────
router.get("/web3/wallets", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const rows = await db.select({
    id: web3WalletsTable.id,
    networkId: web3WalletsTable.networkId,
    address: web3WalletsTable.address,
    label: web3WalletsTable.label,
    kind: web3WalletsTable.kind,
    createdAt: web3WalletsTable.createdAt,
    networkKey: web3NetworksTable.chainKey,
    networkName: web3NetworksTable.displayName,
    explorerUrl: web3NetworksTable.explorerUrl,
  }).from(web3WalletsTable)
    .leftJoin(web3NetworksTable, eq(web3NetworksTable.id, web3WalletsTable.networkId))
    .where(eq(web3WalletsTable.userId, userId))
    .orderBy(desc(web3WalletsTable.createdAt));
  res.json({ wallets: rows });
});

router.post("/web3/wallets", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const walletParsed = saveWalletSchema.safeParse(req.body);
  if (!walletParsed.success) {
    res.status(400).json({ error: walletParsed.error.errors[0]?.message ?? "Invalid request body" }); return;
  }
  const { networkId: nId, address: addr, label, kind } = walletParsed.data;
  const [n] = await db.select().from(web3NetworksTable).where(eq(web3NetworksTable.id, nId)).limit(1);
  if (!n) { res.status(400).json({ error: "network not found" }); return; }

  // Family-aware shape check
  if (n.family === "evm" && !/^0x[a-fA-F0-9]{40}$/.test(addr)) { res.status(400).json({ error: "EVM address must be 0x + 40 hex chars" }); return; }
  if (n.family === "solana" && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr)) { res.status(400).json({ error: "Solana address must be base58 (32-44 chars)" }); return; }

  try {
    const [row] = await db.insert(web3WalletsTable).values({
      userId, networkId: nId, address: addr, label: label ?? "",
      kind,
    }).returning();
    res.status(201).json(row);
  } catch (e: any) {
    if (String(e.message || "").includes("duplicate")) { res.status(409).json({ error: "this wallet is already saved" }); return; }
    throw e;
  }
});

router.delete("/web3/wallets/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const id = Number(req.params.id);
  const r = await db.delete(web3WalletsTable).where(and(eq(web3WalletsTable.id, id), eq(web3WalletsTable.userId, userId))).returning();
  if (!r.length) { res.status(404).json({ error: "not found" }); return; }
  res.json({ ok: true });
});

// ─── Swap quote + execute ────────────────────────────────────────────────────
router.post("/web3/quote", async (req, res): Promise<void> => {
  const swapQ = swapInputSchema.safeParse(req.body);
  if (!swapQ.success) { res.status(400).json({ error: swapQ.error.errors[0]?.message ?? "Invalid request body" }); return; }
  try {
    const q = await getSwapQuote(swapQ.data);
    res.json(q);
  } catch (e: any) {
    res.status(400).json({ error: e.message ?? "quote failed" });
  }
});

router.post("/web3/swap", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const swapP = swapInputSchema.safeParse(req.body);
  if (!swapP.success) { res.status(400).json({ error: swapP.error.errors[0]?.message ?? "Invalid request body" }); return; }

  try {
    // Get authoritative quote server-side
    const quote = await getSwapQuote(swapP.data);

    const result = await db.transaction(async (tx) => {
      const [fromTok] = await tx.select().from(web3TokensTable).where(eq(web3TokensTable.id, quote.fromTokenId)).limit(1);
      const [toTok]   = await tx.select().from(web3TokensTable).where(eq(web3TokensTable.id, quote.toTokenId)).limit(1);
      if (!fromTok || !toTok) { const e: any = new Error("token gone"); e.code = 404; throw e; }

      // Find/create exchange-side ledger wallets for both coins
      const [fromCoin] = await tx.select().from(coinsTable).where(eq(coinsTable.symbol, fromTok.priceCoinSymbol.toUpperCase())).limit(1);
      const [toCoin]   = await tx.select().from(coinsTable).where(eq(coinsTable.symbol, toTok.priceCoinSymbol.toUpperCase())).limit(1);
      if (!fromCoin || !toCoin) { const e: any = new Error(`coin not listed (${fromTok.priceCoinSymbol}→${toTok.priceCoinSymbol})`); e.code = 400; throw e; }

      const [srcW] = await tx.select().from(walletsTable).where(
        and(eq(walletsTable.userId, userId), eq(walletsTable.coinId, fromCoin.id), eq(walletsTable.walletType, "spot")),
      ).for("update").limit(1);
      if (!srcW) { const e: any = new Error(`No ${fromCoin.symbol} balance — please deposit first`); e.code = 400; throw e; }
      if (Number(srcW.balance) < quote.fromAmount) {
        const e: any = new Error(`Insufficient ${fromCoin.symbol} (have ${Number(srcW.balance).toFixed(8)})`); e.code = 400; throw e;
      }

      const [dstExisting] = await tx.select().from(walletsTable).where(
        and(eq(walletsTable.userId, userId), eq(walletsTable.coinId, toCoin.id), eq(walletsTable.walletType, "spot")),
      ).for("update").limit(1);
      let dstId: number;
      if (dstExisting) dstId = dstExisting.id;
      else {
        const [c] = await tx.insert(walletsTable).values({ userId, coinId: toCoin.id, walletType: "spot", balance: "0", locked: "0" }).returning();
        dstId = c.id;
      }

      await tx.update(walletsTable).set({
        balance: sql`${walletsTable.balance} - ${quote.fromAmount}`, updatedAt: new Date(),
      }).where(eq(walletsTable.id, srcW.id));
      await tx.update(walletsTable).set({
        balance: sql`${walletsTable.balance} + ${quote.toAmount}`, updatedAt: new Date(),
      }).where(eq(walletsTable.id, dstId));

      const [net] = await tx.select().from(web3NetworksTable).where(eq(web3NetworksTable.id, quote.networkId)).limit(1);
      const [swap] = await tx.insert(web3SwapsTable).values({
        userId, networkId: quote.networkId, fromTokenId: quote.fromTokenId, toTokenId: quote.toTokenId,
        fromAmount: String(quote.fromAmount), toAmount: String(quote.toAmount), rate: String(quote.rate),
        slippageBps: swapP.data.slippageBps ?? 50,
        feeUsd: String(quote.feeUsd), gasUsd: String(quote.gasUsd),
        txHash: fakeTxHash(net?.family ?? "evm"),
        status: "completed",
      }).returning();
      return swap;
    });

    res.status(201).json({ swap: result, quote });
  } catch (e: any) {
    if (e?.code) { res.status(e.code).json({ error: e.message }); return; }
    res.status(400).json({ error: e.message ?? "swap failed" });
  }
});

// ─── Bridge quote + execute ──────────────────────────────────────────────────
router.post("/web3/bridge/quote", async (req, res): Promise<void> => {
  const bq = bridgeInputSchema.safeParse(req.body);
  if (!bq.success) { res.status(400).json({ error: bq.error.errors[0]?.message ?? "Invalid request body" }); return; }
  try {
    const q = await getBridgeQuote(bq.data);
    res.json(q);
  } catch (e: any) {
    res.status(400).json({ error: e.message ?? "quote failed" });
  }
});

router.post("/web3/bridge", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const bp = bridgeInputSchema.safeParse(req.body);
  if (!bp.success) { res.status(400).json({ error: bp.error.errors[0]?.message ?? "Invalid request body" }); return; }
  try {
    const quote = await getBridgeQuote(bp.data);

    const result = await db.transaction(async (tx) => {
      // For bridge we use a single ledger row per token-symbol — the priceCoinSymbol on
      // either side's web3_tokens row points to the same coins.symbol (e.g. USDT).
      // Net effect: debit feeUsd worth from the wallet, then no inter-wallet move
      // needed (same coin). We still record both legs in web3_bridges for UX.
      const [tok] = await tx.select().from(web3TokensTable).where(
        and(eq(web3TokensTable.networkId, quote.fromNetworkId), eq(web3TokensTable.symbol, quote.tokenSymbol)),
      ).limit(1);
      if (!tok) { const e: any = new Error("token gone"); e.code = 404; throw e; }
      const [coin] = await tx.select().from(coinsTable).where(eq(coinsTable.symbol, tok.priceCoinSymbol.toUpperCase())).limit(1);
      if (!coin) { const e: any = new Error("coin not listed"); e.code = 400; throw e; }

      const [w] = await tx.select().from(walletsTable).where(
        and(eq(walletsTable.userId, userId), eq(walletsTable.coinId, coin.id), eq(walletsTable.walletType, "spot")),
      ).for("update").limit(1);
      if (!w) { const e: any = new Error(`No ${coin.symbol} balance`); e.code = 400; throw e; }
      const burn = quote.fromAmount - quote.toAmount;
      if (Number(w.balance) < burn) { const e: any = new Error(`Insufficient ${coin.symbol} for bridge fees`); e.code = 400; throw e; }

      // Burn the fee-equivalent (the moved principal stays in the same coin row)
      await tx.update(walletsTable).set({
        balance: sql`${walletsTable.balance} - ${burn}`, updatedAt: new Date(),
      }).where(eq(walletsTable.id, w.id));

      const [fromNet] = await tx.select().from(web3NetworksTable).where(eq(web3NetworksTable.id, quote.fromNetworkId)).limit(1);
      const [toNet]   = await tx.select().from(web3NetworksTable).where(eq(web3NetworksTable.id, quote.toNetworkId)).limit(1);
      const [b] = await tx.insert(web3BridgesTable).values({
        userId, fromNetworkId: quote.fromNetworkId, toNetworkId: quote.toNetworkId,
        tokenSymbol: quote.tokenSymbol, fromAmount: String(quote.fromAmount), toAmount: String(quote.toAmount),
        feeUsd: String(quote.bridgeFeeUsd + quote.gasUsd),
        srcTxHash: fakeTxHash(fromNet?.family ?? "evm"),
        dstTxHash: fakeTxHash(toNet?.family ?? "evm"),
        status: "completed",
        completedAt: new Date(),
      }).returning();
      return b;
    });
    res.status(201).json({ bridge: result, quote });
  } catch (e: any) {
    if (e?.code) { res.status(e.code).json({ error: e.message }); return; }
    res.status(400).json({ error: e.message ?? "bridge failed" });
  }
});

// ─── History ─────────────────────────────────────────────────────────────────
router.get("/web3/swaps", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const limit = Math.max(1, Math.min(200, Number(req.query.limit ?? 50)));
  const rows = await db.select({
    id: web3SwapsTable.id,
    networkId: web3SwapsTable.networkId,
    chainKey: web3NetworksTable.chainKey,
    networkName: web3NetworksTable.displayName,
    explorerUrl: web3NetworksTable.explorerUrl,
    fromAmount: web3SwapsTable.fromAmount,
    toAmount: web3SwapsTable.toAmount,
    rate: web3SwapsTable.rate,
    feeUsd: web3SwapsTable.feeUsd,
    gasUsd: web3SwapsTable.gasUsd,
    slippageBps: web3SwapsTable.slippageBps,
    txHash: web3SwapsTable.txHash,
    status: web3SwapsTable.status,
    createdAt: web3SwapsTable.createdAt,
    fromTokenId: web3SwapsTable.fromTokenId,
    toTokenId: web3SwapsTable.toTokenId,
  }).from(web3SwapsTable)
    .leftJoin(web3NetworksTable, eq(web3NetworksTable.id, web3SwapsTable.networkId))
    .where(eq(web3SwapsTable.userId, userId))
    .orderBy(desc(web3SwapsTable.createdAt))
    .limit(limit);

  // Hydrate token symbols for display (small N)
  const tokIds = [...new Set(rows.flatMap((r) => [r.fromTokenId, r.toTokenId]))];
  const toks = tokIds.length
    ? await db.select({ id: web3TokensTable.id, symbol: web3TokensTable.symbol }).from(web3TokensTable)
        .where(inArray(web3TokensTable.id, tokIds))
    : [];
  const symBy = new Map(toks.map((t) => [t.id, t.symbol]));
  res.json({
    swaps: rows.map((r) => ({
      ...r,
      fromTokenSymbol: symBy.get(r.fromTokenId) ?? "?",
      toTokenSymbol: symBy.get(r.toTokenId) ?? "?",
    })),
  });
});

router.get("/web3/bridges", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const limit = Math.max(1, Math.min(200, Number(req.query.limit ?? 50)));
  const rows = await db.select().from(web3BridgesTable)
    .where(eq(web3BridgesTable.userId, userId))
    .orderBy(desc(web3BridgesTable.createdAt))
    .limit(limit);
  // Attach network names
  const netIds = [...new Set(rows.flatMap((r) => [r.fromNetworkId, r.toNetworkId]))];
  const nets = netIds.length
    ? await db.select({ id: web3NetworksTable.id, name: web3NetworksTable.displayName, key: web3NetworksTable.chainKey })
        .from(web3NetworksTable)
        .where(inArray(web3NetworksTable.id, netIds))
    : [];
  const nameBy = new Map(nets.map((n) => [n.id, n]));
  res.json({
    bridges: rows.map((r) => ({
      ...r,
      fromNetworkName: nameBy.get(r.fromNetworkId)?.name ?? "?",
      toNetworkName:   nameBy.get(r.toNetworkId)?.name ?? "?",
      fromChainKey:    nameBy.get(r.fromNetworkId)?.key ?? "?",
      toChainKey:      nameBy.get(r.toNetworkId)?.key ?? "?",
    })),
  });
});

// ─── Read-only portfolio (mock — returns the user's exchange balances of
// tokens that exist on this network, since there's no real on-chain RPC) ─────
router.get("/web3/portfolio", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const networkId = Number(req.query.networkId ?? 0);
  if (!networkId) { res.json({ holdings: [] }); return; }

  const tokens = await db.select().from(web3TokensTable).where(
    and(eq(web3TokensTable.networkId, networkId), eq(web3TokensTable.status, "active")),
  );
  const symbols = [...new Set(tokens.map((t) => t.priceCoinSymbol.toUpperCase()))];
  if (!symbols.length) { res.json({ holdings: [] }); return; }
  // Use inArray with pre-validated uppercase symbols (sourced from DB rows, not user input).
  const coins = await db.select().from(coinsTable).where(inArray(coinsTable.symbol, symbols));
  const coinBySym = new Map(coins.map((c) => [c.symbol.toUpperCase(), c]));

  const wRows = await db.select().from(walletsTable).where(
    and(eq(walletsTable.userId, userId), eq(walletsTable.walletType, "spot")),
  );

  const holdings: any[] = [];
  for (const tok of tokens) {
    const coin = coinBySym.get(tok.priceCoinSymbol.toUpperCase());
    if (!coin) continue;
    const w = wRows.find((x) => x.coinId === coin.id);
    const bal = w ? Number(w.balance) : 0;
    if (bal <= 0) continue;
    const usd = bal * Number(coin.currentPrice || coin.manualPrice || 0);
    holdings.push({
      tokenId: tok.id, symbol: tok.symbol, name: tok.name, isNative: tok.isNative,
      balance: bal, usdValue: usd, logoUrl: tok.logoUrl,
    });
  }
  holdings.sort((a, b) => b.usdValue - a.usdValue);
  res.json({ holdings });
});

export default router;
