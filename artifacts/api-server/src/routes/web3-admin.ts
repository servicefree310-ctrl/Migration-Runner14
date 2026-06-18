/**
 * Web3 multi-chain — admin routes.
 *
 *   GET    /admin/web3/networks                     — list ALL (incl. disabled)
 *   POST   /admin/web3/networks                     — add a new chain
 *   PATCH  /admin/web3/networks/:id                 — update fees / status / RPC
 *   DELETE /admin/web3/networks/:id                 — delete iff no tokens linked
 *
 *   GET    /admin/web3/tokens?networkId=X           — tokens for a chain (all statuses)
 *   POST   /admin/web3/tokens                       — list a token
 *   PATCH  /admin/web3/tokens/:id                   — edit
 *   DELETE /admin/web3/tokens/:id                   — delist
 */
import { Router, type IRouter } from "express";
import { eq, and, asc, desc } from "drizzle-orm";
import { db, web3NetworksTable, web3TokensTable } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/auth";
import { logAdminAction } from "../lib/audit";

const router: IRouter = Router();
const ADMIN = [requireAuth, requireRole("admin", "superadmin")];

// ── Networks ─────────────────────────────────────────────────────────────────
router.get("/admin/web3/networks", ...ADMIN, async (_req, res): Promise<void> => {
  const rows = await db.select().from(web3NetworksTable).orderBy(asc(web3NetworksTable.id));
  res.json({ networks: rows });
});

router.post("/admin/web3/networks", ...ADMIN, async (req, res): Promise<void> => {
  const { chainKey, displayName, chainId, nativeSymbol, rpcUrl, explorerUrl, logoUrl, family, bridgeFeeBps, swapFeeBps, estGasUsd } = req.body ?? {};
  if (!chainKey || !displayName || !nativeSymbol || !rpcUrl || !explorerUrl) {
    res.status(400).json({ error: "chainKey, displayName, nativeSymbol, rpcUrl, explorerUrl required" });
    return;
  }
  try {
    const [row] = await db.insert(web3NetworksTable).values({
      chainKey: String(chainKey).toLowerCase(),
      displayName,
      chainId: Number(chainId ?? 0),
      nativeSymbol: String(nativeSymbol).toUpperCase(),
      rpcUrl, explorerUrl, logoUrl: logoUrl || null,
      family: family === "solana" || family === "cosmos" ? family : "evm",
      bridgeFeeBps: Math.max(0, Math.min(500, Number(bridgeFeeBps ?? 15))),
      swapFeeBps:   Math.max(0, Math.min(500, Number(swapFeeBps ?? 30))),
      estGasUsd:    String(Math.max(0, Number(estGasUsd ?? 0.5))),
    }).returning();
    await logAdminAction(req, { action: "web3.network.create", entity: "web3_network", entityId: row.id, payload: { chainKey } });
    res.status(201).json(row);
  } catch (e: any) {
    if (String(e.message || "").includes("duplicate")) { res.status(409).json({ error: "chainKey already exists" }); return; }
    throw e;
  }
});

router.patch("/admin/web3/networks/:id", ...ADMIN, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const allowed = ["displayName","rpcUrl","explorerUrl","logoUrl","status","bridgeFeeBps","swapFeeBps","estGasUsd"];
  const patch: any = {};
  for (const k of allowed) {
    if (req.body?.[k] !== undefined) {
      if (k === "bridgeFeeBps" || k === "swapFeeBps") patch[k] = Math.max(0, Math.min(500, Number(req.body[k])));
      else if (k === "estGasUsd") patch[k] = String(Math.max(0, Number(req.body[k])));
      else if (k === "status" && !["active","maintenance","disabled"].includes(req.body[k])) {
        res.status(400).json({ error: "bad status" }); return;
      } else patch[k] = req.body[k];
    }
  }
  if (!Object.keys(patch).length) { res.status(400).json({ error: "nothing to update" }); return; }
  const [row] = await db.update(web3NetworksTable).set(patch).where(eq(web3NetworksTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "not found" }); return; }
  await logAdminAction(req, { action: "web3.network.update", entity: "web3_network", entityId: id, payload: patch });
  res.json(row);
});

