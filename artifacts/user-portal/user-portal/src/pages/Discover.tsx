import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { get } from "@/lib/api";
import { PageHeader } from "@/components/premium/PageHeader";
import { SectionCard } from "@/components/premium/SectionCard";
import { PremiumStatCard } from "@/components/premium/PremiumStatCard";
import { StatusPill } from "@/components/premium/StatusPill";
import { EmptyState } from "@/components/premium/EmptyState";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Radar, Search, Flame, TrendingUp, ExternalLink, ArrowUpRight, Sparkles, AlertTriangle, Zap, Globe2 } from "lucide-react";

type Item = {
  id: number; source: string; chain: string | null; contractAddress: string | null;
  symbol: string; name: string; logoUrl: string | null;
  priceUsd: string; marketCapUsd: string; volume24hUsd: string; liquidityUsd: string;
  priceChange24h: string; ageDays: number; riskScore: number; riskFlags: string[];
  status: string; listedCoinId: number | null; listedTokenId: number | null;
  discoveredAt: string;
};

const fmtUsd = (v: string | number) => {
  const n = typeof v === "string" ? Number(v) : v;
  if (!Number.isFinite(n) || n === 0) return "—";
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B USDT`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M USDT`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(2)}K USDT`;
  return `${n.toFixed(2)} USDT`;
};
const fmtPrice = (v: string | number) => {
  const n = typeof v === "string" ? Number(v) : v;
  if (!Number.isFinite(n) || n === 0) return "—";
  if (n < 0.0001) return `${n.toExponential(2)} USDT`;
  if (n < 1) return `${n.toFixed(6)} USDT`;
  return `${n.toFixed(2)} USDT`;
};
const ageLabel = (d: number) => d === 0 ? "today" : d === 1 ? "1d" : d < 30 ? `${d}d` : d < 365 ? `${Math.floor(d / 30)}mo` : `${Math.floor(d / 365)}y`;

const CHAIN_LABELS: Record<string, { label: string; color: string }> = {
  ethereum: { label: "ETH", color: "text-indigo-400" },
  bsc: { label: "BSC", color: "text-yellow-500" },
  polygon: { label: "POL", color: "text-purple-400" },
  arbitrum: { label: "ARB", color: "text-blue-400" },
  optimism: { label: "OP", color: "text-rose-400" },
  base: { label: "BASE", color: "text-blue-500" },
  avalanche: { label: "AVAX", color: "text-rose-500" },
  solana: { label: "SOL", color: "text-emerald-400" },
};

export default function DiscoverPage() {
  const [chain, setChain] = useState<string>("");
  const [sort, setSort] = useState<string>("volume");
  const [search, setSearch] = useState("");

  const q = useQuery<{ items: Item[] }>({
    queryKey: ["discover", chain, sort, search],
    queryFn: () => get(`/listings/discover?limit=100&sort=${sort}${chain ? `&chain=${chain}` : ""}${search ? `&search=${encodeURIComponent(search)}` : ""}`),
    refetchInterval: 60_000,
  });
  const trendingQ = useQuery<{ items: Item[] }>({
    queryKey: ["discover-trending"],
    queryFn: () => get(`/listings/trending`),
  });

  const items = q.data?.items ?? [];
  const trending = trendingQ.data?.items ?? [];

  const totals = items.reduce((a, c) => ({
    vol: a.vol + Number(c.volume24hUsd),
    listed: a.listed + (c.status === "listed" ? 1 : 0),
    new24h: a.new24h + (Date.now() - new Date(c.discoveredAt).getTime() < 86400000 ? 1 : 0),
  }), { vol: 0, listed: 0, new24h: 0 });

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-7xl mx-auto">
      <PageHeader
        eyebrow="Multi-chain"
        title="Discover"
        description="New coins and trending tokens across multiple chains. Review risk flags carefully before investing."
      />

      <div className="grid gap-4 md:grid-cols-4">
        <PremiumStatCard title="Tracked tokens" value={String(items.length)} icon={Globe2} accent />
        <PremiumStatCard title="24h volume" value={fmtUsd(totals.vol)} icon={TrendingUp} />
        <PremiumStatCard title="New (24h)" value={String(totals.new24h)} icon={Sparkles} accent />
        <PremiumStatCard title="Auto-listed" value={String(totals.listed)} icon={Zap} />
      </div>

      {trending.length > 0 && (
        <SectionCard icon={Flame} title="Trending — bada move" description="24h price action ke top movers">
          <div className="flex gap-3 overflow-x-auto pb-2">
            {trending.slice(0, 12).map((t) => {
              const ch = Number(t.priceChange24h);
              return (
                <div key={t.id} className="min-w-[180px] flex-shrink-0 p-3 rounded-xl border border-border/40 bg-card/50 hover:border-amber-500/40 transition">
                  <div className="flex items-center gap-2">
                    {t.logoUrl ? <img src={t.logoUrl} alt="" className="h-7 w-7 rounded-full" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} /> : <div className="h-7 w-7 rounded-full bg-muted" />}
                    <div className="min-w-0">
                      <div className="font-semibold text-sm">{t.symbol}</div>
                      {t.chain && <div className={`text-[10px] uppercase ${CHAIN_LABELS[t.chain]?.color ?? "text-muted-foreground"}`}>{CHAIN_LABELS[t.chain]?.label ?? t.chain}</div>}
                    </div>
                  </div>
                  <div className="mt-2 text-lg font-bold tabular-nums">{fmtPrice(t.priceUsd)}</div>
                  <div className={`text-sm font-medium ${ch >= 0 ? "text-emerald-500" : "text-rose-500"}`}>{ch >= 0 ? "+" : ""}{ch.toFixed(2)}%</div>
                </div>
              );
            })}
          </div>
        </SectionCard>
      )}

      <SectionCard
        icon={Radar}
        title="All tokens"
        description="Filter and sort by chain, volume, or risk score. A risk score above 80 indicates a new or high-risk token — proceed with caution."
      >
        <div className="flex flex-wrap gap-2 items-center mb-4">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search symbol or name…" className="pl-9" />
          </div>
          <Select value={chain || "all"} onValueChange={(v) => setChain(v === "all" ? "" : v)}>
            <SelectTrigger className="w-40"><SelectValue placeholder="All chains" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All chains</SelectItem>
              {Object.keys(CHAIN_LABELS).map((k) => <SelectItem key={k} value={k}>{CHAIN_LABELS[k].label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="volume">Sort: 24h Volume</SelectItem>
              <SelectItem value="mcap">Sort: Market Cap</SelectItem>
              <SelectItem value="change">Sort: 24h Change</SelectItem>
              <SelectItem value="age">Sort: Newest</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {q.isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading…</div>
        ) : items.length === 0 ? (
          <EmptyState icon={Radar} title="No tokens found" description="Try clearing your filters, or check back soon — discovery syncs regularly." />
        ) : (
          <div className="overflow-x-auto -mx-4 md:mx-0">
            <table className="w-full text-sm min-w-[900px]">
              <thead className="text-xs uppercase text-muted-foreground border-b border-border/40">
                <tr>
                  <th className="text-left p-3">#</th>
                  <th className="text-left p-3">Token</th>
                  <th className="text-left p-3">Chain</th>
                  <th className="text-right p-3">Price</th>
                  <th className="text-right p-3">24h%</th>
                  <th className="text-right p-3">24h Vol</th>
                  <th className="text-right p-3">Mcap</th>
                  <th className="text-right p-3">Liquidity</th>
                  <th className="text-center p-3">Age</th>
                  <th className="text-center p-3">Risk</th>
                  <th className="text-right p-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {items.map((c, idx) => {
                  const change = Number(c.priceChange24h);
                  const riskVariant: "danger" | "warning" | "success" = c.riskScore >= 80 ? "danger" : c.riskScore >= 50 ? "warning" : "success";
                  const chainStyle = c.chain ? CHAIN_LABELS[c.chain] : null;
                  const tradeHref = c.listedCoinId ? `/trade/${c.symbol}-USDT` : c.listedTokenId ? `/web3` : null;
                  return (
                    <tr key={c.id} className="border-b border-border/20 hover:bg-muted/20 transition">
                      <td className="p-3 text-xs text-muted-foreground tabular-nums">{idx + 1}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          {c.logoUrl ? <img src={c.logoUrl} alt="" className="h-7 w-7 rounded-full" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} /> : <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-xs font-bold">{c.symbol[0]}</div>}
                          <div className="min-w-0">
                            <div className="font-semibold text-sm">{c.symbol}</div>
                            <div className="text-xs text-muted-foreground line-clamp-1 max-w-[160px]">{c.name}</div>
                          </div>
                          {c.status === "listed" && <StatusPill variant="success" dot={false}>Listed</StatusPill>}
                        </div>
                      </td>
                      <td className="p-3"><span className={`text-xs font-bold ${chainStyle?.color ?? "text-muted-foreground"}`}>{chainStyle?.label ?? c.chain ?? "—"}</span></td>
                      <td className="p-3 text-right tabular-nums font-medium">{fmtPrice(c.priceUsd)}</td>
                      <td className={`p-3 text-right tabular-nums font-medium ${change >= 0 ? "text-emerald-500" : "text-rose-500"}`}>{change >= 0 ? "+" : ""}{change.toFixed(2)}%</td>
                      <td className="p-3 text-right tabular-nums">{fmtUsd(c.volume24hUsd)}</td>
                      <td className="p-3 text-right tabular-nums">{fmtUsd(c.marketCapUsd)}</td>
                      <td className="p-3 text-right tabular-nums">{fmtUsd(c.liquidityUsd)}</td>
                      <td className="p-3 text-center text-xs text-muted-foreground">{ageLabel(c.ageDays)}</td>
                      <td className="p-3 text-center">
                        <div className="flex flex-col items-center gap-0.5">
                          <StatusPill variant={riskVariant} dot={false}>{c.riskScore}</StatusPill>
                          {c.riskFlags.length > 0 && (
                            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5" title={c.riskFlags.join(", ")}>
                              <AlertTriangle className="h-2.5 w-2.5" />{c.riskFlags.length}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-3 text-right">
                        {tradeHref ? (
                          <Link href={tradeHref}>
                            <Button size="sm" variant="outline" className="h-7"><ArrowUpRight className="h-3 w-3 mr-1" />Trade</Button>
                          </Link>
                        ) : c.contractAddress ? (
                          <a href={`https://dexscreener.com/${c.chain}/${c.contractAddress}`} target="_blank" rel="noopener noreferrer">
                            <Button size="sm" variant="ghost" className="h-7"><ExternalLink className="h-3 w-3" /></Button>
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4 text-xs text-muted-foreground text-center">
          Data sourced from DexScreener &amp; CoinGecko. Auto-refreshes every 60 sec. <span className="text-amber-500">⚠ Trading involves risk.</span>
        </div>
      </SectionCard>
    </div>
  );
}
