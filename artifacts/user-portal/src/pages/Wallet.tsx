import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post, del } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { KycProgressBanner } from "@/components/KycGate";
import { useTickers, useInrRate } from "@/lib/marketSocket";
import { useMemo, useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { SuccessModal, type GenericSuccess } from "@/components/SuccessModal";
import {
  Eye,
  EyeOff,
  Search,
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowLeftRight,
  RefreshCw,
  Copy,
  Plus,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  CheckCircle2,
  Clock,
  XCircle,
  Sparkles,
  Wallet as WalletIcon,
  Building2,
  QrCode,
  HelpCircle,
  Loader2,
  Download,
  ScanLine,
  Shield,
  ShieldPlus,
  SendHorizontal,
  Users,
  UserCheck,
  Mail,
  ListChecks,
  Trash2,
  Timer,
  BadgeCheck,
} from "lucide-react";
import QRCodeSVG from "react-qr-code";

const HIDE_KEY = "zebvix:wallet:hide";

// ──────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────
type WalletType = "SPOT" | "FUTURES" | "FIAT";
type WalletItem = {
  id: string;
  type: WalletType;
  currency: string;
  balance: number;
  inOrder: number;
  icon: string | null;
  status: boolean;
};
type Tx = {
  id: string;
  type: "DEPOSIT" | "WITHDRAW" | "TRADE" | "TRANSFER";
  status: string;
  amount: number;
  fee: number;
  // Spot trade fees settle in the QUOTE coin (e.g. INR for BTCINR), not
  // the base coin shown in `wallet.currency`. Falls back to wallet.currency
  // for older API responses or non-trade rows where they happen to match.
  feeCurrency?: string;
  description: string;
  trxId?: string | null;
  referenceId?: string | null;
  // On-chain crypto withdrawal destination
  toAddress?: string | null;
  memo?: string | null;
  rejectReason?: string | null;
  // Blockchain explorer URL (from network config, crypto deposit/withdraw only)
  explorerUrl?: string | null;
  // Internal wallet-to-wallet transfer
  metadata?: { fromWallet?: string; toWallet?: string; [k: string]: unknown } | null;
  createdAt: string;
  wallet: { currency: string; type: string };
};
type TxResponse = { items: Tx[]; pagination: { totalItems: number; currentPage: number; perPage: number; totalPages: number } };
type BankAccount = { id: number; bankName: string; accountNumber: string; ifsc: string; holderName: string; status: string };

// VIP-tier + fee-discount snapshot returned by /finance/wallet (and ?pnl=true).
// Rates are fractions (0.0025 == 0.25%); discountPct values are 0..100.
type DiscountInfo = {
  vipTier: number;
  vipName: string;
  spot: { maker: number; taker: number };
  spotBase: { maker: number; taker: number };
  futures: { maker: number; taker: number };
  futuresBase: { maker: number; taker: number };
  withdrawDiscountPct: number;
  gstPercent: number;
  tdsPercent: number;
  discountPct: { spotMaker: number; spotTaker: number; futuresMaker: number; futuresTaker: number };
};

function fmtNum(n: number, digits = 4): string {
  if (!isFinite(n)) return "—";
  return n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
function fmtUsd(n: number): string {
  if (!isFinite(n) || n === 0) return "0.00 USDT";
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " USDT";
}
function fmtInr(n: number): string {
  if (!isFinite(n) || n === 0) return "₹0.00";
  return "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function shortHash(s?: string | null): string {
  if (!s) return "—";
  if (s.length <= 16) return s;
  return s.slice(0, 8) + "…" + s.slice(-6);
}
function relTime(iso: string): string {
  const d = new Date(iso).getTime();
  if (!isFinite(d)) return "—";
  const diff = Date.now() - d;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return Math.floor(diff / 60_000) + "m ago";
  if (diff < 86_400_000) return Math.floor(diff / 3_600_000) + "h ago";
  return Math.floor(diff / 86_400_000) + "d ago";
}
function statusTone(s: string): "ok" | "warn" | "bad" | "muted" {
  const v = s.toUpperCase();
  if (v === "COMPLETED" || v === "VERIFIED" || v === "SUCCESS" || v === "APPROVED") return "ok";
  if (v === "PENDING" || v === "PROCESSING") return "warn";
  if (v === "FAILED" || v === "REJECTED" || v === "CANCELLED" || v === "CANCELED") return "bad";
  return "muted";
}
function StatusBadge({ status }: { status: string }) {
  const tone = statusTone(status);
  const Icon = tone === "ok" ? CheckCircle2 : tone === "warn" ? Clock : tone === "bad" ? XCircle : AlertCircle;
  const cls =
    tone === "ok"
      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
      : tone === "warn"
      ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
      : tone === "bad"
      ? "bg-rose-500/15 text-rose-400 border-rose-500/30"
      : "bg-muted text-muted-foreground border-border";
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium ${cls}`}>
      <Icon className="h-3 w-3" />
      {status}
    </span>
  );
}

function CoinIcon({ symbol, size = 9 }: { symbol: string; size?: 7 | 8 | 9 | 10 | 12 }) {
  const palette = [
    "from-amber-500 to-orange-600",
    "from-sky-500 to-blue-600",
    "from-violet-500 to-purple-600",
    "from-emerald-500 to-teal-600",
    "from-rose-500 to-pink-600",
    "from-fuchsia-500 to-indigo-600",
    "from-yellow-500 to-amber-600",
    "from-cyan-500 to-sky-600",
  ];
  let h = 0;
  for (let i = 0; i < symbol.length; i++) h = (h * 31 + symbol.charCodeAt(i)) >>> 0;
  const grad = palette[h % palette.length];
  const sizeCls =
    size === 7 ? "h-7 w-7 text-[10px]" :
    size === 8 ? "h-8 w-8 text-xs" :
    size === 9 ? "h-9 w-9 text-xs" :
    size === 10 ? "h-10 w-10 text-sm" :
    "h-12 w-12 text-base";
  return (
    <div className={`${sizeCls} rounded-full bg-gradient-to-br ${grad} flex items-center justify-center font-bold text-white shadow-md shrink-0`}>
      {symbol.slice(0, 3)}
    </div>
  );
}

// USD value lookup using marketSocket tickers (BTC/USDT, ETH/USDT, …).
// INR: uses live USDT/INR WebSocket rate; fallback ≈84 only when socket not yet ready.
function useUsdPriceLookup() {
  const tickers = useTickers();
  const liveInrRate = useInrRate();
  return useMemo(() => {
    const map = new Map<string, number>();
    for (const t of Object.values(tickers)) {
      if (!t || !t.symbol) continue;
      const [base, quote] = t.symbol.split("/");
      if (quote === "USDT" || quote === "USD") {
        const px = Number(t.lastPrice) || 0;
        if (px > 0 && !map.has(base)) map.set(base, px);
      }
    }
    map.set("USDT", 1);
    map.set("USD", 1);
    map.set("INR", liveInrRate > 0 ? 1 / liveInrRate : 1 / 84);
    return (sym: string): number => map.get(sym.toUpperCase()) ?? 0;
  }, [tickers, liveInrRate]);
}

// ──────────────────────────────────────────────────────────────────
// Wallet page
// ──────────────────────────────────────────────────────────────────
export default function Wallet() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();

  const [hidden, setHidden] = useState<boolean>(() => {
    try { return window.localStorage.getItem(HIDE_KEY) === "1"; } catch { return false; }
  });
  useEffect(() => {
    try { window.localStorage.setItem(HIDE_KEY, hidden ? "1" : "0"); } catch { /* ignore */ }
  }, [hidden]);

  const [tab, setTab] = useState<"ALL" | WalletType>("ALL");
  const [search, setSearch] = useState("");
  const [hideZero, setHideZero] = useState(true);

  // Dialog state
  const [depositOpen, setDepositOpen] = useState<{ currency: string; type: WalletType } | null>(null);
  const [withdrawOpen, setWithdrawOpen] = useState<{ currency: string; type: WalletType } | null>(null);
  const [transferOpen, setTransferOpen] = useState<{ currency?: string } | null>(null);
  const [sendOpen, setSendOpen] = useState<{ currency?: string } | null>(null);
  const [whitelistOpen, setWhitelistOpen] = useState(false);
  const [walletSuccess, setWalletSuccess] = useState<GenericSuccess | null>(null);

  const handleWithdraw = (currency: string, type: WalletType) => {
    if ((user?.kycLevel ?? 0) < 2) {
      toast.error("KYC Level 2 required to withdraw", {
        description: "Complete Intermediate KYC (Aadhaar + documents) to enable withdrawals.",
        action: { label: "Verify Now", onClick: () => setLocation("/kyc") },
      });
      return;
    }
    setWithdrawOpen({ currency, type });
  };

  // ── Queries ──────────────────────────────────────────────────────
  // Server now returns per-item `usdValue` + aggregated totals + live inrRate,
  // so balances stay accurate even when no WS ticker is subscribed.
  const walletQ = useQuery<{
    items: (WalletItem & { usdPrice?: number; usdValue?: number })[];
    totals?: { usd: number; inr: number; count: number; nonZero: number };
    inrRate?: number;
    fees?: { today: { usd: number; inr: number }; total: { usd: number; inr: number } };
    discount?: DiscountInfo;
  }>({
    queryKey: ["wallets"],
    queryFn: () => get("/finance/wallet?perPage=200"),
    enabled: !!user,
    refetchInterval: 7_000,
    refetchOnWindowFocus: true,
  });
  const pnlQ = useQuery<{ today: number; yesterday: number; pnl: number; pnlPct?: number; inrRate?: number; fees?: { today: { usd: number; inr: number }; total: { usd: number; inr: number } }; discount?: DiscountInfo }>({
    queryKey: ["wallet-pnl"],
    queryFn: () => get("/finance/wallet?pnl=true"),
    enabled: !!user,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  const usdOfLive = useUsdPriceLookup();
  const serverInrRate = walletQ.data?.inrRate ?? pnlQ.data?.inrRate ?? 84;

  const items: WalletItem[] = walletQ.data?.items ?? [];

  // Prefer the server-computed price per coin (always populated even when no
  // WS subscription is active); fall back to the live ticker hook for any
  // coin the server didn't have in its cache yet.
  const priceFromServer = useMemo(() => {
    const map = new Map<string, number>();
    for (const it of items) {
      const sym = it.currency?.toUpperCase();
      const px = (it as any).usdPrice;
      if (sym && Number.isFinite(px) && px > 0) map.set(sym, Number(px));
    }
    return map;
  }, [items]);
  const usdOf = (sym: string): number => priceFromServer.get(sym.toUpperCase()) ?? usdOfLive(sym);

  // Aggregate by currency for the "All" overview (sum of all wallet types)
  const aggregated = useMemo(() => {
    const map = new Map<string, { currency: string; free: number; locked: number; byType: Record<WalletType, number> }>();
    for (const w of items) {
      const cur = w.currency.toUpperCase();
      if (!map.has(cur)) map.set(cur, { currency: cur, free: 0, locked: 0, byType: { SPOT: 0, FUTURES: 0, FIAT: 0 } });
      const row = map.get(cur)!;
      row.free += Number(w.balance) || 0;
      row.locked += Number(w.inOrder) || 0;
      row.byType[w.type] = (row.byType[w.type] || 0) + (Number(w.balance) || 0) + (Number(w.inOrder) || 0);
    }
    return [...map.values()];
  }, [items]);

  // Prefer the server's authoritative aggregate; fall back to client-side
  // sum if the server didn't supply one (older API or partial response).
  const totalUsd = useMemo(() => {
    if (typeof walletQ.data?.totals?.usd === "number") return walletQ.data.totals.usd;
    let t = 0;
    for (const a of aggregated) t += (a.free + a.locked) * usdOf(a.currency);
    return Math.round(t * 100) / 100;
  }, [walletQ.data, aggregated]);
  const totalInr = walletQ.data?.totals?.inr ?? totalUsd * serverInrRate;

  // Build display rows
  const displayRows = useMemo(() => {
    if (tab === "ALL") {
      return aggregated
        .map(a => ({
          key: a.currency,
          currency: a.currency,
          type: "ALL" as const,
          free: a.free,
          locked: a.locked,
          total: a.free + a.locked,
          usd: (a.free + a.locked) * usdOf(a.currency),
          byType: a.byType,
        }))
        .filter(r => !hideZero || r.total > 0)
        .filter(r => !search || r.currency.includes(search.toUpperCase()))
        .sort((a, b) => b.usd - a.usd);
    }
    return items
      .filter(w => w.type === tab)
      .map(w => ({
        key: `${w.type}-${w.currency}`,
        currency: w.currency.toUpperCase(),
        type: w.type,
        free: Number(w.balance) || 0,
        locked: Number(w.inOrder) || 0,
        total: (Number(w.balance) || 0) + (Number(w.inOrder) || 0),
        usd: ((Number(w.balance) || 0) + (Number(w.inOrder) || 0)) * usdOf(w.currency),
        byType: undefined as undefined | Record<WalletType, number>,
      }))
      .filter(r => !hideZero || r.total > 0)
      .filter(r => !search || r.currency.includes(search.toUpperCase()))
      .sort((a, b) => b.usd - a.usd);
  }, [tab, items, aggregated, usdOf, search, hideZero]);

  const refresh = () => {
    walletQ.refetch();
    pnlQ.refetch();
  };

  const mask = (s: string) => (hidden ? s.replace(/[\d.]/g, "•") : s);

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-7xl px-4 py-6 space-y-6">
        {/* ─── Hero header ───────────────────────────────────────── */}
        <div className="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-card to-card p-6 sm:p-8 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <WalletIcon className="h-5 w-5 text-primary" />
                <span className="text-sm uppercase tracking-wider text-muted-foreground">Total Equity</span>
                <button
                  type="button"
                  onClick={() => setHidden(h => !h)}
                  className="ml-1 inline-flex items-center justify-center h-7 w-7 rounded-md hover:bg-muted text-muted-foreground"
                  data-testid="button-toggle-hide"
                  aria-label="Toggle balance visibility"
                >
                  {hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  onClick={refresh}
                  className="inline-flex items-center justify-center h-7 w-7 rounded-md hover:bg-muted text-muted-foreground"
                  data-testid="button-refresh"
                  aria-label="Refresh"
                >
                  <RefreshCw className={`h-4 w-4 ${walletQ.isFetching ? "animate-spin" : ""}`} />
                </button>
              </div>
              <div className="space-y-1">
                <div className="text-3xl sm:text-4xl font-bold font-mono tracking-tight" data-testid="text-total-inr">
                  {mask(fmtInr(totalInr))}
                </div>
                <div className="text-base text-muted-foreground font-mono" data-testid="text-total-usd">
                  ≈ {mask(fmtUsd(totalUsd))}
                </div>
              </div>
              {pnlQ.data && (
                <div className="flex items-center gap-2 pt-1">
                  {(pnlQ.data.pnl || 0) >= 0 ? (
                    <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 gap-1">
                      <TrendingUp className="h-3 w-3" /> +{fmtUsd(Math.abs(pnlQ.data.pnl || 0))} 24h
                    </Badge>
                  ) : (
                    <Badge className="bg-rose-500/15 text-rose-400 border-rose-500/30 gap-1">
                      <TrendingDown className="h-3 w-3" /> {fmtUsd(Math.abs(pnlQ.data.pnl || 0))} 24h
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground">vs yesterday</span>
                </div>
              )}
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 sm:gap-3 lg:max-w-2xl w-full">
              <Button
                onClick={() => setDepositOpen({ currency: "USDT", type: "SPOT" })}
                className="h-12 flex-col gap-0.5 bg-primary hover:bg-primary/90"
                data-testid="button-deposit"
              >
                <ArrowDownToLine className="h-4 w-4" />
                <span className="text-xs font-semibold">Deposit</span>
              </Button>
              <Button
                onClick={() => setLocation("/inr")}
                className="h-12 flex-col gap-0.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                data-testid="button-add-inr"
              >
                <Building2 className="h-4 w-4" />
                <span className="text-xs font-semibold">Add INR</span>
              </Button>
              <Button
                onClick={() => handleWithdraw("USDT", "SPOT")}
                variant="secondary"
                className="h-12 flex-col gap-0.5"
                data-testid="button-withdraw"
              >
                <ArrowUpFromLine className="h-4 w-4" />
                <span className="text-xs font-semibold">Withdraw</span>
              </Button>
              <Button
                onClick={() => setTransferOpen({})}
                variant="outline"
                className="h-12 flex-col gap-0.5"
                data-testid="button-transfer"
              >
                <ArrowLeftRight className="h-4 w-4" />
                <span className="text-xs font-semibold">Transfer</span>
              </Button>
              <Button
                onClick={() => setSendOpen({})}
                variant="outline"
                className="h-12 flex-col gap-0.5 border-amber-500/40 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300"
                data-testid="button-p2p-send"
              >
                <SendHorizontal className="h-4 w-4" />
                <span className="text-xs font-semibold">Send</span>
              </Button>
              <Button
                onClick={() => setWhitelistOpen(true)}
                variant="outline"
                className="h-12 flex-col gap-0.5 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300"
                data-testid="button-whitelist"
              >
                <ListChecks className="h-4 w-4" />
                <span className="text-xs font-semibold">Whitelist</span>
              </Button>
            </div>
          </div>

          {/* Wallet-type breakdown chips */}
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <BreakdownChip label="Spot" value={mask(fmtUsd(sumUsdByType(items, "SPOT", usdOf)))} icon={<Sparkles className="h-3.5 w-3.5" />} />
            <BreakdownChip label="Futures" value={mask(fmtUsd(sumUsdByType(items, "FUTURES", usdOf)))} icon={<TrendingUp className="h-3.5 w-3.5" />} />
            <BreakdownChip
              label="Fiat (INR)"
              value={mask(fmtInr(
                items
                  .filter(w => w.type === "FIAT" && w.currency.toUpperCase() === "INR")
                  .reduce((s, w) => s + (Number(w.balance) || 0) + (Number(w.inOrder) || 0), 0)
              ))}
              icon={<Building2 className="h-3.5 w-3.5" />}
              onClick={() => setLocation("/inr")}
            />
            <BreakdownChip label="Assets" value={String(aggregated.filter(a => a.free + a.locked > 0).length)} icon={<WalletIcon className="h-3.5 w-3.5" />} />
          </div>

          {/* Trading-fee + VIP discount summary — server-aggregated across spot
             + futures, plus the user's effective fee tier vs the base "Regular"
             tier so they can see how much they're saving today. */}
          {(() => {
            const fees = walletQ.data?.fees ?? pnlQ.data?.fees;
            const discount = walletQ.data?.discount ?? pnlQ.data?.discount;
            if (!fees && !discount) return null;
            return (
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
                {fees && (
                  <div className="rounded-xl border border-border bg-muted/30 p-3" data-testid="card-fee-today">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Fees paid today</div>
                    <div className="mt-1 text-lg font-semibold font-mono">
                      {mask(fmtUsd(fees.today.usd))}
                    </div>
                    <div className="text-xs text-muted-foreground font-mono">
                      ≈ {mask(fmtInr(fees.today.inr))}
                    </div>
                  </div>
                )}
                {fees && (
                  <div className="rounded-xl border border-border bg-muted/30 p-3" data-testid="card-fee-total">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Fees paid total</div>
                    <div className="mt-1 text-lg font-semibold font-mono">
                      {mask(fmtUsd(fees.total.usd))}
                    </div>
                    <div className="text-xs text-muted-foreground font-mono">
                      ≈ {mask(fmtInr(fees.total.inr))}
                    </div>
                  </div>
                )}
                {discount && (
                  <DiscountCard discount={discount} />
                )}
              </div>
            );
          })()}
        </div>

        {/* ─── Asset tabs + search + hide-zero ───────────────────── */}
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 border-b border-border">
            <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
              <TabsList className="bg-muted">
                <TabsTrigger value="ALL" data-testid="tab-all">Overview</TabsTrigger>
                <TabsTrigger value="SPOT" data-testid="tab-spot">Spot</TabsTrigger>
                <TabsTrigger value="FUTURES" data-testid="tab-futures">Futures</TabsTrigger>
                <TabsTrigger value="FIAT" data-testid="tab-fiat">Fiat</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search asset"
                  className="h-9 w-44 pl-8"
                  data-testid="input-search"
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                <Switch checked={hideZero} onCheckedChange={setHideZero} data-testid="switch-hide-zero" />
                <span>Hide 0 balances</span>
              </label>
            </div>
          </div>

          {/* Table */}
          <AssetTable
            rows={displayRows}
            tab={tab}
            isLoading={walletQ.isLoading}
            isError={walletQ.isError}
            onRetry={() => walletQ.refetch()}
            usdOf={usdOf}
            inrRate={serverInrRate}
            mask={mask}
            onDeposit={(currency, type) => setDepositOpen({ currency, type: type === "ALL" ? "SPOT" : type })}
            onWithdraw={(currency, type) => handleWithdraw(currency, type === "ALL" ? "SPOT" : type)}
            onTransfer={(currency) => setTransferOpen({ currency })}
            onTrade={(currency) => setLocation(`/trade/${currency}_USDT`)}
          />
        </div>

        {/* ─── Transaction history ───────────────────────────────── */}
        <TransactionHistory />
      </div>

      {/* ─── Dialogs ─────────────────────────────────────────────── */}
      {depositOpen && (
        <DepositDialog
          open={!!depositOpen}
          onClose={() => setDepositOpen(null)}
          initialCurrency={depositOpen.currency}
          initialType={depositOpen.type}
          allItems={items}
        />
      )}
      {withdrawOpen && (
        <WithdrawDialog
          open={!!withdrawOpen}
          onClose={() => setWithdrawOpen(null)}
          initialCurrency={withdrawOpen.currency}
          initialType={withdrawOpen.type}
          allItems={items}
          onDone={() => { walletQ.refetch(); qc.invalidateQueries({ queryKey: ["transactions"] }); }}
          onSuccess={(d) => setWalletSuccess(d)}
        />
      )}
      {transferOpen && (
        <TransferDialog
          open={!!transferOpen}
          onClose={() => setTransferOpen(null)}
          initialCurrency={transferOpen.currency}
          allItems={items}
          onDone={() => { walletQ.refetch(); qc.invalidateQueries({ queryKey: ["transactions"] }); }}
          onSuccess={(d) => setWalletSuccess(d)}
        />
      )}
      {sendOpen && (
        <SendToUserDialog
          open={!!sendOpen}
          onClose={() => setSendOpen(null)}
          initialCurrency={sendOpen.currency}
          allItems={items}
          onDone={() => { walletQ.refetch(); qc.invalidateQueries({ queryKey: ["transactions"] }); }}
          onSuccess={(d) => setWalletSuccess(d)}
        />
      )}

      <ManageWhitelistDialog open={whitelistOpen} onClose={() => setWhitelistOpen(false)} />

      <SuccessModal
        open={walletSuccess !== null}
        onClose={() => setWalletSuccess(null)}
        payload={walletSuccess}
      />
    </div>
  );
}

function sumUsdByType(items: WalletItem[], type: WalletType, usdOf: (s: string) => number): number {
  let t = 0;
  for (const w of items) {
    if (w.type !== type) continue;
    t += ((Number(w.balance) || 0) + (Number(w.inOrder) || 0)) * usdOf(w.currency);
  }
  return Math.round(t * 100) / 100;
}
function sumByCurrency(items: WalletItem[], currency: string): number {
  let t = 0;
  for (const w of items) {
    if (w.currency.toUpperCase() !== currency) continue;
    t += (Number(w.balance) || 0) + (Number(w.inOrder) || 0);
  }
  return t;
}

function BreakdownChip({ label, value, icon, onClick }: { label: string; value: string; icon: React.ReactNode; onClick?: () => void }) {
  return (
    <div
      className={`rounded-xl border border-border bg-card/50 px-4 py-3 transition-colors ${onClick ? "cursor-pointer hover:border-amber-500/40 hover:bg-amber-500/5" : ""}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
    >
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
        {icon}
        {label}
      </div>
      <div className="text-base sm:text-lg font-semibold font-mono">{value}</div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Asset table
// ──────────────────────────────────────────────────────────────────
type Row = {
  key: string;
  currency: string;
  type: WalletType | "ALL";
  free: number;
  locked: number;
  total: number;
  usd: number;
  byType?: Record<WalletType, number>;
};
function AssetTable({
  rows,
  tab,
  isLoading,
  isError,
  onRetry,
  usdOf,
  inrRate,
  mask,
  onDeposit,
  onWithdraw,
  onTransfer,
  onTrade,
}: {
  rows: Row[];
  tab: "ALL" | WalletType;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  usdOf: (s: string) => number;
  inrRate: number;
  mask: (s: string) => string;
  onDeposit: (currency: string, type: WalletType | "ALL") => void;
  onWithdraw: (currency: string, type: WalletType | "ALL") => void;
  onTransfer: (currency: string) => void;
  onTrade: (currency: string) => void;
}) {
  if (isError) {
    return (
      <div className="p-12 text-center">
        <AlertCircle className="h-10 w-10 mx-auto mb-3 text-rose-400" />
        <div className="font-semibold mb-1">Failed to load wallets</div>
        <div className="text-sm text-muted-foreground mb-4">There was a problem reaching your balances.</div>
        <Button onClick={onRetry} variant="outline" size="sm" data-testid="button-wallet-retry">
          <RefreshCw className="h-4 w-4 mr-2" />
          Retry
        </Button>
      </div>
    );
  }
  if (isLoading) {
    return (
      <div className="p-12 text-center text-muted-foreground">
        <RefreshCw className="h-5 w-5 mx-auto mb-2 animate-spin" />
        Loading balances…
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="p-12 text-center text-muted-foreground">
        <WalletIcon className="h-10 w-10 mx-auto mb-3 opacity-50" />
        <div className="font-semibold mb-1">No assets to show</div>
        <div className="text-sm">Try a different tab, clear the search, or deposit funds to get started.</div>
      </div>
    );
  }
  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Asset</th>
              <th className="text-right px-4 py-3 font-medium">Free</th>
              <th className="text-right px-4 py-3 font-medium">Locked</th>
              <th className="text-right px-4 py-3 font-medium">Total</th>
              <th className="text-right px-4 py-3 font-medium">₹ Value</th>
              <th className="text-right px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.key} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors" data-testid={`row-asset-${r.currency}`}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <CoinIcon symbol={r.currency} />
                    <div>
                      <div className="font-semibold">{r.currency}</div>
                      <div className="text-xs text-muted-foreground">
                        {tab === "ALL" && r.byType
                          ? Object.entries(r.byType).filter(([, v]) => v > 0).map(([k, v]) => `${k}: ${fmtNum(v, 5)}`).join(" · ") || "—"
                          : usdOf(r.currency) > 0
                            ? "@ " + usdOf(r.currency).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 }) + " USDT"
                            : "—"}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-right font-mono">{mask(fmtNum(r.free, r.currency === "INR" ? 2 : 6))}</td>
                <td className="px-4 py-3 text-right font-mono text-muted-foreground">{mask(fmtNum(r.locked, r.currency === "INR" ? 2 : 6))}</td>
                <td className="px-4 py-3 text-right font-mono font-semibold">{mask(fmtNum(r.total, r.currency === "INR" ? 2 : 6))}</td>
                <td className="px-4 py-3 text-right font-mono">{mask(fmtInr(r.usd * inrRate))}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => onDeposit(r.currency, r.type)} data-testid={`button-deposit-${r.currency}`}>Deposit</Button>
                    <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => onWithdraw(r.currency, r.type)} data-testid={`button-withdraw-${r.currency}`}>Withdraw</Button>
                    <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => onTransfer(r.currency)} data-testid={`button-transfer-${r.currency}`}>Transfer</Button>
                    {r.currency !== "INR" && (
                      <Button size="sm" variant="outline" className="h-8 px-3 text-xs" onClick={() => onTrade(r.currency)} data-testid={`button-trade-${r.currency}`}>Trade</Button>
                    )}
                    <Link href={`/ledger?coin=${r.currency}`}>
                      <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" data-testid={`button-history-${r.currency}`}>History</Button>
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden divide-y divide-border">
        {rows.map(r => (
          <div key={r.key} className="p-4" data-testid={`card-asset-${r.currency}`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <CoinIcon symbol={r.currency} />
                <div>
                  <div className="font-semibold">{r.currency}</div>
                  <div className="text-xs text-muted-foreground">{usdOf(r.currency) > 0 ? "@ " + usdOf(r.currency).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 }) + " USDT" : "—"}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono font-semibold">{mask(fmtNum(r.total, r.currency === "INR" ? 2 : 6))}</div>
                <div className="text-xs text-muted-foreground font-mono">{mask(fmtInr(r.usd * inrRate))}</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs mb-3">
              <div className="bg-muted/40 rounded-md p-2">
                <div className="text-muted-foreground mb-0.5">Free</div>
                <div className="font-mono">{mask(fmtNum(r.free, r.currency === "INR" ? 2 : 6))}</div>
              </div>
              <div className="bg-muted/40 rounded-md p-2">
                <div className="text-muted-foreground mb-0.5">Locked</div>
                <div className="font-mono">{mask(fmtNum(r.locked, r.currency === "INR" ? 2 : 6))}</div>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button size="sm" variant="outline" className="flex-1 h-9 text-xs" onClick={() => onDeposit(r.currency, r.type)}>Deposit</Button>
              <Button size="sm" variant="outline" className="flex-1 h-9 text-xs" onClick={() => onWithdraw(r.currency, r.type)}>Withdraw</Button>
              <Button size="sm" variant="outline" className="flex-1 h-9 text-xs" onClick={() => onTransfer(r.currency)}>Transfer</Button>
              <Link href={`/ledger?coin=${r.currency}`} className="flex-1">
                <Button size="sm" variant="ghost" className="w-full h-9 text-xs">History</Button>
              </Link>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// ──────────────────────────────────────────────────────────────────
// Transaction history
// ──────────────────────────────────────────────────────────────────
function TransactionHistory() {
  const { user } = useAuth();
  const [type, setType] = useState<"ALL" | "DEPOSIT" | "WITHDRAW" | "TRADE">("ALL");
  const [status, setStatus] = useState<"ALL" | "PENDING" | "COMPLETED" | "FAILED" | "REJECTED">("ALL");
  const [currency, setCurrency] = useState("");
  const [page, setPage] = useState(1);
  const [selectedTx, setSelectedTx] = useState<Tx | null>(null);
  const perPage = 20;

  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("perPage", String(perPage));
  if (type !== "ALL") params.set("type", type);
  if (status !== "ALL") params.set("status", status);
  if (currency.trim()) params.set("currency", currency.trim().toUpperCase());

  const txQ = useQuery<TxResponse>({
    queryKey: ["transactions", type, status, currency, page],
    queryFn: () => get(`/finance/transaction?${params.toString()}`),
    enabled: !!user,
    refetchInterval: 30_000,
  });

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [type, status, currency]);

  const items = txQ.data?.items ?? [];
  const totalPages = txQ.data?.pagination.totalPages ?? 1;

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="p-4 sm:p-5 border-b border-border flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Transaction History</h2>
          <p className="text-xs text-muted-foreground">Deposits, withdrawals & trades across all wallets</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={type} onValueChange={(v) => setType(v as any)}>
            <SelectTrigger className="h-9 w-32" data-testid="select-tx-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All types</SelectItem>
              <SelectItem value="DEPOSIT">Deposit</SelectItem>
              <SelectItem value="WITHDRAW">Withdraw</SelectItem>
              <SelectItem value="TRADE">Trade</SelectItem>
              <SelectItem value="TRANSFER">Transfer</SelectItem>
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={(v) => setStatus(v as any)}>
            <SelectTrigger className="h-9 w-32" data-testid="select-tx-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All status</SelectItem>
              <SelectItem value="PENDING">Pending</SelectItem>
              <SelectItem value="COMPLETED">Completed</SelectItem>
              <SelectItem value="FAILED">Failed</SelectItem>
              <SelectItem value="REJECTED">Rejected</SelectItem>
            </SelectContent>
          </Select>
          <Input
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            placeholder="Currency"
            className="h-9 w-28 uppercase"
            data-testid="input-tx-currency"
          />
        </div>
      </div>

      {txQ.isError ? (
        <div className="p-12 text-center">
          <AlertCircle className="h-10 w-10 mx-auto mb-3 text-rose-400" />
          <div className="font-semibold mb-1">Failed to load transactions</div>
          <Button onClick={() => txQ.refetch()} variant="outline" size="sm" className="mt-3" data-testid="button-tx-retry">
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </div>
      ) : txQ.isLoading ? (
        <div className="p-12 text-center text-muted-foreground">
          <RefreshCw className="h-5 w-5 mx-auto mb-2 animate-spin" />
          Loading transactions…
        </div>
      ) : items.length === 0 ? (
        <div className="p-12 text-center text-muted-foreground">
          <Clock className="h-10 w-10 mx-auto mb-3 opacity-50" />
          <div className="font-semibold mb-1">No transactions yet</div>
          <div className="text-sm">Your deposits, withdrawals and trades will appear here.</div>
        </div>
      ) : (
        <>
          {/* Desktop */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Type</th>
                  <th className="text-left px-4 py-3 font-medium">Asset</th>
                  <th className="text-right px-4 py-3 font-medium">Amount</th>
                  <th className="text-right px-4 py-3 font-medium">Fee</th>
                  <th className="text-left px-4 py-3 font-medium">Reference</th>
                  <th className="text-center px-4 py-3 font-medium">Status</th>
                  <th className="text-right px-4 py-3 font-medium">Time</th>
                </tr>
              </thead>
              <tbody>
                {items.map(tx => (
                  <tr
                    key={tx.id}
                    className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors cursor-pointer"
                    data-testid={`row-tx-${tx.id}`}
                    onClick={() => setSelectedTx(tx)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedTx(tx); } }}
                  >
                    <td className="px-4 py-3">
                      <TxTypeBadge type={tx.type} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <CoinIcon symbol={tx.wallet.currency} size={7} />
                        <div>
                          <div className="font-semibold">{tx.wallet.currency}</div>
                          <div className="text-[11px] text-muted-foreground">{tx.wallet.type}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{fmtNum(tx.amount, tx.wallet.currency === "INR" ? 2 : 6)}</td>
                    <td className="px-4 py-3 text-right font-mono text-muted-foreground">{fmtNum(tx.fee, tx.wallet.currency === "INR" ? 2 : 6)}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      {(tx.referenceId || tx.trxId) && (
                        <div title={tx.referenceId || tx.trxId || ""}>{shortHash(tx.referenceId || tx.trxId)}</div>
                      )}
                      {tx.type === "WITHDRAW" && tx.toAddress && (
                        <div className="text-[10px] text-sky-400/80 mt-0.5" title={tx.toAddress}>
                          → {tx.toAddress.length > 20 ? tx.toAddress.slice(0, 10) + "…" + tx.toAddress.slice(-8) : tx.toAddress}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge status={tx.status} />
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-muted-foreground" title={new Date(tx.createdAt).toLocaleString()}>
                      {relTime(tx.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile */}
          <div className="md:hidden divide-y divide-border">
            {items.map(tx => (
              <div
                key={tx.id}
                className="p-4 cursor-pointer hover:bg-muted/20 transition-colors"
                data-testid={`card-tx-${tx.id}`}
                onClick={() => setSelectedTx(tx)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedTx(tx); } }}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <CoinIcon symbol={tx.wallet.currency} size={8} />
                    <div>
                      <div className="font-semibold flex items-center gap-2">
                        {tx.wallet.currency}
                        <TxTypeBadge type={tx.type} />
                      </div>
                      <div className="text-[11px] text-muted-foreground">{tx.wallet.type} · {relTime(tx.createdAt)}</div>
                    </div>
                  </div>
                  <StatusBadge status={tx.status} />
                </div>
                <div className="flex items-center justify-between text-sm">
                  <div>
                    <div className="text-[11px] text-muted-foreground">Amount</div>
                    <div className="font-mono font-semibold">{fmtNum(tx.amount, tx.wallet.currency === "INR" ? 2 : 6)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] text-muted-foreground">Fee</div>
                    <div className="font-mono">{fmtNum(tx.fee, tx.wallet.currency === "INR" ? 2 : 6)}</div>
                  </div>
                </div>
                {(tx.referenceId || tx.trxId) && (
                  <div className="mt-2 pt-2 border-t border-border text-[11px] text-muted-foreground font-mono break-all">
                    {tx.referenceId || tx.trxId}
                  </div>
                )}
                {tx.type === "WITHDRAW" && tx.toAddress && (
                  <div className="mt-1 text-[11px] text-sky-400/80 font-mono break-all">
                    → {tx.toAddress}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="p-4 border-t border-border flex items-center justify-between">
              <div className="text-xs text-muted-foreground">
                Page {page} of {totalPages} · {txQ.data?.pagination.totalItems ?? 0} total
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  data-testid="button-tx-prev"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  data-testid="button-tx-next"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <TxDetailsDialog tx={selectedTx} onClose={() => setSelectedTx(null)} />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Transaction details — shows every field the row carries plus
// trade-only metadata (pair / side / price / order id) when present.
// We render straight from the row; the listing endpoint already has
// everything the per-id endpoint would return.
// ──────────────────────────────────────────────────────────────────
function TxDetailsDialog({ tx, onClose }: { tx: Tx | null; onClose: () => void }) {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (key: string, val: string) => {
    try {
      await navigator.clipboard.writeText(val);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
    } catch {
      toast.error("Copy failed — please copy manually");
    }
  };

  if (!tx) return null;

  // The list endpoint stuffs trade-only context into description / referenceId.
  // We pull it back out here so the dialog can show side/price/orderId nicely.
  const meta: { side?: string; price?: number; orderId?: string | number; pair?: string } = {};
  if (tx.type === "TRADE") {
    const m = (tx.description || "").match(/^(BUY|SELL)\s+(\S+)\s+@\s+([\d.]+)/i);
    if (m) {
      meta.side = m[1].toUpperCase();
      meta.pair = m[2];
      meta.price = Number(m[3]);
    }
  }

  const ccy = tx.wallet.currency || "";
  const digits = ccy === "INR" ? 2 : 6;
  // Spot trade fee settles in the QUOTE coin (INR / USDT etc), not the
  // base coin shown in `wallet.currency`. Older API rows that don't carry
  // feeCurrency (deposits / withdrawals before the field existed) fall
  // back to the wallet currency, where they happen to match anyway.
  const feeCcy = tx.feeCurrency || ccy;
  const feeDigits = feeCcy === "INR" ? 2 : 6;
  const absTime = (() => {
    const d = new Date(tx.createdAt);
    return isFinite(d.getTime()) ? d.toLocaleString() : tx.createdAt;
  })();

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg" data-testid="dialog-tx-details">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TxTypeBadge type={tx.type} />
            <span>
              {tx.type === "TRADE"
                ? `${meta.side ?? "Trade"} ${meta.pair ?? ccy}`
                : tx.type === "TRANSFER"
                ? `Transfer ${ccy}`
                : `${tx.type === "DEPOSIT" ? "Deposit" : "Withdraw"} ${ccy}`}
            </span>
          </DialogTitle>
          <DialogDescription>
            {absTime} · <span className="text-muted-foreground">{relTime(tx.createdAt)}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <DetailRow label="Status" value={<StatusBadge status={tx.status} />} />
          <DetailRow
            label="Amount"
            value={<span className="font-mono">{fmtNum(tx.amount, digits)} {ccy}</span>}
          />
          <DetailRow
            label="Fee"
            value={<span className="font-mono">{fmtNum(tx.fee, feeDigits)} {feeCcy}</span>}
          />
          <DetailRow label="Wallet" value={<span>{ccy} · <span className="text-muted-foreground">{tx.wallet.type}</span></span>} />
          {tx.type === "TRADE" && meta.price != null && (
            <DetailRow
              label="Trade price"
              value={<span className="font-mono">{fmtNum(meta.price, 2)}{meta.pair?.endsWith("INR") ? " INR" : meta.pair?.includes("USDT") ? " USDT" : ""}</span>}
            />
          )}
          {tx.description && (
            <DetailRow label="Description" value={<span className="text-foreground/90">{tx.description}</span>} />
          )}
          {tx.type === "TRANSFER" && tx.metadata?.fromWallet && (
            <DetailRow
              label="From Wallet"
              value={<span className="font-semibold text-violet-300 uppercase">{String(tx.metadata.fromWallet)}</span>}
            />
          )}
          {tx.type === "TRANSFER" && tx.metadata?.toWallet && (
            <DetailRow
              label="To Wallet"
              value={<span className="font-semibold text-violet-300 uppercase">{String(tx.metadata.toWallet)}</span>}
            />
          )}
          {tx.type === "WITHDRAW" && tx.toAddress && (
            <DetailRow
              label="To Address"
              value={
                <button
                  type="button"
                  className="font-mono text-xs break-all text-left hover:text-sky-300 text-sky-400 transition-colors flex items-center gap-1"
                  onClick={() => copy("addr", String(tx.toAddress))}
                  data-testid="button-copy-address"
                  title="Click to copy address"
                >
                  <span>{tx.toAddress}</span>
                  {copied === "addr" ? <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" /> : <Copy className="h-3 w-3 opacity-60 shrink-0" />}
                </button>
              }
            />
          )}
          {tx.type === "WITHDRAW" && tx.memo && (
            <DetailRow
              label="Memo / Tag"
              value={
                <button
                  type="button"
                  className="font-mono text-xs break-all text-left hover:text-primary transition-colors flex items-center gap-1"
                  onClick={() => copy("memo", String(tx.memo))}
                  data-testid="button-copy-memo"
                  title="Click to copy memo"
                >
                  <span>{tx.memo}</span>
                  {copied === "memo" ? <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" /> : <Copy className="h-3 w-3 opacity-60 shrink-0" />}
                </button>
              }
            />
          )}
          {tx.referenceId && (
            <DetailRow
              label="Reference"
              value={
                <button
                  type="button"
                  className="font-mono text-xs break-all text-left hover:text-primary transition-colors flex items-center gap-1"
                  onClick={() => copy("ref", String(tx.referenceId))}
                  data-testid="button-copy-ref"
                  title="Click to copy"
                >
                  <span>{tx.referenceId}</span>
                  {copied === "ref" ? <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" /> : <Copy className="h-3 w-3 opacity-60 shrink-0" />}
                </button>
              }
            />
          )}
          {tx.trxId && tx.trxId !== tx.referenceId && (
            <DetailRow
              label="Tx ID"
              value={
                <button
                  type="button"
                  className="font-mono text-xs break-all text-left hover:text-primary transition-colors flex items-center gap-1"
                  onClick={() => copy("trx", String(tx.trxId))}
                  data-testid="button-copy-trx"
                  title="Click to copy"
                >
                  <span>{tx.trxId}</span>
                  {copied === "trx" ? <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" /> : <Copy className="h-3 w-3 opacity-60 shrink-0" />}
                </button>
              }
            />
          )}
          {tx.rejectReason && (
            <DetailRow
              label="Reject Reason"
              value={<span className="text-rose-400 text-xs">{tx.rejectReason}</span>}
            />
          )}
          {tx.explorerUrl && (tx.referenceId || tx.trxId) && (
            <DetailRow
              label="View on Explorer"
              value={
                <a
                  href={`${tx.explorerUrl.replace(/\/$/, "")}/${tx.referenceId || tx.trxId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sky-400 hover:text-sky-300 text-xs flex items-center gap-1 transition-colors"
                >
                  <span className="font-mono truncate max-w-[200px]">{tx.referenceId || tx.trxId}</span>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3 shrink-0"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                </a>
              }
            />
          )}
          <DetailRow
            label="Internal ID"
            value={<span className="font-mono text-xs text-muted-foreground">{tx.id}</span>}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} data-testid="button-tx-close">Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1 border-b border-border/60 last:border-0">
      <div className="text-xs uppercase tracking-wide text-muted-foreground pt-0.5 shrink-0">{label}</div>
      <div className="text-right">{value}</div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// VIP-tier discount card — shows the user's current tier and the
// effective spot/futures rates plus a "you're saving X%" badge
// computed against the base "Regular" tier on the server.
// ──────────────────────────────────────────────────────────────────
function DiscountCard({ discount }: { discount: DiscountInfo }) {
  const pctFmt = (frac: number) => (frac * 100).toFixed(3).replace(/\.?0+$/, "") + "%";
  const bestSaving = Math.max(
    discount.discountPct.spotMaker,
    discount.discountPct.spotTaker,
    discount.discountPct.futuresMaker,
    discount.discountPct.futuresTaker,
    discount.withdrawDiscountPct,
  );
  return (
    <div
      className="rounded-xl border border-border bg-gradient-to-br from-amber-500/10 to-amber-500/5 p-3"
      data-testid="card-fee-discount"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Your fee tier</div>
        <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-400">
          <Sparkles className="h-2.5 w-2.5" />
          {discount.vipName}
        </span>
      </div>
      <div className="mt-1 text-lg font-semibold font-mono">
        {bestSaving > 0 ? `−${bestSaving.toFixed(bestSaving < 10 ? 2 : 1)}%` : "0%"}
        <span className="text-xs text-muted-foreground font-normal ml-2">discount</span>
      </div>
      <div className="mt-1.5 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
        <div>Spot taker</div>
        <div className="text-right font-mono text-foreground/80">{pctFmt(discount.spot.taker)}</div>
        <div>Spot maker</div>
        <div className="text-right font-mono text-foreground/80">{pctFmt(discount.spot.maker)}</div>
        <div>Futures taker</div>
        <div className="text-right font-mono text-foreground/80">{pctFmt(discount.futures.taker)}</div>
        <div>Withdraw off</div>
        <div className="text-right font-mono text-foreground/80">{discount.withdrawDiscountPct}%</div>
      </div>
    </div>
  );
}

function TxTypeBadge({ type }: { type: "DEPOSIT" | "WITHDRAW" | "TRADE" | "TRANSFER" }) {
  const cfg =
    type === "DEPOSIT"
      ? { cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", Icon: ArrowDownToLine }
      : type === "WITHDRAW"
      ? { cls: "bg-rose-500/15 text-rose-400 border-rose-500/30", Icon: ArrowUpFromLine }
      : type === "TRANSFER"
      ? { cls: "bg-violet-500/15 text-violet-400 border-violet-500/30", Icon: ArrowLeftRight }
      : { cls: "bg-sky-500/15 text-sky-400 border-sky-500/30", Icon: ArrowLeftRight };
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium ${cfg.cls}`}>
      <cfg.Icon className="h-3 w-3" />
      {type}
    </span>
  );
}

// ──────────────────────────────────────────────────────────────────
// Deposit dialog
// ──────────────────────────────────────────────────────────────────
// ──────────────────────────────────────────────────────────────────
// Network branding helpers
// ──────────────────────────────────────────────────────────────────
type NetBrand = { color: string; bg: string; border: string; label: string; badge: string; time: string };
function netBrand(chain: string): NetBrand {
  const c = chain.toUpperCase();
  if (c === "BNB" || c === "BSC")
    return { color: "#F0B90B", bg: "rgba(240,185,11,0.1)", border: "rgba(240,185,11,0.35)", label: "BNB Smart Chain", badge: "BEP20", time: "~3 min" };
  if (c === "ETH")
    return { color: "#627EEA", bg: "rgba(98,126,234,0.1)", border: "rgba(98,126,234,0.35)", label: "Ethereum", badge: "ERC20", time: "~3 min" };
  if (c === "TRX" || c === "TRON")
    return { color: "#EF0027", bg: "rgba(239,0,39,0.1)", border: "rgba(239,0,39,0.35)", label: "Tron Network", badge: "TRC20", time: "~1 min" };
  if (c === "BTC" || c === "BITCOIN")
    return { color: "#F7931A", bg: "rgba(247,147,26,0.1)", border: "rgba(247,147,26,0.35)", label: "Bitcoin", badge: "Native", time: "~30 min" };
  if (c === "SOL" || c === "SOLANA")
    return { color: "#9945FF", bg: "rgba(153,69,255,0.1)", border: "rgba(153,69,255,0.35)", label: "Solana", badge: "SPL", time: "~30 sec" };
  if (c === "POLYGON" || c === "MATIC")
    return { color: "#8247E5", bg: "rgba(130,71,229,0.1)", border: "rgba(130,71,229,0.35)", label: "Polygon", badge: "Polygon", time: "~2 min" };
  return { color: "#94a3b8", bg: "rgba(148,163,184,0.1)", border: "rgba(148,163,184,0.35)", label: chain, badge: chain, time: "~5 min" };
}
const EVM_CHAINS = new Set(["ETH","BNB","BSC","POLYGON","MATIC","ARBITRUM","BASE","AVAX","OP","OPTIMISM"]);
function isEvmChain(chain: string) { return EVM_CHAINS.has(chain.toUpperCase()); }

// ──────────────────────────────────────────────────────────────────
// DepositDialog — premium professional redesign
// ──────────────────────────────────────────────────────────────────
function DepositDialog({
  open, onClose, initialCurrency, initialType, allItems,
}: {
  open: boolean; onClose: () => void; initialCurrency: string; initialType: WalletType; allItems: WalletItem[];
}) {
  const [type, setType] = useState<WalletType>(initialType === "FIAT" ? "FIAT" : "SPOT");
  const [currency, setCurrency] = useState(initialCurrency);
  const [selectedChain, setSelectedChain] = useState("");
  const [copied, setCopied] = useState(false);
  const [addrExpanded, setAddrExpanded] = useState(false);
  const [showQr, setShowQr] = useState(true);
  const [qrDownloading, setQrDownloading] = useState(false);
  const [claimOpen, setClaimOpen] = useState(false);
  const [claimTx, setClaimTx] = useState("");
  const [claimAmt, setClaimAmt] = useState("");
  const [claimFrom, setClaimFrom] = useState("");
  const qc = useQueryClient();

  const claimMut = useMutation({
    mutationFn: (body: { symbol: string; networkId: number; txHash: string; amount: number; fromAddress?: string }) =>
      post("/finance/deposit/claim", body),
    onSuccess: () => {
      toast.success("Claim submitted! Our team will review your transaction within 24 hours.");
      setClaimTx(""); setClaimAmt(""); setClaimFrom(""); setClaimOpen(false);
      qc.invalidateQueries({ queryKey: ["deposit-claims"] });
    },
    onError: (e: Error) => toast.error(e.message ?? "Failed to submit claim"),
  });

  const enabledQ = useQuery<{ currency: string; name?: string; networks: string[] }[]>({
    queryKey: ["enabled-coins", type === "FIAT" ? "fiat" : "spot", "deposit"],
    queryFn: () => get(`/finance/currency/${type === "FIAT" ? "fiat" : "spot"}?action=deposit`),
    enabled: open,
    staleTime: 60_000,
  });

  const currencies = useMemo(() => {
    const enabled = (enabledQ.data ?? []).map(c => c.currency.toUpperCase());
    if (type === "FIAT") return enabled.includes("INR") ? ["INR"] : enabled;
    return enabled.filter(c => c !== "INR").sort();
  }, [enabledQ.data, type]);

  useEffect(() => {
    if (currencies.length > 0 && !currencies.includes(currency)) setCurrency(currencies[0]);
  }, [currencies, currency]);

  type NetworkRow = {
    id: number; chain: string; name: string; fee: number;
    minWithdraw: number; minDeposit: number; confirmations: number;
    memoRequired: boolean; address: string; memo: string | null; isEvm?: boolean;
  };
  const detailsQ = useQuery<{ networks?: NetworkRow[] }>({
    queryKey: ["deposit-details", type, currency],
    queryFn: () => get(`/finance/currency/${type === "FIAT" ? "fiat" : "spot"}/${currency}?action=deposit`),
    enabled: open && type !== "FIAT" && !!currency,
    retry: 1,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const networks: NetworkRow[] = (() => {
    const seen = new Set<string>();
    return (detailsQ.data?.networks ?? []).filter(n => {
      if (["TRX","TRON","TRC20"].includes(n.chain.toUpperCase()) || n.name.toUpperCase() === "TRC20") return false;
      const key = n.chain.toUpperCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  })();

  useEffect(() => {
    if (networks.length > 0) {
      const found = networks.find(n => n.chain.toUpperCase() === selectedChain.toUpperCase());
      if (!found) setSelectedChain(networks[0].chain);
    }
  }, [networks, selectedChain]);

  const activeNet = networks.find(n => n.chain.toUpperCase() === selectedChain.toUpperCase()) ?? networks[0] ?? null;
  const brand = activeNet ? netBrand(activeNet.chain) : null;
  const isEvmSelected = activeNet ? isEvmChain(activeNet.chain) : false;

  // Count how many EVM networks exist for this coin
  const evmNets = networks.filter(n => isEvmChain(n.chain));
  const showEvmUniversalBadge = isEvmSelected && evmNets.length >= 2;

  const copyAddr = async () => {
    if (!activeNet?.address) return;
    try {
      await navigator.clipboard.writeText(activeNet.address);
      setCopied(true);
      toast.success("Address copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Copy failed — please copy manually");
    }
  };

  const copyMemo = async (memo: string) => {
    try {
      await navigator.clipboard.writeText(memo);
      toast.success("Memo copied");
    } catch {
      toast.error("Copy failed");
    }
  };

  const downloadQr = async () => {
    if (!activeNet?.address) return;
    setQrDownloading(true);
    try {
      const svg = document.getElementById("cryptox-deposit-qr");
      if (!svg) { toast.error("QR not visible"); return; }
      const serialized = new XMLSerializer().serializeToString(svg);
      const blob = new Blob([serialized], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `deposit-${currency}-${activeNet.chain}.svg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("QR saved");
    } catch {
      toast.error("Download failed");
    } finally {
      setQrDownloading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-[520px] p-0 overflow-hidden gap-0">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-border/50">
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-emerald-500/15 ring-1 ring-emerald-500/30">
              <ArrowDownToLine className="h-4 w-4 text-emerald-400" />
            </div>
            Deposit Funds
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground mt-1 ml-10">
            {type === "FIAT" ? "Bank / UPI transfer instructions for INR deposits." : "Send crypto to your personal deposit address below."}
          </DialogDescription>
        </div>

        <div className="px-6 py-5 space-y-5 max-h-[76vh] overflow-y-auto">
          {/* Mode tabs */}
          <Tabs value={type} onValueChange={(v) => { setType(v as WalletType); setSelectedChain(""); }}>
            <TabsList className="grid grid-cols-2 w-full h-9">
              <TabsTrigger value="SPOT" className="text-xs font-medium" data-testid="tab-deposit-crypto">Crypto</TabsTrigger>
              <TabsTrigger value="FIAT" className="text-xs font-medium" data-testid="tab-deposit-fiat">INR (Fiat)</TabsTrigger>
            </TabsList>
          </Tabs>

          {type !== "FIAT" ? (
            <>
              {/* Coin selector */}
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 block">Select Coin</label>
                <Select value={currency} onValueChange={(v) => { setCurrency(v); setSelectedChain(""); }}>
                  <SelectTrigger className="h-11" data-testid="select-deposit-coin">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {currencies.map(c => (
                      <SelectItem key={c} value={c}>
                        <div className="flex items-center gap-2">
                          <div className="w-5 h-5 rounded-full bg-amber-500/20 flex items-center justify-center text-[10px] font-bold text-amber-400">
                            {c[0]}
                          </div>
                          {c}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Network cards */}
              {detailsQ.isLoading ? (
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block">Select Network</label>
                  {[0,1,2].map(i => (
                    <div key={i} className="h-16 rounded-xl border border-border bg-muted/20 animate-pulse" />
                  ))}
                </div>
              ) : detailsQ.isError ? (
                <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-400 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span className="flex-1">Failed to load networks.</span>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => detailsQ.refetch()}>Retry</Button>
                </div>
              ) : networks.length > 0 ? (
                <>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 block">Select Network</label>
                    <div className="space-y-2">
                      {networks.map(net => {
                        const b = netBrand(net.chain);
                        const isActive = net.chain.toUpperCase() === (activeNet?.chain ?? "").toUpperCase();
                        const isEvm = isEvmChain(net.chain);
                        return (
                          <button
                            key={net.id}
                            onClick={() => setSelectedChain(net.chain)}
                            className={`w-full text-left rounded-xl border p-3.5 transition-all duration-150 ${
                              isActive
                                ? "ring-2 ring-offset-0"
                                : "border-border/50 bg-muted/10 hover:bg-muted/30 hover:border-border"
                            }`}
                            style={isActive ? {
                              borderColor: b.border,
                              backgroundColor: b.bg,
                              boxShadow: `0 0 0 2px ${b.color}40`,
                            } : {}}
                            data-testid={`net-card-${net.chain}`}
                          >
                            <div className="flex items-center gap-3">
                              {/* Network color dot */}
                              <div
                                className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black shrink-0"
                                style={{ backgroundColor: b.bg, border: `1.5px solid ${b.color}60`, color: b.color }}
                              >
                                {net.chain.slice(0, 3).toUpperCase()}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-semibold">{b.label}</span>
                                  <span
                                    className="text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                                    style={{ backgroundColor: b.bg, border: `1px solid ${b.border}`, color: b.color }}
                                  >
                                    {b.badge}
                                  </span>
                                  {isEvm && (
                                    <span className="text-[10px] text-muted-foreground font-medium px-1.5 py-0.5 rounded-md border border-border/50 bg-muted/30">EVM</span>
                                  )}
                                </div>
                                <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground">
                                  <span>{b.time}</span>
                                  <span>·</span>
                                  <span>Fee: {net.fee} {currency}</span>
                                  <span>·</span>
                                  <span>Min: {net.minDeposit} {currency}</span>
                                </div>
                              </div>
                              {isActive && (
                                <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: b.color }} />
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Universal EVM address banner */}
                  {showEvmUniversalBadge && (
                    <div className="rounded-xl border border-sky-500/30 bg-sky-500/8 p-3.5 flex gap-2.5">
                      <Sparkles className="h-4 w-4 text-sky-400 shrink-0 mt-0.5" />
                      <div className="text-xs text-sky-300 space-y-0.5">
                        <div className="font-semibold text-sky-200">Universal EVM Address</div>
                        <div className="text-sky-400/80">This same address works on all EVM networks: Ethereum, BNB Smart Chain, Polygon, Arbitrum, and more. One address, all chains.</div>
                      </div>
                    </div>
                  )}

                  {/* Deposit address panel */}
                  {activeNet?.address && (
                    <div
                      className="rounded-xl border p-4 space-y-4"
                      style={{ borderColor: brand?.border ?? "hsl(var(--border))", backgroundColor: `${brand?.bg ?? ""}` }}
                    >
                      {/* Header row */}
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: brand?.color ?? "#94a3b8" }}>
                          Your Deposit Address
                        </span>
                        <button
                          className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-background/40"
                          onClick={() => setShowQr(p => !p)}
                        >
                          <QrCode className="h-3 w-3" />
                          {showQr ? "Hide QR" : "Show QR"}
                        </button>
                      </div>

                      {/* QR Code */}
                      {showQr && (
                        <div className="flex flex-col items-center gap-3 pb-1">
                          <div
                            className="p-3 rounded-2xl bg-white shadow-lg cursor-pointer hover:opacity-90 transition-opacity"
                            style={{ border: `3px solid ${brand?.color ?? "#f0b429"}`, boxShadow: `0 4px 24px ${brand?.color ?? "#f0b429"}30` }}
                            onClick={copyAddr}
                            title="Click to copy address"
                          >
                            <QRCodeSVG
                              id="cryptox-deposit-qr"
                              value={activeNet.address}
                              size={168}
                              fgColor="#111827"
                              bgColor="#ffffff"
                              style={{ display: "block" }}
                            />
                          </div>
                          <p className="text-[11px] text-muted-foreground">Click QR to copy · Scan with your wallet app</p>
                          <div className="flex gap-2">
                            <button
                              onClick={copyAddr}
                              className="flex items-center gap-1.5 text-xs px-3.5 py-2 rounded-lg border border-border/60 bg-background/40 hover:bg-background/80 transition-colors font-medium"
                            >
                              {copied
                                ? <><CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> Copied!</>
                                : <><Copy className="h-3.5 w-3.5" /> Copy Address</>}
                            </button>
                            <button
                              onClick={downloadQr}
                              disabled={qrDownloading}
                              className="flex items-center gap-1.5 text-xs px-3.5 py-2 rounded-lg border border-border/60 bg-background/40 hover:bg-background/80 transition-colors font-medium disabled:opacity-50"
                            >
                              <Download className="h-3.5 w-3.5" />
                              {qrDownloading ? "Saving…" : "Save QR"}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Address display */}
                      <div className="relative">
                        <div className="rounded-lg bg-background/60 border border-border/50 p-3 pr-20">
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 font-semibold">Address</div>
                          <code
                            className="font-mono text-xs break-all leading-relaxed select-all"
                            data-testid="text-deposit-address"
                          >
                            {addrExpanded
                              ? activeNet.address
                              : activeNet.address.startsWith("0x")
                                ? activeNet.address.slice(0, 10) + " ···· " + activeNet.address.slice(-8)
                                : activeNet.address.slice(0, 14) + " ···· " + activeNet.address.slice(-8)
                            }
                          </code>
                        </div>
                        <div className="absolute right-2 top-2 flex gap-1">
                          <button
                            onClick={copyAddr}
                            className="w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-150 hover:bg-muted/60"
                            style={copied ? { backgroundColor: `${brand?.bg ?? ""}`, color: brand?.color ?? "#10b981" } : {}}
                            data-testid="button-copy-address"
                            title="Copy address"
                          >
                            {copied ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4 text-muted-foreground" />}
                          </button>
                          <button
                            onClick={() => setAddrExpanded(p => !p)}
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all text-[9px] font-black"
                            title={addrExpanded ? "Collapse" : "Show full address"}
                          >
                            {addrExpanded ? "···" : "↔"}
                          </button>
                        </div>
                      </div>

                      {/* Memo/Tag if required */}
                      {activeNet.memoRequired && activeNet.memo && (
                        <div className="rounded-lg bg-background/60 border border-amber-500/30 p-3">
                          <div className="text-[10px] uppercase tracking-wider text-amber-500 mb-1.5 font-semibold flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" /> Memo / Tag (Required)
                          </div>
                          <div className="flex items-center gap-2">
                            <code className="font-mono text-sm flex-1 text-amber-300 select-all">{activeNet.memo}</code>
                            <button
                              onClick={() => copyMemo(activeNet.memo!)}
                              className="w-7 h-7 rounded-md bg-amber-500/20 flex items-center justify-center hover:bg-amber-500/30 shrink-0"
                            >
                              <Copy className="h-3.5 w-3.5 text-amber-400" />
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Network stats */}
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { label: "Confirmations", value: `${activeNet.confirmations}` },
                          { label: "Min Deposit", value: `${activeNet.minDeposit} ${currency}` },
                          { label: "Est. Time", value: brand?.time ?? "~5 min" },
                        ].map(s => (
                          <div key={s.label} className="rounded-lg bg-background/40 border border-border/40 px-2.5 py-2 text-center">
                            <div className="text-[10px] text-muted-foreground mb-0.5">{s.label}</div>
                            <div className="text-xs font-semibold">{s.value}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Critical warnings */}
                  <div className="rounded-xl border border-amber-500/25 bg-amber-500/8 p-4 space-y-2">
                    <div className="flex items-center gap-2 text-xs font-semibold text-amber-400">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                      Important — read before sending
                    </div>
                    <ul className="space-y-1.5 text-xs text-amber-300/80 ml-5 list-disc">
                      <li>Only send <strong className="text-amber-200">{currency}</strong> via <strong className="text-amber-200">{brand?.badge ?? activeNet?.chain}</strong>. Wrong asset = permanent loss.</li>
                      <li>Only use <strong className="text-amber-200">{brand?.label ?? activeNet?.chain}</strong> network. Wrong network = permanent loss.</li>
                      {activeNet?.memoRequired && <li>This network requires a <strong className="text-amber-200">Memo/Tag</strong>. Missing memo = funds lost.</li>}
                      <li>Minimum deposit: <strong className="text-amber-200">{activeNet?.minDeposit} {currency}</strong>. Smaller amounts will not be credited.</li>
                      <li>Funds are credited after <strong className="text-amber-200">{activeNet?.confirmations} block confirmations</strong>.</li>
                    </ul>
                  </div>

                  {/* ── Missed Deposit Claim ── */}
                  {activeNet && (
                    <div className="rounded-xl border border-border/50 bg-muted/10 overflow-hidden">
                      <button
                        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/20 transition-colors"
                        onClick={() => setClaimOpen(p => !p)}
                        data-testid="button-missed-deposit"
                      >
                        <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                          <HelpCircle className="h-3.5 w-3.5 shrink-0" />
                          Deposit sent but not credited?
                        </span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border transition-all ${claimOpen ? "bg-sky-500/15 text-sky-300 border-sky-500/30" : "bg-muted/30 text-muted-foreground border-border/40"}`}>
                          {claimOpen ? "Hide" : "Submit TX claim"}
                        </span>
                      </button>

                      {claimOpen && (
                        <div className="px-4 pb-4 space-y-3 border-t border-border/40 pt-3">
                          <p className="text-[11px] text-muted-foreground leading-relaxed">
                            If your on-chain transaction is confirmed but funds haven't arrived after{" "}
                            <strong className="text-foreground">{activeNet.confirmations} confirmations</strong>, submit your TX hash below.
                            Our team reviews claims within 24 hours.
                          </p>

                          <div className="space-y-2.5">
                            <div>
                              <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1 block">
                                Transaction Hash (TX ID) <span className="text-rose-400">*</span>
                              </label>
                              <Input
                                value={claimTx}
                                onChange={e => setClaimTx(e.target.value)}
                                placeholder="0x... or base58 hash"
                                className="font-mono text-xs h-9"
                                data-testid="input-claim-txhash"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1 block">
                                Amount you sent ({currency}) <span className="text-rose-400">*</span>
                              </label>
                              <Input
                                value={claimAmt}
                                onChange={e => setClaimAmt(e.target.value)}
                                type="number"
                                min={0}
                                step="any"
                                placeholder={`e.g. 0.005`}
                                className="h-9 text-xs"
                                data-testid="input-claim-amount"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1 block">
                                Sender Address (optional)
                              </label>
                              <Input
                                value={claimFrom}
                                onChange={e => setClaimFrom(e.target.value)}
                                placeholder="Your sending wallet address"
                                className="font-mono text-xs h-9"
                                data-testid="input-claim-from"
                              />
                            </div>
                          </div>

                          <Button
                            size="sm"
                            className="w-full h-9 text-xs"
                            disabled={claimMut.isPending || claimTx.length < 20 || !claimAmt || Number(claimAmt) <= 0}
                            onClick={() => {
                              if (!activeNet) return;
                              claimMut.mutate({
                                symbol: currency,
                                networkId: activeNet.id,
                                txHash: claimTx.trim(),
                                amount: Number(claimAmt),
                                fromAddress: claimFrom.trim() || undefined,
                              });
                            }}
                            data-testid="button-submit-claim"
                          >
                            {claimMut.isPending
                              ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Submitting…</>
                              : <><CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />Submit Deposit Claim</>}
                          </Button>

                          <p className="text-[10px] text-muted-foreground text-center">
                            Claims are reviewed by our compliance team. Do not submit duplicate claims.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div className="rounded-xl border border-border bg-muted/10 p-8 text-center text-sm text-muted-foreground">
                  No deposit networks available for {currency}.
                </div>
              )}
            </>
          ) : (
            /* ── INR Fiat panel ── */
            <InrFiatPanel onClose={onClose} />
          )}
        </div>

        <div className="px-6 py-4 border-t border-border/50 flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">Zebvix Exchange · Secured</span>
          <Button variant="outline" size="sm" onClick={onClose} className="h-8">Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ──────────────────────────────────────────────────────────────────
// INR Fiat panel — shown inside DepositDialog when FIAT tab selected
// ──────────────────────────────────────────────────────────────────
function InrFiatPanel({ onClose }: { onClose: () => void }) {
  const [, setLocation] = useLocation();
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const bankQ = useQuery<{
    upiId?: string; bankName?: string; accountNumber?: string;
    ifscCode?: string; accountHolder?: string; note?: string;
  }>({
    queryKey: ["/payments/inr/bank-details"],
    queryFn: () => get("/payments/inr/bank-details"),
    staleTime: 5 * 60_000,
  });
  const bd = bankQ.data;

  const copyField = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(key);
      setTimeout(() => setCopiedField(null), 2000);
      toast.success("Copied!");
    } catch {
      toast.error("Copy failed");
    }
  };

  const rows: [string, string][] = [
    ["UPI ID",       bd?.upiId         ?? "zebvix@ybl"],
    ["Bank",         bd?.bankName       ?? "—"],
    ["Account No.",  bd?.accountNumber  ?? "—"],
    ["IFSC",         bd?.ifscCode       ?? "—"],
    ["Account Name", bd?.accountHolder  ?? "Zebvix Exchange Pvt Ltd"],
  ];

  return (
    <div className="space-y-4">
      {/* Payment info card */}
      <div className="rounded-xl border border-border bg-muted/10 p-4 space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
          <Building2 className="h-3.5 w-3.5" /> Our Payment Details
        </div>
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between py-1.5 border-b border-border/30 last:border-0">
            <span className="text-xs text-muted-foreground">{label}</span>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-medium">{value}</span>
              <button
                type="button"
                onClick={() => copyField(value, label)}
                className="text-muted-foreground hover:text-amber-400 transition-colors"
              >
                {copiedField === label
                  ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  : <Copy className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* UPI tip */}
      <div className="rounded-xl border border-amber-500/25 bg-amber-500/8 p-3.5">
        <div className="flex items-center gap-2 text-xs font-semibold text-amber-400 mb-1.5">
          <AlertCircle className="h-3.5 w-3.5" /> UPI / IMPS / NEFT / RTGS
        </div>
        <div className="text-[11px] text-amber-300/80 space-y-1">
          <div>Pay to the UPI ID above, then submit your UTR/reference number in the INR Payments page.</div>
          <div className="mt-1">Deposits are credited <strong className="text-amber-200">within 30 minutes</strong> after bank confirmation. Minimum: ₹100.</div>
        </div>
      </div>

      {/* TDS notice */}
      <div className="rounded-xl border border-sky-500/20 bg-sky-500/8 p-3 text-[11px] text-sky-400/80">
        1% TDS is deducted as per Indian tax regulations (Section 194S). Ensure the depositing account matches your KYC name.
      </div>

      {/* CTA → full INR payments page */}
      <Button
        className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
        onClick={() => { onClose(); setLocation("/inr"); }}
      >
        <ArrowDownToLine className="h-4 w-4" />
        Submit Deposit Request (INR Payments)
      </Button>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Withdraw dialog
// ──────────────────────────────────────────────────────────────────
function WithdrawDialog({
  open, onClose, initialCurrency, initialType, allItems, onDone, onSuccess,
}: {
  open: boolean; onClose: () => void; initialCurrency: string; initialType: WalletType; allItems: WalletItem[]; onDone: () => void; onSuccess?: (d: GenericSuccess) => void;
}) {
  const isFiatInit = initialType === "FIAT" || initialCurrency.toUpperCase() === "INR";
  const [mode, setMode] = useState<"CRYPTO" | "FIAT">(isFiatInit ? "FIAT" : "CRYPTO");
  const [currency, setCurrency] = useState(isFiatInit ? "INR" : (initialCurrency === "INR" ? "USDT" : initialCurrency));
  const [network, setNetwork] = useState("");
  const [amount, setAmount] = useState("");
  const [address, setAddress] = useState("");
  const [memo, setMemo] = useState("");
  const [bankId, setBankId] = useState<string>("");
  const [showAddBank, setShowAddBank] = useState(false);

  // Source of truth for withdraw-enabled coins (server filters isListed +
  // active networks with withdrawEnabled). Falls back gracefully if request fails.
  const enabledQ = useQuery<{ currency: string; networks: string[] }[]>({
    queryKey: ["enabled-coins", "spot", "withdraw"],
    queryFn: () => get(`/finance/currency/spot?action=withdraw`),
    enabled: open && mode === "CRYPTO",
    staleTime: 60_000,
  });

  const cryptoCurrencies = useMemo(() => {
    const enabled = (enabledQ.data ?? [])
      .map(c => c.currency.toUpperCase())
      .filter(c => c !== "INR");
    return enabled.sort();
  }, [enabledQ.data]);

  useEffect(() => {
    if (mode !== "CRYPTO") return;
    if (cryptoCurrencies.length > 0 && !cryptoCurrencies.includes(currency)) {
      setCurrency(cryptoCurrencies[0]);
    }
  }, [cryptoCurrencies, currency, mode]);

  const detailsQ = useQuery<{ networks?: { chain: string; fee: number; minWithdraw: number }[] }>({
    queryKey: ["withdraw-details", currency],
    queryFn: () => get(`/finance/currency/spot/${currency}?action=withdraw`),
    enabled: open && mode === "CRYPTO" && !!currency,
    retry: 1,
  });
  const networks = (() => {
    const seen = new Set<string>();
    return (detailsQ.data?.networks ?? []).filter(n => {
      const key = n.chain.toUpperCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  })();
  const activeNet = networks.find(n => n.chain.toUpperCase() === network.toUpperCase()) || networks[0];
  useEffect(() => {
    if (networks.length > 0 && !networks.find(n => n.chain.toUpperCase() === network.toUpperCase())) {
      setNetwork(networks[0].chain);
    }
  }, [networks, network]);

  const banksQ = useQuery<BankAccount[]>({
    queryKey: ["bank-accounts"],
    queryFn: () => get("/finance/bank/accounts"),
    enabled: open && mode === "FIAT",
    retry: 1,
  });
  const banks = banksQ.data ?? [];
  const verifiedBanks = banks.filter(b => b.status === "verified");
  useEffect(() => {
    if (verifiedBanks.length > 0 && !bankId) setBankId(String(verifiedBanks[0].id));
  }, [verifiedBanks, bankId]);

  // ── Withdrawal security: lock + whitelist ─────────────────────────────────
  type WlEntry = { id: number; address: string; label: string; memo?: string | null; unlocksAt: string; coinId: number | null; networkId: number | null; coinSymbol: string | null; networkChain: string | null; locked: boolean; unlocksInMs: number };
  type SecStatus = { withdrawLocked: boolean; withdrawLockedUntil: string | null; whitelistRequired: boolean; whitelist: WlEntry[] };
  const secQ = useQuery<SecStatus>({
    queryKey: ["withdraw-security-status"],
    queryFn: () => get("/finance/security-status"),
    enabled: open && mode === "CRYPTO",
    staleTime: 30_000,
  });
  const whitelistForCoinNet = useMemo(() => {
    const wl = secQ.data?.whitelist ?? [];
    return wl.filter(e => {
      const coinOk = !e.coinSymbol || e.coinSymbol.toUpperCase() === currency.toUpperCase();
      const netOk = !e.networkChain || e.networkChain.toUpperCase() === network.toUpperCase();
      return coinOk && netOk;
    });
  }, [secQ.data, currency, network]);
  const unlockedForCoinNet = whitelistForCoinNet.filter(e => !e.locked);

  // Available balance to display
  const wallet = allItems.find(w => {
    if (mode === "FIAT") return w.type === "FIAT" && w.currency.toUpperCase() === "INR";
    return w.type === "SPOT" && w.currency.toUpperCase() === currency.toUpperCase();
  });
  const available = Number(wallet?.balance ?? 0);

  const amt = Number(amount) || 0;
  const fee =
    mode === "CRYPTO"
      ? activeNet ? activeNet.fee : 0
      : Math.max(10, Math.round((10 + amt * 0.005) * 100) / 100);
  const youReceive = Math.max(0, amt - fee);

  const validation = (() => {
    if (mode === "CRYPTO" && secQ.data?.withdrawLocked) return "Withdrawals locked after password change — wait for the lock to expire";
    if (amt <= 0) return "Enter an amount";
    if (amt > available) return "Insufficient balance";
    if (mode === "CRYPTO") {
      if (!activeNet) return "Select a network";
      if (amt < activeNet.minWithdraw) return `Minimum ${activeNet.minWithdraw} ${currency}`;
      if (secQ.data?.whitelistRequired && whitelistForCoinNet.length > 0 && unlockedForCoinNet.length === 0) return "All whitelisted addresses are still in their 3-hour cooling period";
      if (secQ.data?.whitelistRequired && whitelistForCoinNet.length === 0) return "Whitelist enforcement is on — add an address in the Whitelist manager first";
      if (!address.trim()) return "Enter the destination address";
      if (fee >= amt) return "Amount must exceed network fee";
    } else {
      if (amt < 100) return "Minimum withdrawal is ₹100";
      if (!bankId) return "Add and verify a bank account";
      if (fee >= amt) return "Amount must exceed fee";
    }
    return null;
  })();

  const { user } = useAuth();
  const [otpPhase, setOtpPhase] = useState<"form" | "otp">("form");
  const [pendingOtpId, setPendingOtpId] = useState<number | null>(null);
  const [otpCode, setOtpCode] = useState("");

  const requestOtp = useMutation({
    mutationFn: () => post("/otp/send", { channel: "email", purpose: "withdraw", recipient: user?.email }),
    onSuccess: (data: any) => {
      setPendingOtpId(data.otpId);
      setOtpPhase("otp");
      toast.success("OTP sent to your email", { description: "Enter the 6-digit code to confirm your withdrawal." });
    },
    onError: (e: any) => toast.error(e?.message || "Failed to send OTP"),
  });

  const submit = useMutation({
    mutationFn: async () => {
      await post("/otp/verify", { otpId: pendingOtpId, code: otpCode });
      if (mode === "CRYPTO") {
        return post("/finance/withdraw/spot", {
          currency, amount: amt, address: address.trim(), network: activeNet?.chain || network, memo: memo.trim() || undefined, otpId: pendingOtpId,
        });
      }
      return post("/finance/withdraw/fiat", { bankId: Number(bankId), amount: amt, otpId: pendingOtpId });
    },
    onSuccess: () => {
      onSuccess?.({
        kind: "generic",
        accentColor: "#F87171",
        iconKind: "withdraw",
        title: mode === "CRYPTO" ? "Withdrawal Submitted!" : "Fiat Withdrawal Submitted!",
        subtitle: `${currency} · Pending Admin Approval`,
        rows: [
          { label: "Amount",  value: `${amount} ${currency}`, accent: "text-rose-400" },
          { label: mode === "CRYPTO" ? "Network" : "Method", value: mode === "CRYPTO" ? (activeNet?.chain || network) : "Bank Transfer" },
          { label: "Status",  value: "Pending Review", accent: "text-amber-300" },
          { label: "ETA",     value: "24–48 hours", accent: "text-muted-foreground" },
        ],
        primaryLabel: "Got it",
      });
      onDone();
      onClose();
    },
    onError: (e: any) => { toast.error(e?.message || "Withdrawal failed"); setOtpPhase("form"); setPendingOtpId(null); setOtpCode(""); },
  });

  const wBrand = activeNet ? netBrand(activeNet.chain) : null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-[520px] p-0 overflow-hidden gap-0">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-border/50">
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-rose-500/15 ring-1 ring-rose-500/30">
              <ArrowUpFromLine className="h-4 w-4 text-rose-400" />
            </div>
            Withdraw Funds
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground mt-1 ml-10">
            All withdrawals are reviewed before leaving the exchange.
          </DialogDescription>
        </div>

        <div className="px-6 py-5 space-y-5 max-h-[76vh] overflow-y-auto">
          {/* Mode tabs */}
          <Tabs value={mode} onValueChange={(v) => {
            const next = v as "CRYPTO" | "FIAT";
            setMode(next);
            setAddress("");
            setMemo("");
            setAmount("");
            setNetwork("");
            if (next === "FIAT") setCurrency("INR");
            else if (next === "CRYPTO") setCurrency(cryptoCurrencies[0] ?? initialCurrency);
          }}>
            <TabsList className="grid grid-cols-2 w-full h-9">
              <TabsTrigger value="CRYPTO" className="text-xs font-medium" data-testid="tab-withdraw-crypto">Crypto</TabsTrigger>
              <TabsTrigger value="FIAT" className="text-xs font-medium" data-testid="tab-withdraw-fiat">INR (Fiat)</TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Withdraw lock banner */}
          {mode === "CRYPTO" && secQ.data?.withdrawLocked && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 space-y-1.5" data-testid="withdraw-lock-banner">
              <div className="flex items-center gap-2 text-sm font-semibold text-red-400">
                <Shield className="h-4 w-4 shrink-0" />
                Withdrawals Temporarily Locked
              </div>
              <p className="text-xs text-red-400/80 ml-6">
                Your account has a temporary withdrawal hold after a recent password change. Withdrawals will be available after{" "}
                <strong className="text-red-300">{new Date(secQ.data.withdrawLockedUntil!).toLocaleString()}</strong>.
              </p>
            </div>
          )}

          {mode === "CRYPTO" ? (
            <>
              {/* Coin selector */}
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 block">Select Coin</label>
                <Select value={currency} onValueChange={(v) => { setCurrency(v); setNetwork(""); }}>
                  <SelectTrigger className="h-11" data-testid="select-withdraw-coin"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {cryptoCurrencies.map(c => (
                      <SelectItem key={c} value={c}>
                        <div className="flex items-center gap-2">
                          <div className="w-5 h-5 rounded-full bg-rose-500/20 flex items-center justify-center text-[10px] font-bold text-rose-400">{c[0]}</div>
                          {c}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Network cards */}
              {detailsQ.isLoading ? (
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block">Select Network</label>
                  {[0,1,2].map(i => <div key={i} className="h-16 rounded-xl border border-border bg-muted/20 animate-pulse" />)}
                </div>
              ) : detailsQ.isError ? (
                <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-400 flex items-center gap-2" data-testid="withdraw-network-error">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span className="flex-1">Failed to load networks for {currency}.</span>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => detailsQ.refetch()} data-testid="button-withdraw-network-retry">Retry</Button>
                </div>
              ) : networks.length > 0 ? (
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 block">Select Network</label>
                  <div className="space-y-2">
                    {networks.map(net => {
                      const b = netBrand(net.chain);
                      const isActive = net.chain.toUpperCase() === (activeNet?.chain ?? "").toUpperCase();
                      return (
                        <button
                          key={net.chain}
                          onClick={() => setNetwork(net.chain)}
                          className={`w-full text-left rounded-xl border p-3.5 transition-all duration-150 ${
                            isActive ? "ring-2 ring-offset-0" : "border-border/50 bg-muted/10 hover:bg-muted/30 hover:border-border"
                          }`}
                          style={isActive ? { borderColor: b.border, backgroundColor: b.bg, boxShadow: `0 0 0 2px ${b.color}40` } : {}}
                          data-testid={`net-card-withdraw-${net.chain}`}
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black shrink-0"
                              style={{ backgroundColor: b.bg, border: `1.5px solid ${b.color}60`, color: b.color }}
                            >
                              {net.chain.slice(0, 3).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-semibold">{b.label}</span>
                                <span
                                  className="text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                                  style={{ backgroundColor: b.bg, border: `1px solid ${b.border}`, color: b.color }}
                                >{b.badge}</span>
                              </div>
                              <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground">
                                <span>{b.time}</span>
                                <span>·</span>
                                <span>Fee: {net.fee} {currency}</span>
                                <span>·</span>
                                <span>Min: {net.minWithdraw} {currency}</span>
                              </div>
                            </div>
                            {isActive && <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: b.color }} />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : currency ? (
                <div className="rounded-xl border border-border bg-muted/10 p-6 text-center text-sm text-muted-foreground">
                  No withdraw networks available for {currency}.
                </div>
              ) : null}

              {/* Whitelist address picker */}
              {whitelistForCoinNet.length > 0 && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 block flex items-center gap-1.5">
                    <ListChecks className="h-3.5 w-3.5" /> Whitelisted Addresses
                  </label>
                  <div className="space-y-2">
                    {whitelistForCoinNet.map(e => {
                      const isSelected = address === e.address;
                      return (
                        <button
                          key={e.id}
                          type="button"
                          disabled={e.locked}
                          onClick={() => { if (!e.locked) { setAddress(e.address); if (e.memo) setMemo(e.memo); } }}
                          className={`w-full text-left rounded-xl border p-3 transition-all duration-150 ${
                            e.locked
                              ? "border-border/30 bg-muted/5 opacity-50 cursor-not-allowed"
                              : isSelected
                              ? "border-emerald-500/60 bg-emerald-500/10 ring-1 ring-emerald-500/40"
                              : "border-border/50 bg-muted/10 hover:bg-muted/25 hover:border-border"
                          }`}
                          data-testid={`wl-addr-${e.id}`}
                        >
                          <div className="flex items-center justify-between gap-2 mb-0.5">
                            <span className="text-sm font-medium truncate">{e.label}</span>
                            {e.locked ? (
                              <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-400 shrink-0 gap-1">
                                <Timer className="h-2.5 w-2.5" />
                                {Math.ceil(e.unlocksInMs / 60000)}m left
                              </Badge>
                            ) : (
                              <BadgeCheck className="h-4 w-4 text-emerald-400 shrink-0" />
                            )}
                          </div>
                          <div className="font-mono text-[11px] text-muted-foreground truncate">{e.address}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Destination address — free input (hidden when whitelist required + entries exist) */}
              {(!secQ.data?.whitelistRequired || whitelistForCoinNet.length === 0) && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 block">Destination Address</label>
                  <div className="relative">
                    <Input
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder={activeNet ? `${wBrand?.badge ?? activeNet.chain} address` : "Select a network first"}
                      className="font-mono text-sm h-11 pr-10"
                      data-testid="input-withdraw-address"
                    />
                    <ScanLine className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                  </div>
                </div>
              )}

              {/* Memo */}
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 block">
                  Memo / Tag <span className="normal-case font-normal text-muted-foreground/70">(optional — required by some exchanges)</span>
                </label>
                <Input
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  placeholder="If required by destination"
                  className="font-mono text-sm h-11"
                  data-testid="input-withdraw-memo"
                />
              </div>

              {/* Security warning */}
              {address.trim() && activeNet && (
                <div className="rounded-xl border border-amber-500/25 bg-amber-500/8 p-4 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-amber-400">
                    <Shield className="h-3.5 w-3.5 shrink-0" />
                    Verify before submitting
                  </div>
                  <ul className="space-y-1 text-xs text-amber-300/80 ml-5 list-disc">
                    <li>Double-check the address — crypto transfers are <strong className="text-amber-200">irreversible</strong>.</li>
                    <li>Send only via <strong className="text-amber-200">{wBrand?.label ?? activeNet.chain}</strong> network.</li>
                    {activeNet.minWithdraw > 0 && <li>Minimum: <strong className="text-amber-200">{activeNet.minWithdraw} {currency}</strong></li>}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <>
              {banksQ.isError ? (
                <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-400 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" /> Could not load bank accounts.
                  <Button size="sm" variant="outline" className="ml-auto h-7" onClick={() => banksQ.refetch()}>Retry</Button>
                </div>
              ) : verifiedBanks.length > 0 ? (
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 block">Bank Account</label>
                  <Select value={bankId} onValueChange={setBankId}>
                    <SelectTrigger className="h-11" data-testid="select-withdraw-bank"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {verifiedBanks.map(b => (
                        <SelectItem key={b.id} value={String(b.id)}>
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                            {b.bankName} · ••{b.accountNumber.slice(-4)} ({b.holderName})
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-400 space-y-1">
                  <div className="font-semibold flex items-center gap-1.5"><AlertCircle className="h-4 w-4" /> No verified bank account</div>
                  <div className="text-xs text-amber-400/80">Add and verify a bank account to withdraw INR funds.</div>
                </div>
              )}
              <Button variant="outline" size="sm" onClick={() => setShowAddBank(true)} className="w-full h-10 text-xs font-medium" data-testid="button-add-bank">
                <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Bank Account
              </Button>
            </>
          )}

          {/* Amount input */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Amount</label>
              <button
                type="button"
                onClick={() => setAmount(String(available))}
                className="text-xs text-primary hover:underline font-medium"
                data-testid="button-withdraw-max"
              >
                Max: {fmtNum(available, currency === "INR" ? 2 : 6)} {currency}
              </button>
            </div>
            <div className="relative">
              <Input
                type="number"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="font-mono text-lg h-12 pr-16"
                data-testid="input-withdraw-amount"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">{currency}</span>
            </div>
          </div>

          {/* Fee preview */}
          <div className="rounded-xl border border-border bg-muted/20 p-4 text-sm space-y-2">
            <div className="flex justify-between text-muted-foreground">
              <span>{mode === "CRYPTO" ? "Estimated network fee" : "Processing fee"}</span>
              <span className="font-mono">{fmtNum(fee, currency === "INR" ? 2 : 6)} {currency}</span>
            </div>
            <div className="flex justify-between font-semibold border-t border-border/40 pt-2">
              <span>You will receive {mode === "CRYPTO" ? "≈" : ""}</span>
              <span className="font-mono text-base">{fmtNum(youReceive, currency === "INR" ? 2 : 6)} {currency}</span>
            </div>
            {mode === "CRYPTO" && (
              <div className="text-[11px] text-muted-foreground">Actual fee may vary slightly at submission time.</div>
            )}
          </div>

          {validation && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-xs text-rose-400 flex items-center gap-2">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {validation}
            </div>
          )}
        </div>

        {/* OTP verification section — shown after user clicks "Withdraw" */}
        {otpPhase === "otp" && (
          <div className="px-6 pb-2">
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/8 p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-amber-300">
                <Mail className="h-4 w-4 shrink-0" />
                <span>OTP sent to your registered email</span>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Enter 6-digit OTP code</label>
                <Input
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="123456"
                  className="font-mono text-xl h-12 tracking-[0.4em] text-center"
                  maxLength={6}
                  autoFocus
                  data-testid="input-withdraw-otp"
                />
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <button type="button" onClick={() => { setOtpPhase("form"); setPendingOtpId(null); setOtpCode(""); }} className="hover:text-foreground transition-colors">
                  ← Back
                </button>
                <button type="button" onClick={() => requestOtp.mutate()} disabled={requestOtp.isPending} className="hover:text-foreground transition-colors disabled:opacity-50">
                  Resend OTP
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border/50 flex items-center justify-between gap-3">
          <Button variant="outline" size="sm" onClick={onClose} className="h-9">Cancel</Button>
          {otpPhase === "form" ? (
            <Button
              onClick={() => requestOtp.mutate()}
              disabled={!!validation || requestOtp.isPending}
              className="h-9 bg-rose-500 hover:bg-rose-500/90 text-white flex-1"
              data-testid="button-withdraw-get-otp"
            >
              {requestOtp.isPending
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sending OTP…</>
                : `Withdraw ${currency}`}
            </Button>
          ) : (
            <Button
              onClick={() => submit.mutate()}
              disabled={otpCode.length !== 6 || submit.isPending}
              className="h-9 bg-rose-500 hover:bg-rose-500/90 text-white flex-1"
              data-testid="button-withdraw-submit"
            >
              {submit.isPending
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Confirming…</>
                : "Confirm Withdrawal"}
            </Button>
          )}
        </div>

        {showAddBank && (
          <AddBankDialog
            open={showAddBank}
            onClose={() => setShowAddBank(false)}
            onAdded={() => { banksQ.refetch(); setShowAddBank(false); }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

// ──────────────────────────────────────────────────────────────────
// Add bank dialog
// ──────────────────────────────────────────────────────────────────
function AddBankDialog({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: () => void }) {
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [holderName, setHolderName] = useState("");

  const valid = bankName.trim() && accountNumber.trim() && ifsc.trim() && holderName.trim();

  const m = useMutation({
    mutationFn: () => post("/finance/bank/accounts", {
      bankName: bankName.trim(),
      accountNumber: accountNumber.trim(),
      ifsc: ifsc.trim().toUpperCase(),
      holderName: holderName.trim(),
    }),
    onSuccess: () => {
      toast.success("Bank account added — pending verification");
      onAdded();
    },
    onError: (e: any) => toast.error(e?.message || "Failed to add bank"),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add bank account</DialogTitle>
          <DialogDescription>Account name must match your KYC details.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Bank name</label>
            <Input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="HDFC Bank" data-testid="input-bank-name" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Account holder</label>
            <Input value={holderName} onChange={(e) => setHolderName(e.target.value)} placeholder="As per KYC" data-testid="input-holder-name" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Account number</label>
            <Input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} placeholder="1234567890" className="font-mono" data-testid="input-account-number" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">IFSC</label>
            <Input value={ifsc} onChange={(e) => setIfsc(e.target.value.toUpperCase())} placeholder="HDFC0000123" className="font-mono uppercase" data-testid="input-ifsc" />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => m.mutate()} disabled={!valid || m.isPending} data-testid="button-bank-submit">
            {m.isPending ? "Adding…" : "Add account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ──────────────────────────────────────────────────────────────────
// Transfer dialog
// ──────────────────────────────────────────────────────────────────
function TransferDialog({
  open, onClose, initialCurrency, allItems, onDone, onSuccess,
}: {
  open: boolean; onClose: () => void; initialCurrency?: string; allItems: WalletItem[]; onDone: () => void; onSuccess?: (d: GenericSuccess) => void;
}) {
  const [from, setFrom] = useState<WalletType>("SPOT");
  const [to, setTo] = useState<WalletType>("FUTURES");
  const [currency, setCurrency] = useState(initialCurrency || "USDT");
  const [amount, setAmount] = useState("");

  // Currencies that exist on the FROM side
  const currencies = useMemo(() => {
    const set = new Set<string>();
    for (const w of allItems) if (w.type === from) set.add(w.currency.toUpperCase());
    if (set.size === 0) ["USDT", "BTC", "INR"].forEach(c => set.add(c));
    return [...set].sort();
  }, [allItems, from]);
  useEffect(() => { if (!currencies.includes(currency)) setCurrency(currencies[0] || "USDT"); }, [currencies, currency]);

  const wallet = allItems.find(w => w.type === from && w.currency.toUpperCase() === currency.toUpperCase());
  const available = Number(wallet?.balance ?? 0);

  // INR can only stay in FIAT; non-INR cannot live in FIAT.
  useEffect(() => {
    if (currency.toUpperCase() === "INR") {
      if (from !== "FIAT") setFrom("FIAT");
      if (to === "FIAT") setTo("SPOT");
    } else {
      if (from === "FIAT") setFrom("SPOT");
      if (to === "FIAT") setTo("SPOT");
    }
  }, [currency, from, to]);

  const swap = () => { const f = from; setFrom(to); setTo(f); };

  const amt = Number(amount) || 0;
  const validation = (() => {
    if (from === to) return "Choose different wallets";
    if (amt <= 0) return "Enter an amount";
    if (amt > available) return "Insufficient balance";
    return null;
  })();

  const submit = useMutation({
    mutationFn: () => post("/finance/transfer", { from, to, currency, amount: amt }),
    onSuccess: () => {
      onSuccess?.({
        kind: "generic",
        accentColor: "#38BDF8",
        iconKind: "transfer",
        title: "Transfer Complete!",
        subtitle: `${currency} · ${from} → ${to}`,
        rows: [
          { label: "Amount", value: `${amt} ${currency}`, accent: "text-sky-400" },
          { label: "From",   value: from },
          { label: "To",     value: to },
          { label: "Fee",    value: "Free", accent: "text-emerald-400" },
        ],
        primaryLabel: "Done",
      });
      onDone();
      onClose();
    },
    onError: (e: any) => toast.error(e?.message || "Transfer failed"),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowLeftRight className="h-5 w-5 text-sky-400" /> Internal transfer
          </DialogTitle>
          <DialogDescription>Move funds between your Spot, Futures and Fiat wallets — instant and free.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Coin</label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger className="h-10" data-testid="select-transfer-coin"><SelectValue /></SelectTrigger>
              <SelectContent>
                {currencies.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">From</label>
              <Select value={from} onValueChange={(v) => setFrom(v as WalletType)}>
                <SelectTrigger className="h-10" data-testid="select-transfer-from"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="SPOT">Spot</SelectItem>
                  <SelectItem value="FUTURES">Futures</SelectItem>
                  <SelectItem value="FIAT">Fiat</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={swap} className="h-10 w-10 px-0 mb-0" data-testid="button-swap-direction" aria-label="Swap direction">
              <ArrowLeftRight className="h-4 w-4" />
            </Button>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">To</label>
              <Select value={to} onValueChange={(v) => setTo(v as WalletType)}>
                <SelectTrigger className="h-10" data-testid="select-transfer-to"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="SPOT">Spot</SelectItem>
                  <SelectItem value="FUTURES">Futures</SelectItem>
                  <SelectItem value="FIAT">Fiat</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-muted-foreground">Amount</label>
              <button
                type="button"
                onClick={() => setAmount(String(available))}
                className="text-xs text-primary hover:underline"
                data-testid="button-transfer-max"
              >
                Available: {fmtNum(available, currency === "INR" ? 2 : 6)} {currency}
              </button>
            </div>
            <div className="relative">
              <Input
                type="number"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="font-mono text-base h-11 pr-16"
                data-testid="input-transfer-amount"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">{currency}</span>
            </div>
          </div>

          {validation && (
            <div className="text-xs text-rose-400 flex items-center gap-1.5"><AlertCircle className="h-3.5 w-3.5" /> {validation}</div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => submit.mutate()} disabled={!!validation || submit.isPending} data-testid="button-transfer-submit">
            {submit.isPending ? "Transferring…" : "Transfer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Send-to-User (P2P) Dialog ────────────────────────────────────────────────

type SendToUserStep = "lookup" | "amount" | "otp";

interface SendToUserDialogProps {
  open: boolean;
  onClose: () => void;
  initialCurrency?: string;
  allItems: WalletItem[];
  onDone: () => void;
  onSuccess?: (d: GenericSuccess) => void;
}

function SendToUserDialog({ open, onClose, initialCurrency, allItems, onDone, onSuccess }: SendToUserDialogProps) {
  const { user } = useAuth();
  const [step, setStep] = useState<SendToUserStep>("lookup");
  const [query, setQuery] = useState("");
  const [recipient, setRecipient] = useState<{ id: number; name: string; uid: string; email: string } | null>(null);
  const [currency, setCurrency] = useState(initialCurrency || "USDT");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [otpId, setOtpId] = useState<number | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [lookupErr, setLookupErr] = useState("");

  const spotItems = allItems.filter(i => i.type === "SPOT" && Number(i.balance) > 0);
  const selectedItem = allItems.find(i => i.currency === currency && i.type === "SPOT");
  const available = Number(selectedItem?.balance ?? 0);
  const amt = Number(amount);
  const amtValid = Number.isFinite(amt) && amt > 0 && amt <= available;

  function reset() {
    setStep("lookup");
    setQuery("");
    setRecipient(null);
    setCurrency(initialCurrency || "USDT");
    setAmount("");
    setNote("");
    setOtpId(null);
    setOtpCode("");
    setLookupErr("");
  }

  function handleClose() { reset(); onClose(); }

  const lookupMut = useMutation({
    mutationFn: () => get(`/finance/transfer/p2p/lookup?q=${encodeURIComponent(query.trim())}`),
    onSuccess: (data: any) => { setRecipient(data); setLookupErr(""); setStep("amount"); },
    onError: (e: any) => setLookupErr(e?.message || "User not found"),
  });

  const requestOtp = useMutation({
    mutationFn: () => post("/finance/transfer/p2p/request", { toUserId: recipient?.id, coinSymbol: currency, amount: amt }),
    onSuccess: (data: any) => { setOtpId(data.otpId); setStep("otp"); toast.success("OTP sent to your email"); },
    onError: (e: any) => toast.error(e?.message || "Failed to send OTP"),
  });

  const confirmMut = useMutation({
    mutationFn: async () => {
      await post("/otp/verify", { otpId, code: otpCode });
      return post("/finance/transfer/p2p/confirm", { otpId, toUserId: recipient?.id, coinSymbol: currency, amount: amt, note: note || undefined });
    },
    onSuccess: () => {
      onSuccess?.({
        kind: "generic",
        accentColor: "#F59E0B",
        iconKind: "transfer",
        title: "Transfer Successful!",
        subtitle: `${currency} sent to ${recipient?.name}`,
        rows: [
          { label: "Amount", value: `${amount} ${currency}`, accent: "text-amber-400" },
          { label: "Recipient", value: recipient?.name || "", accent: "text-foreground" },
          { label: "UID", value: recipient?.uid || "" },
          ...(note ? [{ label: "Note", value: note }] : []),
        ],
        primaryLabel: "Done",
      });
      onDone();
      handleClose();
    },
    onError: (e: any) => { toast.error(e?.message || "Transfer failed"); setStep("amount"); setOtpId(null); setOtpCode(""); },
  });

  const stepTitles: Record<SendToUserStep, string> = {
    lookup: "Find Recipient",
    amount: "Choose Amount",
    otp: "Confirm Transfer",
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-sm rounded-2xl p-0 gap-0 overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-border/50">
          <div className="flex items-center gap-2 mb-1">
            <div className="h-8 w-8 rounded-full bg-amber-500/15 flex items-center justify-center">
              <SendHorizontal className="h-4 w-4 text-amber-400" />
            </div>
            <DialogTitle className="text-base font-semibold">Send to User</DialogTitle>
          </div>
          <p className="text-xs text-muted-foreground">{stepTitles[step]}</p>
          {/* Step indicator */}
          <div className="flex items-center gap-1.5 mt-3">
            {(["lookup", "amount", "otp"] as SendToUserStep[]).map((s, i) => (
              <div key={s} className={`h-1 flex-1 rounded-full transition-all ${step === s ? "bg-amber-400" : i < ["lookup","amount","otp"].indexOf(step) ? "bg-amber-400/50" : "bg-border"}`} />
            ))}
          </div>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Step 1: Lookup */}
          {step === "lookup" && (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Email or User ID</label>
                <div className="flex gap-2">
                  <Input
                    value={query}
                    onChange={(e) => { setQuery(e.target.value); setLookupErr(""); }}
                    onKeyDown={(e) => e.key === "Enter" && query.trim().length >= 3 && lookupMut.mutate()}
                    placeholder="user@email.com or UID123"
                    className="h-10 flex-1"
                    autoFocus
                    data-testid="input-p2p-lookup"
                  />
                  <Button
                    onClick={() => lookupMut.mutate()}
                    disabled={query.trim().length < 3 || lookupMut.isPending}
                    className="h-10 px-4 bg-amber-500 hover:bg-amber-500/90 text-black font-semibold"
                  >
                    {lookupMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  </Button>
                </div>
                {lookupErr && (
                  <p className="mt-1.5 text-xs text-rose-400 flex items-center gap-1"><AlertCircle className="h-3.5 w-3.5" /> {lookupErr}</p>
                )}
              </div>
              <div className="rounded-lg border border-border/50 bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
                <p className="font-medium text-foreground/70 flex items-center gap-1.5"><Shield className="h-3.5 w-3.5" /> How it works</p>
                <p>Enter the exact email address or User ID of the recipient. We'll show their masked email to confirm before sending. An OTP will be required.</p>
              </div>
            </div>
          )}

          {/* Step 2: Amount */}
          {step === "amount" && recipient && (
            <div className="space-y-3">
              {/* Recipient card */}
              <div className="rounded-xl border border-amber-500/25 bg-amber-500/8 p-3 flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
                  <UserCheck className="h-4 w-4 text-amber-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{recipient.name}</p>
                  <p className="text-xs text-muted-foreground">{recipient.email} · {recipient.uid}</p>
                </div>
                <button type="button" onClick={() => { setStep("lookup"); setRecipient(null); }} className="ml-auto text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0">Change</button>
              </div>

              {/* Coin selector */}
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Coin</label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger className="h-10" data-testid="select-p2p-coin"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {spotItems.map(i => (
                      <SelectItem key={i.currency} value={i.currency}>{i.currency} — {fmtNum(Number(i.balance), 6)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Amount */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs text-muted-foreground">Amount</label>
                  <button type="button" onClick={() => setAmount(String(available))} className="text-xs text-primary hover:underline">
                    Max: {fmtNum(available, 6)} {currency}
                  </button>
                </div>
                <Input
                  type="number"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="h-11 text-lg font-semibold"
                  data-testid="input-p2p-amount"
                />
                {amount && !amtValid && (
                  <p className="mt-1.5 text-xs text-rose-400 flex items-center gap-1"><AlertCircle className="h-3.5 w-3.5" /> {amt > available ? "Insufficient balance" : "Enter a valid amount"}</p>
                )}
              </div>

              {/* Note */}
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Note (optional)</label>
                <Input
                  value={note}
                  onChange={(e) => setNote(e.target.value.slice(0, 100))}
                  placeholder="e.g. Settlement, Gift…"
                  className="h-10"
                  data-testid="input-p2p-note"
                />
              </div>
            </div>
          )}

          {/* Step 3: OTP */}
          {step === "otp" && recipient && (
            <div className="space-y-3">
              <div className="rounded-xl border border-amber-500/25 bg-amber-500/8 p-3 text-sm space-y-0.5">
                <p className="font-medium">Review transfer</p>
                <p className="text-muted-foreground text-xs">{amount} {currency} → {recipient.name} ({recipient.uid})</p>
                {note && <p className="text-muted-foreground text-xs">Note: {note}</p>}
              </div>

              <div>
                <div className="flex items-center gap-2 text-sm font-medium text-amber-300 mb-2">
                  <Mail className="h-4 w-4 shrink-0" />
                  <span>OTP sent to your registered email</span>
                </div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Enter 6-digit OTP code</label>
                <Input
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="123456"
                  className="font-mono text-xl h-12 tracking-[0.4em] text-center"
                  maxLength={6}
                  autoFocus
                  data-testid="input-p2p-otp"
                />
              </div>

              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <button type="button" onClick={() => { setStep("amount"); setOtpId(null); setOtpCode(""); }} className="hover:text-foreground transition-colors">
                  ← Back
                </button>
                <button type="button" onClick={() => requestOtp.mutate()} disabled={requestOtp.isPending} className="hover:text-foreground transition-colors disabled:opacity-50">
                  Resend OTP
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border/50 flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={handleClose} className="h-9">Cancel</Button>
          {step === "lookup" && (
            <Button
              onClick={() => lookupMut.mutate()}
              disabled={query.trim().length < 3 || lookupMut.isPending}
              className="h-9 flex-1 bg-amber-500 hover:bg-amber-500/90 text-black font-semibold"
            >
              {lookupMut.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Looking up…</> : <><Users className="h-4 w-4 mr-2" /> Find User</>}
            </Button>
          )}
          {step === "amount" && (
            <Button
              onClick={() => requestOtp.mutate()}
              disabled={!amtValid || requestOtp.isPending}
              className="h-9 flex-1 bg-amber-500 hover:bg-amber-500/90 text-black font-semibold"
              data-testid="button-p2p-continue"
            >
              {requestOtp.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sending OTP…</> : <><SendHorizontal className="h-4 w-4 mr-2" /> Continue</>}
            </Button>
          )}
          {step === "otp" && (
            <Button
              onClick={() => confirmMut.mutate()}
              disabled={otpCode.length !== 6 || confirmMut.isPending}
              className="h-9 flex-1 bg-amber-500 hover:bg-amber-500/90 text-black font-semibold"
              data-testid="button-p2p-confirm"
            >
              {confirmMut.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sending…</> : <><CheckCircle2 className="h-4 w-4 mr-2" /> Confirm Send</>}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ──────────────────────────────────────────────────────────────────
// Manage Whitelist Dialog
// ──────────────────────────────────────────────────────────────────
type WlItem = {
  id: number; uid: string; address: string; memo: string | null; label: string;
  coinSymbol: string | null; networkChain: string | null;
  locked: boolean; unlocksInMs: number; unlocksAt: string;
};

function ManageWhitelistDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [addMode, setAddMode] = useState(false);
  const [label, setLabel] = useState("");
  const [addr, setAddr] = useState("");
  const [memo, setMemo] = useState("");
  const [coinSym, setCoinSym] = useState("");
  const [netChain, setNetChain] = useState("");

  const listQ = useQuery<WlItem[]>({
    queryKey: ["whitelist"],
    queryFn: () => get("/finance/whitelist"),
    enabled: open,
    staleTime: 15_000,
  });
  const items = listQ.data ?? [];

  const addMut = useMutation({
    mutationFn: () => post("/finance/whitelist", {
      address: addr.trim(), label: label.trim(),
      coinSymbol: coinSym.trim() || undefined,
      networkChain: netChain.trim() || undefined,
      memo: memo.trim() || undefined,
    }),
    onSuccess: () => {
      toast.success("Address added", { description: "You can withdraw to it after the 3-hour security window." });
      qc.invalidateQueries({ queryKey: ["whitelist"] });
      qc.invalidateQueries({ queryKey: ["withdraw-security-status"] });
      setAddMode(false); setLabel(""); setAddr(""); setMemo(""); setCoinSym(""); setNetChain("");
    },
    onError: (e: any) => toast.error(e?.message || "Failed to add address"),
  });

  const delMut = useMutation({
    mutationFn: (id: number) => del(`/finance/whitelist/${id}`),
    onSuccess: () => {
      toast.success("Removed from whitelist");
      qc.invalidateQueries({ queryKey: ["whitelist"] });
      qc.invalidateQueries({ queryKey: ["withdraw-security-status"] });
    },
    onError: (e: any) => toast.error(e?.message || "Failed to remove"),
  });

  const canAdd = label.trim().length > 0 && addr.trim().length >= 8;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-[520px] p-0 overflow-hidden gap-0">
        <div className="px-6 pt-6 pb-4 border-b border-border/50">
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-emerald-500/15 ring-1 ring-emerald-500/30">
              <ListChecks className="h-4 w-4 text-emerald-400" />
            </div>
            Withdrawal Address Whitelist
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground mt-1 ml-10">
            Only whitelisted addresses can receive withdrawals. New addresses have a 3-hour security hold.
          </DialogDescription>
        </div>

        <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Existing addresses */}
          {listQ.isLoading ? (
            <div className="space-y-2">{[0,1,2].map(i => <div key={i} className="h-16 rounded-xl border border-border bg-muted/20 animate-pulse" />)}</div>
          ) : items.length === 0 ? (
            <div className="rounded-xl border border-border bg-muted/10 p-6 text-center space-y-2">
              <ShieldPlus className="h-8 w-8 mx-auto text-muted-foreground/40" />
              <div className="text-sm text-muted-foreground">No whitelisted addresses yet.</div>
              <div className="text-xs text-muted-foreground/70">Add addresses you trust below. A 3-hour cooling period applies to each new entry.</div>
            </div>
          ) : (
            <div className="space-y-2">
              {items.map(e => (
                <div
                  key={e.id}
                  className="rounded-xl border border-border/50 bg-muted/10 p-3 flex items-start gap-3"
                >
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{e.label}</span>
                      {e.coinSymbol && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">{e.coinSymbol}</Badge>
                      )}
                      {e.networkChain && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">{e.networkChain}</Badge>
                      )}
                      {e.locked ? (
                        <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-400 gap-1">
                          <Timer className="h-2.5 w-2.5" />
                          {Math.ceil(e.unlocksInMs / 60000)}m
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] border-emerald-500/40 text-emerald-400 gap-1">
                          <BadgeCheck className="h-2.5 w-2.5" />
                          Active
                        </Badge>
                      )}
                    </div>
                    <div className="font-mono text-[11px] text-muted-foreground truncate">{e.address}</div>
                    {e.memo && <div className="text-[11px] text-muted-foreground">Memo: {e.memo}</div>}
                    {e.locked && (
                      <div className="text-[11px] text-amber-400/80">
                        Cooling period ends {new Date(e.unlocksAt).toLocaleString()}
                      </div>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10"
                    onClick={() => delMut.mutate(e.id)}
                    disabled={delMut.isPending}
                    data-testid={`btn-del-wl-${e.id}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Add address form */}
          {addMode ? (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-3">
              <div className="text-sm font-semibold text-emerald-400 flex items-center gap-2">
                <ShieldPlus className="h-4 w-4" />
                Add New Address
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">Label *</label>
                <Input value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. My Binance Hot Wallet" className="h-10 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">Address *</label>
                <Input value={addr} onChange={e => setAddr(e.target.value)} placeholder="Destination wallet address" className="h-10 font-mono text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">Coin (optional)</label>
                  <Input value={coinSym} onChange={e => setCoinSym(e.target.value.toUpperCase())} placeholder="e.g. USDT" className="h-10 text-sm font-mono" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">Network (optional)</label>
                  <Input value={netChain} onChange={e => setNetChain(e.target.value.toUpperCase())} placeholder="e.g. TRC20" className="h-10 text-sm font-mono" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">Memo / Tag (optional)</label>
                <Input value={memo} onChange={e => setMemo(e.target.value)} placeholder="If required by destination" className="h-10 text-sm font-mono" />
              </div>
              <div className="rounded-lg border border-amber-500/25 bg-amber-500/8 p-3 text-xs text-amber-300/90">
                <strong className="text-amber-300">3-hour security hold:</strong> This address cannot be used for withdrawals until the cooling period expires.
              </div>
              <div className="flex gap-2 pt-1">
                <Button variant="outline" size="sm" className="flex-1 h-9" onClick={() => { setAddMode(false); setLabel(""); setAddr(""); setMemo(""); setCoinSym(""); setNetChain(""); }}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="flex-1 h-9 bg-emerald-600 hover:bg-emerald-600/90"
                  onClick={() => addMut.mutate()}
                  disabled={!canAdd || addMut.isPending}
                  data-testid="btn-add-whitelist"
                >
                  {addMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><ShieldPlus className="h-4 w-4 mr-1.5" />Add Address</>}
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="outline"
              className="w-full h-10 text-xs font-medium border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300"
              onClick={() => setAddMode(true)}
              data-testid="btn-show-add-whitelist"
            >
              <ShieldPlus className="h-4 w-4 mr-2" />
              Add New Address
            </Button>
          )}
        </div>

        <div className="px-6 pb-5">
          <Button variant="outline" size="sm" className="w-full h-9" onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
