import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post, patch, del } from "@/lib/api";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Radar, Plus, Trash2, RefreshCcw, Check, X, Filter, Sparkles, AlertTriangle, ListChecks } from "lucide-react";

type Rule = {
  id: number; name: string; mode: "auto"|"manual"|"off"; scope: "spot"|"web3"|"both";
  minVolume24hUsd: string; minMarketCapUsd: string; minLiquidityUsd: string; minAgeDays: number;
  chainsAllowed: string[]; sourceFilter: string[]; autoCreatePair: boolean; quoteSymbol: string;
  isActive: boolean; priority: number;
};
type Source = { id: number; name: string; kind: string; isEnabled: boolean; syncIntervalMin: number; maxItemsPerSync: number; lastSyncAt: string | null; lastSyncCount: number; lastError: string | null };
type Candidate = {
  id: number; source: string; chain: string | null; contractAddress: string | null;
  symbol: string; name: string; logoUrl: string | null;
  priceUsd: string; marketCapUsd: string; volume24hUsd: string; liquidityUsd: string;
  priceChange24h: string; ageDays: number; riskScore: number; riskFlags: string[];
  status: "pending"|"listed"|"rejected"|"skipped"; ruleId: number | null;
  listedCoinId: number | null; listedTokenId: number | null;
  discoveredAt: string;
};

const fmtUsd = (v: string | number) => {
  const n = typeof v === "string" ? Number(v) : v;
  if (!Number.isFinite(n)) return "-";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
};
const fmtPrice = (v: string | number) => {
  const n = typeof v === "string" ? Number(v) : v;
  if (!Number.isFinite(n) || n === 0) return "-";
  if (n < 0.0001) return `$${n.toExponential(2)}`;
  if (n < 1) return `$${n.toFixed(6)}`;
  return `$${n.toFixed(2)}`;
};

