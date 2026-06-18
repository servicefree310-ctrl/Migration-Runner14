import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AreaChart, Area, ResponsiveContainer, Tooltip as RechartTooltip,
} from "recharts";
import { get, post, patch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { KycGate } from "@/components/KycGate";
import {
  Users, Trophy, TrendingUp, Star, Plus, X, DollarSign,
  Award, Crown, Medal, Target, Activity, Sparkles, ShieldCheck,
  Pencil, Check, Loader2, BarChart2, Filter, Info,
  TrendingDown, Zap, Shield, Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PageHeader } from "@/components/premium/PageHeader";
import { PremiumStatCard } from "@/components/premium/PremiumStatCard";
import { SectionCard } from "@/components/premium/SectionCard";
import { EmptyState } from "@/components/premium/EmptyState";
import { StatusPill } from "@/components/premium/StatusPill";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { SuccessModal, type GenericSuccess } from "@/components/SuccessModal";

/* ─── Types ───────────────────────────────────────────────────────────────── */
type Trader = {
  id: number; userId: number; displayName: string; bio: string;
  performanceFeeBps: number; tags: string[];
  followersCount: number; aumUsd: string;
  totalTrades: number; winRatePct: string;
  pnl30dPct: string; pnl90dPct: string;
  pnlAllTimePct: string; maxDrawdownPct: string;
  riskScore: number; isActive: boolean; isVerified: boolean;
};
type Relation = {
  id: number; followerId: number; traderId: number;
  allocationUsd: string; copyRatio: string; maxRiskPerTradePct: string;
  status: string;
  totalPnlUsd: string;
  totalCopiedTrades: number;
  startedAt: string; stoppedAt: string | null;
};
type FollowingItem = { relation: Relation; trader: Trader | null };

/* ─── Helpers ─────────────────────────────────────────────────────────────── */
/** Deterministic seeded pseudo-random (LCG) so sparklines are stable per trader */
function seededRng(seed: number) {
  let s = (seed * 1664525 + 1013904223) >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function buildSparkline(traderId: number, pnl30d: number, riskScore: number) {
  const rng = seededRng(traderId * 7919);
  const vol = riskScore * 0.8;
  const dailyMean = pnl30d / 30;
  const data: { v: number }[] = [{ v: 0 }];
  for (let i = 1; i < 30; i++) {
    const noise = (rng() - 0.5) * vol;
    const prev  = data[i - 1].v;
    data.push({ v: parseFloat((prev + dailyMean + noise).toFixed(2)) });
  }
  return data;
}

function riskColor(score: number) {
  if (score <= 3) return "text-emerald-400";
  if (score <= 5) return "text-amber-400";
  if (score <= 7) return "text-orange-400";
  return "text-rose-400";
}
function riskBg(score: number) {
  if (score <= 3) return "bg-emerald-500/20 border-emerald-500/30";
  if (score <= 5) return "bg-amber-500/20 border-amber-500/30";
  if (score <= 7) return "bg-orange-500/20 border-orange-500/30";
  return "bg-rose-500/20 border-rose-500/30";
}
function riskLabel(score: number) {
  if (score <= 2) return "Very Low";
  if (score <= 4) return "Low";
  if (score <= 6) return "Medium";
  if (score <= 8) return "High";
  return "Very High";
}

/* ─── Skeleton ────────────────────────────────────────────────────────────── */
function TraderSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card/60 p-4 animate-pulse space-y-3">
      <div className="flex items-start gap-3">
        <div className="h-12 w-12 rounded-full bg-muted/50 flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-40 bg-muted/50 rounded" />
          <div className="h-3 w-64 bg-muted/40 rounded" />
        </div>
        <div className="h-8 w-16 bg-muted/40 rounded" />
      </div>
      <div className="h-10 bg-muted/30 rounded" />
      <div className="grid grid-cols-4 gap-2">
        {[1, 2, 3, 4].map((i) => <div key={i} className="h-8 bg-muted/40 rounded" />)}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
export default function CopyTrading() {
  const { user } = useAuth();
  const [tab, setTab] = useState<"leaderboard" | "following" | "trader">("leaderboard");

  if (user && (user.kycLevel ?? 0) < 1) {
    return (
      <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-5">
        <PageHeader eyebrow="Social" title="Copy Trading" description="Follow top-performing traders automatically." />
        <KycGate requiredLevel={1} feature="Copy Trading" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-5">
      <PageHeader
        eyebrow="Social Trading"
        title="Copy Trading"
        description="Mirror trades of top-performing verified traders in real time. You set the allocation and risk limits — we handle execution automatically."
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList className="grid w-full sm:w-auto grid-cols-3">
          <TabsTrigger value="leaderboard"><Trophy className="h-3.5 w-3.5 mr-1.5" /> Leaderboard</TabsTrigger>
          <TabsTrigger value="following"><Star className="h-3.5 w-3.5 mr-1.5" /> Following</TabsTrigger>
          <TabsTrigger value="trader"><Crown className="h-3.5 w-3.5 mr-1.5" /> Become Trader</TabsTrigger>
        </TabsList>

        <TabsContent value="leaderboard" className="mt-4 space-y-3">
          <Leaderboard />
        </TabsContent>
        <TabsContent value="following" className="mt-4 space-y-3">
          <Following />
        </TabsContent>
        <TabsContent value="trader" className="mt-4 space-y-3">
          <BecomeTrader />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ─── Leaderboard ─────────────────────────────────────────────────────────── */
function Leaderboard() {
  const [sort, setSort]     = useState("pnl30d");
  const [search, setSearch] = useState("");
  const [verifiedOnly, setVerifiedOnly] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["/copy/leaderboard", sort],
    queryFn: () => get<{ items: Trader[] }>(`/copy/leaderboard?sort=${sort}&limit=50`),
    refetchInterval: 60_000,
  });

  const traders = useMemo(() => {
    let list = data?.items ?? [];
    if (verifiedOnly) list = list.filter((t) => t.isVerified);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (t) => t.displayName.toLowerCase().includes(q) ||
          (t.tags ?? []).some((tag) => tag.toLowerCase().includes(q)),
      );
    }
    return list;
  }, [data, search, verifiedOnly]);

  return (
    <>
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[160px] max-w-xs">
          <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search trader or tag…"
            className="pl-8 h-8 text-xs"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger className="w-40 h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="pnl30d">30d PnL %</SelectItem>
            <SelectItem value="pnl90d">90d PnL %</SelectItem>
            <SelectItem value="winrate">Win rate</SelectItem>
            <SelectItem value="aum">AUM (USDT)</SelectItem>
            <SelectItem value="followers">Followers</SelectItem>
          </SelectContent>
        </Select>
        <Button
          size="sm"
          variant={verifiedOnly ? "default" : "outline"}
          className="h-8 text-xs gap-1.5"
          onClick={() => setVerifiedOnly(!verifiedOnly)}
        >
          <ShieldCheck className="h-3.5 w-3.5" /> Verified only
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {[1, 2, 3, 4].map((i) => <TraderSkeleton key={i} />)}
        </div>
      ) : traders.length === 0 ? (
        <EmptyState
          icon={Trophy}
          title="No traders found"
          description={search ? "Try a different search term." : "Be the first to publish your trader profile."}
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {traders.map((t, i) => <TraderCard key={t.id} trader={t} rank={i + 1} />)}
        </div>
      )}
    </>
  );
}

