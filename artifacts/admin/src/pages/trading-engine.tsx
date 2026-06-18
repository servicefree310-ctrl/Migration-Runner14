import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post, del, ApiError } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/premium/PageHeader";
import { PremiumStatCard } from "@/components/premium/PremiumStatCard";
import { SectionCard } from "@/components/premium/SectionCard";
import { StatusPill } from "@/components/premium/StatusPill";
import { EmptyState } from "@/components/premium/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Activity, Pause, Play, AlertOctagon, Camera, Power, Send, Gauge,
  ListOrdered, Layers, Hash, Users as UsersIcon, AlertTriangle, ArrowDown,
  ArrowUp, Hourglass, Zap, ShieldAlert, RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types matching the API server's ProdEngineMetrics + Depth ────────────
type EngineMetrics = {
  totalCommands: number;
  totalTrades: number;
  queueDepth: number;
  lastMatchLatencyUs: number;
  avgMatchLatencyUs: number;
  symbolsTracked: number;
  haltedSymbols: string[];
  seq: number;
};
type SettlerMetrics = {
  enqueued: number;
  settled: number;
  refunded: number;
  failed: number;
  queueDepth: number;
  avgSettleMs: number;
  lastSettledTradeId: number;
  lastError: string;
};
type RiskSnapshot = {
  totalUsers: number;
  totalOpenOrders: number;
  cfg: {
    /** Sustained orders per second (token-bucket refill rate). */
    ordersPerSecond: number;
    /** Max burst tokens — short bursts up to this size allowed. */
    burstSize: number;
    /** Max simultaneously-open orders per user across all symbols. */
    maxOpenOrders: number;
  };
};
type ProdMetrics = {
  engine: EngineMetrics;
  settler: SettlerMetrics;
  risk: RiskSnapshot;
  bootstrappedAt: number;
  uptimeSec: number;
};
type DepthLevel = { price: number; quantity: number; orders: number };
type Depth = {
  symbol: string;
  bids: DepthLevel[];
  asks: DepthLevel[];
  seq: number;
  halted?: boolean;
};

