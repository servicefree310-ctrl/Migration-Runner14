import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { getRedis, isRedisReady } from "../lib/redis";

const router: IRouter = Router();

/**
 * Liveness probe — answers "is the process alive?". Cheap and never touches
 * downstream services. Use this for the orchestrator's restart loop.
 */
router.get("/healthz", (_req, res) => {
  res.json({ status: "ok", ts: Date.now() });
});

/**
 * Readiness probe — answers "is this replica ready to serve traffic?".
 * Pings Postgres (cheap SELECT 1, ~1ms) and Redis (PING, ~1ms). If either
 * is unreachable we return HTTP 503 so a load balancer / deployment health
 * check can pull this instance out of rotation.
 *
 * Each check is bounded by a short timeout so a hung downstream can't make
 * /readyz itself hang indefinitely (which would blackhole the LB check).
 */
const PROBE_TIMEOUT_MS = 1500;

function withTimeout<T>(p: Promise<T>, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timeout`)), PROBE_TIMEOUT_MS);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

router.get("/readyz", async (_req, res) => {
  const checks: Record<string, { ok: boolean; ms?: number; error?: string }> = {};

  // ── Postgres ──
  {
    const t0 = Date.now();
    try {
      await withTimeout(db.execute(sql`select 1`), "db");
      checks.db = { ok: true, ms: Date.now() - t0 };
    } catch (e: any) {
      checks.db = { ok: false, ms: Date.now() - t0, error: String(e?.message || e) };
    }
  }

  // ── Redis ──
  {
    const t0 = Date.now();
    if (!isRedisReady()) {
      checks.redis = { ok: false, error: "not connected" };
    } else {
      try {
        const r = getRedis();
        if (!r) throw new Error("client missing");
        await withTimeout(r.ping(), "redis");
        checks.redis = { ok: true, ms: Date.now() - t0 };
      } catch (e: any) {
        checks.redis = { ok: false, ms: Date.now() - t0, error: String(e?.message || e) };
      }
    }
  }

  const ok = Object.values(checks).every((c) => c.ok);
  res.status(ok ? 200 : 503).json({ status: ok ? "ok" : "degraded", checks, ts: Date.now() });
});

export default router;
