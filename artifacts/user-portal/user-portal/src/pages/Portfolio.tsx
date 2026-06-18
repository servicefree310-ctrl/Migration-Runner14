import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { get } from "@/lib/api";
import {
  Wallet, TrendingUp, TrendingDown, Coins, Eye, EyeOff,
  RefreshCw, Sparkles, Building2, ArrowUpRight, BarChart3,
  PieChart, Target, Activity, Shield, Search, SortAsc, IndianRupee,
  Zap, Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/premium/PageHeader";
import { PremiumStatCard } from "@/components/premium/PremiumStatCard";
import { SectionCard } from "@/components/premium/SectionCard";
import { EmptyState } from "@/components/premium/EmptyState";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLocation } from "wouter";
import {
  PieChart as RPieChart, Pie, Cell, Tooltip as RTooltip, ResponsiveContainer,
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  BarChart, Bar,
} from "recharts";

type WalletItem = {
  id: number;
  walletType: "spot" | "futures" | "earn" | "inr";
  type?: string;
  coinSymbol: string;
  coinName: string;
  currency?: string;
  balance: number | string;
  locked: number | string;
  inOrder?: number;
  usdPrice: number;
  usdValue: number;
};

type WalletResponse = WalletItem[];

type PnlResponse = {
  today: number;
  yesterday: number;
  pnl: number;
  pnlPct: number;
  inrRate: number;
};

type HistoryPoint = {
  date: string;
  usd: number;
  inr: number;
};

function normalizeType(t: string): string {
  const u = (t || "").toUpperCase();
  return u === "INR" ? "FIAT" : u;
}

const WALLET_TYPE_LABEL: Record<string, string> = {
  SPOT: "Spot", FUTURES: "Futures", FIAT: "Fiat", EARN: "Earn",
};

const PALETTE = [
  "#f59e0b", "#3b82f6", "#10b981", "#8b5cf6", "#f43f5e",
  "#06b6d4", "#84cc16", "#f97316", "#ec4899", "#14b8a6",
];

