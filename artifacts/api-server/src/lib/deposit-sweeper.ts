import { db } from "@workspace/db";
import {
  networksTable,
  coinsTable,
  walletAddressesTable,
  cryptoDepositsTable,
  walletsTable,
  walletLedgerTable,
  usersTable,
} from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { decryptSecret } from "./crypto-vault";
import { runAutoSweep } from "./deposit-sweep-master";
import { logger } from "./logger";
import { sendCryptoDepositConfirmedEmail } from "./email";

const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const MAX_BLOCK_RANGE = 2000;
const SAFETY_LAG_BLOCKS = 1;

// ─── EVM Detection Helpers ────────────────────────────────────────────────────
/**
 * All recognised EVM chain identifiers (stored in networks.chain).
 * BSC appears as "BNB", "BSC", "BSCMAINNET", "SMARTCHAIN", or "BNBSMARTCHAIN"
 * depending on how the admin configured the network.
 */
const EVM_CHAINS = new Set([
  "ETH", "ETHEREUM",
  "BNB", "BSC", "BSCMAINNET", "SMARTCHAIN", "BNBSMARTCHAIN",
  "POLYGON", "MATIC",
  "ARBITRUM", "ARB",
  "BASE",
  "AVAX", "AVALANCHE",
  "OPBNB",
  "LINEA",
  "ZKSYNC", "ZKSYNCERAMAINET",
]);

/** EVM-compatible provider types (providerType field) */
const EVM_PROVIDERS = new Set(["alchemy", "infura", "quicknode", "ankr", "nodereal"]);

