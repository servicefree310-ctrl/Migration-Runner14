import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Crown, Users, DollarSign, TrendingUp, ShieldCheck, ShieldOff,
  Power, PowerOff, Loader2, RefreshCw, BadgeCheck, Search,
  BarChart2, Trophy, Target,
} from "lucide-react";
import { get, patch } from "@/lib/api";
import { PageHeader } from "@/components/premium/PageHeader";
import { PremiumStatCard } from "@/components/premium/PremiumStatCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

type TraderRow = {
  trader: {
    id: number; userId: number; displayName: string; bio: string;
    isVerified: boolean; isActive: boolean;
    followersCount: number; aumUsd: string;
    pnl30dPct: string; pnlAllTimePct: string;
    winRatePct: string; totalTrades: number;
    performanceFeeBps: number; maxDrawdownPct: string;
    tags: string[]; createdAt: string;
  };
  user: { id: number; email: string; name: string } | null;
};

type Stats = {
  totalTraders: number; activeTraders: number;
  totalFollowers: number; totalAum: string; activeRelations: number;
};

export default function CopyTradingAdminPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");

  const statsQ = useQuery<Stats>({
    queryKey: ["/admin/copy/stats"],
    queryFn: () => get<Stats>("/admin/copy/stats"),
    refetchInterval: 30_000,
  });

  const tradersQ = useQuery<{ items: TraderRow[] }>({
    queryKey: ["/admin/copy/traders"],
    queryFn: () => get<{ items: TraderRow[] }>("/admin/copy/traders"),
    refetchInterval: 30_000,
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { isVerified?: boolean; isActive?: boolean } }) =>
      patch(`/admin/copy/traders/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/admin/copy/traders"] });
      qc.invalidateQueries({ queryKey: ["/admin/copy/stats"] });
      toast.success("Trader profile updated");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Update failed"),
  });

  const stats   = statsQ.data;
  const traders = (tradersQ.data?.items ?? []).filter((r) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      r.trader.displayName.toLowerCase().includes(q) ||
      r.user?.email?.toLowerCase().includes(q) ||
      r.user?.name?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Copy Trading"
        title="Trader Management"
        description="Review, verify, and manage all copy trader profiles on the platform."
        actions={
          <Button variant="outline" size="sm" onClick={() => { tradersQ.refetch(); statsQ.refetch(); }}>
            <RefreshCw className={`h-4 w-4 mr-2 ${tradersQ.isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <PremiumStatCard
          title="Total Traders"
          value={stats ? String(stats.totalTraders) : "—"}
          icon={Crown}
          loading={statsQ.isLoading}
        />
        <PremiumStatCard
          title="Active"
          value={stats ? String(stats.activeTraders) : "—"}
          icon={Trophy}
          accent
          loading={statsQ.isLoading}
        />
        <PremiumStatCard
          title="Total Followers"
          value={stats ? String(stats.totalFollowers) : "—"}
          icon={Users}
          loading={statsQ.isLoading}
        />
        <PremiumStatCard
          title="Active Relations"
          value={stats ? String(stats.activeRelations) : "—"}
          icon={BarChart2}
          loading={statsQ.isLoading}
        />
        <PremiumStatCard
          title="Total AUM"
          value={stats ? `${Number(stats.totalAum).toLocaleString("en-US", { maximumFractionDigits: 0 })} USDT` : "—"}
          icon={DollarSign}
          loading={statsQ.isLoading}
        />
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Search traders by name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 border-b border-border text-xs text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Trader</th>
                <th className="text-left px-4 py-3 font-medium">User</th>
                <th className="text-right px-4 py-3 font-medium">Followers</th>
                <th className="text-right px-4 py-3 font-medium">AUM (USDT)</th>
                <th className="text-right px-4 py-3 font-medium">30d PnL</th>
                <th className="text-right px-4 py-3 font-medium">Win Rate</th>
                <th className="text-right px-4 py-3 font-medium">Fee</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-right px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tradersQ.isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-border/50">
                    {Array.from({ length: 9 }).map((__, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-muted/40 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : traders.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">
                    {search ? "No traders match your search." : "No trader profiles found."}
                  </td>
                </tr>
              ) : (
                traders.map((row) => {
                  const t      = row.trader;
                  const pnl30  = Number(t.pnl30dPct);
                  const win    = Number(t.winRatePct);
                  const aum    = Number(t.aumUsd);
                  return (
                    <tr key={t.id} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-full bg-amber-500/15 border border-amber-500/20 flex items-center justify-center font-bold text-amber-400 text-sm flex-shrink-0">
                            {t.displayName[0]?.toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold flex items-center gap-1.5 flex-wrap">
                              {t.displayName}
                              {t.isVerified && (
                                <Badge className="bg-blue-500/15 text-blue-400 border-blue-500/30 text-[10px] gap-0.5 px-1.5">
                                  <BadgeCheck className="h-2.5 w-2.5" /> Verified
                                </Badge>
                              )}
                            </div>
                            {t.tags?.length > 0 && (
                              <div className="text-[10px] text-muted-foreground">
                                {t.tags.slice(0, 3).join(", ")}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-xs">{row.user?.name || "—"}</div>
                        <div className="text-[10px] text-muted-foreground">{row.user?.email || "—"}</div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{t.followersCount}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-mono">
                        {aum >= 1000 ? `${(aum / 1000).toFixed(1)}k` : aum.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        <span className={pnl30 >= 0 ? "text-emerald-400 font-medium" : "text-rose-400 font-medium"}>
                          {pnl30 >= 0 ? "+" : ""}{pnl30.toFixed(2)}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{win.toFixed(0)}%</td>
                      <td className="px-4 py-3 text-right tabular-nums text-xs">
                        {(t.performanceFeeBps / 100).toFixed(1)}%
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 flex-wrap">
                          <Badge variant={t.isActive ? "default" : "outline"} className={`text-[10px] ${t.isActive ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" : "text-muted-foreground"}`}>
                            {t.isActive ? "Active" : "Paused"}
                          </Badge>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center gap-1 justify-end">
                          <Button
                            size="sm"
                            variant="outline"
                            className={`h-7 text-[11px] gap-1 ${t.isVerified ? "text-blue-400 border-blue-500/30" : ""}`}
                            onClick={() => updateMut.mutate({ id: t.id, data: { isVerified: !t.isVerified } })}
                            disabled={updateMut.isPending}
                            title={t.isVerified ? "Revoke verification" : "Verify this trader"}
                          >
                            {t.isVerified
                              ? <><ShieldOff className="h-3 w-3" /> Unverify</>
                              : <><ShieldCheck className="h-3 w-3" /> Verify</>}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className={`h-7 text-[11px] gap-1 ${!t.isActive ? "text-emerald-400 border-emerald-500/30" : "text-rose-400 border-rose-500/30"}`}
                            onClick={() => updateMut.mutate({ id: t.id, data: { isActive: !t.isActive } })}
                            disabled={updateMut.isPending}
                            title={t.isActive ? "Deactivate profile" : "Reactivate profile"}
                          >
                            {t.isActive
                              ? <><PowerOff className="h-3 w-3" /> Pause</>
                              : <><Power className="h-3 w-3" /> Activate</>}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="text-xs text-muted-foreground text-right">
        {traders.length} trader{traders.length !== 1 ? "s" : ""} shown
        {search && " (filtered)"}
      </div>
    </div>
  );
}
