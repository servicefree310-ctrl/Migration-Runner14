// Functional test for snapshot + WAL recovery. Builds an engine, places
// some orders, snapshots, places MORE orders (after the snapshot, into
// the WAL only), shuts down, then builds a fresh engine pointing at the
// same data dir and confirms the book ends up identical.

import { promises as fsp } from "node:fs";
import path from "node:path";
import { InMemoryEngine } from "./engine";

const DIR = "/tmp/cryptox-inmem-test";

function dump(label: string, depth: ReturnType<InMemoryEngine["getOrderbook"]>): void {
  console.log(`${label}: bids=${JSON.stringify(depth.bids)} asks=${JSON.stringify(depth.asks)} seq=${depth.seq}`);
}

async function main(): Promise<void> {
  await fsp.rm(DIR, { recursive: true, force: true });
  await fsp.mkdir(DIR, { recursive: true });

  // Phase 1 — fresh engine, place 5 orders, snapshot, then 5 more.
  console.log("── Phase 1: build engine, place orders, snapshot, place more ──");
  const engineA = new InMemoryEngine({ dataDir: DIR, snapshotEveryNCommands: 0 });
  await engineA.recover();

  await engineA.placeOrder({ symbol: "RECOVTEST", side: "buy",  price: 100, quantity: 5 });
  await engineA.placeOrder({ symbol: "RECOVTEST", side: "buy",  price:  99, quantity: 3 });
  await engineA.placeOrder({ symbol: "RECOVTEST", side: "sell", price: 105, quantity: 2 });
  await engineA.placeOrder({ symbol: "RECOVTEST", side: "sell", price: 106, quantity: 4 });
  await engineA.placeOrder({ symbol: "RECOVTEST", side: "buy",  price: 105, quantity: 1 }); // crosses

  dump("after 5 orders", engineA.getOrderbook("RECOVTEST", 5));
  console.log("→ snapshotting now");
  await engineA.snapshotNow();

  // These orders go ONLY into the new (post-rotate) WAL. Recovery must
  // load the snapshot AND replay these to be correct.
  await engineA.placeOrder({ symbol: "RECOVTEST", side: "buy",  price:  98, quantity: 7 });
  await engineA.placeOrder({ symbol: "RECOVTEST", side: "sell", price: 107, quantity: 9 });
  const cancelled = await engineA.placeOrder({ symbol: "RECOVTEST", side: "sell", price: 110, quantity: 1 });
  await engineA.cancelOrder("RECOVTEST", cancelled.orderId);

  const before = engineA.getOrderbook("RECOVTEST", 10);
  dump("BEFORE shutdown", before);
  await engineA.shutdown();

  // Phase 2 — brand new engine pointing at the same data dir.
  console.log("\n── Phase 2: rebuild engine from snapshot+WAL ──");
  const engineB = new InMemoryEngine({ dataDir: DIR, snapshotEveryNCommands: 0 });
  const stats = await engineB.recover();
  console.log("recovery stats:", stats);

  const after = engineB.getOrderbook("RECOVTEST", 10);
  dump("AFTER recovery", after);

  const equal = JSON.stringify(before.bids) === JSON.stringify(after.bids)
             && JSON.stringify(before.asks) === JSON.stringify(after.asks);
  console.log(`\n→ ${equal ? "PASS" : "FAIL"}: book state identical across restart`);

  // Confirm WAL file actually exists at the expected path.
  const walExists = await fsp.access(path.join(DIR, "engine.wal.jsonl")).then(() => true).catch(() => false);
  const snapExists = await fsp.access(path.join(DIR, "engine.snapshot.json")).then(() => true).catch(() => false);
  console.log(`→ WAL file present: ${walExists}, snapshot file present: ${snapExists}`);

  await engineB.shutdown();
  if (!equal) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(2); });
