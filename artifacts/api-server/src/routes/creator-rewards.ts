import { Router, type IRouter } from "express";
import { db, usersTable, creatorSubmissionsTable, creatorRewardSettingsTable, walletsTable, walletLedgerTable, coinsTable } from "@workspace/db";
import { eq, desc, count, sum, and, sql, ilike, or } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { z } from "zod/v4";
import { logAdminAction } from "../lib/audit";

const router: IRouter = Router();
const requireAdmin = requireRole("admin", "superadmin", "marketing");

// ── Helpers ────────────────────────────────────────────────────────────────────
async function getSettings() {
  const [row] = await db.select().from(creatorRewardSettingsTable).limit(1);
  if (row) return row;
  // Auto-seed defaults on first access
  const [created] = await db.insert(creatorRewardSettingsTable).values({}).returning();
  return created;
}

// ── Public / user routes ───────────────────────────────────────────────────────

/**
 * POST /creator-rewards/submit
 * Authenticated user submits a new video for review.
 */
router.post("/creator-rewards/submit", requireAuth, async (req, res): Promise<void> => {
  const schema = z.object({
    platform:    z.string().min(1).max(32),
    videoUrl:    z.string().url(),
    title:       z.string().min(3).max(200),
    description: z.string().min(20).max(1000),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid fields", issues: parsed.error.issues }); return; }

  const userId = (req as any).user?.id;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const settings = await getSettings();
  if (!settings.programEnabled) { res.status(403).json({ error: "Creator Rewards program is currently disabled." }); return; }

  // Duplicate URL check
  const [existing] = await db.select({ id: creatorSubmissionsTable.id })
    .from(creatorSubmissionsTable)
    .where(eq(creatorSubmissionsTable.videoUrl, parsed.data.videoUrl))
    .limit(1);
  if (existing) { res.status(409).json({ error: "This video URL has already been submitted." }); return; }

  // Per-user submission cap
  const [{ total }] = await db.select({ total: count() })
    .from(creatorSubmissionsTable)
    .where(eq(creatorSubmissionsTable.userId, userId));
  if (Number(total) >= Number(settings.maxSubmissionsPerUser)) {
    res.status(429).json({ error: `Maximum ${settings.maxSubmissionsPerUser} submissions per account.` }); return;
  }

  const status = settings.autoApprove ? "approved" : "pending";
  const baseReward = settings.autoApprove ? String(settings.baseRewardUsdt) : "0";

  const [submission] = await db.insert(creatorSubmissionsTable).values({
    userId,
    platform:    parsed.data.platform,
    videoUrl:    parsed.data.videoUrl,
    title:       parsed.data.title,
    description: parsed.data.description,
    status,
    baseReward,
    rewardPaid:  false,
  }).returning();

  req.log.info({ submissionId: submission.id, userId }, "creator submission created");
  res.status(201).json(submission);
});

/**
 * GET /creator-rewards/submissions
 * Returns the authenticated user's own submissions.
 */
router.get("/creator-rewards/submissions", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).user?.id;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const rows = await db.select().from(creatorSubmissionsTable)
    .where(eq(creatorSubmissionsTable.userId, userId))
    .orderBy(desc(creatorSubmissionsTable.createdAt))
    .limit(50);

  res.json(rows.map((r) => ({
    id:        r.id,
    platform:  r.platform,
    videoUrl:  r.videoUrl,
    title:     r.title,
    views:     r.views,
    status:    r.status,
    reward:    Number(r.baseReward) + Number(r.bonusPaid),
    createdAt: r.createdAt,
  })));
});

/**
 * GET /creator-rewards/settings (public read)
 * Returns the program configuration (reward amounts, enabled flag).
 */
router.get("/creator-rewards/settings", async (_req, res): Promise<void> => {
  const s = await getSettings();
  res.json({
    programEnabled:       s.programEnabled,
    baseRewardUsdt:       Number(s.baseRewardUsdt),
    referralRewardUsdt:   Number(s.referralRewardUsdt),
    bonus1kUsdt:          Number(s.bonus1kUsdt),
    bonus100kUsdt:        Number(s.bonus100kUsdt),
    bonus1mUsdt:          Number(s.bonus1mUsdt),
    minVideoDurationSec:  s.minVideoDurationSec,
    maxSubmissionsPerUser: s.maxSubmissionsPerUser,
  });
});

/**
 * GET /creator-rewards/leaderboard (public)
 * Top creators by total USDT earned. Usernames are partially masked for privacy.
 */
function maskName(name: string): string {
  const clean = name.trim();
  if (!clean) return "User**";
  const half = Math.max(2, Math.ceil(clean.length * 0.5));
  return clean.slice(0, half) + "**";
}

