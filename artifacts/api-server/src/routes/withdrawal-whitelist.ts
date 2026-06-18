import { Router } from "express";
import { eq, and, desc, or, isNull } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  withdrawalWhitelistTable, coinsTable, networksTable,
  settingsTable, usersTable,
} from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/auth";

const adminOnly = requireRole("admin", "superadmin");

const r = Router();
const WHITELIST_COOLDOWN_MS = 3 * 60 * 60 * 1000; // 3 hours

// ─── User: list their whitelist ────────────────────────────────────────────
r.get("/finance/whitelist", requireAuth, async (req: any, res): Promise<void> => {
  const userId = req.user.id;
  const rows = await db
    .select({
      id: withdrawalWhitelistTable.id,
      uid: withdrawalWhitelistTable.uid,
      address: withdrawalWhitelistTable.address,
      memo: withdrawalWhitelistTable.memo,
      label: withdrawalWhitelistTable.label,
      unlocksAt: withdrawalWhitelistTable.unlocksAt,
      createdAt: withdrawalWhitelistTable.createdAt,
      coinId: withdrawalWhitelistTable.coinId,
      networkId: withdrawalWhitelistTable.networkId,
      coinSymbol: coinsTable.symbol,
      networkChain: networksTable.chain,
    })
    .from(withdrawalWhitelistTable)
    .leftJoin(coinsTable, eq(coinsTable.id, withdrawalWhitelistTable.coinId))
    .leftJoin(networksTable, eq(networksTable.id, withdrawalWhitelistTable.networkId))
    .where(eq(withdrawalWhitelistTable.userId, userId))
    .orderBy(desc(withdrawalWhitelistTable.createdAt));

  const now = new Date();
  res.json(rows.map(r => ({
    ...r,
    locked: r.unlocksAt > now,
    unlocksInMs: Math.max(0, r.unlocksAt.getTime() - now.getTime()),
  })));
});

// ─── User: add address to whitelist ────────────────────────────────────────
r.post("/finance/whitelist", requireAuth, async (req: any, res): Promise<void> => {
  const userId = req.user.id;
  const { address, label, coinSymbol, networkChain, memo } = req.body ?? {};

  if (!address || !label) {
    res.status(400).json({ message: "address and label are required" }); return;
  }
  const addr = String(address).trim();
  if (addr.length < 8 || addr.length > 128) {
    res.status(400).json({ message: "Invalid address format" }); return;
  }

  let coinId: number | null = null;
  let networkId: number | null = null;

  if (coinSymbol) {
    const [coin] = await db.select().from(coinsTable).where(eq(coinsTable.symbol, String(coinSymbol).toUpperCase())).limit(1);
    if (!coin) { res.status(404).json({ message: "Coin not found" }); return; }
    coinId = coin.id;

    if (networkChain) {
      const [net] = await db.select().from(networksTable).where(
        and(eq(networksTable.coinId, coin.id), eq(networksTable.chain, String(networkChain).toUpperCase()))
      ).limit(1);
      if (net) networkId = net.id;
    }
  }

  const unlocksAt = new Date(Date.now() + WHITELIST_COOLDOWN_MS);

  try {
    const [entry] = await db.insert(withdrawalWhitelistTable).values({
      userId,
      address: addr,
      memo: memo ? String(memo).trim() : null,
      label: String(label).trim(),
      coinId,
      networkId,
      unlocksAt,
    }).returning();

    res.status(201).json({
      ...entry,
      locked: true,
      unlocksInMs: WHITELIST_COOLDOWN_MS,
      message: "Address added. You can withdraw to this address after the 3-hour security window.",
    });
  } catch (e: any) {
    if (e?.constraint?.includes("user_addr_net")) {
      res.status(409).json({ message: "This address is already in your whitelist for this network" }); return;
    }
    throw e;
  }
});

// ─── User: remove address from whitelist ───────────────────────────────────
r.delete("/finance/whitelist/:id", requireAuth, async (req: any, res): Promise<void> => {
  const userId = req.user.id;
  const id = Number(req.params.id);
  const deleted = await db.delete(withdrawalWhitelistTable)
    .where(and(eq(withdrawalWhitelistTable.id, id), eq(withdrawalWhitelistTable.userId, userId)))
    .returning();
  if (deleted.length === 0) { res.status(404).json({ message: "Not found" }); return; }
  res.json({ message: "Removed from whitelist" });
});

// ─── Admin: get auto-approve settings ─────────────────────────────────────
r.get("/admin/withdraw/auto-approve", adminOnly, async (_req, res): Promise<void> => {
  const keys = ["withdraw.whitelist_required", "withdraw.auto_approve.enabled", "withdraw.auto_approve.max_amount", "withdraw.lock_hours_on_pw_change", "withdraw.whitelist_cooldown_hours"];
  const rows = await db.select().from(settingsTable).where(or(...keys.map(k => eq(settingsTable.key, k))));
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;
  res.json({
    whitelistRequired: map["withdraw.whitelist_required"] === "true",
    autoApproveEnabled: map["withdraw.auto_approve.enabled"] === "true",
    autoApproveMaxAmount: Number(map["withdraw.auto_approve.max_amount"] ?? "0"),
    lockHoursOnPwChange: Number(map["withdraw.lock_hours_on_pw_change"] ?? "24"),
    whitelistCooldownHours: Number(map["withdraw.whitelist_cooldown_hours"] ?? "3"),
  });
});

