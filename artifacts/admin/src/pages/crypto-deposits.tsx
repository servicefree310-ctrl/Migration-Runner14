import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, patch, post } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { SuccessModal, type GenericSuccess } from "@/components/SuccessModal";
import { PageHeader } from "@/components/premium/PageHeader";
import { PremiumStatCard } from "@/components/premium/PremiumStatCard";
import { StatusPill } from "@/components/premium/StatusPill";
import { EmptyState } from "@/components/premium/EmptyState";
import { PaginationBar, type PageSizeOption } from "@/components/premium/PaginationBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  Activity, RefreshCw, PlayCircle, PauseCircle, Search, Zap, ExternalLink, Loader2,
  CheckCircle2, XCircle, Clock, Wallet, AlertTriangle, Check, X, Coins, ArrowRightLeft, SkipForward,
} from "lucide-react";

type D = {
  id: number; uid?: string; userId: number; coinId: number; networkId: number; amount: string;
  address: string; fromAddress: string | null; txHash: string | null;
  blockNumber: number | null; logIndex: number | null;
  confirmations: number; requiredConfirmations: number;
  status: string; detectedBy: string; createdAt: string; processedAt: string | null;
  sweepStatus: string | null; sweepTxHash: string | null; sweptAt: string | null;
};
type Stats = {
  total: number; pending: number; completed: number; rejected: number;
  autoDetected: number; manual: number; totalAmount: number; pendingAmount: number;
};
type SweepResult = {
  networkId: number; networkName: string;
  scanned: { from: number; to: number } | null;
  detected: number; confirmed: number; errors: string[];
};
type SweeperStatus = {
  running: boolean; intervalMs: number;
  lastTickAt: number | null; nextTickAt: number | null;
  lastResults: SweepResult[];
  consecutiveErrors: Record<number, number>;
};
type Net = { id: number; name: string; chain: string; explorerUrl?: string | null; coinId: number };
type Coin = { id: number; symbol: string };

