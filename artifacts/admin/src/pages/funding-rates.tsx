import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post, patch, del } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/premium/PageHeader";
import { PremiumStatCard } from "@/components/premium/PremiumStatCard";
import { StatusPill } from "@/components/premium/StatusPill";
import { EmptyState } from "@/components/premium/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  Percent, Plus, Pencil, Trash2, RefreshCw, Zap, Clock, CheckCircle2, Settings2,
  Loader2, AlertTriangle, Search, TrendingUp, ShieldAlert, Calendar, Tag,
} from "lucide-react";

type Pair = {
  id: number; symbol: string; futuresEnabled: boolean;
  fundingIntervalHours?: number; baseFundingRate?: string; fundingAutoCreate?: string;
  maxLeverage?: number; mmRate?: string;
};
type FundingRate = {
  id: number; pairId: number; rate: string; intervalHours: number; fundingTime: string; createdAt: string;
  source?: string; settled?: string; settledAt?: string | null; positionsAffected?: number; totalPaid?: string;
};
type EngineStatus = {
  fundingCreated: number; fundingSettled: number; totalSettlementValue: number;
  positionsLiquidated: number; positionsChecked: number;
  lastRiskAt: string | null; lastFundingAt: string | null; lastSettleAt: string | null;
  intervals: { funding: number; settle: number; risk: number };
};

function Countdown({ to }: { to: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(i); }, []);
  const diff = new Date(to).getTime() - now;
  if (diff <= 0) return <span className="text-amber-300 text-xs font-medium">due</span>;
  const h = Math.floor(diff / 3600_000);
  const m = Math.floor((diff % 3600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1000);
  return <span className="font-mono text-xs tabular-nums">{h}h {m}m {s}s</span>;
}

