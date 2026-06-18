// Public entry point for the in-memory matching engine.
//
// Typical wiring:
//
//   import { getEngine } from "../lib/inmem-engine";
//   const engine = await getEngine();
//   const result = await engine.placeOrder({
//     symbol: "BTCINR", side: "buy", price: 7_200_000, quantity: 0.001,
//   });
//   console.log(result.trades, result.resting);
//
// The engine is a SINGLETON per process — instantiating it twice would
// double-write the WAL and corrupt recovery. `getEngine()` lazily builds
// it on first use and runs `recover()` before handing it back.

import { InMemoryEngine, type EngineOptions } from "./engine";

export { InMemoryEngine } from "./engine";
export type {
  EngineOptions,
  EngineMetrics,
  PlaceOrderInput,
  PlaceOrderResult,
} from "./engine";
export type { Order, Trade, Side, OrderType, Depth, DepthLevel, Command, WalEntry } from "./types";

let singleton: InMemoryEngine | null = null;
let initPromise: Promise<InMemoryEngine> | null = null;

export function getEngine(opts: EngineOptions = {}): Promise<InMemoryEngine> {
  if (singleton) return Promise.resolve(singleton);
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const e = new InMemoryEngine(opts);
    await e.recover();
    singleton = e;
    return e;
  })();
  return initPromise;
}

/** Test-only: drop the singleton so the next getEngine() builds a fresh
 *  one. Only safe to call from tests after `await engine.shutdown()`. */
export function _resetEngineForTests(): void {
  singleton = null;
  initPromise = null;
}
