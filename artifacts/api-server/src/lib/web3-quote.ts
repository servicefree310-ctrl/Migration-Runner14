/**
 * Web3 swap & bridge quote engine.
 *
 * In v1 we don't talk to a real DEX or RPC. Pricing reuses the platform's
 * existing live coin feed (coinsTable.currentPrice in USD) by mapping each
 * web3_tokens row to its priceCoinSymbol. The user gets a realistic quote
 * with proper fee + slippage math; execution is a synthetic move within
 * their exchange wallet (debit one coin, credit another).
 *
 * Why this matches user expectations:
 *  - Stablecoins (USDT/USDC) trade close to 1.000 against USD
 *  - WBTC ↔ ETH ratios match the actual market
 *  - Slippage is a real % deduction proportional to user-set tolerance
 *  - Bridge fee is on top of the swap fee (most aggregators stack them)
 *
 * Real WalletConnect-signed swaps can be added later by replacing the
 * "execute" step in routes/web3.ts; this quote function stays the same.
 */
import { db, web3TokensTable, web3NetworksTable, coinsTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";

export interface Web3SwapQuote {
  fromTokenId: number;
  toTokenId: number;
  networkId: number;
  fromAmount: number;
  toAmount: number;            // after fee + slippage
  rate: number;                // toAmount / fromAmount, before slippage
  feeUsd: number;
  gasUsd: number;
  priceImpactPct: number;
  minToAmount: number;         // worst-case after slippage tolerance
  fromTokenSymbol: string;
  toTokenSymbol: string;
  routeHint: string;           // human label for the UI ("via Uniswap-like router")
}

export interface Web3BridgeQuote {
  fromNetworkId: number;
  toNetworkId: number;
  tokenSymbol: string;
  fromAmount: number;
  toAmount: number;            // after bridge fee
  bridgeFeeUsd: number;
  gasUsd: number;
  estMinutes: number;
  routeHint: string;
}

async function getUsdPrice(symbol: string): Promise<number> {
  if (!symbol) return 0;
  const [c] = await db.select({ p: coinsTable.currentPrice, manual: coinsTable.manualPrice }).from(coinsTable)
    .where(eq(coinsTable.symbol, symbol.toUpperCase())).limit(1);
  if (!c) return 0;
  const live = Number(c.p);
  if (live > 0) return live;
  const m = c.manual ? Number(c.manual) : 0;
  return m > 0 ? m : 0;
}

export async function getSwapQuote(args: {
  networkId: number;
  fromTokenId: number;
  toTokenId: number;
  fromAmount: number;
  slippageBps?: number;        // user tolerance, default 50 = 0.5%
}): Promise<Web3SwapQuote> {
  const slippageBps = args.slippageBps ?? 50;
  if (args.fromAmount <= 0) throw new Error("fromAmount must be positive");
  if (args.fromTokenId === args.toTokenId) throw new Error("from and to tokens must differ");

  const tokens = await db.select().from(web3TokensTable).where(
    and(eq(web3TokensTable.networkId, args.networkId), inArray(web3TokensTable.id, [args.fromTokenId, args.toTokenId])),
  );
  const fromTok = tokens.find((t) => t.id === args.fromTokenId);
  const toTok   = tokens.find((t) => t.id === args.toTokenId);
  if (!fromTok || !toTok) throw new Error("token not found on this network");
  if (fromTok.status !== "active" || toTok.status !== "active") throw new Error("token not tradable right now");

  const [net] = await db.select().from(web3NetworksTable).where(eq(web3NetworksTable.id, args.networkId)).limit(1);
  if (!net) throw new Error("network not found");
  if (net.status !== "active") throw new Error(`${net.displayName} network is ${net.status} right now`);

  const fromUsd = await getUsdPrice(fromTok.priceCoinSymbol);
  const toUsd   = await getUsdPrice(toTok.priceCoinSymbol);
  if (fromUsd <= 0 || toUsd <= 0) throw new Error("price unavailable for this pair");

  const grossUsd = args.fromAmount * fromUsd;
  const feeUsd = grossUsd * (net.swapFeeBps / 10000);
  const gasUsd = Number(net.estGasUsd);

  // Price impact for v1 is a flat 0.05% per $10k notional (capped 1.5%) — a
  // simple model that punishes large swaps without needing real LP depth.
  const impactPct = Math.min(1.5, (grossUsd / 10_000) * 0.05);
  const netUsd = grossUsd - feeUsd - gasUsd;
  const toAmount = Math.max(0, (netUsd * (1 - impactPct / 100)) / toUsd);
  const minToAmount = toAmount * (1 - slippageBps / 10000);
  const rate = grossUsd / args.fromAmount / toUsd;

  return {
    fromTokenId: args.fromTokenId,
    toTokenId: args.toTokenId,
    networkId: args.networkId,
    fromAmount: args.fromAmount,
    toAmount,
    rate,
    feeUsd,
    gasUsd,
    priceImpactPct: impactPct,
    minToAmount,
    fromTokenSymbol: fromTok.symbol,
    toTokenSymbol: toTok.symbol,
    routeHint: net.family === "solana" ? "Jupiter-style aggregator" : "Uniswap V3 / 1inch route",
  };
}

export async function getBridgeQuote(args: {
  fromNetworkId: number;
  toNetworkId: number;
  tokenSymbol: string;
  fromAmount: number;
}): Promise<Web3BridgeQuote> {
  if (args.fromAmount <= 0) throw new Error("fromAmount must be positive");
  if (args.fromNetworkId === args.toNetworkId) throw new Error("from and to networks must differ");
  const sym = args.tokenSymbol.toUpperCase();

  // Token must exist on both sides
  const tokens = await db.select().from(web3TokensTable).where(
    and(eq(web3TokensTable.symbol, sym), inArray(web3TokensTable.networkId, [args.fromNetworkId, args.toNetworkId])),
  );
  if (tokens.length < 2) throw new Error(`${sym} not bridgeable between these networks`);

  const [fromNet] = await db.select().from(web3NetworksTable).where(eq(web3NetworksTable.id, args.fromNetworkId)).limit(1);
  const [toNet]   = await db.select().from(web3NetworksTable).where(eq(web3NetworksTable.id, args.toNetworkId)).limit(1);
  if (!fromNet || !toNet) throw new Error("network not found");
  if (fromNet.status !== "active" || toNet.status !== "active") {
    throw new Error("one of the networks is in maintenance");
  }

  const usdPrice = await getUsdPrice(tokens[0].priceCoinSymbol);
  if (usdPrice <= 0) throw new Error("price unavailable");

  const grossUsd = args.fromAmount * usdPrice;
  // Bridge fees from BOTH chains stack (origin charges + destination relays)
  const bridgeFeeUsd = grossUsd * ((fromNet.bridgeFeeBps + toNet.bridgeFeeBps) / 10000);
  const gasUsd = Number(fromNet.estGasUsd) + Number(toNet.estGasUsd) * 0.5;
  const netUsd = grossUsd - bridgeFeeUsd - gasUsd;
  const toAmount = Math.max(0, netUsd / usdPrice);

  // ETA — Solana <→ EVM ~3-5 min via Wormhole-style; EVM↔EVM ~1-3 min via LayerZero.
  const estMinutes = (fromNet.family !== toNet.family) ? 5 : 2;

  return {
    fromNetworkId: args.fromNetworkId,
    toNetworkId: args.toNetworkId,
    tokenSymbol: sym,
    fromAmount: args.fromAmount,
    toAmount,
    bridgeFeeUsd,
    gasUsd,
    estMinutes,
    routeHint: (fromNet.family !== toNet.family) ? "Wormhole-style cross-VM bridge" : "LayerZero / Stargate",
  };
}

/** Generate a plausible-looking tx hash for the simulated swap/bridge. */
export function fakeTxHash(family: string): string {
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) bytes[i] = Math.floor(Math.random() * 256);
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  if (family === "solana") {
    // Solana tx sigs are base58; for a label, return a base58-ish string
    const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    let s = "";
    for (let i = 0; i < 64; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
    return s;
  }
  return "0x" + hex;
}