function relTime(s: string | null | undefined): string {
  if (!s) return "—";
  const t = new Date(s).getTime();
  if (!Number.isFinite(t)) return "—";
  const diff = Date.now() - t;
  const m = Math.round(diff / 60000);
  const h = Math.round(diff / 3600000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m ago`;
  if (h < 48) return `${h}h ago`;
  return `${Math.round(diff / 86400000)}d ago`;
}

export default function FundingRatesPage() {
  const { user: me } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const isAdmin = me?.role === "admin" || me?.role === "superadmin";

  const [tab, setTab] = useState("scheduled");
  const [search, setSearch] = useState("");
  const [filterPair, setFilterPair] = useState<string>("");
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<FundingRate | null>(null);
  const [deleteFor, setDeleteFor] = useState<FundingRate | null>(null);
  const [editPair, setEditPair] = useState<Pair | null>(null);

  const { data: pairs = [] } = useQuery<Pair[]>({ queryKey: ["/admin/pairs"], queryFn: () => get<Pair[]>("/admin/pairs") });
  const { data = [], isLoading, refetch, isFetching } = useQuery<FundingRate[]>({
    queryKey: ["/admin/funding-rates"], queryFn: () => get<FundingRate[]>("/admin/funding-rates"), refetchInterval: 15000,
  });
  const { data: engine } = useQuery<EngineStatus>({
    queryKey: ["/admin/futures-engine/status"], queryFn: () => get<EngineStatus>("/admin/futures-engine/status"), refetchInterval: 10000,
  });

  const create = useMutation({
    mutationFn: (v: Partial<FundingRate>) => post("/admin/funding-rates", v),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/admin/funding-rates"] }); setOpen(false); toast({ title: "Funding rate added" }); },
    onError: (e: Error) => toast({ title: "Add failed", description: e.message, variant: "destructive" }),
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<FundingRate> }) => patch(`/admin/funding-rates/${id}`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/admin/funding-rates"] }); setEdit(null); toast({ title: "Funding rate updated" }); },
    onError: (e: Error) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });
  const remove = useMutation({
    mutationFn: (id: number) => del(`/admin/funding-rates/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/admin/funding-rates"] }); setDeleteFor(null); toast({ title: "Funding rate removed" }); },
    onError: (e: Error) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });
  const updatePair = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<Pair> }) => patch(`/admin/pairs/${id}`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/admin/pairs"] }); setEditPair(null); toast({ title: "Pair config saved" }); },
    onError: (e: Error) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });
  const runFunding = useMutation({
    mutationFn: () => post<{ created: number; settled: { settled: number; totalValue: number } }>("/admin/futures-engine/run-funding", {}),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["/admin/funding-rates"] });
      qc.invalidateQueries({ queryKey: ["/admin/futures-engine/status"] });
      toast({ title: "Engine tick complete", description: `${r.created} created · ${r.settled.settled} settled` });
    },
    onError: (e: Error) => toast({ title: "Engine run failed", description: e.message, variant: "destructive" }),
  });

  const pairById = useMemo(() => new Map(pairs.map((p) => [p.id, p])), [pairs]);
  const sym = (id: number) => pairById.get(id)?.symbol ?? `#${id}`;
  const futuresPairs = useMemo(() => pairs.filter((p) => p.futuresEnabled), [pairs]);

  const stats = useMemo(() => {
    const total = data.length;
    const pending = data.filter((d) => d.settled !== "true" && new Date(d.fundingTime).getTime() <= Date.now()).length;
    const scheduled = data.filter((d) => d.settled !== "true" && new Date(d.fundingTime).getTime() > Date.now()).length;
    const settled = data.filter((d) => d.settled === "true").length;
    return { total, pending, scheduled, settled };
  }, [data]);

  const filtered = useMemo(() => {
    let rows = data;
    if (filterPair) rows = rows.filter((d) => d.pairId === Number(filterPair));
    rows = rows.filter((d) => {
      if (tab === "scheduled" && !(d.settled !== "true" && new Date(d.fundingTime).getTime() > Date.now())) return false;
      if (tab === "pending" && !(d.settled !== "true" && new Date(d.fundingTime).getTime() <= Date.now())) return false;
      if (tab === "settled" && d.settled !== "true") return false;
      if (tab === "auto" && d.source !== "auto") return false;
      if (tab === "manual" && d.source !== "manual") return false;
      return true;
    });
    const q = search.trim().toUpperCase();
    if (q) rows = rows.filter((d) => sym(d.pairId).toUpperCase().includes(q));
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, tab, filterPair, search, pairById]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Markets & Trading"
        title="Funding & Risk"
        description="Perpetual futures funding engine, per-pair risk parameters aur manual rate overrides — sab live."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} data-testid="button-refresh-funding">
              <RefreshCw className={cn("w-4 h-4 mr-1.5", isFetching && "animate-spin")} />Refresh
            </Button>
            {isAdmin && (
              <Button size="sm" variant="secondary" onClick={() => runFunding.mutate()} disabled={runFunding.isPending} data-testid="button-run-funding">
                {runFunding.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Zap className="w-4 h-4 mr-1.5" />}
                Run engine tick
              </Button>
            )}
            {isAdmin && (
              <Button onClick={() => setOpen(true)} data-testid="button-add-funding">
                <Plus className="w-4 h-4 mr-1.5" />Add manual rate
              </Button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 md:gap-4">
        <PremiumStatCard title="Funding Created" value={engine?.fundingCreated ?? 0} icon={Zap} hero hint={`Last: ${engine?.lastFundingAt ? relTime(engine.lastFundingAt) : "—"}`} />
        <PremiumStatCard title="Settled" value={engine?.fundingSettled ?? 0} icon={CheckCircle2} hint={`Total $${(engine?.totalSettlementValue ?? 0).toFixed(2)}`} />
        <PremiumStatCard title="Risk Checks" value={engine?.positionsChecked ?? 0} icon={ShieldAlert} hint={`${engine?.positionsLiquidated ?? 0} liquidated`} />
        <PremiumStatCard title="Scheduled" value={stats.scheduled} icon={Calendar} hint="Future entries" />
        <PremiumStatCard title="Pending" value={stats.pending} icon={Clock} hint="Due to settle" />
        <PremiumStatCard title="Futures Pairs" value={futuresPairs.length} icon={TrendingUp} hint="Available markets" />
      </div>

      {/* Pair risk config card */}
      <div className="premium-card rounded-xl overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 md:px-5 pt-4 pb-3 border-b border-border/60">
          <div className="flex items-center gap-2.5">
            <div className="stat-orb w-8 h-8 rounded-md flex items-center justify-center"><Settings2 className="w-4 h-4 text-amber-300" /></div>
            <div>
              <h3 className="text-sm font-semibold">Futures Pair Risk Config</h3>
              <p className="text-xs text-muted-foreground">{futuresPairs.length} active futures pair{futuresPairs.length === 1 ? "" : "s"}</p>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/20 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-2.5">Pair</th>
                <th className="text-left font-medium px-4 py-2.5">Auto-create</th>
                <th className="text-right font-medium px-4 py-2.5">Interval</th>
                <th className="text-right font-medium px-4 py-2.5">Base rate</th>
                <th className="text-right font-medium px-4 py-2.5">Max leverage</th>
                <th className="text-right font-medium px-4 py-2.5">Maint. margin</th>
                {isAdmin && <th className="text-right font-medium px-4 py-2.5 pr-5">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {futuresPairs.length === 0 && (
                <tr><td colSpan={isAdmin ? 7 : 6} className="px-4 py-3"><EmptyState icon={TrendingUp} title="No futures pairs" description="Enable futures on a pair from the Trading Pairs page." /></td></tr>
              )}
              {futuresPairs.map((p) => (
                <tr key={p.id} className="hover:bg-muted/20 transition-colors" data-testid={`pair-cfg-${p.id}`}>
                  <td className="px-4 py-2.5 font-bold">{p.symbol}</td>
                  <td className="px-4 py-2.5">
                    {p.fundingAutoCreate === "true"
                      ? <StatusPill variant="success">Auto</StatusPill>
                      : <StatusPill variant="neutral">Manual</StatusPill>}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{p.fundingIntervalHours ?? 8}h</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{Number(p.baseFundingRate ?? 0.0001).toFixed(6)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{p.maxLeverage ?? 100}x</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{(Number(p.mmRate ?? 0.005) * 100).toFixed(2)}%</td>
                  {isAdmin && (
                    <td className="px-4 py-2.5 pr-5 text-right">
                      <Button size="sm" variant="ghost" onClick={() => setEditPair(p)} data-testid={`button-cfg-${p.id}`}>
                        <Settings2 className="w-3.5 h-3.5 mr-1" />Configure
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
        <Tabs value={tab} onValueChange={setTab} className="w-full md:w-auto">
          <TabsList className="overflow-x-auto">
            <TabsTrigger value="all" data-testid="tab-fr-all">All <span className="ml-1.5 text-xs text-muted-foreground">{stats.total}</span></TabsTrigger>
            <TabsTrigger value="scheduled" data-testid="tab-fr-scheduled">Scheduled <span className="ml-1.5 text-xs text-muted-foreground">{stats.scheduled}</span></TabsTrigger>
            <TabsTrigger value="pending" data-testid="tab-fr-pending">Pending <span className="ml-1.5 text-xs text-muted-foreground">{stats.pending}</span></TabsTrigger>
            <TabsTrigger value="settled" data-testid="tab-fr-settled">Settled <span className="ml-1.5 text-xs text-muted-foreground">{stats.settled}</span></TabsTrigger>
            <TabsTrigger value="auto" data-testid="tab-fr-auto">Auto</TabsTrigger>
            <TabsTrigger value="manual" data-testid="tab-fr-manual">Manual</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-2 md:w-auto">
          <Select value={filterPair || "_all"} onValueChange={(v) => setFilterPair(v === "_all" ? "" : v)}>
            <SelectTrigger className="w-44" data-testid="select-pair-filter"><SelectValue placeholder="All pairs" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">All pairs</SelectItem>
              {futuresPairs.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.symbol}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="relative w-52">
            <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
            <Input className="pl-8" placeholder="Search pair…" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="input-search-funding" />
          </div>
        </div>
      </div>

      <div className="premium-card rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-3">Pair</th>
                <th className="text-left font-medium px-4 py-3">Source</th>
                <th className="text-right font-medium px-4 py-3">Rate %</th>
                <th className="text-left font-medium px-4 py-3">Funding Time</th>
                <th className="text-left font-medium px-4 py-3">Countdown</th>
                <th className="text-left font-medium px-4 py-3">Status</th>
                <th className="text-right font-medium px-4 py-3">Total Paid</th>
                {isAdmin && <th className="text-right font-medium px-4 py-3 pr-5">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {isLoading && Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}><td className="px-4 py-3" colSpan={isAdmin ? 8 : 7}><Skeleton className="h-9 w-full" /></td></tr>
              ))}
              {!isLoading && filtered.length === 0 && (
                <tr><td colSpan={isAdmin ? 8 : 7} className="px-4 py-3">
                  <EmptyState icon={Percent} title="No funding rates" description={search || filterPair ? "Try adjusting your filters." : "Add a manual rate or let the funding engine tick."} />
                </td></tr>
              )}
              {!isLoading && filtered.map((f) => {
                const pct = (Number(f.rate) * 100).toFixed(4);
                const due = new Date(f.fundingTime).getTime() <= Date.now();
                const positive = Number(f.rate) >= 0;
                return (
                  <tr key={f.id} className="hover:bg-muted/20 transition-colors" data-testid={`fr-${f.id}`}>
                    <td className="px-4 py-3 font-bold">{sym(f.pairId)}</td>
                    <td className="px-4 py-3">
                      {f.source === "auto"
                        ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/25"><Zap className="w-3 h-3" />Auto</span>
                        : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-violet-500/15 text-violet-300 border border-violet-500/30">Manual</span>}
                    </td>
                    <td className={cn("px-4 py-3 text-right tabular-nums font-medium", positive ? "text-emerald-400" : "text-red-400")}>
                      {positive ? "+" : ""}{pct}%
                    </td>
                    <td className="px-4 py-3 text-xs">{new Date(f.fundingTime).toLocaleString("en-IN")}</td>
                    <td className="px-4 py-3">
                      {f.settled === "true" ? <span className="text-xs text-muted-foreground">—</span> : <Countdown to={f.fundingTime} />}
                    </td>
                    <td className="px-4 py-3">
                      {f.settled === "true"
                        ? <StatusPill variant="success">Settled</StatusPill>
                        : due ? <StatusPill variant="warning">Pending</StatusPill> : <StatusPill variant="info">Scheduled</StatusPill>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-xs">
                      {f.settled === "true" ? (
                        <div>
                          <div className="font-medium">${Number(f.totalPaid ?? 0).toFixed(2)}</div>
                          <div className="text-[10px] text-muted-foreground">{f.positionsAffected ?? 0} positions</div>
                        </div>
                      ) : "—"}
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3 pr-4 text-right whitespace-nowrap">
                        <Button size="sm" variant="ghost" onClick={() => setEdit(f)} data-testid={`button-edit-fr-${f.id}`}>
                          <Pencil className="w-3.5 h-3.5 mr-1" />Edit
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => setDeleteFor(f)} data-testid={`button-delete-fr-${f.id}`}>
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
        <div className="border-t border-border/60 px-4 py-2.5 flex items-center justify-between text-xs text-muted-foreground bg-muted/10">
          <div>{filtered.length} of {data.length} entries</div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1"><Zap className="w-3 h-3" /> last tick {engine?.lastFundingAt ? relTime(engine.lastFundingAt) : "—"}</span>
          </div>
        </div>
      </div>

      {/* Add manual rate */}
      {isAdmin && (
        <FundingFormDialog
          open={open} onOpenChange={setOpen}
          title="Add manual funding rate" description="Set a custom funding rate for a specific pair."
          submitLabel="Add rate" submitting={create.isPending}
          pairs={futuresPairs} onSubmit={(v) => create.mutate(v)}
        />
      )}
      {isAdmin && edit && (
        <FundingFormDialog
          open={!!edit} onOpenChange={(o) => { if (!o) setEdit(null); }}
          title="Edit funding rate" description="Change rate ya funding time."
          submitLabel="Save changes" submitting={update.isPending}
          pairs={futuresPairs} initial={edit} onSubmit={(v) => update.mutate({ id: edit.id, body: v })}
        />
      )}
      {isAdmin && editPair && (
        <PairConfigDialog
          open={!!editPair} onOpenChange={(o) => { if (!o) setEditPair(null); }}
          pair={editPair} submitting={updatePair.isPending}
          onSubmit={(v) => updatePair.mutate({ id: editPair.id, body: v })}
        />
      )}

      <Dialog open={!!deleteFor} onOpenChange={(o) => { if (!o) setDeleteFor(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-amber-400" />Delete funding rate</DialogTitle>
            <DialogDescription>This entry will be permanently deleted and cannot be recovered.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteFor(null)}>Cancel</Button>
            <Button variant="destructive" disabled={remove.isPending} onClick={() => deleteFor && remove.mutate(deleteFor.id)} data-testid="button-confirm-delete-fr">
              {remove.isPending && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FundingFormDialog({
  open, onOpenChange, title, description, submitLabel, submitting, pairs, initial, onSubmit,
}: {
  open: boolean; onOpenChange: (o: boolean) => void;
  title: string; description?: string; submitLabel: string; submitting: boolean;
  pairs: Pair[]; initial?: FundingRate; onSubmit: (v: Partial<FundingRate>) => void;
}) {
  const empty: Partial<FundingRate> = { intervalHours: 8, fundingTime: new Date(Date.now() + 8 * 3600_000).toISOString() };
  const [v, setV] = useState<Partial<FundingRate>>(initial ?? empty);
  useEffect(() => { if (open) setV(initial ?? empty); /* eslint-disable-next-line */ }, [open, initial?.id]);
  const set = (k: keyof FundingRate, val: any) => setV((p) => ({ ...p, [k]: val }));
  const canSave = !!v.pairId && !!v.rate && !submitting;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="stat-orb w-10 h-10 rounded-lg flex items-center justify-center"><Percent className="w-5 h-5 text-amber-300" /></div>
            <div><DialogTitle>{title}</DialogTitle>{description && <DialogDescription>{description}</DialogDescription>}</div>
          </div>
        </DialogHeader>
        <div className="space-y-4">
          <FormSection icon={Tag} title="Funding details">
            <Field label="Pair *">
              <Select value={v.pairId ? String(v.pairId) : ""} onValueChange={(p) => set("pairId", Number(p))}>
                <SelectTrigger data-testid="select-fr-pair"><SelectValue placeholder="Select pair" /></SelectTrigger>
                <SelectContent>{pairs.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.symbol}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Rate (decimal) *" hint="0.0001 = 0.01% per interval">
              <Input value={v.rate ?? ""} onChange={(e) => set("rate", e.target.value)} placeholder="0.0001" data-testid="input-fr-rate" />
            </Field>
            <Field label="Interval (hours)">
              <Input type="number" value={v.intervalHours ?? 8} onChange={(e) => set("intervalHours", Number(e.target.value))} data-testid="input-fr-interval" />
            </Field>
            <Field label="Funding time *">
              <Input type="datetime-local" value={v.fundingTime ? new Date(v.fundingTime).toISOString().slice(0, 16) : ""} onChange={(e) => set("fundingTime", e.target.value)} data-testid="input-fr-time" />
            </Field>
          </FormSection>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => onSubmit(v)} disabled={!canSave} data-testid="button-save-funding">
            {submitting && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}{submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PairConfigDialog({
  open, onOpenChange, pair, submitting, onSubmit,
}: { open: boolean; onOpenChange: (o: boolean) => void; pair: Pair; submitting: boolean; onSubmit: (v: Partial<Pair>) => void }) {
  const [v, setV] = useState<Partial<Pair>>({
    fundingIntervalHours: pair.fundingIntervalHours ?? 8,
    baseFundingRate: pair.baseFundingRate ?? "0.0001",
    fundingAutoCreate: pair.fundingAutoCreate ?? "true",
    maxLeverage: pair.maxLeverage ?? 100,
    mmRate: pair.mmRate ?? "0.005",
  });
  useEffect(() => {
    if (open) setV({
      fundingIntervalHours: pair.fundingIntervalHours ?? 8,
      baseFundingRate: pair.baseFundingRate ?? "0.0001",
      fundingAutoCreate: pair.fundingAutoCreate ?? "true",
      maxLeverage: pair.maxLeverage ?? 100,
      mmRate: pair.mmRate ?? "0.005",
    });
  }, [open, pair.id]);
  const set = (k: keyof Pair, val: any) => setV((p) => ({ ...p, [k]: val }));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="stat-orb w-10 h-10 rounded-lg flex items-center justify-center"><Settings2 className="w-5 h-5 text-amber-300" /></div>
            <div>
              <DialogTitle>Risk config — {pair.symbol}</DialogTitle>
              <DialogDescription>Funding aur leverage parameters.</DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <div className="space-y-4">
          <FormSection icon={Settings2} title="Configuration">
            <Field label="Auto-create funding rates">
              <Select value={v.fundingAutoCreate ?? "true"} onValueChange={(x) => set("fundingAutoCreate", x)}>
                <SelectTrigger data-testid="select-auto-create"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Enabled</SelectItem>
                  <SelectItem value="false">Disabled (manual only)</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Interval (hours)">
              <Input type="number" value={v.fundingIntervalHours ?? 8} onChange={(e) => set("fundingIntervalHours", Number(e.target.value))} />
            </Field>
            <Field label="Base funding rate" hint="0.0001 = 0.01%">
              <Input value={v.baseFundingRate ?? ""} onChange={(e) => set("baseFundingRate", e.target.value)} />
            </Field>
            <Field label="Max leverage (x)">
              <Input type="number" value={v.maxLeverage ?? 100} onChange={(e) => set("maxLeverage", Number(e.target.value))} />
            </Field>
            <Field label="Maintenance margin rate" hint="0.005 = 0.5%" full>
              <Input value={v.mmRate ?? ""} onChange={(e) => set("mmRate", e.target.value)} />
            </Field>
          </FormSection>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => onSubmit(v)} disabled={submitting} data-testid="button-save-pair-cfg">
            {submitting && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}Save config
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