router.get("/creator-rewards/leaderboard", async (req, res): Promise<void> => {
  const limit = Math.min(20, Number(req.query.limit) || 10);
  const rows = await db
    .select({
      userId:       creatorSubmissionsTable.userId,
      username:     usersTable.name,
      email:        usersTable.email,
      videos:       count(creatorSubmissionsTable.id),
      totalViews:   sum(creatorSubmissionsTable.views),
      totalRewards: sql<number>`SUM(${creatorSubmissionsTable.baseReward}::numeric + ${creatorSubmissionsTable.bonusPaid}::numeric)`,
    })
    .from(creatorSubmissionsTable)
    .leftJoin(usersTable, eq(creatorSubmissionsTable.userId, usersTable.id))
    .where(eq(creatorSubmissionsTable.status, "approved"))
    .groupBy(creatorSubmissionsTable.userId, usersTable.name, usersTable.email)
    .orderBy(desc(sql`SUM(${creatorSubmissionsTable.baseReward}::numeric + ${creatorSubmissionsTable.bonusPaid}::numeric)`))
    .limit(limit);

  res.json(rows.map((r, i) => ({
    rank:         i + 1,
    username:     maskName(r.username || r.email?.split("@")[0] || "User"),
    videos:       Number(r.videos),
    totalViews:   Number(r.totalViews) || 0,
    totalRewards: Number(r.totalRewards) || 0,
  })));
});

// ── Admin routes ───────────────────────────────────────────────────────────────

/**
 * GET /admin/creator-rewards/stats
 */
router.get("/admin/creator-rewards/stats", requireAdmin, async (_req, res): Promise<void> => {
  const [totals] = await db.select({
    total:    count(),
    approved: count(sql`CASE WHEN ${creatorSubmissionsTable.status} = 'approved' THEN 1 END`),
    pending:  count(sql`CASE WHEN ${creatorSubmissionsTable.status} = 'pending'  THEN 1 END`),
    reviewing:count(sql`CASE WHEN ${creatorSubmissionsTable.status} = 'reviewing' THEN 1 END`),
    rejected: count(sql`CASE WHEN ${creatorSubmissionsTable.status} = 'rejected' THEN 1 END`),
    totalRewards: sum(creatorSubmissionsTable.baseReward),
    totalBonus:   sum(creatorSubmissionsTable.bonusPaid),
    totalViews:   sum(creatorSubmissionsTable.views),
  }).from(creatorSubmissionsTable);

  res.json({
    total:        Number(totals.total),
    approved:     Number(totals.approved),
    pending:      Number(totals.pending),
    reviewing:    Number(totals.reviewing),
    rejected:     Number(totals.rejected),
    totalRewards: Number(totals.totalRewards ?? 0) + Number(totals.totalBonus ?? 0),
    totalViews:   Number(totals.totalViews ?? 0),
  });
});

/**
 * GET /admin/creator-rewards/submissions
 * Paginated list with optional filters.
 */
router.get("/admin/creator-rewards/submissions", requireAdmin, async (req, res): Promise<void> => {
  const page   = Math.max(1, Number(req.query.page) || 1);
  const limit  = Math.min(100, Math.max(10, Number(req.query.limit) || 25));
  const status = req.query.status as string | undefined;
  const search = req.query.search as string | undefined;

  const where = and(
    status && status !== "all" ? eq(creatorSubmissionsTable.status, status) : undefined,
    search ? ilike(creatorSubmissionsTable.title, `%${search}%`) : undefined,
  );

  const [{ total }] = await db.select({ total: count() })
    .from(creatorSubmissionsTable)
    .where(where);

  const rows = await db
    .select({
      id:          creatorSubmissionsTable.id,
      userId:      creatorSubmissionsTable.userId,
      platform:    creatorSubmissionsTable.platform,
      videoUrl:    creatorSubmissionsTable.videoUrl,
      title:       creatorSubmissionsTable.title,
      description: creatorSubmissionsTable.description,
      screenshotUrl: creatorSubmissionsTable.screenshotUrl,
      views:       creatorSubmissionsTable.views,
      status:      creatorSubmissionsTable.status,
      reviewNote:  creatorSubmissionsTable.reviewNote,
      baseReward:  creatorSubmissionsTable.baseReward,
      bonusPaid:   creatorSubmissionsTable.bonusPaid,
      rewardPaid:  creatorSubmissionsTable.rewardPaid,
      reviewedAt:  creatorSubmissionsTable.reviewedAt,
      createdAt:   creatorSubmissionsTable.createdAt,
      username:    usersTable.name,
      email:       usersTable.email,
    })
    .from(creatorSubmissionsTable)
    .leftJoin(usersTable, eq(creatorSubmissionsTable.userId, usersTable.id))
    .where(where)
    .orderBy(desc(creatorSubmissionsTable.createdAt))
    .limit(limit)
    .offset((page - 1) * limit);

  res.json({
    data:  rows,
    total: Number(total),
    page,
    pages: Math.ceil(Number(total) / limit),
  });
});