router.delete("/admin/web3/networks/:id", ...ADMIN, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const tokens = await db.select({ id: web3TokensTable.id }).from(web3TokensTable).where(eq(web3TokensTable.networkId, id)).limit(1);
  if (tokens.length) { res.status(400).json({ error: "cannot delete — tokens are listed on this network; delist them first" }); return; }
  await db.delete(web3NetworksTable).where(eq(web3NetworksTable.id, id));
  await logAdminAction(req, { action: "web3.network.delete", entity: "web3_network", entityId: id });
  res.json({ ok: true });
});

// ── Tokens ───────────────────────────────────────────────────────────────────
router.get("/admin/web3/tokens", ...ADMIN, async (req, res): Promise<void> => {
  const networkId = Number(req.query.networkId ?? 0);
  const where = networkId ? eq(web3TokensTable.networkId, networkId) : undefined;
  const rows = where
    ? await db.select().from(web3TokensTable).where(where).orderBy(desc(web3TokensTable.isNative), asc(web3TokensTable.symbol))
    : await db.select().from(web3TokensTable).orderBy(desc(web3TokensTable.isNative), asc(web3TokensTable.symbol));
  res.json({ tokens: rows });
});

router.post("/admin/web3/tokens", ...ADMIN, async (req, res): Promise<void> => {
  const { networkId, symbol, name, contractAddress, decimals, isNative, priceCoinSymbol, logoUrl, isStablecoin } = req.body ?? {};
  if (!networkId || !symbol || !name || !priceCoinSymbol) {
    res.status(400).json({ error: "networkId, symbol, name, priceCoinSymbol required" });
    return;
  }
  try {
    const [row] = await db.insert(web3TokensTable).values({
      networkId: Number(networkId),
      symbol: String(symbol).toUpperCase(),
      name,
      contractAddress: isNative ? null : (contractAddress || null),
      decimals: Number(decimals ?? 18),
      isNative: !!isNative,
      priceCoinSymbol: String(priceCoinSymbol).toUpperCase(),
      logoUrl: logoUrl || null,
      isStablecoin: !!isStablecoin,
    }).returning();
    await logAdminAction(req, { action: "web3.token.create", entity: "web3_token", entityId: row.id, payload: { symbol, networkId } });
    res.status(201).json(row);
  } catch (e: any) {
    if (String(e.message || "").includes("duplicate")) { res.status(409).json({ error: "this token symbol already exists on the network" }); return; }
    throw e;
  }
});

router.patch("/admin/web3/tokens/:id", ...ADMIN, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const allowed = ["name","contractAddress","decimals","priceCoinSymbol","logoUrl","status","isStablecoin"];
  const patch: any = {};
  for (const k of allowed) {
    if (req.body?.[k] !== undefined) {
      if (k === "status" && !["active","disabled"].includes(req.body[k])) { res.status(400).json({ error: "bad status" }); return; }
      if (k === "priceCoinSymbol") patch[k] = String(req.body[k]).toUpperCase();
      else patch[k] = req.body[k];
    }
  }
  if (!Object.keys(patch).length) { res.status(400).json({ error: "nothing to update" }); return; }
  const [row] = await db.update(web3TokensTable).set(patch).where(eq(web3TokensTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "not found" }); return; }
  await logAdminAction(req, { action: "web3.token.update", entity: "web3_token", entityId: id, payload: patch });
  res.json(row);
});

router.delete("/admin/web3/tokens/:id", ...ADMIN, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  await db.delete(web3TokensTable).where(eq(web3TokensTable.id, id));
  await logAdminAction(req, { action: "web3.token.delete", entity: "web3_token", entityId: id });
  res.json({ ok: true });
});

export default router;
