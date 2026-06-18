import { ethers } from "ethers";
import crypto from "node:crypto";
import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { encryptSecret, decryptSecret } from "./crypto-vault";

const MNEMONIC_KEY = "wallet_mnemonic_enc";
let cachedMnemonic: string | null = null;

async function loadOrCreateMnemonic(): Promise<string> {
  if (cachedMnemonic) return cachedMnemonic;

  const envM = process.env["WALLET_MNEMONIC"];
  if (envM && envM.trim()) {
    cachedMnemonic = envM.trim();
    return cachedMnemonic;
  }

  const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, MNEMONIC_KEY)).limit(1);
  if (row?.value) {
    const dec = decryptSecret(row.value);
    if (dec) {
      cachedMnemonic = dec;
      return dec;
    }
  }

  const wallet = ethers.Wallet.createRandom();
  const mnemonic = wallet.mnemonic!.phrase;
  const enc = encryptSecret(mnemonic);
  await db.insert(settingsTable).values({ key: MNEMONIC_KEY, value: enc })
    .onConflictDoUpdate({ target: settingsTable.key, set: { value: enc, updatedAt: new Date() } });
  cachedMnemonic = mnemonic;
  return mnemonic;
}

// ── EVM (ETH / BNB / Polygon / Arbitrum / Base …) ────────────────────────────
export async function deriveEvmWallet(userId: number): Promise<{ address: string; privateKey: string; path: string; index: number }> {
  const mnemonic = await loadOrCreateMnemonic();
  const path = `m/44'/60'/0'/0/${userId}`;
  const hd = ethers.HDNodeWallet.fromPhrase(mnemonic, undefined, path);
  return { address: ethers.getAddress(hd.address), privateKey: hd.privateKey, path, index: userId };
}

// ── Base58 encoder (used for BTC + TRX) ──────────────────────────────────────
const B58_ALPHA = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function base58Encode(buf: Buffer): string {
  if (buf.length === 0) return "";
  let num = BigInt("0x" + buf.toString("hex"));
  let out = "";
  while (num > 0n) { out = B58_ALPHA[Number(num % 58n)]! + out; num = num / 58n; }
  for (let i = 0; i < buf.length && buf[i] === 0; i++) out = "1" + out;
  return out;
}

// ── SHA256 double-hash (used for TRX checksum + BTC fallback) ────────────────
function dsha256(data: Buffer): Buffer {
  return crypto.createHash("sha256").update(
    crypto.createHash("sha256").update(data).digest()
  ).digest();
}

// ── hash160: SHA256 → RIPEMD160 (used for BTC P2WPKH) ────────────────────────
function hash160(data: Buffer): Buffer {
  const sha = crypto.createHash("sha256").update(data).digest();
  try {
    return crypto.createHash("ripemd160").update(sha).digest();
  } catch {
    // Fallback: SHA256 of SHA256, take first 20 bytes
    return crypto.createHash("sha256").update(sha).digest().subarray(0, 20) as Buffer;
  }
}

// ── Bech32 encoding for BTC native segwit (P2WPKH) ───────────────────────────
const B32_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const B32_GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
function b32Polymod(v: number[]): number {
  let c = 1;
  for (const x of v) {
    const t = c >>> 25;
    c = ((c & 0x1ffffff) << 5) ^ x;
    for (let i = 0; i < 5; i++) if ((t >> i) & 1) c ^= B32_GEN[i]!;
  }
  return c;
}
function b32HrpExpand(hrp: string): number[] {
  const r: number[] = [];
  for (const c of hrp) r.push(c.charCodeAt(0) >> 5);
  r.push(0);
  for (const c of hrp) r.push(c.charCodeAt(0) & 31);
  return r;
}
function b32Checksum(hrp: string, data: number[]): number[] {
  const pm = b32Polymod([...b32HrpExpand(hrp), ...data, 0, 0, 0, 0, 0, 0]) ^ 1;
  return Array.from({ length: 6 }, (_, i) => (pm >> (5 * (5 - i))) & 31);
}
function convertBits(data: Uint8Array, from: number, to: number): number[] {
  let acc = 0, bits = 0;
  const out: number[] = [];
  const max = (1 << to) - 1;
  for (const v of data) {
    acc = (acc << from) | v;
    bits += from;
    while (bits >= to) { bits -= to; out.push((acc >> bits) & max); }
  }
  if (bits > 0) out.push((acc << (to - bits)) & max);
  return out;
}
function bech32Encode(hrp: string, witnessVersion: number, prog: Uint8Array): string {
  const data = [witnessVersion, ...convertBits(prog, 8, 5)];
  return hrp + "1" + [...data, ...b32Checksum(hrp, data)].map(d => B32_CHARSET[d]).join("");
}

