import { useEffect, useMemo, useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { SuccessModal, type GenericSuccess } from "@/components/SuccessModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  TrendingUp, TrendingDown, Activity, X, ArrowDownToLine, ArrowUpToLine,
  Calendar, Zap, BarChart3, Shield, Clock, Sigma, ChevronRight, Info,
  Layers, AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────
type Contract = {
  id: number; symbol: string; underlyingSymbol: string; optionType: "call" | "put";
  strike: number; expiryAt: string; iv: number; contractSize: number; minQty: number;
  mark: number; delta: number; gamma: number; theta: number; vega: number;
  spot: number; intrinsic: number; timeValue: number;
};
type Position = {
  id: number; contractId: number; symbol: string; optionType: "call" | "put";
  strike: number; expiryAt: string; side: "long" | "short"; qty: number;
  avgEntryPremium: number; marginLocked: number; mark: number; spot: number;
  delta: number; gamma: number; theta: number; vega: number; unrealizedPnl: number;
  openedAt: string;
};
type OrderRow = {
  id: number; contractSymbol: string; optionType: string; strike: string;
  side: string; qty: string; premium: string; markPriceAtFill: string;
  fee: string; status: string; createdAt: string;
};

// ─── Formatters ──────────────────────────────────────────────────────────────
const fmtUsd = (n: number, dp = 2) =>
  Number(n ?? 0).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;
const fmtDelta = (n: number) => n.toFixed(3);

function timeUntil(iso: string): { label: string; urgent: boolean; days: number } {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return { label: "Expired", urgent: true, days: 0 };
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const urgent = d < 1;
  const label = d > 0 ? `${d}d ${h}h` : `${h}h ${m}m`;
  return { label, urgent, days: d };
}

// ─── Payoff Diagram ──────────────────────────────────────────────────────────
function PayoffDiagram({
  optionType, strike, premium, qty, side, spot,
}: {
  optionType: "call" | "put"; strike: number; premium: number; qty: number;
  side: "buy" | "sell"; spot: number;
}) {
  const W = 320; const H = 140;
  const low = spot * 0.6; const high = spot * 1.4;
  const steps = 60;

  const payoffAt = (s: number) => {
    const intrinsic = optionType === "call" ? Math.max(0, s - strike) : Math.max(0, strike - s);
    const base = side === "buy"
      ? (intrinsic - premium) * qty
      : (premium - intrinsic) * qty;
    return base;
  };

  const prices = Array.from({ length: steps + 1 }, (_, i) => low + (high - low) * (i / steps));
  const payoffs = prices.map(payoffAt);
  const minP = Math.min(...payoffs);
  const maxP = Math.max(...payoffs);
  const range = Math.max(maxP - minP, 1);

  const toX = (i: number) => (i / steps) * W;
  const toY = (p: number) => H - ((p - minP) / range) * (H - 20) - 10;

  const linePath = prices.map((_, i) => `${i === 0 ? "M" : "L"}${toX(i).toFixed(1)},${toY(payoffs[i]).toFixed(1)}`).join(" ");
  const zeroY = toY(0);
  const bePrice = optionType === "call"
    ? (side === "buy" ? strike + premium : strike - premium)
    : (side === "buy" ? strike - premium : strike + premium);
  const spotX = ((spot - low) / (high - low)) * W;
  const beX = ((bePrice - low) / (high - low)) * W;

  return (
    <div className="rounded-lg bg-muted/40 border border-border/30 p-3">
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
        <BarChart3 className="h-3 w-3" /> Payoff at Expiry
      </div>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 140 }}>
        <defs>
          <linearGradient id="pg" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="hsl(142 71% 45%)" stopOpacity="0.3" />
            <stop offset="100%" stopColor="hsl(142 71% 45%)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="pl" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="hsl(0 72% 51%)" stopOpacity="0" />
            <stop offset="100%" stopColor="hsl(0 72% 51%)" stopOpacity="0.3" />
          </linearGradient>
          <clipPath id="cpPos"><rect x="0" y="0" width={W} height={zeroY} /></clipPath>
          <clipPath id="cpNeg"><rect x="0" y={zeroY} width={W} height={H - zeroY} /></clipPath>
        </defs>
        <line x1="0" y1={zeroY} x2={W} y2={zeroY} stroke="hsl(var(--border))" strokeWidth="1" strokeDasharray="4 2" />
        {spotX >= 0 && spotX <= W && (
          <line x1={spotX} y1={0} x2={spotX} y2={H} stroke="hsl(43 96% 56% / 0.5)" strokeWidth="1" strokeDasharray="3 2" />
        )}
        {beX >= 0 && beX <= W && (
          <line x1={beX} y1={0} x2={beX} y2={H} stroke="hsl(217 91% 60% / 0.6)" strokeWidth="1" strokeDasharray="3 2" />
        )}
        <path d={`${linePath} L${W},${toY(payoffs[payoffs.length - 1]).toFixed(1)} L${W},${zeroY} L0,${zeroY} Z`} fill="url(#pg)" clipPath="url(#cpPos)" />
        <path d={`${linePath} L${W},${toY(payoffs[payoffs.length - 1]).toFixed(1)} L${W},${zeroY} L0,${zeroY} Z`} fill="url(#pl)" clipPath="url(#cpNeg)" />
        <path d={linePath} stroke={side === "buy" ? "hsl(142 71% 45%)" : "hsl(0 72% 51%)"} strokeWidth="2" fill="none" />
        {spotX >= 0 && spotX <= W && (
          <text x={spotX + 3} y="12" fill="hsl(43 96% 56%)" fontSize="8" fontFamily="monospace">Spot</text>
        )}
        {beX >= 0 && beX <= W && (
          <text x={beX + 3} y="22" fill="hsl(217 91% 60%)" fontSize="8" fontFamily="monospace">B/E</text>
        )}
      </svg>
      <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-1.5">
        <span>{fmtUsd(low, 0)} USDT</span>
        <span className="text-blue-400">B/E: {fmtUsd(bePrice, 0)} USDT</span>
        <span>{fmtUsd(high, 0)} USDT</span>
      </div>
    </div>
  );
}

