import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post, ApiError } from "@/lib/api";
import { PaginationBar, type PageSizeOption } from "@/components/premium/PaginationBar";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/premium/PageHeader";
import { PremiumStatCard } from "@/components/premium/PremiumStatCard";
import { StatusPill } from "@/components/premium/StatusPill";
import { EmptyState } from "@/components/premium/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import {
  ArrowDownUp, Activity, Bot as BotIcon, User as UserIcon, TrendingUp, TrendingDown,
  CheckCircle2, XCircle, Clock, Filter, RefreshCw, BarChart3, Ban, Loader2,
} from "lucide-react";

type Order = {
  id: number; userId: number; pairId: number; side: "buy" | "sell"; type: string;
  price: string; qty: string; filledQty: string; avgPrice: string;
  fee: string; tds: string; status: string; isBot: number; botId: number | null;
  createdAt: string; uid?: string;
};
type Trade = { id: number; orderId: number; userId: number; pairId: number; side: string; price: string; qty: string; createdAt: string; uid?: string };
type Pair = { id: number; symbol: string };
type Stats = {
  total: number; open_count: number; filled_count: number; cancelled_count: number;
  buy_count: number; sell_count: number; bot_count: number; user_count: number;
  bot_filled: number; user_filled: number; filled_value: string;
};

function fmt(n: string | number, dp = 4): string {
  const v = typeof n === "string" ? Number(n) : n;
  return Number.isFinite(v) ? v.toLocaleString("en-US", { maximumFractionDigits: dp }) : "0";
}

