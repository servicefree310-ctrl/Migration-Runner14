import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post, patch, del } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/premium/PageHeader";
import { PremiumStatCard } from "@/components/premium/PremiumStatCard";
import { StatusPill } from "@/components/premium/StatusPill";
import { EmptyState } from "@/components/premium/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Sigma, Plus, Trash2, Zap, Layers, TrendingUp, TrendingDown,
  Activity, Clock, BarChart3, Shield, RefreshCw, CheckCircle2, AlertCircle, SkipForward,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Contract = {
  id: number; symbol: string; underlyingCoinId: number; underlyingSymbol: string;
  quoteCoinSymbol: string; optionType: "call" | "put";
  strikePrice: string; expiryAt: string;
  ivBps: number; riskFreeRateBps: number; contractSize: string; minQty: string;
  status: string; settlementPrice: string | null; settledAt: string | null; createdAt: string;
};

const fmt = (n: number, dp = 2) =>
  Number(n ?? 0).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });

function timeUntil(iso: string): { label: string; urgent: boolean } {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return { label: "Expired", urgent: true };
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  return { label: d > 0 ? `${d}d ${h}h` : `${h}h`, urgent: d < 1 };
}

const UNDERLYINGS = ["BTC", "ETH", "SOL", "BNB", "XRP", "DOGE"];

const defaultForm = {
  underlyingSymbol: "BTC",
  quoteCoinSymbol: "USDT",
  optionType: "call" as "call" | "put",
  strikePrice: "",
  expiryAt: "",
  ivBps: 8000,
  riskFreeRateBps: 500,
  contractSize: 1,
  minQty: 0.01,
};

type DailyCreateResult = {
  created: number; skipped: number; errors: number;
  contracts: string[]; errorDetails: string[];
};

