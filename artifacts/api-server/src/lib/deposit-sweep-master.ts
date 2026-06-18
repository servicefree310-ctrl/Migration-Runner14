/**
 * deposit-sweep-master.ts
 * ──────────────────────────────────────────────────────────────────────────────
 * After a user's crypto deposit is confirmed and their exchange balance credited,
 * this module sweeps the actual on-chain tokens from the user's per-account
 * deposit address into the exchange's master hot wallet.
 *
 * Flow per deposit:
 *   1. Claim:  sweep_status  pending → sweeping  (atomic, prevents double-sweep)
 *   2. Gas top-up: if deposit address lacks native gas, hot wallet sends a tiny amount
 *   3. Token transfer: deposit address → hot wallet (ERC-20 or native)
 *   4. Settle: sweep_status → swept  |  failed
 *
 * Only EVM-compatible chains are supported (same as withdrawal auto-broadcast).
 * Non-EVM deposits skip silently.
 */
import { ethers } from "ethers";
import { db } from "@workspace/db";
import {
  cryptoDepositsTable,
  networksTable,
  walletAddressesTable,
  coinsTable,
} from "@workspace/db";
import { eq, and, isNull, or, lt } from "drizzle-orm";
import { decryptSecret } from "./crypto-vault";
import { isEvmChain } from "./auto-broadcaster";
import { logger } from "./logger";

const ERC20_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

// Gas budget constants — conservative but adequate for BSC/ETH/Polygon
const ERC20_GAS_LIMIT = 120_000n;
const NATIVE_GAS_LIMIT = 21_000n;
const GAS_BUFFER = 2n; // multiply estimated gas price by 2x for safety

export type AutoSweepResult = {
  depositId: number;
  status: "swept" | "skipped" | "failed";
  reason?: string;
  gasTxHash?: string;
  sweepTxHash?: string;
};

function buildRpcUrl(nodeAddress: string, rpcApiKey: string | null): string {
  if (!rpcApiKey) return nodeAddress;
  if (nodeAddress.includes("{apiKey}")) return nodeAddress.replace("{apiKey}", rpcApiKey);
  return nodeAddress.endsWith("/") ? `${nodeAddress}${rpcApiKey}` : `${nodeAddress}/${rpcApiKey}`;
}

/**
 * Sweep a single confirmed deposit from user's deposit address → hot wallet.
 * Returns immediately if the deposit is not in 'pending' sweep state.
 */
