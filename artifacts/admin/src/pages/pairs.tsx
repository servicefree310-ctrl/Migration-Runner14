import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post, patch, del } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/premium/PageHeader";
import { PremiumStatCard } from "@/components/premium/PremiumStatCard";
import { StatusPill } from "@/components/premium/StatusPill";
import { EmptyState } from "@/components/premium/EmptyState";
import { PaginationBar, type PageSizeOption } from "@/components/premium/PaginationBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { CoinSelect } from "@/components/ui/coin-select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  ArrowLeftRight, Plus, Pencil, Trash2, Search, RefreshCw, TrendingUp, TrendingDown,
  Activity, Calendar, Loader2, AlertTriangle, Tag, Settings2, BarChart3, CircleDollarSign,
  Lock, Unlock, Eye,
} from "lucide-react";

type Coin = { id: number; symbol: string; logoUrl: string | null };
type Pair = {
  id: number; symbol: string; baseCoinId: number; quoteCoinId: number;
  minQty: string; maxQty: string; pricePrecision: number; qtyPrecision: number;
  takerFee: string; makerFee: string; status: string;
  tradingEnabled: boolean; futuresEnabled: boolean;
  tradingStartAt: string | null; futuresStartAt: string | null;
  lastPrice: string; volume24h: string; change24h: string; description: string | null;
  high24h?: string; low24h?: string; quoteVolume24h?: string; trades24h?: number; statsOverride?: boolean;
};

function fmt(n: string | number, dp = 4): string {
  const v = typeof n === "string" ? Number(n) : n;
  return Number.isFinite(v) ? v.toLocaleString("en-US", { maximumFractionDigits: dp }) : "0";
}

