/**
 * Trading Leagues — /api/leagues
 * Lists active competitions and serves a live leaderboard computed from trades.
 */
import { Router, type Request, type Response } from "express";
import { db, competitionsTable, tradesTable, usersTable } from "@workspace/db";
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router = Router();

// GET /api/leagues — list published competitions
router.get("/leagues", async (_req: Request, res: Response): Promise<void> => {
  const competitions = await db
    .select()
    .from(competitionsTable)
    .where(eq(competitionsTable.isPublished, true))
    .orderBy(desc(competitionsTable.isFeatured), desc(competitionsTable.startsAt));

  res.json(competitions.map((c) => ({
    id:          c.id,
    title:       c.title,
    subtitle:    c.subtitle,
    description: c.description,
    prizePool:   c.prizePool,
    prizeUnit:   c.prizeUnit,
    topPrize:    c.topPrize,
    rewardTiers: safeJson(c.rewardTiersJson, []),
    rules:       safeJson(c.rulesJson, []),
    scoringRule: c.scoringRule,
    heroIcon:    c.heroIcon,
    heroColor:   c.heroColor,
    joinUrl:     c.joinUrl,
    status:      c.status,
    isFeatured:  c.isFeatured,
    startsAt:    c.startsAt,
    endsAt:      c.endsAt,
  })));
});

// GET /api/leagues/:id/leaderboard — top 100 traders by volume in competition window
router.get("/leagues/:id/leaderboard", async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(String(req.params["id"] ?? ""), 10);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

  const [comp] = await db
    .select()
    .from(competitionsTable)
    .where(and(eq(competitionsTable.id, id), eq(competitionsTable.isPublished, true)))
    .limit(1);

  if (!comp) { res.status(404).json({ error: "Competition not found" }); return; }

  const where = buildTimeFilter(comp.startsAt, comp.endsAt);

  // Sum price*qty per user (use isTaker=1 to count each match once)
  const rows = await db
    .select({
      userId: tradesTable.userId,
      volume: sql<string>`SUM(${tradesTable.price} * ${tradesTable.qty})`.as("volume"),
      trades: sql<number>`COUNT(*)`.as("trades"),
    })
    .from(tradesTable)
    .where(where)
    .groupBy(tradesTable.userId)
    .orderBy(desc(sql`SUM(${tradesTable.price} * ${tradesTable.qty})`))
    .limit(100);

  if (!rows.length) {
    res.json({ competition: compSummary(comp), leaderboard: [] });
    return;
  }

  const userIds = rows.map((r) => r.userId);
  const users = await db
    .select({ id: usersTable.id, name: usersTable.name, uid: usersTable.uid })
    .from(usersTable)
    .where(sql`${usersTable.id} = ANY(ARRAY[${sql.join(userIds.map((id) => sql`${id}`), sql`, `)}]::int[])`);

  const byId = Object.fromEntries(users.map((u) => [u.id, u]));
  const tiers = safeJson<RewardTier[]>(comp.rewardTiersJson, []);

  const leaderboard = rows.map((r, i) => {
    const u = byId[r.userId];
    const name = u?.name ?? "Trader";
    const masked = name.length > 6
      ? `${name.slice(0, 4)}*****${name.slice(-2)}`
      : `${name.slice(0, 2)}*****`;
    return {
      rank:   i + 1,
      userId: r.userId,
      name:   masked,
      uid:    u?.uid ?? "",
      volume: Number(r.volume ?? 0).toFixed(2),
      trades: Number(r.trades ?? 0),
      prize:  prizeTierFor(i + 1, tiers),
    };
  });

  res.json({ competition: compSummary(comp), leaderboard });
});

// GET /api/leagues/:id/my-rank — logged-in user's rank in a competition
router.get("/leagues/:id/my-rank", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(String(req.params["id"] ?? ""), 10);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

  const [comp] = await db
    .select()
    .from(competitionsTable)
    .where(and(eq(competitionsTable.id, id), eq(competitionsTable.isPublished, true)))
    .limit(1);

  if (!comp) { res.status(404).json({ error: "Not found" }); return; }

  const userId = req.user!.id;
  const userFilter = eq(tradesTable.userId, userId);
  const timeFilter = buildTimeFilter(comp.startsAt, comp.endsAt);
  const combined = timeFilter ? and(userFilter, timeFilter) : userFilter;

  const [myStats] = await db
    .select({
      volume: sql<string>`SUM(${tradesTable.price} * ${tradesTable.qty})`,
      trades: sql<number>`COUNT(*)`,
    })
    .from(tradesTable)
    .where(combined);

  const myVolume = Number(myStats?.volume ?? 0);

  // Count users with more volume = (my rank) - 1
  const aheadWhere = buildTimeFilter(comp.startsAt, comp.endsAt);
  const aheadSub = db
    .select({
      userId: tradesTable.userId,
      vol:    sql<string>`SUM(${tradesTable.price} * ${tradesTable.qty})`.as("vol"),
    })
    .from(tradesTable)
    .where(aheadWhere)
    .groupBy(tradesTable.userId)
    .having(sql`SUM(${tradesTable.price} * ${tradesTable.qty}) > ${myVolume}`)
    .as("sub");

  const [{ ahead }] = await db
    .select({ ahead: sql<number>`COUNT(*)` })
    .from(aheadSub);

  const rank = Number(ahead ?? 0) + 1;
  const tiers = safeJson<RewardTier[]>(comp.rewardTiersJson, []);

  res.json({
    rank,
    volume: myVolume.toFixed(2),
    trades: Number(myStats?.trades ?? 0),
    prize:  prizeTierFor(rank, tiers),
  });
});

// ── Helpers ────────────────────────────────────────────────────────────────────

type CompRow = typeof competitionsTable.$inferSelect;
type RewardTier = { rank: string; prize: string; extra?: string; tone?: string };

function buildTimeFilter(startsAt: Date | null, endsAt: Date | null) {
  const parts = [];
  if (startsAt) parts.push(gte(tradesTable.createdAt, startsAt));
  if (endsAt)   parts.push(lte(tradesTable.createdAt, endsAt));
  if (parts.length === 0) return undefined;
  if (parts.length === 1) return parts[0];
  return and(...(parts as [ReturnType<typeof gte>, ReturnType<typeof lte>]));
}

function safeJson<T>(raw: string, fallback: T): T {
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

function prizeTierFor(rank: number, tiers: RewardTier[]): string {
  for (const t of tiers) {
    const rStr = t.rank ?? "";
    const single = parseInt(rStr, 10);
    if (!isNaN(single) && rank === single) return t.prize ?? "";
    const m = rStr.match(/(\d+)[–\-](\d+)/);
    if (m && rank >= parseInt(m[1]!, 10) && rank <= parseInt(m[2]!, 10)) return t.prize ?? "";
  }
  return "";
}

function compSummary(c: CompRow) {
  return {
    id:          c.id,
    title:       c.title,
    subtitle:    c.subtitle,
    prizePool:   c.prizePool,
    prizeUnit:   c.prizeUnit,
    status:      c.status,
    scoringRule: c.scoringRule,
    startsAt:    c.startsAt,
    endsAt:      c.endsAt,
  };
}

export default router;