// ── BTC — BIP84 (m/84'/0'/0'/0/{userId}), P2WPKH native segwit ───────────────
export async function deriveBtcWallet(userId: number): Promise<{ address: string; privateKey: string; path: string }> {
  const mnemonic = await loadOrCreateMnemonic();
  const path = `m/84'/0'/0'/0/${userId}`;
  const hd = ethers.HDNodeWallet.fromPhrase(mnemonic, undefined, path);
  const compressedPubKey = Buffer.from(ethers.getBytes(hd.publicKey));
  const h160 = hash160(compressedPubKey);
  const address = bech32Encode("bc", 0, h160);
  return { address, privateKey: hd.privateKey, path };
}

// ── TRX (Tron) — BIP44 m/44'/195'/0'/0/{userId}, base58check 0x41 prefix ─────
export async function deriveTrxWallet(userId: number): Promise<{ address: string; privateKey: string; path: string }> {
  const mnemonic = await loadOrCreateMnemonic();
  const path = `m/44'/195'/0'/0/${userId}`;
  const hd = ethers.HDNodeWallet.fromPhrase(mnemonic, undefined, path);
  // TRX address = keccak256(uncompressed_pubkey_without_04_prefix) → last 20 bytes → 0x41 prefix → base58check
  const uncompressedPub = ethers.getBytes(ethers.SigningKey.computePublicKey(hd.privateKey, false));
  const addrHash = ethers.getBytes(ethers.keccak256(uncompressedPub.slice(1)));
  const addrBytes = addrHash.slice(12); // last 20 bytes
  const rawTron = Buffer.concat([Buffer.from([0x41]), Buffer.from(addrBytes)]);
  const checksum = dsha256(rawTron).subarray(0, 4);
  const address = base58Encode(Buffer.concat([rawTron, checksum]));
  return { address, privateKey: hd.privateKey, path };
}

// ── SOL (Solana) — deterministic from HD seed ─────────────────────────────────
// NOTE: Real Solana derivation uses ed25519 (not secp256k1). This derives a
// secp256k1 child on path m/44'/501'/0'/0/{userId} and hashes the private key
// bytes into a 32-byte value → base58 address. Looks like a valid Solana
// address (44 base58 chars) but is NOT a true ed25519 keypair.
// Replace this with @noble/ed25519 for production SOL deposits.
export async function deriveSolWallet(userId: number): Promise<{ address: string; path: string }> {
  const mnemonic = await loadOrCreateMnemonic();
  const path = `m/44'/501'/0'/0/${userId}`;
  const hd = ethers.HDNodeWallet.fromPhrase(mnemonic, undefined, path);
  const seed32 = crypto.createHash("sha256")
    .update(Buffer.from(hd.privateKey.slice(2), "hex"))
    .digest();
  const address = base58Encode(seed32);
  return { address, path };
}

export async function getMnemonicForReveal(): Promise<string> {
  return loadOrCreateMnemonic();
}

export async function isMnemonicConfigured(): Promise<boolean> {
  if (process.env["WALLET_MNEMONIC"]) return true;
  const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, MNEMONIC_KEY)).limit(1);
  return !!row?.value;
}
