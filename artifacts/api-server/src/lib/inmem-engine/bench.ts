// Benchmark + functional smoke test for the in-memory matching engine.
//
// Run from the workspace root with:
//
//   pnpm dlx tsx artifacts/api-server/src/lib/inmem-engine/bench.ts
//
// What it does:
//
//   1. Builds an engine with persistence DISABLED (we want to measure the
//      raw matching loop, not fs latency).
//   2. Pre-seeds the book with 1,000 resting orders on each side so the
//      hot path actually has multi-level depth to traverse.
//   3. Fires 10,000 aggressive orders that match 1-3 makers each.
//   4. Reports throughput (orders/sec) and per-match latency (p50, p99).
//
// Pass criteria from the spec: <1ms per match. We expect to be well under
// that — the hot loop is allocation-light and V8 inlines `match()`.

import { InMemoryEngine } from "./engine";

async function main(): Promise<void> {
  const engine = new InMemoryEngine({ disablePersistence: true });
  await engine.recover();

  const SYM = "BENCHBTC";
  const MID = 100_000;

  // ── Phase 1: seed the book with 1k resting bids and 1k resting asks ──
  // Random prices around the mid so matches walk multiple levels.
  const seedStart = Date.now();
  for (let i = 0; i < 1_000; i++) {
    const bidPrice = MID - 1 - Math.floor(Math.random() * 50);
    const askPrice = MID + 1 + Math.floor(Math.random() * 50);
    await engine.placeOrder({ symbol: SYM, side: "buy", price: bidPrice, quantity: 1 });
    await engine.placeOrder({ symbol: SYM, side: "sell", price: askPrice, quantity: 1 });
  }
  const seedMs = Date.now() - seedStart;
  console.log(`Seeded 2,000 resting orders in ${seedMs}ms (${((2_000 / seedMs) * 1000).toFixed(0)} orders/s)`);

  const seedDepth = engine.getOrderbook(SYM, 5);
  console.log("Top 5 bids:", seedDepth.bids);
  console.log("Top 5 asks:", seedDepth.asks);

  // ── Phase 2: 10k aggressive orders ─────────────────────────────────────
  const N = 10_000;
  const latencies = new Float64Array(N);
  const matchStart = Date.now();
  let totalTrades = 0;
  let totalRested = 0;
  for (let i = 0; i < N; i++) {
    const aggressive = i % 2 === 0;
    const side: "buy" | "sell" = aggressive ? (i % 4 === 0 ? "buy" : "sell") : "buy";
    // For aggressive: cross the spread by ±10 ticks → guarantees a match.
    // For passive: post a few ticks inside → some will match, some rest.
    const price = aggressive
      ? side === "buy" ? MID + 25 : MID - 25
      : side === "buy" ? MID - 60 : MID + 60;
    const t0 = process.hrtime.bigint();
    const r = await engine.placeOrder({
      symbol: SYM, side, price, quantity: 1 + Math.floor(Math.random() * 3),
    });
    const t1 = process.hrtime.bigint();
    latencies[i] = Number(t1 - t0) / 1_000; // µs
    totalTrades += r.trades.length;
    if (r.resting) totalRested++;
  }
  const matchMs = Date.now() - matchStart;
  const sortedLat = Array.from(latencies).sort((a, b) => a - b);
  const p = (q: number) => sortedLat[Math.floor(N * q)] ?? 0;
  const mean = sortedLat.reduce((s, v) => s + v, 0) / N;

  const m = engine.metrics();
  console.log("\n── Engine metrics ──");
  console.log(JSON.stringify(m, null, 2));

  console.log("\n── Bench results ──");
  console.log(`Orders placed:    ${N.toLocaleString()}`);
  console.log(`Wall time:        ${matchMs}ms`);
  console.log(`Throughput:       ${((N / matchMs) * 1000).toFixed(0)} orders/sec`);
  console.log(`Total trades:     ${totalTrades.toLocaleString()}`);
  console.log(`Rested orders:    ${totalRested.toLocaleString()}`);
  console.log(`Latency mean:     ${mean.toFixed(2)} µs`);
  console.log(`Latency p50:      ${p(0.5).toFixed(2)} µs`);
  console.log(`Latency p95:      ${p(0.95).toFixed(2)} µs`);
  console.log(`Latency p99:      ${p(0.99).toFixed(2)} µs`);
  console.log(`Latency max:      ${sortedLat[N - 1]!.toFixed(2)} µs`);

  const passed = p(0.99) < 1_000;
  console.log(`\n→ ${passed ? "PASS" : "FAIL"}: p99 latency < 1ms requirement`);

  await engine.shutdown();
  if (!passed) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
