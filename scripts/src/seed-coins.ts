/**
 * seed-coins.ts — Seeds top 50 coins, their networks, and trading pairs.
 *
 * Creates:
 *   • Coins  — BTC, ETH, USDT, BNB, SOL, XRP, ADA, AVAX, DOT, MATIC, LINK,
 *              ATOM, ARB, OP, APT, SUI, INJ, TIA, NEAR, DOGE, SHIB, LTC,
 *              BCH, TRX, TON, UNI, AAVE, ALGO, FTM, ADA, ZBX (native), USDC,
 *              and more.
 *   • Networks — ERC-20, TRC-20, BEP-20, Solana, Polygon, Avalanche, etc.
 *   • Pairs  — USDT-quoted, INR-quoted, and BTC-quoted pairs.
 *
 * Safe to re-run — skips existing coins/networks/pairs.
 *
 * Run:
 *   pnpm --filter @workspace/scripts run seed:coins
 */
import { db, coinsTable, networksTable, pairsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

// ── Coin definitions ──────────────────────────────────────────────────────────
interface CoinDef {
  symbol: string;
  name: string;
  type?: string;
  decimals?: number;
  logoUrl?: string;
  marketCapRank?: number;
  currentPrice: string;
  change24h?: string;
  binanceSymbol?: string;
  priceSource?: string;
}

const COINS: CoinDef[] = [
  // ── Quote coins (must be first — pairs reference these) ───────────────────
  { symbol: "USDT",  name: "Tether USD",           type: "stablecoin", decimals: 6,  marketCapRank: 3,   currentPrice: "1.00",        binanceSymbol: "USDT",  priceSource: "fixed" },
  { symbol: "USDC",  name: "USD Coin",              type: "stablecoin", decimals: 6,  marketCapRank: 6,   currentPrice: "1.00",        binanceSymbol: "USDC",  priceSource: "fixed" },
  { symbol: "INR",   name: "Indian Rupee",          type: "fiat",       decimals: 2,  marketCapRank: 999, currentPrice: "0.01193",     binanceSymbol: null!,   priceSource: "fixed" },

  // ── Tier 1 ────────────────────────────────────────────────────────────────
  { symbol: "BTC",   name: "Bitcoin",               decimals: 8,  marketCapRank: 1,   currentPrice: "95000.00",    binanceSymbol: "BTCUSDT",   change24h: "1.23" },
  { symbol: "ETH",   name: "Ethereum",              decimals: 8,  marketCapRank: 2,   currentPrice: "3200.00",     binanceSymbol: "ETHUSDT",   change24h: "0.87" },

  // ── Tier 2 ────────────────────────────────────────────────────────────────
  { symbol: "BNB",   name: "BNB",                   decimals: 8,  marketCapRank: 4,   currentPrice: "610.00",      binanceSymbol: "BNBUSDT",   change24h: "0.45" },
  { symbol: "SOL",   name: "Solana",                decimals: 8,  marketCapRank: 5,   currentPrice: "150.00",      binanceSymbol: "SOLUSDT",   change24h: "2.10" },
  { symbol: "XRP",   name: "XRP",                   decimals: 6,  marketCapRank: 7,   currentPrice: "0.60",        binanceSymbol: "XRPUSDT",   change24h: "0.33" },
  { symbol: "ADA",   name: "Cardano",               decimals: 6,  marketCapRank: 9,   currentPrice: "0.45",        binanceSymbol: "ADAUSDT",   change24h: "-0.21" },
  { symbol: "AVAX",  name: "Avalanche",             decimals: 8,  marketCapRank: 11,  currentPrice: "38.00",       binanceSymbol: "AVAXUSDT",  change24h: "1.55" },
  { symbol: "DOGE",  name: "Dogecoin",              decimals: 8,  marketCapRank: 8,   currentPrice: "0.15",        binanceSymbol: "DOGEUSDT",  change24h: "-0.50" },
  { symbol: "TRX",   name: "TRON",                  decimals: 6,  marketCapRank: 10,  currentPrice: "0.13",        binanceSymbol: "TRXUSDT",   change24h: "0.11" },
  { symbol: "TON",   name: "Toncoin",               decimals: 8,  marketCapRank: 12,  currentPrice: "5.00",        binanceSymbol: "TONUSDT",   change24h: "3.20" },
  { symbol: "MATIC", name: "Polygon",               decimals: 8,  marketCapRank: 13,  currentPrice: "0.90",        binanceSymbol: "MATICUSDT", change24h: "0.72" },
  { symbol: "DOT",   name: "Polkadot",              decimals: 8,  marketCapRank: 14,  currentPrice: "7.00",        binanceSymbol: "DOTUSDT",   change24h: "-0.33" },
  { symbol: "LINK",  name: "Chainlink",             decimals: 8,  marketCapRank: 15,  currentPrice: "14.00",       binanceSymbol: "LINKUSDT",  change24h: "1.10" },
  { symbol: "SHIB",  name: "Shiba Inu",             decimals: 0,  marketCapRank: 16,  currentPrice: "0.0000150",   binanceSymbol: "SHIBUSDT",  change24h: "-1.20" },
  { symbol: "LTC",   name: "Litecoin",              decimals: 8,  marketCapRank: 17,  currentPrice: "90.00",       binanceSymbol: "LTCUSDT",   change24h: "0.65" },
  { symbol: "BCH",   name: "Bitcoin Cash",          decimals: 8,  marketCapRank: 18,  currentPrice: "450.00",      binanceSymbol: "BCHUSDT",   change24h: "0.90" },
  { symbol: "ATOM",  name: "Cosmos",                decimals: 6,  marketCapRank: 19,  currentPrice: "9.00",        binanceSymbol: "ATOMUSDT",  change24h: "-0.44" },
  { symbol: "UNI",   name: "Uniswap",               decimals: 8,  marketCapRank: 20,  currentPrice: "8.00",        binanceSymbol: "UNIUSDT",   change24h: "0.88" },

  // ── Tier 2 alts ───────────────────────────────────────────────────────────
  { symbol: "ARB",   name: "Arbitrum",              decimals: 8,  marketCapRank: 21,  currentPrice: "0.70",        binanceSymbol: "ARBUSDT",   change24h: "1.33" },
  { symbol: "OP",    name: "Optimism",              decimals: 8,  marketCapRank: 22,  currentPrice: "1.30",        binanceSymbol: "OPUSDT",    change24h: "2.01" },
  { symbol: "APT",   name: "Aptos",                 decimals: 8,  marketCapRank: 23,  currentPrice: "7.00",        binanceSymbol: "APTUSDT",   change24h: "0.55" },
  { symbol: "SUI",   name: "Sui",                   decimals: 8,  marketCapRank: 24,  currentPrice: "1.55",        binanceSymbol: "SUIUSDT",   change24h: "3.10" },
  { symbol: "INJ",   name: "Injective",             decimals: 8,  marketCapRank: 25,  currentPrice: "25.00",       binanceSymbol: "INJUSDT",   change24h: "1.78" },
  { symbol: "TIA",   name: "Celestia",              decimals: 8,  marketCapRank: 26,  currentPrice: "6.00",        binanceSymbol: "TIAUSDT",   change24h: "2.44" },
  { symbol: "NEAR",  name: "NEAR Protocol",         decimals: 8,  marketCapRank: 27,  currentPrice: "3.00",        binanceSymbol: "NEARUSDT",  change24h: "1.02" },
  { symbol: "AAVE",  name: "Aave",                  decimals: 8,  marketCapRank: 28,  currentPrice: "240.00",      binanceSymbol: "AAVEUSDT",  change24h: "0.67" },
  { symbol: "ALGO",  name: "Algorand",              decimals: 6,  marketCapRank: 29,  currentPrice: "0.35",        binanceSymbol: "ALGOUSDT",  change24h: "0.21" },
  { symbol: "FTM",   name: "Fantom",                decimals: 8,  marketCapRank: 30,  currentPrice: "0.40",        binanceSymbol: "FTMUSDT",   change24h: "-0.88" },

  // ── Tier 3 mid-caps ───────────────────────────────────────────────────────
  { symbol: "XMR",   name: "Monero",                decimals: 8,  marketCapRank: 31,  currentPrice: "170.00",      binanceSymbol: "XMRUSDT",   change24h: "0.12" },
  { symbol: "XLM",   name: "Stellar",               decimals: 7,  marketCapRank: 32,  currentPrice: "0.12",        binanceSymbol: "XLMUSDT",   change24h: "0.55" },
  { symbol: "GRT",   name: "The Graph",             decimals: 8,  marketCapRank: 33,  currentPrice: "0.20",        binanceSymbol: "GRTUSDT",   change24h: "-0.30" },
  { symbol: "HBAR",  name: "Hedera",                decimals: 8,  marketCapRank: 34,  currentPrice: "0.08",        binanceSymbol: "HBARUSDT",  change24h: "1.20" },
  { symbol: "ICP",   name: "Internet Computer",     decimals: 8,  marketCapRank: 35,  currentPrice: "12.00",       binanceSymbol: "ICPUSDT",   change24h: "-0.55" },
  { symbol: "FIL",   name: "Filecoin",              decimals: 8,  marketCapRank: 36,  currentPrice: "5.50",        binanceSymbol: "FILUSDT",   change24h: "0.77" },
  { symbol: "STX",   name: "Stacks",                decimals: 6,  marketCapRank: 37,  currentPrice: "2.00",        binanceSymbol: "STXUSDT",   change24h: "1.33" },
  { symbol: "RUNE",  name: "THORChain",             decimals: 8,  marketCapRank: 38,  currentPrice: "5.00",        binanceSymbol: "RUNEUSDT",  change24h: "2.10" },
  { symbol: "SAND",  name: "The Sandbox",           decimals: 8,  marketCapRank: 39,  currentPrice: "0.40",        binanceSymbol: "SANDUSDT",  change24h: "-0.22" },
  { symbol: "MANA",  name: "Decentraland",          decimals: 8,  marketCapRank: 40,  currentPrice: "0.35",        binanceSymbol: "MANAUSDT",  change24h: "-0.44" },
  { symbol: "CRV",   name: "Curve DAO",             decimals: 8,  marketCapRank: 41,  currentPrice: "0.50",        binanceSymbol: "CRVUSDT",   change24h: "0.88" },
  { symbol: "ENS",   name: "Ethereum Name Service", decimals: 8,  marketCapRank: 42,  currentPrice: "18.00",       binanceSymbol: "ENSUSDT",   change24h: "0.33" },
  { symbol: "SUSHI", name: "SushiSwap",             decimals: 8,  marketCapRank: 43,  currentPrice: "1.20",        binanceSymbol: "SUSHIUSDT", change24h: "-0.67" },
  { symbol: "COMP",  name: "Compound",              decimals: 8,  marketCapRank: 44,  currentPrice: "55.00",       binanceSymbol: "COMPUSDT",  change24h: "0.44" },
  { symbol: "MKR",   name: "Maker",                 decimals: 8,  marketCapRank: 45,  currentPrice: "2800.00",     binanceSymbol: "MKRUSDT",   change24h: "0.11" },
  { symbol: "VET",   name: "VeChain",               decimals: 8,  marketCapRank: 46,  currentPrice: "0.035",       binanceSymbol: "VETUSDT",   change24h: "0.55" },
  { symbol: "ZEC",   name: "Zcash",                 decimals: 8,  marketCapRank: 47,  currentPrice: "30.00",       binanceSymbol: "ZECUSDT",   change24h: "-0.22" },
  { symbol: "THETA", name: "Theta Network",         decimals: 8,  marketCapRank: 48,  currentPrice: "1.50",        binanceSymbol: "THETAUSDT", change24h: "0.77" },
  { symbol: "CHZ",   name: "Chiliz",                decimals: 8,  marketCapRank: 49,  currentPrice: "0.08",        binanceSymbol: "CHZUSDT",   change24h: "0.22" },
  { symbol: "FLOW",  name: "Flow",                  decimals: 8,  marketCapRank: 50,  currentPrice: "0.75",        binanceSymbol: "FLOWUSDT",  change24h: "1.00" },
  { symbol: "APE",   name: "ApeCoin",               decimals: 8,  marketCapRank: 51,  currentPrice: "1.00",        binanceSymbol: "APEUSDT",   change24h: "-0.50" },
  { symbol: "CAKE",  name: "PancakeSwap",           decimals: 8,  marketCapRank: 52,  currentPrice: "2.50",        binanceSymbol: "CAKEUSDT",  change24h: "0.33" },
  { symbol: "KSM",   name: "Kusama",                decimals: 8,  marketCapRank: 53,  currentPrice: "25.00",       binanceSymbol: "KSMUSDT",   change24h: "-0.10" },
  { symbol: "QNT",   name: "Quant",                 decimals: 8,  marketCapRank: 54,  currentPrice: "100.00",      binanceSymbol: "QNTUSDT",   change24h: "0.66" },
  { symbol: "IOTA",  name: "IOTA",                  decimals: 6,  marketCapRank: 55,  currentPrice: "0.20",        binanceSymbol: "IOTAUSDT",  change24h: "0.44" },
  { symbol: "WAVES", name: "Waves",                 decimals: 8,  marketCapRank: 56,  currentPrice: "2.00",        binanceSymbol: "WAVESUSDT", change24h: "0.22" },
  { symbol: "HOT",   name: "Holo",                  decimals: 0,  marketCapRank: 57,  currentPrice: "0.00015",     binanceSymbol: "HOTUSDT",   change24h: "0.11" },
  { symbol: "ONE",   name: "Harmony",               decimals: 6,  marketCapRank: 58,  currentPrice: "0.012",       binanceSymbol: "ONEUSDT",   change24h: "0.33" },
  { symbol: "XTZ",   name: "Tezos",                 decimals: 6,  marketCapRank: 59,  currentPrice: "0.80",        binanceSymbol: "XTZUSDT",   change24h: "-0.22" },
  { symbol: "WRX",   name: "WazirX",                decimals: 8,  marketCapRank: 60,  currentPrice: "0.15",        binanceSymbol: "WRXUSDT",   change24h: "0.55" },

  // ── Native token ─────────────────────────────────────────────────────────
  { symbol: "ZBX",   name: "Zebvix Token",          type: "token", decimals: 8, marketCapRank: 500, currentPrice: "0.10", priceSource: "fixed", binanceSymbol: null! },
];

// ── Network definitions ───────────────────────────────────────────────────────
// Each entry: [coinSymbol, chain, name, contractAddress?, withdrawFee, minWithdraw, confirmations, memoRequired]
type NetworkDef = {
  coinSymbol: string;
  chain: string;
  name: string;
  contract?: string;
  withdrawFee: string;
  minWithdraw: string;
  minDeposit: string;
  confirmations: number;
  memoRequired?: boolean;
  explorerUrl?: string;
};

const NETWORKS: NetworkDef[] = [
  // BTC
  { coinSymbol: "BTC",  chain: "BTC",      name: "Bitcoin",           withdrawFee: "0.0002",  minWithdraw: "0.001",  minDeposit: "0.0001", confirmations: 3 },
  { coinSymbol: "BTC",  chain: "LIGHTNING", name: "Lightning Network", withdrawFee: "0.000001",minWithdraw: "0.0001", minDeposit: "0.00001",confirmations: 0 },

  // ETH
  { coinSymbol: "ETH",  chain: "ERC20",    name: "Ethereum (ERC-20)", withdrawFee: "0.003",   minWithdraw: "0.01",   minDeposit: "0.001",  confirmations: 12 },

  // USDT
  { coinSymbol: "USDT", chain: "ERC20",    name: "Ethereum (ERC-20)",  contract: "0xdAC17F958D2ee523a2206206994597C13D831ec7", withdrawFee: "3",      minWithdraw: "10",  minDeposit: "1", confirmations: 12 },
  { coinSymbol: "USDT", chain: "TRC20",    name: "Tron (TRC-20)",      contract: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",      withdrawFee: "1",      minWithdraw: "5",   minDeposit: "1", confirmations: 20 },
  { coinSymbol: "USDT", chain: "BEP20",    name: "BNB Smart Chain",    contract: "0x55d398326f99059fF775485246999027B3197955", withdrawFee: "0.5",    minWithdraw: "5",   minDeposit: "1", confirmations: 15 },
  { coinSymbol: "USDT", chain: "POLYGON",  name: "Polygon (Matic)",    contract: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", withdrawFee: "0.5",    minWithdraw: "5",   minDeposit: "1", confirmations: 20 },
  { coinSymbol: "USDT", chain: "SOL",      name: "Solana",             contract: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",  withdrawFee: "0.5",    minWithdraw: "5",   minDeposit: "1", confirmations: 32 },

  // USDC
  { coinSymbol: "USDC", chain: "ERC20",    name: "Ethereum (ERC-20)",  contract: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", withdrawFee: "2",      minWithdraw: "10",  minDeposit: "1", confirmations: 12 },
  { coinSymbol: "USDC", chain: "BEP20",    name: "BNB Smart Chain",    contract: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", withdrawFee: "0.5",    minWithdraw: "5",   minDeposit: "1", confirmations: 15 },
  { coinSymbol: "USDC", chain: "SOL",      name: "Solana",             contract: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", withdrawFee: "0.5",    minWithdraw: "5",   minDeposit: "1", confirmations: 32 },

  // BNB
  { coinSymbol: "BNB",  chain: "BEP20",    name: "BNB Smart Chain",   withdrawFee: "0.001",   minWithdraw: "0.01",   minDeposit: "0.001", confirmations: 15 },
  { coinSymbol: "BNB",  chain: "ERC20",    name: "Ethereum (ERC-20)",  contract: "0xB8c77482e45F1F44dE1745F52C74426C631bDD52", withdrawFee: "0.003",   minWithdraw: "0.05",   minDeposit: "0.01", confirmations: 12 },

  // SOL
  { coinSymbol: "SOL",  chain: "SOL",      name: "Solana",            withdrawFee: "0.01",    minWithdraw: "0.1",    minDeposit: "0.01",  confirmations: 32 },

  // XRP
  { coinSymbol: "XRP",  chain: "XRP",      name: "XRP Ledger",        withdrawFee: "0.25",    minWithdraw: "1",      minDeposit: "0.1",   confirmations: 6, memoRequired: true },

  // ADA
  { coinSymbol: "ADA",  chain: "ADA",      name: "Cardano",           withdrawFee: "1",       minWithdraw: "5",      minDeposit: "1",     confirmations: 10 },

  // AVAX
  { coinSymbol: "AVAX", chain: "AVAX-C",   name: "Avalanche C-Chain", withdrawFee: "0.01",    minWithdraw: "0.1",    minDeposit: "0.01",  confirmations: 12 },

  // DOGE
  { coinSymbol: "DOGE", chain: "DOGE",     name: "Dogecoin",          withdrawFee: "2",       minWithdraw: "10",     minDeposit: "1",     confirmations: 6 },

  // TRX
  { coinSymbol: "TRX",  chain: "TRC20",    name: "Tron",              withdrawFee: "1",       minWithdraw: "10",     minDeposit: "1",     confirmations: 20 },

  // TON
  { coinSymbol: "TON",  chain: "TON",      name: "TON",               withdrawFee: "0.05",    minWithdraw: "1",      minDeposit: "0.1",   confirmations: 5 },

  // MATIC
  { coinSymbol: "MATIC",chain: "POLYGON",  name: "Polygon",           withdrawFee: "0.1",     minWithdraw: "1",      minDeposit: "0.1",   confirmations: 128 },
  { coinSymbol: "MATIC",chain: "ERC20",    name: "Ethereum (ERC-20)",  contract: "0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0", withdrawFee: "10",      minWithdraw: "50",     minDeposit: "1",   confirmations: 12 },

  // DOT
  { coinSymbol: "DOT",  chain: "DOT",      name: "Polkadot",          withdrawFee: "0.1",     minWithdraw: "1",      minDeposit: "0.1",   confirmations: 12 },

  // LINK
  { coinSymbol: "LINK", chain: "ERC20",    name: "Ethereum (ERC-20)",  contract: "0x514910771AF9Ca656af840dff83E8264EcF986CA", withdrawFee: "0.5",     minWithdraw: "1",      minDeposit: "0.1",   confirmations: 12 },
  { coinSymbol: "LINK", chain: "BEP20",    name: "BNB Smart Chain",    contract: "0xF8A0BF9cF54Bb92F17374d9e9A321E6a111a51bD", withdrawFee: "0.1",     minWithdraw: "0.5",    minDeposit: "0.1",   confirmations: 15 },

  // LTC
  { coinSymbol: "LTC",  chain: "LTC",      name: "Litecoin",          withdrawFee: "0.001",   minWithdraw: "0.01",   minDeposit: "0.001", confirmations: 4 },

  // BCH
  { coinSymbol: "BCH",  chain: "BCH",      name: "Bitcoin Cash",      withdrawFee: "0.001",   minWithdraw: "0.01",   minDeposit: "0.001", confirmations: 6 },

  // ZBX (native — no real network, mock ERC-20)
  { coinSymbol: "ZBX",  chain: "ERC20",    name: "Ethereum (ERC-20)", withdrawFee: "10",      minWithdraw: "100",    minDeposit: "10",    confirmations: 12 },
  { coinSymbol: "ZBX",  chain: "BEP20",    name: "BNB Smart Chain",   withdrawFee: "5",       minWithdraw: "50",     minDeposit: "5",     confirmations: 15 },
];

// ── Pair definitions ──────────────────────────────────────────────────────────
// [baseSymbol, quoteSymbol, pricePrecision, qtyPrecision, minQty, futuresEnabled]
type PairDef = [string, string, number, number, string, boolean];

const USDT_PAIRS: PairDef[] = [
  // T1
  ["BTC",   "USDT", 2, 5,  "0.00001", true],
  ["ETH",   "USDT", 2, 4,  "0.0001",  true],
  // T2
  ["BNB",   "USDT", 2, 3,  "0.001",   true],
  ["SOL",   "USDT", 2, 2,  "0.01",    true],
  ["XRP",   "USDT", 4, 1,  "1",       true],
  ["ADA",   "USDT", 4, 0,  "1",       true],
  ["AVAX",  "USDT", 2, 2,  "0.01",    true],
  ["DOGE",  "USDT", 5, 0,  "10",      true],
  ["TRX",   "USDT", 5, 0,  "10",      true],
  ["TON",   "USDT", 3, 2,  "0.1",     true],
  ["MATIC", "USDT", 4, 1,  "1",       true],
  ["DOT",   "USDT", 3, 2,  "0.1",     true],
  ["LINK",  "USDT", 3, 2,  "0.1",     true],
  ["SHIB",  "USDT", 8, 0,  "100000",  false],
  ["LTC",   "USDT", 2, 3,  "0.001",   true],
  ["BCH",   "USDT", 2, 3,  "0.001",   true],
  ["ATOM",  "USDT", 3, 2,  "0.1",     true],
  ["UNI",   "USDT", 3, 2,  "0.1",     true],
  ["ARB",   "USDT", 4, 1,  "1",       true],
  ["OP",    "USDT", 4, 1,  "1",       true],
  ["APT",   "USDT", 3, 2,  "0.1",     true],
  ["SUI",   "USDT", 4, 1,  "1",       true],
  ["INJ",   "USDT", 3, 2,  "0.1",     true],
  ["TIA",   "USDT", 3, 2,  "0.1",     true],
  ["NEAR",  "USDT", 3, 1,  "0.1",     true],
  ["AAVE",  "USDT", 2, 3,  "0.001",   true],
  ["ALGO",  "USDT", 4, 0,  "10",      false],
  ["FTM",   "USDT", 4, 0,  "10",      false],
  // T3
  ["XMR",   "USDT", 2, 3,  "0.001",   false],
  ["XLM",   "USDT", 5, 0,  "10",      false],
  ["GRT",   "USDT", 4, 0,  "10",      false],
  ["HBAR",  "USDT", 5, 0,  "100",     false],
  ["ICP",   "USDT", 3, 2,  "0.01",    false],
  ["FIL",   "USDT", 3, 2,  "0.01",    false],
  ["STX",   "USDT", 4, 1,  "1",       false],
  ["RUNE",  "USDT", 3, 2,  "0.1",     false],
  ["SAND",  "USDT", 4, 0,  "10",      false],
  ["MANA",  "USDT", 4, 0,  "10",      false],
  ["CRV",   "USDT", 4, 0,  "10",      false],
  ["ENS",   "USDT", 3, 2,  "0.1",     false],
  ["SUSHI", "USDT", 4, 1,  "1",       false],
  ["COMP",  "USDT", 2, 3,  "0.001",   false],
  ["MKR",   "USDT", 2, 4,  "0.0001",  false],
  ["VET",   "USDT", 5, 0,  "100",     false],
  ["ZEC",   "USDT", 2, 3,  "0.001",   false],
  ["THETA", "USDT", 4, 1,  "1",       false],
  ["CHZ",   "USDT", 5, 0,  "100",     false],
  ["FLOW",  "USDT", 4, 1,  "1",       false],
  ["APE",   "USDT", 4, 1,  "1",       false],
  ["CAKE",  "USDT", 4, 1,  "1",       false],
  ["KSM",   "USDT", 2, 3,  "0.001",   false],
  ["QNT",   "USDT", 2, 3,  "0.001",   false],
  ["IOTA",  "USDT", 4, 0,  "10",      false],
  ["WAVES", "USDT", 4, 1,  "1",       false],
  ["HOT",   "USDT", 8, 0,  "1000",    false],
  ["ONE",   "USDT", 5, 0,  "100",     false],
  ["XTZ",   "USDT", 4, 1,  "1",       false],
  ["WRX",   "USDT", 4, 0,  "10",      false],
  ["ZBX",   "USDT", 4, 0,  "100",     false],
];

const INR_PAIRS: PairDef[] = [
  ["BTC",   "INR", 0, 5,  "0.00001", false],
  ["ETH",   "INR", 0, 4,  "0.0001",  false],
  ["BNB",   "INR", 0, 3,  "0.001",   false],
  ["SOL",   "INR", 0, 2,  "0.01",    false],
  ["XRP",   "INR", 2, 0,  "10",      false],
  ["ADA",   "INR", 2, 0,  "10",      false],
  ["DOGE",  "INR", 3, 0,  "100",     false],
  ["MATIC", "INR", 2, 0,  "10",      false],
  ["AVAX",  "INR", 0, 2,  "0.1",     false],
  ["LINK",  "INR", 0, 2,  "0.1",     false],
  ["UNI",   "INR", 0, 2,  "0.1",     false],
  ["SHIB",  "INR", 6, 0,  "1000000", false],
  ["WRX",   "INR", 2, 0,  "10",      false],
  ["ZBX",   "INR", 2, 0,  "100",     false],
];

const BTC_PAIRS: PairDef[] = [
  ["ETH",   "BTC", 6, 4,  "0.001",  false],
  ["BNB",   "BTC", 6, 3,  "0.01",   false],
  ["SOL",   "BTC", 6, 2,  "0.1",    false],
  ["XRP",   "BTC", 8, 0,  "100",    false],
  ["ADA",   "BTC", 8, 0,  "100",    false],
  ["LINK",  "BTC", 7, 2,  "0.1",    false],
  ["DOT",   "BTC", 7, 2,  "0.1",    false],
];

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("🪙  Zebvix Coin + Pair Seed — starting…\n");

  // 1. Upsert coins
  console.log(`[1/3] Seeding ${COINS.length} coins…`);
  let coinCreated = 0, coinSkipped = 0;
  const coinIdBySymbol: Record<string, number> = {};

  for (const coin of COINS) {
    const existing = await db.select({ id: coinsTable.id })
      .from(coinsTable)
      .where(eq(coinsTable.symbol, coin.symbol))
      .limit(1);

    if (existing.length > 0) {
      coinIdBySymbol[coin.symbol] = existing[0].id;
      coinSkipped++;
    } else {
      const [inserted] = await db.insert(coinsTable).values({
        symbol:         coin.symbol,
        name:           coin.name,
        type:           coin.type ?? "crypto",
        decimals:       coin.decimals ?? 8,
        logoUrl:        coin.logoUrl ?? `https://cdn.zebvix.com/coins/${coin.symbol.toLowerCase()}.png`,
        marketCapRank:  coin.marketCapRank,
        currentPrice:   coin.currentPrice,
        change24h:      coin.change24h ?? "0",
        binanceSymbol:  coin.binanceSymbol ?? null,
        priceSource:    coin.priceSource ?? "binance",
        status:         "active",
        isListed:       true,
      }).returning({ id: coinsTable.id });
      coinIdBySymbol[coin.symbol] = inserted.id;
      coinCreated++;
      process.stdout.write(`   ✅ ${coin.symbol.padEnd(6)} — ${coin.name}\n`);
    }
  }
  console.log(`\n   Coins: ${coinCreated} created, ${coinSkipped} already existed\n`);

  // 2. Upsert networks
  console.log(`[2/3] Seeding ${NETWORKS.length} networks…`);
  let netCreated = 0, netSkipped = 0;

  for (const net of NETWORKS) {
    const coinId = coinIdBySymbol[net.coinSymbol];
    if (!coinId) { console.warn(`   ⚠  Coin ${net.coinSymbol} not found — skip network ${net.chain}`); continue; }

    const existing = await db.select({ id: networksTable.id })
      .from(networksTable)
      .where(sql`${networksTable.coinId} = ${coinId} AND ${networksTable.chain} = ${net.chain}`)
      .limit(1);

    if (existing.length > 0) { netSkipped++; continue; }

    await db.insert(networksTable).values({
      coinId:          coinId,
      name:            net.name,
      chain:           net.chain,
      contractAddress: net.contract ?? null,
      withdrawFee:     net.withdrawFee,
      minWithdraw:     net.minWithdraw,
      minDeposit:      net.minDeposit,
      confirmations:   net.confirmations,
      memoRequired:    net.memoRequired ?? false,
      depositEnabled:  true,
      withdrawEnabled: true,
      status:          "active",
      explorerUrl:     net.explorerUrl ?? null,
    });
    netCreated++;
  }
  console.log(`   Networks: ${netCreated} created, ${netSkipped} already existed\n`);

  // 3. Upsert pairs
  const ALL_PAIRS: PairDef[] = [...USDT_PAIRS, ...INR_PAIRS, ...BTC_PAIRS];
  console.log(`[3/3] Seeding ${ALL_PAIRS.length} trading pairs…`);
  let pairCreated = 0, pairSkipped = 0;

  for (const [baseSymbol, quoteSymbol, pricePrecision, qtyPrecision, minQty, futuresEnabled] of ALL_PAIRS) {
    const baseCoinId  = coinIdBySymbol[baseSymbol];
    const quoteCoinId = coinIdBySymbol[quoteSymbol];

    if (!baseCoinId || !quoteCoinId) {
      console.warn(`   ⚠  Missing coin for pair ${baseSymbol}/${quoteSymbol} — skip`);
      continue;
    }

    const symbol = `${baseSymbol}${quoteSymbol}`;
    const existing = await db.select({ id: pairsTable.id })
      .from(pairsTable)
      .where(eq(pairsTable.symbol, symbol))
      .limit(1);

    if (existing.length > 0) { pairSkipped++; continue; }

    // Sensible defaults for last_price based on coin's current price
    const baseCoin = COINS.find(c => c.symbol === baseSymbol);
    const quoteCoin = COINS.find(c => c.symbol === quoteSymbol);
    let lastPrice = baseCoin?.currentPrice ?? "0";

    if (quoteSymbol === "INR") {
      const baseUsd = parseFloat(baseCoin?.currentPrice ?? "0");
      lastPrice = (baseUsd * 84).toFixed(2);
    } else if (quoteSymbol === "BTC") {
      const baseUsd  = parseFloat(baseCoin?.currentPrice ?? "0");
      const btcPrice = 95000;
      lastPrice = (baseUsd / btcPrice).toFixed(8);
    }

    try {
      await db.insert(pairsTable).values({
        symbol,
        baseCoinId,
        quoteCoinId,
        pricePrecision,
        qtyPrecision,
        minQty,
        maxQty:          "9999999999",
        takerFee:        "0.001",
        makerFee:        "0.001",
        tradingEnabled:  true,
        futuresEnabled,
        lastPrice,
        volume24h:       "0",
        quoteVolume24h:  "0",
        high24h:         lastPrice,
        low24h:          lastPrice,
        change24h:       "0",
        trades24h:       0,
        status:          "active",
        maxLeverage:     futuresEnabled ? 100 : 10,
      });
      pairCreated++;
      console.log(`   ✅ ${symbol.padEnd(12)}`);
    } catch (err: any) {
      const msg: string = err?.message ?? String(err);
      if (msg.includes("already exists") || msg.includes("duplicate") || msg.includes("unique")) {
        pairSkipped++;
      } else {
        console.warn(`   ⚠  ${symbol}: ${msg.split("\n")[0]}`);
        pairSkipped++;
      }
    }
  }
  console.log(`\n   Pairs: ${pairCreated} created, ${pairSkipped} already existed`);

  console.log("\n✅ Coin + Pair seed complete!");
  console.log(`   Total: ${Object.keys(coinIdBySymbol).length} coins | ${netCreated + netSkipped} networks | ${pairCreated + pairSkipped} pairs`);
  process.exit(0);
}

main().catch(err => {
  console.error("❌ Coin seed failed:", err.message ?? err);
  process.exit(1);
});