function relTime(s: string): string {
  const diff = Date.now() - new Date(s).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function OrdersPage() {
  const [tab, setTab] = useState("orders");
  const [side, setSide] = useState("all");
  const [status, setStatus] = useState("all");
  const [actor, setActor] = useState("all");
  const [pairId, setPairId] = useState("all");
  const [userIdFilter, setUserIdFilter] = useState("");
  // Force-cancel state — only one order can be in the confirm dialog at a time
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [ordersPage, setOrdersPage] = useState(1);
  const [ordersPageSize, setOrdersPageSize] = useState<PageSizeOption>(20);
  const [tradesPage, setTradesPage] = useState(1);
  const [tradesPageSize, setTradesPageSize] = useState<PageSizeOption>(20);
  const { user: me } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const canCancel = me?.role === "admin" || me?.role === "superadmin";

  const { data: pairs = [] } = useQuery<Pair[]>({ queryKey: ["pairs"], queryFn: () => get<Pair[]>("/admin/pairs") });
  const { data: stats } = useQuery<Stats>({ queryKey: ["orders-stats"], queryFn: () => get<Stats>("/admin/orders/stats"), refetchInterval: 5000 });

  const params = new URLSearchParams();
  if (side !== "all") params.set("side", side);
  if (status !== "all") params.set("status", status);
  if (actor === "bot") params.set("isBot", "1");
  if (actor === "user") params.set("isBot", "0");
  if (pairId !== "all") params.set("pairId", pairId);
  if (userIdFilter.trim()) params.set("userId", userIdFilter.trim());
  const qs = params.toString();

  const { data: orders = [], isLoading: ordersLoading, refetch: refetchOrders, isFetching: ordersFetching } = useQuery<Order[]>({
    queryKey: ["admin-orders", qs], queryFn: () => get<Order[]>(`/admin/orders${qs ? `?${qs}` : ""}`),
    refetchInterval: 4000,
  });
  const { data: trades = [], isLoading: tradesLoading } = useQuery<Trade[]>({
    queryKey: ["admin-trades", pairId, userIdFilter, side],
    queryFn: () => {
      const tp = new URLSearchParams();
      if (pairId !== "all") tp.set("pairId", pairId);
      if (userIdFilter.trim()) tp.set("userId", userIdFilter.trim());
      if (side !== "all") tp.set("side", side);
      const t = tp.toString();
      return get<Trade[]>(`/admin/trades${t ? `?${t}` : ""}`);
    },
    refetchInterval: 4000,
  });

  const pairById = useMemo(() => new Map(pairs.map((p) => [p.id, p.symbol])), [pairs]);
  const filledValue = stats ? Number(stats.filled_value).toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "0";

  const pagedOrders = useMemo(
    () => orders.slice((ordersPage - 1) * ordersPageSize, ordersPage * ordersPageSize),
    [orders, ordersPage, ordersPageSize],
  );
  const pagedTrades = useMemo(
    () => trades.slice((tradesPage - 1) * tradesPageSize, tradesPage * tradesPageSize),
    [trades, tradesPage, tradesPageSize],
  );

  // Force-cancel mutation — admin-only on backend, but we still gate the UI
  // by role to avoid showing a button that always 403s. Invalidate orders +
  // stats on success so the UI reflects the change without waiting for the
  // 4s poll. On error, surface the API message in a toast.
  const cancelMut = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      post<{ id: number; status: string }>(`/admin/orders/${id}/cancel`, { reason }),
    onSuccess: (_d, vars) => {
      toast({ title: "Order cancelled", description: `Order #${vars.id} force-cancelled. Wallet balance released.` });
      void qc.invalidateQueries({ queryKey: ["admin-orders"] });
      void qc.invalidateQueries({ queryKey: ["orders-stats"] });
      setCancelTarget(null);
      setCancelReason("");
    },
    onError: (err: unknown) => {
      const msg = err instanceof ApiError ? err.message : "Failed to cancel order";
      toast({ variant: "destructive", title: "Cancel failed", description: msg });
    },
  });

  const reset = () => { setSide("all"); setStatus("all"); setActor("all"); setPairId("all"); setUserIdFilter(""); };
  const hasFilters = side !== "all" || status !== "all" || actor !== "all" || pairId !== "all" || userIdFilter.trim() !== "";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Markets & Trading"
        title="Orders & Trades"
        description="Live platform orders and executed trades. Filter by side, status, actor (user/bot), pair, or user ID."
        actions={
          <Button variant="outline" size="sm" onClick={() => refetchOrders()} disabled={ordersFetching} data-testid="button-refresh-orders">
            <RefreshCw className={cn("w-4 h-4 mr-1.5", ordersFetching && "animate-spin")} />Refresh
          </Button>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 md:gap-4">
        <PremiumStatCard title="Total Orders" value={stats?.total ?? "—"} icon={Activity} hero hint={`${stats?.cancelled_count ?? 0} cancelled`} />
        <PremiumStatCard title="Open" value={stats?.open_count ?? "—"} icon={Clock} hint="Resting on book" />
        <PremiumStatCard title="Filled" value={stats?.filled_count ?? "—"} icon={CheckCircle2} hint={`Vol ≈ ${filledValue}`} />
        <PremiumStatCard title="Buy / Sell" value={stats ? `${stats.buy_count}/${stats.sell_count}` : "—"} icon={ArrowDownUp} hint="Side balance" />
        <PremiumStatCard title="Bot Filled" value={stats?.bot_filled ?? "—"} icon={BotIcon} hint={`of ${stats?.bot_count ?? 0} bot orders`} />
        <PremiumStatCard title="User Filled" value={stats?.user_filled ?? "—"} icon={UserIcon} hint={`of ${stats?.user_count ?? 0} user orders`} />
      </div>

      {/* Filters card */}
      <div className="premium-card rounded-xl overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 md:px-5 pt-4 pb-3 border-b border-border/60">
          <div className="flex items-center gap-2.5">
            <div className="stat-orb w-8 h-8 rounded-md flex items-center justify-center"><Filter className="w-4 h-4 text-amber-300" /></div>
            <div>
              <h3 className="text-sm font-semibold">Filters</h3>
              <p className="text-xs text-muted-foreground">Combine multiple filters to narrow results</p>
            </div>
          </div>
          {hasFilters && <Button size="sm" variant="ghost" onClick={reset} data-testid="button-reset-filters">Reset</Button>}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 p-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Side</Label>
            <Select value={side} onValueChange={setSide}>
              <SelectTrigger data-testid="select-orders-side"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sides</SelectItem>
                <SelectItem value="buy">Buy only</SelectItem>
                <SelectItem value="sell">Sell only</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger data-testid="select-orders-status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="filled">Filled</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Actor</Label>
            <Select value={actor} onValueChange={setActor}>
              <SelectTrigger data-testid="select-orders-actor"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="user">User orders</SelectItem>
                <SelectItem value="bot">Bot orders</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Pair</Label>
            <Select value={pairId} onValueChange={setPairId}>
              <SelectTrigger data-testid="select-orders-pair"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All pairs</SelectItem>
                {pairs.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.symbol}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">User ID</Label>
            <Input placeholder="e.g. 2" value={userIdFilter} onChange={(e) => setUserIdFilter(e.target.value)} data-testid="input-orders-userid" />
          </div>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="orders" data-testid="tab-orders">Orders <span className="ml-1.5 text-xs text-muted-foreground">{orders.length}</span></TabsTrigger>
          <TabsTrigger value="trades" data-testid="tab-trades">Trade History <span className="ml-1.5 text-xs text-muted-foreground">{trades.length}</span></TabsTrigger>
        </TabsList>

        <TabsContent value="orders" className="mt-3">
          <div className="premium-card rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left font-medium px-4 py-3">UID</th>
                    <th className="text-left font-medium px-4 py-3">Pair</th>
                    <th className="text-left font-medium px-4 py-3">Side</th>
                    <th className="text-left font-medium px-4 py-3">Type</th>
                    <th className="text-right font-medium px-4 py-3">Price</th>
                    <th className="text-right font-medium px-4 py-3">Qty</th>
                    <th className="text-right font-medium px-4 py-3">Filled</th>
                    <th className="text-left font-medium px-4 py-3">Status</th>
                    <th className="text-left font-medium px-4 py-3">Actor</th>
                    <th className="text-left font-medium px-4 py-3">User</th>
                    <th className="text-left font-medium px-4 py-3">Time</th>
                    {canCancel && <th className="text-right font-medium px-4 py-3">Action</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {ordersLoading && Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}><td colSpan={canCancel ? 12 : 11} className="px-4 py-3"><Skeleton className="h-9 w-full" /></td></tr>
                  ))}
                  {!ordersLoading && orders.length === 0 && (
                    <tr><td colSpan={canCancel ? 12 : 11} className="px-4 py-3"><EmptyState icon={ArrowDownUp} title="No orders" description="Try adjusting your filters or wait for new trades." /></td></tr>
                  )}
                  {!ordersLoading && pagedOrders.map((o) => (
                    <tr key={o.id} className="hover:bg-muted/20 transition-colors" data-testid={`order-${o.id}`}>
                      <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground" title={o.uid}>{(o.uid || `#${o.id}`).slice(0, 10)}…</td>
                      <td className="px-4 py-3 font-mono font-bold">{pairById.get(o.pairId) ?? `#${o.pairId}`}</td>
                      <td className="px-4 py-3">
                        {o.side === "buy"
                          ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/25"><TrendingUp className="w-3 h-3" />BUY</span>
                          : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-red-500/15 text-red-300 border border-red-500/30"><TrendingDown className="w-3 h-3" />SELL</span>}
                      </td>
                      <td className="px-4 py-3 uppercase text-xs text-muted-foreground">{o.type}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-xs">{fmt(o.price, 8)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-xs">{Number(o.qty).toFixed(4)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-xs">
                        {Number(o.filledQty).toFixed(4)}
                        {Number(o.avgPrice) > 0 && <div className="text-[10px] text-muted-foreground">@{Number(o.avgPrice).toFixed(4)}</div>}
                      </td>
                      <td className="px-4 py-3">
                        {o.status === "filled" && <StatusPill variant="success">Filled</StatusPill>}
                        {o.status === "open" && <StatusPill variant="info">Open</StatusPill>}
                        {o.status === "cancelled" && <StatusPill variant="neutral">Cancelled</StatusPill>}
                        {o.status === "partial" && <StatusPill variant="warning">Partial</StatusPill>}
                      </td>
                      <td className="px-4 py-3">
                        {o.isBot
                          ? <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-violet-500/15 text-violet-300 border border-violet-500/30"><BotIcon className="w-2.5 h-2.5" />Bot{o.botId ? `#${o.botId}` : ""}</span>
                          : <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/15 text-amber-300 border border-amber-500/30"><UserIcon className="w-2.5 h-2.5" />User</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">#{o.userId}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground" title={new Date(o.createdAt).toLocaleString("en-IN")}>{relTime(o.createdAt)}</td>
                      {canCancel && (
                        <td className="px-4 py-3 text-right">
                          {(o.status === "open" || o.status === "partial") ? (
                            <Button
                              size="sm" variant="outline"
                              className="h-7 px-2 text-[11px] text-red-300 border-red-500/40 hover:bg-red-500/15"
                              onClick={() => { setCancelTarget(o); setCancelReason(""); }}
                              data-testid={`button-force-cancel-${o.id}`}
                            >
                              <Ban className="w-3 h-3 mr-1" /> Cancel
                            </Button>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">—</span>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PaginationBar
              page={ordersPage}
              pageSize={ordersPageSize}
              total={orders.length}
              onPage={setOrdersPage}
              onPageSize={setOrdersPageSize}
              label="orders"
            />
          </div>
        </TabsContent>

        <TabsContent value="trades" className="mt-3">
          <div className="premium-card rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left font-medium px-4 py-3">UID</th>
                    <th className="text-left font-medium px-4 py-3">Pair</th>
                    <th className="text-left font-medium px-4 py-3">Side</th>
                    <th className="text-right font-medium px-4 py-3">Price</th>
                    <th className="text-right font-medium px-4 py-3">Qty</th>
                    <th className="text-right font-medium px-4 py-3">Value</th>
                    <th className="text-left font-medium px-4 py-3">Order</th>
                    <th className="text-left font-medium px-4 py-3">User</th>
                    <th className="text-left font-medium px-4 py-3">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {tradesLoading && Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}><td colSpan={9} className="px-4 py-3"><Skeleton className="h-9 w-full" /></td></tr>
                  ))}
                  {!tradesLoading && trades.length === 0 && (
                    <tr><td colSpan={9} className="px-4 py-3"><EmptyState icon={Activity} title="No trades yet" description="Try adjusting your filters or wait for market activity." /></td></tr>
                  )}
                  {!tradesLoading && pagedTrades.map((t) => (
                    <tr key={t.id} className="hover:bg-muted/20 transition-colors" data-testid={`trade-${t.id}`}>
                      <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground" title={t.uid}>{(t.uid || `#${t.id}`).slice(0, 10)}…</td>
                      <td className="px-4 py-3 font-mono font-bold">{pairById.get(t.pairId) ?? `#${t.pairId}`}</td>
                      <td className="px-4 py-3">
                        {t.side === "buy"
                          ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/25"><TrendingUp className="w-3 h-3" />BUY</span>
                          : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-red-500/15 text-red-300 border border-red-500/30"><TrendingDown className="w-3 h-3" />SELL</span>}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-xs">{fmt(t.price, 8)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-xs">{Number(t.qty).toFixed(4)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-xs font-medium">{(Number(t.price) * Number(t.qty)).toFixed(2)}</td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">#{t.orderId}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">#{t.userId}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground" title={new Date(t.createdAt).toLocaleString("en-IN")}>{relTime(t.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PaginationBar
              page={tradesPage}
              pageSize={tradesPageSize}
              total={trades.length}
              onPage={setTradesPage}
              onPageSize={setTradesPageSize}
              label="trades"
            />
          </div>
        </TabsContent>
      </Tabs>

      {/* Force-cancel confirmation. Mounted at page root so it portals above
          the orders table and survives the row re-render after invalidate.
          A non-empty reason is encouraged but not required (audit log accepts null). */}
      <AlertDialog open={cancelTarget !== null} onOpenChange={(o) => { if (!o) { setCancelTarget(null); setCancelReason(""); } }}>
        <AlertDialogContent data-testid="dialog-force-cancel-order">
          <AlertDialogHeader>
            <AlertDialogTitle>Force cancel this order?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <div>
                  Order <span className="font-mono text-amber-300">#{cancelTarget?.id}</span> by user
                  {" "}<span className="font-mono">#{cancelTarget?.userId}</span> on
                  {" "}<span className="font-mono font-bold">{cancelTarget ? (pairById.get(cancelTarget.pairId) ?? `pair #${cancelTarget.pairId}`) : ""}</span>
                  {" "}will be cancelled. Locked balance will be released back to the user's wallet.
                  {cancelTarget?.isBot ? <span className="block mt-1 text-amber-400 text-xs">⚠ This is a BOT order — cancelling may disrupt market-making for this pair.</span> : null}
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Reason (optional, audit log)</Label>
                  <Textarea
                    placeholder="e.g. user request via support, suspected manipulation, etc."
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    rows={2}
                    maxLength={500}
                    data-testid="input-cancel-reason"
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-cancel" disabled={cancelMut.isPending}>Keep order</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-500/90 hover:bg-red-500 text-white"
              disabled={cancelMut.isPending}
              onClick={(e) => {
                e.preventDefault(); // prevent auto-close — let onSuccess close it
                if (cancelTarget) cancelMut.mutate({ id: cancelTarget.id, reason: cancelReason.trim() });
              }}
              data-testid="button-confirm-force-cancel"
            >
              {cancelMut.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <XCircle className="w-3 h-3 mr-1" />}
              {cancelMut.isPending ? "Cancelling…" : "Force cancel"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
