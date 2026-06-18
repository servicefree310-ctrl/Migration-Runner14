import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { get, post, del } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { SuccessModal, type GenericSuccess } from "@/components/SuccessModal";
import {
  ListOrdered, RefreshCw, FileText, X, Layers, ArrowLeftRight, Search,
  TrendingUp, TrendingDown, Clock, CheckCircle2, XCircle, AlertCircle,
  Filter, Download, BarChart3, Banknote,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { PageHeader } from "@/components/premium/PageHeader";
import { SectionCard } from "@/components/premium/SectionCard";
import { EmptyState } from "@/components/premium/EmptyState";
import { StatusPill } from "@/components/premium/StatusPill";
import { PremiumStatCard } from "@/components/premium/PremiumStatCard";
import { OrderFillsDialog } from "@/components/OrderFillsDialog";
import { cn } from "@/lib/utils";

type Order = {
  id: number;
  symbol: string;
  type: string;
  side: "buy" | "sell";
  price?: string | number | null;
  avgPrice?: string | number | null;
  filledQty?: string | number | null;
  amount: string | number;
  status: string;
  createdAt: string;
  source?: "spot" | "futures";
};

type ConvertRow = {
  id: number;
  fromCoin: string;
  toCoin: string;
  fromAmount: number;
  toAmount: number;
  rate: number;
  feeAmount: number;
  status: string;
  createdAt: string;
};

type FilterTab = "all" | "spot" | "futures" | "convert";
type SortBy = "date_desc" | "date_asc" | "amount_desc";

function statusIcon(status: string) {
  const s = status.toUpperCase();
  if (s === "FILLED" || s === "COMPLETED" || s === "DONE") return <CheckCircle2 className="w-3 h-3 text-emerald-400" />;
  if (s === "CANCELLED" || s === "CANCELED" || s === "REJECTED") return <XCircle className="w-3 h-3 text-rose-400" />;
  if (s === "PARTIAL_CANCELLED") return <XCircle className="w-3 h-3 text-orange-400" />;
  if (s === "OPEN" || s === "PARTIAL") return <Clock className="w-3 h-3 text-amber-400" />;
  if (s === "PENDING_TRIGGER") return <Clock className="w-3 h-3 text-blue-400" />;
  return <AlertCircle className="w-3 h-3 text-muted-foreground" />;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" });
}

function fmtNum(n: number | string | null | undefined, digits = 4) {
  const v = Number(n ?? 0);
  if (!isFinite(v)) return "—";
  return v.toLocaleString("en-IN", { maximumFractionDigits: digits });
}

export default function Orders() {
  const queryClient = useQueryClient();
  const [confirmOrder, setConfirmOrder] = useState<Order | null>(null);
  const [genericSuccess, setGenericSuccess] = useState<GenericSuccess | null>(null);
  const [fillsOrderId, setFillsOrderId] = useState<number | null>(null);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortBy>("date_desc");

  const { data: ordersData, isLoading, isFetching, refetch } = useQuery<unknown>({
    queryKey: ["orders"],
    queryFn: () => get("/orders"),
    refetchInterval: 10_000,
  });

  const convertQ = useQuery<ConvertRow[]>({
    queryKey: ["/convert/history"],
    queryFn: () => get<ConvertRow[]>("/convert/history"),
    refetchInterval: 30_000,
  });

  const allOrders: Order[] = useMemo(() => {
    const d = ordersData as { orders?: Order[]; data?: Order[] } | Order[] | undefined;
    if (Array.isArray(d)) return d;
    if (d?.orders && Array.isArray(d.orders)) return d.orders;
    if (d?.data && Array.isArray(d.data)) return d.data;
    return [];
  }, [ordersData]);

  function isFutures(o: Order) {
    if (o.source === "futures") return true;
    const s = String(o.symbol || "").toUpperCase();
    const ty = String(o.type || "").toLowerCase();
    return s.includes("PERP") || s.endsWith("-SWAP") || ty.includes("perp") || ty.includes("futures");
  }

  const orders: Order[] = useMemo(() => {
    let list = allOrders;
    if (filter === "spot")    list = list.filter(o => !isFutures(o));
    if (filter === "futures") list = list.filter(o => isFutures(o));

    if (search) {
      const q = search.toUpperCase();
      list = list.filter(o => o.symbol.includes(q));
    }
    if (statusFilter !== "all") {
      const sf = statusFilter.toLowerCase();
      list = list.filter(o => o.status.toLowerCase() === sf);
    }

    list = [...list].sort((a, b) => {
      if (sortBy === "date_asc") return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (sortBy === "amount_desc") return Number(b.amount) - Number(a.amount);
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return list;
  }, [allOrders, filter, search, statusFilter, sortBy]);

  const showConvert = filter === "all" || filter === "convert";

  const stats = useMemo(() => {
    const open = allOrders.filter(o => o.status.toUpperCase() === "OPEN").length;
    const filled = allOrders.filter(o => o.status.toUpperCase() === "FILLED").length;
    const cancelled = allOrders.filter(o => ["CANCELLED", "CANCELED"].includes(o.status.toUpperCase())).length;
    const buyVol = allOrders.filter(o => o.side === "buy" && o.status.toUpperCase() === "FILLED").reduce((s, o) => s + Number(o.amount || 0), 0);
    const sellVol = allOrders.filter(o => o.side === "sell" && o.status.toUpperCase() === "FILLED").reduce((s, o) => s + Number(o.amount || 0), 0);
    return { open, filled, cancelled, buyVol, sellVol, total: allOrders.length };
  }, [allOrders]);

  const cancelMutation = useMutation({
    mutationFn: (order: Order) =>
      order.source === "futures"
        ? del(`/futures/order/${order.id}`)
        : post(`/orders/${order.id}/cancel`),
    onSuccess: () => {
      setConfirmOrder(null);
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      setGenericSuccess({ kind: "generic", iconKind: "futures", accentColor: "#F87171", title: "Order Cancelled", subtitle: "Your order has been cancelled. Any locked funds have been released back to your wallet.", rows: [], primaryLabel: "Done" });
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Failed to cancel order");
    },
  });

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <PageHeader
        eyebrow="Trading"
        title="My Orders"
        description="Live, cancelled and filled orders — complete trading history across Spot, Futures and Convert."
        actions={
          <div className="flex items-center gap-2">
            <Link href="/orders/statement">
              <Button variant="outline" size="sm">
                <FileText className="w-4 h-4 mr-2" />
                Full Statement
              </Button>
            </Link>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} aria-label="Refresh orders">
              <RefreshCw className={cn("w-4 h-4 mr-2", isFetching && "animate-spin")} />
              Refresh
            </Button>
          </div>
        }
      />

      {/* ─── Stats row ──────────────────────────────────────────────── */}
      {!isLoading && stats.total > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          <StatChip label="Total" value={stats.total} icon={<ListOrdered className="h-3.5 w-3.5" />} />
          <StatChip label="Open" value={stats.open} icon={<Clock className="h-3.5 w-3.5" />} tone={stats.open > 0 ? "warn" : undefined} />
          <StatChip label="Filled" value={stats.filled} icon={<CheckCircle2 className="h-3.5 w-3.5" />} tone="ok" />
          <StatChip label="Cancelled" value={stats.cancelled} icon={<XCircle className="h-3.5 w-3.5" />} tone="bad" />
          <StatChip label="Buy Vol" value={fmtNum(stats.buyVol, 2)} icon={<TrendingUp className="h-3.5 w-3.5" />} tone="ok" />
          <StatChip label="Sell Vol" value={fmtNum(stats.sellVol, 2)} icon={<TrendingDown className="h-3.5 w-3.5" />} tone="bad" />
        </div>
      )}

      {/* ─── Filter tabs ─────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as FilterTab)} className="flex-1">
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="spot">Spot</TabsTrigger>
            <TabsTrigger value="futures">Futures</TabsTrigger>
            <TabsTrigger value="convert">Convert</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search pair…"
              className="h-9 pl-8 w-36 sm:w-44"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 w-36">
              <Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="filled">Filled</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
              <SelectItem value="partial">Partial</SelectItem>
              <SelectItem value="pending_trigger">Pending Trigger</SelectItem>
              <SelectItem value="partial_cancelled">Partial Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={v => setSortBy(v as SortBy)}>
            <SelectTrigger className="h-9 w-36">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="date_desc">Newest First</SelectItem>
              <SelectItem value="date_asc">Oldest First</SelectItem>
              <SelectItem value="amount_desc">Largest Amount</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ─── Convert history ─────────────────────────────────────────── */}
      {showConvert && (
        <SectionCard
          title="Convert History"
          description={convertQ.data?.length ? `${convertQ.data.length} swaps` : undefined}
          icon={ArrowLeftRight}
          padded={false}
          className="mb-4"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b border-border/60">
                <tr className="text-xs uppercase tracking-wide text-muted-foreground text-left">
                  <th className="px-3 sm:px-4 py-3 font-medium hidden sm:table-cell">Date</th>
                  <th className="px-3 sm:px-4 py-3 font-medium">Pair</th>
                  <th className="px-3 sm:px-4 py-3 font-medium text-right">From</th>
                  <th className="px-3 sm:px-4 py-3 font-medium text-right">To</th>
                  <th className="px-3 sm:px-4 py-3 font-medium text-right hidden md:table-cell">Rate</th>
                  <th className="px-3 sm:px-4 py-3 font-medium text-right hidden md:table-cell">Fee</th>
                  <th className="px-3 sm:px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {convertQ.isLoading ? (
                  <tr><td colSpan={7} className="p-4"><div className="h-4 bg-muted/30 rounded animate-pulse" /></td></tr>
                ) : (convertQ.data?.length ?? 0) === 0 ? (
                  <tr><td colSpan={7} className="p-0">
                    <EmptyState
                      icon={ArrowLeftRight}
                      title="No conversions yet"
                      description="Quick Convert — instant swap with best rates."
                      action={<Link href="/convert"><Button size="sm">Try Convert</Button></Link>}
                    />
                  </td></tr>
                ) : (
                  convertQ.data!.map((r) => (
                    <tr key={`cvt-${r.id}`} className="border-b border-border/40 hover:bg-muted/10 transition-colors">
                      <td className="px-3 sm:px-4 py-3 text-muted-foreground tabular-nums text-xs hidden sm:table-cell">{fmtDate(r.createdAt)}</td>
                      <td className="px-3 sm:px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold">{r.fromCoin}</span>
                          <ArrowLeftRight className="h-3 w-3 text-muted-foreground" />
                          <span className="font-semibold">{r.toCoin}</span>
                        </div>
                      </td>
                      <td className="px-3 sm:px-4 py-3 font-mono tabular-nums text-right text-sm">{fmtNum(r.fromAmount)} {r.fromCoin}</td>
                      <td className="px-3 sm:px-4 py-3 font-mono tabular-nums text-right text-sm text-emerald-400">{fmtNum(r.toAmount)} {r.toCoin}</td>
                      <td className="px-3 sm:px-4 py-3 font-mono tabular-nums text-right text-xs text-muted-foreground hidden md:table-cell">{fmtNum(r.rate, 6)}</td>
                      <td className="px-3 sm:px-4 py-3 font-mono tabular-nums text-right text-xs text-muted-foreground hidden md:table-cell">{fmtNum(r.feeAmount, 6)}</td>
                      <td className="px-3 sm:px-4 py-3"><StatusPill status={r.status} /></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {/* ─── Orders table ────────────────────────────────────────────── */}
      {filter !== "convert" && (
        <SectionCard
          title={filter === "all" ? "All Orders" : filter === "spot" ? "Spot Orders" : "Futures Orders"}
          description={orders.length ? `${orders.length} orders` : undefined}
          icon={ListOrdered}
          padded={false}
          actions={
            orders.length > 0 ? (
              <span className="text-xs text-muted-foreground">{orders.length} result{orders.length !== 1 ? "s" : ""}</span>
            ) : undefined
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/30 border-b border-border/60">
                <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 sm:px-4 py-3 font-medium hidden sm:table-cell">Date</th>
                  <th className="px-3 sm:px-4 py-3 font-medium">Pair</th>
                  <th className="px-3 sm:px-4 py-3 font-medium hidden md:table-cell">Type</th>
                  <th className="px-3 sm:px-4 py-3 font-medium">Side</th>
                  <th className="px-3 sm:px-4 py-3 font-medium text-right">Price</th>
                  <th className="px-3 sm:px-4 py-3 font-medium text-right hidden sm:table-cell">Amount</th>
                  <th className="px-3 sm:px-4 py-3 font-medium text-right hidden md:table-cell">Filled</th>
                  <th className="px-3 sm:px-4 py-3 font-medium">Status</th>
                  <th className="px-3 sm:px-4 py-3 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-border/40">
                      {Array.from({ length: 9 }).map((_, j) => (
                        <td key={j} className="px-4 py-4">
                          <div className="h-4 w-full bg-muted/30 rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : orders.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-0">
                      <EmptyState
                        icon={FileText}
                        title="No orders found"
                        description={search || statusFilter !== "all" ? "Try adjusting your search or filters." : "Place your first order on the Trade page."}
                        action={
                          <Link href="/trade/BTC_USDT">
                            <Button size="sm" variant="outline">Go to Trade</Button>
                          </Link>
                        }
                      />
                    </td>
                  </tr>
                ) : (
                  orders.map((o) => {
                    const isOpen = String(o.status).toLowerCase() === "open";
                    const filled = Number(o.filledQty ?? 0);
                    const total = Number(o.amount ?? 0);
                    const fillPct = total > 0 ? Math.min(100, (filled / total) * 100) : 0;
                    const openFills = () => setFillsOrderId(o.id);
                    return (
                      <tr
                        key={o.id}
                        className="border-b border-border/40 hover:bg-muted/15 transition-colors cursor-pointer group"
                        onClick={openFills}
                        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openFills(); }}}
                        role="button"
                        tabIndex={0}
                        aria-label={`View fills for order ${o.id}`}
                      >
                        <td className="px-3 sm:px-4 py-3 text-muted-foreground tabular-nums text-xs whitespace-nowrap hidden sm:table-cell">
                          {fmtDate(o.createdAt)}
                        </td>
                        <td className="px-3 sm:px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-foreground text-sm">{o.symbol}</span>
                            {isFutures(o) && (
                              <Badge variant="secondary" className="text-[9px] px-1 py-0">PERP</Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-3 sm:px-4 py-3 uppercase text-xs text-muted-foreground tracking-wide hidden md:table-cell">
                          {o.type}
                        </td>
                        <td className="px-3 sm:px-4 py-3">
                          <span className={cn(
                            "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold uppercase",
                            o.side === "buy"
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                          )}>
                            {o.side === "buy" ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                            {o.side}
                          </span>
                        </td>
                        <td className="px-3 sm:px-4 py-3 font-mono tabular-nums text-right text-sm">
                          {(() => {
                            const isMarket = String(o.type).toLowerCase() === "market";
                            const avg = Number(o.avgPrice ?? 0);
                            if (filled > 0 && avg > 0) return (
                              <div className="flex flex-col items-end">
                                <span>{fmtNum(avg)}</span>
                                <span className="text-[10px] text-muted-foreground">avg fill</span>
                              </div>
                            );
                            if (isMarket) return <span className="text-muted-foreground">Market</span>;
                            const lim = Number(o.price ?? 0);
                            return lim > 0 ? fmtNum(lim) : "—";
                          })()}
                        </td>
                        <td className="px-3 sm:px-4 py-3 font-mono tabular-nums text-right hidden sm:table-cell">
                          {fmtNum(o.amount, 8)}
                        </td>
                        <td className="px-3 sm:px-4 py-3 text-right hidden md:table-cell">
                          {total > 0 ? (
                            <div className="flex flex-col items-end gap-1">
                              <span className="font-mono tabular-nums text-xs text-muted-foreground">
                                {fmtNum(filled, 6)} / {fmtNum(total, 6)}
                              </span>
                              <div className="w-16 h-1 bg-muted/40 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-emerald-500 rounded-full"
                                  style={{ width: `${fillPct}%` }}
                                />
                              </div>
                            </div>
                          ) : <span className="text-muted-foreground text-xs">—</span>}
                        </td>
                        <td className="px-3 sm:px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            {statusIcon(o.status)}
                            <StatusPill status={o.status} />
                          </div>
                        </td>
                        <td className="px-3 sm:px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                          {isOpen ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={e => { e.stopPropagation(); setConfirmOrder(o); }}
                              aria-label={`Cancel order ${o.id}`}
                              className="h-7 px-2 text-xs text-rose-400 border-rose-500/30 hover:bg-rose-500/10 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <X className="w-3 h-3 mr-1" />
                              Cancel
                            </Button>
                          ) : (["filled", "partially_filled"].includes(String(o.status).toLowerCase()) && !isFutures(o)) ? (
                            <Link href={`/orders/${o.id}/invoice`}>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-xs text-amber-400 border-amber-500/30 hover:bg-amber-500/10 opacity-0 group-hover:opacity-100 transition-opacity"
                                aria-label={`Download invoice for order ${o.id}`}
                              >
                                <FileText className="w-3 h-3 mr-1" />
                                Invoice
                              </Button>
                            </Link>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      <OrderFillsDialog
        orderId={fillsOrderId}
        open={fillsOrderId !== null}
        onOpenChange={o => !o && setFillsOrderId(null)}
      />

      <AlertDialog open={confirmOrder !== null} onOpenChange={o => !o && setConfirmOrder(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this order?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the order from the book. Any filled portion has already settled to your wallet.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Go back</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmOrder !== null && cancelMutation.mutate(confirmOrder)}
              disabled={cancelMutation.isPending}
              className="bg-rose-500 hover:bg-rose-600 text-white"
            >
              {cancelMutation.isPending ? "Cancelling…" : "Yes, cancel"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <SuccessModal open={genericSuccess !== null} payload={genericSuccess} onClose={() => setGenericSuccess(null)} />
    </div>
  );
}

function StatChip({
  label, value, icon, tone,
}: {
  label: string; value: string | number; icon: React.ReactNode; tone?: "ok" | "warn" | "bad";
}) {
  const cls = tone === "ok" ? "text-emerald-400" : tone === "warn" ? "text-amber-400" : tone === "bad" ? "text-rose-400" : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-card/50 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{icon}{label}</div>
      <div className={`text-base font-bold font-mono ${cls}`}>{value}</div>
    </div>
  );
}