// ─── Admin: update auto-approve settings ──────────────────────────────────
r.put("/admin/withdraw/auto-approve", adminOnly, async (req: any, res): Promise<void> => {
  const { whitelistRequired, autoApproveEnabled, autoApproveMaxAmount, lockHoursOnPwChange, whitelistCooldownHours } = req.body ?? {};

  const upsert = async (key: string, value: string) => {
    await db.insert(settingsTable).values({ key, value }).onConflictDoUpdate({
      target: settingsTable.key,
      set: { value, updatedAt: new Date() },
    });
  };

  if (whitelistRequired !== undefined) await upsert("withdraw.whitelist_required", String(Boolean(whitelistRequired)));
  if (autoApproveEnabled !== undefined) await upsert("withdraw.auto_approve.enabled", String(Boolean(autoApproveEnabled)));
  if (autoApproveMaxAmount !== undefined) await upsert("withdraw.auto_approve.max_amount", String(Number(autoApproveMaxAmount)));
  if (lockHoursOnPwChange !== undefined) await upsert("withdraw.lock_hours_on_pw_change", String(Number(lockHoursOnPwChange)));
  if (whitelistCooldownHours !== undefined) await upsert("withdraw.whitelist_cooldown_hours", String(Number(whitelistCooldownHours)));

  res.json({ message: "Saved" });
});

// ─── Exported helpers consumed by bicrypto.ts withdraw route ───────────────
export async function getWithdrawSecuritySettings() {
  const keys = ["withdraw.whitelist_required", "withdraw.auto_approve.enabled", "withdraw.auto_approve.max_amount", "withdraw.lock_hours_on_pw_change"];
  const rows = await db.select().from(settingsTable).where(or(...keys.map(k => eq(settingsTable.key, k))));
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;
  return {
    whitelistRequired: map["withdraw.whitelist_required"] === "true",
    autoApproveEnabled: map["withdraw.auto_approve.enabled"] === "true",
    autoApproveMaxAmount: Number(map["withdraw.auto_approve.max_amount"] ?? "0"),
    lockHoursOnPwChange: Number(map["withdraw.lock_hours_on_pw_change"] ?? "24"),
  };
}

export async function checkWhitelistForWithdraw(userId: number, address: string, coinId: number, networkId: number): Promise<{ allowed: boolean; locked: boolean; message?: string }> {
  const entries = await db.select().from(withdrawalWhitelistTable)
    .where(and(
      eq(withdrawalWhitelistTable.userId, userId),
      eq(withdrawalWhitelistTable.address, address),
    ));

  if (entries.length === 0) return { allowed: false, locked: false, message: "Address not in whitelist. Add it and wait 3 hours before withdrawing." };

  const match = entries.find(e => {
    const coinOk = e.coinId === null || e.coinId === coinId;
    const netOk = e.networkId === null || e.networkId === networkId;
    return coinOk && netOk;
  });

  if (!match) return { allowed: false, locked: false, message: "Address not whitelisted for this coin/network." };
  if (match.unlocksAt > new Date()) {
    const minLeft = Math.ceil((match.unlocksAt.getTime() - Date.now()) / 60000);
    return { allowed: false, locked: true, message: `Address is in cooling period. Available in ${minLeft} minute${minLeft !== 1 ? "s" : ""}.` };
  }

  return { allowed: true, locked: false };
}

// ─── User: security status (withdraw lock + whitelist summary) ─────────────
r.get("/finance/security-status", requireAuth, async (req: any, res): Promise<void> => {
  const userId = req.user.id;
  const [user] = await db.select({
    withdrawLockUntil: usersTable.withdrawLockUntil,
  }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);

  const settings = await getWithdrawSecuritySettings();
  const whitelist = await db.select({
    id: withdrawalWhitelistTable.id,
    address: withdrawalWhitelistTable.address,
    label: withdrawalWhitelistTable.label,
    unlocksAt: withdrawalWhitelistTable.unlocksAt,
    coinId: withdrawalWhitelistTable.coinId,
    networkId: withdrawalWhitelistTable.networkId,
    coinSymbol: coinsTable.symbol,
    networkChain: networksTable.chain,
  }).from(withdrawalWhitelistTable)
    .leftJoin(coinsTable, eq(coinsTable.id, withdrawalWhitelistTable.coinId))
    .leftJoin(networksTable, eq(networksTable.id, withdrawalWhitelistTable.networkId))
    .where(eq(withdrawalWhitelistTable.userId, userId));

  const now = new Date();
  res.json({
    withdrawLockedUntil: user?.withdrawLockUntil ?? null,
    withdrawLocked: !!(user?.withdrawLockUntil && user.withdrawLockUntil > now),
    whitelistRequired: settings.whitelistRequired,
    whitelist: whitelist.map(w => ({
      ...w,
      locked: w.unlocksAt > now,
      unlocksInMs: Math.max(0, w.unlocksAt.getTime() - now.getTime()),
    })),
  });
});

export default r;
