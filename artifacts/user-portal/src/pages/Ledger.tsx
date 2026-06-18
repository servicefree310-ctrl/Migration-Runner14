import { useState, useCallback } from "react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { get } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowDownLeft, ArrowUpRight, Bot, ArrowLeftRight, Coins, TrendingUp,
  TrendingDown, Zap, Gift, ShieldCheck, RefreshCw, ChevronLeft, ChevronRight,
  BookOpen, Info, X, Download, Loader2, Wallet, BarChart3, Landmark, Globe, Video,
} from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

/* ── Types ─────────────────────────────────────────────────────────────────── */
type LedgerEntry = {
  id: number;
  type: string;
  walletType: string;
  coin: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  refType: string | null;
  refId: string | null;
  note: string | null;
  createdAt: string;
};

type LedgerResponse = {
  entries: LedgerEntry[];
  total: number;
  limit: number;
  offset: number;
};

type SummaryResponse = {
  totalAiEarningsUsdt: number;
  aiEarningsCount: number;
  totalCreditedInr: number;
  totalDebitedInr: number;
  totalCreditedUsdt: number;
  totalDebitedUsdt: number;
};

type WalletTab = "all" | "spot" | "futures" | "inr";
type Period    = "1d"  | "7d"  | "1m"  | "all";

/* ── Constants ─────────────────────────────────────────────────────────────── */
const LIMIT = 25;

const WALLET_TABS: { value: WalletTab; label: string; icon: React.ReactNode; desc: string }[] = [
  { value: "all",     label: "All",     icon: <Globe     className="h-3.5 w-3.5" />, desc: "All wallets"          },
  { value: "spot",    label: "Spot",    icon: <Wallet    className="h-3.5 w-3.5" />, desc: "Spot trading wallet"  },
  { value: "futures", label: "Futures", icon: <BarChart3 className="h-3.5 w-3.5" />, desc: "Futures wallet"       },
  { value: "inr",     label: "Fiat ₹",  icon: <Landmark  className="h-3.5 w-3.5" />, desc: "INR fiat wallet"      },
];

const PERIOD_OPTIONS: { value: Period; label: string; shortLabel: string }[] = [
  { value: "1d",  label: "Today",   shortLabel: "1D"  },
  { value: "7d",  label: "7 Days",  shortLabel: "7D"  },
  { value: "1m",  label: "1 Month", shortLabel: "1M"  },
  { value: "all", label: "All",     shortLabel: "All" },
];

