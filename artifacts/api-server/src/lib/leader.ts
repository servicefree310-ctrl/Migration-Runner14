// Single-leader election across multiple api-server instances using Redis.
//
// Why this exists:
// All cron-style background workers (price-service, withdrawal-watcher,
// deposit-sweeper, futures-engine, bot-service, pair-stats, price-history,
// cache-warmup) MUST run on exactly one process at a time. If we run them
// on every replica we get double withdrawals, double bot orders, double
// funding settlements, and a thundering herd against external price APIs.
//
// How it works:
// - Each process generates a unique INSTANCE_ID at boot (UUID).
// - On startup, every process tries to `SET cryptox:leader:global <id> EX 15
//   NX`. The one that succeeds is the leader; others become followers.
// - Every 5s the leader refreshes the TTL via a Lua script that only renews
//   the key if the value still equals our INSTANCE_ID (so we never extend
//   someone else's leadership). Followers retry SET NX; if the leader
//   crashes, the key TTL expires within 15s and the next heartbeat picks
//   a new leader.
// - Each worker calls `isLeader()` at the top of its tick() function and
//   returns early if false. Leadership transitions are graceful — at most
//   one tick window of duplicated/missed work during a hand-off.
//
// Single-instance fallback (FAIL-CLOSED BY DEFAULT IN PRODUCTION):
// When Redis is unavailable, we cannot safely elect a single leader across
// replicas. Two behaviors are possible:
//   - Fallback ON  → this instance assumes leadership and runs all workers.
//                    Safe for single-replica/dev deployments. UNSAFE for
//                    multi-replica because every replica would self-promote
//                    and double-execute money-moving jobs.
//   - Fallback OFF → no leader, all gated workers idle until Redis returns.
//                    Safe for multi-replica.
// Controlled by env `LEADER_SINGLE_INSTANCE_FALLBACK`:
//   - default "true" in development (NODE_ENV !== "production")
//   - default "false" in production — multi-replica deployers must not
//     accidentally end up with split-brain just because Redis blipped.
//   - explicit "true"/"false" overrides default.
// Set to "true" in production ONLY if you are running exactly one replica.
//
// Heartbeat fail-closed:
// If a Redis heartbeat fails (network blip / Redis crash) we IMMEDIATELY
// demote ourselves locally. We do not wait for the lock TTL because another
// replica may take over at TTL expiry, and we must not keep running ticks
// after that point (split-brain → duplicate withdrawals etc.). When Redis
// recovers, the next tick re-acquires via SET NX EX.

import { randomUUID } from "node:crypto";
import { getRedis, isRedisReady } from "./redis";
import { logger } from "./logger";

const KEY = process.env["LEADER_LOCK_KEY"] || "cryptox:leader:global";
const TTL_SEC = Number(process.env["LEADER_LOCK_TTL_SEC"] || 15);
const HEARTBEAT_MS = Number(process.env["LEADER_HEARTBEAT_MS"] || 5000);
export const INSTANCE_ID = process.env["INSTANCE_ID"] || randomUUID();

// Resolve the single-instance fallback policy ONCE at module load. We log
// the resolved value the first time isLeader() is called so operators see
// it in startup logs.
const FALLBACK_ENV = process.env["LEADER_SINGLE_INSTANCE_FALLBACK"];
const FALLBACK_DEFAULT = process.env["NODE_ENV"] !== "production";
const SINGLE_INSTANCE_FALLBACK =
  FALLBACK_ENV === undefined
    ? FALLBACK_DEFAULT
    : FALLBACK_ENV.toLowerCase() === "true" || FALLBACK_ENV === "1";

let _isLeader = false;
let timer: NodeJS.Timeout | null = null;
let started = false;
let fallbackWarned = false;

