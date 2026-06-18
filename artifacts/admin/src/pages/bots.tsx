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
import { Switch } from "@/components/ui/switch";
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
  Bot as BotIcon, Plus, Pencil, Trash2, Search, Activity, Loader2, AlertTriangle,
  Zap, Calendar, RefreshCw, Layers, Tag, TrendingUp, Flame, Clock,
  CheckCircle2, XCircle, AlertCircle,
} from "lucide-react";

type Pair = { id: number; symbol: string };
type Bot = {
  id: number; pairId: number; enabled: boolean;
  spreadBps: number; levels: number; priceStepBps: number;
  orderSize: string; refreshSec: number; maxOrderAgeSec: number;
  fillOnCross: boolean; spotEnabled: boolean; futuresEnabled: boolean;
  topOfBookBoostPct: number;
  marketTakerEnabled: boolean; marketTakerSizeMult: string;
  priceMoveTriggerBps: number; bigOrderTriggerQty: string; bigOrderAbsorbMult: string;
  marketTakerCooldownSec: number;
  lastMarketOrderAt: string | null; lastMidPrice: string | null;
  startAt: string | null; status: string; lastRunAt: string | null; lastError: string | null;
};

function toLocalDtInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function statusVariant(s: string): "success" | "warning" | "danger" | "info" | "neutral" {
  if (s === "running") return "success";
  if (s === "scheduled") return "info";
  if (s === "error") return "danger";
  if (s === "no_price") return "warning";
  if (s === "disabled") return "neutral";
  return "neutral";
}

