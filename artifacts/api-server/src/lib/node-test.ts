import { decryptSecret } from "./crypto-vault";

type TestResult = { ok: boolean; blockHeight?: number; latencyMs?: number; error?: string };

async function testEvm(rpcUrl: string): Promise<TestResult> {
  const t0 = Date.now();
  try {
    const r = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }),
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
    const j = await r.json() as any;
    if (j.error) return { ok: false, error: j.error.message || "RPC error" };
    return { ok: true, blockHeight: parseInt(j.result, 16), latencyMs: Date.now() - t0 };
  } catch (e: any) { return { ok: false, error: e?.message || "fetch failed" }; }
}

async function testTron(rpcUrl: string, apiKey?: string): Promise<TestResult> {
  const t0 = Date.now();
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey) headers["TRON-PRO-API-KEY"] = apiKey;
    const base = rpcUrl.replace(/\/$/, "");
    const r = await fetch(`${base}/wallet/getnowblock`, { method: "POST", headers, signal: AbortSignal.timeout(8000) });
    if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
    const j = await r.json() as any;
    const h = j?.block_header?.raw_data?.number;
    if (!h) return { ok: false, error: "no block in response" };
    return { ok: true, blockHeight: h, latencyMs: Date.now() - t0 };
  } catch (e: any) { return { ok: false, error: e?.message || "fetch failed" }; }
}

async function testBitcoinBlockcypher(rpcUrl: string): Promise<TestResult> {
  const t0 = Date.now();
  try {
    const url = rpcUrl.replace(/\/$/, "");
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
    const j = await r.json() as any;
    if (typeof j.height !== "number") return { ok: false, error: "no height" };
    return { ok: true, blockHeight: j.height, latencyMs: Date.now() - t0 };
  } catch (e: any) { return { ok: false, error: e?.message || "fetch failed" }; }
}

async function testSolana(rpcUrl: string): Promise<TestResult> {
  const t0 = Date.now();
  try {
    const r = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getSlot" }),
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
    const j = await r.json() as any;
    if (j.error) return { ok: false, error: j.error.message };
    return { ok: true, blockHeight: j.result, latencyMs: Date.now() - t0 };
  } catch (e: any) { return { ok: false, error: e?.message || "fetch failed" }; }
}

export async function testNode(opts: { providerType: string; chain: string; rpcUrl: string; apiKeyEnc?: string | null }): Promise<TestResult> {
  if (!opts.rpcUrl) return { ok: false, error: "RPC URL not configured" };
  const apiKey = opts.apiKeyEnc ? decryptSecret(opts.apiKeyEnc) : "";
  const provider = opts.providerType?.toLowerCase() || "custom";
  const chain = opts.chain?.toUpperCase() || "";
  if (provider === "tron" || chain === "TRX" || chain === "TRON") return testTron(opts.rpcUrl, apiKey);
  if (provider === "blockcypher" || chain === "BTC") return testBitcoinBlockcypher(opts.rpcUrl);
  if (provider === "helius" || chain === "SOL" || chain === "SOLANA") return testSolana(opts.rpcUrl);
  // Default: EVM-compatible (alchemy, infura, custom for ETH/BSC/POLYGON/ARBITRUM)
  return testEvm(opts.rpcUrl);
}