export default function OptionsAdminPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"active" | "settled" | "all">("active");
  const [createOpen, setCreateOpen] = useState(false);
  const [pairMode, setPairMode] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [filterUnderlying, setFilterUnderlying] = useState("ALL");
  const [autoResult, setAutoResult] = useState<DailyCreateResult | null>(null);

  const contractsQ = useQuery<{ contracts: Contract[] }>({
    queryKey: ["admin-options"],
    queryFn: () => get(`/api/admin/options/contracts`),
    refetchInterval: 10_000,
  });

  const createMut = useMutation({
    mutationFn: async () => {
      if (pairMode) {
        // Create both call and put in parallel
        await Promise.all([
          post(`/api/admin/options/contracts`, { ...form, optionType: "call" }),
          post(`/api/admin/options/contracts`, { ...form, optionType: "put" }),
        ]);
      } else {
        await post(`/api/admin/options/contracts`, form);
      }
    },
    onSuccess: () => {
      toast({ title: pairMode ? "Call + Put pair created" : "Contract created", description: "New option(s) are now live" });
      setCreateOpen(false);
      setForm(defaultForm);
      qc.invalidateQueries({ queryKey: ["admin-options"] });
    },
    onError: (e: any) => toast({ title: "Create failed", description: e?.message ?? "Try again", variant: "destructive" }),
  });

  const settleMut = useMutation({
    mutationFn: (id: number) => post(`/api/admin/options/contracts/${id}/settle`, {}),
    onSuccess: () => {
      toast({ title: "Force settle queued", description: "Engine will settle within ~1 minute" });
      qc.invalidateQueries({ queryKey: ["admin-options"] });
    },
    onError: (e: any) => toast({ title: "Settle failed", description: e?.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => del(`/api/admin/options/contracts/${id}`),
    onSuccess: () => {
      toast({ title: "Contract deleted" });
      qc.invalidateQueries({ queryKey: ["admin-options"] });
    },
    onError: (e: any) => toast({ title: "Delete failed", description: e?.message, variant: "destructive" }),
  });

  const ivPatch = useMutation({
    mutationFn: ({ id, ivBps }: { id: number; ivBps: number }) =>
      patch(`/api/admin/options/contracts/${id}`, { ivBps }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-options"] }),
    onError: (e: any) => toast({ title: "IV update failed", description: e?.message, variant: "destructive" }),
  });

  const autoCreateMut = useMutation({
    mutationFn: (): Promise<DailyCreateResult> => post(`/api/admin/options/daily-create`, {}),
    onSuccess: (data) => {
      setAutoResult(data);
      qc.invalidateQueries({ queryKey: ["admin-options"] });
    },
    onError: (e: any) => toast({ title: "Auto-generate failed", description: e?.message ?? "Try again", variant: "destructive" }),
  });

  const contracts = contractsQ.data?.contracts ?? [];
  const active = contracts.filter((c) => c.status === "active");
  const expired = contracts.filter((c) => c.status === "expired");
  const settled = contracts.filter((c) => c.status === "settled");

  const filtered = useMemo(() => {
    let base = tab === "active" ? active : tab === "settled" ? settled : contracts;
    if (filterUnderlying !== "ALL") base = base.filter((c) => c.underlyingSymbol === filterUnderlying);
    return base;
  }, [contracts, active, settled, tab, filterUnderlying]);

  const underlyings = [...new Set(contracts.map((c) => c.underlyingSymbol))].sort();

  // Group active by expiry for the chain view
  const activeByExpiry = useMemo(() => {
    const map = new Map<string, Contract[]>();
    for (const c of active) {
      if (!map.has(c.expiryAt)) map.set(c.expiryAt, []);
      map.get(c.expiryAt)!.push(c);
    }
    return [...map.entries()].sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime());
  }, [active]);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Derivatives"
        title="Options Console"
        description="Manage option contracts — create, adjust IV, force-settle or delete."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => autoCreateMut.mutate()}
              disabled={autoCreateMut.isPending}
              className="border-amber-500/40 text-amber-400 hover:bg-amber-500/10"
            >
              <RefreshCw className={cn("h-4 w-4 mr-1.5", autoCreateMut.isPending && "animate-spin")} />
              {autoCreateMut.isPending ? "Generating…" : "Auto-Generate Chain"}
            </Button>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" /> New Contract
            </Button>
          </div>
        }
      />

      {/* Auto-create result dialog */}
      <Dialog open={!!autoResult} onOpenChange={(o) => { if (!o) setAutoResult(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-amber-400" />
              Daily Chain Generated
            </DialogTitle>
            <DialogDescription>
              Options chain created for BTC · ETH · BNB · SOL · XRP
            </DialogDescription>
          </DialogHeader>
          {autoResult && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3 text-center">
                  <CheckCircle2 className="h-5 w-5 text-emerald-400 mx-auto mb-1" />
                  <div className="text-xl font-bold text-emerald-400">{autoResult.created}</div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Created</div>
                </div>
                <div className="rounded-lg bg-muted/20 border border-border/40 p-3 text-center">
                  <SkipForward className="h-5 w-5 text-muted-foreground mx-auto mb-1" />
                  <div className="text-xl font-bold">{autoResult.skipped}</div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Skipped</div>
                </div>
                <div className={cn(
                  "rounded-lg border p-3 text-center",
                  autoResult.errors > 0 ? "bg-rose-500/10 border-rose-500/20" : "bg-muted/20 border-border/40",
                )}>
                  <AlertCircle className={cn("h-5 w-5 mx-auto mb-1", autoResult.errors > 0 ? "text-rose-400" : "text-muted-foreground")} />
                  <div className={cn("text-xl font-bold", autoResult.errors > 0 && "text-rose-400")}>{autoResult.errors}</div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Errors</div>
                </div>
              </div>
              {autoResult.contracts.length > 0 && (
                <div className="rounded-lg bg-muted/10 border border-border/30 p-3 max-h-48 overflow-y-auto">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-2">New Contracts</div>
                  <div className="flex flex-wrap gap-1">
                    {autoResult.contracts.map((s) => (
                      <span key={s} className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">{s}</span>
                    ))}
                  </div>
                </div>
              )}
              {autoResult.errorDetails.length > 0 && (
                <div className="rounded-lg bg-rose-500/5 border border-rose-500/20 p-3">
                  <div className="text-[10px] text-rose-400 uppercase tracking-wide mb-1">Errors</div>
                  {autoResult.errorDetails.map((e, i) => (
                    <div key={i} className="text-xs text-rose-300">{e}</div>
                  ))}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setAutoResult(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <PremiumStatCard title="Active" value={active.length} icon={Activity} hero />
        <PremiumStatCard title="Expired" value={expired.length} icon={Clock} accent />
        <PremiumStatCard title="Settled" value={settled.length} icon={TrendingUp} />
        <PremiumStatCard title="Total" value={contracts.length} icon={Layers} />
      </div>

      {/* Active contracts quick overview by expiry */}
      {activeByExpiry.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {activeByExpiry.slice(0, 3).map(([expiry, cs]) => {
            const { label, urgent } = timeUntil(expiry);
            const calls = cs.filter((c) => c.optionType === "call").length;
            const puts = cs.filter((c) => c.optionType === "put").length;
            const underlyings = [...new Set(cs.map((c) => c.underlyingSymbol))];
            return (
              <div key={expiry} className="rounded-xl border border-border bg-card/60 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="font-bold text-sm">
                      {new Date(expiry).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" })}
                    </div>
                    <div className={cn("text-xs font-medium mt-0.5", urgent ? "text-rose-400" : "text-muted-foreground")}>
                      <Clock className="h-3 w-3 inline mr-1" />{label}
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    {underlyings.map((u) => (
                      <Badge key={u} className="text-[9px] px-1.5 bg-amber-500/15 text-amber-400 border-amber-500/30">{u}</Badge>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <div className="flex items-center gap-1.5">
                    <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
                    <span className="text-emerald-400 font-semibold">{calls}</span>
                    <span className="text-muted-foreground">Calls</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <TrendingDown className="h-3.5 w-3.5 text-rose-400" />
                    <span className="text-rose-400 font-semibold">{puts}</span>
                    <span className="text-muted-foreground">Puts</span>
                  </div>
                  <div className="ml-auto text-muted-foreground">{cs.length} total</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Contracts table */}
      <div className="premium-card rounded-xl">
        <div className="p-4 border-b border-border/50 flex items-center justify-between gap-3 flex-wrap">
          <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
            <TabsList>
              <TabsTrigger value="active">Active ({active.length})</TabsTrigger>
              <TabsTrigger value="settled">Settled ({settled.length})</TabsTrigger>
              <TabsTrigger value="all">All ({contracts.length})</TabsTrigger>
            </TabsList>
          </Tabs>

          {underlyings.length > 1 && (
            <div className="flex items-center gap-1 bg-muted/30 rounded-lg p-1 border border-border/50">
              <button
                onClick={() => setFilterUnderlying("ALL")}
                className={cn(
                  "px-2.5 py-1 rounded text-xs font-medium transition-colors",
                  filterUnderlying === "ALL" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                All
              </button>
              {underlyings.map((u) => (
                <button
                  key={u}
                  onClick={() => setFilterUnderlying(u)}
                  className={cn(
                    "px-2.5 py-1 rounded text-xs font-medium transition-colors",
                    filterUnderlying === u ? "bg-amber-500/20 text-amber-400" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {u}
                </button>
              ))}
            </div>
          )}
        </div>

        {filtered.length === 0 ? (
          <EmptyState title="No contracts" description="Create a new contract to get started" icon={BarChart3} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/20 text-muted-foreground text-[10px] uppercase tracking-wide border-b border-border/40">
                <tr>
                  <th className="px-3 py-2.5 text-left">Symbol</th>
                  <th className="px-3 py-2.5 text-left">Underlying</th>
                  <th className="px-3 py-2.5 text-center">Type</th>
                  <th className="px-3 py-2.5 text-right">Strike</th>
                  <th className="px-3 py-2.5 text-left">Expiry</th>
                  <th className="px-3 py-2.5 text-right">IV %</th>
                  <th className="px-3 py-2.5 text-right">RF %</th>
                  <th className="px-3 py-2.5 text-right">Size</th>
                  <th className="px-3 py-2.5 text-center">Status</th>
                  <th className="px-3 py-2.5 text-right">Settlement</th>
                  <th className="px-3 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {filtered.map((c) => {
                  const { label: expLabel, urgent } = timeUntil(c.expiryAt);
                  return (
                    <tr key={c.id} className="hover:bg-muted/10 transition-colors">
                      <td className="px-3 py-2.5 font-mono text-xs font-bold text-foreground/90">{c.symbol}</td>
                      <td className="px-3 py-2.5">
                        <Badge className="text-[10px] px-1.5 bg-amber-500/10 text-amber-400 border-amber-500/20">
                          {c.underlyingSymbol}
                        </Badge>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={cn(
                          "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border",
                          c.optionType === "call"
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
                            : "bg-rose-500/10 text-rose-400 border-rose-500/25",
                        )}>
                          {c.optionType === "call" ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
                          {c.optionType.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-semibold">
                        ${fmt(Number(c.strikePrice), 0)}
                      </td>
                      <td className="px-3 py-2.5 text-xs">
                        <div className="text-muted-foreground">{new Date(c.expiryAt).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}</div>
                        <div className={cn("text-[10px] font-medium mt-0.5", urgent && c.status === "active" ? "text-rose-400" : "text-muted-foreground/60")}>
                          {expLabel}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <input
                          type="number"
                          defaultValue={c.ivBps / 100}
                          disabled={c.status === "settled"}
                          className="w-16 bg-muted/30 border border-border rounded px-2 py-0.5 text-xs text-right tabular-nums disabled:opacity-40"
                          onBlur={(e) => {
                            const v = Number(e.target.value) * 100;
                            if (v !== c.ivBps && v > 0) ivPatch.mutate({ id: c.id, ivBps: Math.round(v) });
                          }}
                        />
                      </td>
                      <td className="px-3 py-2.5 text-right text-xs text-muted-foreground tabular-nums">
                        {(c.riskFreeRateBps / 100).toFixed(2)}%
                      </td>
                      <td className="px-3 py-2.5 text-right text-xs text-muted-foreground tabular-nums">
                        {c.contractSize}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <StatusPill status={c.status} />
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-xs">
                        {c.settlementPrice ? (
                          <span className="text-emerald-400 font-semibold">${fmt(Number(c.settlementPrice))}</span>
                        ) : "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-end gap-1">
                          {c.status !== "settled" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => settleMut.mutate(c.id)}
                              disabled={settleMut.isPending}
                              className="h-7 text-xs border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                            >
                              <Zap className="h-3 w-3 mr-1" /> Settle
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-rose-400 hover:bg-rose-500/10"
                            onClick={() => {
                              if (confirm(`Delete ${c.symbol}? This cannot be undone.`)) deleteMut.mutate(c.id);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) setForm(defaultForm); }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-4 w-4 text-primary" />
              Create Option Contract
            </DialogTitle>
            <DialogDescription>
              Symbol is auto-generated: e.g. <span className="font-mono text-foreground">BTC-30MAY26-50000-C</span>
            </DialogDescription>
          </DialogHeader>

          {/* Pair mode toggle */}
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/20 border border-border/40">
            <button
              onClick={() => setPairMode(false)}
              className={cn(
                "flex-1 py-2 rounded-md text-xs font-semibold transition-all border",
                !pairMode ? "bg-primary/20 text-primary border-primary/30" : "text-muted-foreground border-transparent hover:border-border",
              )}
            >
              Single Contract
            </button>
            <button
              onClick={() => setPairMode(true)}
              className={cn(
                "flex-1 py-2 rounded-md text-xs font-semibold transition-all border",
                pairMode ? "bg-amber-500/20 text-amber-400 border-amber-500/30" : "text-muted-foreground border-transparent hover:border-border",
              )}
            >
              Call + Put Pair ⚡
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-1">
            <div>
              <Label className="text-xs">Underlying</Label>
              <select
                value={form.underlyingSymbol}
                onChange={(e) => setForm({ ...form, underlyingSymbol: e.target.value })}
                className="w-full bg-muted/40 border border-border rounded-md px-3 py-2 text-sm mt-1"
              >
                {UNDERLYINGS.map((u) => <option key={u}>{u}</option>)}
              </select>
            </div>
            {!pairMode && (
              <div>
                <Label className="text-xs">Type</Label>
                <select
                  value={form.optionType}
                  onChange={(e) => setForm({ ...form, optionType: e.target.value as any })}
                  className="w-full bg-muted/40 border border-border rounded-md px-3 py-2 text-sm mt-1"
                >
                  <option value="call">Call ↑</option>
                  <option value="put">Put ↓</option>
                </select>
              </div>
            )}
            {pairMode && (
              <div className="flex items-end pb-1">
                <div className="text-xs text-muted-foreground bg-emerald-500/10 border border-emerald-500/20 rounded-md px-3 py-2 w-full text-center">
                  <span className="text-emerald-400 font-semibold">CALL</span> + <span className="text-rose-400 font-semibold">PUT</span> both created
                </div>
              </div>
            )}
            <div>
              <Label className="text-xs">Strike Price (USD)</Label>
              <Input
                type="number"
                value={form.strikePrice}
                onChange={(e) => setForm({ ...form, strikePrice: e.target.value })}
                placeholder="e.g. 65000"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Expiry (UTC)</Label>
              <Input
                type="datetime-local"
                value={form.expiryAt}
                onChange={(e) => setForm({ ...form, expiryAt: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Implied Volatility %</Label>
              <div className="flex items-center gap-2 mt-1">
                <Input
                  type="number"
                  value={form.ivBps / 100}
                  onChange={(e) => setForm({ ...form, ivBps: Math.round(Number(e.target.value) * 100) })}
                  step="0.5"
                />
                <span className="text-xs text-muted-foreground whitespace-nowrap">{(form.ivBps / 100).toFixed(1)}%</span>
              </div>
            </div>
            <div>
              <Label className="text-xs">Risk-free Rate %</Label>
              <Input
                type="number"
                value={form.riskFreeRateBps / 100}
                onChange={(e) => setForm({ ...form, riskFreeRateBps: Math.round(Number(e.target.value) * 100) })}
                step="0.1"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Contract Size</Label>
              <Input
                type="number"
                step="0.01"
                value={form.contractSize}
                onChange={(e) => setForm({ ...form, contractSize: Number(e.target.value) })}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Min Quantity</Label>
              <Input
                type="number"
                step="0.01"
                value={form.minQty}
                onChange={(e) => setForm({ ...form, minQty: Number(e.target.value) })}
                className="mt-1"
              />
            </div>
          </div>

          {/* Preview */}
          {form.strikePrice && form.expiryAt && (
            <div className="rounded-lg bg-muted/20 border border-border/40 p-3 text-xs">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">Symbol Preview</div>
              <div className="flex gap-2 flex-wrap font-mono font-bold">
                {(pairMode ? ["C", "P"] : [form.optionType === "call" ? "C" : "P"]).map((t) => (
                  <span key={t} className={cn(
                    "px-2 py-0.5 rounded border",
                    t === "C" ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" : "text-rose-400 border-rose-500/30 bg-rose-500/10",
                  )}>
                    {form.underlyingSymbol}-
                    {new Date(form.expiryAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" }).replace(/ /g, "").toUpperCase()}-
                    {form.strikePrice}-{t}
                  </span>
                ))}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => { setCreateOpen(false); setForm(defaultForm); }}>Cancel</Button>
            <Button
              disabled={createMut.isPending || !form.strikePrice || !form.expiryAt}
              onClick={() => createMut.mutate()}
              className={pairMode ? "bg-amber-600 hover:bg-amber-500 text-white" : ""}
            >
              {createMut.isPending
                ? "Creating…"
                : pairMode
                  ? "⚡ Create Call + Put"
                  : `Create ${form.optionType === "call" ? "Call" : "Put"}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