function relTime(s: string | null): string {
  if (!s) return "—";
  const diff = Date.now() - new Date(s).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function BotsPage() {
  const { user: me } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const isAdmin = me?.role === "admin" || me?.role === "superadmin";
  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Bot | null>(null);
  const [deleteFor, setDeleteFor] = useState<Bot | null>(null);

  const { data: bots = [], isLoading, refetch, isFetching } = useQuery<Bot[]>({
    queryKey: ["bots"], queryFn: () => get<Bot[]>("/admin/bots"), refetchInterval: 5000,
  });
  const { data: pairs = [] } = useQuery<Pair[]>({ queryKey: ["pairs"], queryFn: () => get<Pair[]>("/admin/pairs") });

  const inv = () => qc.invalidateQueries({ queryKey: ["bots"] });
  const create = useMutation({
    mutationFn: (v: Partial<Bot>) => post("/admin/bots", v),
    onSuccess: () => { inv(); setCreateOpen(false); toast({ title: "Bot created" }); },
    onError: (e: Error) => toast({ title: "Create failed", description: e.message, variant: "destructive" }),
  });
  const update = useMutation({
    mutationFn: ({ id, v }: { id: number; v: Partial<Bot> }) => patch(`/admin/bots/${id}`, v),
    onSuccess: () => { inv(); setEditing(null); toast({ title: "Bot updated" }); },
    onError: (e: Error) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });
  const remove = useMutation({
    mutationFn: (id: number) => del(`/admin/bots/${id}`),
    onSuccess: () => { inv(); setDeleteFor(null); toast({ title: "Bot removed" }); },
    onError: (e: Error) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });
  const toggle = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) => patch(`/admin/bots/${id}`, { enabled }),
    onSuccess: inv,
    onError: (e: Error) => toast({ title: "Toggle failed", description: e.message, variant: "destructive" }),
  });

  const pairById = useMemo(() => new Map(pairs.map((p) => [p.id, p.symbol])), [pairs]);
  const takenPairIds = useMemo(() => bots.map((b) => b.pairId), [bots]);

  const stats = useMemo(() => {
    const total = bots.length;
    const running = bots.filter((b) => b.status === "running").length;
    const scheduled = bots.filter((b) => b.status === "scheduled").length;
    const errors = bots.filter((b) => b.status === "error").length;
    const enabled = bots.filter((b) => b.enabled).length;
    const taker = bots.filter((b) => b.marketTakerEnabled).length;
    return { total, running, scheduled, errors, enabled, taker };
  }, [bots]);

  const filtered = useMemo(() => {
    const q = search.trim().toUpperCase();
    return bots.filter((b) => {
      if (q) {
        const sym = (pairById.get(b.pairId) ?? "").toUpperCase();
        if (!sym.includes(q)) return false;
      }
      if (tab === "running" && b.status !== "running") return false;
      if (tab === "scheduled" && b.status !== "scheduled") return false;
      if (tab === "error" && b.status !== "error") return false;
      if (tab === "disabled" && b.enabled) return false;
      if (tab === "taker" && !b.marketTakerEnabled) return false;
      return true;
    });
  }, [bots, search, tab, pairById]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Markets & Trading"
        title="Market-Maker Bots"
        description="Per-pair market-making bots — spread, levels, refresh, market-taker mode aur scheduled starts. Auto-cancel + auto-fill management."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} data-testid="button-refresh-bots">
              <RefreshCw className={cn("w-4 h-4 mr-1.5", isFetching && "animate-spin")} />Refresh
            </Button>
            {isAdmin && (
              <Button onClick={() => setCreateOpen(true)} data-testid="button-add-bot">
                <Plus className="w-4 h-4 mr-1.5" />Add bot
              </Button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 md:gap-4">
        <PremiumStatCard title="Total Bots" value={stats.total} icon={BotIcon} hero hint={`${pairs.length} pairs available`} />
        <PremiumStatCard title="Running" value={stats.running} icon={Activity} hint={`${stats.enabled} enabled`} />
        <PremiumStatCard title="Scheduled" value={stats.scheduled} icon={Calendar} hint="Awaiting start" />
        <PremiumStatCard title="Errors" value={stats.errors} icon={AlertCircle} hint="Need attention" />
        <PremiumStatCard title="Market Taker" value={stats.taker} icon={Flame} hint="Aggressive mode" />
        <PremiumStatCard title="Disabled" value={stats.total - stats.enabled} icon={XCircle} hint="Off via switch" />
      </div>

      <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
        <Tabs value={tab} onValueChange={setTab} className="w-full md:w-auto">
          <TabsList className="overflow-x-auto">
            <TabsTrigger value="all" data-testid="tab-bot-all">All <span className="ml-1.5 text-xs text-muted-foreground">{bots.length}</span></TabsTrigger>
            <TabsTrigger value="running" data-testid="tab-bot-running">Running <span className="ml-1.5 text-xs text-muted-foreground">{stats.running}</span></TabsTrigger>
            <TabsTrigger value="scheduled" data-testid="tab-bot-scheduled">Scheduled <span className="ml-1.5 text-xs text-muted-foreground">{stats.scheduled}</span></TabsTrigger>
            <TabsTrigger value="error" data-testid="tab-bot-error">Errors <span className="ml-1.5 text-xs text-muted-foreground">{stats.errors}</span></TabsTrigger>
            <TabsTrigger value="disabled" data-testid="tab-bot-disabled">Disabled</TabsTrigger>
            <TabsTrigger value="taker" data-testid="tab-bot-taker">Taker</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative md:w-80">
          <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search pair…" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="input-search-bots" />
        </div>
      </div>

      <div className="premium-card rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-3">Pair</th>
                <th className="text-left font-medium px-4 py-3">Status</th>
                <th className="text-center font-medium px-4 py-3">Enabled</th>
                <th className="text-left font-medium px-4 py-3">Mode</th>
                <th className="text-left font-medium px-4 py-3">Schedule</th>
                <th className="text-right font-medium px-4 py-3">Spread / Levels</th>
                <th className="text-right font-medium px-4 py-3">Order size</th>
                <th className="text-left font-medium px-4 py-3">Last run</th>
                {isAdmin && <th className="text-right font-medium px-4 py-3 pr-5">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {isLoading && Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}><td className="px-4 py-3" colSpan={isAdmin ? 9 : 8}><Skeleton className="h-9 w-full" /></td></tr>
              ))}
              {!isLoading && filtered.length === 0 && (
                <tr><td colSpan={isAdmin ? 9 : 8} className="px-4 py-3">
                  <EmptyState icon={BotIcon} title="No bots" description={search || tab !== "all" ? "Try adjusting your filters." : "Create your first market-maker bot to get started."}
                    action={isAdmin && !search && tab === "all" ? <Button onClick={() => setCreateOpen(true)} size="sm"><Plus className="w-4 h-4 mr-1.5" />Add bot</Button> : undefined} />
                </td></tr>
              )}
              {!isLoading && filtered.map((b) => {
                const startMs = b.startAt ? new Date(b.startAt).getTime() : 0;
                const startsIn = startMs > Date.now() ? Math.ceil((startMs - Date.now()) / 1000) : 0;
                return (
                  <tr key={b.id} className="hover:bg-muted/20 transition-colors" data-testid={`bot-${b.id}`}>
                    <td className="px-4 py-3 font-mono font-bold">{pairById.get(b.pairId) ?? `#${b.pairId}`}</td>
                    <td className="px-4 py-3">
                      <StatusPill variant={statusVariant(b.status)}>{b.status}</StatusPill>
                      {b.lastError && <div className="text-[10px] text-red-400 mt-1 max-w-[180px] truncate" title={b.lastError}>{b.lastError}</div>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Switch checked={b.enabled} disabled={!isAdmin || toggle.isPending} onCheckedChange={(c) => toggle.mutate({ id: b.id, enabled: c })} data-testid={`switch-bot-${b.id}`} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {b.spotEnabled && <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/25">Spot</span>}
                        {b.futuresEnabled && <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-violet-500/15 text-violet-300 border border-violet-500/30">Futures</span>}
                        {b.marketTakerEnabled && <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/15 text-amber-300 border border-amber-500/30 inline-flex items-center gap-0.5"><Flame className="w-2.5 h-2.5" />Taker</span>}
                        {b.fillOnCross && <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-sky-500/15 text-sky-300 border border-sky-500/30">Auto-fill</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {!b.startAt ? <span className="text-muted-foreground">Immediate</span>
                        : startsIn > 0 ? <span className="text-sky-300 inline-flex items-center gap-1"><Clock className="w-3 h-3" />in {startsIn > 3600 ? `${Math.floor(startsIn / 3600)}h ${Math.floor((startsIn % 3600) / 60)}m` : `${Math.floor(startsIn / 60)}m ${startsIn % 60}s`}</span>
                          : <span className="text-muted-foreground">{new Date(b.startAt).toLocaleString()}</span>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-xs">
                      <div>{(b.spreadBps / 100).toFixed(2)}%</div>
                      <div className="text-muted-foreground">{b.levels}/side</div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-xs">{Number(b.orderSize).toFixed(4)}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{relTime(b.lastRunAt)}</td>
                    {isAdmin && (
                      <td className="px-4 py-3 pr-4 text-right whitespace-nowrap">
                        <Button size="sm" variant="ghost" onClick={() => setEditing(b)} data-testid={`button-edit-bot-${b.id}`}>
                          <Pencil className="w-3.5 h-3.5 mr-1" />Edit
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => setDeleteFor(b)} data-testid={`button-delete-bot-${b.id}`}>
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
          <div>{filtered.length} of {bots.length} bots</div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> {stats.running} running</span>
            <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-400" /> {stats.errors} errors</span>
          </div>
        </div>
      </div>

      <BotFormDialog
        open={createOpen} onOpenChange={setCreateOpen}
        title="New market-maker bot" description="Select a pair, then configure spread, levels, and taker mode."
        submitLabel="Create bot" submitting={create.isPending}
        pairs={pairs} takenPairIds={takenPairIds} onSubmit={(v) => create.mutate(v)}
      />
      {editing && (
        <BotFormDialog
          open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}
          title={`Edit bot — ${pairById.get(editing.pairId) ?? "?"}`} description="Live changes will be applied within 5 seconds."
          submitLabel="Save bot" submitting={update.isPending}
          pairs={pairs} takenPairIds={takenPairIds} initial={editing}
          onSubmit={(v) => update.mutate({ id: editing.id, v })}
        />
      )}

      <Dialog open={!!deleteFor} onOpenChange={(o) => { if (!o) setDeleteFor(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-amber-400" />Delete bot</DialogTitle>
            <DialogDescription>
              {deleteFor && <>Delete the bot for <strong className="text-foreground">{pairById.get(deleteFor.pairId)}</strong>? All open orders placed by this bot will be cancelled.</>}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteFor(null)}>Cancel</Button>
            <Button variant="destructive" disabled={remove.isPending} onClick={() => deleteFor && remove.mutate(deleteFor.id)} data-testid="button-confirm-delete-bot">
              {remove.isPending && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}Delete bot
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BotFormDialog({
  open, onOpenChange, title, description, submitLabel, submitting,
  pairs, takenPairIds, initial, onSubmit,
}: {
  open: boolean; onOpenChange: (o: boolean) => void;
  title: string; description?: string; submitLabel: string; submitting: boolean;
  pairs: Pair[]; takenPairIds: number[]; initial?: Bot;
  onSubmit: (v: Partial<Bot>) => void;
}) {
  const empty: Partial<Bot> = {
    enabled: false, spreadBps: 20, levels: 5, priceStepBps: 10,
    orderSize: "0.01", refreshSec: 8, maxOrderAgeSec: 60, fillOnCross: true,
    spotEnabled: true, futuresEnabled: false, startAt: null, topOfBookBoostPct: 50,
    marketTakerEnabled: false, marketTakerSizeMult: "2.00",
    priceMoveTriggerBps: 30, bigOrderTriggerQty: "0", bigOrderAbsorbMult: "1.50",
    marketTakerCooldownSec: 30,
  };
  const [v, setV] = useState<Partial<Bot>>(initial ?? empty);
  const [pairSearch, setPairSearch] = useState("");
  useEffect(() => { if (open) { setV(initial ?? empty); setPairSearch(""); } /* eslint-disable-next-line */ }, [open, initial?.id]);
  const set = (k: keyof Bot, val: any) => setV((p) => ({ ...p, [k]: val }));
  const isEdit = !!initial?.id;
  const basePairs = isEdit ? pairs : pairs.filter((p) => !takenPairIds.includes(p.id));
  const q = pairSearch.trim().toUpperCase();
  const availablePairs = q ? basePairs.filter((p) => p.symbol.toUpperCase().includes(q)) : basePairs;
  const startAtLocal = toLocalDtInput(v.startAt as any);
  const canSave = !!v.pairId && !submitting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="stat-orb w-10 h-10 rounded-lg flex items-center justify-center"><BotIcon className="w-5 h-5 text-amber-300" /></div>
            <div><DialogTitle>{title}</DialogTitle>{description && <DialogDescription>{description}</DialogDescription>}</div>
          </div>
        </DialogHeader>
        <div className="max-h-[68vh] overflow-y-auto pr-1 space-y-4">
          <FormSection icon={Tag} title="Identity">
            <Field label={isEdit ? "Pair" : "Pair *"} full hint={isEdit ? "Pair locked once bot is created" : `${availablePairs.length} of ${basePairs.length} available (filtered)`}>
              {!isEdit && (
                <Input className="mb-2" placeholder="Filter pair (e.g. BTC, USDT)" value={pairSearch} onChange={(e) => setPairSearch(e.target.value)} />
              )}
              <Select value={v.pairId ? String(v.pairId) : ""} onValueChange={(c) => set("pairId", Number(c))} disabled={isEdit}>
                <SelectTrigger data-testid="select-bot-pair"><SelectValue placeholder={availablePairs.length ? "Select trading pair" : "No matching pair"} /></SelectTrigger>
                <SelectContent>
                  {availablePairs.length === 0
                    ? <div className="px-3 py-2 text-sm text-muted-foreground">No pairs match "{pairSearch}"</div>
                    : availablePairs.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.symbol}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Master switch" full>
              <ToggleRow label={v.enabled ? "Bot enabled" : "Bot disabled"} icon={v.enabled ? CheckCircle2 : XCircle} checked={!!v.enabled} onChange={(c) => set("enabled", c)} testId="switch-bot-master" />
            </Field>
            <Field label="Spot trading">
              <ToggleRow label={v.spotEnabled ? "Spot on" : "Spot off"} icon={Activity} checked={!!v.spotEnabled} onChange={(c) => set("spotEnabled", c)} />
            </Field>
            <Field label="Futures trading">
              <ToggleRow label={v.futuresEnabled ? "Futures on" : "Futures off"} icon={TrendingUp} checked={!!v.futuresEnabled} onChange={(c) => set("futuresEnabled", c)} />
            </Field>
            <Field label="Auto-fill on cross" full hint="Bot auto-fills orders when price crosses">
              <ToggleRow label={v.fillOnCross ? "Auto-fill enabled" : "Auto-fill disabled"} icon={Zap} checked={!!v.fillOnCross} onChange={(c) => set("fillOnCross", c)} />
            </Field>
            <Field label="Start at" full hint="Leave blank to start immediately. Bot idles until this time.">
              <div className="flex gap-2">
                <Input type="datetime-local" value={startAtLocal} onChange={(e) => set("startAt", e.target.value ? new Date(e.target.value).toISOString() : null)} data-testid="input-bot-startat" />
                {v.startAt && <Button variant="ghost" size="sm" onClick={() => set("startAt", null)}>Clear</Button>}
              </div>
            </Field>
          </FormSection>

          <FormSection icon={Layers} title="Order Book Strategy">
            <Field label="Spread (bps)" hint="20 = 0.20% from mid"><Input type="number" value={v.spreadBps ?? 20} onChange={(e) => set("spreadBps", Number(e.target.value))} data-testid="input-spread" /></Field>
            <Field label="Levels per side"><Input type="number" value={v.levels ?? 5} onChange={(e) => set("levels", Number(e.target.value))} data-testid="input-levels" /></Field>
            <Field label="Price step (bps)" hint="Distance between adjacent levels"><Input type="number" value={v.priceStepBps ?? 10} onChange={(e) => set("priceStepBps", Number(e.target.value))} /></Field>
            <Field label="Base order size"><Input value={v.orderSize ?? "0.01"} onChange={(e) => set("orderSize", e.target.value)} data-testid="input-order-size" /></Field>
            <Field label="Refresh interval (sec)"><Input type="number" value={v.refreshSec ?? 8} onChange={(e) => set("refreshSec", Number(e.target.value))} /></Field>
            <Field label="Max order age (sec)"><Input type="number" value={v.maxOrderAgeSec ?? 60} onChange={(e) => set("maxOrderAgeSec", Number(e.target.value))} /></Field>
            <Field label="Top-of-book boost (%)" full hint="Extra qty at level closest to mid. 50 = 1.5×, 100 = 2× size at top.">
              <Input type="number" value={v.topOfBookBoostPct ?? 50} onChange={(e) => set("topOfBookBoostPct", Number(e.target.value))} />
            </Field>
          </FormSection>

          {/* Market Taker - amber accent */}
          <div className="rounded-xl border-2 border-amber-500/40 bg-gradient-to-br from-amber-500/[0.08] to-orange-500/[0.05] overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-amber-500/30 bg-amber-500/10">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-md bg-amber-500/20 border border-amber-500/40 flex items-center justify-center">
                  <Flame className="w-3.5 h-3.5 text-amber-300" />
                </div>
                <span className="text-xs font-bold uppercase tracking-wider text-amber-300">Market-Taker Mode</span>
              </div>
              <Switch checked={!!v.marketTakerEnabled} onCheckedChange={(c) => set("marketTakerEnabled", c)} data-testid="switch-taker" />
            </div>
            <div className="p-4 space-y-3">
              <p className="text-[11px] text-amber-200/80 leading-relaxed">
                The bot fires synthetic market orders when price moves sharply or a large user order arrives.
                It adds momentum, absorbs whale orders, and keeps the live tape active.
              </p>
              <div className={cn("grid grid-cols-1 md:grid-cols-2 gap-3", !v.marketTakerEnabled && "opacity-60 pointer-events-none")}>
                <Field label="Market order size mult" hint="2.0 = 2× base size"><Input value={v.marketTakerSizeMult ?? "2.00"} onChange={(e) => set("marketTakerSizeMult", e.target.value)} /></Field>
                <Field label="Cooldown (sec)" hint="Min gap between market orders"><Input type="number" value={v.marketTakerCooldownSec ?? 30} onChange={(e) => set("marketTakerCooldownSec", Number(e.target.value))} /></Field>
                <Field label="Price-move trigger (bps)" full hint="Mid moves ≥ this in 1 tick → bot chases. 30 = 0.30%, 0 = disabled.">
                  <Input type="number" value={v.priceMoveTriggerBps ?? 30} onChange={(e) => set("priceMoveTriggerBps", Number(e.target.value))} />
                </Field>
                <Field label="Big-order trigger qty" hint="User order ≥ this → bot absorbs. 0 = disabled."><Input value={v.bigOrderTriggerQty ?? "0"} onChange={(e) => set("bigOrderTriggerQty", e.target.value)} /></Field>
                <Field label="Absorb size mult" hint="1.5 = bot absorbs 1.5× base"><Input value={v.bigOrderAbsorbMult ?? "1.50"} onChange={(e) => set("bigOrderAbsorbMult", e.target.value)} /></Field>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => onSubmit(v)} disabled={!canSave} data-testid="button-save-bot">
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