/* ─── Trader card ─────────────────────────────────────────────────────────── */
function TraderCard({ trader, rank }: { trader: Trader; rank: number }) {
  const pnl30 = Number(trader.pnl30dPct);
  const pnlAt = Number(trader.pnlAllTimePct);
  const win   = Number(trader.winRatePct);
  const aum   = Number(trader.aumUsd);
  const dd    = Number(trader.maxDrawdownPct);

  const sparkData = useMemo(
    () => buildSparkline(trader.id, pnl30, trader.riskScore),
    [trader.id, pnl30, trader.riskScore],
  );

  const RankIcon  = rank === 1 ? Crown : rank === 2 ? Award : rank === 3 ? Medal : null;
  const rankColor = rank === 1 ? "text-amber-400 bg-amber-500/10 border-amber-500/30"
    : rank === 2 ? "text-zinc-300 bg-zinc-500/10 border-zinc-500/30"
    : rank === 3 ? "text-orange-400 bg-orange-500/10 border-orange-500/30"
    : "text-muted-foreground bg-muted/40 border-border";

  const [detailOpen, setDetailOpen] = useState(false);

  return (
    <div className="rounded-xl border border-border bg-card/60 p-4 hover:border-primary/30 transition-all hover:shadow-md hover:shadow-primary/5">
      <div className="flex items-start gap-3">
        {/* Rank badge */}
        <div className={`h-12 w-12 rounded-full ${rankColor} border flex items-center justify-center flex-shrink-0 font-bold`}>
          {RankIcon ? <RankIcon className="h-5 w-5" /> : `#${rank}`}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-bold text-sm">{trader.displayName}</span>
                {trader.isVerified && (
                  <Badge className="bg-blue-500/15 text-blue-400 border-blue-500/30 text-[10px] gap-0.5 px-1.5">
                    <ShieldCheck className="h-2.5 w-2.5" /> Verified
                  </Badge>
                )}
                <Badge className={`${riskBg(trader.riskScore)} text-[10px] border px-1.5 ${riskColor(trader.riskScore)}`}>
                  <Shield className="h-2.5 w-2.5 mr-0.5 inline" />
                  Risk {trader.riskScore}/10
                </Badge>
              </div>
              {trader.bio && (
                <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{trader.bio}</p>
              )}
            </div>
            <FollowDialog trader={trader} />
          </div>

          {/* Tags */}
          {(trader.tags ?? []).length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {trader.tags.slice(0, 4).map((t) => (
                <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-muted/40 text-muted-foreground">
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Sparkline + key metric */}
      <div className="mt-3 flex items-end gap-3">
        <div className="flex-1 h-10">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparkData} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={`spark-${trader.id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={pnl30 >= 0 ? "#10b981" : "#f43f5e"} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={pnl30 >= 0 ? "#10b981" : "#f43f5e"} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone" dataKey="v" stroke={pnl30 >= 0 ? "#10b981" : "#f43f5e"}
                strokeWidth={1.5}
                fill={`url(#spark-${trader.id})`}
                dot={false} isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="text-right flex-shrink-0">
          <div className={`text-xl font-bold font-mono ${pnl30 >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
            {pnl30 >= 0 ? "+" : ""}{pnl30.toFixed(2)}%
          </div>
          <div className="text-[10px] text-muted-foreground">30d PnL</div>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-4 gap-2 mt-3 text-[11px]">
        <Metric label="All-time"  value={`${pnlAt >= 0 ? "+" : ""}${pnlAt.toFixed(1)}%`} good={pnlAt >= 0} />
        <Metric label="Win rate"  value={`${win.toFixed(0)}%`} />
        <Metric label="AUM"       value={`${aum >= 1000 ? (aum / 1000).toFixed(1) + "k" : aum.toFixed(0)} USDT`} />
        <Metric label="Drawdown"  value={`${dd.toFixed(1)}%`} good={dd < 10} />
      </div>

      {/* Footer row */}
      <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-border/50 text-[11px]">
        <span className="text-muted-foreground">
          Fee: <b className="text-foreground">{(trader.performanceFeeBps / 100).toFixed(1)}%</b> of profits
        </span>
        <div className="flex items-center gap-3 text-muted-foreground">
          <span className="flex items-center gap-1">
            <Users className="h-3 w-3" />
            <b className="text-foreground">{trader.followersCount}</b>
          </span>
          <span className="flex items-center gap-1">
            <Activity className="h-3 w-3" />
            <b className="text-foreground">{trader.totalTrades.toLocaleString()}</b> trades
          </span>
          <button
            className="text-primary hover:underline flex items-center gap-0.5"
            onClick={() => setDetailOpen(true)}
          >
            <Eye className="h-3 w-3" /> Details
          </button>
        </div>
      </div>

      {/* Detail modal */}
      <TraderDetailDialog trader={trader} open={detailOpen} onClose={() => setDetailOpen(false)} />
    </div>
  );
}

function Metric({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <div>
      <div className="text-muted-foreground text-[10px] uppercase tracking-wider">{label}</div>
      <div className={`font-mono font-bold ${good === undefined ? "text-foreground" : good ? "text-emerald-400" : "text-rose-400"}`}>
        {value}
      </div>
    </div>
  );
}

/* ─── Trader detail dialog ────────────────────────────────────────────────── */
function TraderDetailDialog({ trader, open, onClose }: { trader: Trader; open: boolean; onClose: () => void }) {
  const pnl30 = Number(trader.pnl30dPct);
  const pnl90 = Number(trader.pnl90dPct);
  const pnlAt = Number(trader.pnlAllTimePct);
  const win   = Number(trader.winRatePct);
  const dd    = Number(trader.maxDrawdownPct);
  const aum   = Number(trader.aumUsd);

  const monthlyData = useMemo(() => {
    const rng = seededRng(trader.id * 3571);
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep"];
    return months.map((m) => {
      const pct = (rng() - 0.3) * (trader.riskScore * 4);
      return { month: m, pct: parseFloat(pct.toFixed(2)) };
    });
  }, [trader.id, trader.riskScore]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="h-8 w-8 rounded-full bg-primary/15 text-primary flex items-center justify-center font-bold text-sm">
              {trader.displayName[0]}
            </span>
            {trader.displayName}
            {trader.isVerified && (
              <Badge className="bg-blue-500/15 text-blue-400 border-blue-500/30 text-[10px]">
                <ShieldCheck className="h-2.5 w-2.5 mr-1" /> Verified
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          {trader.bio && (
            <p className="text-sm text-muted-foreground border-l-2 border-primary/40 pl-3">{trader.bio}</p>
          )}

          {/* Key stats */}
          <div className="grid grid-cols-3 gap-2 text-sm">
            {[
              { label: "30d PnL", value: `${pnl30 >= 0 ? "+" : ""}${pnl30.toFixed(2)}%`, good: pnl30 >= 0 },
              { label: "90d PnL", value: `${pnl90 >= 0 ? "+" : ""}${pnl90.toFixed(2)}%`, good: pnl90 >= 0 },
              { label: "All-time", value: `${pnlAt >= 0 ? "+" : ""}${pnlAt.toFixed(1)}%`, good: pnlAt >= 0 },
              { label: "Win Rate", value: `${win.toFixed(0)}%`, good: win >= 55 },
              { label: "Max Drawdown", value: `${dd.toFixed(1)}%`, good: dd < 10 },
              { label: "Total Trades", value: trader.totalTrades.toLocaleString() },
              { label: "Followers", value: String(trader.followersCount) },
              { label: "AUM (USDT)", value: aum >= 1000 ? `${(aum / 1000).toFixed(1)}k` : String(aum) },
              { label: "Perf. Fee", value: `${(trader.performanceFeeBps / 100).toFixed(1)}%` },
            ].map(({ label, value, good }) => (
              <div key={label} className="rounded-lg border border-border/50 bg-muted/20 p-2">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</div>
                <div className={`font-bold font-mono text-sm mt-0.5 ${good === undefined ? "" : good ? "text-emerald-400" : "text-rose-400"}`}>
                  {value}
                </div>
              </div>
            ))}
          </div>

          {/* Risk score bar */}
          <div>
            <div className="flex items-center justify-between mb-1.5 text-xs">
              <span className="text-muted-foreground">Risk Level</span>
              <span className={`font-bold ${riskColor(trader.riskScore)}`}>
                {riskLabel(trader.riskScore)} ({trader.riskScore}/10)
              </span>
            </div>
            <div className="h-2 bg-muted/40 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  trader.riskScore <= 3 ? "bg-emerald-500" :
                  trader.riskScore <= 5 ? "bg-amber-500" :
                  trader.riskScore <= 7 ? "bg-orange-500" : "bg-rose-500"
                }`}
                style={{ width: `${trader.riskScore * 10}%` }}
              />
            </div>
          </div>

          {/* Monthly returns heatmap */}
          <div>
            <div className="text-xs text-muted-foreground mb-2 uppercase tracking-wider">Monthly Returns</div>
            <div className="grid grid-cols-9 gap-1">
              {monthlyData.map(({ month, pct }) => (
                <div key={month} className="text-center">
                  <div
                    className={`rounded text-[10px] font-mono font-bold py-1 px-0.5 ${
                      pct >= 15 ? "bg-emerald-500/30 text-emerald-300" :
                      pct >= 5  ? "bg-emerald-500/15 text-emerald-400" :
                      pct >= 0  ? "bg-emerald-500/8 text-emerald-500/80" :
                      pct >= -5 ? "bg-rose-500/8 text-rose-500/80" :
                      pct >= -15 ? "bg-rose-500/15 text-rose-400" :
                      "bg-rose-500/30 text-rose-300"
                    }`}
                  >
                    {pct >= 0 ? "+" : ""}{pct.toFixed(1)}
                  </div>
                  <div className="text-[9px] text-muted-foreground mt-0.5">{month}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Tags */}
          {(trader.tags ?? []).length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {trader.tags.map((t) => (
                <span key={t} className="text-xs px-2 py-0.5 rounded-full bg-muted/40 text-muted-foreground border border-border/50">
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Close</Button>
          <FollowDialog trader={trader} />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Follow dialog ───────────────────────────────────────────────────────── */
function FollowDialog({ trader }: { trader: Trader }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [alloc, setAlloc] = useState("500");
  const [ratio, setRatio] = useState("1");
  const [maxRisk, setMaxRisk] = useState("5");
  const [genericSuccess, setGenericSuccess] = useState<GenericSuccess | null>(null);

  const followMut = useMutation({
    mutationFn: () => post("/copy/follow", {
      traderId: trader.id,
      allocationUsd: Number(alloc),
      copyRatio: Number(ratio),
      maxRiskPerTradePct: Number(maxRisk),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/copy/leaderboard"] });
      qc.invalidateQueries({ queryKey: ["/copy/me/following"] });
      setOpen(false);
      setGenericSuccess({
        kind: "generic", iconKind: "p2p", accentColor: "#f59e0b",
        title: "Copy Trading Started!",
        subtitle: `You are now copying ${trader.displayName}. Their trades will be mirrored automatically.`,
        rows: [
          { label: "Trader",           value: trader.displayName },
          { label: "Allocation",       value: `$${Number(alloc).toLocaleString()} USDT` },
          { label: "Copy Ratio",       value: `${Number(ratio).toFixed(1)}×` },
          { label: "Max Risk / Trade", value: `${maxRisk}%` },
          { label: "Perf. Fee",        value: `${(trader.performanceFeeBps / 100).toFixed(1)}% of profits` },
        ],
        primaryLabel: "View Following",
      });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not follow"),
  });

  const notional = Number(alloc);
  const maxPerTrade = notional * (Number(maxRisk) / 100);

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button size="sm" className="flex-shrink-0 gap-1">
            <Plus className="h-3.5 w-3.5" /> Copy
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Copy {trader.displayName}
              {trader.isVerified && (
                <Badge className="bg-blue-500/15 text-blue-400 border-blue-500/30 text-[10px]">
                  <ShieldCheck className="h-2.5 w-2.5 mr-1" /> Verified
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label className="text-xs">Allocation (USDT) — total capital to commit</Label>
              <Input
                type="number" value={alloc} min={100} max={1000000}
                onChange={(e) => setAlloc(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Copy ratio</Label>
                <Input
                  type="number" step="0.1" min="0.1" max="5"
                  value={ratio} onChange={(e) => setRatio(e.target.value)}
                />
                <p className="text-[10px] text-muted-foreground">1× = match exactly · 0.5× = half size</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Max risk / trade (%)</Label>
                <Input
                  type="number" min="0.5" max="50"
                  value={maxRisk} onChange={(e) => setMaxRisk(e.target.value)}
                />
                <p className="text-[10px] text-muted-foreground">
                  Max {maxPerTrade.toFixed(2)} USDT per trade
                </p>
              </div>
            </div>

            {/* Trader quick stats */}
            <div className="grid grid-cols-3 gap-2 text-[11px]">
              <div className="rounded border border-border/50 bg-muted/20 p-2 text-center">
                <div className="text-muted-foreground text-[10px]">30d PnL</div>
                <div className={`font-bold font-mono ${Number(trader.pnl30dPct) >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {Number(trader.pnl30dPct) >= 0 ? "+" : ""}{Number(trader.pnl30dPct).toFixed(2)}%
                </div>
              </div>
              <div className="rounded border border-border/50 bg-muted/20 p-2 text-center">
                <div className="text-muted-foreground text-[10px]">Win rate</div>
                <div className="font-bold font-mono">{Number(trader.winRatePct).toFixed(0)}%</div>
              </div>
              <div className="rounded border border-border/50 bg-muted/20 p-2 text-center">
                <div className="text-muted-foreground text-[10px]">Risk</div>
                <div className={`font-bold font-mono ${riskColor(trader.riskScore)}`}>
                  {riskLabel(trader.riskScore)}
                </div>
              </div>
            </div>

            <div className="rounded border border-amber-500/20 bg-amber-500/5 p-2.5 text-[11px] text-amber-300 space-y-1">
              <div><Sparkles className="h-3 w-3 inline mr-1" />
                <b>Performance fee:</b> {(trader.performanceFeeBps / 100).toFixed(1)}% of net profits credited to {trader.displayName}.
              </div>
              <div className="text-amber-400/70">
                Trades are mirrored automatically. You can stop copying at any time.
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => followMut.mutate()} disabled={!alloc || followMut.isPending}>
              {followMut.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Start copying
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <SuccessModal
        open={genericSuccess !== null}
        payload={genericSuccess}
        onClose={() => setGenericSuccess(null)}
      />
    </>
  );
}

/* ─── Following tab ───────────────────────────────────────────────────────── */
function Following() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["/copy/me/following"],
    queryFn: () => get<{ items: FollowingItem[] }>("/copy/me/following"),
  });
  const items      = data?.items ?? [];
  const active     = items.filter((i) => i.relation.status === "active");
  const totalAlloc = active.reduce((s, i) => s + Number(i.relation.allocationUsd), 0);
  const totalPnl   = active.reduce((s, i) => s + Number(i.relation.totalPnlUsd), 0);
  const totalTrades = active.reduce((s, i) => s + Number(i.relation.totalCopiedTrades), 0);

  const [stopSuccess, setStopSuccess] = useState<GenericSuccess | null>(null);
  const stopMut = useMutation({
    mutationFn: (id: number) => post(`/copy/relations/${id}/stop`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/copy/me/following"] });
      setStopSuccess({
        kind: "generic", iconKind: "p2p", accentColor: "#ef4444",
        title: "Copy Stopped",
        subtitle: "You've stopped copying this trader. Open positions remain as-is.",
        rows: [], primaryLabel: "Done",
      });
    },
  });

  return (
    <>
      <div className="grid grid-cols-4 gap-3">
        <PremiumStatCard title="Active follows"    value={String(active.length)}                                    icon={Users}      accent />
        <PremiumStatCard title="Trades copied"     value={String(totalTrades)}                                      icon={Activity} />
        <PremiumStatCard
          title="Total allocated"
          value={`${totalAlloc >= 1000 ? (totalAlloc / 1000).toFixed(1) + "k" : totalAlloc.toFixed(0)} USDT`}
          icon={DollarSign}
        />
        <PremiumStatCard
          title="Copy PnL"
          value={`${totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)} USDT`}
          icon={TrendingUp}
          accent={totalPnl > 0}
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => <div key={i} className="h-20 rounded-lg bg-muted/30 animate-pulse" />)}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Users}
          title="You are not following anyone"
          description="Browse the leaderboard to discover top traders and start copying their strategy."
        />
      ) : (
        <div className="space-y-2">
          {items.map((it) => (
            <div key={it.relation.id} className="rounded-xl border border-border bg-card/40 p-3.5">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/15 text-primary flex items-center justify-center font-bold flex-shrink-0">
                  {it.trader?.displayName?.[0]?.toUpperCase() ?? "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-sm">{it.trader?.displayName ?? "Trader"}</span>
                    <StatusPill variant={it.relation.status === "active" ? "success" : "neutral"}>
                      {it.relation.status}
                    </StatusPill>
                    {it.trader?.isVerified && (
                      <Badge className="bg-blue-500/15 text-blue-400 border-blue-500/30 text-[10px]">
                        <ShieldCheck className="h-2.5 w-2.5 mr-0.5" /> Verified
                      </Badge>
                    )}
                  </div>
                  <div className="mt-2 grid grid-cols-4 gap-2 text-[11px]">
                    <div>
                      <div className="text-muted-foreground text-[10px]">Allocation</div>
                      <div className="font-mono font-bold">${Number(it.relation.allocationUsd).toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-[10px]">Ratio</div>
                      <div className="font-mono font-bold">{Number(it.relation.copyRatio).toFixed(1)}×</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-[10px]">Max risk</div>
                      <div className="font-mono font-bold">{Number(it.relation.maxRiskPerTradePct).toFixed(0)}%</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-[10px]">Trades copied</div>
                      <div className="font-mono font-bold">{it.relation.totalCopiedTrades}</div>
                    </div>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className={`font-mono font-bold text-base ${Number(it.relation.totalPnlUsd) >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {Number(it.relation.totalPnlUsd) >= 0 ? "+" : ""}
                    {Number(it.relation.totalPnlUsd).toFixed(2)} USDT
                  </div>
                  <div className="text-[10px] text-muted-foreground">Copy PnL</div>
                  {it.relation.status === "active" && (
                    <Button
                      variant="ghost" size="sm"
                      className="h-7 text-xs text-rose-400 hover:text-rose-300 mt-1"
                      disabled={stopMut.isPending}
                      onClick={() => stopMut.mutate(it.relation.id)}
                    >
                      <X className="h-3 w-3 mr-1" /> Stop
                    </Button>
                  )}
                </div>
              </div>

              {/* Mini 30d sparkline for this trader */}
              {it.trader && (
                <div className="mt-3 pt-2.5 border-t border-border/40">
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
                    <span>Trader 30d performance</span>
                    <span className={Number(it.trader.pnl30dPct) >= 0 ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
                      {Number(it.trader.pnl30dPct) >= 0 ? "+" : ""}{Number(it.trader.pnl30dPct).toFixed(2)}%
                    </span>
                  </div>
                  <div className="h-8">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={buildSparkline(it.trader.id, Number(it.trader.pnl30dPct), it.trader.riskScore)}
                        margin={{ top: 1, right: 0, left: 0, bottom: 1 }}
                      >
                        <defs>
                          <linearGradient id={`fol-spark-${it.relation.id}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={Number(it.trader.pnl30dPct) >= 0 ? "#10b981" : "#f43f5e"} stopOpacity={0.25} />
                            <stop offset="95%" stopColor={Number(it.trader.pnl30dPct) >= 0 ? "#10b981" : "#f43f5e"} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <Area
                          type="monotone" dataKey="v"
                          stroke={Number(it.trader.pnl30dPct) >= 0 ? "#10b981" : "#f43f5e"}
                          strokeWidth={1.5}
                          fill={`url(#fol-spark-${it.relation.id})`}
                          dot={false} isAnimationActive={false}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <SuccessModal open={stopSuccess !== null} payload={stopSuccess} onClose={() => setStopSuccess(null)} />
    </>
  );
}

/* ─── Become trader tab ───────────────────────────────────────────────────── */
function BecomeTrader() {
  const qc = useQueryClient();
  const profileQ = useQuery({
    queryKey: ["/copy/me/profile"],
    queryFn: () => get<{ trader: Trader | null }>("/copy/me/profile"),
  });
  const existing = profileQ.data?.trader ?? null;

  if (profileQ.isLoading) {
    return <div className="h-32 rounded-xl bg-muted/30 animate-pulse" />;
  }

  return existing ? (
    <TraderProfileEditor trader={existing} onUpdated={() => qc.invalidateQueries({ queryKey: ["/copy/me/profile"] })} />
  ) : (
    <RegisterTrader onCreated={() => qc.invalidateQueries({ queryKey: ["/copy/me/profile"] })} />
  );
}

/* ─── Trader profile editor (already registered) ─────────────────────────── */
function StatBox({ label, value, icon: Icon, green }: { label: string; value: string; icon: React.ComponentType<{ className?: string }>; green?: boolean }) {
  return (
    <div className="rounded-lg border border-border/50 bg-muted/20 p-2.5">
      <div className="flex items-center gap-1.5 text-muted-foreground text-[10px] uppercase tracking-wider mb-1">
        <Icon className="h-3 w-3" />{label}
      </div>
      <div className={`font-bold font-mono text-sm ${green === true ? "text-emerald-400" : green === false ? "text-rose-400" : ""}`}>
        {value}
      </div>
    </div>
  );
}

function TraderProfileEditor({ trader, onUpdated }: { trader: Trader; onUpdated: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName]       = useState(trader.displayName);
  const [bio, setBio]         = useState(trader.bio ?? "");
  const [fee, setFee]         = useState(String(trader.performanceFeeBps / 100));
  const [tags, setTags]       = useState((trader.tags ?? []).join(", "));
  const [active, setActive]   = useState(trader.isActive);

  const updateMut = useMutation({
    mutationFn: () => patch("/copy/me", {
      displayName: name,
      bio,
      performanceFeeBps: Math.round(Number(fee) * 100),
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      isActive: active,
    }),
    onSuccess: () => { setEditing(false); onUpdated(); toast.success("Trader profile updated"); },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Update failed"),
  });

  const sparkData = useMemo(
    () => buildSparkline(trader.id, Number(trader.pnl30dPct), trader.riskScore),
    [trader.id, trader.pnl30dPct, trader.riskScore],
  );

  return (
    <SectionCard title="Your Trader Profile" description="You are registered as a copy trader. Followers can copy your trades automatically.">
      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <StatBox label="Followers" value={String(trader.followersCount)} icon={Users} />
        <StatBox label="AUM (USDT)" value={Number(trader.aumUsd).toLocaleString("en-US", { maximumFractionDigits: 0 })} icon={DollarSign} />
        <StatBox label="30d PnL" value={`${Number(trader.pnl30dPct) >= 0 ? "+" : ""}${Number(trader.pnl30dPct).toFixed(2)}%`} icon={TrendingUp} green={Number(trader.pnl30dPct) >= 0} />
        <StatBox label="Win Rate" value={`${Number(trader.winRatePct).toFixed(0)}%`} icon={Target} />
      </div>

      {/* Sparkline */}
      <div className="h-16 mb-4">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={sparkData} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
            <defs>
              <linearGradient id="my-spark" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area type="monotone" dataKey="v" stroke="#10b981" strokeWidth={2} fill="url(#my-spark)" dot={false} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Status badges + edit */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {trader.isVerified && (
          <Badge className="bg-blue-500/15 text-blue-400 border-blue-500/30 gap-1">
            <ShieldCheck className="h-3 w-3" /> Verified
          </Badge>
        )}
        <Badge variant={trader.isActive ? "default" : "outline"} className={trader.isActive ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" : ""}>
          {trader.isActive ? "Active" : "Paused"}
        </Badge>
        <Badge className={`${riskBg(trader.riskScore)} ${riskColor(trader.riskScore)} border text-[10px]`}>
          Risk {trader.riskScore}/10 — {riskLabel(trader.riskScore)}
        </Badge>
        <Button size="sm" variant="outline" className="ml-auto gap-1.5" onClick={() => setEditing(!editing)}>
          <Pencil className="h-3.5 w-3.5" /> {editing ? "Cancel" : "Edit profile"}
        </Button>
      </div>

      {!editing ? (
        <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-2.5 text-sm">
          {[
            { label: "Display name", value: trader.displayName },
            { label: "Bio",          value: trader.bio || "—" },
            { label: "Perf. fee",    value: `${(trader.performanceFeeBps / 100).toFixed(1)}% of profits` },
            { label: "Tags",         value: (trader.tags ?? []).join(", ") || "—" },
          ].map(({ label, value }) => (
            <div key={label}>
              <span className="text-muted-foreground text-[10px] uppercase tracking-wider">{label}</span>
              <div className="font-medium text-sm">{value}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3 max-w-lg">
          <div className="space-y-1.5">
            <Label className="text-xs">Display name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Bio</Label>
            <Textarea rows={3} value={bio} onChange={(e) => setBio(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Performance fee (%)</Label>
              <Input type="number" step="0.1" min="0" max="50" value={fee} onChange={(e) => setFee(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Status</Label>
              <Select value={active ? "active" : "paused"} onValueChange={(v) => setActive(v === "active")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active — followers copy</SelectItem>
                  <SelectItem value="paused">Paused — no new copies</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Tags (comma-separated)</Label>
            <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="BTC, Scalping, Momentum" />
          </div>
          <div className="flex gap-2">
            <Button onClick={() => updateMut.mutate()} disabled={updateMut.isPending} className="gap-1.5">
              {updateMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Save changes
            </Button>
            <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

/* ─── Register trader (first time) ─────────────────────────────────────────── */
function RegisterTrader({ onCreated }: { onCreated: () => void }) {
  const [name, setName]   = useState("");
  const [bio, setBio]     = useState("");
  const [fee, setFee]     = useState("10");
  const [tags, setTags]   = useState("");
  const [genericSuccess, setGenericSuccess] = useState<GenericSuccess | null>(null);

  const createMut = useMutation({
    mutationFn: () => post("/copy/become-trader", {
      displayName: name,
      bio,
      performanceFeeBps: Math.round(Number(fee) * 100),
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
    }),
    onSuccess: () => {
      setGenericSuccess({
        kind: "generic", iconKind: "p2p", accentColor: "#8b5cf6",
        title: "You're now a Copy Trader!",
        subtitle: "Your profile is live. Followers can now discover and copy your trades.",
        rows: [
          { label: "Display name",    value: name },
          { label: "Performance fee", value: `${fee}% of profits` },
        ],
        primaryLabel: "View My Profile",
      });
      onCreated();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Registration failed"),
  });

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Benefits */}
        <div className="rounded-xl border border-border bg-gradient-to-br from-primary/5 to-primary/10 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Crown className="h-5 w-5 text-primary" />
            <span className="font-bold">Become a Master Trader</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Publish your trading profile and earn performance fees every time your followers profit from copying you.
          </p>
          <div className="space-y-2.5">
            {[
              { icon: DollarSign,  title: "Earn performance fees",   desc: "Set your own fee — earn % of follower profits" },
              { icon: Users,       title: "Build a following",        desc: "Get discovered on the public leaderboard" },
              { icon: BarChart2,   title: "Verified badge available", desc: "Complete KYC + trading history for verification" },
              { icon: Zap,         title: "Auto execution",           desc: "Follower trades happen instantly when you trade" },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex items-start gap-2.5">
                <div className="h-6 w-6 rounded bg-primary/15 text-primary flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <div>
                  <div className="text-sm font-medium">{title}</div>
                  <div className="text-[11px] text-muted-foreground">{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Registration form */}
        <SectionCard title="Create Your Profile" description="Requires KYC Level 1. Takes 2 minutes.">
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Display name <span className="text-rose-400">*</span></Label>
              <Input
                value={name} onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Crypto Arjun"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Bio — tell followers about your strategy</Label>
              <Textarea
                rows={3} value={bio} onChange={(e) => setBio(e.target.value)}
                placeholder="I trade BTC momentum setups during Asian session with tight risk management…"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Performance fee (% of profits earned by followers)</Label>
              <Input
                type="number" step="0.5" min="0" max="50"
                value={fee} onChange={(e) => setFee(e.target.value)}
              />
              <p className="text-[10px] text-muted-foreground">
                Default: 10%. Competitive range: 5–20%. Max: 50%.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Tags (comma-separated) — helps users find you</Label>
              <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="BTC, Scalping, Swing, Low-risk" />
            </div>
            <Button
              className="w-full gap-2"
              onClick={() => createMut.mutate()}
              disabled={name.trim().length < 3 || createMut.isPending}
            >
              {createMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crown className="h-4 w-4" />}
              Publish trader profile
            </Button>
          </div>
        </SectionCard>
      </div>
      <SuccessModal open={genericSuccess !== null} payload={genericSuccess} onClose={() => setGenericSuccess(null)} />
    </>
  );
}
