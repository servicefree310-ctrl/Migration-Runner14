import { Router, type Request, type Response, type IRouter } from "express";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { db, userApiKeysTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { logAdminAction } from "../lib/audit";
import {
  generateKeyId, generateSecret, encryptSecret,
  VALID_PERMISSIONS, type Permission,
} from "../lib/api-key-crypto";

const router: IRouter = Router();

// All routes here are SESSION-AUTH ONLY. We never let an HMAC-authenticated
// request manage API keys — that would let a compromised key mint new keys
// (privilege escalation) and bypass the "session = user-present" trust model.

// Per-user cap to prevent abuse; mirrors the "max 30 keys" most exchanges enforce.
const MAX_KEYS_PER_USER = 30;

const PermissionEnum = z.enum(VALID_PERMISSIONS);
const NameSchema = z.string().trim().min(1, "Name is required").max(60, "Name too long");
const IpWhitelistSchema = z
  .array(z.string().trim().min(1).max(64))
  .max(20, "Max 20 IPs per key")
  .optional();

const CreateKeySchema = z.object({
  name: NameSchema,
  permissions: z.array(PermissionEnum).min(1, "Pick at least one permission"),
  ipWhitelist: IpWhitelistSchema,
  expiresInDays: z.number().int().min(1).max(365).optional(),
});

const UpdateKeySchema = z.object({
  name: NameSchema.optional(),
  permissions: z.array(PermissionEnum).min(1).optional(),
  ipWhitelist: IpWhitelistSchema,
}).refine((v) => v.name !== undefined || v.permissions !== undefined || v.ipWhitelist !== undefined, {
  message: "Provide at least one field to update",
});

// Strip secrets before returning a key to the client. The `secret_encrypted`
// column holds the AES blob, which has no value to the user but could leak the
// IV + auth tag — don't ship it.
function publicShape(k: typeof userApiKeysTable.$inferSelect) {
  return {
    id: k.id,
    name: k.name,
    keyId: k.keyId,
    secretPreview: k.secretPreview,
    permissions: safeJsonArray<Permission>(k.permissions, []),
    ipWhitelist: safeJsonArray<string>(k.ipWhitelist, []),
    status: k.status,
    lastUsedAt: k.lastUsedAt,
    lastUsedIp: k.lastUsedIp,
    expiresAt: k.expiresAt,
    createdAt: k.createdAt,
    updatedAt: k.updatedAt,
  };
}

function safeJsonArray<T>(raw: string | null, fallback: T[]): T[] {
  if (!raw) return fallback;
  try { const v = JSON.parse(raw); return Array.isArray(v) ? (v as T[]) : fallback; }
  catch { return fallback; }
}

// ---------- LIST ----------
router.get("/account/api-keys", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const rows = await db
    .select()
    .from(userApiKeysTable)
    .where(eq(userApiKeysTable.userId, userId))
    .orderBy(desc(userApiKeysTable.createdAt));
  res.json({ keys: rows.map(publicShape) });
});

// ---------- CREATE ----------
//
// Returns the raw secret EXACTLY ONCE in the response. We never store it
// plaintext, so this is the user's only chance to copy it. The dashboard UI
// shows a one-time alert with copy buttons + a "save it now" warning.
router.post("/account/api-keys", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.id;

  const parsed = CreateKeySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
    return;
  }
  const { name, permissions, ipWhitelist, expiresInDays } = parsed.data;

  // Cap check — count active+disabled, exclude no rows since they're already deleted.
  const existing = await db
    .select({ id: userApiKeysTable.id })
    .from(userApiKeysTable)
    .where(eq(userApiKeysTable.userId, userId));
  if (existing.length >= MAX_KEYS_PER_USER) {
    res.status(409).json({ error: "key_limit_reached", hint: `Max ${MAX_KEYS_PER_USER} API keys per account. Delete an unused key first.` });
    return;
  }

  // Refuse withdraw permission unless the account has 2FA enabled. Mirrors the
  // ApiDocs guidance ("never enable withdraw permission unless you absolutely
  // need it; if you do, also require IP whitelist + 2FA"). We can't enforce
  // IP-whitelist requirement (legitimate cloud workloads often have rotating IPs)
  // but we CAN refuse withdraw without 2FA.
  if (permissions.includes("withdraw") && !req.user!.twoFaEnabled) {
    res.status(400).json({
      error: "withdraw_requires_2fa",
      hint: "Enable 2FA in Security settings before creating a key with withdraw permission.",
    });
    return;
  }

  const keyId = generateKeyId();
  const secret = generateSecret();
  const encrypted = encryptSecret(secret);
  const preview = secret.slice(-4);
  const expiresAt = expiresInDays ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000) : null;

  const [created] = await db
    .insert(userApiKeysTable)
    .values({
      userId,
      name,
      keyId,
      secretEncrypted: encrypted,
      secretPreview: preview,
      permissions: JSON.stringify(permissions),
      ipWhitelist: ipWhitelist && ipWhitelist.length > 0 ? JSON.stringify(ipWhitelist) : null,
      status: "active",
      expiresAt,
    })
    .returning();

  void logAdminAction(req, {
    action: "apikey.create",
    entity: "apikey",
    entityId: created.id,
    payload: { name, permissions, ipCount: ipWhitelist?.length ?? 0, expiresInDays: expiresInDays ?? null },
  });

  res.status(201).json({
    key: publicShape(created),
    // The raw secret travels back EXACTLY ONCE. Subsequent reads only see preview.
    secret,
  });
});