function isEvmNetwork(net: { chain?: string | null; providerType?: string | null }): boolean {
  const chain    = (net.chain        || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const provider = (net.providerType || "").toLowerCase();
  return EVM_CHAINS.has(chain) || EVM_PROVIDERS.has(provider);
}

/**
 * Build the authenticated RPC URL for a network.
 * - Alchemy / Infura: key is appended as a path segment (`/KEY`)
 * - QuickNode: key is already embedded in the URL — skip
 * - Others (nodereal, ankr, custom): key may be a query param or embedded — skip
 */
function buildRpcUrl(net: {
  nodeAddress: string | null;
  rpcApiKey?: string | null;
  providerType?: string | null;
}): string {
  let url = net.nodeAddress ?? "";
  if (!net.rpcApiKey || url.includes("/v2/") || url.includes("apikey=")) return url;
  try {
    const key = decryptSecret(net.rpcApiKey);
    const prov = (net.providerType || "").toLowerCase();
    if (key && (prov === "alchemy" || prov === "infura")) {
      url = url.replace(/\/$/, "") + "/" + key;
    }
  } catch { /* ignore decrypt failure */ }
  return url;
}

type SweepResult = {
  networkId: number;
  networkName: string;
  scanned: { from: number; to: number } | null;
  detected: number;
  confirmed: number;
  errors: string[];
};

type SweeperState = {
  running: boolean;
  intervalMs: number;
  lastTickAt: number | null;
  lastResults: SweepResult[];
  consecutiveErrors: Record<number, number>;
};

const state: SweeperState = {
  running: false,
  intervalMs: 30000,
  lastTickAt: null,
  lastResults: [],
  consecutiveErrors: {},
};

let timer: NodeJS.Timeout | null = null;

function padTopicAddress(addr: string): string {
  const a = addr.toLowerCase().replace(/^0x/, "");
  return "0x" + a.padStart(64, "0");
}

function topicToAddress(topic: string): string {
  // last 40 hex chars are the address
  return "0x" + topic.slice(-40).toLowerCase();
}

function hexToDecimalString(hex: string): string {
  if (!hex || hex === "0x") return "0";
  return BigInt(hex).toString();
}

function applyDecimals(amountRaw: string, decimals: number): string {
  // amountRaw is integer string representing token base units; divide by 10^decimals to get human float string
  const s = amountRaw.padStart(decimals + 1, "0");
  const intPart = s.slice(0, s.length - decimals) || "0";
  const fracPart = s.slice(s.length - decimals).replace(/0+$/, "");
  return fracPart ? `${intPart}.${fracPart}` : intPart;
}

async function rpcCall(rpcUrl: string, method: string, params: any[]): Promise<any> {
  const r = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json() as any;
  if (j.error) throw new Error(j.error.message || "RPC error");
  return j.result;
}

async function evmGetBlockNumber(rpcUrl: string): Promise<number> {
  const r = await rpcCall(rpcUrl, "eth_blockNumber", []);
  return parseInt(r, 16);
}

async function evmGetTxReceipt(rpcUrl: string, txHash: string): Promise<{ blockNumber: number; status: string } | null> {
  try {
    const r = await rpcCall(rpcUrl, "eth_getTransactionReceipt", [txHash]);
    if (!r) return null;
    return { blockNumber: parseInt(r.blockNumber, 16), status: r.status };
  } catch { return null; }
}

/** Full receipt including event logs — used for user-claim verification */
async function evmGetFullReceipt(rpcUrl: string, txHash: string): Promise<{
  blockNumber: number;
  status: string;
  logs: Array<{ address: string; topics: string[]; data: string }>;
} | null> {
  try {
    const r = await rpcCall(rpcUrl, "eth_getTransactionReceipt", [txHash]);
    if (!r) return null;
    return {
      blockNumber: parseInt(r.blockNumber, 16),
      status: r.status,
      logs: Array.isArray(r.logs) ? r.logs : [],
    };
  } catch { return null; }
}

async function evmGetLogs(
  rpcUrl: string,
  contract: string,
  fromBlock: number,
  toBlock: number,
  toAddrTopics: string[],
): Promise<any[]> {
  // OR-filter on topic[2] (to address). topics[2] = array means OR.
  const params = [{
    address: contract,
    fromBlock: "0x" + fromBlock.toString(16),
    toBlock: "0x" + toBlock.toString(16),
    topics: [TRANSFER_TOPIC, null, toAddrTopics],
  }];
  return rpcCall(rpcUrl, "eth_getLogs", params);
}

export async function sweepNetwork(networkId: number): Promise<SweepResult> {
  const result: SweepResult = {
    networkId,
    networkName: "",
    scanned: null,
    detected: 0,
    confirmed: 0,
    errors: [],
  };

  const [net] = await db.select().from(networksTable).where(eq(networksTable.id, networkId)).limit(1);
  if (!net) { result.errors.push("network not found"); return result; }
  result.networkName = `${net.name}/${net.chain}`;

  if (net.status !== "active" || !net.depositEnabled) {
    result.errors.push("network paused or deposits disabled");
    return result;
  }
  if (!net.nodeAddress) { result.errors.push("no rpc url"); return result; }
  if (!net.contractAddress) { result.errors.push("no token contract"); return result; }

  if (!isEvmNetwork(net)) {
    result.errors.push(`auto-sweep not implemented for chain ${net.chain ?? "unknown"}`);
    return result;
  }

  // Resolve coin (for decimals — network.tokenDecimals overrides coin default for chains like BSC USDT=18 vs TRX USDT=6)
  const [coin] = await db.select().from(coinsTable).where(eq(coinsTable.id, net.coinId)).limit(1);
  if (!coin) { result.errors.push("coin not found"); return result; }
  const decimals = net.tokenDecimals ?? coin.decimals ?? 18;

  const rpcUrl = buildRpcUrl(net);

  // Current chain head
  let head: number;
  try { head = await evmGetBlockNumber(rpcUrl); }
  catch (e: any) { result.errors.push(`getBlockNumber: ${e?.message || e}`); return result; }

  const toBlock = Math.max(0, head - SAFETY_LAG_BLOCKS);
  const fromBlock = Math.min(toBlock, (net.lastBlockScanned ?? Math.max(0, toBlock - 200)) + 1);
  if (fromBlock > toBlock) {
    // Even with no new blocks, still update confirmations on pending deposits
    await updatePendingConfirmations(net.id, head, net.confirmations);
    result.scanned = null;
    return result;
  }

  // Cap range
  const span = Math.min(MAX_BLOCK_RANGE, toBlock - fromBlock + 1);
  const scanTo = fromBlock + span - 1;
  result.scanned = { from: fromBlock, to: scanTo };

  // Load all wallet addresses for this network
  const addrs = await db.select().from(walletAddressesTable).where(eq(walletAddressesTable.networkId, net.id));
  if (addrs.length === 0) {
    // No users yet; just advance pointer
    await db.update(networksTable).set({
      lastBlockScanned: scanTo, lastBlockHeight: head, blockHeightCheckedAt: new Date(),
    }).where(eq(networksTable.id, net.id));
    return result;
  }
  const addrMap = new Map<string, typeof addrs[number]>();
  const topicAddrs: string[] = [];
  for (const a of addrs) {
    const lower = a.address.toLowerCase();
    addrMap.set(lower, a);
    topicAddrs.push(padTopicAddress(lower));
  }

  // Fetch logs (chunk topicAddrs if huge — RPC providers limit ~1000)
  const CHUNK = 800;
  let logs: any[] = [];
  for (let i = 0; i < topicAddrs.length; i += CHUNK) {
    const slice = topicAddrs.slice(i, i + CHUNK);
    try {
      const part = await evmGetLogs(rpcUrl, net.contractAddress, fromBlock, scanTo, slice);
      logs = logs.concat(part);
    } catch (e: any) {
      result.errors.push(`getLogs: ${e?.message || e}`);
      return result; // don't advance pointer on error
    }
  }

  // Insert new deposits (ignore duplicates via unique index)
  let allInsertsOk = true;
  for (const log of logs) {
    try {
      const toAddr = topicToAddress(log.topics[2]);
      const fromAddr = topicToAddress(log.topics[1]);
      const wallet = addrMap.get(toAddr);
      if (!wallet) continue;
      const amountRaw = hexToDecimalString(log.data);
      const amount = applyDecimals(amountRaw, decimals);
      const blockNumber = parseInt(log.blockNumber, 16);
      const logIndex = parseInt(log.logIndex, 16);
      const txHash = log.transactionHash;

      await db.insert(cryptoDepositsTable).values({
        userId: wallet.userId,
        coinId: net.coinId,
        networkId: net.id,
        amount,
        address: wallet.address,
        fromAddress: fromAddr,
        txHash,
        blockNumber,
        logIndex,
        confirmations: Math.max(0, head - blockNumber),
        requiredConfirmations: net.confirmations,
        status: "pending",
        detectedBy: "sweeper",
      }).onConflictDoNothing();
      result.detected++;
    } catch (e: any) {
      allInsertsOk = false;
      result.errors.push(`insert: ${e?.message || e}`);
    }
  }

  // Only advance pointer if all inserts succeeded — prevents permanent skip on transient DB errors.
  // Inserts are idempotent via unique (networkId, txHash, logIndex) so retrying the range is safe.
  if (allInsertsOk) {
    await db.update(networksTable).set({
      lastBlockScanned: scanTo, lastBlockHeight: head, blockHeightCheckedAt: new Date(),
    }).where(eq(networksTable.id, net.id));
  } else {
    // Still update head/check time, but keep pointer so next tick retries the same range
    await db.update(networksTable).set({
      lastBlockHeight: head, blockHeightCheckedAt: new Date(),
    }).where(eq(networksTable.id, net.id));
  }

  // Update confirmations + auto-credit (with reorg validation)
  result.confirmed = await updatePendingConfirmations(net.id, head, net.confirmations, rpcUrl, net.autoSweepEnabled);

  return result;
}

async function updatePendingConfirmations(networkId: number, head: number, requiredConfs: number, rpcUrl?: string, autoSweepEnabled?: boolean): Promise<number> {
  const pending = await db.select().from(cryptoDepositsTable)
    .where(and(eq(cryptoDepositsTable.networkId, networkId), eq(cryptoDepositsTable.status, "pending")));
  let credited = 0;
  for (const dep of pending) {
    // Only sweeper-detected deposits with a block number get auto-confirmed; manual entries stay pending until admin approves.
    if (dep.detectedBy !== "sweeper" || !dep.blockNumber) continue;
    const confs = Math.max(0, head - dep.blockNumber);
    const required = dep.requiredConfirmations || requiredConfs;

    if (confs >= required) {
      // Reorg safety: verify the tx is still on-chain at the same block, with success status, before crediting.
      if (rpcUrl && dep.txHash) {
        const receipt = await evmGetTxReceipt(rpcUrl, dep.txHash);
        if (!receipt) {
          // Tx vanished from chain (likely reorged) — reset confirmations and keep pending; will re-detect if mined again.
          if (dep.confirmations !== 0) {
            await db.update(cryptoDepositsTable).set({ confirmations: 0 })
              .where(eq(cryptoDepositsTable.id, dep.id));
          }
          logger.warn({ depId: dep.id, txHash: dep.txHash }, "deposit tx missing on chain — possible reorg");
          continue;
        }
        if (receipt.status !== "0x1") {
          // Tx failed — mark rejected
          await db.update(cryptoDepositsTable).set({ status: "rejected", processedAt: new Date() })
            .where(and(eq(cryptoDepositsTable.id, dep.id), eq(cryptoDepositsTable.status, "pending")));
          continue;
        }
        if (receipt.blockNumber !== dep.blockNumber) {
          // Tx now in a different block (reorg+remined) — update block & recompute confirmations
          const newConfs = Math.max(0, head - receipt.blockNumber);
          await db.update(cryptoDepositsTable).set({ blockNumber: receipt.blockNumber, confirmations: newConfs })
            .where(eq(cryptoDepositsTable.id, dep.id));
          if (newConfs < required) continue;
        }
      }
      // Auto-credit
      try {
        await db.transaction(async (tx) => {
          const [cur] = await tx.select().from(cryptoDepositsTable)
            .where(eq(cryptoDepositsTable.id, dep.id)).for("update").limit(1);
          if (!cur || cur.status !== "pending") return;
          const amt = Number(cur.amount);
          await tx.insert(walletsTable).values({
            userId: cur.userId, coinId: cur.coinId, walletType: "spot",
            balance: String(amt), locked: "0",
          }).onConflictDoUpdate({
            target: [walletsTable.userId, walletsTable.walletType, walletsTable.coinId],
            set: { balance: sql`${walletsTable.balance} + ${amt}`, updatedAt: new Date() },
          });
          await tx.update(cryptoDepositsTable).set({
            status: "completed", confirmations: confs, processedAt: new Date(),
            // Queue for auto-sweep to master hot wallet if enabled for this network
            ...(autoSweepEnabled ? { sweepStatus: "pending" } : {}),
          }).where(eq(cryptoDepositsTable.id, dep.id));
        });
        credited++;
        // Fire-and-forget deposit confirmation email (must not block sweeper)
        void (async () => {
          try {
            const [user] = await db.select({ email: usersTable.email })
              .from(usersTable).where(eq(usersTable.id, dep.userId)).limit(1);
            const [coin] = await db.select({ symbol: coinsTable.symbol })
              .from(coinsTable).where(eq(coinsTable.id, dep.coinId)).limit(1);
            const [net] = await db.select({ name: networksTable.name, explorerUrl: networksTable.explorerUrl })
              .from(networksTable).where(eq(networksTable.id, dep.networkId)).limit(1);
            if (user?.email && coin && net) {
              await sendCryptoDepositConfirmedEmail(user.email, {
                amount: dep.amount,
                currency: coin.symbol,
                network: net.name ?? "Blockchain",
                txHash: dep.txHash ?? undefined,
                confirmations: dep.requiredConfirmations ?? undefined,
                explorerUrl: net.explorerUrl ?? undefined,
              });
            }
          } catch { /* email failure must never block sweeper */ }
        })();
      } catch (e: any) {
        logger.error({ err: e?.message, depId: dep.id }, "auto-credit failed");
      }
    } else if (confs !== dep.confirmations) {
      await db.update(cryptoDepositsTable).set({ confirmations: confs })
        .where(eq(cryptoDepositsTable.id, dep.id));
    }
  }
  return credited;
}

export async function sweepAllNetworks(): Promise<SweepResult[]> {
  const nets = await db.select().from(networksTable)
    .where(and(eq(networksTable.status, "active"), eq(networksTable.depositEnabled, true)));
  const results: SweepResult[] = [];
  for (const n of nets) {
    if (!n.nodeAddress || !n.contractAddress) continue;
    try {
      const r = await sweepNetwork(n.id);
      results.push(r);
      if (r.errors.length > 0) state.consecutiveErrors[n.id] = (state.consecutiveErrors[n.id] || 0) + 1;
      else state.consecutiveErrors[n.id] = 0;
    } catch (e: any) {
      results.push({ networkId: n.id, networkName: `${n.name}/${n.chain}`, scanned: null, detected: 0, confirmed: 0, errors: [e?.message || String(e)] });
      state.consecutiveErrors[n.id] = (state.consecutiveErrors[n.id] || 0) + 1;
    }
  }
  return results;
}

async function tick() {
  if (!state.running) return;
  // Multi-server safety: only the leader sweeps deposits — otherwise we'd
  // double-credit users (each replica sees the same incoming tx).
  const { isLeader } = await import("./leader");
  if (!isLeader()) return;
  state.lastTickAt = Date.now();
  try {
    const results = await sweepAllNetworks();
    state.lastResults = results;
    const totalDetected = results.reduce((s, r) => s + r.detected, 0);
    const totalConfirmed = results.reduce((s, r) => s + r.confirmed, 0);
    if (totalDetected > 0 || totalConfirmed > 0) {
      logger.info({ detected: totalDetected, confirmed: totalConfirmed, networks: results.length }, "deposit sweeper tick");
    }
    // After crediting deposits, sweep any queued ones to the master hot wallet
    if (totalConfirmed > 0) {
      try { await runAutoSweep(); } catch (e: any) {
        logger.error({ err: e?.message }, "auto-sweep batch failed");
      }
    }
  } catch (e: any) {
    logger.error({ err: e?.message }, "deposit sweeper tick failed");
  }
}

export function startDepositSweeper(intervalMs = 30000) {
  state.running = true;
  state.intervalMs = intervalMs;
  if (timer) clearInterval(timer);
  timer = setInterval(tick, intervalMs);
  // Run once on startup after a short delay to let DB settle
  setTimeout(tick, 5000);
  logger.info({ intervalMs }, "deposit sweeper started");
}

export function stopDepositSweeper() {
  state.running = false;
  if (timer) { clearInterval(timer); timer = null; }
}

export function getSweeperStatus() {
  return {
    running: state.running,
    intervalMs: state.intervalMs,
    lastTickAt: state.lastTickAt,
    nextTickAt: state.lastTickAt ? state.lastTickAt + state.intervalMs : null,
    lastResults: state.lastResults,
    consecutiveErrors: state.consecutiveErrors,
  };
}

export async function manualScan(networkId: number): Promise<SweepResult> {
  return sweepNetwork(networkId);
}

// ─── User-Claim Auto-Verification ─────────────────────────────────────────────
/**
 * Verifies a user-submitted deposit claim against the blockchain.
 * Called fire-and-forget from the /finance/deposit/claim and
 * /crypto-deposits/notify endpoints immediately after record insertion.
 *
 * Steps:
 *  1. Fetch full TX receipt via eth_getTransactionReceipt
 *  2. Verify the Transfer event logs: token contract + to == user's deposit address
 *  3. Use the ACTUAL on-chain amount (ignores user-submitted amount — prevents inflation fraud)
 *  4a. Enough confirmations → credit immediately (same DB tx as the sweeper)
 *  4b. Not enough confirmations → set blockNumber + detectedBy="sweeper" so the
 *      regular sweeper tick auto-credits when the block is deep enough
 *
 * Logs all outcomes; never throws (errors are swallowed so the HTTP response
 * has already been sent before this runs).
 */
export async function autoVerifyUserDeposit(depositId: number): Promise<void> {
  try {
    const [dep] = await db.select().from(cryptoDepositsTable)
      .where(eq(cryptoDepositsTable.id, depositId)).limit(1);
    if (!dep || dep.status !== "pending" || !dep.txHash) {
      logger.warn({ depositId }, "auto-verify: deposit not found or not pending");
      return;
    }

    // ── Resolve network & RPC ────────────────────────────────────────────────
    const [net] = await db.select().from(networksTable)
      .where(eq(networksTable.id, dep.networkId)).limit(1);
    if (!net?.nodeAddress || !net.contractAddress) {
      logger.warn({ depositId, networkId: dep.networkId }, "auto-verify: network not configured for RPC");
      return;
    }

    // Only EVM chains are auto-verifiable
    if (!isEvmNetwork(net)) {
      logger.info({ depositId, chain: net.chain }, "auto-verify: non-EVM chain — manual review required");
      return;
    }

    const rpcUrl = buildRpcUrl(net);

    // ── Fetch full receipt from chain ────────────────────────────────────────
    const receipt = await evmGetFullReceipt(rpcUrl, dep.txHash);
    if (!receipt) {
      logger.warn({ depositId, txHash: dep.txHash }, "auto-verify: tx not found on chain (may be pending)");
      return;
    }
    if (receipt.status !== "0x1") {
      // TX failed — reject immediately
      await db.update(cryptoDepositsTable)
        .set({ status: "rejected", processedAt: new Date() })
        .where(and(eq(cryptoDepositsTable.id, dep.id), eq(cryptoDepositsTable.status, "pending")));
      logger.info({ depositId, txHash: dep.txHash }, "auto-verify: tx failed on chain — rejected");
      return;
    }

    // ── Verify Transfer event ────────────────────────────────────────────────
    // Find a log: address = token contract, topics[0] = Transfer, topics[2] = deposit address
    const [coin] = await db.select().from(coinsTable)
      .where(eq(coinsTable.id, dep.coinId)).limit(1);
    const decimals = (net as any).tokenDecimals ?? coin?.decimals ?? 18;
    const contractLower = net.contractAddress.toLowerCase();
    const depositAddrPadded = padTopicAddress(dep.address);

    let onChainAmount: string | null = null;
    for (const log of receipt.logs) {
      if (
        log.address?.toLowerCase() === contractLower &&
        log.topics?.[0] === TRANSFER_TOPIC &&
        log.topics?.[2]?.toLowerCase() === depositAddrPadded.toLowerCase()
      ) {
        onChainAmount = applyDecimals(hexToDecimalString(log.data), decimals);
        break;
      }
    }

    if (!onChainAmount || parseFloat(onChainAmount) <= 0) {
      logger.warn({ depositId, txHash: dep.txHash, depositAddr: dep.address },
        "auto-verify: no matching Transfer log to deposit address — fraud or wrong address");
      return;
    }

    // ── Confirmations check ─────────────────────────────────────────────────
    let head = receipt.blockNumber;
    try { head = await evmGetBlockNumber(rpcUrl); } catch { /* use receipt block */ }
    const confs = Math.max(0, head - receipt.blockNumber);
    const required = dep.requiredConfirmations ?? net.confirmations ?? 1;

    // Mark deposit with verified on-chain data (use real amount, not user-supplied)
    await db.update(cryptoDepositsTable).set({
      amount:      onChainAmount,
      blockNumber: receipt.blockNumber,
      confirmations: confs,
      detectedBy:  "sweeper",      // now eligible for regular sweeper auto-credit
    }).where(and(eq(cryptoDepositsTable.id, dep.id), eq(cryptoDepositsTable.status, "pending")));

    if (confs < required) {
      // Not enough confirmations yet — sweeper will credit on next tick when confirmed
      logger.info({ depositId, txHash: dep.txHash, confs, required },
        "auto-verify: verified — waiting for confirmations, sweeper will credit");
      return;
    }

    // ── Enough confirmations → credit immediately ────────────────────────────
    await db.transaction(async (tx) => {
      const [cur] = await tx.select().from(cryptoDepositsTable)
        .where(eq(cryptoDepositsTable.id, dep.id)).for("update").limit(1);
      if (!cur || cur.status !== "pending") return; // already credited (race guard)

      const amt = parseFloat(onChainAmount!);
      // Upsert wallet balance
      await tx.insert(walletsTable).values({
        userId: cur.userId, coinId: cur.coinId, walletType: "spot",
        balance: String(amt), locked: "0",
      }).onConflictDoUpdate({
        target: [walletsTable.userId, walletsTable.walletType, walletsTable.coinId],
        set: { balance: sql`${walletsTable.balance} + ${amt}`, updatedAt: new Date() },
      });

      // Wallet ledger entry
      const [wallet] = await tx.select({ balance: walletsTable.balance })
        .from(walletsTable)
        .where(and(
          eq(walletsTable.userId, cur.userId),
          eq(walletsTable.coinId, cur.coinId),
          eq(walletsTable.walletType, "spot"),
        )).limit(1);
      const balAfter  = parseFloat(wallet?.balance ?? "0");
      const balBefore = balAfter - amt;
      await tx.insert(walletLedgerTable).values({
        userId: cur.userId, coinId: cur.coinId, walletType: "spot",
        type: "deposit_crypto",
        amount: String(amt),
        balanceBefore: String(Math.max(0, balBefore)),
        balanceAfter:  String(balAfter),
        refType: "crypto_deposit",
        refId: String(cur.id),
        note: `Crypto deposit ${cur.txHash?.slice(0, 16) ?? ""}…`,
      });

      // Mark deposit complete
      await tx.update(cryptoDepositsTable).set({
        status: "completed",
        confirmations: confs,
        processedAt: new Date(),
        ...(net.autoSweepEnabled ? { sweepStatus: "pending" } : {}),
      }).where(eq(cryptoDepositsTable.id, cur.id));
    });

    logger.info({ depositId, txHash: dep.txHash, amount: onChainAmount, confs },
      "auto-verify: deposit credited successfully");

    // Fire-and-forget confirmation email
    void (async () => {
      try {
        const [user] = await db.select({ email: usersTable.email })
          .from(usersTable).where(eq(usersTable.id, dep.userId)).limit(1);
        if (user?.email && coin) {
          await sendCryptoDepositConfirmedEmail(user.email, {
            amount: onChainAmount!,
            currency: coin.symbol,
            network: net.name ?? "Blockchain",
            txHash: dep.txHash ?? undefined,
            confirmations: required,
            explorerUrl: net.explorerUrl ?? undefined,
          });
        }
      } catch { /* email must not block */ }
    })();

  } catch (e: any) {
    logger.error({ err: e?.message, depositId }, "auto-verify: unexpected error");
  }
}