export function isLeader(): boolean {
  // When Redis is down we have no way to coordinate. Fall back to the
  // configured policy (see top-of-file comment for safety implications).
  if (!isRedisReady()) {
    if (!fallbackWarned) {
      fallbackWarned = true;
      logger.warn(
        {
          instanceId: INSTANCE_ID,
          singleInstanceFallback: SINGLE_INSTANCE_FALLBACK,
          nodeEnv: process.env["NODE_ENV"] || "development",
        },
        SINGLE_INSTANCE_FALLBACK
          ? "[leader] Redis unavailable — assuming sole-leader role (single-instance fallback ON). UNSAFE if more than one replica is running."
          : "[leader] Redis unavailable — fallback OFF, ALL gated workers paused until Redis returns.",
      );
    }
    return SINGLE_INSTANCE_FALLBACK;
  }
  // Reset the warn flag once Redis is back so subsequent outages re-log.
  fallbackWarned = false;
  return _isLeader;
}

export function getInstanceId(): string {
  return INSTANCE_ID;
}

async function tick(): Promise<void> {
  // When Redis is down we cannot coordinate at all. Demote any locally
  // cached leadership immediately so we don't keep running ticks via the
  // _isLeader cache while another replica may have taken over via TTL.
  // (Note: isLeader() consults SINGLE_INSTANCE_FALLBACK on its own when
  // Redis is unready, which is the policy knob; we never persist that
  // decision into _isLeader because that would leave us stuck-leader once
  // Redis returns.)
  if (!isRedisReady()) {
    if (_isLeader) {
      _isLeader = false;
      logger.warn({ instanceId: INSTANCE_ID }, "[leader] Redis unavailable — demoting to follower");
    }
    return;
  }
  const r = getRedis();
  if (!r) return;

  try {
    if (_isLeader) {
      // Refresh TTL only if we still own the lock. Lua makes the
      // "compare-and-extend" atomic (no race with a follower that just
      // grabbed the lock during our network blip).
      const ok = (await r.eval(
        `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("pexpire", KEYS[1], ARGV[2]) else return 0 end`,
        1,
        KEY,
        INSTANCE_ID,
        String(TTL_SEC * 1000),
      )) as number;
      if (ok === 0) {
        _isLeader = false;
        logger.warn({ instanceId: INSTANCE_ID }, "[leader] lost leadership (lock expired or stolen)");
      }
    } else {
      // SET NX EX — atomic acquire. Returns "OK" on success, null otherwise.
      const acquired = await r.set(KEY, INSTANCE_ID, "EX", TTL_SEC, "NX");
      if (acquired === "OK") {
        _isLeader = true;
        logger.info({ instanceId: INSTANCE_ID, key: KEY, ttlSec: TTL_SEC }, "[leader] acquired leadership");
      }
    }
  } catch (e: any) {
    // FAIL-CLOSED: heartbeat failure (Redis blip, network partition, OOM,
    // etc.) means we cannot prove we still hold the lock. Demote ourselves
    // immediately so we never run gated workers while another replica may
    // be about to take over at TTL expiry. We will re-acquire on the next
    // successful tick.
    if (_isLeader) {
      _isLeader = false;
      logger.warn(
        { instanceId: INSTANCE_ID, err: e?.message },
        "[leader] heartbeat failed — stepping down (fail-closed)",
      );
    } else {
      logger.warn({ err: e?.message }, "[leader] heartbeat failed");
    }
  }
}

export async function startLeaderElection(): Promise<void> {
  if (started) return;
  started = true;
  // Run one tick synchronously so callers can rely on isLeader() being
  // populated immediately after startLeaderElection() resolves.
  await tick();
  timer = setInterval(() => {
    void tick();
  }, HEARTBEAT_MS);
  logger.info(
    { instanceId: INSTANCE_ID, isLeader: _isLeader, heartbeatMs: HEARTBEAT_MS },
    "[leader] election started",
  );
}

export async function stopLeaderElection(): Promise<void> {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  started = false;
  // Best-effort release: only delete the lock if we own it.
  if (_isLeader && isRedisReady()) {
    const r = getRedis();
    if (r) {
      try {
        await r.eval(
          `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`,
          1,
          KEY,
          INSTANCE_ID,
        );
      } catch {
        /* ignore — TTL will expire naturally */
      }
    }
  }
  _isLeader = false;
}