function fmtCountdown(target: string | null): string {
  if (!target) return "—";
  const ms = new Date(target).getTime() - Date.now();
  if (ms <= 0) return "Live";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function PairsPage() {
  const { user: me } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const isAdmin = me?.role === "admin" || me?.role === "superadmin";

  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Pair | null>(null);
  const [deleteFor, setDeleteFor] = useState<Pair | null>(null);
  const [, setTick] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSizeOption>(20);
  useEffect(() => { const t = setInterval(() => setTick((x) => x + 1), 1000); return () => clearInterval(t); }, []);

  const { data: coins = [] } = useQuery<Coin[]>({ queryKey: ["/admin/coins"], queryFn: () => get<Coin[]>("/admin/coins") });
  const { data = [], isLoading, refetch, isFetching } = useQuery<Pair[]>({ queryKey: ["/admin/pairs"], queryFn: () => get<Pair[]>("/admin/pairs") });
  const coinById = useMemo(() => new Map(coins.map((c) => [c.id, c])), [coins]);

  const create = useMutation({
    mutationFn: (v: Partial<Pair>) => {
      const b = coinById.get(v.baseCoinId!)?.symbol ?? "";
      const q = coinById.get(v.quoteCoinId!)?.symbol ?? "";
      return post("/admin/pairs", { ...v, symbol: b + q });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/admin/pairs"] }); setOpen(false); toast({ title: "Pair added" }); },
    onError: (e: Error) => toast({ title: "Add failed", description: e.message, variant: "destructive" }),
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<Pair> }) => patch(`/admin/pairs/${id}`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/admin/pairs"] }); setEdit(null); toast({ title: "Pair updated" }); },
    onError: (e: Error) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });
  const quickToggle = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<Pair> }) => patch(`/admin/pairs/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/admin/pairs"] }),
    onError: (e: Error) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });
  const remove = useMutation({
    mutationFn: (id: number) => del(`/admin/pairs/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/admin/pairs"] }); setDeleteFor(null); toast({ title: "Pair removed" }); },
    onError: (e: Error) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  const stats = useMemo(() => {
    const total = data.length;
    const spot = data.filter((p) => p.tradingEnabled).length;
    const futures = data.filter((p) => p.futuresEnabled).length;
    const upcoming = data.filter((p) => p.tradingStartAt && new Date(p.tradingStartAt).getTime() > Date.now()).length;
    const gainers = data.filter((p) => Number(p.change24h) > 0).length;
    const totalVol = data.reduce((s, p) => s + (Number(p.quoteVolume24h ?? p.volume24h) || 0), 0);
    return { total, spot, futures, upcoming, gainers, totalVol };
  }, [data]);

  const filtered = useMemo(() => {
    const q = search.trim().toUpperCase();
    return data.filter((p) => {
      if (tab === "spot" && !p.tradingEnabled) return false;
      if (tab === "futures" && !p.futuresEnabled) return false;
      if (tab === "upcoming" && (!p.tradingStartAt || new Date(p.tradingStartAt).getTime() <= Date.now())) return false;
      if (tab === "paused" && p.status !== "paused") return false;
      if (tab === "delisted" && p.status !== "delisted") return false;
      if (!q) return true;
      const b = coinById.get(p.baseCoinId)?.symbol ?? "";
      const qc = coinById.get(p.quoteCoinId)?.symbol ?? "";
      return [p.symbol, b, qc, String(p.id)].join(" ").toUpperCase().includes(q);
    });
  }, [data, tab, search, coinById]);

  // Reset to page 1 whenever filters change
  useEffect(() => { setPage(1); }, [tab, search, pageSize]);

  const paged = useMemo(
    () => filtered.slice((page - 1) * pageSize, page * pageSize),
    [filtered, page, pageSize],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Markets & Trading"
        title="Trading Pairs"
        description="Configure spot and futures pairs — fees, precision, listing schedule, and manual stats overrides all in one place."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} data-testid="button-refresh-pairs">
              <RefreshCw className={cn("w-4 h-4 mr-1.5", isFetching && "animate-spin")} />Refresh
            </Button>
            {isAdmin && (
              <Button onClick={() => setOpen(true)} data-testid="button-add-pair">
                <Plus className="w-4 h-4 mr-1.5" />Add Pair
              </Button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 md:gap-4">
        <PremiumStatCard title="Total Pairs" value={stats.total} icon={ArrowLeftRight} hero hint={`${coins.length} coins available`} />
        <PremiumStatCard title="Spot Enabled" value={stats.spot} icon={Activity} hint={`${stats.total - stats.spot} disabled`} />
        <PremiumStatCard title="Futures" value={stats.futures} icon={TrendingUp} hint="Perpetual markets" />
        <PremiumStatCard title="Upcoming" value={stats.upcoming} icon={Calendar} hint="Scheduled launches" />
        <PremiumStatCard title="Gainers (24h)" value={stats.gainers} icon={TrendingUp} hint={`${stats.total - stats.gainers} flat/down`} />
        <PremiumStatCard title="24h Volume" value={fmt(stats.totalVol, 0)} icon={BarChart3} hint="quote-side aggregate" />
      </div>

      <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
        <Tabs value={tab} onValueChange={setTab} className="w-full md:w-auto">
          <TabsList className="overflow-x-auto">
            <TabsTrigger value="all" data-testid="tab-pair-all">All <span className="ml-1.5 text-xs text-muted-foreground">{data.length}</span></TabsTrigger>
            <TabsTrigger value="spot" data-testid="tab-pair-spot">Spot <span className="ml-1.5 text-xs text-muted-foreground">{stats.spot}</span></TabsTrigger>
            <TabsTrigger value="futures" data-testid="tab-pair-futures">Futures <span className="ml-1.5 text-xs text-muted-foreground">{stats.futures}</span></TabsTrigger>
            <TabsTrigger value="upcoming" data-testid="tab-pair-upcoming">Upcoming <span className="ml-1.5 text-xs text-muted-foreground">{stats.upcoming}</span></TabsTrigger>
            <TabsTrigger value="paused" data-testid="tab-pair-paused">Paused</TabsTrigger>
            <TabsTrigger value="delisted" data-testid="tab-pair-delisted">Delisted</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative md:w-80">
          <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input placeholder="Search symbol or coin…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" data-testid="input-search-pairs" />
        </div>
      </div>

      <div className="premium-card rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-3">Pair</th>
                <th className="text-right font-medium px-4 py-3">Last Price</th>
                <th className="text-right font-medium px-4 py-3">24h %</th>
                <th className="text-right font-medium px-4 py-3">24h Volume</th>
                <th className="text-right font-medium px-4 py-3">Maker / Taker</th>
                <th className="text-center font-medium px-4 py-3">Spot</th>
                <th className="text-center font-medium px-4 py-3">Futures</th>
                <th className="text-left font-medium px-4 py-3">Status</th>
                {isAdmin && <th className="text-right font-medium px-4 py-3 pr-5">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {isLoading && Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}><td className="px-4 py-3" colSpan={isAdmin ? 9 : 8}><Skeleton className="h-9 w-full" /></td></tr>
              ))}
              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={isAdmin ? 9 : 8} className="px-4 py-3">
                    <EmptyState
                      icon={ArrowLeftRight}
                      title="No pairs found"
                      description={search ? "Try adjusting your search." : "Add your first trading pair to get started."}
                      action={isAdmin && !search ? (<Button onClick={() => setOpen(true)} size="sm"><Plus className="w-4 h-4 mr-1.5" />Add Pair</Button>) : undefined}
                    />
                  </td>
                </tr>
              )}
              {!isLoading && paged.map((p) => {
                const change = Number(p.change24h);
                const up = change >= 0;
                const base = coinById.get(p.baseCoinId)?.symbol ?? "?";
                const quote = coinById.get(p.quoteCoinId)?.symbol ?? "?";
                const isUpcoming = p.tradingStartAt && new Date(p.tradingStartAt).getTime() > Date.now();
                return (
                  <tr key={p.id} className="hover:bg-muted/20 transition-colors" data-testid={`row-pair-${p.symbol}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-white text-[10px] font-bold ring-1 ring-white/15">
                          {base.slice(0, 3)}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold">{base}</span>
                            <span className="text-muted-foreground text-xs">/</span>
                            <span className="font-medium text-muted-foreground">{quote}</span>
                            {p.statsOverride && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-300" title="Manual stats locked">
                                <Lock className="w-2.5 h-2.5" />
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-muted-foreground tabular-nums">prec {p.pricePrecision}/{p.qtyPrecision}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium">
                      {fmt(p.lastPrice, p.pricePrecision || 6)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={cn(
                        "inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-medium tabular-nums",
                        up ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400",
                      )}>
                        {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {change.toFixed(2)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-xs text-muted-foreground">
                      {fmt(p.volume24h, 2)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-xs">
                      <span className="text-emerald-400">{(Number(p.makerFee) * 100).toFixed(3)}%</span>
                      {" / "}
                      <span className="text-amber-400">{(Number(p.takerFee) * 100).toFixed(3)}%</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Switch
                        checked={p.tradingEnabled}
                        disabled={!isAdmin || quickToggle.isPending}
                        onCheckedChange={(v) => quickToggle.mutate({ id: p.id, body: { tradingEnabled: v } })}
                        data-testid={`switch-spot-${p.symbol}`}
                      />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Switch
                        checked={p.futuresEnabled}
                        disabled={!isAdmin || quickToggle.isPending}
                        onCheckedChange={(v) => quickToggle.mutate({ id: p.id, body: { futuresEnabled: v } })}
                        data-testid={`switch-futures-${p.symbol}`}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        <StatusPill status={p.status} />
                        {isUpcoming && (
                          <span className="text-[10px] text-amber-300 inline-flex items-center gap-0.5">
                            <Calendar className="w-2.5 h-2.5" />opens {fmtCountdown(p.tradingStartAt)}
                          </span>
                        )}
                      </div>
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3 pr-4 text-right whitespace-nowrap">
                        <Button size="sm" variant="ghost" onClick={() => setEdit(p)} data-testid={`button-edit-pair-${p.symbol}`}>
                          <Pencil className="w-3.5 h-3.5 mr-1" />Edit
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => setDeleteFor(p)} data-testid={`button-delete-pair-${p.symbol}`}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <PaginationBar
          page={page}
          pageSize={pageSize}
          total={filtered.length}
          onPage={setPage}
          onPageSize={setPageSize}
          label="pairs"
        />
      </div>

      {isAdmin && (
        <PairFormDialog
          open={open} onOpenChange={setOpen}
          title="Add new pair" description="Select base and quote assets, then configure fees and precision."
          submitLabel="Add pair" submitting={create.isPending}
          coins={coins} onSubmit={(v) => create.mutate(v)}
        />
      )}
      {isAdmin && edit && (
        <PairFormDialog
          open={!!edit} onOpenChange={(o) => { if (!o) setEdit(null); }}
          title={`Edit ${edit.symbol}`} description="Update pair settings."
          submitLabel="Save changes" submitting={update.isPending}
          coins={coins} initial={edit} onSubmit={(v) => update.mutate({ id: edit.id, body: v })}
        />
      )}

      <Dialog open={!!deleteFor} onOpenChange={(o) => { if (!o) setDeleteFor(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-amber-400" />Delete pair</DialogTitle>
            <DialogDescription>
              {deleteFor && <>Sure delete <strong className="text-foreground">{deleteFor.symbol}</strong>? Open orders affect honge.</>}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteFor(null)}>Cancel</Button>
            <Button variant="destructive" disabled={remove.isPending} onClick={() => deleteFor && remove.mutate(deleteFor.id)} data-testid="button-confirm-delete-pair">
              {remove.isPending && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}Delete pair
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PairFormDialog({
  open, onOpenChange, title, description, submitLabel, submitting, coins, initial, onSubmit,
}: {
  open: boolean; onOpenChange: (o: boolean) => void;
  title: string; description?: string; submitLabel: string; submitting: boolean;
  coins: Coin[]; initial?: Pair; onSubmit: (v: Partial<Pair>) => void;
}) {
  const empty: Partial<Pair> = {
    pricePrecision: 2, qtyPrecision: 4, takerFee: "0.001", makerFee: "0.001",
    status: "active", tradingEnabled: true, futuresEnabled: false,
  };
  const [v, setV] = useState<Partial<Pair>>(initial ?? empty);
  useEffect(() => {
    if (open) setV(initial ?? empty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial?.id]);
  const set = (k: keyof Pair, val: any) => setV((p) => ({ ...p, [k]: val }));
  const canSave = !!v.baseCoinId && !!v.quoteCoinId && v.baseCoinId !== v.quoteCoinId && !submitting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="stat-orb w-10 h-10 rounded-lg flex items-center justify-center"><ArrowLeftRight className="w-5 h-5 text-amber-300" /></div>
            <div><DialogTitle>{title}</DialogTitle>{description && <DialogDescription>{description}</DialogDescription>}</div>
          </div>
        </DialogHeader>
        <div className="max-h-[68vh] overflow-y-auto pr-1 space-y-4">
          <FormSection icon={Tag} title="Identity">
            <Field label="Base coin *">
              <CoinSelect
                coins={coins}
                value={v.baseCoinId ? String(v.baseCoinId) : ""}
                onValueChange={(c) => set("baseCoinId", Number(c))}
                placeholder="Select base coin"
                data-testid="select-base-coin"
              />
            </Field>
            <Field label="Quote coin *">
              <CoinSelect
                coins={coins}
                value={v.quoteCoinId ? String(v.quoteCoinId) : ""}
                onValueChange={(c) => set("quoteCoinId", Number(c))}
                placeholder="Select quote coin"
                data-testid="select-quote-coin"
              />
            </Field>
            <Field label="Description" full>
              <Textarea rows={2} value={v.description ?? ""} onChange={(e) => set("description", e.target.value)} placeholder="Optional pair description shown to users" />
            </Field>
          </FormSection>

          <FormSection icon={Settings2} title="Precision & Limits">
            <Field label="Min qty"><Input value={v.minQty ?? "0"} onChange={(e) => set("minQty", e.target.value)} /></Field>
            <Field label="Max qty"><Input value={v.maxQty ?? "0"} onChange={(e) => set("maxQty", e.target.value)} /></Field>
            <Field label="Price precision (decimals)"><Input type="number" value={v.pricePrecision ?? 2} onChange={(e) => set("pricePrecision", Number(e.target.value))} /></Field>
            <Field label="Qty precision (decimals)"><Input type="number" value={v.qtyPrecision ?? 4} onChange={(e) => set("qtyPrecision", Number(e.target.value))} /></Field>
          </FormSection>

          <FormSection icon={CircleDollarSign} title="Fees & Status">
            <Field label="Maker fee (decimal)" hint="0.001 = 0.1%"><Input value={v.makerFee ?? "0.001"} onChange={(e) => set("makerFee", e.target.value)} data-testid="input-maker-fee" /></Field>
            <Field label="Taker fee (decimal)"><Input value={v.takerFee ?? "0.001"} onChange={(e) => set("takerFee", e.target.value)} data-testid="input-taker-fee" /></Field>
            <Field label="Status">
              <Select value={v.status ?? "active"} onValueChange={(s) => set("status", s)}>
                <SelectTrigger data-testid="select-pair-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                  <SelectItem value="delisted">Delisted</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </FormSection>

          <FormSection icon={Calendar} title="Listing Schedule">
            <Field label="Spot trading start" hint="Future = countdown to users">
              <Input type="datetime-local" value={v.tradingStartAt ? new Date(v.tradingStartAt).toISOString().slice(0, 16) : ""} onChange={(e) => set("tradingStartAt", (e.target.value || null) as any)} />
            </Field>
            <Field label="Futures start">
              <Input type="datetime-local" value={v.futuresStartAt ? new Date(v.futuresStartAt).toISOString().slice(0, 16) : ""} onChange={(e) => set("futuresStartAt", (e.target.value || null) as any)} />
            </Field>
            <Field label="Spot trading" full>
              <ToggleRow label={v.tradingEnabled ? "Spot enabled" : "Spot disabled"} icon={Activity} checked={!!v.tradingEnabled} onChange={(c) => set("tradingEnabled", c)} testId="switch-form-spot" />
            </Field>
            <Field label="Futures trading" full>
              <ToggleRow label={v.futuresEnabled ? "Futures enabled" : "Futures disabled"} icon={TrendingUp} checked={!!v.futuresEnabled} onChange={(c) => set("futuresEnabled", c)} testId="switch-form-futures" />
            </Field>
          </FormSection>

          <FormSection icon={BarChart3} title="Market Stats Override">
            <Field label="Manual stats lock" full hint="Enable to freeze high/low/volume/change to your custom values. Otherwise auto-recompute every 30s.">
              <ToggleRow label={v.statsOverride ? "Locked (manual)" : "Auto-recompute"} icon={v.statsOverride ? Lock : Unlock} checked={!!v.statsOverride} onChange={(c) => set("statsOverride", c)} testId="switch-stats-override" />
            </Field>
            <Field label="Last price"><Input value={v.lastPrice ?? ""} onChange={(e) => set("lastPrice", e.target.value)} placeholder="auto" /></Field>
            <Field label="24h change %"><Input value={v.change24h ?? ""} onChange={(e) => set("change24h", e.target.value)} placeholder="auto" /></Field>
            <Field label="24h high"><Input value={v.high24h ?? ""} onChange={(e) => set("high24h", e.target.value)} placeholder="auto" /></Field>
            <Field label="24h low"><Input value={v.low24h ?? ""} onChange={(e) => set("low24h", e.target.value)} placeholder="auto" /></Field>
            <Field label="24h volume (base)"><Input value={v.volume24h ?? ""} onChange={(e) => set("volume24h", e.target.value)} placeholder="auto" /></Field>
            <Field label="24h volume (quote)"><Input value={v.quoteVolume24h ?? ""} onChange={(e) => set("quoteVolume24h", e.target.value)} placeholder="auto" /></Field>
            <Field label="24h trades count"><Input type="number" value={v.trades24h ?? 0} onChange={(e) => set("trades24h", Number(e.target.value))} placeholder="auto" /></Field>
          </FormSection>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => onSubmit(v)} disabled={!canSave} data-testid="button-save-pair">
            {submitting && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}{submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ToggleRow({ label, icon: Icon, checked, onChange, testId }: {
  label: string; icon: any; checked: boolean; onChange: (c: boolean) => void; testId?: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5">
      <div className="flex items-center gap-2 text-sm">
        <Icon className={cn("w-4 h-4", checked ? "text-emerald-400" : "text-muted-foreground")} />
        <span>{label}</span>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} data-testid={testId} />
    </div>
  );
}

function FormSection({ icon: Icon, title, children }: { icon: any; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/10 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/60 bg-muted/20">
        <div className="stat-orb w-7 h-7 rounded-md flex items-center justify-center"><Icon className="w-3.5 h-3.5 text-amber-300" /></div>
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-4">{children}</div>
    </div>
  );
}

function Field({ label, hint, children, full }: { label: string; hint?: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={cn("space-y-1.5", full && "md:col-span-2")}>
      <Label className="text-xs">{label}</Label>{children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
