import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/premium/PageHeader";
import { PremiumStatCard } from "@/components/premium/PremiumStatCard";
import { StatusPill } from "@/components/premium/StatusPill";
import { EmptyState } from "@/components/premium/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  TrendingUp, TrendingDown, Search, RefreshCw, Zap, Loader2,
  Activity, Wallet, Flame, ShieldAlert,
} from "lucide-react";

type Pos = {
  id: number; uid: string; userId: number; pairId: number; side: string; leverage: number;
  qty: string; entryPrice: string; markPrice: string; marginAmount: string; marginType: string;
  unrealizedPnl: string; liquidationPrice: string; status: string;
  openedAt: string; closedAt: string | null; closeReason: string | null; realizedPnl: string;
};
type Pair = { id: number; symbol: string };

function fmt(n: string | number, dp = 4): string {
  const v = typeof n === "string" ? Number(n) : n;
  return Number.isFinite(v) ? v.toLocaleString("en-IN", { maximumFractionDigits: dp }) : "0";
}

export default function FuturesPositionsPage() {
  const { user: me } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const isAdmin = me?.role === "admin" || me?.role === "superadmin";

  const [tab, setTab] = useState("open");
  const [search, setSearch] = useState("");
  const [liquidateFor, setLiquidateFor] = useState<Pos | null>(null);

  const { data: positions = [], refetch, isLoading, isFetching } = useQuery<Pos[]>({
    queryKey: ["/admin/futures-positions", tab],
    queryFn: () => get<Pos[]>(`/admin/futures-positions?status=${tab}`),
    refetchInterval: 5000,
  });
  const { data: openAll = [] } = useQuery<Pos[]>({
    queryKey: ["/admin/futures-positions", "open"],
    queryFn: () => get<Pos[]>("/admin/futures-positions?status=open"),
    refetchInterval: 5000,
    enabled: tab !== "open",
  });
  const { data: pairs = [] } = useQuery<Pair[]>({ queryKey: ["/admin/pairs"], queryFn: () => get<Pair[]>("/admin/pairs") });
  const pairMap = useMemo(() => new Map(pairs.map((p) => [p.id, p.symbol])), [pairs]);

  const liquidate = useMutation({
    mutationFn: (id: number) => post(`/admin/futures-positions/${id}/liquidate`, {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/admin/futures-positions"] }); setLiquidateFor(null); toast({ title: "Position liquidated" }); },
    onError: (e: Error) => toast({ title: "Liquidation failed", description: e.message, variant: "destructive" }),
  });
  const runRisk = useMutation({
    mutationFn: () => post<{ checked: number; liquidated: number; nearLiquidation: number }>("/admin/futures-engine/run-risk", {}),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["/admin/futures-positions"] });
      toast({ title: "Risk check complete", description: `${r.checked} checked · ${r.liquidated} liquidated · ${r.nearLiquidation} near` });
    },
    onError: (e: Error) => toast({ title: "Risk check failed", description: e.message, variant: "destructive" }),
  });

  const filtered = useMemo(() => {
    return positions.filter((p) => {
      if (!search) return true;
      const hay = `${p.uid} ${p.userId} ${pairMap.get(p.pairId) ?? ""}`.toLowerCase();
      return hay.includes(search.toLowerCase());
    });
  }, [positions, search, pairMap]);

  const openSource = tab === "open" ? positions : openAll;
  const openPositions = openSource.filter((p) => p.status === "open");
  const totalNotional = openPositions.reduce((s, p) => s + Number(p.entryPrice) * Number(p.qty), 0);
  const totalPnl = openPositions.reduce((s, p) => s + Number(p.unrealizedPnl), 0);
  const totalMargin = openPositions.reduce((s, p) => s + Number(p.marginAmount), 0);
  const longCount = openPositions.filter((p) => p.side === "long").length;
  const shortCount = openPositions.filter((p) => p.side === "short").length;
  const nearLiq = openPositions.filter((p) => {
    const mark = Number(p.markPrice);
    const liq = Number(p.liquidationPrice);
    if (!mark || !liq) return false;
    return Math.abs(mark - liq) / mark < 0.05;
  }).length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Markets & Trading"
        title="Futures Positions"
        description="Open positions, leverage exposure, and near-liquidation alerts in one dashboard. Force-liquidate or run a risk check instantly."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} data-testid="button-refresh-pos">
              <RefreshCw className={cn("w-4 h-4 mr-1.5", isFetching && "animate-spin")} />Refresh
            </Button>
            {isAdmin && (
              <Button size="sm" onClick={() => runRisk.mutate()} disabled={runRisk.isPending} data-testid="button-run-risk">
                {runRisk.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Zap className="w-4 h-4 mr-1.5" />}
                Run risk check
              </Button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 md:gap-4">
        <PremiumStatCard title="Open Positions" value={openPositions.length} icon={Activity} hero hint={`${longCount} long · ${shortCount} short`} />
        <PremiumStatCard title="Total Notional" value={fmt(totalNotional, 0) + " USDT"} prefix="" icon={TrendingUp} hint="Open exposure" />
        <PremiumStatCard title="Total Margin" value={fmt(totalMargin, 0) + " USDT"} prefix="" icon={Wallet} hint="Locked collateral" />
        <PremiumStatCard
          title="Total uPnL"
          value={(totalPnl >= 0 ? "+" : "-") + fmt(Math.abs(totalPnl), 2) + " USDT"} prefix=""
          icon={totalPnl >= 0 ? TrendingUp : TrendingDown}
          hint={totalPnl >= 0 ? "House loss exposure" : "House profit exposure"}
        />
        <PremiumStatCard title="Near Liquidation" value={nearLiq} icon={Flame} hint="<5% buffer" />
        <PremiumStatCard title="Long / Short" value={`${longCount}/${shortCount}`} icon={ShieldAlert} hint="Open side balance" />
      </div>

      <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
        <Tabs value={tab} onValueChange={setTab} className="w-full md:w-auto">
          <TabsList className="overflow-x-auto">
            <TabsTrigger value="open" data-testid="tab-pos-open">Open <span className="ml-1.5 text-xs text-muted-foreground">{tab === "open" ? positions.length : ""}</span></TabsTrigger>
            <TabsTrigger value="liquidated" data-testid="tab-pos-liquidated">Liquidated</TabsTrigger>
            <TabsTrigger value="closed" data-testid="tab-pos-closed">Closed</TabsTrigger>
            <TabsTrigger value="all" data-testid="tab-pos-all">All</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative md:w-80">
          <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search UID, user, pair…" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="input-search-pos" />
        </div>
      </div>

      <div className="premium-card rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-3">UID / User</th>
                <th className="text-left font-medium px-4 py-3">Pair</th>
                <th className="text-left font-medium px-4 py-3">Side</th>
                <th className="text-right font-medium px-4 py-3">Lev</th>
                <th className="text-right font-medium px-4 py-3">Qty</th>
                <th className="text-right font-medium px-4 py-3">Entry</th>
                <th className="text-right font-medium px-4 py-3">Mark</th>
                <th className="text-right font-medium px-4 py-3">Liq Price</th>
                <th className="text-right font-medium px-4 py-3">Margin</th>
                <th className="text-right font-medium px-4 py-3">uPnL</th>
                <th className="text-left font-medium px-4 py-3">Status</th>
                {isAdmin && <th className="text-right font-medium px-4 py-3 pr-5">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {isLoading && Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}><td className="px-4 py-3" colSpan={isAdmin ? 12 : 11}><Skeleton className="h-9 w-full" /></td></tr>
              ))}
              {!isLoading && filtered.length === 0 && (
                <tr><td colSpan={isAdmin ? 12 : 11} className="px-4 py-3">
                  <EmptyState icon={TrendingUp} title="No positions" description={search ? "Try adjusting your search." : `No ${tab} positions found.`} />
                </td></tr>
              )}
              {!isLoading && filtered.map((p) => {
                const pnl = Number(p.unrealizedPnl);
                const mark = Number(p.markPrice);
                const liq = Number(p.liquidationPrice);
                const dist = mark && liq ? Math.abs(mark - liq) / mark : 1;
                const isNear = p.status === "open" && dist < 0.05;
                return (
                  <tr key={p.id} className={cn("hover:bg-muted/20 transition-colors", isNear && "bg-red-500/[0.06]")} data-testid={`pos-${p.id}`}>
                    <td className="px-4 py-3">
                      <div className="font-mono text-[11px] text-muted-foreground" title={p.uid}>{p.uid.slice(0, 10)}…</div>
                      <div className="text-xs">user-{p.userId}</div>
                    </td>
                    <td className="px-4 py-3 font-bold">{pairMap.get(p.pairId) ?? `#${p.pairId}`}</td>
                    <td className="px-4 py-3">
                      {p.side === "long"
                        ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/25"><TrendingUp className="w-3 h-3" />long</span>
                        : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-red-500/15 text-red-300 border border-red-500/30"><TrendingDown className="w-3 h-3" />short</span>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-xs">
                      <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold",
                        p.leverage >= 50 ? "bg-red-500/20 text-red-300" : p.leverage >= 20 ? "bg-amber-500/20 text-amber-300" : "bg-muted/40 text-muted-foreground")}>
                        {p.leverage}x
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-xs">{fmt(p.qty, 6)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-xs">{fmt(p.entryPrice, 4)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-xs">{fmt(p.markPrice, 4)}</td>
                    <td className={cn("px-4 py-3 text-right tabular-nums text-xs", isNear && "text-red-300 font-bold")}>
                      {fmt(p.liquidationPrice, 4)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-xs">${fmt(p.marginAmount, 2)}</td>
                    <td className={cn("px-4 py-3 text-right tabular-nums font-bold", pnl >= 0 ? "text-emerald-400" : "text-red-400")}>
                      {pnl >= 0 ? "+" : ""}${fmt(pnl, 2)}
                    </td>
                    <td className="px-4 py-3">
                      {p.status === "open" && (isNear
                        ? <StatusPill variant="danger">⚠ near liq</StatusPill>
                        : <StatusPill variant="success">Open</StatusPill>)}
                      {p.status === "liquidated" && <StatusPill variant="danger">Liquidated</StatusPill>}
                      {p.status === "closed" && <StatusPill variant="neutral">Closed</StatusPill>}
                      {p.closeReason && <div className="text-[10px] text-muted-foreground mt-1 max-w-[140px] truncate" title={p.closeReason}>{p.closeReason}</div>}
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3 pr-4 text-right">
                        {p.status === "open" && (
                          <Button size="sm" variant="destructive" onClick={() => setLiquidateFor(p)} data-testid={`button-liq-${p.id}`}>
                            <Flame className="w-3.5 h-3.5 mr-1" />Liquidate
                          </Button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="border-t border-border/60 px-4 py-2.5 flex items-center justify-between text-xs text-muted-foreground bg-muted/10">
          <div>{filtered.length} positions in {tab}</div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1"><Flame className="w-3 h-3 text-red-400" /> {nearLiq} near liq</span>
            <span className="inline-flex items-center gap-1"><Wallet className="w-3 h-3" /> ${fmt(totalMargin, 0)} locked</span>
          </div>
        </div>
      </div>

      <Dialog open={!!liquidateFor} onOpenChange={(o) => { if (!o) setLiquidateFor(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Flame className="w-5 h-5 text-red-400" />Force liquidate position</DialogTitle>
            <DialogDescription>
              {liquidateFor && (
                <>Force-liquidate position <strong className="text-foreground">#{liquidateFor.id}</strong> ({pairMap.get(liquidateFor.pairId)} {liquidateFor.side} {liquidateFor.leverage}x)? The user's margin will be forfeited.</>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLiquidateFor(null)}>Cancel</Button>
            <Button variant="destructive" disabled={liquidate.isPending} onClick={() => liquidateFor && liquidate.mutate(liquidateFor.id)} data-testid="button-confirm-liquidate">
              {liquidate.isPending && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}<Flame className="w-4 h-4 mr-1.5" />Liquidate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