export default function ListingsAdminPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"candidates" | "rules" | "sources">("candidates");

  // ---- Candidates ----
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [searchQ, setSearchQ] = useState("");
  const [candPage, setCandPage] = useState(1);
  const [candPageSize, setCandPageSize] = useState<PageSizeOption>(20);
  const candQ = useQuery<{ candidates: Candidate[]; stats: Array<{ s: string; n: number }> }>({
    queryKey: ["admin-listings-candidates", statusFilter, searchQ],
    queryFn: () => get(`/admin/listings/candidates?status=${encodeURIComponent(statusFilter)}&search=${encodeURIComponent(searchQ)}&limit=200`),
  });
  const stats = (candQ.data?.stats ?? []).reduce((a, r) => ({ ...a, [r.s]: r.n }), {} as Record<string, number>);
  const allCandidates = candQ.data?.candidates ?? [];
  const pagedCandidates = useMemo(() => allCandidates.slice((candPage - 1) * candPageSize, candPage * candPageSize), [allCandidates, candPage, candPageSize]);

  const approve = useMutation({
    mutationFn: (vars: { id: number; target: "spot" | "web3" }) => post(`/admin/listings/candidates/${vars.id}/approve`, { target: vars.target, createPair: true }),
    onSuccess: () => { toast({ title: "Listed!", description: "Token approved and added." }); qc.invalidateQueries({ queryKey: ["admin-listings-candidates"] }); },
    onError: (e: any) => toast({ title: "Approve failed", description: e?.message, variant: "destructive" }),
  });
  const reject = useMutation({
    mutationFn: (id: number) => post(`/admin/listings/candidates/${id}/reject`, {}),
    onSuccess: () => { toast({ title: "Rejected" }); qc.invalidateQueries({ queryKey: ["admin-listings-candidates"] }); },
    onError: (e: any) => toast({ title: "Failed", description: e?.message, variant: "destructive" }),
  });

  const runDiscovery = useMutation({
    mutationFn: (kind?: string) => post(`/admin/listings/discover/run`, kind ? { sourceKind: kind } : {}),
    onSuccess: (r: any) => { toast({ title: "Discovery run complete", description: `Scanned ${r.scanned} • Auto-listed ${r.listed} • Pending ${r.pending}` }); qc.invalidateQueries({ queryKey: ["admin-listings-candidates"] }); qc.invalidateQueries({ queryKey: ["admin-listings-sources"] }); },
    onError: (e: any) => toast({ title: "Discovery failed", description: e?.message, variant: "destructive" }),
  });

  // ---- Rules ----
  const rulesQ = useQuery<{ rules: Rule[] }>({ queryKey: ["admin-listings-rules"], queryFn: () => get(`/admin/listings/rules`) });
  const [ruleDialog, setRuleDialog] = useState(false);
  const [ruleForm, setRuleForm] = useState({
    name: "", mode: "manual" as Rule["mode"], scope: "both" as Rule["scope"],
    minVolume24hUsd: 100000, minMarketCapUsd: 1000000, minLiquidityUsd: 50000, minAgeDays: 7,
    chainsAllowed: "" as string, sourceFilter: "" as string,
    autoCreatePair: true, quoteSymbol: "USDT", isActive: true, priority: 10,
  });
  const createRule = useMutation({
    mutationFn: () => post(`/admin/listings/rules`, {
      ...ruleForm,
      chainsAllowed: ruleForm.chainsAllowed.split(",").map((s) => s.trim()).filter(Boolean),
      sourceFilter: ruleForm.sourceFilter.split(",").map((s) => s.trim()).filter(Boolean),
    }),
    onSuccess: () => { toast({ title: "Rule created" }); setRuleDialog(false); qc.invalidateQueries({ queryKey: ["admin-listings-rules"] }); },
    onError: (e: any) => toast({ title: "Failed", description: e?.message, variant: "destructive" }),
  });
  const patchRule = useMutation({
    mutationFn: (vars: { id: number; patch: Partial<Rule> }) => patch(`/admin/listings/rules/${vars.id}`, vars.patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-listings-rules"] }),
  });
  const delRule = useMutation({
    mutationFn: (id: number) => del(`/admin/listings/rules/${id}`),
    onSuccess: () => { toast({ title: "Deleted" }); qc.invalidateQueries({ queryKey: ["admin-listings-rules"] }); },
  });

  // ---- Sources ----
  const srcQ = useQuery<{ sources: Source[] }>({ queryKey: ["admin-listings-sources"], queryFn: () => get(`/admin/listings/sources`) });
  const patchSrc = useMutation({
    mutationFn: (vars: { id: number; patch: Partial<Source> }) => patch(`/admin/listings/sources/${vars.id}`, vars.patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-listings-sources"] }),
  });

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        eyebrow="Markets"
        title="Auto-Listings"
        description="DexScreener-style token discovery — set rules, review candidates, manage sources"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => runDiscovery.mutate(undefined)} disabled={runDiscovery.isPending}>
              <RefreshCcw className="mr-2 h-4 w-4" />{runDiscovery.isPending ? "Running…" : "Run Discovery Now"}
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-4">
        <PremiumStatCard title="Pending Review" value={String(stats.pending ?? 0)} icon={AlertTriangle} accent />
        <PremiumStatCard title="Auto-Listed" value={String(stats.listed ?? 0)} icon={Sparkles} accent />
        <PremiumStatCard title="Rejected" value={String(stats.rejected ?? 0)} icon={X} />
        <PremiumStatCard title="Skipped" value={String(stats.skipped ?? 0)} icon={ListChecks} />
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="candidates">Candidates {stats.pending ? `(${stats.pending})` : ""}</TabsTrigger>
          <TabsTrigger value="rules">Listing Rules</TabsTrigger>
          <TabsTrigger value="sources">Sources</TabsTrigger>
        </TabsList>

        <TabsContent value="candidates" className="space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending review</SelectItem>
                <SelectItem value="listed">Listed</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="skipped">Skipped</SelectItem>
              </SelectContent>
            </Select>
            <Input placeholder="Search symbol or name…" value={searchQ} onChange={(e) => setSearchQ(e.target.value)} className="max-w-xs" />
            {candQ.isFetching && <span className="text-xs text-muted-foreground">Loading…</span>}
          </div>

          {!allCandidates.length ? (
            <EmptyState icon={Radar} title="No candidates" description="Run discovery or change filter." />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border/40">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left p-3">Token</th>
                    <th className="text-left p-3">Source</th>
                    <th className="text-left p-3">Chain</th>
                    <th className="text-right p-3">Price</th>
                    <th className="text-right p-3">24h Vol</th>
                    <th className="text-right p-3">Mcap</th>
                    <th className="text-right p-3">Liquidity</th>
                    <th className="text-right p-3">24h%</th>
                    <th className="text-center p-3">Risk</th>
                    <th className="text-right p-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedCandidates.map((c) => {
                    const change = Number(c.priceChange24h);
                    const riskColor = c.riskScore >= 80 ? "rose" : c.riskScore >= 50 ? "amber" : "emerald";
                    const isWeb3 = !!c.chain && !!c.contractAddress;
                    return (
                      <tr key={c.id} className="border-t border-border/40 hover:bg-muted/20">
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            {c.logoUrl ? <img src={c.logoUrl} alt="" className="h-6 w-6 rounded-full" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} /> : <div className="h-6 w-6 rounded-full bg-muted" />}
                            <div>
                              <div className="font-medium">{c.symbol}</div>
                              <div className="text-xs text-muted-foreground truncate max-w-[160px]">{c.name}</div>
                            </div>
                          </div>
                        </td>
                        <td className="p-3 text-xs text-muted-foreground">{c.source}</td>
                        <td className="p-3 text-xs"><StatusPill variant="neutral" dot={false}>{c.chain ?? "—"}</StatusPill></td>
                        <td className="p-3 text-right tabular-nums">{fmtPrice(c.priceUsd)}</td>
                        <td className="p-3 text-right tabular-nums">{fmtUsd(c.volume24hUsd)}</td>
                        <td className="p-3 text-right tabular-nums">{fmtUsd(c.marketCapUsd)}</td>
                        <td className="p-3 text-right tabular-nums">{fmtUsd(c.liquidityUsd)}</td>
                        <td className={`p-3 text-right tabular-nums ${change >= 0 ? "text-emerald-500" : "text-rose-500"}`}>{change >= 0 ? "+" : ""}{change.toFixed(2)}%</td>
                        <td className="p-3 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <StatusPill variant={(riskColor === "rose" ? "danger" : riskColor === "amber" ? "warning" : "success") as any} dot={false}>{c.riskScore}</StatusPill>
                            {c.riskFlags.length > 0 && <span className="text-[10px] text-muted-foreground" title={c.riskFlags.join(", ")}>{c.riskFlags.length} flag{c.riskFlags.length > 1 ? "s" : ""}</span>}
                          </div>
                        </td>
                        <td className="p-3 text-right">
                          {c.status === "pending" ? (
                            <div className="flex gap-1 justify-end">
                              <Button size="sm" variant="default" onClick={() => approve.mutate({ id: c.id, target: isWeb3 ? "web3" : "spot" })} disabled={approve.isPending}>
                                <Check className="h-3 w-3 mr-1" />List as {isWeb3 ? "Web3" : "Spot"}
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => reject.mutate(c.id)} disabled={reject.isPending}>
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          ) : (
                            <StatusPill variant={c.status === "listed" ? "success" : c.status === "rejected" ? "danger" : "neutral"} dot={false}>{c.status}</StatusPill>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <PaginationBar page={candPage} pageSize={candPageSize} total={allCandidates.length} onPage={setCandPage} onPageSize={setCandPageSize} label="candidates" />
            </div>
          )}
        </TabsContent>

        <TabsContent value="rules" className="space-y-3">
          <div className="flex justify-end">
            <Button onClick={() => setRuleDialog(true)}><Plus className="mr-2 h-4 w-4" />New Rule</Button>
          </div>
          <div className="space-y-2">
            {(rulesQ.data?.rules ?? []).map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-3 p-4 rounded-xl border border-border/40 bg-card">
                <div className="flex-1 min-w-[200px]">
                  <div className="font-medium flex items-center gap-2">
                    {r.name}
                    <StatusPill variant={r.mode === "auto" ? "success" : r.mode === "manual" ? "warning" : "neutral"} dot={false}>{r.mode}</StatusPill>
                    <StatusPill variant="neutral" dot={false}>{r.scope}</StatusPill>
                    <StatusPill variant={r.isActive ? "success" : "neutral"} dot={false}>{r.isActive ? "active" : "off"}</StatusPill>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Min vol {fmtUsd(r.minVolume24hUsd)} · Min mcap {fmtUsd(r.minMarketCapUsd)} · Min liq {fmtUsd(r.minLiquidityUsd)} · Age ≥ {r.minAgeDays}d
                    {r.chainsAllowed.length > 0 && ` · chains: ${r.chainsAllowed.join(", ")}`}
                  </div>
                </div>
                <Select value={r.mode} onValueChange={(v) => patchRule.mutate({ id: r.id, patch: { mode: v as Rule["mode"] } })}>
                  <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">auto</SelectItem>
                    <SelectItem value="manual">manual</SelectItem>
                    <SelectItem value="off">off</SelectItem>
                  </SelectContent>
                </Select>
                <Switch checked={r.isActive} onCheckedChange={(v) => patchRule.mutate({ id: r.id, patch: { isActive: v } })} />
                <Button size="sm" variant="ghost" onClick={() => { if (confirm(`Delete "${r.name}"?`)) delRule.mutate(r.id); }}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="sources" className="space-y-3">
          <div className="space-y-2">
            {(srcQ.data?.sources ?? []).map((s) => (
              <div key={s.id} className="flex flex-wrap items-center gap-3 p-4 rounded-xl border border-border/40 bg-card">
                <div className="flex-1 min-w-[260px]">
                  <div className="font-medium">{s.name} <span className="text-xs text-muted-foreground">({s.kind})</span></div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Last sync {s.lastSyncAt ? new Date(s.lastSyncAt).toLocaleString() : "never"} · {s.lastSyncCount} items
                    {s.lastError && <span className="ml-2 text-rose-500">· error: {s.lastError}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-xs">Max items</Label>
                  <Input className="w-20" type="number" defaultValue={s.maxItemsPerSync} onBlur={(e) => { const n = Number(e.target.value); if (n !== s.maxItemsPerSync) patchSrc.mutate({ id: s.id, patch: { maxItemsPerSync: n } }); }} />
                </div>
                <Switch checked={s.isEnabled} onCheckedChange={(v) => patchSrc.mutate({ id: s.id, patch: { isEnabled: v } })} />
                <Button size="sm" variant="outline" onClick={() => runDiscovery.mutate(s.kind)} disabled={runDiscovery.isPending}><RefreshCcw className="h-3 w-3 mr-1" />Run</Button>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={ruleDialog} onOpenChange={setRuleDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>New Listing Rule</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name</Label><Input value={ruleForm.name} onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })} placeholder="e.g. Top-100 auto-list" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Mode</Label>
                <Select value={ruleForm.mode} onValueChange={(v) => setRuleForm({ ...ruleForm, mode: v as Rule["mode"] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="auto">auto-list</SelectItem><SelectItem value="manual">manual review</SelectItem><SelectItem value="off">off</SelectItem></SelectContent>
                </Select>
              </div>
              <div><Label>Scope</Label>
                <Select value={ruleForm.scope} onValueChange={(v) => setRuleForm({ ...ruleForm, scope: v as Rule["scope"] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="both">both</SelectItem><SelectItem value="spot">spot only</SelectItem><SelectItem value="web3">web3 only</SelectItem></SelectContent>
                </Select>
              </div>
              <div><Label>Min 24h Volume (USD)</Label><Input type="number" value={ruleForm.minVolume24hUsd} onChange={(e) => setRuleForm({ ...ruleForm, minVolume24hUsd: Number(e.target.value) })} /></div>
              <div><Label>Min Market Cap (USD)</Label><Input type="number" value={ruleForm.minMarketCapUsd} onChange={(e) => setRuleForm({ ...ruleForm, minMarketCapUsd: Number(e.target.value) })} /></div>
              <div><Label>Min Liquidity (USD)</Label><Input type="number" value={ruleForm.minLiquidityUsd} onChange={(e) => setRuleForm({ ...ruleForm, minLiquidityUsd: Number(e.target.value) })} /></div>
              <div><Label>Min Age (days)</Label><Input type="number" value={ruleForm.minAgeDays} onChange={(e) => setRuleForm({ ...ruleForm, minAgeDays: Number(e.target.value) })} /></div>
            </div>
            <div><Label>Chains allowed (comma-sep, blank = any)</Label><Input value={ruleForm.chainsAllowed} onChange={(e) => setRuleForm({ ...ruleForm, chainsAllowed: e.target.value })} placeholder="ethereum, bsc, solana" /></div>
            <div className="flex items-center gap-2"><Switch checked={ruleForm.autoCreatePair} onCheckedChange={(v) => setRuleForm({ ...ruleForm, autoCreatePair: v })} /><Label>Auto-create /USDT trading pair on spot list</Label></div>
            <div><Label>Priority (higher = checked first)</Label><Input type="number" value={ruleForm.priority} onChange={(e) => setRuleForm({ ...ruleForm, priority: Number(e.target.value) })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRuleDialog(false)}>Cancel</Button>
            <Button onClick={() => createRule.mutate()} disabled={createRule.isPending || !ruleForm.name}>Create rule</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