/**
 * PATCH /admin/creator-rewards/submissions/:id/status
 * Approve or reject a submission. Optionally update views.
 */
router.patch("/admin/creator-rewards/submissions/:id/status", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

  const schema = z.object({
    status:     z.enum(["pending", "reviewing", "approved", "rejected"]),
    reviewNote: z.string().max(500).optional(),
    views:      z.number().int().min(0).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid fields" }); return; }

  const adminId = (req as any).user?.id;
  const settings = await getSettings();

  const updates: Record<string, unknown> = {
    status:    parsed.data.status,
    reviewNote: parsed.data.reviewNote ?? null,
    reviewedBy: adminId,
    reviewedAt: new Date(),
  };

  if (parsed.data.views !== undefined) updates.views = parsed.data.views;

  if (parsed.data.status === "approved") {
    updates.baseReward = settings.baseRewardUsdt;
    updates.rewardPaid = true;
  }

  const [updated] = await db.update(creatorSubmissionsTable)
    .set(updates)
    .where(eq(creatorSubmissionsTable.id, id))
    .returning();

  if (!updated) { res.status(404).json({ error: "Submission not found" }); return; }

  // ── Credit user's spot wallet when approved ───────────────────────────────
  if (parsed.data.status === "approved") {
    const rewardAmt = Number(settings.baseRewardUsdt);
    try {
      const [usdtCoin] = await db
        .select({ id: coinsTable.id })
        .from(coinsTable)
        .where(eq(coinsTable.symbol, "USDT"))
        .limit(1);

      if (usdtCoin && rewardAmt > 0) {
        const [walletRow] = await db
          .insert(walletsTable)
          .values({
            userId:     updated.userId,
            coinId:     usdtCoin.id,
            walletType: "spot",
            balance:    String(rewardAmt),
            locked:     "0",
          })
          .onConflictDoUpdate({
            target: [walletsTable.userId, walletsTable.walletType, walletsTable.coinId],
            set: {
              balance:   sql`${walletsTable.balance} + ${rewardAmt}`,
              updatedAt: new Date(),
            },
          })
          .returning({ balance: walletsTable.balance });

        if (walletRow) {
          const balanceAfter  = walletRow.balance;
          const balanceBefore = String(Math.max(0, parseFloat(balanceAfter) - rewardAmt));
          await db.insert(walletLedgerTable).values({
            userId:        updated.userId,
            coinId:        usdtCoin.id,
            walletType:    "spot",
            type:          "video_reward",
            amount:        String(rewardAmt),
            balanceBefore,
            balanceAfter,
            refType:       "creator_submission",
            refId:         String(updated.id),
            note:          `Creator Reward — video approved (${updated.platform}: ${updated.title})`,
          }).catch(() => null);
        }

        req.log.info(
          { submissionId: updated.id, userId: updated.userId, reward: rewardAmt },
          "creator-reward: video_reward credited to spot wallet",
        );
      }
    } catch (err) {
      req.log.warn({ err, submissionId: updated.id }, "creator-reward: wallet credit failed (non-critical)");
    }
  }

  await logAdminAction(req, {
    action: "creator_submission.status",
    entity: "creator_submission",
    entityId: id,
    payload: { newStatus: parsed.data.status },
  });

  res.json(updated);
});

/**
 * PATCH /admin/creator-rewards/submissions/:id/views
 * Update view count for a submission (triggers bonus evaluation).
 */
router.patch("/admin/creator-rewards/submissions/:id/views", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const schema = z.object({ views: z.number().int().min(0) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success || !id) { res.status(400).json({ error: "Invalid" }); return; }

  const [sub] = await db.select().from(creatorSubmissionsTable)
    .where(eq(creatorSubmissionsTable.id, id)).limit(1);
  if (!sub) { res.status(404).json({ error: "Not found" }); return; }

  const settings = await getSettings();
  const newViews = parsed.data.views;
  const oldViews = sub.views;
  let bonusIncrease = 0;

  // Award milestone bonuses only once (based on view threshold crossing)
  const milestones = [
    { threshold: 1_000_000, bonus: Number(settings.bonus1mUsdt) },
    { threshold: 100_000,   bonus: Number(settings.bonus100kUsdt) },
    { threshold: 1_000,     bonus: Number(settings.bonus1kUsdt) },
  ];
  for (const m of milestones) {
    if (oldViews < m.threshold && newViews >= m.threshold) {
      bonusIncrease += m.bonus;
    }
  }

  const newBonus = Number(sub.bonusPaid) + bonusIncrease;
  const [updated] = await db.update(creatorSubmissionsTable)
    .set({ views: newViews, bonusPaid: String(newBonus) })
    .where(eq(creatorSubmissionsTable.id, id))
    .returning();

  res.json({ ...updated, bonusAdded: bonusIncrease });
});

/**
 * DELETE /admin/creator-rewards/submissions/:id
 * Hard-delete a submission (superadmin only).
 */
router.delete("/admin/creator-rewards/submissions/:id", requireRole("superadmin"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(creatorSubmissionsTable).where(eq(creatorSubmissionsTable.id, id));
  res.json({ ok: true });
});

/**
 * GET /admin/creator-rewards/leaderboard
 * Top creators by total reward earned, optionally filtered by month.
 */
router.get("/admin/creator-rewards/leaderboard", requireAdmin, async (req, res): Promise<void> => {
  const limit = Math.min(50, Number(req.query.limit) || 10);
  const rows = await db
    .select({
      userId:       creatorSubmissionsTable.userId,
      username:     usersTable.name,
      email:        usersTable.email,
      videos:       count(creatorSubmissionsTable.id),
      totalViews:   sum(creatorSubmissionsTable.views),
      totalRewards: sql<number>`SUM(${creatorSubmissionsTable.baseReward}::numeric + ${creatorSubmissionsTable.bonusPaid}::numeric)`,
    })
    .from(creatorSubmissionsTable)
    .leftJoin(usersTable, eq(creatorSubmissionsTable.userId, usersTable.id))
    .where(eq(creatorSubmissionsTable.status, "approved"))
    .groupBy(creatorSubmissionsTable.userId, usersTable.name, usersTable.email)
    .orderBy(desc(sql`SUM(${creatorSubmissionsTable.baseReward}::numeric + ${creatorSubmissionsTable.bonusPaid}::numeric)`))
    .limit(limit);

  res.json(rows.map((r, i) => ({
    rank:         i + 1,
    userId:       r.userId,
    username:     r.username ?? "—",
    email:        r.email ?? "—",
    videos:       Number(r.videos),
    totalViews:   Number(r.totalViews ?? 0),
    totalRewards: Number(r.totalRewards ?? 0),
  })));
});

/**
 * GET /admin/creator-rewards/settings
 * Returns full program settings for admin editing.
 */
router.get("/admin/creator-rewards/settings", requireAdmin, async (_req, res): Promise<void> => {
  res.json(await getSettings());
});

/**
 * PUT /admin/creator-rewards/settings
 * Update program settings.
 */
router.put("/admin/creator-rewards/settings", requireAdmin, async (req, res): Promise<void> => {
  const schema = z.object({
    programEnabled:       z.boolean().optional(),
    baseRewardUsdt:       z.number().min(0).max(10000).optional(),
    referralRewardUsdt:   z.number().min(0).max(10000).optional(),
    bonus1kUsdt:          z.number().min(0).max(10000).optional(),
    bonus100kUsdt:        z.number().min(0).max(10000).optional(),
    bonus1mUsdt:          z.number().min(0).max(100000).optional(),
    minVideoDurationSec:  z.number().int().min(5).max(600).optional(),
    maxSubmissionsPerUser: z.number().int().min(1).max(1000).optional(),
    autoApprove:          z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid fields", issues: parsed.error.issues }); return; }

  const updates: Record<string, unknown> = {};
  if (parsed.data.programEnabled       !== undefined) updates.programEnabled       = parsed.data.programEnabled;
  if (parsed.data.baseRewardUsdt       !== undefined) updates.baseRewardUsdt       = String(parsed.data.baseRewardUsdt);
  if (parsed.data.referralRewardUsdt   !== undefined) updates.referralRewardUsdt   = String(parsed.data.referralRewardUsdt);
  if (parsed.data.bonus1kUsdt          !== undefined) updates.bonus1kUsdt          = String(parsed.data.bonus1kUsdt);
  if (parsed.data.bonus100kUsdt        !== undefined) updates.bonus100kUsdt        = String(parsed.data.bonus100kUsdt);
  if (parsed.data.bonus1mUsdt          !== undefined) updates.bonus1mUsdt          = String(parsed.data.bonus1mUsdt);
  if (parsed.data.minVideoDurationSec  !== undefined) updates.minVideoDurationSec  = parsed.data.minVideoDurationSec;
  if (parsed.data.maxSubmissionsPerUser !== undefined) updates.maxSubmissionsPerUser = parsed.data.maxSubmissionsPerUser;
  if (parsed.data.autoApprove          !== undefined) updates.autoApprove          = parsed.data.autoApprove;

  const existing = await getSettings();
  const [updated] = await db.update(creatorRewardSettingsTable)
    .set(updates)
    .where(eq(creatorRewardSettingsTable.id, existing.id))
    .returning();

  const adminId = (req as any).user?.id;
  await logAdminAction(req, {
    action: "creator_rewards.settings_update",
    entity: "creator_reward_settings",
    payload: updates,
  });

  res.json(updated);
});

export default router;