function fmt(n: string | number, dp = 8): string {
  const v = typeof n === "string" ? Number(n) : n;
  return Number.isFinite(v) ? v.toLocaleString("en-IN", { maximumFractionDigits: dp }) : "0";
}
function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function CryptoDepositsPage() {
  const { user: me } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const isAdmin = me?.role === "admin" || me?.role === "superadmin";

  const [tab, setTab] = useState("all");
  const [sourceTab, setSourceTab] = useState("all");
  const [search, setSearch] = useState("");
  const [approveFor, setApproveFor] = useState<D | null>(null);
  const [approveConf, setApproveConf] = useState("");
  const [rejectFor, setRejectFor] = useState<D | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSizeOption>(20);
  const [successData, setSuccessData] = useState<GenericSuccess | null>(null);

  useEffect(() => { if (approveFor) setApproveConf(String(approveFor.confirmations || approveFor.requiredConfirmations || 12)); }, [approveFor]);

  const { data: stats } = useQuery<Stats>({
    queryKey: ["/admin/crypto-deposits/stats"],
    queryFn: () => get<Stats>("/admin/crypto-deposits/stats"),
    refetchInterval: 5000,
  });
  const { data: sweeper } = useQuery<SweeperStatus>({
    queryKey: ["/admin/sweeper/status"],
    queryFn: () => get<SweeperStatus>("/admin/sweeper/status"),
    refetchInterval: 4000,
  });
  const { data: nets = [] } = useQuery<Net[]>({
    queryKey: ["/admin/networks"], queryFn: () => get<Net[]>("/admin/networks"),
  });
  const { data: coins = [] } = useQuery<Coin[]>({
    queryKey: ["/admin/coins"], queryFn: () => get<Coin[]>("/admin/coins"),
  });

  const qs = new URLSearchParams();
  if (tab !== "all") qs.set("status", tab);
  if (sourceTab !== "all") qs.set("detectedBy", sourceTab);
  const qsStr = qs.toString();
  const { data = [], refetch, isLoading, isFetching } = useQuery<D[]>({
    queryKey: ["/admin/crypto-deposits", tab, sourceTab],
    queryFn: () => get<D[]>(`/admin/crypto-deposits${qsStr ? `?${qsStr}` : ""}`),
    refetchInterval: 5000,
  });

  const inv = () => {
    qc.invalidateQueries({ queryKey: ["/admin/crypto-deposits"] });
    qc.invalidateQueries({ queryKey: ["/admin/crypto-deposits/stats"] });
  };

  const update = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) => patch(`/admin/crypto-deposits/${id}`, body),
    onSuccess: inv,
    onError: (e: Error) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });
  const scanAll = useMutation({
    mutationFn: () => post("/admin/sweeper/scan", {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/admin/sweeper/status"] }); inv(); toast({ title: "Scan triggered" }); },
    onError: (e: Error) => toast({ title: "Scan failed", description: e.message, variant: "destructive" }),
  });
  const startSweeper = useMutation({
    mutationFn: () => post("/admin/sweeper/start", { intervalMs: 30000 }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/admin/sweeper/status"] }); toast({ title: "Sweeper started" }); },
    onError: (e: Error) => toast({ title: "Start failed", description: e.message, variant: "destructive" }),
  });
  const stopSweeper = useMutation({
    mutationFn: () => post("/admin/sweeper/stop", {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/admin/sweeper/status"] }); toast({ title: "Sweeper stopped" }); },
    onError: (e: Error) => toast({ title: "Stop failed", description: e.message, variant: "destructive" }),
  });

  const netById = useMemo(() => new Map(nets.map((n) => [n.id, n])), [nets]);
  const coinById = useMemo(() => new Map(coins.map((c) => [c.id, c])), [coins]);

  const filtered = useMemo(() => {
    return data.filter((d) => {
      if (!search) return true;
      const hay = `${d.uid ?? ""} ${d.userId} ${d.txHash ?? ""} ${d.address} ${coinById.get(d.coinId)?.symbol ?? ""}`.toLowerCase();
      return hay.includes(search.toLowerCase());
    });
  }, [data, search, coinById]);

  useEffect(() => { setPage(1); }, [tab, sourceTab, search, pageSize]);
  const paged = useMemo(() => filtered.slice((page - 1) * pageSize, page * pageSize), [filtered, page, pageSize]);

  function explorerLink(d: D) {
    const n = netById.get(d.networkId);
    if (!n?.explorerUrl || !d.txHash) return null;
    return `${n.explorerUrl.replace(/\/$/, "")}/tx/${d.txHash}`;
  }

  const lastTickStr = sweeper?.lastTickAt
    ? `${Math.max(0, Math.round((Date.now() - sweeper.lastTickAt) / 1000))}s ago`
    : "never";

  const approve = () => {
    if (!approveFor) return;
    const row = approveFor;
    const coin = coinById.get(row.coinId)?.symbol ?? "?";
    update.mutate({ id: row.id, body: { status: "completed", confirmations: Number(approveConf) || row.requiredConfirmations } }, {
      onSuccess: () => {
        setApproveFor(null);
        setSuccessData({
          kind: "generic", iconKind: "deposit", accentColor: "#10b981",
          title: "Deposit Approved",
          subtitle: "Funds have been credited to user's wallet.",
          rows: [
            { label: "Amount", value: `${fmt(row.amount, 8)} ${coin}`, accent: "#10b981" },
            { label: "User", value: row.uid ?? `#${row.userId}` },
            { label: "Tx Hash", value: row.txHash ? row.txHash.slice(0, 14) + "…" : "Manual" },
            { label: "Status", value: "Credited", accent: "#10b981" },
          ],
        });
      },
    });
  };
  const reject = () => {
    if (!rejectFor) return;
    const row = rejectFor;
    const coin = coinById.get(row.coinId)?.symbol ?? "?";
    update.mutate({ id: row.id, body: { status: "rejected" } }, {
      onSuccess: () => {
        setRejectFor(null);
        setSuccessData({
          kind: "generic", iconKind: "deposit", accentColor: "#ef4444",
          title: "Deposit Rejected",
          subtitle: "Transaction marked as rejected.",
          rows: [
            { label: "Amount", value: `${fmt(row.amount, 8)} ${coin}`, accent: "#ef4444" },
            { label: "User", value: row.uid ?? `#${row.userId}` },
            { label: "Status", value: "Rejected", accent: "#ef4444" },
          ],
        });
      },
    });
  };

  return (
    <>
    <div className="space-y-6">
      <PageHeader
        eyebrow="Treasury"
        title="Crypto Deposits"
        description="On-chain deposits — the auto-sweeper scans EVM networks and credits funds after the required confirmations. Manual deposits are verified by an admin."
        actions={
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} data-testid="button-refresh">
            <RefreshCw className={cn("w-4 h-4 mr-1.5", isFetching && "animate-spin")} />Refresh
          </Button>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 md:gap-4">
        <PremiumStatCard title="Pending" value={stats?.pending ?? 0} icon={Clock} hero hint={`${fmt(stats?.pendingAmount ?? 0, 4)} awaiting`} />
        <PremiumStatCard title="Completed" value={stats?.completed ?? 0} icon={CheckCircle2} hint="Credited to users" />
        <PremiumStatCard title="Rejected" value={stats?.rejected ?? 0} icon={XCircle} hint="Manually denied" />
        <PremiumStatCard title="Auto-Detected" value={stats?.autoDetected ?? 0} icon={Zap} hint="Sweeper found" />
        <PremiumStatCard title="Total Volume" value={fmt(stats?.totalAmount ?? 0, 4)} icon={Wallet} hint="All-time credited" />
        <PremiumStatCard title="Total Deposits" value={stats?.total ?? 0} icon={Coins} hint="All statuses" />
      </div>

      {/* Sweeper Panel */}
      <div className="premium-card rounded-xl border border-border/60 p-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className={cn("p-2.5 rounded-lg border", sweeper?.running
              ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
              : "bg-zinc-500/15 text-zinc-400 border-zinc-500/30")}>
              <Activity className={cn("h-5 w-5", sweeper?.running && "animate-pulse")} />
            </div>
            <div>
              <div className="font-semibold flex items-center gap-2">
                Auto Deposit Sweeper
                <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium border",
                  sweeper?.running
                    ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                    : "bg-muted/40 text-muted-foreground border-border/60")}>
                  {sweeper?.running ? "RUNNING" : "STOPPED"}
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                Last scan: <span className="text-foreground">{lastTickStr}</span> ·
                Interval: <span className="text-foreground">{(sweeper?.intervalMs ?? 30000) / 1000}s</span> ·
                Networks: <span className="text-foreground">{sweeper?.lastResults?.length ?? 0}</span>
              </div>
            </div>
          </div>
          {isAdmin && (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => scanAll.mutate()} disabled={scanAll.isPending} data-testid="button-scan-now">
                <RefreshCw className={cn("h-4 w-4 mr-1.5", scanAll.isPending && "animate-spin")} />Scan Now
              </Button>
              {sweeper?.running ? (
                <Button size="sm" variant="destructive" onClick={() => stopSweeper.mutate()} disabled={stopSweeper.isPending} data-testid="button-stop-sweeper">
                  <PauseCircle className="h-4 w-4 mr-1.5" />Stop
                </Button>
              ) : (
                <Button size="sm" onClick={() => startSweeper.mutate()} disabled={startSweeper.isPending} data-testid="button-start-sweeper">
                  <PlayCircle className="h-4 w-4 mr-1.5" />Start
                </Button>
              )}
            </div>
          )}
        </div>

        {sweeper?.lastResults && sweeper.lastResults.length > 0 && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {sweeper.lastResults.map((r) => (
              <div key={r.networkId} className="rounded-lg border border-border/60 bg-muted/20 p-2.5">
                <div className="font-semibold text-xs flex items-center gap-1.5">
                  <Zap className="h-3 w-3 text-primary" />{r.networkName}
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  {r.scanned ? `Blocks ${r.scanned.from}–${r.scanned.to}` : "No new blocks"}
                </div>
                <div className="flex items-center gap-3 mt-1.5 text-[11px]">
                  <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-blue-400" />Detected: <b>{r.detected}</b></span>
                  <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />Credited: <b>{r.confirmed}</b></span>
                </div>
                {r.errors.length > 0 && (
                  <div className="text-[11px] text-destructive mt-1.5 truncate flex items-center gap-1" title={r.errors.join("; ")}>
                    <AlertTriangle className="w-3 h-3 shrink-0" />{r.errors[0]}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex flex-wrap gap-3 items-center">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="all" data-testid="tab-all">All</TabsTrigger>
              <TabsTrigger value="pending" data-testid="tab-pending">Pending</TabsTrigger>
              <TabsTrigger value="completed" data-testid="tab-completed">Completed</TabsTrigger>
              <TabsTrigger value="rejected" data-testid="tab-rejected">Rejected</TabsTrigger>
            </TabsList>
          </Tabs>
          <Tabs value={sourceTab} onValueChange={setSourceTab}>
            <TabsList>
              <TabsTrigger value="all" data-testid="tab-source-all">All sources</TabsTrigger>
              <TabsTrigger value="sweeper" data-testid="tab-source-sweeper">Auto</TabsTrigger>
              <TabsTrigger value="manual" data-testid="tab-source-manual">Manual</TabsTrigger>
              <TabsTrigger value="user_claim" data-testid="tab-source-user-claim" className="text-amber-300 data-[state=active]:text-amber-200">
                User Claims {stats && stats.pending > 0 && sourceTab !== "user_claim" ? "" : ""}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input
            placeholder="UID, user, tx, address, coin…" value={search} onChange={(e) => setSearch(e.target.value)}
            className="pl-8" data-testid="input-search"
          />
        </div>
      </div>

      <div className="premium-card rounded-xl overflow-hidden border border-border/60">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-3 pl-5">UID</th>
                <th className="text-left font-medium px-4 py-3">User</th>
                <th className="text-left font-medium px-4 py-3">Coin / Network</th>
                <th className="text-right font-medium px-4 py-3">Amount</th>
                <th className="text-left font-medium px-4 py-3">Address</th>
                <th className="text-left font-medium px-4 py-3">Tx Hash</th>
                <th className="text-left font-medium px-4 py-3">Confirms</th>
                <th className="text-left font-medium px-4 py-3">Status</th>
                <th className="text-left font-medium px-4 py-3">Sweep</th>
                <th className="text-left font-medium px-4 py-3">Source</th>
                <th className="text-left font-medium px-4 py-3">Date</th>
                {isAdmin && <th className="text-right font-medium px-4 py-3 pr-5">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {isLoading && Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}><td className="px-4 py-3" colSpan={isAdmin ? 12 : 11}><Skeleton className="h-9 w-full" /></td></tr>
              ))}
              {!isLoading && filtered.length === 0 && (
                <tr><td colSpan={isAdmin ? 12 : 11} className="px-4 py-3">
                  <EmptyState icon={Coins} title="No deposits"
                    description={search || tab !== "all" || sourceTab !== "all" ? "Try adjusting your filters." : "Deposits detected by the sweeper will appear here after it runs."} />
                </td></tr>
              )}
              {!isLoading && paged.map((d) => {
                const link = explorerLink(d);
                const c = coinById.get(d.coinId);
                const n = netById.get(d.networkId);
                const confPct = d.requiredConfirmations > 0 ? Math.min(100, (d.confirmations / d.requiredConfirmations) * 100) : 0;
                return (
                  <tr key={d.id} className="hover:bg-muted/20 transition-colors" data-testid={`row-deposit-${d.id}`}>
                    <td className="px-4 py-3 pl-5 font-mono text-[10px] text-muted-foreground" title={d.uid}>{(d.uid ?? "").slice(0, 10)}…</td>
                    <td className="px-4 py-3 text-xs">#{d.userId}</td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-xs">{c?.symbol ?? `#${d.coinId}`}</div>
                      <div className="text-[10px] text-muted-foreground">{n ? `${n.name} · ${n.chain}` : `#${d.networkId}`}</div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold">{fmt(d.amount, 8)}</td>
                    <td className="px-4 py-3 font-mono text-[11px] truncate max-w-[140px]" title={d.address}>{d.address}</td>
                    <td className="px-4 py-3 font-mono text-[11px]">
                      {d.txHash ? (
                        <a href={link || "#"} target="_blank" rel="noreferrer" className="hover:underline inline-flex items-center gap-1 text-blue-400">
                          {d.txHash.slice(0, 8)}…{d.txHash.slice(-6)}
                          {link && <ExternalLink className="h-3 w-3" />}
                        </a>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="tabular-nums text-[11px]">{d.confirmations}/{d.requiredConfirmations}</span>
                        <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className={cn("h-full transition-all", confPct >= 100 ? "bg-emerald-500" : "bg-blue-500")} style={{ width: `${confPct}%` }} />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3"><StatusPill status={d.status} /></td>
                    <td className="px-4 py-3">
                      {d.sweepStatus ? (
                        <a
                          href={d.sweepTxHash && netById.get(d.networkId)?.explorerUrl
                            ? `${netById.get(d.networkId)!.explorerUrl!.replace(/\/$/, "")}/tx/${d.sweepTxHash}`
                            : undefined}
                          target="_blank" rel="noreferrer"
                          title={d.sweepTxHash ? `Tx: ${d.sweepTxHash}` : undefined}
                          className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium border inline-flex items-center gap-1",
                            d.sweepStatus === "swept" && "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
                            d.sweepStatus === "sweeping" && "bg-blue-500/15 text-blue-300 border-blue-500/30 animate-pulse",
                            d.sweepStatus === "pending" && "bg-amber-500/15 text-amber-300 border-amber-500/30",
                            d.sweepStatus === "failed" && "bg-red-500/15 text-red-300 border-red-500/30",
                            d.sweepStatus === "skipped" && "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
                          )}>
                          {d.sweepStatus === "swept" && <ArrowRightLeft className="w-3 h-3" />}
                          {d.sweepStatus === "skipped" && <SkipForward className="w-3 h-3" />}
                          {d.sweepStatus.toUpperCase()}
                          {d.sweepTxHash && <ExternalLink className="w-2.5 h-2.5 ml-0.5" />}
                        </a>
                      ) : (
                        <span className="text-muted-foreground text-[10px]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium border inline-flex items-center gap-1",
                        d.detectedBy === "sweeper" ? "bg-blue-500/15 text-blue-300 border-blue-500/30"
                        : d.detectedBy === "user_claim" ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                        : "bg-muted/40 border-border/60")}>
                        {d.detectedBy === "sweeper" && <Zap className="w-3 h-3" />}
                        {d.detectedBy === "user_claim" && <AlertTriangle className="w-3 h-3" />}
                        {d.detectedBy === "sweeper" ? "AUTO" : d.detectedBy === "user_claim" ? "USER CLAIM" : "MANUAL"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground" title={new Date(d.createdAt).toLocaleString("en-IN")}>{relTime(d.createdAt)}</td>
                    {isAdmin && (
                      <td className="px-4 py-3 pr-4 text-right whitespace-nowrap space-x-1">
                        {d.status === "pending" && (
                          <>
                            <Button size="sm" onClick={() => setApproveFor(d)} data-testid={`button-approve-${d.id}`}>
                              <Check className="w-3.5 h-3.5 mr-1" />Approve
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setRejectFor(d)} data-testid={`button-reject-${d.id}`}>
                              <X className="w-3.5 h-3.5 text-destructive" />
                            </Button>
                          </>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <PaginationBar page={page} pageSize={pageSize} total={filtered.length} onPage={setPage} onPageSize={setPageSize} label="deposits" />
      </div>

      <Dialog open={!!approveFor} onOpenChange={(o) => !o && setApproveFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-emerald-400" />Approve crypto deposit</DialogTitle>
            <DialogDescription>The amount will be credited to the user's wallet. Verify the on-chain confirmations before approving.</DialogDescription>
          </DialogHeader>
          {approveFor && (
            <div className="space-y-3">
              <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-sm space-y-1">
                <div><span className="text-muted-foreground">User:</span> #{approveFor.userId}</div>
                <div><span className="text-muted-foreground">Coin:</span> {coinById.get(approveFor.coinId)?.symbol} on {netById.get(approveFor.networkId)?.chain}</div>
                <div><span className="text-muted-foreground">Amount:</span> <span className="font-semibold">{fmt(approveFor.amount, 8)}</span></div>
                <div className="break-all text-xs"><span className="text-muted-foreground">Tx:</span> <span className="font-mono">{approveFor.txHash || "—"}</span></div>
              </div>
              <div>
                <Label className="text-xs">Confirmations on chain</Label>
                <Input value={approveConf} onChange={(e) => setApproveConf(e.target.value)} type="number" data-testid="input-confirmations" />
                <div className="text-[11px] text-muted-foreground mt-1">Required: {approveFor.requiredConfirmations}</div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveFor(null)}>Cancel</Button>
            <Button onClick={approve} disabled={update.isPending} data-testid="button-confirm-approve">
              {update.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Check className="w-4 h-4 mr-1.5" />}
              Approve & credit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!rejectFor} onOpenChange={(o) => !o && setRejectFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-destructive" />Reject crypto deposit</DialogTitle>
            <DialogDescription>This deposit will not be credited. The user will be notified of the rejection.</DialogDescription>
          </DialogHeader>
          {rejectFor && (
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-sm space-y-1">
              <div><span className="text-muted-foreground">User:</span> #{rejectFor.userId}</div>
              <div><span className="text-muted-foreground">Amount:</span> {fmt(rejectFor.amount, 8)} {coinById.get(rejectFor.coinId)?.symbol}</div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectFor(null)}>Cancel</Button>
            <Button variant="destructive" onClick={reject} disabled={update.isPending} data-testid="button-confirm-reject">
              {update.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <X className="w-4 h-4 mr-1.5" />}
              Reject deposit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    <SuccessModal open={successData !== null} payload={successData} onClose={() => setSuccessData(null)} />
    </>
  );
}