// ---------- UPDATE (name / permissions / IP whitelist) ----------
router.patch("/account/api-keys/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "invalid_id" }); return; }

  const parsed = UpdateKeySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
    return;
  }

  if (parsed.data.permissions?.includes("withdraw") && !req.user!.twoFaEnabled) {
    res.status(400).json({ error: "withdraw_requires_2fa", hint: "Enable 2FA before granting withdraw permission." });
    return;
  }

  const update: Partial<typeof userApiKeysTable.$inferInsert> = {};
  if (parsed.data.name !== undefined)        update.name = parsed.data.name;
  if (parsed.data.permissions !== undefined) update.permissions = JSON.stringify(parsed.data.permissions);
  if (parsed.data.ipWhitelist !== undefined) update.ipWhitelist = parsed.data.ipWhitelist.length > 0 ? JSON.stringify(parsed.data.ipWhitelist) : null;

  const [updated] = await db
    .update(userApiKeysTable)
    .set(update)
    .where(and(eq(userApiKeysTable.id, id), eq(userApiKeysTable.userId, userId)))
    .returning();

  if (!updated) { res.status(404).json({ error: "not_found" }); return; }

  void logAdminAction(req, {
    action: "apikey.update",
    entity: "apikey",
    entityId: updated.id,
    payload: { changed: Object.keys(parsed.data) },
  });

  res.json({ key: publicShape(updated) });
});

// ---------- DISABLE ----------
router.post("/account/api-keys/:id/disable", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "invalid_id" }); return; }

  const [updated] = await db
    .update(userApiKeysTable)
    .set({ status: "disabled" })
    .where(and(eq(userApiKeysTable.id, id), eq(userApiKeysTable.userId, userId)))
    .returning();
  if (!updated) { res.status(404).json({ error: "not_found" }); return; }

  void logAdminAction(req, { action: "apikey.disable", entity: "apikey", entityId: updated.id });
  res.json({ key: publicShape(updated) });
});

// ---------- ENABLE ----------
router.post("/account/api-keys/:id/enable", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "invalid_id" }); return; }

  const [updated] = await db
    .update(userApiKeysTable)
    .set({ status: "active" })
    .where(and(eq(userApiKeysTable.id, id), eq(userApiKeysTable.userId, userId)))
    .returning();
  if (!updated) { res.status(404).json({ error: "not_found" }); return; }

  void logAdminAction(req, { action: "apikey.enable", entity: "apikey", entityId: updated.id });
  res.json({ key: publicShape(updated) });
});

// ---------- DELETE ----------
router.delete("/account/api-keys/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "invalid_id" }); return; }

  const [deleted] = await db
    .delete(userApiKeysTable)
    .where(and(eq(userApiKeysTable.id, id), eq(userApiKeysTable.userId, userId)))
    .returning({ id: userApiKeysTable.id, name: userApiKeysTable.name, keyId: userApiKeysTable.keyId });
  if (!deleted) { res.status(404).json({ error: "not_found" }); return; }

  void logAdminAction(req, {
    action: "apikey.delete",
    entity: "apikey",
    entityId: deleted.id,
    payload: { name: deleted.name, keyId: deleted.keyId },
  });
  res.json({ ok: true });
});

export default router;