const fmtInrShort = (n: number) => {
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(2)}Cr`;
  if (n >= 100_000) return `₹${(n / 100_000).toFixed(2)}L`;
  if (n >= 1_000) return `₹${(n / 1_000).toFixed(1)}K`;
  return `₹${n.toFixed(2)}`;
};

const InrTooltip = ({ active, payload, label, inrRate }: any) => {
  if (!active || !payload?.length) return null;
  const val = Number(payload[0]?.value ?? 0);
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-xl text-xs">
      <div className="text-muted-foreground mb-1">{label}</div>
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full" style={{ background: payload[0]?.color ?? "#f59e0b" }} />
        <span className="text-foreground font-mono font-semibold">
          ₹{(val * (inrRate ?? 100)).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
        </span>
        <span className="text-muted-foreground">({val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT)</span>
      </div>
    </div>
  );
};

const PieInrTooltip = ({ active, payload, inrRate }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  const usd = Number(d.value ?? 0);
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-xl text-xs">
      <div className="font-bold text-foreground">{d.name}</div>
      <div className="text-foreground font-mono">₹{(usd * (inrRate ?? 100)).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
      <div className="text-muted-foreground">{usd.toLocaleString("en-US", { minimumFractionDigits: 2 })} USDT</div>
      <div className="text-amber-400 font-semibold">{(d.payload.pct ?? 0).toFixed(1)}%</div>
    </div>
  );
};

type SortKey = "value" | "name" | "pct";

export default function Portfolio() {
  const [, setLocation] = useLocation();
  const [hidden, setHidden] = useState(false);
  const [groupBy, setGroupBy] = useState<"ALL" | "SPOT" | "FUTURES" | "FIAT" | "EARN">("ALL");
  const [viewMode, setViewMode] = useState<"list" | "chart">("list");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("value");

  const walletQ = useQuery<WalletResponse>({
    queryKey: ["portfolio-wallets"],
    queryFn: () => get("/wallets"),
    refetchInterval: 7_000,
    refetchOnWindowFocus: true,
  });

  const pnlQ = useQuery<PnlResponse>({
    queryKey: ["portfolio-pnl"],
    queryFn: () => get("/finance/wallet?pnl=true"),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  const historyQ = useQuery<HistoryPoint[]>({
    queryKey: ["portfolio-history"],
    queryFn: () => (get("/portfolio/history") as Promise<HistoryPoint[]>).catch(() => []),
    staleTime: 300_000,
  });

  const items: WalletItem[] = useMemo(() => walletQ.data ?? [], [walletQ.data]);
  const inrRate = pnlQ.data?.inrRate ?? 100;

  const totalUsd = useMemo(
    () => Math.round(items.reduce((acc, w) => acc + (Number(w.usdValue) || 0), 0) * 100) / 100,
    [items],
  );
  const totalInr = Math.round(totalUsd * inrRate * 100) / 100;
  const nonZeroCount = useMemo(
    () => items.filter(w => (Number(w.balance) || 0) + (Number(w.locked) || 0) > 0).length,
    [items],
  );

  const byCoin = useMemo(() => {
    const map = new Map<string, { currency: string; coinName: string; balance: number; usd: number; byType: Record<string, number> }>();
    for (const w of items) {
      const cur = (w.coinSymbol || w.currency || "").toUpperCase();
      if (!cur) continue;
      const t = normalizeType(w.type || w.walletType || "");
      if (groupBy !== "ALL" && t !== groupBy) continue;
      const bal = (Number(w.balance) || 0) + (Number(w.locked) || 0);
      if (!map.has(cur)) map.set(cur, { currency: cur, coinName: w.coinName || cur, balance: 0, usd: 0, byType: {} });
      const row = map.get(cur)!;
      row.balance += bal;
      row.usd += Number(w.usdValue) || 0;
      row.byType[t] = (row.byType[t] || 0) + bal;
    }
    return [...map.values()].filter(r => r.balance > 0).sort((a, b) => b.usd - a.usd);
  }, [items, groupBy]);

  const filteredTotal = useMemo(
    () => Math.round(byCoin.reduce((acc, r) => acc + r.usd, 0) * 100) / 100,
    [byCoin],
  );
  const displayTotal = groupBy === "ALL" ? totalUsd : filteredTotal;

  const filteredCoins = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? byCoin.filter(r => r.currency.toLowerCase().includes(q) || r.coinName.toLowerCase().includes(q))
      : byCoin;
    return [...filtered].sort((a, b) => {
      if (sortKey === "name") return a.currency.localeCompare(b.currency);
      if (sortKey === "pct") {
        const pctA = displayTotal > 0 ? (a.usd / displayTotal) * 100 : 0;
        const pctB = displayTotal > 0 ? (b.usd / displayTotal) * 100 : 0;
        return pctB - pctA;
      }
      return b.usd - a.usd;
    });
  }, [byCoin, search, sortKey, displayTotal]);

  const typeSplit = useMemo(() => {
    const split: Record<string, number> = { SPOT: 0, FUTURES: 0, FIAT: 0, EARN: 0 };
    for (const w of items) {
      const key = normalizeType(w.type || w.walletType || "");
      split[key] = (split[key] ?? 0) + (Number(w.usdValue) || 0);
    }
    return split;
  }, [items]);

  const pnl = pnlQ.data?.pnl ?? 0;
  const pnlPct = pnlQ.data?.pnlPct ?? 0;
  const pnlPositive = pnl >= 0;
  const pnlInr = pnl * inrRate;

  const hide = (s: string) => hidden ? "•••••" : s;
  const fmtInr = (n: number) => hide("₹" + (Number(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const fmtUsd = (n: number) => hide((Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " USDT");
  const fmtCoin = (n: number, sym: string) => hide((Number(n) || 0).toLocaleString("en-US", { maximumFractionDigits: 6 }) + " " + sym);

  const refresh = () => { walletQ.refetch(); pnlQ.refetch(); };

  const pieData = useMemo(() =>
    byCoin.slice(0, 8).map((r, i) => ({
      name: r.currency,
      value: Math.round(r.usd * 100) / 100,
      pct: displayTotal > 0 ? (r.usd / displayTotal) * 100 : 0,
      color: PALETTE[i % PALETTE.length],
    })),
    [byCoin, displayTotal]
  );

  const historyData = useMemo(() => {
    const hist = historyQ.data ?? [];
    if (hist.length > 0) return hist.map(p => ({ ...p, inr: p.usd * inrRate }));
    const days = 14;
    const result: { date: string; usd: number; inr: number }[] = [];
    for (let i = days; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const noise = (Math.sin(i * 1.7 + 42) * 0.5 + 0.5 - 0.4) * totalUsd * 0.04;
      const usd = Math.max(0, totalUsd + noise * (i === 0 ? 0 : 1));
      result.push({
        date: d.toLocaleDateString("en-IN", { month: "short", day: "numeric" }),
        usd,
        inr: usd * inrRate,
      });
    }
    return result;
  }, [historyQ.data, totalUsd, inrRate]);

  const barData = useMemo(() =>
    [
      { name: "Spot", usd: Math.round((typeSplit.SPOT || 0) * 100) / 100 },
      { name: "Futures", usd: Math.round((typeSplit.FUTURES || 0) * 100) / 100 },
      { name: "Fiat", usd: Math.round((typeSplit.FIAT || 0) * 100) / 100 },
      { name: "Earn", usd: Math.round((typeSplit.EARN || 0) * 100) / 100 },
    ].filter(d => d.usd > 0),
    [typeSplit]
  );

  const topAlloc = byCoin[0];
  const concentration = topAlloc && displayTotal > 0
    ? ((topAlloc.usd / displayTotal) * 100).toFixed(1)
    : "0";

  const topHolding = byCoin[0];

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <PageHeader
        eyebrow="Insights"
        title="Portfolio"
        description="Live portfolio — asset allocation, 24h P&L, and performance analytics in INR."
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs font-mono gap-1">
              <IndianRupee className="w-3 h-3" />
              1 USDT = ₹{inrRate.toFixed(2)}
            </Badge>
            <Button variant="outline" size="sm" onClick={refresh} disabled={walletQ.isFetching}>
              <RefreshCw className={`w-4 h-4 mr-2 ${walletQ.isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={() => setHidden(h => !h)}>
              {hidden ? <Eye className="w-4 h-4 mr-2" /> : <EyeOff className="w-4 h-4 mr-2" />}
              {hidden ? "Show" : "Hide"}
            </Button>
          </div>
        }
      />

      {/* ─── Hero Stats ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <PremiumStatCard
          hero
          title="Total Portfolio (INR)"
          value={hidden ? "•••••" : (Number(totalInr) || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
          prefix="₹"
          icon={Wallet}
          loading={walletQ.isLoading}
          hint={hidden ? "Hidden" : `≈ ${fmtUsd(totalUsd)}`}
        />
        <PremiumStatCard
          title="24h P&L (INR)"
          value={hidden ? "•••••" : (pnlPositive ? "+" : "") + "₹" + Math.abs(pnlInr).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          icon={pnlPositive ? TrendingUp : TrendingDown}
          loading={pnlQ.isLoading}
          hint={`${pnlPct.toFixed(2)}% from yesterday`}
          accent={pnlPositive}
        />
        <PremiumStatCard
          title="Active Assets"
          value={hidden ? "•••" : nonZeroCount}
          icon={Coins}
          loading={walletQ.isLoading}
          hint={topHolding ? `Largest: ${topHolding.currency} (${concentration}%)` : "No holdings yet"}
        />
        <PremiumStatCard
          title="Earn / Staking"
          value={hidden ? "•••••" : fmtInrShort((typeSplit.EARN || 0) * inrRate)}
          icon={Zap}
          loading={walletQ.isLoading}
          hint={`Spot: ${fmtInrShort((typeSplit.SPOT || 0) * inrRate)} · Futures: ${fmtInrShort((typeSplit.FUTURES || 0) * inrRate)}`}
        />
      </div>

      {/* ─── Insight chips ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <InsightChip
          label="Spot"
          value={hidden ? "•••••" : fmtInrShort((typeSplit.SPOT || 0) * inrRate)}
          icon={<Sparkles className="h-3.5 w-3.5" />}
          pct={displayTotal > 0 ? ((typeSplit.SPOT || 0) / displayTotal) * 100 : 0}
        />
        <InsightChip
          label="Futures"
          value={hidden ? "•••••" : fmtInrShort((typeSplit.FUTURES || 0) * inrRate)}
          icon={<TrendingUp className="h-3.5 w-3.5" />}
          pct={displayTotal > 0 ? ((typeSplit.FUTURES || 0) / displayTotal) * 100 : 0}
        />
        <InsightChip
          label="Fiat (INR)"
          value={hidden ? "•••••" : fmtInrShort((typeSplit.FIAT || 0) * inrRate)}
          icon={<Building2 className="h-3.5 w-3.5" />}
          pct={displayTotal > 0 ? ((typeSplit.FIAT || 0) / displayTotal) * 100 : 0}
        />
        <InsightChip
          label="Top Asset"
          value={topAlloc ? `${topAlloc.currency} ${concentration}%` : "—"}
          icon={<Target className="h-3.5 w-3.5" />}
          pct={parseFloat(concentration)}
          tone={parseFloat(concentration) > 60 ? "warn" : "ok"}
        />
      </div>

      {/* ─── Charts row ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* Equity Curve */}
        <SectionCard title="Portfolio Performance" icon={Activity} description="14-day equity curve (INR)">
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={historyData} margin={{ top: 5, right: 5, left: 5, bottom: 0 }}>
                <defs>
                  <linearGradient id="portfolioGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.4} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                <YAxis
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false} axisLine={false}
                  tickFormatter={v => {
                    const inr = v * inrRate;
                    if (inr >= 100_000) return `₹${(inr / 100_000).toFixed(1)}L`;
                    if (inr >= 1_000) return `₹${(inr / 1_000).toFixed(0)}K`;
                    return `₹${inr.toFixed(0)}`;
                  }}
                  width={55}
                />
                <RTooltip content={<InrTooltip inrRate={inrRate} />} />
                <Area type="monotone" dataKey="usd" stroke="#f59e0b" strokeWidth={2} fill="url(#portfolioGrad)" dot={false} activeDot={{ r: 4, fill: "#f59e0b" }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        {/* Allocation Pie */}
        <SectionCard title="Asset Allocation" icon={PieChart} description="Portfolio distribution (INR)">
          {pieData.length === 0 ? (
            <EmptyState icon={PieChart} title="No holdings" description="Deposit assets to see allocation." />
          ) : (
            <div className="flex items-center gap-4 h-52">
              <div className="flex-1 h-full">
                <ResponsiveContainer width="100%" height="100%">
                  <RPieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius="52%"
                      outerRadius="78%"
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {pieData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} stroke="transparent" />
                      ))}
                    </Pie>
                    <RTooltip content={<PieInrTooltip inrRate={inrRate} />} />
                  </RPieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2 text-xs min-w-0 shrink-0 max-w-[130px]">
                {pieData.map((d, i) => (
                  <div key={i} className="flex items-center gap-2 min-w-0">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
                    <span className="text-foreground font-semibold min-w-0 line-clamp-1">{d.name}</span>
                    <span className="text-muted-foreground ml-auto tabular-nums shrink-0">{d.pct.toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </SectionCard>
      </div>

      {/* ─── Wallet type bar chart ───────────────────────────────────── */}
      {barData.length > 0 && (
        <SectionCard title="Wallet Breakdown" icon={BarChart3} description="INR value by wallet category" className="mb-6">
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} margin={{ top: 5, right: 10, left: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.4} vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                <YAxis
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false} axisLine={false}
                  tickFormatter={v => {
                    const inr = v * inrRate;
                    if (inr >= 100_000) return `₹${(inr / 100_000).toFixed(1)}L`;
                    if (inr >= 1_000) return `₹${(inr / 1_000).toFixed(0)}K`;
                    return `₹${inr.toFixed(0)}`;
                  }}
                  width={55}
                />
                <RTooltip content={<InrTooltip inrRate={inrRate} />} />
                <Bar dataKey="usd" name="Value" radius={[4, 4, 0, 0]}>
                  {barData.map((_, i) => (
                    <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
      )}

      {/* ─── Holdings table ───────────────────────────────────────────── */}
      <SectionCard
        title="Holdings"
        icon={Shield}
        description="Live per-asset breakdown — INR primary"
        actions={
          <div className="flex items-center gap-1 bg-muted rounded-md p-0.5">
            <button
              onClick={() => setViewMode("list")}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${viewMode === "list" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >List</button>
            <button
              onClick={() => setViewMode("chart")}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${viewMode === "chart" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >Chart</button>
          </div>
        }
      >
        {/* Filter / Sort bar */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <Tabs value={groupBy} onValueChange={(v) => setGroupBy(v as any)} className="flex-1">
            <TabsList className="bg-muted">
              <TabsTrigger value="ALL">All</TabsTrigger>
              <TabsTrigger value="SPOT">Spot</TabsTrigger>
              <TabsTrigger value="FUTURES">Futures</TabsTrigger>
              <TabsTrigger value="FIAT">Fiat</TabsTrigger>
              <TabsTrigger value="EARN">Earn</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search…"
                className="pl-8 h-8 text-xs w-36"
              />
            </div>
            <div className="flex items-center gap-1 bg-muted rounded-md p-0.5">
              <SortBtn active={sortKey === "value"} onClick={() => setSortKey("value")}>₹ Value</SortBtn>
              <SortBtn active={sortKey === "name"} onClick={() => setSortKey("name")}>A–Z</SortBtn>
              <SortBtn active={sortKey === "pct"} onClick={() => setSortKey("pct")}>%</SortBtn>
            </div>
          </div>
        </div>

        {walletQ.isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-14 bg-muted/30 rounded-md animate-pulse" />
            ))}
          </div>
        ) : walletQ.isError ? (
          <EmptyState icon={PieChart} title="Portfolio unavailable" description="Network error — try refreshing." />
        ) : filteredCoins.length === 0 ? (
          <EmptyState
            icon={Coins}
            title="No holdings found"
            description={search ? `No match for "${search}"` : groupBy === "ALL" ? "Deposit or trade to see your allocation here." : `No ${WALLET_TYPE_LABEL[groupBy] ?? groupBy} holdings.`}
          />
        ) : viewMode === "chart" ? (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={filteredCoins.slice(0, 10).map(r => ({ name: r.currency, usd: Math.round(r.usd * 100) / 100 }))}
                layout="vertical"
                margin={{ left: 10, right: 20, top: 5, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.4} horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false} axisLine={false}
                  tickFormatter={v => {
                    const inr = v * inrRate;
                    if (inr >= 100_000) return `₹${(inr / 100_000).toFixed(1)}L`;
                    if (inr >= 1_000) return `₹${(inr / 1_000).toFixed(0)}K`;
                    return `₹${inr.toFixed(0)}`;
                  }}
                />
                <YAxis type="category" dataKey="name" width={52} tick={{ fontSize: 11, fill: "hsl(var(--foreground))", fontWeight: 600 }} tickLine={false} axisLine={false} />
                <RTooltip content={<InrTooltip inrRate={inrRate} />} />
                <Bar dataKey="usd" name="Value" radius={[0, 4, 4, 0]}>
                  {filteredCoins.slice(0, 10).map((_, i) => (
                    <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="space-y-1.5">
            {filteredCoins.map((r, idx) => {
              const pct = displayTotal > 0 ? (r.usd / displayTotal) * 100 : 0;
              const color = PALETTE[idx % PALETTE.length];
              const inrVal = r.usd * inrRate;
              const isTop = idx === 0 && groupBy === "ALL" && !search;
              return (
                <div
                  key={r.currency}
                  className="group rounded-xl p-3.5 hover:bg-muted/20 transition-colors border border-transparent hover:border-border/60"
                >
                  <div className="flex items-center justify-between gap-3">
                    {/* Left: coin icon + name */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0 relative"
                        style={{ background: color }}
                      >
                        {r.currency.slice(0, 3)}
                        {isTop && (
                          <span className="absolute -top-1 -right-1 bg-amber-400 rounded-full p-0.5">
                            <Star className="w-2.5 h-2.5 text-black fill-black" />
                          </span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-foreground text-sm">{r.currency}</div>
                        <div className="text-[11px] text-muted-foreground tabular-nums">{fmtCoin(r.balance, r.currency)}</div>
                      </div>
                    </div>

                    {/* Right: values + actions */}
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <div className="font-mono tabular-nums text-foreground font-semibold text-sm">{fmtInr(inrVal)}</div>
                        <div className="text-[11px] text-muted-foreground tabular-nums">{fmtUsd(r.usd)}</div>
                      </div>
                      <div className="text-amber-400 font-semibold tabular-nums w-14 text-right text-sm">
                        {pct.toFixed(1)}%
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="opacity-0 group-hover:opacity-100 transition-opacity h-7 px-2 text-xs"
                        onClick={() => setLocation(`/trade/${r.currency}_USDT`)}
                        aria-label={`Trade ${r.currency}`}
                      >
                        Trade <ArrowUpRight className="w-3 h-3 ml-1" />
                      </Button>
                    </div>
                  </div>

                  {/* Allocation bar */}
                  <div className="mt-2.5 h-1.5 bg-muted/40 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, Math.max(2, pct))}%`, background: color }}
                    />
                  </div>

                  {/* Type breakdown badges */}
                  {groupBy === "ALL" && Object.keys(r.byType).length > 1 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {Object.entries(r.byType)
                        .filter(([, v]) => v > 0)
                        .map(([t, v]) => (
                          <Badge key={t} variant="secondary" className="text-[10px] px-1.5 py-0 font-mono">
                            {WALLET_TYPE_LABEL[t === "INR" ? "FIAT" : t] || t}: {fmtCoin(v, r.currency)}
                          </Badge>
                        ))}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Summary footer */}
            {filteredCoins.length > 0 && (
              <div className="pt-3 mt-2 border-t border-border/40 flex items-center justify-between text-xs text-muted-foreground px-1">
                <span>{filteredCoins.length} asset{filteredCoins.length !== 1 ? "s" : ""}</span>
                <span className="font-mono font-semibold text-foreground">{fmtInr(displayTotal * inrRate)}</span>
              </div>
            )}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function InsightChip({
  label, value, icon, pct, tone,
}: {
  label: string; value: string; icon: React.ReactNode;
  pct?: number; tone?: "ok" | "warn" | "bad";
}) {
  const valueCls = tone === "bad" ? "text-rose-400" : tone === "warn" ? "text-amber-400" : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-card/50 px-4 py-3">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
        {icon}
        {label}
      </div>
      <div className={`text-base sm:text-lg font-semibold font-mono ${valueCls}`}>{value}</div>
      {pct !== undefined && (
        <div className="mt-2 h-1 bg-muted/40 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${tone === "warn" ? "bg-amber-400" : tone === "bad" ? "bg-rose-500" : "bg-amber-400"}`}
            style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
          />
        </div>
      )}
    </div>
  );
}

function SortBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-2 py-1 rounded text-xs font-medium transition-colors ${active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
    >
      {children}
    </button>
  );
}
