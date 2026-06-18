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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  Search, Send, X, Check, RefreshCw, Wallet, AlertCircle, Clock, Loader2,
  CheckCircle2, XCircle, Zap, Copy, Flame, Coins, Network, AlertTriangle,
  Activity,
} from "lucide-react";

type W = {
  id: number; uid?: string; userId: number; coinId: number; networkId: number;
  amount: string; fee: string; toAddress: string; memo: string | null;
  txHash: string | null; status: string; rejectReason: string | null;
  confirmations?: number; broadcastedAt?: string | null;
  createdAt: string; processedAt: string | null;
};
type NetMeta = { confirmations?: number };
type Coin = { id: number; symbol: string; name?: string };
type Net = {
  id: number; name: string; chain: string; coinId: number;
  autoSendSupported: boolean; hotWalletConfigured: boolean; rpcConfigured: boolean; isEvm: boolean;
  minWithdraw: string; withdrawFee: string; withdrawEnabled: boolean;
} & NetMeta;
type Stats = {
  pending: number; completed: number; rejected: number;
  today: number; todayVolume: number; totalLocked: number;
};
type HotBal = { native: string; token?: string; address: string; chain: string; symbol: string };

function fmt(n: number | string, dp = 4): string {
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

export default function CryptoWithdrawalsPage() {
  const { user: me } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const isAdmin = me?.role === "admin" || me?.role === "superadmin";

  const { data = [], refetch, isLoading, isFetching } = useQuery<W[]>({
    queryKey: ["/admin/crypto-withdrawals"],
    queryFn: () => get<W[]>("/admin/crypto-withdrawals"),
    refetchInterval: 15000,
  });
  const { data: stats } = useQuery<Stats>({
    queryKey: ["/admin/crypto-withdrawals/stats"],
    queryFn: () => get<Stats>("/admin/crypto-withdrawals/stats"),
    refetchInterval: 15000,
  });
  const { data: coins = [] } = useQuery<Coin[]>({
    queryKey: ["/admin/coins"], queryFn: () => get<Coin[]>("/admin/coins"),
  });
  const { data: networks = [] } = useQuery<Net[]>({
    queryKey: ["/admin/networks/auto-send-supported"],
    queryFn: () => get<Net[]>("/admin/networks/auto-send-supported"),
  });

  const coinMap = useMemo(() => new Map(coins.map((c) => [c.id, c])), [coins]);
  const netMap = useMemo(() => new Map(networks.map((n) => [n.id, n])), [networks]);

  const [tab, setTab] = useState("withdrawals");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [coinFilter, setCoinFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSizeOption>(20);
  const [successData, setSuccessData] = useState<GenericSuccess | null>(null);

  const inv = () => {
    qc.invalidateQueries({ queryKey: ["/admin/crypto-withdrawals"] });
    qc.invalidateQueries({ queryKey: ["/admin/crypto-withdrawals/stats"] });
  };

  const update = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) => patch(`/admin/crypto-withdrawals/${id}`, body),
    onSuccess: inv,
    onError: (e: Error) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });
  const autoSend = useMutation({
    mutationFn: (id: number) => post<{ ok: boolean; txHash: string }>(`/admin/crypto-withdrawals/${id}/auto-send`, {}),
    onSuccess: () => { inv(); toast({ title: "Broadcast started", description: "Transaction signed & broadcast." }); },
    onError: (e: Error) => toast({ title: "Auto-send failed", description: e.message, variant: "destructive" }),
  });

  const [actionRow, setActionRow] = useState<W | null>(null);
  const [actionMode, setActionMode] = useState<"manual" | "reject" | "auto" | null>(null);
  const [txHash, setTxHash] = useState("");
  const [reason, setReason] = useState("");
  const [hotBalNet, setHotBalNet] = useState<number | null>(null);

  useEffect(() => { if (actionRow) { setTxHash(""); setReason(""); } }, [actionRow]);

  const { data: hotBal, isFetching: balFetching, refetch: refetchBal } = useQuery<HotBal>({
    queryKey: ["/admin/networks", hotBalNet, "hot-wallet"],
    queryFn: () => get<HotBal>(`/admin/networks/${hotBalNet}/hot-wallet`),
    enabled: hotBalNet != null,
    retry: false,
  });

  const filtered = useMemo(() => {
    return data.filter((w) => {
      if (statusFilter !== "all" && w.status !== statusFilter) return false;
      if (coinFilter !== "all" && String(w.coinId) !== coinFilter) return false;
      if (search) {
        const hay = `${w.uid ?? ""} ${w.userId} ${w.toAddress} ${w.txHash ?? ""}`.toLowerCase();
        if (!hay.includes(search.toLowerCase())) return false;
      }
      return true;
    });
  }, [data, statusFilter, coinFilter, search]);

  useEffect(() => { setPage(1); }, [statusFilter, coinFilter, search, pageSize]);
  const paged = useMemo(() => filtered.slice((page - 1) * pageSize, page * pageSize), [filtered, page, pageSize]);

  const pendingTotalByCoin = useMemo(() => {
    const m = new Map<string, number>();
    data.filter((w) => w.status === "pending").forEach((w) => {
      const sym = coinMap.get(w.coinId)?.symbol ?? `#${w.coinId}`;
      m.set(sym, (m.get(sym) ?? 0) + Number(w.amount));
    });
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [data, coinMap]);

  const closeAction = () => { setActionRow(null); setActionMode(null); setTxHash(""); setReason(""); };

  const submitAction = () => {
    if (!actionRow || !actionMode) return;
    const coin = coinMap.get(actionRow.coinId)?.symbol ?? "?";
    if (actionMode === "manual") {
      update.mutate(
        { id: actionRow.id, body: { status: "completed", txHash: txHash.trim() || null } },
        { onSuccess: () => {
          closeAction();
          setSuccessData({
            kind: "generic", iconKind: "withdraw", accentColor: "#10b981",
            title: "Withdrawal Processed",
            subtitle: "Transaction marked as sent successfully.",
            rows: [
              { label: "Amount", value: `${actionRow.amount} ${coin}` },
              { label: "To Address", value: actionRow.toAddress.slice(0, 12) + "…" },
              ...(txHash.trim() ? [{ label: "Tx Hash", value: txHash.trim().slice(0, 16) + "…" }] : []),
              { label: "Status", value: "Completed", accent: "#10b981" },
            ],
          });
        } },
      );
    } else if (actionMode === "reject") {
      if (!reason.trim()) return;
      update.mutate(
        { id: actionRow.id, body: { status: "rejected", rejectReason: reason.trim() } },
        { onSuccess: () => {
          closeAction();
          setSuccessData({
            kind: "generic", iconKind: "withdraw", accentColor: "#ef4444",
            title: "Withdrawal Rejected",
            subtitle: "Funds have been refunded to user's wallet.",
            rows: [
              { label: "Amount", value: `${actionRow.amount} ${coin}`, accent: "#ef4444" },
              { label: "User", value: actionRow.uid ?? `#${actionRow.userId}` },
              { label: "Reason", value: reason.trim() },
            ],
          });
        } },
      );
    } else if (actionMode === "auto") {
      autoSend.mutate(actionRow.id, { onSuccess: () => {
        closeAction();
        toast({ title: "Broadcast started", description: "Transaction signed & broadcast." });
      } });
    }
  };

  return (
    <>
    <div className="space-y-6">
      <PageHeader
        eyebrow="Treasury"
        title="Crypto Withdrawals"
        description="On-chain payouts — auto-send signs and broadcasts from EVM hot wallets. Rejected withdrawals return funds to the user's balance."
        actions={
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} data-testid="button-refresh-withdrawals">
            <RefreshCw className={cn("w-4 h-4 mr-1.5", isFetching && "animate-spin")} />Refresh
          </Button>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 md:gap-4">
        <PremiumStatCard title="Pending" value={fmt(stats?.pending ?? 0, 0)} icon={Clock} hero hint={`${fmt(stats?.totalLocked ?? 0, 4)} locked`} />
        <PremiumStatCard title="Completed" value={fmt(stats?.completed ?? 0, 0)} icon={CheckCircle2} hint="All-time sent" />
        <PremiumStatCard title="Rejected" value={fmt(stats?.rejected ?? 0, 0)} icon={XCircle} hint="Refunded to users" />
        <PremiumStatCard title="Today" value={fmt(stats?.today ?? 0, 0)} icon={Activity} hint={`${fmt(stats?.todayVolume ?? 0, 4)} volume`} />
        <PremiumStatCard title="Hot Wallets" value={networks.filter((n) => n.autoSendSupported).length} icon={Flame} hint={`${networks.length} networks`} />
        <PremiumStatCard title="Locked Coins" value={pendingTotalByCoin.length} icon={Coins} hint="Distinct symbols" />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="withdrawals" data-testid="tab-withdrawals">Withdrawals ({stats?.pending ?? 0})</TabsTrigger>
          <TabsTrigger value="hot-wallets" data-testid="tab-hot-wallets">Hot Wallets ({networks.length})</TabsTrigger>
          <TabsTrigger value="locked" data-testid="tab-locked">Locked by Coin ({pendingTotalByCoin.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="withdrawals" className="space-y-4 mt-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40" data-testid="filter-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="broadcasting">Broadcasting</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
              <Select value={coinFilter} onValueChange={setCoinFilter}>
                <SelectTrigger className="w-32" data-testid="filter-coin"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All coins</SelectItem>
                  {coins.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.symbol}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="relative w-full md:w-72">
              <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
              <Input placeholder="UID, user, address, tx…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" data-testid="input-search" />
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
                    <th className="text-left font-medium px-4 py-3">To Address</th>
                    <th className="text-left font-medium px-4 py-3">Tx Hash</th>
                    <th className="text-left font-medium px-4 py-3">Status</th>
                    <th className="text-left font-medium px-4 py-3">Date</th>
                    {isAdmin && <th className="text-right font-medium px-4 py-3 pr-5">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {isLoading && Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}><td className="px-4 py-3" colSpan={isAdmin ? 9 : 8}><Skeleton className="h-9 w-full" /></td></tr>
                  ))}
                  {!isLoading && filtered.length === 0 && (
                    <tr><td colSpan={isAdmin ? 9 : 8} className="px-4 py-3">
                      <EmptyState icon={Send} title="No withdrawals match"
                        description={search || statusFilter !== "all" || coinFilter !== "all" ? "Try adjusting your filters." : "No crypto withdrawal requests have been submitted yet."} />
                    </td></tr>
                  )}
                  {!isLoading && paged.map((w) => {
                    const coin = coinMap.get(w.coinId);
                    const net = netMap.get(w.networkId);
                    return (
                      <tr key={w.id} className="hover:bg-muted/20 transition-colors" data-testid={`row-w-${w.id}`}>
                        <td className="px-4 py-3 pl-5 font-mono text-[10px] text-muted-foreground" title={w.uid}>{(w.uid ?? "").slice(0, 10)}…</td>
                        <td className="px-4 py-3 text-xs">#{w.userId}</td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-xs">{coin?.symbol ?? `#${w.coinId}`}</div>
                          <div className="text-[10px] text-muted-foreground">{net?.name ?? `net-${w.networkId}`} · {net?.chain ?? ""}</div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="font-mono tabular-nums font-semibold">{fmt(w.amount, 8)}</div>
                          <div className="text-[10px] text-muted-foreground">fee {fmt(w.fee, 8)}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 max-w-[180px]">
                            <span className="font-mono text-[11px] truncate" title={w.toAddress}>{w.toAddress}</span>
                            <button type="button" onClick={() => navigator.clipboard.writeText(w.toAddress)} className="opacity-50 hover:opacity-100 shrink-0">
                              <Copy className="w-3 h-3" />
                            </button>
                          </div>
                          {w.memo && <div className="text-[10px] text-muted-foreground">memo: {w.memo}</div>}
                        </td>
                        <td className="px-4 py-3">
                          {w.txHash ? (
                            <div className="flex items-center gap-1 max-w-[160px]">
                              <span className="font-mono text-[11px] truncate" title={w.txHash}>{w.txHash.slice(0, 12)}…</span>
                              <button type="button" onClick={() => navigator.clipboard.writeText(w.txHash!)} className="opacity-50 hover:opacity-100 shrink-0">
                                <Copy className="w-3 h-3" />
                              </button>
                            </div>
                          ) : <span className="text-[11px] text-muted-foreground">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <StatusPill status={w.status} />
                          {w.status === "broadcasting" && (
                            <div className="text-[10px] text-primary mt-1 flex items-center gap-1">
                              <Zap className="w-3 h-3 animate-pulse" />{w.confirmations ?? 0} / {net?.confirmations ?? 15} confirms
                            </div>
                          )}
                          {w.status === "rejected" && w.rejectReason && (
                            <div className="text-[10px] text-destructive mt-1 max-w-[140px] truncate" title={w.rejectReason}>{w.rejectReason}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground" title={new Date(w.createdAt).toLocaleString("en-IN")}>{relTime(w.createdAt)}</td>
                        {isAdmin && (
                          <td className="px-4 py-3 pr-4 text-right whitespace-nowrap space-x-1">
                            {w.status === "pending" && (
                              <>
                                {net?.autoSendSupported && (
                                  <Button size="sm" onClick={() => { setActionRow(w); setActionMode("auto"); }} data-testid={`button-auto-${w.id}`}>
                                    <Zap className="w-3 h-3 mr-1" />Auto
                                  </Button>
                                )}
                                <Button size="sm" variant="outline" onClick={() => { setActionRow(w); setActionMode("manual"); }} data-testid={`button-manual-${w.id}`}>
                                  <Check className="w-3 h-3 mr-1" />Sent
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => { setActionRow(w); setActionMode("reject"); }} data-testid={`button-reject-${w.id}`}>
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
            <PaginationBar page={page} pageSize={pageSize} total={filtered.length} onPage={setPage} onPageSize={setPageSize} label="withdrawals" />
          </div>
        </TabsContent>

        <TabsContent value="hot-wallets" className="space-y-3 mt-4">
          <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground flex items-start gap-2">
            <Flame className="w-4 h-4 text-orange-400 mt-0.5 shrink-0" />
            <div>
              Hot wallets are configured from the <a href="/admin/networks" className="underline text-foreground">Networks</a> page. Auto-send works on EVM chains (ETH, BSC, Polygon, Arbitrum, Optimism, Base, AVAX) when both a hot wallet and RPC are configured.
            </div>
          </div>
          <div className="premium-card rounded-xl overflow-hidden border border-border/60">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-[11px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left font-medium px-4 py-3 pl-5">Network</th>
                    <th className="text-left font-medium px-4 py-3">Chain</th>
                    <th className="text-left font-medium px-4 py-3">Coin</th>
                    <th className="text-right font-medium px-4 py-3">Min Withdraw</th>
                    <th className="text-right font-medium px-4 py-3">Fee</th>
                    <th className="text-center font-medium px-4 py-3">Withdraw</th>
                    <th className="text-center font-medium px-4 py-3">Hot Wallet</th>
                    <th className="text-center font-medium px-4 py-3">RPC</th>
                    <th className="text-left font-medium px-4 py-3">Auto Send</th>
                    <th className="text-right font-medium px-4 py-3 pr-5">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {networks.length === 0 && (
                    <tr><td colSpan={10} className="px-4 py-3">
                      <EmptyState icon={Network} title="No networks configured"
                        description="Add chains from the Networks page, then attach a hot wallet to enable auto-send." />
                    </td></tr>
                  )}
                  {networks.map((n) => (
                    <tr key={n.id} className="hover:bg-muted/20 transition-colors" data-testid={`row-net-${n.id}`}>
                      <td className="px-4 py-3 pl-5 font-semibold">{n.name}</td>
                      <td className="px-4 py-3">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted/40 border border-border/60">{n.chain}</span>
                      </td>
                      <td className="px-4 py-3 text-xs">{coinMap.get(n.coinId)?.symbol ?? `#${n.coinId}`}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-xs">{fmt(n.minWithdraw, 8)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-xs">{fmt(n.withdrawFee, 8)}</td>
                      <td className="px-4 py-3 text-center">
                        {n.withdrawEnabled ? <Check className="w-4 h-4 text-emerald-400 mx-auto" /> : <X className="w-4 h-4 text-destructive mx-auto" />}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {n.hotWalletConfigured ? <Check className="w-4 h-4 text-emerald-400 mx-auto" /> : <X className="w-4 h-4 text-muted-foreground mx-auto" />}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {n.rpcConfigured ? <Check className="w-4 h-4 text-emerald-400 mx-auto" /> : <X className="w-4 h-4 text-muted-foreground mx-auto" />}
                      </td>
                      <td className="px-4 py-3">
                        {n.autoSendSupported ? (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/25 inline-flex items-center gap-1">
                            <Zap className="w-3 h-3" />Ready
                          </span>
                        ) : n.isEvm ? (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/15 text-amber-300 border border-amber-500/30">Setup needed</span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted/40 border border-border/60">Manual only</span>
                        )}
                      </td>
                      <td className="px-4 py-3 pr-4 text-right">
                        {n.autoSendSupported && (
                          <Button size="sm" variant="outline" onClick={() => setHotBalNet(n.id)} data-testid={`button-bal-${n.id}`}>
                            <Wallet className="w-3 h-3 mr-1" />Check
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="locked" className="mt-4">
          <div className="premium-card rounded-xl overflow-hidden border border-border/60">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-[11px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left font-medium px-4 py-3 pl-5">Coin</th>
                    <th className="text-right font-medium px-4 py-3 pr-5">Total Locked (Pending)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {pendingTotalByCoin.length === 0 && (
                    <tr><td colSpan={2} className="px-4 py-3">
                      <EmptyState icon={Coins} title="No locked coins" description="No pending withdrawals are currently locked." />
                    </td></tr>
                  )}
                  {pendingTotalByCoin.map(([sym, total]) => (
                    <tr key={sym} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 pl-5 font-semibold">{sym}</td>
                      <td className="px-4 py-3 pr-4 text-right font-mono tabular-nums">{fmt(total, 8)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Action dialog */}
      <Dialog open={!!actionRow} onOpenChange={(o) => { if (!o) closeAction(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {actionMode === "auto" && <><Zap className="w-5 h-5 text-primary" />Auto-Send Withdrawal</>}
              {actionMode === "manual" && <><CheckCircle2 className="w-5 h-5 text-emerald-400" />Mark as Sent (Manual)</>}
              {actionMode === "reject" && <><AlertTriangle className="w-5 h-5 text-destructive" />Reject Withdrawal</>}
            </DialogTitle>
            <DialogDescription>
              {actionMode === "auto" && "The hot wallet will sign and broadcast the transaction on-chain. The locked balance will be deducted."}
              {actionMode === "manual" && "Already broadcast the transaction externally? Confirm it here. Optionally provide the transaction hash."}
              {actionMode === "reject" && "The user's locked funds will be returned to their available balance. A reason is required."}
            </DialogDescription>
          </DialogHeader>
          {actionRow && (
            <div className="space-y-3 text-sm">
              <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-xs space-y-1">
                <div><span className="text-muted-foreground">UID:</span> <span className="font-mono">{actionRow.uid}</span></div>
                <div><span className="text-muted-foreground">User:</span> #{actionRow.userId}</div>
                <div><span className="text-muted-foreground">Coin:</span> {coinMap.get(actionRow.coinId)?.symbol} on {netMap.get(actionRow.networkId)?.chain}</div>
                <div><span className="text-muted-foreground">Amount:</span> <span className="font-mono">{fmt(actionRow.amount, 8)}</span> (fee {fmt(actionRow.fee, 8)})</div>
                <div className="break-all"><span className="text-muted-foreground">To:</span> <span className="font-mono">{actionRow.toAddress}</span></div>
              </div>
              {actionMode === "auto" && (
                <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 text-xs flex items-start gap-2">
                  <Flame className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <div>
                    <div className="font-semibold mb-0.5">Hot wallet broadcast</div>
                    <div className="text-muted-foreground">Transaction immediately sign + broadcast hogi. Status broadcasting ho jayega.</div>
                  </div>
                </div>
              )}
              {autoSend.error && actionMode === "auto" && (
                <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive flex items-start gap-2">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />{(autoSend.error as Error).message}
                </div>
              )}
              {actionMode === "manual" && (
                <div>
                  <Label className="text-xs">Tx hash (optional)</Label>
                  <Input value={txHash} onChange={(e) => setTxHash(e.target.value)} placeholder="0x…" data-testid="input-txhash" />
                  <div className="text-[11px] text-muted-foreground mt-1">If broadcast via an external tool, paste the transaction hash here.</div>
                </div>
              )}
              {actionMode === "reject" && (
                <div>
                  <Label className="text-xs">Reject reason *</Label>
                  <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3}
                    placeholder="Suspicious destination / AML hit / KYC mismatch…" data-testid="input-reason" />
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={closeAction}>Cancel</Button>
            <Button
              variant={actionMode === "reject" ? "destructive" : "default"}
              onClick={submitAction}
              disabled={update.isPending || autoSend.isPending || (actionMode === "reject" && !reason.trim())}
              data-testid="button-submit-action"
            >
              {(update.isPending || autoSend.isPending) ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
              {actionMode === "auto" ? "Broadcast Now" : actionMode === "manual" ? "Confirm Sent" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Hot wallet balance dialog */}
      <Dialog open={hotBalNet != null} onOpenChange={(o) => { if (!o) setHotBalNet(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Flame className="w-5 h-5 text-orange-400" />Hot Wallet Balance</DialogTitle>
            <DialogDescription>Live RPC query — shows current gas and token balances for this hot wallet.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            {balFetching && (
              <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />Querying RPC…
              </div>
            )}
            {!balFetching && hotBal && (
              <div className="space-y-2">
                <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-xs space-y-1">
                  <div><span className="text-muted-foreground">Chain:</span> {hotBal.chain}</div>
                  <div className="break-all"><span className="text-muted-foreground">Address:</span> <span className="font-mono">{hotBal.address}</span></div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Native ({hotBal.chain})</div>
                    <div className="text-lg font-bold font-mono mt-0.5">{fmt(hotBal.native, 6)}</div>
                  </div>
                  {hotBal.token != null && (
                    <div className="rounded-lg border border-primary/40 bg-primary/5 p-3">
                      <div className="text-[10px] uppercase tracking-wider text-primary">Token ({hotBal.symbol})</div>
                      <div className="text-lg font-bold font-mono mt-0.5">{fmt(hotBal.token, 6)}</div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => refetchBal()} disabled={balFetching}>
              <RefreshCw className={cn("w-3.5 h-3.5 mr-1.5", balFetching && "animate-spin")} />Refresh
            </Button>
            <Button onClick={() => setHotBalNet(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    <SuccessModal open={successData !== null} payload={successData} onClose={() => setSuccessData(null)} />
    </>
  );
}
