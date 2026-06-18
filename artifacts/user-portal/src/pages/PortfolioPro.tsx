import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { get } from "@/lib/api";
import { createChart, AreaSeries, type IChartApi, type ISeriesApi, type Time } from "lightweight-charts";
import {
  TrendingUp, TrendingDown, PieChart, Calculator, Download,
  Sparkles, Wallet, Activity, Target, IndianRupee, BarChart3, Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PageHeader } from "@/components/premium/PageHeader";
import { PremiumStatCard } from "@/components/premium/PremiumStatCard";
import { SectionCard } from "@/components/premium/SectionCard";
import { EmptyState } from "@/components/premium/EmptyState";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type Allocation = {
  symbol: string; name: string; icon: string | null;
  valueUsd: number; valueInr: number; pct: number; change24hPct: number; balance: number;
};
type Summary = {
  totalEquityUsd: number; totalEquityInr: number;
  pnl24hUsd: number;  pnl24hInr: number; pnl24hPct: number;
  activeAssets: number; inrRate: number;
  allocation: Allocation[];
};
type HistoryPoint = { date: string; equityUsd: number; equityInr: number };
type TaxTradeRow = {
  id: number; date: string; pair: string; side: string;
  notionalInr: number; notionalUsd: number;
  feeInr: number; feeUsd: number;
  tdsInr: number; tdsUsd: number;
};
type TaxReport = {
  fyStart: string; inrRate: number;
  totals: {
    totalSellVolumeUsd: number; totalSellVolumeInr: number;
    totalBuyVolumeUsd:  number; totalBuyVolumeInr:  number;
    totalFeesUsd: number; totalFeesInr: number;
    totalTdsUsd:  number; totalTdsInr:  number;
    buyCount: number; sellCount: number; tradeCount: number;
  };
  trades: TaxTradeRow[];
  note: string;
};

const PIE_COLORS = ["#f59e0b","#22c55e","#3b82f6","#ec4899","#a855f7","#14b8a6","#f97316","#06b6d4","#84cc16","#facc15"];

function fmtInr(n: number, decimals = 2): string {
  const sign = n < 0 ? "-" : "";
  return `${sign}₹${Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}
function fmtInrShort(n: number): string {
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(2)}Cr`;
  if (n >= 100_000)    return `₹${(n / 100_000).toFixed(2)}L`;
  if (n >= 1_000)      return `₹${(n / 1_000).toFixed(2)}K`;
  return fmtInr(n);
}

