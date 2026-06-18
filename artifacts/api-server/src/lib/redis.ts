import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import IORedis, { type Redis } from "ioredis";
import { logger } from "./logger";

const REDIS_PORT = Number(process.env["REDIS_PORT"] ?? 6379);
const REDIS_HOST = process.env["REDIS_HOST"] ?? "127.0.0.1";
const REDIS_URL = process.env["REDIS_URL"];
const REDIS_BIN =
  process.env["REDIS_SERVER_BIN"] ??
  "/nix/store/pnc74r60iz1g5bpqv4qh76a8cc3g0n97-redis-7.2.10/bin/redis-server";

let serverProc: ChildProcess | null = null;
let pub: Redis | null = null;
let sub: Redis | null = null;
let ready = false;

function spawnLocalServer(): Promise<void> {
  if (REDIS_URL) return Promise.resolve();
  if (!existsSync(REDIS_BIN)) {
    logger.warn({ REDIS_BIN }, "redis-server binary not found, skipping spawn (will try connecting anyway)");
    return Promise.resolve();
  }
  const dir = "/tmp/cryptox-redis";
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return new Promise((resolve) => {
    const proc = spawn(
      REDIS_BIN,
      [
        "--port", String(REDIS_PORT),
        "--bind", "127.0.0.1",
        "--daemonize", "no",
        "--save", "60 1 30 100 10 1000",
        "--appendonly", "yes",
        "--appendfsync", "everysec",
        "--auto-aof-rewrite-percentage", "100",
        "--auto-aof-rewrite-min-size", "16mb",
        "--dir", dir,
        "--maxmemory", "256mb",
        "--maxmemory-policy", "allkeys-lru",
        "--protected-mode", "no",
      ],
      { stdio: ["ignore", "pipe", "pipe"], detached: false }
    );
    serverProc = proc;
    let resolved = false;
    proc.stdout?.on("data", (b) => {
      const s = b.toString();
      if (!resolved && /Ready to accept connections/.test(s)) {
        resolved = true; logger.info({ port: REDIS_PORT }, "redis-server ready");
        resolve();
      }
    });
    proc.stderr?.on("data", (b) => logger.warn({ stderr: b.toString().trim() }, "redis stderr"));
    proc.on("exit", (code) => { logger.warn({ code }, "redis-server exited"); serverProc = null; ready = false; });
    setTimeout(() => { if (!resolved) { resolved = true; resolve(); } }, 4000);
  });
}

export async function initRedis(): Promise<void> {
  try {
    await spawnLocalServer();
    const opts = REDIS_URL
      ? { lazyConnect: false }
      : { host: REDIS_HOST, port: REDIS_PORT, lazyConnect: false, maxRetriesPerRequest: 3 };
    pub = REDIS_URL ? new IORedis(REDIS_URL) : new IORedis(opts as any);
    sub = REDIS_URL ? new IORedis(REDIS_URL) : new IORedis(opts as any);
    pub.on("error", (e) => logger.warn({ err: e.message }, "redis pub error"));
    sub.on("error", (e) => logger.warn({ err: e.message }, "redis sub error"));
    await pub.ping();
    ready = true;
    logger.info({ host: REDIS_HOST, port: REDIS_PORT }, "Redis connected");
  } catch (e: any) {
    logger.warn({ err: e?.message }, "Redis init failed — running without cache");
    ready = false;
  }
}

export function isRedisReady(): boolean { return ready; }
export function getRedis(): Redis | null { return pub; }
export function getSubRedis(): Redis | null { return sub; }

export async function rSet(key: string, value: string, ttlSec?: number) {
  if (!ready || !pub) return;
  try { ttlSec ? await pub.set(key, value, "EX", ttlSec) : await pub.set(key, value); } catch {}
}
export async function rGet(key: string): Promise<string | null> {
  if (!ready || !pub) return null;
  try { return await pub.get(key); } catch { return null; }
}
export async function rHset(key: string, obj: Record<string, string | number>) {
  if (!ready || !pub) return;
  try { await pub.hset(key, obj as any); } catch {}
}
export async function rHgetall(key: string): Promise<Record<string, string>> {
  if (!ready || !pub) return {};
  try { return await pub.hgetall(key); } catch { return {}; }
}
export async function rPublish(channel: string, payload: any) {
  if (!ready || !pub) return;
  try { await pub.publish(channel, typeof payload === "string" ? payload : JSON.stringify(payload)); } catch {}
}
export async function rZadd(key: string, score: number, member: string) {
  if (!ready || !pub) return;
  try { await pub.zadd(key, score, member); } catch {}
}
export async function rZrem(key: string, member: string) {
  if (!ready || !pub) return;
  try { await pub.zrem(key, member); } catch {}
}
export async function rZrange(key: string, start = 0, stop = -1, withScores = false): Promise<string[]> {
  if (!ready || !pub) return [];
  try {
    return withScores
      ? await pub.zrange(key, start, stop, "WITHSCORES")
      : await pub.zrange(key, start, stop);
  } catch { return []; }
}
export async function rDel(...keys: string[]) {
  if (!ready || !pub || keys.length === 0) return 0;
  try { return await pub.del(...keys); } catch { return 0; }
}
export async function rLpush(key: string, ...values: string[]) {
  if (!ready || !pub) return;
  try { await pub.lpush(key, ...values); await pub.ltrim(key, 0, 999); } catch {}
}
export async function rLrange(key: string, start = 0, stop = 99): Promise<string[]> {
  if (!ready || !pub) return [];
  try { return await pub.lrange(key, start, stop); } catch { return []; }
}

export async function shutdownRedis() {
  try { await pub?.quit(); } catch {}
  try { await sub?.quit(); } catch {}
  try { serverProc?.kill("SIGTERM"); } catch {}
}