export async function sweepDepositToMaster(depositId: number): Promise<AutoSweepResult> {
  // Atomic claim — only succeeds if still in 'pending' state
  const claimed = await db
    .update(cryptoDepositsTable)
    .set({ sweepStatus: "sweeping" })
    .where(and(
      eq(cryptoDepositsTable.id, depositId),
      eq(cryptoDepositsTable.sweepStatus, "pending"),
    ))
    .returning();

  if (claimed.length === 0) {
    return { depositId, status: "skipped", reason: "Not in sweep-pending state" };
  }

  const dep = claimed[0];

  try {
    // ── Load dependencies ──────────────────────────────────────────────────
    const [network] = await db.select().from(networksTable)
      .where(eq(networksTable.id, dep.networkId)).limit(1);
    if (!network) throw new Error("Network not found");
    if (!network.autoSweepEnabled) throw new Error("Auto-sweep disabled for network");
    if (!network.hotWalletAddress || !network.hotWalletPrivateKeyEnc)
      throw new Error("Hot wallet address or private key not configured");
    if (!network.nodeAddress) throw new Error("No RPC endpoint configured");
    if (!isEvmChain(network.chain))
      throw new Error(`Chain ${network.chain} not supported for auto-sweep`);

    const [coin] = await db.select().from(coinsTable)
      .where(eq(coinsTable.id, dep.coinId)).limit(1);
    if (!coin) throw new Error("Coin not found");

    // ── Minimum sweep threshold: skip if deposit value < $1 USD ───────────
    // Uses coin's current price; if price is unknown (0), sweep anyway to be safe.
    const coinPrice = Number(coin.currentPrice ?? "0");
    if (coinPrice > 0) {
      const usdValue = Number(dep.amount) * coinPrice;
      if (usdValue < 1.0) {
        await db.update(cryptoDepositsTable)
          .set({ sweepStatus: "skipped" })
          .where(eq(cryptoDepositsTable.id, depositId));
        logger.info(
          { depositId, amount: dep.amount, coinSymbol: coin.symbol, usdValue: usdValue.toFixed(6) },
          "auto-sweep: skipped — deposit value below $1 threshold",
        );
        return { depositId, status: "skipped", reason: `Value $${usdValue.toFixed(4)} < $1 minimum` };
      }
    }

    const [walletAddr] = await db.select().from(walletAddressesTable)
      .where(and(
        eq(walletAddressesTable.userId, dep.userId),
        eq(walletAddressesTable.networkId, dep.networkId),
      )).limit(1);
    if (!walletAddr) throw new Error("User deposit address record not found");
    if (!walletAddr.privateKeyEnc) throw new Error("No private key stored for deposit address — HD wallet derivation may be needed");

    // ── Decrypt keys ───────────────────────────────────────────────────────
    const depositPk = decryptSecret(walletAddr.privateKeyEnc);
    const hotPk = decryptSecret(network.hotWalletPrivateKeyEnc!);
    if (!depositPk) throw new Error("Failed to decrypt deposit address private key");
    if (!hotPk) throw new Error("Failed to decrypt hot wallet private key");

    // ── Build provider & signers ───────────────────────────────────────────
    const apiKey = network.rpcApiKey ? (() => { try { return decryptSecret(network.rpcApiKey!); } catch { return null; } })() : null;
    const rpcUrl = buildRpcUrl(network.nodeAddress, apiKey);
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const depositSigner = new ethers.Wallet(depositPk, provider);
    const hotSigner = new ethers.Wallet(hotPk, provider);

    const depositAddr = walletAddr.address;
    const hotAddr = network.hotWalletAddress;
    const feeData = await provider.getFeeData();
    const gasPrice = feeData.gasPrice ?? ethers.parseUnits("5", "gwei");

    let gasTxHash: string | undefined;
    let sweepTxHash: string;

    if (network.contractAddress) {
      // ── ERC-20 token sweep ─────────────────────────────────────────────
      const erc20 = new ethers.Contract(network.contractAddress, ERC20_ABI, provider);
      const tokenBalance: bigint = await erc20["balanceOf"](depositAddr);

      if (tokenBalance === 0n) {
        // Nothing to sweep — mark done
        await db.update(cryptoDepositsTable)
          .set({ sweepStatus: "swept", sweptAt: new Date() })
          .where(eq(cryptoDepositsTable.id, depositId));
        return { depositId, status: "swept", reason: "Zero token balance on-chain" };
      }

      // Gas top-up: deposit address needs native gas to pay transfer fee
      const gasBudget = ERC20_GAS_LIMIT * gasPrice * GAS_BUFFER;
      const nativeBal: bigint = await provider.getBalance(depositAddr);
      if (nativeBal < gasBudget) {
        const topUp = gasBudget - nativeBal;
        logger.info({ depositId, depositAddr, topUpWei: topUp.toString() }, "auto-sweep: sending gas top-up");
        const gasTx = await hotSigner.sendTransaction({ to: depositAddr, value: topUp });
        gasTxHash = gasTx.hash;
        await gasTx.wait(1);
        logger.info({ depositId, gasTxHash }, "auto-sweep: gas top-up confirmed");
      }

      // Transfer all tokens from deposit address → hot wallet
      const erc20FromDeposit = new ethers.Contract(network.contractAddress, ERC20_ABI, depositSigner);
      const transferTx = await erc20FromDeposit["transfer"](hotAddr, tokenBalance);
      sweepTxHash = (transferTx as ethers.TransactionResponse).hash;
      await (transferTx as ethers.TransactionResponse).wait(1);
    } else {
      // ── Native token sweep (ETH/BNB direct send) ───────────────────────
      const nativeBal: bigint = await provider.getBalance(depositAddr);
      if (nativeBal === 0n) {
        await db.update(cryptoDepositsTable)
          .set({ sweepStatus: "swept", sweptAt: new Date() })
          .where(eq(cryptoDepositsTable.id, depositId));
        return { depositId, status: "swept", reason: "Zero native balance on-chain" };
      }
      const gasCost = NATIVE_GAS_LIMIT * gasPrice;
      const sendAmount = nativeBal - gasCost;
      if (sendAmount <= 0n) {
        throw new Error(`Insufficient balance (${ethers.formatEther(nativeBal)}) to cover gas (${ethers.formatEther(gasCost)}) on native sweep`);
      }
      const tx = await depositSigner.sendTransaction({
        to: hotAddr, value: sendAmount, gasLimit: NATIVE_GAS_LIMIT, gasPrice,
      });
      sweepTxHash = tx.hash;
      await tx.wait(1);
    }

    // ── Settle ─────────────────────────────────────────────────────────────
    await db.update(cryptoDepositsTable)
      .set({ sweepStatus: "swept", sweepTxHash, sweptAt: new Date() })
      .where(eq(cryptoDepositsTable.id, depositId));

    logger.info({ depositId, sweepTxHash, gasTxHash, depositAddr, hotAddr }, "auto-sweep: completed");
    return { depositId, status: "swept", gasTxHash, sweepTxHash };

  } catch (e: any) {
    const msg = String(e?.message ?? e).slice(0, 300);
    logger.error({ depositId, err: msg }, "auto-sweep: failed");
    await db.update(cryptoDepositsTable)
      .set({ sweepStatus: "failed" })
      .where(eq(cryptoDepositsTable.id, depositId));
    return { depositId, status: "failed", reason: msg };
  }
}

