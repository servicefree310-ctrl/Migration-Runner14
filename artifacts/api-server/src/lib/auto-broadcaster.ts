import { ethers } from "ethers";
import { db, networksTable, coinsTable, cryptoWithdrawalsTable, walletsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { decryptSecret } from "./crypto-vault";
import { logger } from "./logger";

const EVM_CHAINS = new Set([
  "ETH", "ETHEREUM",
  "BSC", "BNB", "BNB_SMART_CHAIN",
  "POLYGON", "MATIC",
  "ARBITRUM", "ARB",
  "OPTIMISM", "OP",
  "BASE",
  "AVAX", "AVALANCHE",
  "FANTOM", "FTM",
]);

const ERC20_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

export function isEvmChain(chain: string): boolean {
  return EVM_CHAINS.has(chain.toUpperCase());
}

export interface BroadcastResult {
  txHash: string;
  blockNumber?: number;
  gasUsed?: string;
}

function buildProvider(rpcUrl: string, apiKey: string | null | undefined): ethers.JsonRpcProvider {
  let url = rpcUrl;
  if (apiKey) {
    url = url.includes("{apiKey}") ? url.replace("{apiKey}", apiKey) : url.endsWith("/") ? `${url}${apiKey}` : `${url}/${apiKey}`;
  }
  return new ethers.JsonRpcProvider(url);
}

export async function getHotWalletBalance(networkId: number): Promise<{
  native: string;
  token?: string;
  address: string;
  chain: string;
  symbol: string;
}> {
  const [network] = await db.select().from(networksTable).where(eq(networksTable.id, networkId)).limit(1);
  if (!network) throw new Error("Network not found");
  if (!network.hotWalletAddress) throw new Error("No hot wallet configured");
  if (!network.nodeAddress) throw new Error("No RPC endpoint configured");
  if (!isEvmChain(network.chain)) throw new Error(`Chain ${network.chain} not supported for auto-broadcast yet`);

  const [coin] = await db.select().from(coinsTable).where(eq(coinsTable.id, network.coinId)).limit(1);
  if (!coin) throw new Error("Coin not found");

  const apiKey = network.rpcApiKey ? decryptSecret(network.rpcApiKey) : null;
  const provider = buildProvider(network.nodeAddress, apiKey);

  const native = await provider.getBalance(network.hotWalletAddress);
  const result: { native: string; token?: string; address: string; chain: string; symbol: string } = {
    native: ethers.formatEther(native),
    address: network.hotWalletAddress,
    chain: network.chain,
    symbol: coin.symbol,
  };
  if (network.contractAddress) {
    try {
      const erc20 = new ethers.Contract(network.contractAddress, ERC20_ABI, provider);
      const dec = await erc20.decimals();
      const bal = await erc20.balanceOf(network.hotWalletAddress);
      result.token = ethers.formatUnits(bal, dec);
    } catch (e) {
      logger.warn({ err: (e as Error).message, networkId }, "ERC20 balance fetch failed");
    }
  }
  return result;
}

export class BroadcastError extends Error {
  constructor(public code: number, msg: string) { super(msg); }
}

export async function broadcastWithdrawal(withdrawalId: number, reviewerId: number): Promise<BroadcastResult> {
  // STEP 1: Atomic claim — pending -> broadcasting + invariant check on wallet locked balance
  const claim = await db.transaction(async (trx) => {
    const [w] = await trx.select().from(cryptoWithdrawalsTable).where(eq(cryptoWithdrawalsTable.id, withdrawalId)).for("update").limit(1);
    if (!w) throw new BroadcastError(404, "Withdrawal not found");
    if (w.status !== "pending") throw new BroadcastError(409, `Cannot broadcast — status is ${w.status}`);

    const [network] = await trx.select().from(networksTable).where(eq(networksTable.id, w.networkId)).limit(1);
    if (!network) throw new BroadcastError(500, "Network not found");
    if (!isEvmChain(network.chain)) throw new BroadcastError(400, `Chain ${network.chain} requires manual broadcast`);
    if (!network.hotWalletAddress || !network.hotWalletPrivateKeyEnc) throw new BroadcastError(400, "Hot wallet not configured");
    if (!network.nodeAddress) throw new BroadcastError(400, "No RPC endpoint configured");

    const [coin] = await trx.select().from(coinsTable).where(eq(coinsTable.id, w.coinId)).limit(1);
    if (!coin) throw new BroadcastError(500, "Coin not found");
    // tokenDecimals on network overrides coin default (e.g. BSC USDT=18, TRX USDT=6)
    const tokenDecimals = network.tokenDecimals ?? coin.decimals ?? 18;

    const [wallet] = await trx.select().from(walletsTable)
      .where(and(eq(walletsTable.userId, w.userId), eq(walletsTable.coinId, w.coinId), eq(walletsTable.walletType, "spot")))
      .for("update").limit(1);
    if (!wallet) throw new BroadcastError(500, "User spot wallet missing — refusing to broadcast");
    if (Number(wallet.locked) < Number(w.amount)) {
      throw new BroadcastError(500, `Locked balance (${wallet.locked}) < withdrawal amount (${w.amount})`);
    }

    // Atomically transition to broadcasting (only succeeds if still pending)
    const claimed = await trx.update(cryptoWithdrawalsTable)
      .set({ status: "broadcasting", reviewedBy: reviewerId })
      .where(and(eq(cryptoWithdrawalsTable.id, withdrawalId), eq(cryptoWithdrawalsTable.status, "pending")))
      .returning();
    if (claimed.length === 0) throw new BroadcastError(409, "Withdrawal was claimed by another process");

    return { withdrawal: w, network, coin, wallet, tokenDecimals };
  });

  // STEP 2: Broadcast (outside transaction so we don't hold locks)
  const { withdrawal: w, network, coin, tokenDecimals } = claim;
  const apiKey = network.rpcApiKey ? decryptSecret(network.rpcApiKey) : null;
  const provider = buildProvider(network.nodeAddress!, apiKey);
  const pk = decryptSecret(network.hotWalletPrivateKeyEnc!);
  if (!pk) {
    await revertClaim(withdrawalId, "Hot wallet key decryption failed");
    throw new BroadcastError(500, "Hot wallet key decryption failed");
  }
  const signer = new ethers.Wallet(pk, provider);

  let tx: ethers.TransactionResponse;
  try {
    if (network.contractAddress) {
      const erc20 = new ethers.Contract(network.contractAddress, ERC20_ABI, signer);
      const amountUnits = ethers.parseUnits(String(w.amount), tokenDecimals);
      tx = await erc20["transfer"]!(w.toAddress, amountUnits);
    } else {
      const amountWei = ethers.parseEther(String(w.amount));
      tx = await signer.sendTransaction({ to: w.toAddress, value: amountWei });
    }
  } catch (e) {
    const msg = (e as Error).message || "Broadcast failed";
    logger.error({ withdrawalId, err: msg }, "Broadcast send failed; reverting claim");
    await revertClaim(withdrawalId, msg.slice(0, 240));
    throw new BroadcastError(502, `Broadcast failed: ${msg}`);
  }

  logger.info({ withdrawalId, txHash: tx.hash, chain: network.chain }, "Withdrawal broadcast sent (status=broadcasting, awaiting confirmations)");

  // STEP 3: Deduct locked balance + save txHash. Status stays 'broadcasting' until watcher confirms.
  await db.transaction(async (trx) => {
    const [current] = await trx.select().from(cryptoWithdrawalsTable).where(eq(cryptoWithdrawalsTable.id, withdrawalId)).for("update").limit(1);
    if (!current) return;
    const [wallet] = await trx.select().from(walletsTable)
      .where(and(eq(walletsTable.userId, current.userId), eq(walletsTable.coinId, current.coinId), eq(walletsTable.walletType, "spot")))
      .for("update").limit(1);
    if (!wallet) {
      logger.error({ withdrawalId }, "Wallet vanished after broadcast — manual reconciliation needed");
      return;
    }
    const amt = Number(current.amount);
    await trx.update(walletsTable).set({
      locked: sql`${walletsTable.locked} - ${amt}`,
      updatedAt: new Date(),
    }).where(eq(walletsTable.id, wallet.id));
    await trx.update(cryptoWithdrawalsTable).set({
      txHash: tx.hash,
      broadcastedAt: new Date(),
      confirmations: 0,
    }).where(eq(cryptoWithdrawalsTable.id, withdrawalId));
  });

  return { txHash: tx.hash };
}

async function revertClaim(withdrawalId: number, reason: string): Promise<void> {
  try {
    await db.update(cryptoWithdrawalsTable)
      .set({ status: "pending", rejectReason: `Auto-send retry needed: ${reason}` })
      .where(and(eq(cryptoWithdrawalsTable.id, withdrawalId), eq(cryptoWithdrawalsTable.status, "broadcasting")));
  } catch (e) {
    logger.error({ withdrawalId, err: (e as Error).message }, "Failed to revert claim");
  }
}