// ── Helpers ──────────────────────────────────────────────────────────────
function fmtUptime(sec: number): string {
  if (!sec || sec < 0) return "—";
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
function fmtPrice(n: number): string {
  return n.toLocaleString("en-IN", { maximumFractionDigits: 8 });
}
function fmtQty(n: number): string {
  return n.toLocaleString("en-IN", { maximumFractionDigits: 8 });
}
function errMsg(e: unknown, fallback = "Request failed"): string {
  if (e instanceof ApiError) {
    const d = e.data as { message?: string; error?: string } | null;
    return d?.message || d?.error || e.message || fallback;
  }
  if (e instanceof Error) return e.message;
  return fallback;
}

// ── Symbol picker (small in-memory list; this is admin-only sandbox) ─────
const COMMON_SYMBOLS = ["SOLUSDT", "BTCUSDT", "ETHUSDT", "BNBUSDT", "XRPUSDT", "DOGEUSDT"];

// ── Order book pane ──────────────────────────────────────────────────────
function Orderbook({ symbol }: { symbol: string }) {
  const { data, isLoading, isFetching, refetch, error, isError } = useQuery<Depth>({
    queryKey: ["/admin/inmem-engine-prod/orderbook", symbol],
    queryFn: () => get<Depth>(`/admin/inmem-engine-prod/orderbook/${symbol}?levels=15`),
    refetchInterval: 2000,
    refetchIntervalInBackground: false,
  });

  const maxQty = useMemo(() => {
    if (!data) return 0;
    let m = 0;
    for (const l of data.bids) m = Math.max(m, l.quantity);
    for (const l of data.asks) m = Math.max(m, l.quantity);
    return m;
  }, [data]);

  const spread = useMemo(() => {
    if (!data || !data.bids[0] || !data.asks[0]) return null;
    const b = data.bids[0].price;
    const a = data.asks[0].price;
    return { abs: a - b, pct: ((a - b) / a) * 100, mid: (a + b) / 2 };
  }, [data]);

  return (
    <SectionCard
      title={`Order book — ${symbol}`}
      description={data ? `seq ${data.seq}` : undefined}
      icon={Layers}
      actions={
        <>
          {data?.halted && <StatusPill variant="warning">Halted</StatusPill>}
          <Button size="icon" variant="ghost" onClick={() => refetch()} title="Refresh">
            <RefreshCw className={cn("w-3.5 h-3.5", isFetching && "animate-spin")} />
          </Button>
        </>
      }
      padded={false}
    >
      <div className="grid grid-cols-2 text-[11px] uppercase text-muted-foreground border-b border-border/60 px-4 py-2 bg-muted/10">
        <div>Bids (Buy)</div>
        <div className="text-right">Asks (Sell)</div>
      </div>

      {isLoading && (
        <div className="py-10 text-center text-muted-foreground">
          <Activity className="w-5 h-5 mx-auto mb-2 animate-pulse" />Loading book…
        </div>
      )}

      {isError && !data && (
        <div className="px-4 py-6 text-center">
          <AlertTriangle className="w-5 h-5 text-red-300 mx-auto mb-2" />
          <div className="text-sm text-red-200 mb-1">Couldn't load order book</div>
          <div className="text-[11px] text-muted-foreground mb-3">{errMsg(error, "Network error")}</div>
          <Button size="sm" variant="outline" onClick={() => refetch()}>Retry</Button>
        </div>
      )}

      {!isLoading && data && (data.bids.length === 0 && data.asks.length === 0) && (
        <EmptyState
          icon={ListOrdered}
          title={`No resting orders on ${symbol}`}
          description="Place an order on behalf of a user (right panel) to seed the book."
        />
      )}

      {!isLoading && data && (data.bids.length > 0 || data.asks.length > 0) && (
        <>
          <div className="grid grid-cols-2 divide-x divide-border/60">
            {/* BIDS */}
            <div className="p-2">
              {data.bids.length === 0 && (
                <div className="text-[11px] text-muted-foreground px-2 py-3">No bids</div>
              )}
              {data.bids.map((l, i) => {
                const w = maxQty > 0 ? Math.min(100, (l.quantity / maxQty) * 100) : 0;
                return (
                  <div key={`b${i}`} className="relative px-2 py-1 text-xs font-mono tabular-nums">
                    <div
                      className="absolute right-0 top-0 bottom-0 bg-emerald-500/10"
                      style={{ width: `${w}%` }}
                    />
                    <div className="relative flex items-center justify-between gap-3">
                      <span className="text-emerald-300">{fmtPrice(l.price)}</span>
                      <span className="text-foreground/85">{fmtQty(l.quantity)}</span>
                      <span className="text-muted-foreground text-[10px] w-6 text-right">{l.orders}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ASKS */}
            <div className="p-2">
              {data.asks.length === 0 && (
                <div className="text-[11px] text-muted-foreground px-2 py-3 text-right">No asks</div>
              )}
              {data.asks.map((l, i) => {
                const w = maxQty > 0 ? Math.min(100, (l.quantity / maxQty) * 100) : 0;
                return (
                  <div key={`a${i}`} className="relative px-2 py-1 text-xs font-mono tabular-nums">
                    <div
                      className="absolute left-0 top-0 bottom-0 bg-red-500/10"
                      style={{ width: `${w}%` }}
                    />
                    <div className="relative flex items-center justify-between gap-3">
                      <span className="text-muted-foreground text-[10px] w-6 text-left">{l.orders}</span>
                      <span className="text-foreground/85">{fmtQty(l.quantity)}</span>
                      <span className="text-red-300">{fmtPrice(l.price)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {spread && (
            <div className="border-t border-border/60 px-4 py-2 flex items-center justify-between text-xs bg-muted/10">
              <span className="text-muted-foreground">Mid <span className="font-mono text-foreground">{fmtPrice(spread.mid)}</span></span>
              <span className="text-muted-foreground">
                Spread <span className="font-mono text-amber-300">{fmtPrice(spread.abs)}</span>
                {" "}<span className="text-muted-foreground/80">({spread.pct.toFixed(3)}%)</span>
              </span>
            </div>
          )}
        </>
      )}
    </SectionCard>
  );
}

// ── Place-on-behalf form ─────────────────────────────────────────────────
type PlaceForm = {
  userId: string;
  side: "buy" | "sell";
  type: "limit" | "market" | "ioc" | "fok" | "post_only";
  price: string;
  quantity: string;
  stp: "cancel_newest" | "cancel_oldest" | "cancel_both" | "none";
};

function PlaceOnBehalfForm({ symbol }: { symbol: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [v, setV] = useState<PlaceForm>({
    userId: "",
    side: "buy",
    type: "limit",
    price: "",
    quantity: "",
    stp: "cancel_newest",
  });

  // Defensive coercion: market-buy is rejected by the prod-engine, so if the
  // operator flips side from sell→buy while type is already "market", auto-
  // downgrade to "limit" so the submit button stays consistent with what the
  // backend will accept.
  const setSide = (next: "buy" | "sell") => {
    setV((cur) =>
      next === "buy" && cur.type === "market"
        ? { ...cur, side: next, type: "limit", price: "" }
        : { ...cur, side: next },
    );
  };

  const place = useMutation({
    mutationFn: () => post("/admin/inmem-engine-prod/orders", {
      userId: Number(v.userId),
      symbol,
      side: v.side,
      type: v.type,
      ...(v.type !== "market" ? { price: Number(v.price) } : {}),
      quantity: Number(v.quantity),
      stp: v.stp,
    }),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["/admin/inmem-engine-prod/orderbook", symbol] });
      qc.invalidateQueries({ queryKey: ["/admin/inmem-engine-prod/metrics"] });
      toast({
        title: "Order placed",
        description: `dbOrderId ${res?.dbOrderId} — ${res?.resting ? "resting" : "filled/done"}, ${res?.trades?.length ?? 0} trades`,
      });
      setV((cur) => ({ ...cur, price: "", quantity: "" }));
    },
    onError: (e) => toast({ title: "Place failed", description: errMsg(e), variant: "destructive" }),
  });

  const isMarket = v.type === "market";
  const marketBuyBlocked = isMarket && v.side === "buy";
  const validUser = Number(v.userId) > 0;
  const validQty = Number(v.quantity) > 0;
  const validPrice = isMarket || Number(v.price) > 0;
  const canSubmit = validUser && validQty && validPrice && !marketBuyBlocked && !place.isPending;

  return (
    <SectionCard
      title="Place order on behalf"
      description="Locks REAL funds, settles to DB. Treat carefully."
      icon={Send}
    >
      <div className="space-y-3">
        {/* Side selector */}
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant={v.side === "buy" ? "default" : "outline"}
            className={cn(
              "h-10",
              v.side === "buy" && "bg-emerald-500/90 hover:bg-emerald-500 text-white border-emerald-500/0"
            )}
            onClick={() => setSide("buy")}
          >
            <ArrowUp className="w-4 h-4 mr-1.5" />Buy
          </Button>
          <Button
            type="button"
            variant={v.side === "sell" ? "default" : "outline"}
            className={cn(
              "h-10",
              v.side === "sell" && "bg-red-500/90 hover:bg-red-500 text-white border-red-500/0"
            )}
            onClick={() => setSide("sell")}
          >
            <ArrowDown className="w-4 h-4 mr-1.5" />Sell
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">User ID</Label>
            <Input
              inputMode="numeric"
              value={v.userId}
              onChange={(e) => setV({ ...v, userId: e.target.value.replace(/[^\d]/g, "") })}
              placeholder="e.g. 42"
              className="font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Order Type</Label>
            <Select value={v.type} onValueChange={(t) => setV({ ...v, type: t as PlaceForm["type"] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="limit">Limit</SelectItem>
                <SelectItem value="market" disabled={v.side === "buy"}>
                  Market {v.side === "buy" && "(sells only)"}
                </SelectItem>
                <SelectItem value="ioc">IOC (Immediate or Cancel)</SelectItem>
                <SelectItem value="fok">FOK (Fill or Kill)</SelectItem>
                <SelectItem value="post_only">Post-Only (maker)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Price</Label>
            <Input
              inputMode="decimal"
              value={v.price}
              onChange={(e) => setV({ ...v, price: e.target.value })}
              placeholder={isMarket ? "(market)" : "0.00"}
              disabled={isMarket}
              className="font-mono tabular-nums"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Quantity</Label>
            <Input
              inputMode="decimal"
              value={v.quantity}
              onChange={(e) => setV({ ...v, quantity: e.target.value })}
              placeholder="0.00"
              className="font-mono tabular-nums"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Self-Trade Prevention</Label>
          <Select value={v.stp} onValueChange={(s) => setV({ ...v, stp: s as PlaceForm["stp"] })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="cancel_newest">Cancel newest (default)</SelectItem>
              <SelectItem value="cancel_oldest">Cancel oldest</SelectItem>
              <SelectItem value="cancel_both">Cancel both</SelectItem>
              <SelectItem value="none">None (allow self-trade)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {marketBuyBlocked && (
          <div className="rounded-md border border-red-500/30 bg-red-500/5 p-2.5 flex gap-2 text-[11px] text-red-200">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>Market BUY isn't supported by the prod engine. Switch to Limit or IOC.</span>
          </div>
        )}

        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5 flex gap-2 text-[11px] text-amber-200/90">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>
            Locks real wallet funds and writes trades to Postgres.
            {v.side === "buy" && !marketBuyBlocked && " Buy locks notional + ~1.5× taker fee buffer."}
          </span>
        </div>

        <Button className="w-full" disabled={!canSubmit} onClick={() => place.mutate()}>
          {place.isPending ? "Placing…" : `${v.side === "buy" ? "Buy" : "Sell"} ${symbol}`}
        </Button>
      </div>
    </SectionCard>
  );
}

// ── Symbol controls (halt / resume / cancel-all) ─────────────────────────
function SymbolControls({
  symbol, isHalted,
}: {
  symbol: string; isHalted: boolean;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [confirmCancel, setConfirmCancel] = useState(false);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["/admin/inmem-engine-prod/metrics"] });
    qc.invalidateQueries({ queryKey: ["/admin/inmem-engine-prod/orderbook", symbol] });
  };

  const halt = useMutation({
    mutationFn: () => post("/admin/inmem-engine-prod/halt", { symbol }),
    onSuccess: () => { invalidate(); toast({ title: `Halted ${symbol}`, description: "New placements rejected. Cancels still work." }); },
    onError: (e) => toast({ title: "Halt failed", description: errMsg(e), variant: "destructive" }),
  });
  const resume = useMutation({
    mutationFn: () => post("/admin/inmem-engine-prod/resume", { symbol }),
    onSuccess: () => { invalidate(); toast({ title: `Resumed ${symbol}` }); },
    onError: (e) => toast({ title: "Resume failed", description: errMsg(e), variant: "destructive" }),
  });
  const cancelAll = useMutation({
    mutationFn: () => post<{ ok: boolean; cancelled: number }>("/admin/inmem-engine-prod/cancel-all", { symbol }),
    onSuccess: (res) => {
      invalidate();
      setConfirmCancel(false);
      toast({ title: `Cancel-all done`, description: `Cancelled ${res?.cancelled ?? 0} resting orders on ${symbol}` });
    },
    onError: (e) => { setConfirmCancel(false); toast({ title: "Cancel-all failed", description: errMsg(e), variant: "destructive" }); },
  });

  return (
    <SectionCard
      title="Symbol controls"
      description={`Operations on ${symbol}`}
      icon={ShieldAlert}
    >
      <div className="space-y-2.5">
        <div className="flex items-center justify-between rounded-md border border-border/60 p-2.5">
          <div>
            <div className="text-sm font-medium">Trading status</div>
            <div className="text-[11px] text-muted-foreground">
              {isHalted ? "New placements blocked, cancels allowed" : "Accepting orders"}
            </div>
          </div>
          {isHalted ? (
            <Button size="sm" variant="default" onClick={() => resume.mutate()} disabled={resume.isPending}>
              <Play className="w-4 h-4 mr-1.5" />Resume
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => halt.mutate()} disabled={halt.isPending}>
              <Pause className="w-4 h-4 mr-1.5" />Halt
            </Button>
          )}
        </div>

        <div className="flex items-center justify-between rounded-md border border-red-500/25 bg-red-500/5 p-2.5">
          <div>
            <div className="text-sm font-medium text-red-200">Cancel all resting</div>
            <div className="text-[11px] text-red-200/70">Refunds every locked order on {symbol}</div>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="border-red-500/40 text-red-200 hover:bg-red-500/10"
            onClick={() => setConfirmCancel(true)}
          >
            <AlertOctagon className="w-4 h-4 mr-1.5" />Cancel-All
          </Button>
        </div>
      </div>

      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel all resting orders on {symbol}?</AlertDialogTitle>
            <AlertDialogDescription>
              This refunds every locked balance for orders currently sitting on the {symbol} book. Users will see their open orders disappear. There's no undo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep them</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => cancelAll.mutate()}
              className="bg-destructive hover:bg-destructive/90"
            >
              {cancelAll.isPending ? "Cancelling…" : "Yes, cancel all"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SectionCard>
  );
}

// ── Cancel-by-id helper ──────────────────────────────────────────────────
function CancelByIdForm() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [dbId, setDbId] = useState("");
  const [userId, setUserId] = useState("");

  const cancel = useMutation({
    mutationFn: () => del(`/admin/inmem-engine-prod/orders/${Number(dbId)}?userId=${Number(userId)}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/admin/inmem-engine-prod/metrics"] });
      qc.invalidateQueries({ queryKey: ["/admin/inmem-engine-prod/orderbook"] });
      toast({ title: "Order cancelled", description: `dbOrderId ${dbId} refunded` });
      setDbId(""); setUserId("");
    },
    onError: (e) => toast({ title: "Cancel failed", description: errMsg(e), variant: "destructive" }),
  });

  return (
    <SectionCard title="Cancel single order" description="By DB order id" icon={Hash}>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">DB Order ID</Label>
          <Input
            inputMode="numeric"
            value={dbId}
            onChange={(e) => setDbId(e.target.value.replace(/[^\d]/g, ""))}
            placeholder="e.g. 1234"
            className="font-mono"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">User ID</Label>
          <Input
            inputMode="numeric"
            value={userId}
            onChange={(e) => setUserId(e.target.value.replace(/[^\d]/g, ""))}
            placeholder="must match"
            className="font-mono"
          />
        </div>
      </div>
      <Button
        className="w-full mt-3"
        variant="outline"
        disabled={!Number(dbId) || !Number(userId) || cancel.isPending}
        onClick={() => cancel.mutate()}
      >
        {cancel.isPending ? "Cancelling…" : "Cancel & refund"}
      </Button>
    </SectionCard>
  );
}

// ── MAIN PAGE ────────────────────────────────────────────────────────────
export default function TradingEnginePage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [symbol, setSymbol] = useState<string>("SOLUSDT");
  const [confirmShutdown, setConfirmShutdown] = useState(false);

  const {
    data: metrics, isLoading, isError: metricsError, error: metricsErr, refetch: refetchMetrics,
  } = useQuery<ProdMetrics>({
    queryKey: ["/admin/inmem-engine-prod/metrics"],
    queryFn: () => get<ProdMetrics>("/admin/inmem-engine-prod/metrics"),
    refetchInterval: 3000,
    refetchIntervalInBackground: false,
  });

  const snapshot = useMutation({
    mutationFn: () => post("/admin/inmem-engine-prod/snapshot"),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/admin/inmem-engine-prod/metrics"] }); toast({ title: "Snapshot written" }); },
    onError: (e) => toast({ title: "Snapshot failed", description: errMsg(e), variant: "destructive" }),
  });
  const shutdown = useMutation({
    mutationFn: () => post("/admin/inmem-engine-prod/shutdown"),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/admin/inmem-engine-prod/metrics"] }); setConfirmShutdown(false); toast({ title: "Engine drained & shut down", description: "Next order will boot a fresh instance." }); },
    onError: (e) => { setConfirmShutdown(false); toast({ title: "Shutdown failed", description: errMsg(e), variant: "destructive" }); },
  });

  const e = metrics?.engine;
  const s = metrics?.settler;
  const r = metrics?.risk;
  const isHalted = !!e?.haltedSymbols?.includes(symbol);
  const allHaltedSymbols = e?.haltedSymbols ?? [];

  const settlerBacklog = (s?.queueDepth ?? 0) + ((s?.failed ?? 0) > 0 ? 1 : 0);
  const settlerHealth: "success" | "warning" | "danger" =
    (s?.failed ?? 0) > 0 ? "danger"
    : (s?.queueDepth ?? 0) > 100 ? "warning"
    : "success";
  const settlerLabel =
    settlerHealth === "danger" ? "Failures detected"
    : settlerHealth === "warning" ? "Backlog growing"
    : "Healthy";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Markets & Trading"
        title="Trading Engine"
        description="Production in-memory matching engine — live order book, halt/resume, async settler health, and place-on-behalf controls. Sandbox surface; runs alongside the legacy engine."
        actions={
          <>
            <Button variant="outline" onClick={() => snapshot.mutate()} disabled={snapshot.isPending} data-testid="button-engine-snapshot">
              <Camera className="w-4 h-4 mr-1.5" />{snapshot.isPending ? "Snapshotting…" : "Force Snapshot"}
            </Button>
            <Button variant="outline" className="border-red-500/40 text-red-200 hover:bg-red-500/10" onClick={() => setConfirmShutdown(true)} data-testid="button-engine-shutdown">
              <Power className="w-4 h-4 mr-1.5" />Shutdown
            </Button>
          </>
        }
      />

      {/* Metrics polling error banner — distinct from "all zeros" so operators
          can't mistake a network failure for a healthy idle engine. */}
      {metricsError && !metrics && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 flex items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-300 mt-0.5 shrink-0" />
            <div>
              <div className="text-sm font-semibold text-red-200">Live metrics unavailable</div>
              <div className="text-xs text-red-200/80 mt-0.5">
                Couldn't reach the engine — stats below show the last known values (or zero).
                {" "}<span className="font-mono">{errMsg(metricsErr, "Network error")}</span>
              </div>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={() => refetchMetrics()}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />Retry
          </Button>
        </div>
      )}

      {/* Top KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <PremiumStatCard
          hero
          title="Uptime"
          value={fmtUptime(metrics?.uptimeSec ?? 0)}
          icon={Activity}
          hint={metrics ? new Date(metrics.bootstrappedAt).toLocaleTimeString() : "—"}
          loading={isLoading}
        />
        <PremiumStatCard
          title="Total Trades"
          value={e?.totalTrades ?? 0}
          icon={Zap}
          accent
          hint={`seq ${e?.seq ?? 0}`}
          loading={isLoading}
        />
        <PremiumStatCard
          title="Symbols"
          value={e?.symbolsTracked ?? 0}
          icon={Layers}
          hint={allHaltedSymbols.length > 0 ? `${allHaltedSymbols.length} halted` : "all live"}
          loading={isLoading}
        />
        <PremiumStatCard
          title="Engine Queue"
          value={e?.queueDepth ?? 0}
          icon={ListOrdered}
          hint="commands pending"
          loading={isLoading}
        />
        <PremiumStatCard
          title="Match Latency"
          value={`${e?.lastMatchLatencyUs ?? 0}µs`}
          icon={Gauge}
          hint={`avg ${e?.avgMatchLatencyUs ?? 0}µs`}
          loading={isLoading}
        />
        <PremiumStatCard
          title="Settler Queue"
          value={s?.queueDepth ?? 0}
          icon={Hourglass}
          hint={`avg ${s?.avgSettleMs ?? 0}ms`}
          loading={isLoading}
        />
      </div>

      {/* Settler + Risk health row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <SectionCard title="Async settler" icon={Hourglass}
          actions={<StatusPill variant={settlerHealth}>{settlerLabel}</StatusPill>}
        >
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Stat label="Settled" value={s?.settled ?? 0} />
            <Stat label="Refunded" value={s?.refunded ?? 0} />
            <Stat label="Enqueued" value={s?.enqueued ?? 0} />
            <Stat
              label="Failed"
              value={s?.failed ?? 0}
              tone={(s?.failed ?? 0) > 0 ? "danger" : undefined}
            />
            <Stat label="Last trade id" value={s?.lastSettledTradeId ?? 0} mono />
            <Stat label="Backlog" value={settlerBacklog} mono />
          </div>
          {s?.lastError && (
            <div className="mt-3 rounded-md border border-red-500/30 bg-red-500/5 p-2.5 text-[11px]">
              <div className="font-semibold text-red-200 mb-0.5 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />Last error
              </div>
              <div className="font-mono text-red-200/85 break-all">{s.lastError}</div>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Risk guard" icon={UsersIcon}>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Stat label="Active users" value={r?.totalUsers ?? 0} />
            <Stat label="Open orders" value={r?.totalOpenOrders ?? 0} />
            <Stat label="Sustained / sec" value={r?.cfg?.ordersPerSecond ?? 0} mono />
            <Stat label="Burst size" value={r?.cfg?.burstSize ?? 0} mono />
            <Stat label="Max open / user" value={r?.cfg?.maxOpenOrders ?? 0} mono />
          </div>
        </SectionCard>

        <SectionCard title="Halted symbols" icon={Pause}>
          {allHaltedSymbols.length === 0 ? (
            <div className="text-sm text-muted-foreground py-2 flex items-center gap-2">
              <StatusPill variant="success">All live</StatusPill>
              No symbols are currently halted.
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {allHaltedSymbols.map((sym) => (
                <button
                  key={sym}
                  onClick={() => setSymbol(sym)}
                  className="px-2.5 py-1 rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-200 text-xs font-mono hover:bg-amber-500/20 transition-colors"
                >
                  {sym}
                </button>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      {/* Symbol selector */}
      <SectionCard
        title="Symbol"
        description={`Inspect / control a specific market`}
        icon={Layers}
      >
        <div className="flex flex-wrap items-center gap-3">
          <Tabs value={symbol} onValueChange={setSymbol}>
            <TabsList className="flex-wrap h-auto">
              {COMMON_SYMBOLS.map((sym) => (
                <TabsTrigger key={sym} value={sym} className="font-mono text-xs">
                  {sym}
                  {allHaltedSymbols.includes(sym) && (
                    <Pause className="w-3 h-3 ml-1.5 text-amber-300" />
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="flex items-center gap-2 ml-auto">
            <Label className="text-xs text-muted-foreground">Custom:</Label>
            <Input
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase().trim())}
              className="font-mono w-32 h-8 text-xs"
              placeholder="SYMBOL"
            />
          </div>
        </div>
      </SectionCard>

      {/* Bottom 2-column workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <Orderbook symbol={symbol} />
          <SymbolControls symbol={symbol} isHalted={isHalted} />
        </div>
        <div className="space-y-4">
          <PlaceOnBehalfForm symbol={symbol} />
          <CancelByIdForm />
        </div>
      </div>

      <AlertDialog open={confirmShutdown} onOpenChange={setConfirmShutdown}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Shutdown the production engine?</AlertDialogTitle>
            <AlertDialogDescription>
              This drains the settler queue, writes a final snapshot, and closes the WAL. The next order placement will boot a fresh ProdEngine instance with full recovery from disk. Use this for clean restarts only.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep running</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => shutdown.mutate()}
              className="bg-destructive hover:bg-destructive/90"
            >
              {shutdown.isPending ? "Shutting down…" : "Drain & shutdown"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Tiny stat row primitive (local) ──────────────────────────────────────
function Stat({
  label, value, mono = false, tone,
}: {
  label: string; value: string | number; mono?: boolean; tone?: "danger";
}) {
  const display = typeof value === "number"
    ? value.toLocaleString("en-IN", { maximumFractionDigits: 2 })
    : value;
  return (
    <div className="rounded-md border border-border/60 bg-muted/10 px-2.5 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn(
        "mt-0.5 text-sm font-semibold tabular-nums",
        mono && "font-mono",
        tone === "danger" ? "text-red-300" : "text-foreground"
      )}>
        {display}
      </div>
    </div>
  );
}