// ─── Greeks Badge ────────────────────────────────────────────────────────────
function GreekPill({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className={`text-center p-2 rounded-lg border ${color}`}>
      <div className="text-[9px] uppercase tracking-wider font-medium opacity-70 mb-0.5">{label}</div>
      <div className="text-xs font-bold tabular-nums">{value}</div>
    </div>
  );
}

// ─── PnL Bar ─────────────────────────────────────────────────────────────────
function PnlBar({ pnl, entry, qty }: { pnl: number; entry: number; qty: number }) {
  const max = entry * qty * 2;
  const pct = Math.min(Math.abs(pnl) / Math.max(max, 1) * 100, 100);
  return (
    <div className="h-1 w-full rounded-full bg-muted/30 overflow-hidden mt-0.5">
      <div
        className={`h-full rounded-full transition-all ${pnl >= 0 ? "bg-emerald-500" : "bg-rose-500"}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// ─── Margin Bar ──────────────────────────────────────────────────────────────
function MarginBar({ margin, total }: { margin: number; total: number }) {
  const pct = total > 0 ? Math.min((margin / total) * 100, 100) : 0;
  return (
    <div className="h-1 w-16 rounded-full bg-muted/30 overflow-hidden">
      <div className="h-full rounded-full bg-amber-500/70" style={{ width: `${pct}%` }} />
    </div>
  );
}

// ─── Stat Tile ───────────────────────────────────────────────────────────────
function StatTile({ label, value, sub, tone, icon: Icon }: {
  label: string; value: string; sub?: string; tone?: "success" | "danger" | "amber" | "blue";
  icon?: React.ComponentType<{ className?: string }>;
}) {
  const toneClass = tone === "success" ? "text-emerald-400" : tone === "danger" ? "text-rose-400" : tone === "amber" ? "text-amber-400" : tone === "blue" ? "text-blue-400" : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-card/60 backdrop-blur p-4">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-2">
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {label}
      </div>
      <div className={`font-extrabold text-xl tabular-nums ${toneClass}`}>{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

// ─── Expiry Pill ─────────────────────────────────────────────────────────────
function ExpiryPill({ iso, active, onClick }: { iso: string; active: boolean; onClick: () => void }) {
  const { label, urgent } = timeUntil(iso);
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border whitespace-nowrap transition-all",
        active
          ? "bg-amber-500/15 border-amber-500/40 text-amber-300 shadow-sm shadow-amber-500/10"
          : "bg-muted/20 border-border/50 text-muted-foreground hover:text-foreground hover:border-border",
      )}
    >
      <Calendar className="h-3 w-3 opacity-70" />
      {new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
      <span className={cn("text-[10px] font-medium", urgent ? "text-rose-400" : "opacity-60")}>{label}</span>
    </button>
  );
}

// ─── Option Chain Row ────────────────────────────────────────────────────────
function ChainRow({
  row, spot, onTicket,
}: {
  row: { strike: number; call?: Contract; put?: Contract };
  spot: number;
  onTicket: (c: Contract, side: "buy" | "sell") => void;
}) {
  const atm = spot > 0 && Math.abs(row.strike - spot) / spot < 0.005;
  const itm_call = row.strike < spot;
  const itm_put = row.strike > spot;

  return (
    <tr className={cn(
      "border-b border-border/30 group transition-colors",
      atm ? "bg-amber-500/[0.06]" : "hover:bg-muted/10",
    )}>
      {/* CALL side */}
      <td className={cn("px-2 py-2 text-right tabular-nums text-xs", itm_call ? "text-emerald-300/80" : "text-muted-foreground")}>
        {row.call ? fmtPct(row.call.iv) : "—"}
      </td>
      <td className={cn("px-2 py-2 text-right tabular-nums text-xs", itm_call ? "text-emerald-300/80" : "text-muted-foreground")}>
        {row.call ? fmtDelta(row.call.delta) : "—"}
      </td>
      <td className="px-2 py-2 text-right tabular-nums text-xs text-muted-foreground hidden xl:table-cell">
        {row.call ? row.call.theta.toFixed(2) : "—"}
      </td>
      <td className="px-2 py-2 text-right tabular-nums text-xs text-muted-foreground hidden xl:table-cell">
        {row.call ? `${fmtUsd(row.call.intrinsic)} USDT` : "—"}
      </td>
      <td className={cn("px-2 py-2 text-right tabular-nums font-semibold text-sm", itm_call ? "text-emerald-300" : "text-emerald-400/80")}>
        {row.call ? `${fmtUsd(row.call.mark)} USDT` : "—"}
      </td>
      <td className="px-1.5 py-2 text-center">
        {row.call ? (
          <div className="inline-flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => onTicket(row.call!, "buy")}
              className="px-2.5 py-1 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/35 border border-emerald-500/30 transition-colors"
            >
              BUY
            </button>
            <button
              onClick={() => onTicket(row.call!, "sell")}
              className="px-2.5 py-1 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 hover:bg-rose-500/35 border border-rose-500/30 transition-colors"
            >
              SELL
            </button>
          </div>
        ) : null}
      </td>

      {/* ATM Strike */}
      <td className={cn(
        "px-3 py-2 text-center font-bold tabular-nums text-sm border-x border-border/40",
        atm ? "text-amber-400" : "text-foreground",
      )}>
        {atm && <span className="text-[9px] text-amber-400/70 block">ATM</span>}
        {fmtUsd(row.strike, 0)} USDT
      </td>

      {/* PUT side */}
      <td className="px-1.5 py-2 text-center">
        {row.put ? (
          <div className="inline-flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => onTicket(row.put!, "buy")}
              className="px-2.5 py-1 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/35 border border-emerald-500/30 transition-colors"
            >
              BUY
            </button>
            <button
              onClick={() => onTicket(row.put!, "sell")}
              className="px-2.5 py-1 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 hover:bg-rose-500/35 border border-rose-500/30 transition-colors"
            >
              SELL
            </button>
          </div>
        ) : null}
      </td>
      <td className={cn("px-2 py-2 text-left tabular-nums font-semibold text-sm", itm_put ? "text-rose-300" : "text-rose-400/80")}>
        {row.put ? `${fmtUsd(row.put.mark)} USDT` : "—"}
      </td>
      <td className="px-2 py-2 text-left tabular-nums text-xs text-muted-foreground hidden xl:table-cell">
        {row.put ? `${fmtUsd(row.put.intrinsic)} USDT` : "—"}
      </td>
      <td className="px-2 py-2 text-left tabular-nums text-xs text-muted-foreground hidden xl:table-cell">
        {row.put ? row.put.theta.toFixed(2) : "—"}
      </td>
      <td className={cn("px-2 py-2 text-left tabular-nums text-xs", itm_put ? "text-rose-300/80" : "text-muted-foreground")}>
        {row.put ? fmtDelta(row.put.delta) : "—"}
      </td>
      <td className={cn("px-2 py-2 text-left tabular-nums text-xs", itm_put ? "text-rose-300/80" : "text-muted-foreground")}>
        {row.put ? fmtPct(row.put.iv) : "—"}
      </td>
    </tr>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────
const UNDERLYINGS = ["BTC", "ETH", "SOL", "BNB"];

export default function OptionsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [underlying, setUnderlying] = useState<string>("BTC");
  const [tab, setTab] = useState<"chain" | "positions" | "analytics" | "history">("chain");
  const [successData, setSuccessData] = useState<GenericSuccess | null>(null);

  const contractsQ = useQuery<{ contracts: Contract[] }>({
    queryKey: ["options-contracts", underlying],
    queryFn: () => get(`/options/contracts?underlying=${encodeURIComponent(underlying)}`),
    refetchInterval: 5_000,
  });
  const positionsQ = useQuery<{ positions: Position[] }>({
    queryKey: ["options-positions"],
    queryFn: () => get(`/options/positions`),
    enabled: !!user,
    refetchInterval: 5_000,
  });
  const historyQ = useQuery<{ orders: OrderRow[] }>({
    queryKey: ["options-history"],
    queryFn: () => get(`/options/orders/history?limit=50`),
    enabled: !!user && tab === "history",
  });

  // Group by expiry
  const expiries = useMemo(() => {
    const set = new Set<string>();
    (contractsQ.data?.contracts ?? []).forEach((c) => set.add(c.expiryAt));
    return [...set].sort();
  }, [contractsQ.data]);

  const [activeExpiry, setActiveExpiry] = useState<string>("");
  useEffect(() => {
    if (expiries.length && !expiries.includes(activeExpiry)) setActiveExpiry(expiries[0]);
  }, [expiries, activeExpiry]);

  const chainRows = useMemo(() => {
    const list = (contractsQ.data?.contracts ?? []).filter((c) => c.expiryAt === activeExpiry);
    const byStrike = new Map<number, { strike: number; call?: Contract; put?: Contract }>();
    for (const c of list) {
      const r = byStrike.get(c.strike) ?? { strike: c.strike };
      if (c.optionType === "call") r.call = c; else r.put = c;
      byStrike.set(c.strike, r);
    }
    return [...byStrike.values()].sort((a, b) => a.strike - b.strike);
  }, [contractsQ.data, activeExpiry]);

  const spot = chainRows[0]?.call?.spot ?? chainRows[0]?.put?.spot ?? 0;
  const positions = positionsQ.data?.positions ?? [];

  // Portfolio summary
  const portfolio = useMemo(() => {
    const totalPnl = positions.reduce((s, p) => s + p.unrealizedPnl, 0);
    const netDelta = positions.reduce((s, p) => s + p.delta * p.qty, 0);
    const netTheta = positions.reduce((s, p) => s + p.theta * p.qty, 0);
    const netVega = positions.reduce((s, p) => s + p.vega * p.qty, 0);
    const totalMargin = positions.reduce((s, p) => s + p.marginLocked, 0);
    return { totalPnl, netDelta, netTheta, netVega, totalMargin };
  }, [positions]);

  // Put/Call ratio from chain
  const pcRatio = useMemo(() => {
    const calls = chainRows.filter((r) => r.call).length;
    const puts = chainRows.filter((r) => r.put).length;
    if (!calls) return null;
    return (puts / calls).toFixed(2);
  }, [chainRows]);

  // Order ticket
  const [ticket, setTicket] = useState<{ contract: Contract; side: "buy" | "sell" } | null>(null);
  const [qty, setQty] = useState<string>("0.1");

  const openTicket = useCallback((c: Contract, side: "buy" | "sell") => {
    setTicket({ contract: c, side });
    setQty(String(c.minQty));
  }, []);

  const placeOrder = useMutation({
    mutationFn: (vars: { contractId: number; side: "buy" | "sell"; qty: number }) =>
      post(`/options/orders`, vars),
    onSuccess: (_r, vars) => {
      const side = vars.side === "buy" ? "Long" : "Short";
      setSuccessData({
        kind: "generic", iconKind: "futures", accentColor: vars.side === "buy" ? "#10b981" : "#f59e0b",
        title: "Options Order Filled",
        subtitle: `${side} position opened successfully.`,
        rows: [
          { label: "Side", value: side, accent: vars.side === "buy" ? "#10b981" : "#f59e0b" },
          { label: "Quantity", value: `${vars.qty} contracts` },
          { label: "Status", value: "Filled ✓", accent: "#10b981" },
        ],
      });
      setTicket(null); setQty("0.1");
      qc.invalidateQueries({ queryKey: ["options-positions"] });
      qc.invalidateQueries({ queryKey: ["options-history"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Order failed — please try again"),
  });

  const closePosition = useMutation({
    mutationFn: (id: number) => post(`/options/positions/${id}/close`, {}),
    onSuccess: (r: any) => {
      const pnl = r?.pnl ?? 0;
      setSuccessData({
        kind: "generic", iconKind: "futures", accentColor: pnl >= 0 ? "#10b981" : "#ef4444",
        title: "Position Closed",
        subtitle: "Your options position has been closed.",
        rows: [
          { label: "Realized PnL", value: `${pnl >= 0 ? "+" : ""}${fmtUsd(pnl)} USDT`, accent: pnl >= 0 ? "#10b981" : "#ef4444" },
          { label: "Status", value: "Closed" },
        ],
      });
      qc.invalidateQueries({ queryKey: ["options-positions"] });
      qc.invalidateQueries({ queryKey: ["options-history"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Close failed — please try again"),
  });

  // Ticket computed values
  const qtyNum = Number(qty) || 0;
  const ticketPremium = ticket ? ticket.contract.mark * qtyNum * ticket.contract.contractSize : 0;
  const ticketFee = ticketPremium * 0.001;
  const ticketMargin = ticket?.side === "sell"
    ? (ticket.contract.optionType === "call"
        ? Math.max(ticket.contract.spot, ticket.contract.strike)
        : ticket.contract.strike) * qtyNum * ticket.contract.contractSize
    : 0;
  const ticketTotal = ticket?.side === "buy" ? ticketPremium + ticketFee : ticketMargin;
  const beBreak = ticket
    ? ticket.contract.optionType === "call"
      ? (ticket.side === "buy" ? ticket.contract.strike + ticket.contract.mark : ticket.contract.strike - ticket.contract.mark)
      : (ticket.side === "buy" ? ticket.contract.strike - ticket.contract.mark : ticket.contract.strike + ticket.contract.mark)
    : 0;

  const loading = contractsQ.isLoading;
  const expInfo = activeExpiry ? timeUntil(activeExpiry) : null;

  return (
    <div className="min-h-screen bg-background">

      {/* ── Hero Banner ───────────────────────────────────────────── */}
      <section className="relative border-b border-border overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-violet-950/20" />
        <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-violet-500/10 blur-3xl" />
        <div className="absolute -bottom-16 -left-16 h-56 w-56 rounded-full bg-amber-500/[0.08] blur-3xl" />

        <div className="relative container mx-auto px-4 py-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="flex-1">
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full border border-violet-500/30 bg-violet-500/10 text-[11px] font-semibold text-violet-300 mb-3">
                <Sigma className="h-3 w-3" />
                Black-Scholes Derivatives
              </div>
              <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">Options Trading</h1>
              <p className="text-sm text-muted-foreground mt-1.5 max-w-lg">
                Buy calls & puts with European-style settlement. Premium paid upfront, auto-settled at expiry. Server-authoritative mark pricing.
              </p>
            </div>

            {/* Live stats strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 lg:min-w-[36rem]">
              <StatTile label={`${underlying} Spot`} value={spot > 0 ? `${fmtUsd(spot, 0)} USDT` : "—"} icon={TrendingUp} tone="amber" />
              <StatTile label="Open Positions" value={String(positions.length)} sub={`${fmtUsd(portfolio.totalMargin, 0)} USDT margin`} icon={Shield} />
              <StatTile
                label="Unrealized PnL"
                value={`${portfolio.totalPnl >= 0 ? "+" : ""}${fmtUsd(portfolio.totalPnl)} USDT`}
                icon={Activity}
                tone={portfolio.totalPnl >= 0 ? "success" : "danger"}
              />
              <StatTile
                label="Net Delta"
                value={portfolio.netDelta.toFixed(3)}
                sub={`Θ ${portfolio.netTheta.toFixed(2)}/day`}
                icon={Sigma}
                tone="blue"
              />
            </div>
          </div>

          {/* Underlying selector + quick info */}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1 bg-muted/30 rounded-lg p-1 border border-border/50">
              {UNDERLYINGS.map((u) => (
                <button
                  key={u}
                  onClick={() => setUnderlying(u)}
                  className={cn(
                    "px-3 py-1.5 rounded-md text-xs font-bold transition-all",
                    underlying === u
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {u}
                </button>
              ))}
            </div>

            {pcRatio && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/20 rounded-lg px-3 py-1.5 border border-border/40">
                <Info className="h-3 w-3" />
                Put/Call: <span className="font-semibold text-foreground ml-1">{pcRatio}</span>
              </div>
            )}
            {expInfo && (
              <div className={cn(
                "flex items-center gap-1.5 text-xs rounded-lg px-3 py-1.5 border",
                expInfo.urgent
                  ? "text-rose-400 bg-rose-500/10 border-rose-500/30"
                  : "text-muted-foreground bg-muted/20 border-border/40",
              )}>
                <Clock className="h-3 w-3" />
                Active expiry: <span className="font-semibold ml-1">{expInfo.label}</span>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── Main Content ──────────────────────────────────────────── */}
      <div className="container mx-auto px-4 py-6">
        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList className="mb-5">
            <TabsTrigger value="chain">
              <BarChart3 className="h-3.5 w-3.5 mr-1.5" />
              Option Chain
            </TabsTrigger>
            <TabsTrigger value="positions">
              <Layers className="h-3.5 w-3.5 mr-1.5" />
              Positions
              {positions.length > 0 && (
                <Badge className="ml-1.5 h-4 min-w-[1rem] px-1 text-[9px] bg-primary/20 text-primary border-primary/30">
                  {positions.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="analytics">
              <Activity className="h-3.5 w-3.5 mr-1.5" />
              Analytics
            </TabsTrigger>
            <TabsTrigger value="history">
              <Clock className="h-3.5 w-3.5 mr-1.5" />
              History
            </TabsTrigger>
          </TabsList>

          {/* ─── OPTION CHAIN TAB ─────────────────────────────────── */}
          <TabsContent value="chain" className="space-y-4">
            {/* Expiry selector */}
            {expiries.length > 0 && (
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                <span className="text-xs text-muted-foreground shrink-0 font-medium">Expiry:</span>
                {expiries.map((e) => (
                  <ExpiryPill key={e} iso={e} active={activeExpiry === e} onClick={() => setActiveExpiry(e)} />
                ))}
              </div>
            )}

            <div className="rounded-xl border border-border bg-card overflow-hidden">
              {/* Chain header */}
              <div className="bg-muted/20 border-b border-border px-4 py-3 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-sm">{underlying} Option Chain</h3>
                  {activeExpiry && (
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Expiry: {new Date(activeExpiry).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-sm bg-emerald-500/40 border border-emerald-500/60" />
                    ITM Call
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-sm bg-amber-500/40 border border-amber-500/60" />
                    ATM
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-sm bg-rose-500/40 border border-rose-500/60" />
                    ITM Put
                  </span>
                </div>
              </div>

              {loading ? (
                <div className="p-6 space-y-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-9 w-full" />
                  ))}
                </div>
              ) : chainRows.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                  <div className="h-14 w-14 rounded-full bg-muted/40 flex items-center justify-center mb-3">
                    <AlertCircle className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <p className="font-semibold text-sm">No active contracts</p>
                  <p className="text-xs text-muted-foreground mt-1">Admin needs to list contracts for {underlying}</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-emerald-500/5 border-b border-border/40">
                        <th colSpan={6} className="py-2 text-center text-[11px] font-bold text-emerald-400 tracking-wider uppercase">
                          ← CALLS
                        </th>
                        <th className="py-2 px-3 text-center text-[11px] font-bold border-x border-border/40">Strike</th>
                        <th colSpan={6} className="py-2 text-center text-[11px] font-bold text-rose-400 tracking-wider uppercase">
                          PUTS →
                        </th>
                      </tr>
                      <tr className="bg-muted/10 border-b border-border/40 text-[10px] text-muted-foreground uppercase tracking-wider">
                        <th className="px-2 py-2 text-right">IV</th>
                        <th className="px-2 py-2 text-right">Δ</th>
                        <th className="px-2 py-2 text-right hidden xl:table-cell">Θ</th>
                        <th className="px-2 py-2 text-right hidden xl:table-cell">Intrinsic</th>
                        <th className="px-2 py-2 text-right font-bold text-emerald-300/70">Mark</th>
                        <th className="px-2 py-2 text-center w-24">Action</th>
                        <th className="px-3 py-2 text-center border-x border-border/40 text-foreground/70">USDT Strike</th>
                        <th className="px-2 py-2 text-center w-24">Action</th>
                        <th className="px-2 py-2 text-left font-bold text-rose-300/70">Mark</th>
                        <th className="px-2 py-2 text-left hidden xl:table-cell">Intrinsic</th>
                        <th className="px-2 py-2 text-left hidden xl:table-cell">Θ</th>
                        <th className="px-2 py-2 text-left">Δ</th>
                        <th className="px-2 py-2 text-left">IV</th>
                      </tr>
                    </thead>
                    <tbody>
                      {chainRows.map((r) => (
                        <ChainRow key={r.strike} row={r} spot={spot} onTicket={openTicket} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Hover hint */}
              {chainRows.length > 0 && (
                <div className="px-4 py-2.5 border-t border-border/30 text-[11px] text-muted-foreground">
                  Hover over a row to reveal BUY / SELL buttons · Prices update every 5s
                </div>
              )}
            </div>
          </TabsContent>

          {/* ─── POSITIONS TAB ────────────────────────────────────── */}
          <TabsContent value="positions" className="space-y-4">
            {!user ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="h-14 w-14 rounded-full bg-muted/40 flex items-center justify-center mb-3">
                  <Shield className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="font-semibold">Login required</p>
                <p className="text-xs text-muted-foreground mt-1">Sign in to view your positions</p>
              </div>
            ) : positions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="h-14 w-14 rounded-full bg-muted/40 flex items-center justify-center mb-3">
                  <Layers className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="font-semibold">No open positions</p>
                <p className="text-xs text-muted-foreground mt-1 mb-4">Go to the Option Chain tab and click BUY or SELL</p>
                <Button size="sm" variant="outline" onClick={() => setTab("chain")}>
                  View Chain <ChevronRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              </div>
            ) : (
              <>
                {/* Portfolio summary bar */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="rounded-xl border border-border bg-card/60 p-3">
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Total Margin</div>
                    <div className="font-bold text-amber-400">{fmtUsd(portfolio.totalMargin)} USDT</div>
                  </div>
                  <div className="rounded-xl border border-border bg-card/60 p-3">
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Net Δ (Delta)</div>
                    <div className="font-bold">{portfolio.netDelta.toFixed(3)}</div>
                  </div>
                  <div className="rounded-xl border border-border bg-card/60 p-3">
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Net Θ /day</div>
                    <div className={cn("font-bold", portfolio.netTheta < 0 ? "text-rose-400" : "text-emerald-400")}>
                      {portfolio.netTheta.toFixed(2)}
                    </div>
                  </div>
                  <div className="rounded-xl border border-border bg-card/60 p-3">
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Net ν (Vega)</div>
                    <div className="font-bold text-blue-400">{portfolio.netVega.toFixed(3)}</div>
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-card overflow-hidden">
                  <div className="px-4 py-3 border-b border-border/50 bg-muted/10 flex items-center justify-between">
                    <h3 className="font-bold text-sm">Open Positions ({positions.length})</h3>
                    <span className="text-xs text-muted-foreground">Updates every 5s</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/10 border-b border-border/40 text-[10px] text-muted-foreground uppercase tracking-wider">
                        <tr>
                          <th className="px-4 py-2.5 text-left">Contract</th>
                          <th className="px-3 py-2.5 text-left">Side</th>
                          <th className="px-3 py-2.5 text-right">Qty</th>
                          <th className="px-3 py-2.5 text-right">Entry</th>
                          <th className="px-3 py-2.5 text-right">Mark</th>
                          <th className="px-3 py-2.5 text-right hidden lg:table-cell">Δ / Θ / ν</th>
                          <th className="px-3 py-2.5 text-right hidden md:table-cell">Margin</th>
                          <th className="px-3 py-2.5 text-right">PnL</th>
                          <th className="px-3 py-2.5 text-right">Expiry</th>
                          <th className="px-3 py-2.5"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/30">
                        {positions.map((p) => {
                          const { label: expLabel, urgent } = timeUntil(p.expiryAt);
                          const pnlPct = p.avgEntryPremium > 0
                            ? (p.unrealizedPnl / (p.avgEntryPremium * p.qty)) * 100 : 0;
                          return (
                            <tr key={p.id} className="hover:bg-muted/10 transition-colors">
                              <td className="px-4 py-3">
                                <div className="font-mono text-xs font-bold">{p.symbol}</div>
                                <div className="text-[10px] text-muted-foreground mt-0.5">
                                  {p.optionType === "call" ? "📈" : "📉"} {fmtUsd(p.strike, 0)} USDT {p.optionType.toUpperCase()}
                                </div>
                              </td>
                              <td className="px-3 py-3">
                                <span className={cn(
                                  "inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border",
                                  p.side === "long"
                                    ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                                    : "bg-rose-500/15 text-rose-400 border-rose-500/30",
                                )}>
                                  {p.side === "long" ? "LONG" : "SHORT"}
                                </span>
                              </td>
                              <td className="px-3 py-3 text-right tabular-nums font-medium">{p.qty}</td>
                              <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">{fmtUsd(p.avgEntryPremium)} USDT</td>
                              <td className="px-3 py-3 text-right tabular-nums font-semibold">{fmtUsd(p.mark)} USDT</td>
                              <td className="px-3 py-3 text-right tabular-nums text-xs text-muted-foreground hidden lg:table-cell">
                                <span className="text-sky-400">{p.delta.toFixed(2)}</span>
                                {" / "}
                                <span className={p.theta < 0 ? "text-rose-400" : "text-emerald-400"}>{p.theta.toFixed(2)}</span>
                                {" / "}
                                <span className="text-violet-400">{p.vega.toFixed(2)}</span>
                              </td>
                              <td className="px-3 py-3 text-right hidden md:table-cell">
                                <div className="text-xs tabular-nums text-amber-400">{fmtUsd(p.marginLocked, 0)} USDT</div>
                                <MarginBar margin={p.marginLocked} total={p.marginLocked + p.avgEntryPremium * p.qty * 3} />
                              </td>
                              <td className="px-3 py-3 text-right">
                                <div className={cn("text-sm font-bold tabular-nums", p.unrealizedPnl >= 0 ? "text-emerald-400" : "text-rose-400")}>
                                  {p.unrealizedPnl >= 0 ? "+" : ""}${fmtUsd(p.unrealizedPnl)}
                                </div>
                                <div className={cn("text-[10px] tabular-nums", p.unrealizedPnl >= 0 ? "text-emerald-400/70" : "text-rose-400/70")}>
                                  {pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(1)}%
                                </div>
                                <PnlBar pnl={p.unrealizedPnl} entry={p.avgEntryPremium} qty={p.qty} />
                              </td>
                              <td className="px-3 py-3 text-right text-xs">
                                <span className={cn("font-medium", urgent ? "text-rose-400" : "text-muted-foreground")}>
                                  {expLabel}
                                </span>
                              </td>
                              <td className="px-3 py-3">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={closePosition.isPending}
                                  onClick={() => closePosition.mutate(p.id)}
                                  className="h-7 text-xs border-rose-500/30 text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
                                >
                                  <X className="h-3 w-3 mr-1" /> Close
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </TabsContent>

          {/* ─── ANALYTICS TAB ────────────────────────────────────── */}
          <TabsContent value="analytics" className="space-y-4">
            {!user || positions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="h-14 w-14 rounded-full bg-muted/40 flex items-center justify-center mb-3">
                  <Activity className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="font-semibold">No position data</p>
                <p className="text-xs text-muted-foreground mt-1">Open positions to see portfolio analytics</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Greeks breakdown */}
                  <div className="rounded-xl border border-border bg-card/60 p-5">
                    <h3 className="font-bold text-sm mb-4 flex items-center gap-2">
                      <Sigma className="h-4 w-4 text-violet-400" />
                      Portfolio Greeks
                    </h3>
                    <div className="space-y-3">
                      {[
                        { label: "Net Delta (Δ)", value: portfolio.netDelta, color: "bg-sky-500", max: 5, unit: "" },
                        { label: "Net Theta (Θ) per day", value: portfolio.netTheta, color: "bg-rose-500", max: 50, unit: "/day" },
                        { label: "Net Vega (ν)", value: portfolio.netVega, color: "bg-violet-500", max: 1, unit: "" },
                      ].map((g) => (
                        <div key={g.label}>
                          <div className="flex items-center justify-between text-xs mb-1.5">
                            <span className="text-muted-foreground">{g.label}</span>
                            <span className="font-bold tabular-nums">
                              {g.value >= 0 ? "+" : ""}{g.value.toFixed(3)}{g.unit}
                            </span>
                          </div>
                          <div className="h-2 bg-muted/30 rounded-full overflow-hidden">
                            <div
                              className={`h-full ${g.color} rounded-full transition-all`}
                              style={{ width: `${Math.min(Math.abs(g.value) / g.max * 100, 100)}%`, opacity: 0.7 }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Per-position PnL breakdown */}
                  <div className="rounded-xl border border-border bg-card/60 p-5">
                    <h3 className="font-bold text-sm mb-4 flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-amber-400" />
                      PnL Breakdown
                    </h3>
                    <div className="space-y-2.5">
                      {positions.map((p) => {
                        const maxVal = Math.max(...positions.map((x) => Math.abs(x.unrealizedPnl)), 1);
                        const pct = (Math.abs(p.unrealizedPnl) / maxVal) * 100;
                        return (
                          <div key={p.id}>
                            <div className="flex items-center justify-between text-xs mb-1">
                              <span className="font-mono text-muted-foreground truncate max-w-[160px]">{p.symbol}</span>
                              <span className={cn("font-bold tabular-nums", p.unrealizedPnl >= 0 ? "text-emerald-400" : "text-rose-400")}>
                                {p.unrealizedPnl >= 0 ? "+" : ""}${fmtUsd(p.unrealizedPnl)}
                              </span>
                            </div>
                            <div className="h-1.5 bg-muted/30 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${p.unrealizedPnl >= 0 ? "bg-emerald-500" : "bg-rose-500"}`}
                                style={{ width: `${pct}%`, opacity: 0.8 }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Position greeks table */}
                <div className="rounded-xl border border-border bg-card/60 overflow-hidden">
                  <div className="px-4 py-3 border-b border-border/40 bg-muted/10">
                    <h3 className="font-bold text-sm">Position Greeks Detail</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/10 text-muted-foreground text-[10px] uppercase tracking-wider border-b border-border/40">
                        <tr>
                          <th className="px-4 py-2 text-left">Contract</th>
                          <th className="px-3 py-2 text-right">Qty</th>
                          <th className="px-3 py-2 text-right text-sky-400/80">Δ</th>
                          <th className="px-3 py-2 text-right text-amber-400/80">Γ</th>
                          <th className="px-3 py-2 text-right text-rose-400/80">Θ /day</th>
                          <th className="px-3 py-2 text-right text-violet-400/80">ν</th>
                          <th className="px-3 py-2 text-right">Net Δ</th>
                          <th className="px-3 py-2 text-right">Net Θ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/30">
                        {positions.map((p) => (
                          <tr key={p.id} className="hover:bg-muted/10">
                            <td className="px-4 py-2 font-mono">{p.symbol}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{p.qty}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-sky-400">{p.delta.toFixed(3)}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-amber-400">{p.gamma.toFixed(4)}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-rose-400">{p.theta.toFixed(3)}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-violet-400">{p.vega.toFixed(3)}</td>
                            <td className="px-3 py-2 text-right tabular-nums font-semibold">{(p.delta * p.qty).toFixed(3)}</td>
                            <td className="px-3 py-2 text-right tabular-nums font-semibold">{(p.theta * p.qty).toFixed(3)}</td>
                          </tr>
                        ))}
                        <tr className="border-t-2 border-border/60 bg-muted/10 font-bold">
                          <td colSpan={6} className="px-4 py-2 text-muted-foreground text-xs">Portfolio Total</td>
                          <td className="px-3 py-2 text-right tabular-nums">{portfolio.netDelta.toFixed(3)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{portfolio.netTheta.toFixed(3)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </TabsContent>

          {/* ─── HISTORY TAB ──────────────────────────────────────── */}
          <TabsContent value="history">
            {!user ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="h-14 w-14 rounded-full bg-muted/40 flex items-center justify-center mb-3">
                  <Clock className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="font-semibold">Login required</p>
              </div>
            ) : (historyQ.data?.orders ?? []).length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="h-14 w-14 rounded-full bg-muted/40 flex items-center justify-center mb-3">
                  <Clock className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="font-semibold">No order history</p>
                <p className="text-xs text-muted-foreground mt-1">Place your first option order to see history here</p>
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="px-4 py-3 border-b border-border/50 bg-muted/10">
                  <h3 className="font-bold text-sm">Order History</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/10 border-b border-border/40 text-[10px] text-muted-foreground uppercase tracking-wider">
                      <tr>
                        <th className="px-4 py-2.5 text-left">Time</th>
                        <th className="px-3 py-2.5 text-left">Contract</th>
                        <th className="px-3 py-2.5 text-left">Type</th>
                        <th className="px-3 py-2.5 text-left">Side</th>
                        <th className="px-3 py-2.5 text-right">Qty</th>
                        <th className="px-3 py-2.5 text-right">Mark at Fill</th>
                        <th className="px-3 py-2.5 text-right">Premium</th>
                        <th className="px-3 py-2.5 text-right">Fee</th>
                        <th className="px-3 py-2.5 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/30">
                      {(historyQ.data?.orders ?? []).map((o) => (
                        <tr key={o.id} className="hover:bg-muted/10 transition-colors">
                          <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap text-xs">
                            {new Date(o.createdAt).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}
                          </td>
                          <td className="px-3 py-2.5 font-mono text-xs font-medium">{o.contractSymbol}</td>
                          <td className="px-3 py-2.5">
                            <span className={cn("text-xs font-bold", o.optionType === "call" ? "text-emerald-400" : "text-rose-400")}>
                              {String(o.optionType || "").toUpperCase()}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            <span className={cn("text-xs font-semibold", o.side === "buy" ? "text-emerald-400" : "text-rose-400")}>
                              {o.side.toUpperCase()}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{Number(o.qty).toFixed(2)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{fmtUsd(Number(o.markPriceAtFill))} USDT</td>
                          <td className="px-3 py-2.5 text-right tabular-nums font-medium">{fmtUsd(Number(o.premium))} USDT</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground text-xs">{fmtUsd(Number(o.fee), 4)} USDT</td>
                          <td className="px-3 py-2.5 text-center">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                              {o.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* ─── Order Ticket Modal ─────────────────────────────────────── */}
      <Dialog open={!!ticket} onOpenChange={(o) => { if (!o) setTicket(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              {ticket?.side === "buy"
                ? <ArrowDownToLine className="h-4 w-4 text-emerald-400" />
                : <ArrowUpToLine className="h-4 w-4 text-rose-400" />}
              <span className={ticket?.side === "buy" ? "text-emerald-400" : "text-rose-400"}>
                {ticket?.side === "buy" ? "Buy" : "Sell"}
              </span>
              <span className="font-mono text-sm">{ticket?.contract.symbol}</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              {ticket?.side === "buy"
                ? "You pay premium upfront. Position auto-settles at expiry."
                : "You collect premium. Margin is locked as collateral until close or expiry."}
            </DialogDescription>
          </DialogHeader>

          {ticket && (
            <div className="space-y-4 mt-1">
              {/* Contract details */}
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg bg-muted/20 border border-border/40 p-2.5 text-center">
                  <div className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">Spot</div>
                  <div className="text-xs font-bold tabular-nums">{fmtUsd(ticket.contract.spot, 0)} USDT</div>
                </div>
                <div className="rounded-lg bg-muted/20 border border-border/40 p-2.5 text-center">
                  <div className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">Strike</div>
                  <div className="text-xs font-bold tabular-nums">{fmtUsd(ticket.contract.strike, 0)} USDT</div>
                </div>
                <div className="rounded-lg bg-muted/20 border border-border/40 p-2.5 text-center">
                  <div className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">Mark Price</div>
                  <div className="text-xs font-bold tabular-nums text-amber-400">{fmtUsd(ticket.contract.mark)} USDT</div>
                </div>
              </div>

              {/* Greeks */}
              <div className="grid grid-cols-4 gap-2">
                <GreekPill label="Δ Delta" value={fmtDelta(ticket.contract.delta)} color="border-sky-500/30 bg-sky-500/5 text-sky-300" />
                <GreekPill label="Γ Gamma" value={ticket.contract.gamma.toFixed(4)} color="border-amber-500/30 bg-amber-500/5 text-amber-300" />
                <GreekPill label="Θ Theta" value={ticket.contract.theta.toFixed(3)} color="border-rose-500/30 bg-rose-500/5 text-rose-300" />
                <GreekPill label="ν Vega" value={ticket.contract.vega.toFixed(3)} color="border-violet-500/30 bg-violet-500/5 text-violet-300" />
              </div>

              {/* IV + Expiry info */}
              <div className="flex items-center gap-3 text-xs text-muted-foreground bg-muted/20 rounded-lg px-3 py-2 border border-border/30">
                <span>IV: <span className="text-foreground font-semibold">{fmtPct(ticket.contract.iv)}</span></span>
                <span className="text-border">|</span>
                <span>Intrinsic: <span className="text-foreground font-semibold">{fmtUsd(ticket.contract.intrinsic)} USDT</span></span>
                <span className="text-border">|</span>
                <span>Time val: <span className="text-foreground font-semibold">{fmtUsd(ticket.contract.timeValue)} USDT</span></span>
                <span className="text-border">|</span>
                <Clock className="h-3 w-3" />
                <span className={timeUntil(ticket.contract.expiryAt).urgent ? "text-rose-400 font-semibold" : ""}>
                  {timeUntil(ticket.contract.expiryAt).label}
                </span>
              </div>

              {/* Payoff diagram */}
              <PayoffDiagram
                optionType={ticket.contract.optionType}
                strike={ticket.contract.strike}
                premium={ticket.contract.mark}
                qty={qtyNum}
                side={ticket.side}
                spot={ticket.contract.spot}
              />

              {/* Quantity */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <Label className="text-xs">Quantity</Label>
                  <span className="text-[10px] text-muted-foreground">Min: {ticket.contract.minQty} · Size: {ticket.contract.contractSize}</span>
                </div>
                <Input
                  type="number"
                  step="0.01"
                  min={ticket.contract.minQty}
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  className="h-9"
                />
                <div className="flex gap-1.5 mt-2">
                  {[0.1, 0.5, 1, 5].map((v) => (
                    <button
                      key={v}
                      onClick={() => setQty(String(Math.max(v, ticket.contract.minQty)))}
                      className="flex-1 text-[10px] py-1 rounded bg-muted/30 hover:bg-muted/60 border border-border/40 transition-colors"
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>

              {/* Cost breakdown */}
              <div className="rounded-lg bg-muted/10 border border-border/30 p-3 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Premium ({qtyNum} × {fmtUsd(ticket.contract.mark)} × {ticket.contract.contractSize})</span>
                  <span className="font-semibold tabular-nums">{fmtUsd(ticketPremium)} USDT</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Trading fee (0.1%)</span>
                  <span className="tabular-nums">{fmtUsd(ticketFee, 4)} USDT</span>
                </div>
                {ticket.side === "sell" && (
                  <div className="flex justify-between text-amber-400">
                    <span>Margin required</span>
                    <span className="tabular-nums font-semibold">{fmtUsd(ticketMargin)} USDT</span>
                  </div>
                )}
                <div className="border-t border-border/40 pt-2 flex justify-between font-bold">
                  <span>{ticket.side === "buy" ? "Total cost" : "Margin to lock"}</span>
                  <span className="tabular-nums text-amber-400">{fmtUsd(ticketTotal)} USDT</span>
                </div>
                {qtyNum > 0 && (
                  <div className="flex justify-between text-blue-400">
                    <span className="flex items-center gap-1"><Zap className="h-3 w-3" /> Breakeven at expiry</span>
                    <span className="tabular-nums font-semibold">{fmtUsd(beBreak, 0)} USDT</span>
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" onClick={() => setTicket(null)}>Cancel</Button>
            <Button
              disabled={placeOrder.isPending || !ticket || qtyNum < (ticket?.contract.minQty ?? 0)}
              onClick={() => ticket && placeOrder.mutate({ contractId: ticket.contract.id, side: ticket.side, qty: qtyNum })}
              className={cn(
                "flex-1",
                ticket?.side === "buy"
                  ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                  : "bg-rose-600 hover:bg-rose-500 text-white",
              )}
            >
              {placeOrder.isPending
                ? "Placing…"
                : `${ticket?.side === "buy" ? "Buy" : "Sell"} ${ticket?.contract.optionType === "call" ? "Call" : "Put"}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <SuccessModal open={successData !== null} payload={successData} onClose={() => setSuccessData(null)} />
    </div>
  );
}