/**
 * Run auto-sweep for all deposits that are pending sweep.
 * Called at the end of each deposit-sweeper tick (leader-only).
 */
export async function runAutoSweep(): Promise<AutoSweepResult[]> {
  // ── Stuck sweep recovery ────────────────────────────────────────────────
  // If a server crashed mid-sweep, entries stay in "sweeping" forever.
  // Reset any deposit stuck in "sweeping" for > 5 minutes back to "pending".
  const stuckCutoff = new Date(Date.now() - 5 * 60 * 1000);
  const stuck = await db
    .update(cryptoDepositsTable)
    .set({ sweepStatus: "pending" })
    .where(and(
      eq(cryptoDepositsTable.sweepStatus, "sweeping"),
      lt(cryptoDepositsTable.processedAt, stuckCutoff),
    ))
    .returning({ id: cryptoDepositsTable.id });
  if (stuck.length > 0) {
    logger.warn({ count: stuck.length }, "auto-sweep: reset stuck sweeping entries to pending");
  }

  const pending = await db.select({ id: cryptoDepositsTable.id })
    .from(cryptoDepositsTable)
    .where(eq(cryptoDepositsTable.sweepStatus, "pending"))
    .limit(20);

  if (pending.length === 0) return [];

  const results: AutoSweepResult[] = [];
  for (const dep of pending) {
    try {
      const r = await sweepDepositToMaster(dep.id);
      results.push(r);
    } catch (e: any) {
      results.push({ depositId: dep.id, status: "failed", reason: e?.message });
    }
  }

  const swept = results.filter((r) => r.status === "swept").length;
  const failed = results.filter((r) => r.status === "failed").length;
  if (results.length > 0) {
    logger.info({ total: results.length, swept, failed }, "auto-sweep: batch complete");
  }
  return results;
}

/**
 * Get current auto-sweep queue stats (for admin dashboard).
 */
export async function getAutoSweepStats(): Promise<{
  pending: number; sweeping: number; swept: number; failed: number; skipped: number;
}> {
  const rows = await db.execute(
    `SELECT sweep_status, COUNT(*)::int AS cnt FROM crypto_deposits WHERE sweep_status IS NOT NULL GROUP BY sweep_status` as any,
  );
  const r = ((rows as any).rows ?? (rows as any)) as Array<{ sweep_status: string; cnt: number }>;
  const byStatus = Object.fromEntries(r.map((x) => [x.sweep_status, x.cnt]));
  return {
    pending: byStatus["pending"] ?? 0,
    sweeping: byStatus["sweeping"] ?? 0,
    swept: byStatus["swept"] ?? 0,
    failed: byStatus["failed"] ?? 0,
    skipped: byStatus["skipped"] ?? 0,
  };
}
