// Redis pub/sub → in-process bridge so EVERY api-server replica can serve
// WebSocket clients, even though the external price-fetch loop only runs
// on the leader.
//
// Flow:
//   leader: price-service.tick() → fetches CoinGecko/Binance →
//           rPublish("prices.tick", { inrRate, ticks }) → broadcast() locally
//   followers: this module subscribes to "prices.tick" → calls
//              injectExternalTick() → broadcast() locally
//
// The leader ALSO receives its own publish via Redis, but we dedupe by
// publisher INSTANCE_ID so the leader doesn't double-broadcast.

import { getSubRedis, isRedisReady } from "./redis";
import { injectExternalTick } from "./price-service";
import { logger } from "./logger";
import { INSTANCE_ID } from "./leader";

const TICK_CHANNEL = "prices.tick";
let started = false;

export async function startWsFanout(): Promise<void> {
  if (started) return;
  if (!isRedisReady()) {
    logger.info("[ws-fanout] Redis not ready — skipping (single-instance mode)");
    return;
  }
  const sub = getSubRedis();
  if (!sub) return;

  try {
    await sub.subscribe(TICK_CHANNEL);
  } catch (e: any) {
    logger.warn({ err: e?.message }, "[ws-fanout] subscribe failed");
    return;
  }

  sub.on("message", (channel, raw) => {
    if (channel !== TICK_CHANNEL) return;
    try {
      const payload = JSON.parse(raw) as {
        from?: string;
        inrRate?: number;
        ticks?: any[];
      };
      // Skip our own publish — price-service.broadcast() already pushed
      // these ticks into in-process subscribers.
      if (payload.from === INSTANCE_ID) return;
      if (Array.isArray(payload.ticks)) {
        injectExternalTick(payload.ticks, payload.inrRate);
      }
    } catch {
      /* malformed payload — ignore */
    }
  });

  started = true;
  logger.info({ channel: TICK_CHANNEL }, "[ws-fanout] subscribed for cross-instance price ticks");
}