const TYPE_META: Record<string, { label: string; icon: React.ReactNode; tone: string; credit: boolean | null }> = {
  deposit_inr:         { label: "INR Deposit",       icon: <ArrowDownLeft  className="h-3.5 w-3.5" />, tone: "text-emerald-400", credit: true  },
  deposit_crypto:      { label: "Crypto Deposit",    icon: <ArrowDownLeft  className="h-3.5 w-3.5" />, tone: "text-emerald-400", credit: true  },
  withdrawal_inr:      { label: "INR Withdrawal",    icon: <ArrowUpRight   className="h-3.5 w-3.5" />, tone: "text-rose-400",    credit: false },
  withdrawal_crypto:   { label: "Crypto Withdrawal", icon: <ArrowUpRight   className="h-3.5 w-3.5" />, tone: "text-rose-400",    credit: false },
  ai_earning:          { label: "AI Earning",        icon: <Bot            className="h-3.5 w-3.5" />, tone: "text-violet-400",  credit: true  },
  ai_principal_lock:   { label: "AI Invested",       icon: <Bot            className="h-3.5 w-3.5" />, tone: "text-amber-400",   credit: false },
  ai_principal_return: { label: "AI Returned",       icon: <Bot            className="h-3.5 w-3.5" />, tone: "text-emerald-400", credit: true  },
  transfer_in:         { label: "Transfer In",       icon: <ArrowLeftRight className="h-3.5 w-3.5" />, tone: "text-emerald-400", credit: true  },
  transfer_out:        { label: "Transfer Out",      icon: <ArrowLeftRight className="h-3.5 w-3.5" />, tone: "text-rose-400",    credit: false },
  trade_fee:           { label: "Trade Fee",         icon: <Coins          className="h-3.5 w-3.5" />, tone: "text-rose-400",    credit: false },
  trade_buy:           { label: "Trade Buy",         icon: <TrendingUp     className="h-3.5 w-3.5" />, tone: "text-emerald-400", credit: true  },
  trade_sell:          { label: "Trade Sell",        icon: <TrendingDown   className="h-3.5 w-3.5" />, tone: "text-rose-400",    credit: false },
  earn_deposit:        { label: "Earn Deposit",      icon: <Coins          className="h-3.5 w-3.5" />, tone: "text-amber-400",   credit: false },
  earn_withdrawal:     { label: "Earn Withdrawal",   icon: <Coins          className="h-3.5 w-3.5" />, tone: "text-emerald-400", credit: true  },
  earn_interest:       { label: "Earn Interest",     icon: <Zap            className="h-3.5 w-3.5" />, tone: "text-emerald-400", credit: true  },
  p2p_credit:          { label: "P2P Credit",        icon: <ArrowDownLeft  className="h-3.5 w-3.5" />, tone: "text-emerald-400", credit: true  },
  p2p_debit:           { label: "P2P Debit",         icon: <ArrowUpRight   className="h-3.5 w-3.5" />, tone: "text-rose-400",    credit: false },
  referral_bonus:      { label: "Referral Bonus",    icon: <Gift           className="h-3.5 w-3.5" />, tone: "text-amber-400",   credit: true  },
  admin_credit:        { label: "Admin Credit",      icon: <ShieldCheck    className="h-3.5 w-3.5" />, tone: "text-emerald-400", credit: true  },
  admin_debit:         { label: "Admin Debit",       icon: <ShieldCheck    className="h-3.5 w-3.5" />, tone: "text-rose-400",    credit: false },
  video_reward:        { label: "Video Reward",      icon: <Video          className="h-3.5 w-3.5" />, tone: "text-pink-400",    credit: true  },
  convert:             { label: "Convert",           icon: <RefreshCw      className="h-3.5 w-3.5" />, tone: "text-sky-400",     credit: null  },
  options_pnl:            { label: "Options P&L",       icon: <TrendingUp     className="h-3.5 w-3.5" />, tone: "text-violet-400",  credit: null  },
  futures_pnl:            { label: "Futures P&L",       icon: <TrendingUp     className="h-3.5 w-3.5" />, tone: "text-violet-400",  credit: null  },
  instruments_margin:     { label: "Futures Margin",    icon: <BarChart3      className="h-3.5 w-3.5" />, tone: "text-amber-400",   credit: false },
  instruments_pnl:        { label: "Instruments P&L",   icon: <TrendingUp     className="h-3.5 w-3.5" />, tone: "text-violet-400",  credit: null  },
  trade_tds:              { label: "TDS Deducted",       icon: <ShieldCheck    className="h-3.5 w-3.5" />, tone: "text-amber-400",   credit: false },
};

const FILTER_TYPES = [
  { value: "all",                label: "All types"          },
  { value: "deposit_inr",        label: "INR Deposit"        },
  { value: "deposit_crypto",     label: "Crypto Deposit"     },
  { value: "withdrawal_inr",     label: "INR Withdrawal"     },
  { value: "withdrawal_crypto",  label: "Crypto Withdrawal"  },
  { value: "ai_earning",         label: "AI Earning"         },
  { value: "ai_principal_lock",  label: "AI Invested"        },
  { value: "ai_principal_return",label: "AI Returned"        },
  { value: "trade_buy",          label: "Trade Buy"          },
  { value: "trade_sell",         label: "Trade Sell"         },
  { value: "trade_fee",          label: "Trade Fee"          },
  { value: "transfer_in",        label: "Transfer In"        },
  { value: "transfer_out",       label: "Transfer Out"       },
  { value: "earn_deposit",       label: "Earn Deposit"       },
  { value: "earn_withdrawal",    label: "Earn Withdrawal"    },
  { value: "earn_interest",      label: "Earn Interest"      },
  { value: "p2p_credit",         label: "P2P Credit"         },
  { value: "p2p_debit",          label: "P2P Debit"          },
  { value: "convert",            label: "Convert"            },
  { value: "futures_pnl",        label: "Futures P&L"        },
  { value: "options_pnl",        label: "Options P&L"        },
  { value: "instruments_margin", label: "Futures Margin"     },
  { value: "instruments_pnl",   label: "Instruments P&L"    },
  { value: "trade_tds",          label: "TDS Deducted"       },
  { value: "referral_bonus",     label: "Referral Bonus"     },
  { value: "video_reward",       label: "Video Reward"       },
  { value: "admin_credit",       label: "Admin Credit"       },
  { value: "admin_debit",        label: "Admin Debit"        },
];