export default function PortfolioPro() {
  const [days, setDays] = useState("30");

  const { data: summary } = useQuery({
    queryKey: ["/portfolio/analytics/summary"],
    queryFn: () => get<Summary>("/portfolio/analytics/summary"),
    refetchInterval: 30_000,
  });
  const { data: history } = useQuery({
    queryKey: ["/portfolio/analytics/history", days],
    queryFn: () => get<{ days: number; inrRate: number; points: HistoryPoint[] }>(`/portfolio/analytics/history?days=${days}`),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const allocation  = summary?.allocation ?? [];
  const pnlPositive = (summary?.pnl24hInr ?? 0) >= 0;

  return (
    <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-5">
      <PageHeader
        eyebrow="Pro Analytics"
        title="Portfolio PRO"
        description="Equity curve, allocation breakdown, and Indian crypto tax report — all in one place."
        actions={
          summary?.inrRate ? (
            <Badge variant="outline" className="text-xs font-mono text-muted-foreground">
              <IndianRupee className="h-3 w-3 mr-1" />
              1 USDT = ₹{summary.inrRate.toFixed(2)}
            </Badge>
          ) : undefined
        }
      />

      {/* Stat cards — all in ₹ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <PremiumStatCard
          title="Total equity"
          value={summary ? fmtInrShort(summary.totalEquityInr) : "—"}
          icon={Wallet}
          hint={summary ? `≈ ${summary.totalEquityUsd.toLocaleString("en-US", { maximumFractionDigits: 0 })} USDT` : undefined}
          accent
        />
        <PremiumStatCard
          title="24h P&L"
          value={summary ? `${pnlPositive ? "+" : ""}${fmtInrShort(summary.pnl24hInr)}` : "—"}
          icon={pnlPositive ? TrendingUp : TrendingDown}
          hint={summary ? `${summary.pnl24hPct >= 0 ? "+" : ""}${summary.pnl24hPct.toFixed(2)}%` : undefined}
          accent={pnlPositive}
        />
        <PremiumStatCard
          title="24h change"
          value={summary ? `${summary.pnl24hPct >= 0 ? "+" : ""}${summary.pnl24hPct.toFixed(2)}%` : "—"}
          icon={Activity}
          accent={pnlPositive}
        />
        <PremiumStatCard
          title="Active assets"
          value={String(summary?.activeAssets ?? 0)}
          icon={PieChart}
          hint="Wallets with balance"
        />
      </div>

      <Tabs defaultValue="curve">
        <TabsList className="grid w-full sm:w-auto grid-cols-3">
          <TabsTrigger value="curve"><Activity className="h-3.5 w-3.5 mr-1.5" /> Equity curve</TabsTrigger>
          <TabsTrigger value="alloc"><PieChart className="h-3.5 w-3.5 mr-1.5" /> Allocation</TabsTrigger>
          <TabsTrigger value="tax"><Calculator className="h-3.5 w-3.5 mr-1.5" /> Tax report</TabsTrigger>
        </TabsList>

        {/* ── Equity Curve ── */}
        <TabsContent value="curve" className="mt-4">
          <SectionCard
            title="Equity history (₹)"
            description="Synthetic curve based on current holdings and 24h change. Daily snapshots coming soon."
            actions={
              <Select value={days} onValueChange={setDays}>
                <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Last 7 days</SelectItem>
                  <SelectItem value="30">Last 30 days</SelectItem>
                  <SelectItem value="90">Last 90 days</SelectItem>
                  <SelectItem value="180">Last 180 days</SelectItem>
                  <SelectItem value="365">Last 365 days</SelectItem>
                </SelectContent>
              </Select>
            }
          >
            <EquityChart points={history?.points ?? []} />
          </SectionCard>
        </TabsContent>

        {/* ── Allocation ── */}
        <TabsContent value="alloc" className="mt-4">
          <div className="grid lg:grid-cols-3 gap-4">
            <SectionCard title="Distribution">
              {allocation.length === 0 ? (
                <EmptyState icon={PieChart} title="No allocation" description="Deposit some funds to see this." />
              ) : (
                <Donut allocation={allocation} />
              )}
            </SectionCard>
            <SectionCard className="lg:col-span-2" title="Holdings">
              {allocation.length === 0 ? (
                <EmptyState icon={Wallet} title="No holdings" description="Empty for now." />
              ) : (
                <div className="space-y-1.5">
                  {allocation.map((a, i) => (
                    <div key={`${a.symbol}-${i}`} className="rounded-lg border border-border/50 bg-card/40 p-3">
                      <div className="flex items-center gap-3">
                        <div
                          className="h-8 w-8 rounded-full flex-shrink-0 flex items-center justify-center font-bold text-[11px]"
                          style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] + "20", color: PIE_COLORS[i % PIE_COLORS.length] }}
                        >
                          {a.symbol[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-sm">
                              {a.symbol} <span className="text-muted-foreground font-normal text-xs">{a.name}</span>
                            </span>
                            <div className="text-right">
                              <div className="font-mono font-bold text-sm">
                                {fmtInr(a.valueInr, 0)}
                              </div>
                              <div className="font-mono text-[10px] text-muted-foreground">
                                ≈ {a.valueUsd.toLocaleString("en-US", { maximumFractionDigits: 2 })} USDT
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center justify-between gap-2 mt-1.5">
                            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                              <div
                                className="h-full rounded-full"
                                style={{ width: `${a.pct}%`, backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                              />
                            </div>
                            <span className="font-mono text-[11px] text-muted-foreground w-12 text-right">
                              {a.pct.toFixed(1)}%
                            </span>
                            <span className={`font-mono text-[11px] w-16 text-right ${a.change24hPct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                              {a.change24hPct >= 0 ? "+" : ""}{a.change24hPct.toFixed(2)}%
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>
        </TabsContent>

        {/* ── Tax Report ── */}
        <TabsContent value="tax" className="mt-4">
          <TaxReportPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ─── Equity Chart ─── */
function EquityChart({ points }: { points: HistoryPoint[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef  = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart = createChart(ref.current, {
      layout: { background: { color: "transparent" }, textColor: "#9ca3af", fontSize: 11 },
      grid: { vertLines: { color: "rgba(148,163,184,0.06)" }, horzLines: { color: "rgba(148,163,184,0.06)" } },
      rightPriceScale: { borderColor: "rgba(148,163,184,0.15)" },
      timeScale: { borderColor: "rgba(148,163,184,0.15)", timeVisible: true },
      autoSize: true,
    });
    chartRef.current = chart;
    seriesRef.current = chart.addSeries(AreaSeries, {
      lineColor: "#f59e0b",
      topColor: "rgba(245,158,11,0.4)",
      bottomColor: "rgba(245,158,11,0)",
      lineWidth: 2,
      priceFormat: { type: "custom", formatter: (v: number) => fmtInrShort(v) },
    });
    return () => { try { chart.remove(); } catch {} chartRef.current = null; seriesRef.current = null; };
  }, []);

  useEffect(() => {
    if (!seriesRef.current || points.length === 0) return;
    seriesRef.current.setData(points.map((p) => ({
      time: p.date as Time,
      value: p.equityInr,
    })));
    chartRef.current?.timeScale().fitContent();
  }, [points]);

  return (
    <div className="relative h-72 w-full">
      <div ref={ref} className={`h-72 w-full ${points.length === 0 ? "opacity-0 pointer-events-none" : ""}`} />
      {points.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <EmptyState icon={Activity} title="No equity history yet" description="Make your first trade to start building your equity curve." />
        </div>
      )}
    </div>
  );
}

/* ─── Donut Chart ─── */
function Donut({ allocation }: { allocation: Allocation[] }) {
  const top = allocation.slice(0, 8);
  const otherPct = allocation.slice(8).reduce((s, a) => s + a.pct, 0);
  const segments = otherPct > 0
    ? [...top, { symbol: "Other", name: "Other", icon: null, valueUsd: 0, valueInr: 0, pct: otherPct, change24hPct: 0, balance: 0 }]
    : top;

  let acc = 0;
  const radius = 80, stroke = 24;
  const c = 2 * Math.PI * radius;

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 200 200" className="h-44 w-44">
        <circle cx="100" cy="100" r={radius} fill="none" stroke="rgba(148,163,184,0.1)" strokeWidth={stroke} />
        {segments.map((s, i) => {
          const dash = (s.pct / 100) * c;
          const offset = (acc / 100) * c;
          acc += s.pct;
          return (
            <circle key={`${s.symbol}-${i}`} cx="100" cy="100" r={radius}
              fill="none"
              stroke={PIE_COLORS[i % PIE_COLORS.length]}
              strokeWidth={stroke}
              strokeDasharray={`${dash} ${c - dash}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 100 100)"
            />
          );
        })}
        <text x="100" y="95"  textAnchor="middle" className="fill-foreground font-mono font-bold text-base">{segments.length}</text>
        <text x="100" y="110" textAnchor="middle" className="fill-muted-foreground text-[9px]">assets</text>
      </svg>
      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] w-full">
        {segments.map((s, i) => (
          <div key={`${s.symbol}-${i}`} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm flex-shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
            <span className="text-muted-foreground flex-1 min-w-0 line-clamp-1">{s.symbol}</span>
            <span className="font-mono font-bold">{s.pct.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Tax Report Panel ─── */
// FY helper — returns April 1 of the given FY year
function fyDate(year: number) { return `${year}-04-01`; }
function currentFyYear() {
  const now = new Date();
  return now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
}

function TaxReportPanel() {
  const [fyYear, setFyYear] = useState(currentFyYear);

  const { data, isError, isLoading } = useQuery({
    queryKey: ["/portfolio/analytics/tax-report", fyYear],
    queryFn: () => get<TaxReport>(`/portfolio/analytics/tax-report?from=${fyDate(fyYear)}`),
  });

  const exportCsv = () => {
    if (!data) return;
    const rate = data.inrRate ?? 84;
    const header = ["Date","Pair","Side","Trade Amount (₹)","Trade Amount (USDT)","Fee (₹)","Fee (USDT)","TDS 1% (₹)","TDS 1% (USDT)"];
    const tradeLines = data.trades.map((t) => [
      new Date(t.date).toLocaleDateString("en-IN"),
      t.pair,
      t.side.toUpperCase(),
      t.notionalInr.toFixed(2),
      t.notionalUsd.toFixed(4),
      t.feeInr.toFixed(2),
      t.feeUsd.toFixed(4),
      t.side === "sell" ? t.tdsInr.toFixed(2) : "0.00",
      t.side === "sell" ? t.tdsUsd.toFixed(4) : "0.0000",
    ]);
    const summaryLines: string[][] = [
      [],
      ["=== SUMMARY ==="],
      [`FY ${fyYear}-${fyYear + 1}`],
      ["Sell Volume (₹)", data.totals.totalSellVolumeInr.toFixed(2), "USDT", data.totals.totalSellVolumeUsd.toFixed(4)],
      ["Buy Volume (₹)",  data.totals.totalBuyVolumeInr.toFixed(2),  "USDT", data.totals.totalBuyVolumeUsd.toFixed(4)],
      ["Total Fees (₹)",  data.totals.totalFeesInr.toFixed(2),        "USDT", data.totals.totalFeesUsd.toFixed(4)],
      ["Total TDS (₹)",   data.totals.totalTdsInr.toFixed(2),         "USDT", data.totals.totalTdsUsd.toFixed(4)],
      [`USDT/INR Rate: ₹${rate.toFixed(2)}`],
      ["TDS = 1% of every sell trade amount (Sec 194S PMLA)"],
    ];
    const rows = [header, ...tradeLines, ...summaryLines];
    const csv = rows.map((r) => r.map((c) => `"${String(c)}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `zebvix-tds-fy${fyYear}-${fyYear + 1}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("TDS report exported");
  };

  // FY options — current FY and 4 previous years
  const cur = currentFyYear();
  const fyOptions = Array.from({ length: 5 }, (_, i) => cur - i);

  const rate = data?.inrRate ?? 84;

  return (
    <div className="space-y-4">
      <SectionCard
        title="TDS Report"
        description="Tax Deducted at Source — 1% on every sell (Sec 194S PMLA)"
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            {/* FY Selector */}
            <select
              value={fyYear}
              onChange={(e) => setFyYear(Number(e.target.value))}
              className="text-[11px] font-mono h-7 px-2 rounded border border-border bg-background text-foreground cursor-pointer"
            >
              {fyOptions.map((y) => (
                <option key={y} value={y}>FY {y}-{y + 1}</option>
              ))}
            </select>
            <Badge variant="outline" className="text-[10px] font-mono text-muted-foreground hidden sm:flex">
              1 USDT = ₹{rate.toFixed(2)}
            </Badge>
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={!data}>
              <Download className="h-3.5 w-3.5 mr-1.5" /> Export CSV
            </Button>
          </div>
        }
      >
        {isLoading && (
          <div className="py-12 text-center text-muted-foreground text-sm">Loading…</div>
        )}
        {isError && (
          <div className="py-12 text-center text-rose-400 text-sm">
            Failed to load TDS report. Please try again.
          </div>
        )}

        {data && (
          <>
            {/* Summary cards */}
            <div className="grid sm:grid-cols-3 gap-3 text-sm">
              {/* Card 1 — TDS Deducted (primary) */}
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                <div className="text-[10px] uppercase tracking-wider text-amber-400">Total TDS Deducted</div>
                <div className="font-mono font-bold text-xl text-amber-400 mt-1">
                  {fmtInr(data.totals.totalTdsInr)}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  ≈ {data.totals.totalTdsUsd.toFixed(2)} USDT
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  1% × ₹{fmtInrShort(data.totals.totalSellVolumeInr)} sell volume = TDS
                </div>
              </div>

              {/* Card 2 — Sell volume (TDS base) */}
              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Sell Volume (TDS Base)</div>
                <div className="font-mono font-bold text-xl mt-1">
                  {fmtInr(data.totals.totalSellVolumeInr, 0)}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  ≈ {data.totals.totalSellVolumeUsd.toFixed(2)} USDT · {data.totals.sellCount} sells
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  Buy volume: {fmtInr(data.totals.totalBuyVolumeInr, 0)} · {data.totals.buyCount} buys
                </div>
              </div>

              {/* Card 3 — Fees */}
              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Total Trading Fees</div>
                <div className="font-mono font-bold text-xl mt-1">
                  {fmtInr(data.totals.totalFeesInr)}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  ≈ {data.totals.totalFeesUsd.toFixed(2)} USDT
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {data.totals.tradeCount} total trades (buys + sells)
                </div>
              </div>
            </div>

            {/* Per-trade TDS table */}
            <div className="mt-4">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2 font-semibold">
                Per-Trade Breakdown — FY {fyYear}–{fyYear + 1}
                {data.trades.length >= 200 && (
                  <span className="ml-2 normal-case font-normal text-amber-400/70">
                    (latest 200 shown — export CSV for full history)
                  </span>
                )}
              </div>

              {data.trades.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  No trades found in FY {fyYear}–{fyYear + 1}
                </div>
              ) : (
                <div className="rounded-lg border border-border overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-muted/40 border-b border-border">
                          <th className="text-left px-3 py-2 text-muted-foreground font-medium">Date</th>
                          <th className="text-left px-3 py-2 text-muted-foreground font-medium">Pair</th>
                          <th className="text-left px-3 py-2 text-muted-foreground font-medium">Side</th>
                          <th className="text-right px-3 py-2 text-muted-foreground font-medium">Trade Amount (₹)</th>
                          <th className="text-right px-3 py-2 text-muted-foreground font-medium">Fee (₹)</th>
                          <th className="text-right px-3 py-2 text-amber-400/80 font-medium">TDS 1% (₹)</th>
                          <th className="text-right px-3 py-2 text-amber-400/60 font-medium hidden sm:table-cell">TDS (USDT)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.trades.map((t, i) => (
                          <tr key={t.id} className={`border-b border-border/40 ${i % 2 === 0 ? "" : "bg-muted/10"}`}>
                            <td className="px-3 py-1.5 font-mono text-muted-foreground whitespace-nowrap">
                              {new Date(t.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" })}
                            </td>
                            <td className="px-3 py-1.5 font-mono font-semibold">{t.pair}</td>
                            <td className="px-3 py-1.5">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${t.side === "sell" ? "bg-rose-500/15 text-rose-400" : "bg-emerald-500/15 text-emerald-400"}`}>
                                {t.side}
                              </span>
                            </td>
                            <td className="px-3 py-1.5 text-right font-mono">{fmtInr(t.notionalInr, 0)}</td>
                            <td className="px-3 py-1.5 text-right font-mono text-muted-foreground">{fmtInr(t.feeInr, 2)}</td>
                            <td className="px-3 py-1.5 text-right font-mono text-amber-400 font-semibold">
                              {t.side === "sell"
                                ? fmtInr(t.tdsInr, 2)
                                : <span className="text-muted-foreground">—</span>}
                            </td>
                            <td className="px-3 py-1.5 text-right font-mono text-amber-400/70 hidden sm:table-cell">
                              {t.side === "sell"
                                ? t.tdsUsd.toFixed(4)
                                : <span className="text-muted-foreground">—</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-muted/30 border-t-2 border-border font-bold text-xs">
                          <td colSpan={3} className="px-3 py-2 text-[11px] uppercase tracking-wider text-muted-foreground">
                            Sell totals
                          </td>
                          <td className="px-3 py-2 text-right font-mono">
                            {fmtInr(data.totals.totalSellVolumeInr, 0)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-muted-foreground">
                            {fmtInr(data.totals.totalFeesInr, 2)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-amber-400">
                            {fmtInr(data.totals.totalTdsInr, 2)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-amber-400 hidden sm:table-cell">
                            {data.totals.totalTdsUsd.toFixed(4)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <p className="mt-3 text-[11px] text-muted-foreground italic">{data.note}</p>
          </>
        )}
      </SectionCard>
    </div>
  );
}

function Stat({ label, value, sub, good }: { label: string; value: string; sub?: string; good?: boolean }) {
  return (
    <div className="rounded border border-border/50 bg-muted/20 p-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`font-bold mt-0.5 ${good === undefined ? "text-foreground" : good ? "text-emerald-400" : "text-rose-400"}`}>
        {value}
      </div>
      {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}
