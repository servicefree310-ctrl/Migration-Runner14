import { Router, type IRouter } from "express";
import { db, referralsTable, usersTable } from "@workspace/db";
import { eq, desc, inArray } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { randomBytes } from "node:crypto";
import { loadReferralConfig, computeReferralTier } from "./admin-referrals";

const router: IRouter = Router();

function makeCode(name: string): string {
  const suffix = randomBytes(3).toString("hex").toUpperCase();
  return ((name || "USER").slice(0, 4).toUpperCase() + suffix).slice(0, 8);
}

router.get("/referrals", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  let code = user.referralCode;
  if (!code) {
    code = makeCode(user.name);
    let attempts = 0;
    while (attempts < 5) {
      const [conflict] = await db.select().from(usersTable).where(eq(usersTable.referralCode, code)).limit(1);
      if (!conflict) break;
      code = makeCode(user.name);
      attempts++;
    }
    await db.update(usersTable).set({ referralCode: code }).where(eq(usersTable.id, userId));
  }

  const allRows = await db.select().from(referralsTable).where(eq(referralsTable.referrerId, userId));

  const levels = [1, 2, 3, 4, 5].map(level => {
    const levelRows        = allRows.filter(r => r.level === level);
    const regRows          = levelRows.filter(r => r.sourceType === "registration");
    const aiRows           = levelRows.filter(r => r.sourceType === "ai_trading");
    const tradingFeeRows   = levelRows.filter(r => r.sourceType === "trading_fee");
    const earnRows         = levelRows.filter(r => r.sourceType === "earn_plan");
    const sumBonus = (rows: typeof levelRows) =>
      rows.reduce((s, r) => s + parseFloat(r.bonusAmount ?? "0"), 0);
    const regBonus        = sumBonus(regRows);
    const aiBonus         = sumBonus(aiRows);
    const tradingFeeBonus = sumBonus(tradingFeeRows);
    const earnBonus       = sumBonus(earnRows);
    return {
      level,
      referralCount:    regRows.length,
      regBonus:         parseFloat(regBonus.toFixed(4)),
      aiBonus:          parseFloat(aiBonus.toFixed(4)),
      tradingFeeBonus:  parseFloat(tradingFeeBonus.toFixed(4)),
      earnBonus:        parseFloat(earnBonus.toFixed(4)),
      total:            parseFloat((regBonus + aiBonus + tradingFeeBonus + earnBonus).toFixed(4)),
    };
  });

  const totalReferrals = levels.reduce((s, l) => s + l.referralCount, 0);
  const totalBonus     = allRows.reduce((s, r) => s + parseFloat(r.bonusAmount ?? "0"), 0);
  const origin = req.headers.origin ?? "https://zebvix.io";
  // Load admin-configurable referral rates — same source as the credit engine
  const config = await loadReferralConfig();
  const commissionRates = [1, 2, 3, 4, 5].map(level => ({
    level,
    // Registration bonus is only credited at L1 (direct referral on signup)
    regBonus:         level === 1 ? `${config.registrationBonus.toFixed(2)} USDT` : "—",
    aiPercent:        `${config.ai[String(level)]     ?? 0}%`,
    tradingFeePercent:`${config.trading[String(level)] ?? 0}%`,
    earnPercent:      `${config.earn[String(level)]   ?? 0}%`,
  }));

  res.json({
    referralCode:    code,
    referralLink:    `${origin}/signup?ref=${code}`,
    welcomeBonus:    config.registrationBonus.toFixed(2),
    totalReferrals,
    totalBonusUsdt:  parseFloat(totalBonus.toFixed(4)),
    levels,
    commissionRates,
    recentReferrals: allRows
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 50)
      .map(r => ({
        id:            r.id,
        level:         r.level,
        bonusAmount:   r.bonusAmount,
        bonusCredited: r.bonusCredited,
        sourceType:    r.sourceType,
        createdAt:     r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
      })),
  });
});

/**
 * GET /refer/stats
 * Rich stats used by the Referrals page — code, counts, tiers, earnings, recent invitees, commission history.
 */
router.get("/refer/stats", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;

  // Ensure referral code exists
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  let code = user.referralCode;
  if (!code) {
    code = makeCode(user.name);
    let attempts = 0;
    while (attempts < 5) {
      const [conflict] = await db.select().from(usersTable).where(eq(usersTable.referralCode, code)).limit(1);
      if (!conflict) break;
      code = makeCode(user.name);
      attempts++;
    }
    await db.update(usersTable).set({ referralCode: code }).where(eq(usersTable.id, userId));
  }

  // All referral rows for this user, newest first
  const allRows = await db.select().from(referralsTable)
    .where(eq(referralsTable.referrerId, userId))
    .orderBy(desc(referralsTable.createdAt));

  // Unique referred user IDs from level-1 registration rows
  const regRows = allRows.filter(r => r.level === 1 && r.sourceType === "registration");
  const referredUserIds = [...new Set(
    regRows.map(r => r.referredId).filter((id): id is number => id != null)
  )];

  // Fetch referred users to get name + kycLevel
  let recentUsers: Array<{ id: number; name: string; kycLevel: number; createdAt: string }> = [];
  if (referredUserIds.length > 0) {
    const userRows = await db
      .select({ id: usersTable.id, name: usersTable.name, kycLevel: usersTable.kycLevel, createdAt: usersTable.createdAt })
      .from(usersTable)
      .where(inArray(usersTable.id, referredUserIds));

    recentUsers = userRows
      .map(u => ({
        id: u.id,
        name: u.name || "",
        kycLevel: u.kycLevel ?? 0,
        createdAt: u.createdAt instanceof Date ? u.createdAt.toISOString() : (u.createdAt ?? new Date().toISOString()),
      }))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 20);
  }

  const referredCount    = referredUserIds.length;
  const referredKycCount = recentUsers.filter(u => u.kycLevel >= 1).length;

  // Earnings
  const estimatedEarnings = allRows.reduce((s, r) => s + parseFloat(r.bonusAmount ?? "0"), 0);
  const creditedEarnings  = allRows.filter(r => r.bonusCredited).reduce((s, r) => s + parseFloat(r.bonusAmount ?? "0"), 0);

  // Config: tiers + current tier
  const config      = await loadReferralConfig();
  const currentTier = computeReferralTier(referredKycCount, config.tiers);

  // Commission event rows (capped at 200)
  const commissions = allRows.slice(0, 200).map(r => ({
    id:            r.id,
    sourceType:    r.sourceType,
    sourceRefId:   null,
    bonusAmount:   r.bonusAmount,
    bonusCredited: r.bonusCredited,
    level:         r.level,
    referredId:    r.referredId ?? 0,
    createdAt:     r.createdAt instanceof Date ? r.createdAt.toISOString() : (r.createdAt ?? new Date().toISOString()),
  }));

  res.json({
    referralCode:       code,
    referredCount,
    referredKycCount,
    estimatedEarnings:  parseFloat(estimatedEarnings.toFixed(4)),
    creditedEarnings:   parseFloat(creditedEarnings.toFixed(4)),
    commissionPct:      currentTier.pct,
    tiers:              config.tiers,
    currentTierName:    currentTier.name,
    recent:             recentUsers,
    commissions,
  });
});

export default router;