/* ── Helpers ─────────────────────────────────────────────────────────────── */
function getPeriodDates(period: Period): { from: string; to: string } {
  if (period === "all") return { from: "", to: "" };
  const now  = new Date();
  const from = new Date();
  if (period === "1d") from.setDate(now.getDate() - 1);
  if (period === "7d") from.setDate(now.getDate() - 7);
  if (period === "1m") from.setMonth(now.getMonth() - 1);
  return {
    from: from.toISOString().slice(0, 10),
    to:   now.toISOString().slice(0, 10),
  };
}

function fmt(n: number, coin: string) {
  const abs = Math.abs(n);
  if (coin === "INR")                       return `₹${abs.toLocaleString("en-IN",  { maximumFractionDigits: 2 })}`;
  if (["USDT", "USDC", "BUSD"].includes(coin)) return `${abs.toLocaleString("en-US",  { maximumFractionDigits: 4 })} ${coin}`;
  return `${abs.toLocaleString("en-US", { maximumFractionDigits: 6 })} ${coin}`;
}

function fmtBal(n: number, coin: string) {
  if (coin === "INR") return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
  return `${n.toLocaleString("en-US", { maximumFractionDigits: 4 })} ${coin}`;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function fmtDateShort(d: string) {
  return new Date(d).toLocaleString("en-IN", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

/* ── Summary Cards ─────────────────────────────────────────────────────────── */
function SummaryCards({ data }: { data: SummaryResponse }) {
  const netInr  = data.totalCreditedInr  - data.totalDebitedInr;
  const netUsdt = data.totalCreditedUsdt - data.totalDebitedUsdt;

  const fmtInr  = (v: number) => `₹${Math.abs(v).toLocaleString("en-IN",  { maximumFractionDigits: 2 })}`;
  const fmtUsdt = (v: number) => `${Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 4 })} USDT`;

  const hasInr  = data.totalCreditedInr  > 0 || data.totalDebitedInr  > 0;
  const hasUsdt = data.totalCreditedUsdt > 0 || data.totalDebitedUsdt > 0;

  const cards = [
    {
      icon: <Bot className="h-4 w-4 text-violet-400" />,
      label: "AI Earnings",
      border: "border-violet-400/20",
      bg:     "bg-violet-500/5",
      value:  <span className="text-violet-300">{fmtUsdt(data.totalAiEarningsUsdt)}</span>,
      sub:    `${data.aiEarningsCount} credits`,
    },
    {
      icon: <ArrowDownLeft className="h-4 w-4 text-emerald-400" />,
      label: "Total Credited",
      border: "border-emerald-400/20",
      bg:     "bg-emerald-500/5",
      value: (
        <div className="flex flex-col">
          {hasUsdt && <span className="text-emerald-400">+{fmtUsdt(data.totalCreditedUsdt)}</span>}
          {hasInr  && <span className={cn("text-emerald-400", hasUsdt ? "text-xs" : "")}>+{fmtInr(data.totalCreditedInr)}</span>}
          {!hasUsdt && !hasInr && <span className="text-muted-foreground">₹0</span>}
        </div>
      ),
      sub: "All inflows",
    },
    {
      icon: <ArrowUpRight className="h-4 w-4 text-rose-400" />,
      label: "Total Debited",
      border: "border-rose-400/20",
      bg:     "bg-rose-500/5",
      value: (
        <div className="flex flex-col">
          {hasUsdt && data.totalDebitedUsdt > 0 && <span className="text-rose-400">−{fmtUsdt(data.totalDebitedUsdt)}</span>}
          {hasInr  && data.totalDebitedInr  > 0 && <span className={cn("text-rose-400", hasUsdt && data.totalDebitedUsdt > 0 ? "text-xs" : "")}>−{fmtInr(data.totalDebitedInr)}</span>}
          {data.totalDebitedUsdt === 0 && data.totalDebitedInr === 0 && <span className="text-muted-foreground">₹0</span>}
        </div>
      ),
      sub: "All outflows",
    },
    {
      icon: <Coins className="h-4 w-4 text-amber-400" />,
      label: "Net Flow",
      border: netUsdt >= 0 && netInr >= 0 ? "border-emerald-400/20" : "border-rose-400/20",
      bg:     netUsdt >= 0 && netInr >= 0 ? "bg-emerald-500/5"      : "bg-rose-500/5",
      value: (
        <div className="flex flex-col">
          {netUsdt !== 0 && <span className={netUsdt >= 0 ? "text-emerald-400" : "text-rose-400"}>{netUsdt >= 0 ? "+" : "−"}{fmtUsdt(Math.abs(netUsdt))}</span>}
          {netInr  !== 0 && <span className={cn(netInr  >= 0 ? "text-emerald-400" : "text-rose-400", netUsdt !== 0 ? "text-xs" : "")}>{netInr >= 0 ? "+" : "−"}{fmtInr(Math.abs(netInr))}</span>}
          {netUsdt === 0 && netInr === 0 && <span className="text-muted-foreground">₹0</span>}
        </div>
      ),
      sub: "Credited − Debited",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 mb-5">
      {cards.map(c => (
        <div key={c.label} className={cn("rounded-xl border p-3 sm:p-4", c.border, c.bg)}>
          <div className="flex items-center gap-1.5 mb-2">
            {c.icon}
            <span className="text-[11px] sm:text-xs text-muted-foreground">{c.label}</span>
          </div>
          <div className="text-sm sm:text-base font-bold tabular-nums leading-tight">{c.value}</div>
          <div className="text-[10px] sm:text-xs text-muted-foreground mt-1">{c.sub}</div>
        </div>
      ))}
    </div>
  );
}

/* ── Main Page ─────────────────────────────────────────────────────────────── */
export default function LedgerPage() {
  const { user } = useAuth();

  const [walletTab, setWalletTab]   = useState<WalletTab>("all");
  const [period,    setPeriod]      = useState<Period>("all");
  const [typeFilter, setTypeFilter] = useState("");
  const [coinFilter, setCoinFilter] = useState("");
  const [page,       setPage]       = useState(0);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [csvLoading, setCsvLoading] = useState(false);

  /* period → dates */
  const periodDates = getPeriodDates(period);

  const params = new URLSearchParams({
    limit:  String(LIMIT),
    offset: String(page * LIMIT),
    ...(walletTab !== "all" && { wallet: walletTab }),
    ...(typeFilter           && { type:   typeFilter }),
    ...(coinFilter           && { coin:   coinFilter.toUpperCase() }),
    ...(periodDates.from     && { from:   periodDates.from }),
    ...(periodDates.to       && { to:     periodDates.to   }),
  });

  const ledgerQ = useQuery<LedgerResponse>({
    queryKey: ["ledger", walletTab, period, typeFilter, coinFilter, page],
    queryFn:  () => get(`/ledger?${params}`),
    enabled:  !!user,
  });

  const summaryQ = useQuery<SummaryResponse>({
    queryKey: ["ledger-summary"],
    queryFn:  () => get("/ledger/summary"),
    enabled:  !!user,
    staleTime: 20_000,
    refetchInterval: 30_000,
  });

  const entries  = ledgerQ.data?.entries ?? [];
  const total    = ledgerQ.data?.total   ?? 0;
  const pages    = Math.ceil(total / LIMIT);
  const hasFilters = !!(typeFilter || coinFilter || walletTab !== "all" || period !== "all");

  function resetFilters() {
    setTypeFilter(""); setCoinFilter(""); setWalletTab("all"); setPeriod("all"); setPage(0);
  }

  /* ── PDF Download ────────────────────────────────────────────────────────── */
  const downloadPdf = useCallback(async () => {
    if (pdfLoading) return;
    setPdfLoading(true);
    try {
      const exportParams = new URLSearchParams({
        ...(walletTab !== "all" && { wallet: walletTab }),
        ...(typeFilter           && { type:   typeFilter }),
        ...(coinFilter           && { coin:   coinFilter.toUpperCase() }),
        ...(periodDates.from     && { from:   periodDates.from }),
        ...(periodDates.to       && { to:     periodDates.to   }),
      });

      const data: { entries: LedgerEntry[] } = await get(`/ledger/export?${exportParams}`);
      const rows = data.entries;

      const { default: jsPDF }   = await import("jspdf");
      const { default: autoTable } = await import("jspdf-autotable");

      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

      /* Header */
      doc.setFontSize(18);
      doc.setTextColor(40, 40, 40);
      doc.text("Zebvix — Wallet Ledger", 14, 16);

      doc.setFontSize(9);
      doc.setTextColor(100, 100, 100);
      const walletLabel = walletTab === "all" ? "All Wallets" : walletTab.charAt(0).toUpperCase() + walletTab.slice(1);
      const periodLabel = PERIOD_OPTIONS.find(p => p.value === period)?.label ?? "All";
      doc.text(`Wallet: ${walletLabel}  |  Period: ${periodLabel}  |  Generated: ${new Date().toLocaleString("en-IN")}`, 14, 23);
      if (user?.name) doc.text(`Account: ${user.name}`, 14, 28);

      doc.setDrawColor(200, 200, 200);
      doc.line(14, 32, 283, 32);

      /* Table */
      autoTable(doc, {
        startY: 35,
        head: [["#", "Date & Time", "Type", "Wallet", "Coin", "Amount", "Balance Before", "Balance After", "Note"]],
        body: rows.map((e, i) => {
          const meta = TYPE_META[e.type];
          const sign = e.amount >= 0 ? "+" : "−";
          return [
            String(i + 1),
            fmtDate(e.createdAt),
            meta?.label ?? e.type,
            e.walletType.charAt(0).toUpperCase() + e.walletType.slice(1),
            e.coin,
            `${sign}${fmt(e.amount, e.coin)}`,
            fmtBal(e.balanceBefore, e.coin),
            fmtBal(e.balanceAfter,  e.coin),
            e.note ?? (e.refId ? `Ref: ${e.refId}` : "—"),
          ];
        }),
        styles:          { fontSize: 7.5, cellPadding: 2.5 },
        headStyles:      { fillColor: [30, 30, 30], textColor: 255, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [248, 248, 248] },
        columnStyles: {
          0: { cellWidth: 8  },
          1: { cellWidth: 36 },
          2: { cellWidth: 32 },
          3: { cellWidth: 18 },
          4: { cellWidth: 14 },
          5: { cellWidth: 30, halign: "right" },
          6: { cellWidth: 32, halign: "right" },
          7: { cellWidth: 32, halign: "right" },
          8: { cellWidth: "auto" as any },
        },
        didDrawCell: (hookData: any) => {
          if (hookData.section === "body" && hookData.column.index === 5) {
            const text = hookData.cell.text?.[0] ?? "";
            if (text.startsWith("+")) doc.setTextColor(22, 163, 74);
            else if (text.startsWith("−")) doc.setTextColor(220, 38, 38);
            else doc.setTextColor(40, 40, 40);
          }
        },
      });

      /* Footer */
      const pageCount = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text(`Page ${i} of ${pageCount}  |  Total ${rows.length} transactions  |  Zebvix Exchange`, 14, doc.internal.pageSize.getHeight() - 6);
      }

      const fileName = [
        "zebvix-ledger",
        walletTab !== "all" ? walletTab : "",
        period !== "all" ? period : "",
        new Date().toISOString().slice(0, 10),
      ].filter(Boolean).join("-") + ".pdf";

      doc.save(fileName);
    } catch (err) {
      toast.error("PDF generation failed. Please try again.");
    } finally {
      setPdfLoading(false);
    }
  }, [walletTab, period, typeFilter, coinFilter, periodDates, user, pdfLoading]);

  /* ── CSV Download ─────────────────────────────────────────────────────────── */
  const downloadCsv = useCallback(async () => {
    if (csvLoading) return;
    setCsvLoading(true);
    try {
      const exportParams = new URLSearchParams({
        ...(walletTab !== "all" && { wallet: walletTab }),
        ...(typeFilter           && { type:   typeFilter }),
        ...(coinFilter           && { coin:   coinFilter.toUpperCase() }),
        ...(periodDates.from     && { from:   periodDates.from }),
        ...(periodDates.to       && { to:     periodDates.to   }),
      });
      const data: { entries: LedgerEntry[] } = await get(`/ledger/export?${exportParams}`);
      const rows = data.entries;

      const escape = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
      const headers = ["#", "Date & Time", "Type", "Wallet", "Coin", "Amount", "Balance Before", "Balance After", "Note"];
      const csvRows = [
        headers.map(escape).join(","),
        ...rows.map((e, i) => {
          const meta = TYPE_META[e.type];
          const sign = e.amount >= 0 ? "+" : "−";
          return [
            String(i + 1),
            escape(fmtDate(e.createdAt)),
            escape(meta?.label ?? e.type),
            escape(e.walletType.charAt(0).toUpperCase() + e.walletType.slice(1)),
            escape(e.coin),
            escape(`${sign}${fmt(e.amount, e.coin)}`),
            escape(fmtBal(e.balanceBefore, e.coin)),
            escape(fmtBal(e.balanceAfter, e.coin)),
            escape(e.note ?? (e.refId ? `Ref: ${e.refId}` : "")),
          ].join(",");
        }),
      ];

      const fileName = [
        "zebvix-ledger",
        walletTab !== "all" ? walletTab : "",
        period !== "all" ? period : "",
        new Date().toISOString().slice(0, 10),
      ].filter(Boolean).join("-") + ".csv";

      const blob = new Blob(["\uFEFF" + csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Ledger exported");
    } catch (err) {
      toast.error("CSV export failed. Please try again.");
    } finally {
      setCsvLoading(false);
    }
  }, [walletTab, period, typeFilter, coinFilter, periodDates, csvLoading]);

  /* ── Auth guard ──────────────────────────────────────────────────────────── */
  if (!user) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <BookOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <h2 className="text-xl sm:text-2xl font-bold mb-2">Login Required</h2>
        <p className="text-muted-foreground text-sm mb-6">Please log in to view your wallet ledger</p>
        <Button asChild><Link href="/login">Log In</Link></Button>
      </div>
    );
  }

  /* ── Render ──────────────────────────────────────────────────────────────── */
  return (
    <div className="container mx-auto px-3 md:px-6 py-4 max-w-7xl">

      {/* ── Page header ─────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold flex items-center gap-2">
            <BookOpen className="h-5 w-5 sm:h-6 sm:w-6 text-primary shrink-0" />
            Wallet Ledger
          </h1>
          <p className="text-muted-foreground text-xs sm:text-sm mt-0.5">
            Complete history of every fund movement — Spot, Futures &amp; Fiat
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={() => { ledgerQ.refetch(); summaryQ.refetch(); }}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={downloadCsv}
            disabled={csvLoading}
          >
            {csvLoading
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Download className="h-3.5 w-3.5" />
            }
            <span className="hidden sm:inline">{csvLoading ? "Exporting…" : "CSV"}</span>
          </Button>
          <Button
            size="sm"
            className="h-8 text-xs gap-1.5 bg-primary/90 hover:bg-primary"
            onClick={downloadPdf}
            disabled={pdfLoading}
          >
            {pdfLoading
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Download className="h-3.5 w-3.5" />
            }
            <span className="hidden sm:inline">{pdfLoading ? "Generating…" : "PDF"}</span>
          </Button>
        </div>
      </div>

      {/* ── Summary cards ───────────────────────────────────────────── */}
      {summaryQ.data && <SummaryCards data={summaryQ.data} />}

      {/* ── Wallet type tabs ─────────────────────────────────────────── */}
      <Tabs value={walletTab} onValueChange={(v) => { setWalletTab(v as WalletTab); setPage(0); }} className="mb-4">
        <div className="overflow-x-auto -mx-1 px-1">
          <TabsList className="inline-flex h-10 min-w-full sm:min-w-0 gap-0.5 bg-muted/40 border border-border p-1 rounded-xl">
            {WALLET_TABS.map(t => (
              <TabsTrigger
                key={t.value}
                value={t.value}
                className={cn(
                  "flex-1 sm:flex-none inline-flex items-center gap-1.5 text-xs sm:text-sm px-3 sm:px-5 rounded-lg transition-all",
                  "data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-foreground",
                )}
              >
                {t.icon}
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>

      {/* ── Period + filters row ──────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card/60 p-3 mb-4 space-y-3">

        {/* Period quick buttons */}
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground uppercase tracking-wide mr-1 hidden sm:inline">Period:</span>
          {PERIOD_OPTIONS.map(p => (
            <button
              key={p.value}
              onClick={() => { setPeriod(p.value); setPage(0); }}
              className={cn(
                "px-3 py-1 rounded-lg text-xs font-medium transition-all border",
                period === p.value
                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                  : "bg-muted/40 text-muted-foreground border-transparent hover:bg-muted hover:text-foreground",
              )}
            >
              <span className="sm:hidden">{p.shortLabel}</span>
              <span className="hidden sm:inline">{p.label}</span>
            </button>
          ))}
          {period !== "all" && periodDates.from && (
            <span className="text-[10px] text-muted-foreground ml-1">
              {periodDates.from} → {periodDates.to}
            </span>
          )}
        </div>

        {/* Type + Coin filters */}
        <div className="flex flex-wrap gap-2 items-end">
          <div className="flex flex-col gap-1 min-w-[160px]">
            <span className="text-[11px] text-muted-foreground uppercase tracking-wide">Transaction type</span>
            <Select value={typeFilter || "all"} onValueChange={(v) => { setTypeFilter(v === "all" ? "" : v); setPage(0); }}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                {FILTER_TYPES.map(t => (
                  <SelectItem key={t.value} value={t.value} className="text-xs">{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[11px] text-muted-foreground uppercase tracking-wide">Coin / Asset</span>
            <Input
              placeholder="BTC, USDT, INR…"
              value={coinFilter}
              onChange={(e) => { setCoinFilter(e.target.value); setPage(0); }}
              className="h-8 text-xs w-32"
            />
          </div>

          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs gap-1.5 self-end text-muted-foreground hover:text-foreground"
              onClick={resetFilters}
            >
              <X className="h-3 w-3" /> Clear all
            </Button>
          )}

          <div className="ml-auto text-[11px] text-muted-foreground self-end pb-1.5">
            {total > 0 && `${total.toLocaleString()} entries`}
          </div>
        </div>
      </div>

      {/* ── Ledger table ─────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/30 text-muted-foreground text-xs uppercase tracking-wide border-b border-border">
                <th className="px-3 sm:px-4 py-3 text-left">Type</th>
                <th className="px-3 sm:px-4 py-3 text-left hidden sm:table-cell">Wallet</th>
                <th className="px-3 sm:px-4 py-3 text-left">Coin</th>
                <th className="px-3 sm:px-4 py-3 text-right">Amount</th>
                <th className="px-3 sm:px-4 py-3 text-right hidden md:table-cell">Balance Before</th>
                <th className="px-3 sm:px-4 py-3 text-right hidden md:table-cell">Balance After</th>
                <th className="px-3 sm:px-4 py-3 text-left hidden lg:table-cell">Note</th>
                <th className="px-3 sm:px-4 py-3 text-right">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {ledgerQ.isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-3.5 bg-muted/40 rounded w-16" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : ledgerQ.isError ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center">
                    <Info className="h-10 w-10 text-rose-400/60 mx-auto mb-3" />
                    <div className="text-rose-400 text-sm font-medium">Failed to load ledger</div>
                    <div className="text-muted-foreground text-xs mt-1 mb-4">Check your connection and try again</div>
                    <Button variant="outline" size="sm" onClick={() => ledgerQ.refetch()}>
                      <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Retry
                    </Button>
                  </td>
                </tr>
              ) : entries.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center">
                    <Info className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                    <div className="text-muted-foreground text-sm">
                      {hasFilters
                        ? "No entries match your filters"
                        : "No ledger entries yet — fund movements will appear here"}
                    </div>
                    {hasFilters && (
                      <Button variant="link" size="sm" className="mt-2 text-xs" onClick={resetFilters}>
                        Clear filters
                      </Button>
                    )}
                  </td>
                </tr>
              ) : (
                entries.map((e) => {
                  const meta     = TYPE_META[e.type] ?? { label: e.type, icon: <Coins className="h-3.5 w-3.5" />, tone: "text-muted-foreground", credit: null };
                  const isCredit = e.amount >= 0;
                  const amtColor = meta.credit === null
                    ? (isCredit ? "text-emerald-400" : "text-rose-400")
                    : (meta.credit ? "text-emerald-400" : "text-rose-400");

                  return (
                    <tr key={e.id} className="hover:bg-muted/10 transition-colors group">
                      {/* Type */}
                      <td className="px-3 sm:px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className={cn("shrink-0", meta.tone)}>{meta.icon}</span>
                          <span className="font-medium text-[11px] sm:text-xs leading-tight">{meta.label}</span>
                        </div>
                      </td>

                      {/* Wallet */}
                      <td className="px-3 sm:px-4 py-3 hidden sm:table-cell">
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[9px] px-1.5 py-0 capitalize",
                            e.walletType === "futures" && "border-violet-400/40 text-violet-300",
                            e.walletType === "fiat"    && "border-amber-400/40 text-amber-300",
                            e.walletType === "spot"    && "border-sky-400/40 text-sky-300",
                          )}
                        >
                          {e.walletType}
                        </Badge>
                      </td>

                      {/* Coin */}
                      <td className="px-3 sm:px-4 py-3">
                        <Badge variant="secondary" className="text-[10px] py-0 px-1.5 font-mono">
                          {e.coin}
                        </Badge>
                      </td>

                      {/* Amount */}
                      <td className={cn("px-3 sm:px-4 py-3 text-right font-mono font-semibold tabular-nums text-xs sm:text-sm", amtColor)}>
                        {isCredit ? "+" : "−"}{fmt(e.amount, e.coin)}
                      </td>

                      {/* Balance Before */}
                      <td className="px-3 sm:px-4 py-3 text-right tabular-nums text-xs text-muted-foreground hidden md:table-cell">
                        {fmtBal(e.balanceBefore, e.coin)}
                      </td>

                      {/* Balance After */}
                      <td className={cn(
                        "px-3 sm:px-4 py-3 text-right tabular-nums text-xs hidden md:table-cell",
                        isCredit ? "text-emerald-400/80" : "text-rose-400/80",
                      )}>
                        {fmtBal(e.balanceAfter, e.coin)}
                      </td>

                      {/* Note */}
                      <td className="px-3 sm:px-4 py-3 text-xs text-muted-foreground max-w-[160px] truncate hidden lg:table-cell">
                        {e.note ?? (e.refId ? `Ref: ${e.refId}` : "—")}
                      </td>

                      {/* Time */}
                      <td className="px-3 sm:px-4 py-3 text-right text-[10px] sm:text-xs text-muted-foreground whitespace-nowrap">
                        <span className="sm:hidden">{fmtDateShort(e.createdAt)}</span>
                        <span className="hidden sm:inline">{fmtDate(e.createdAt)}</span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ── Pagination ─────────────────────────────────────────────── */}
        {(total > 0 || page > 0) && (
          <div className="flex items-center justify-between px-3 sm:px-4 py-3 border-t border-border bg-muted/10 text-xs text-muted-foreground">
            <span>
              {total > 0 ? (
                <>
                  Showing {page * LIMIT + 1}–{Math.min((page + 1) * LIMIT, total)} of {total.toLocaleString()}
                </>
              ) : ""}
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost" size="icon" className="h-7 w-7"
                disabled={page === 0}
                onClick={() => setPage(p => p - 1)}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <span className="px-2">
                {page + 1} / {pages || 1}
              </span>
              <Button
                variant="ghost" size="icon" className="h-7 w-7"
                disabled={page >= pages - 1}
                onClick={() => setPage(p => p + 1)}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ── PDF tip ──────────────────────────────────────────────────── */}
      <p className="text-center text-[11px] text-muted-foreground mt-4">
        <Download className="h-3 w-3 inline mr-1" />
        Click <strong>PDF</strong> to download a statement for the selected wallet &amp; period (up to 1,000 transactions).
      </p>
    </div>
  );
}
