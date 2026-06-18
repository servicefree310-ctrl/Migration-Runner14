import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { get } from "@/lib/api";
import {
  TrendingUp, TrendingDown, Wallet, Bell, Activity, Zap,
  Star, ArrowUpRight, BarChart3, ClipboardList, PieChart,
} from "lucide-react";
import { encodeSymbol } from "@/lib/marketSocket";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/premium/PageHeader";
import { SectionCard } from "@/components/premium/SectionCard";
import { PremiumStatCard } from "@/components/premium/PremiumStatCard";

type Coin = {
  symbol: string;      // base asset, e.g. "BTC"
  pairSymbol: string;  // full pair, e.g. "BTC/USDT" or "BTC/INR"
  quoteCcy: string;    // quote currency, e.g. "USDT" or "INR"
  name: string;
  icon: string | null;
  currentPrice: number;
  change24h: number;
  volume24h: number;
  isTrending: boolean;
  isHot: boolean;
};

/** Minimum quote-volume to be considered liquid — per quote currency */
const MIN_LIQUID_VOL: Record<string, number> = {
  USDT: 5_000,
  INR:  400_000,  // ≈ 5 000 USD at ~80 INR/USD
};

export default function ProDashboard() {
  const [, navigate] = useLocation();

  /* ── portfolio summary ──────────────────────────────────── */
  const { data: summary } = useQuery({
    queryKey: ["/portfolio/analytics/summary"],
    queryFn: () => get<any>("/portfolio/analytics/summary"),
    retry: false,
  });

  /* ── unread notifications ───────────────────────────────── */
  const { data: unread } = useQuery({
    queryKey: ["/notifications/me/unread-count"],
    queryFn: () => get<{ count: number }>("/notifications/me/unread-count"),
    retry: false,
  });

  /* ── price alerts ───────────────────────────────────────── */
  const { data: alerts } = useQuery({
    queryKey: ["/alerts/me"],
    queryFn: () => get<{ items: any[] }>("/alerts/me"),
    retry: false,
  });

  /* ── running bots ───────────────────────────────────────── */
  const { data: bots } = useQuery({
    queryKey: ["/bots"],
    queryFn: () => get<{ items: any[] }>("/bots"),
    retry: false,
  });

  /* ── open orders ────────────────────────────────────────── */
  const { data: openOrdersResp } = useQuery({
    queryKey: ["/orders?status=open"],
    queryFn: () => get<any>("/orders?status=open&limit=200"),
    retry: false,
  });

  /* ── exchange markets (30 s stale) ──────────────────────── */
  const { data: marketsRaw } = useQuery<any[]>({
    queryKey: ["/exchange/market"],
    queryFn: () => get<any[]>("/exchange/market"),
    staleTime: 30_000,
    retry: 1,
  });

  /* ── coin names + icons from finance/currency ───────────── */
  const { data: currencyList } = useQuery({
    queryKey: ["/finance/currency"],
    queryFn: () => get<any[]>("/finance/currency"),
    staleTime: 300_000,
    retry: false,
  });

  /* ── recent notifications ───────────────────────────────── */
  const { data: notifsResp } = useQuery({
    queryKey: ["/notifications/me?limit=5"],
    queryFn: () => get<{ items: any[] }>("/notifications/me?limit=5"),
    retry: false,
  });

  /* ── derived: coin name + icon lookup map ───────────────── */
  const coinMeta = useMemo(() => {
    const map = new Map<string, { name: string; icon: string | null }>();
    const list = Array.isArray(currencyList) ? currencyList : [];
    for (const c of list) {
      // /finance/currency returns { currency: "BTC", name: "Bitcoin", ... }
      const key = c?.currency ?? c?.symbol;
      if (key) map.set(String(key), { name: c.name ?? key, icon: c.icon ?? null });
    }
    return map;
  }, [currencyList]);

  /* ── derived: USDT + INR pairs with live price ──────────── */
  const coins: Coin[] = useMemo(() => {
    if (!Array.isArray(marketsRaw)) return [];
    return marketsRaw
      .filter((m) => m && typeof m.symbol === "string" && /\/(USDT|INR)$/.test(m.symbol))
      .map((m) => {
        const parts = m.symbol.split("/");
        const sym      = String(parts[0] ?? "");
        const quoteCcy = String(parts[1] ?? "USDT");
        const meta = coinMeta.get(sym);
        return {
          symbol:       sym,
          pairSymbol:   m.symbol,
          quoteCcy,
          name:         meta?.name ?? sym,
          icon:         meta?.icon ?? null,
          currentPrice: Number(m.price ?? m.last ?? 0),
          change24h:    Number(m.change ?? m.changePercent ?? 0),
          volume24h:    Number(m.quoteVolume ?? m.baseVolume ?? 0),
          isTrending:   Boolean(m.isTrending),
          isHot:        Boolean(m.isHot),
        };
      })
      .filter((c) => c.symbol && c.currentPrice > 0);
  }, [marketsRaw, coinMeta]);

  /* ── top markets: sorted by 24h volume DESC ─────────────── */
  const top = useMemo(
    () => [...coins].sort((a, b) => b.volume24h - a.volume24h).slice(0, 12),
    [coins],
  );

  /* ── movers: liquid pairs only, sorted by |change| ──────── */
  const movers = useMemo(
    () =>
      [...coins]
        .filter((c) => c.volume24h >= (MIN_LIQUID_VOL[c.quoteCcy] ?? MIN_LIQUID_VOL.USDT))
        .sort((a, b) => Math.abs(b.change24h) - Math.abs(a.change24h))
        .slice(0, 6),
    [coins],
  );

  /* ── stat derivations ───────────────────────────────────── */
  const equity       = summary?.totalEquityInr ?? 0;
  const pnl24        = summary?.pnl24hInr      ?? 0;
  const pnlPct       = summary?.pnl24hPct      ?? 0;
  const runningBots  = bots?.items?.filter((b: any) => b.status === "running").length ?? 0;
  const activeAlerts = alerts?.items?.filter((a: any) => a.status === "active").length ?? 0;

  const openOrdersItems: any[] = Array.isArray(openOrdersResp)
    ? openOrdersResp
    : (openOrdersResp?.items ?? []);
  const openOrdersCount = openOrdersResp?.pagination?.total ?? openOrdersItems.length;

  /* ── allocation (top 5 from summary) ───────────────────── */
  const allocation: any[] = summary?.allocation?.slice(0, 5) ?? [];

  return (
    <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-5">
      <PageHeader
        eyebrow="PRO"
        title="Dashboard"
        description="Everything at a glance — portfolio, markets, bots, and alerts."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm"><Link href="/portfolio-pro">Analytics PRO</Link></Button>
            <Button asChild size="sm"><Link href="/trade">Trade now</Link></Button>
          </div>
        }
      />

      {/* ── stat row ──────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <PremiumStatCard
          title="Total equity"
          value={`₹${equity.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`}
          icon={Wallet}
          hint={`${summary?.activeAssets ?? 0} active assets`}
          accent
        />
        <PremiumStatCard
          title="24h P&L"
          value={`${pnl24 >= 0 ? "+₹" : "-₹"}${Math.abs(pnl24).toFixed(2)}`}
          icon={pnl24 >= 0 ? TrendingUp : TrendingDown}
          delta={pnlPct}
          accent={pnl24 > 0}
        />
        <PremiumStatCard
          title="Open orders"
          value={String(openOrdersCount)}
          icon={ClipboardList}
          hint={openOrdersCount > 0 ? "Tap Orders to manage" : "No pending orders"}
          onClick={() => navigate("/orders")}
        />
        <PremiumStatCard
          title="Price alerts"
          value={String(activeAlerts)}
          icon={Bell}
          hint={activeAlerts > 0 ? "Active alerts set" : "No alerts yet"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* ── LEFT 2/3 ──────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-4">

          {/* Top movers */}
          <SectionCard
            title="Top movers (24h)"
            description="Biggest price swings among liquid markets."
            actions={<Button asChild variant="ghost" size="sm"><Link href="/markets">All markets <ArrowUpRight className="h-3 w-3 ml-1" /></Link></Button>}
          >
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {movers.length === 0 ? (
                <div className="col-span-full text-sm text-muted-foreground text-center py-6">No data yet.</div>
              ) : movers.map((c) => {
                const ch = c.change24h;
                const px = c.currentPrice;
                const pricePrefix = c.quoteCcy === "INR" ? "₹" : "";
                return (
                  <Link key={c.pairSymbol} href={`/trade/${encodeSymbol(c.pairSymbol)}`}
                    className="rounded-lg border border-border bg-card/40 p-3 hover:border-primary/40 transition-colors">
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <CoinAvatar symbol={c.symbol} icon={c.icon} size="sm" />
                        <div className="min-w-0">
                          <span className="font-bold text-xs shrink-0">{c.symbol}</span>
                          <span className="text-[9px] text-muted-foreground ml-1">/{c.quoteCcy}</span>
                        </div>
                      </div>
                      <span className={`text-[11px] font-mono font-bold inline-flex items-center shrink-0 ${ch >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {ch >= 0 ? <TrendingUp className="h-3 w-3 mr-0.5" /> : <TrendingDown className="h-3 w-3 mr-0.5" />}
                        {ch >= 0 ? "+" : ""}{ch.toFixed(2)}%
                      </span>
                    </div>
                    <div className="text-[11px] text-muted-foreground font-mono mt-1">
                      {pricePrefix}{px.toLocaleString(undefined, { maximumFractionDigits: px < 1 ? 6 : 2 })} {!pricePrefix && c.quoteCcy}
                    </div>
                    <div className="flex gap-1 mt-1">
                      {c.isHot      && <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-amber-500/40 text-amber-400">🔥 Hot</Badge>}
                      {c.isTrending && <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-emerald-500/40 text-emerald-400">↑ Trending</Badge>}
                    </div>
                  </Link>
                );
              })}
            </div>
          </SectionCard>

          {/* Top markets by volume */}
          <SectionCard
            title="Top markets"
            description="Highest-volume pairs — click any row to trade."
            actions={<Button asChild variant="ghost" size="sm"><Link href="/markets">View all <ArrowUpRight className="h-3 w-3 ml-1" /></Link></Button>}
          >
            <div className="space-y-0.5">
              {/* Header */}
              <div className="flex items-center justify-between gap-2 px-2 py-1 text-[10px] text-muted-foreground uppercase tracking-wide">
                <span>Asset</span>
                <div className="flex items-center gap-6">
                  <span className="hidden sm:block w-20 text-right">Volume</span>
                  <span className="w-20 text-right">Price</span>
                  <span className="w-12 text-right">24h</span>
                </div>
              </div>
              {top.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-6">No markets to show.</div>
              ) : top.map((c) => {
                const ch  = c.change24h;
                const px  = c.currentPrice;
                const vol = c.volume24h;
                const isINR = c.quoteCcy === "INR";
                const volPrefix = isINR ? "₹" : "$";
                const volStr = vol >= 1_000_000
                  ? `${volPrefix}${(vol / 1_000_000).toFixed(1)}M`
                  : vol >= 1_000
                  ? `${volPrefix}${(vol / 1_000).toFixed(0)}K`
                  : `${volPrefix}${vol.toFixed(0)}`;
                return (
                  <Link key={c.pairSymbol} href={`/trade/${encodeSymbol(c.pairSymbol)}`}
                    className="flex items-center justify-between gap-2 px-2 py-2 rounded hover:bg-muted/30 transition-colors">
                    <div className="flex items-center gap-2 min-w-0">
                      <CoinAvatar symbol={c.symbol} icon={c.icon} />
                      <div className="min-w-0">
                        <div className="font-bold text-xs">{c.symbol}<span className="text-muted-foreground font-normal">/{c.quoteCcy}</span></div>
                        <div className="text-[10px] text-muted-foreground line-clamp-1">{c.name !== c.symbol ? c.name : `${c.quoteCcy} pair`}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 sm:gap-6 shrink-0">
                      <div className="hidden sm:block w-20 text-right">
                        <div className="font-mono text-[11px] text-muted-foreground">{volStr}</div>
                      </div>
                      <div className="w-20 text-right">
                        <div className="font-mono text-sm font-bold">
                          {isINR ? "₹" : ""}{px.toLocaleString(undefined, { maximumFractionDigits: px < 1 ? 6 : 2 })}
                        </div>
                        <div className="text-[10px] text-muted-foreground">{c.quoteCcy}</div>
                      </div>
                      <div className={`w-12 text-right font-mono text-[11px] font-bold ${ch >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {ch >= 0 ? "+" : ""}{ch.toFixed(2)}%
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </SectionCard>
        </div>

        {/* ── RIGHT 1/3 ─────────────────────────────────── */}
        <div className="space-y-4">

          {/* Quick actions */}
          <SectionCard title="Quick actions">
            <div className="grid grid-cols-2 gap-2">
              <QuickAction href="/wallet"       icon={Wallet}       label="Deposit" />
              <QuickAction href="/trade"        icon={TrendingUp}   label="Trade" />
              <QuickAction href="/bots"         icon={Zap}          label="Bots" />
              <QuickAction href="/copy-trading" icon={Star}         label="Copy" />
              <QuickAction href="/orders"       icon={ClipboardList} label={`Orders${openOrdersCount > 0 ? ` (${openOrdersCount})` : ""}`} />
              <QuickAction href="/portfolio-pro" icon={BarChart3}   label="Analytics" />
            </div>
          </SectionCard>

          {/* Portfolio allocation */}
          {allocation.length > 0 && (
            <SectionCard
              title="Portfolio allocation"
              actions={<Button asChild variant="ghost" size="sm" className="h-7 text-[11px]"><Link href="/wallet"><PieChart className="h-3 w-3 mr-1" />Wallet</Link></Button>}
            >
              <div className="space-y-2">
                {allocation.map((a: any) => (
                  <div key={a.symbol} className="flex items-center gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {a.icon
                        ? <img src={a.icon} alt={a.symbol} className="h-5 w-5 rounded-full object-contain shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                        : <span className="h-5 w-5 rounded-full bg-amber-500/15 text-amber-400 flex items-center justify-center text-[10px] font-bold shrink-0">{a.symbol[0]}</span>
                      }
                      <span className="font-bold text-xs shrink-0">{a.symbol}</span>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs font-mono font-bold">
                        ₹{Number(a.valueInr ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                      </div>
                      <div className="text-[10px] text-muted-foreground">{Number(a.pct ?? 0).toFixed(1)}%</div>
                    </div>
                    {/* Bar */}
                    <div className="w-12 h-1.5 rounded-full bg-muted overflow-hidden shrink-0">
                      <div className="h-full bg-amber-400 rounded-full" style={{ width: `${Math.min(100, Number(a.pct ?? 0))}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {/* Active bots */}
          {runningBots > 0 && (
            <SectionCard
              title={`Active bots (${runningBots})`}
              actions={<Button asChild variant="ghost" size="sm" className="h-7 text-[11px]"><Link href="/bots">Manage</Link></Button>}
            >
              <div className="space-y-1.5">
                {bots!.items.filter((b: any) => b.status === "running").slice(0, 4).map((b: any) => (
                  <div key={b.id} className="flex items-center justify-between text-xs gap-2">
                    <span className="font-bold text-xs flex-1 min-w-0 line-clamp-1">{b.name ?? b.symbol ?? `Bot #${b.id}`}</span>
                    <span className="text-emerald-400 font-mono shrink-0">Running</span>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {/* Recent notifications */}
          <SectionCard
            title="Recent activity"
            actions={<Button asChild variant="ghost" size="sm" className="h-7 text-[11px]"><Link href="/notifications">View all{unread?.count ? ` (${unread.count})` : ""}</Link></Button>}
          >
            {(notifsResp?.items?.length ?? 0) === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-6">Nothing yet.</div>
            ) : (
              <div className="space-y-2">
                {notifsResp!.items.slice(0, 5).map((n: any) => (
                  <Link key={n.id} href={n.ctaUrl || "/notifications"} className="block px-2 py-1.5 rounded hover:bg-muted/30">
                    <div className="text-xs font-bold line-clamp-1">{n.title}</div>
                    {n.body && <div className="text-[11px] text-muted-foreground line-clamp-1">{n.body}</div>}
                  </Link>
                ))}
              </div>
            )}
          </SectionCard>

          {/* Alerts */}
          <SectionCard
            title="Active alerts"
            actions={<Button asChild variant="ghost" size="sm" className="h-7 text-[11px]"><Link href="/price-alerts">Manage</Link></Button>}
          >
            {(alerts?.items?.length ?? 0) === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-6">
                No alerts set.{" "}
                <Link href="/price-alerts" className="text-primary hover:underline">Create one →</Link>
              </div>
            ) : (
              <div className="space-y-1.5">
                {alerts!.items.slice(0, 5).map((a: any) => {
                  const isAbove = a.condition === "above" || a.condition === "gte" || a.condition === ">";
                  return (
                    <div key={a.id} className="flex items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className={`inline-flex h-4 w-4 items-center justify-center rounded text-[9px] font-bold ${isAbove ? "bg-emerald-500/15 text-emerald-400" : "bg-rose-500/15 text-rose-400"}`}>
                          {isAbove ? "▲" : "▼"}
                        </span>
                        <span className="font-bold">{a.coinSymbol}</span>
                      </div>
                      <span className="text-muted-foreground font-mono text-[11px]">
                        {Number(a.targetPrice).toLocaleString(undefined, { maximumFractionDigits: 4 })}
                        {" "}{a.quoteCurrency ?? a.quoteCcy ?? (a.pair?.split("/")?.[1]) ?? ""}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

/* ── Sub-components ─────────────────────────────────────────── */

function CoinAvatar({ symbol, icon, size = "md" }: { symbol: string; icon: string | null; size?: "sm" | "md" }) {
  const dim       = size === "sm" ? "h-5 w-5" : "h-7 w-7";
  const textSize  = size === "sm" ? "text-[9px]" : "text-[11px]";
  // Letter always rendered as base layer; img overlays on top and hides on error
  return (
    <span className={`${dim} rounded-full shrink-0 relative inline-block`}>
      <span className={`${dim} rounded-full bg-amber-500/15 text-amber-400 flex items-center justify-center ${textSize} font-bold absolute inset-0`}>
        {symbol[0]}
      </span>
      {icon && (
        <img
          src={icon}
          alt={symbol}
          className={`${dim} rounded-full object-contain absolute inset-0`}
          onError={(e) => { e.currentTarget.style.display = "none"; }}
        />
      )}
    </span>
  );
}

function QuickAction({ href, icon: Icon, label }: { href: string; icon: typeof Zap; label: string }) {
  return (
    <Link href={href} className="rounded-lg border border-border bg-card/40 p-3 flex flex-col items-center gap-1 hover:border-primary/40 hover:bg-primary/5 transition-colors text-center">
      <Icon className="h-4 w-4 text-amber-400" />
      <span className="text-[11px] font-bold">{label}</span>
    </Link>
  );
}
