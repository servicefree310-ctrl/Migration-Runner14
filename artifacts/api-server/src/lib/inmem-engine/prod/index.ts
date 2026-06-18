import { ProdEngine, type ProdEngineOptions } from "./prod-engine";

// Singleton accessor for the production matching engine.
//
// Bootstrapping is async (loads the symbol registry, replays the engine
// WAL, restores the settler cursor, reconciles open orders from Postgres),
// so callers must `await getProdEngine()` before placing orders. The
// promise is cached so repeated callers reuse the same in-flight start.
//
// To run two engines in the same process (e.g. tests), construct
// `ProdEngine` directly with a unique `dataDir`.

let instance: ProdEngine | null = null;
let starting: Promise<ProdEngine> | null = null;

export async function getProdEngine(opts?: ProdEngineOptions): Promise<ProdEngine> {
  if (instance) return instance;
  if (starting) return starting;
  starting = (async () => {
    const e = new ProdEngine(opts);
    await e.start();
    instance = e;
    return e;
  })();
  return starting;
}

/** Test/teardown helper. Production code should leave the engine running
 *  for the lifetime of the process. */
export async function shutdownProdEngine(): Promise<void> {
  if (!instance) return;
  await instance.stop();
  instance = null;
  starting = null;
}

export { ProdEngine } from "./prod-engine";
export type { ProdEngineOptions, ProdEngineMetrics, PlaceProdOrderInput, PlaceProdOrderResult } from "./prod-engine";
