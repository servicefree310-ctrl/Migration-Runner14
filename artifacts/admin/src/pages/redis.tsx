import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, patch, post, del } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/premium/PageHeader";
import { PremiumStatCard } from "@/components/premium/PremiumStatCard";
import { StatusPill } from "@/components/premium/StatusPill";
import { EmptyState } from "@/components/premium/EmptyState";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Database, RefreshCw, Trash2, Search, HardDrive, Server, Zap, Cpu, Play, Pause, RotateCcw,
  Flame, Activity, Layers, Sparkles,
} from "lucide-react";

type Status = {
  ready: boolean; version?: string; uptimeSec?: number; memoryUsed?: string;
  memoryPeak?: string; maxMemory?: string; maxMemoryPolicy?: string;
  connectedClients?: number; totalCommands?: number; opsPerSec?: number;
  hits?: number; misses?: number; hitRate?: number; keysCount?: number;
};
type Cfg = {
  cacheKey: string; label: string; description: string; category: string;
  ttlSec: number; enabled: boolean; cacheOnServer: boolean;
  cacheOnMobile: boolean; cacheOnWeb: boolean; pattern: string;
};
type KeyRow = { key: string; type: string; ttl: number; preview: any };

function fmtSec(s?: number) {
  if (!s) return "—";
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return `${d}d ${h}h ${m}m`;
}

export default function RedisPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [confirmFlushAll, setConfirmFlushAll] = useState(false);
  const [confirmFlushPattern, setConfirmFlushPattern] = useState<string | null>(null);
  const [confirmDelKey, setConfirmDelKey] = useState<string | null>(null);

  const { data: status, refetch: refetchStatus } = useQuery<Status>({
    queryKey: ["redis-status"],
    queryFn: () => get("/admin/redis/status"),
    refetchInterval: 3000,
  });
  const { data: configs = [] } = useQuery<Cfg[]>({
    queryKey: ["redis-configs"],
    queryFn: () => get("/admin/redis/configs"),
  });

  const [pattern, setPattern] = useState("*");
  const { data: keysData, refetch: refetchKeys, isFetching: keysLoading } = useQuery<{ keys: KeyRow[]; total: number }>({
    queryKey: ["redis-keys", pattern],
    queryFn: () => get(`/admin/redis/keys?pattern=${encodeURIComponent(pattern)}&limit=200`),
    enabled: false,
  });

  const updateCfg = useMutation({
    mutationFn: (c: Partial<Cfg> & { cacheKey: string }) => patch(`/admin/redis/configs/${c.cacheKey}`, c),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["redis-configs"] }); toast({ title: "Saved" }); },
    onError: (e: any) => toast({ title: "Save failed", description: e?.message, variant: "destructive" }),
  });

  const flushPattern = useMutation({
    mutationFn: (p: string) => post("/admin/redis/flush-pattern", { pattern: p }),
    onSuccess: (r: any) => { setConfirmFlushPattern(null); toast({ title: `Flushed ${r.deleted} keys` }); },
  });
  const flushAll = useMutation({
    mutationFn: () => post("/admin/redis/flush-all", {}),
    onSuccess: () => { setConfirmFlushAll(false); toast({ title: "All cache flushed" }); },
  });
  const delKey = useMutation({
    mutationFn: (k: string) => del(`/admin/redis/key?key=${encodeURIComponent(k)}`),
    onSuccess: () => { refetchKeys(); toast({ title: "Key deleted" }); },
  });
  const reseed = useMutation({
    mutationFn: () => post("/admin/redis/configs/reseed", {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["redis-configs"] }); toast({ title: "Defaults re-seeded" }); },
  });
  const warmNow = useMutation({
    mutationFn: () => post("/admin/redis/warm", {}),
    onSuccess: (r: any) => toast({ title: "Cache warmed", description: JSON.stringify(r.stats) }),
  });

  const { data: meStatus } = useQuery<any>({
    queryKey: ["matching-status"],
    queryFn: () => get("/admin/matching/status"),
    refetchInterval: 2000,
  });
  const toggleEngine = useMutation({
    mutationFn: (enabled: boolean) => post("/admin/matching/toggle", { enabled }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["matching-status"] }); toast({ title: "Engine toggled" }); },
  });
  const resetEngine = useMutation({
    mutationFn: () => post("/admin/matching/reset-stats", {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["matching-status"] }); toast({ title: "Stats reset" }); },
  });
  const sweepEngine = useMutation({
    mutationFn: (symbol: string) => post("/admin/matching/sweep", symbol ? { symbol } : {}),
    onSuccess: (r: any) => toast({ title: `Swept ${r.scanned} orders`, description: `${r.totalTrades} trades` }),
  });
  const [depthSym, setDepthSym] = useState("BTCINR");
  const [sweepSym, setSweepSym] = useState("");
  const { data: depth, refetch: refetchDepth } = useQuery<{ bids: [number, number][]; asks: [number, number][] }>({
    queryKey: ["matching-depth", depthSym],
    queryFn: () => get(`/admin/matching/depth/${depthSym}?levels=15`),
    enabled: false,
  });

  const grouped = useMemo(() => configs.reduce<Record<string, Cfg[]>>((acc, c) => {
    (acc[c.category] ||= []).push(c); return acc;
  }, {}), [configs]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Infrastructure"
        title="Redis & Matching Engine"
        description="Cache health, TTL configs, key explorer + spot matching engine controls. Live updates every 3s."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => refetchStatus()} data-testid="button-refresh-redis">
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={() => warmNow.mutate()} disabled={warmNow.isPending}>
              <Flame className="w-3.5 h-3.5 mr-1.5" /> Warm Now
            </Button>
            <Button variant="destructive" size="sm" onClick={() => setConfirmFlushAll(true)}>
              <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Flush All
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <PremiumStatCard
          hero
          title="Server Status"
          value={status?.ready ? "Connected" : "Offline"}
          icon={Server}
          hint={`v${status?.version || "—"} · ${fmtSec(status?.uptimeSec)}`}
        />
        <PremiumStatCard
          title="Memory Used"
          value={status?.memoryUsed || "—"}
          icon={HardDrive}
          hint={`peak ${status?.memoryPeak || "—"} / max ${status?.maxMemory || "—"}`}
        />
        <PremiumStatCard
          title="Total Keys"
          value={status?.keysCount?.toLocaleString() || "0"}
          icon={Database}
          hint={`${status?.connectedClients || 0} clients · ${status?.opsPerSec || 0} ops/s`}
        />
        <PremiumStatCard
          title="Hit Rate"
          value={`${status?.hitRate?.toFixed(1) || "0.0"}%`}
          icon={Zap}
          accent
          hint={`${status?.hits?.toLocaleString() || 0} hits / ${status?.misses?.toLocaleString() || 0} misses`}
        />
        <PremiumStatCard
          title="Cache Configs"
          value={configs.length}
          icon={Layers}
          hint={`${configs.filter(c => c.enabled).length} enabled`}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => reseed.mutate()} disabled={reseed.isPending}>
          <Sparkles className="w-3.5 h-3.5 mr-1.5" /> Re-seed default configs
        </Button>
      </div>

      <Tabs defaultValue="configs">
        <TabsList>
          <TabsTrigger value="configs">Cache Configs ({configs.length})</TabsTrigger>
          <TabsTrigger value="matching"><Cpu className="w-3 h-3 mr-1" /> Matching Engine</TabsTrigger>
          <TabsTrigger value="explorer">Key Explorer</TabsTrigger>
          <TabsTrigger value="info">Server Info</TabsTrigger>
        </TabsList>

        <TabsContent value="configs" className="space-y-3 mt-4">
          {configs.length === 0 && (
            <div className="premium-card rounded-xl">
              <EmptyState
                icon={Database}
                title="No cache configs"
                description="Re-seed defaults to populate the standard config set."
                action={<Button size="sm" onClick={() => reseed.mutate()}><Sparkles className="w-3.5 h-3.5 mr-1.5" />Re-seed defaults</Button>}
              />
            </div>
          )}
          {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([cat, items]) => (
            <div key={cat} className="premium-card rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border/60 flex items-center gap-2 bg-muted/20">
                <Layers className="w-3.5 h-3.5 text-amber-300" />
                <span className="font-semibold text-sm uppercase tracking-wide">{cat}</span>
                <span className="ml-auto text-xs text-muted-foreground">{items.length} config{items.length === 1 ? "" : "s"}</span>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cache</TableHead>
                    <TableHead className="w-24">TTL (sec)</TableHead>
                    <TableHead className="w-20 text-center">Server</TableHead>
                    <TableHead className="w-20 text-center">Mobile</TableHead>
                    <TableHead className="w-20 text-center">Web</TableHead>
                    <TableHead className="w-20 text-center">Active</TableHead>
                    <TableHead className="w-32">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((c) => (
                    <TableRow key={c.cacheKey} className="hover:bg-muted/20">
                      <TableCell>
                        <div className="font-medium text-sm">{c.label}</div>
                        <div className="text-xs text-muted-foreground">{c.description}</div>
                        <div className="text-[10px] font-mono text-muted-foreground mt-0.5">{c.pattern || c.cacheKey}</div>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          defaultValue={c.ttlSec}
                          className="h-8 w-20"
                          onBlur={(e) => { const v = Number(e.target.value); if (v !== c.ttlSec) updateCfg.mutate({ cacheKey: c.cacheKey, ttlSec: v }); }}
                          aria-label={`TTL for ${c.label}`}
                        />
                      </TableCell>
                      <TableCell className="text-center"><Switch checked={c.cacheOnServer} onCheckedChange={(v) => updateCfg.mutate({ cacheKey: c.cacheKey, cacheOnServer: v })} aria-label={`${c.label} server cache`} /></TableCell>
                      <TableCell className="text-center"><Switch checked={c.cacheOnMobile} onCheckedChange={(v) => updateCfg.mutate({ cacheKey: c.cacheKey, cacheOnMobile: v })} aria-label={`${c.label} mobile cache`} /></TableCell>
                      <TableCell className="text-center"><Switch checked={c.cacheOnWeb} onCheckedChange={(v) => updateCfg.mutate({ cacheKey: c.cacheKey, cacheOnWeb: v })} aria-label={`${c.label} web cache`} /></TableCell>
                      <TableCell className="text-center"><Switch checked={c.enabled} onCheckedChange={(v) => updateCfg.mutate({ cacheKey: c.cacheKey, enabled: v })} aria-label={`${c.label} enabled`} /></TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" onClick={() => setConfirmFlushPattern(c.pattern || c.cacheKey)} aria-label={`Flush ${c.label}`}>
                          <Trash2 className="w-3 h-3 mr-1" /> Flush
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="matching" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <PremiumStatCard
              hero
              title="Engine"
              value={meStatus?.enabled ? "Running" : "Paused"}
              icon={Cpu}
              hint={meStatus?.lastError ? "Has errors" : "Healthy"}
            />
            <PremiumStatCard
              title="Trades Executed"
              value={meStatus?.tradesExecuted?.toLocaleString() ?? 0}
              icon={Activity}
              hint={`${meStatus?.matchesAttempted ?? 0} attempts`}
            />
            <PremiumStatCard
              title="Volume (quote)"
              value={(meStatus?.totalVolumeQuote ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
              icon={Zap}
              accent
            />
            <PremiumStatCard
              title="Last Match"
              value={meStatus?.lastMatchAt ? new Date(meStatus.lastMatchAt).toLocaleTimeString() : "—"}
              icon={RefreshCw}
              hint={meStatus?.lastError}
            />
          </div>

          <div className="premium-card rounded-xl p-4">
            <div className="flex flex-wrap gap-2 items-center">
              {meStatus?.enabled
                ? <Button size="sm" variant="destructive" onClick={() => toggleEngine.mutate(false)}><Pause className="w-3 h-3 mr-1" /> Pause Engine</Button>
                : <Button size="sm" onClick={() => toggleEngine.mutate(true)}><Play className="w-3 h-3 mr-1" /> Resume Engine</Button>}
              <Button size="sm" variant="outline" onClick={() => resetEngine.mutate()}><RotateCcw className="w-3 h-3 mr-1" /> Reset Stats</Button>
              <div className="flex gap-1 ml-2">
                <Input placeholder="Symbol (blank = all)" value={sweepSym} onChange={(e) => setSweepSym(e.target.value.toUpperCase())} className="h-8 w-40" />
                <Button size="sm" variant="secondary" onClick={() => sweepEngine.mutate(sweepSym)}>Force Sweep</Button>
              </div>
            </div>
          </div>

          <div className="premium-card rounded-xl p-4">
            <div className="flex gap-2 mb-3 items-center">
              <Label className="text-xs">Depth viewer</Label>
              <Input value={depthSym} onChange={(e) => setDepthSym(e.target.value.toUpperCase())} className="h-8 w-32" />
              <Button size="sm" onClick={() => refetchDepth()}>Load</Button>
            </div>
            {depth && (
              <div className="grid grid-cols-2 gap-4 text-xs font-mono">
                <div>
                  <div className="font-semibold text-emerald-400 mb-1">BIDS</div>
                  {depth.bids.map(([p, q]) => (
                    <div key={`b${p}`} className="flex justify-between border-b border-border/40 py-0.5">
                      <span className="text-emerald-400">{p.toFixed(2)}</span>
                      <span>{q.toFixed(6)}</span>
                    </div>
                  ))}
                  {depth.bids.length === 0 && <div className="text-muted-foreground">empty</div>}
                </div>
                <div>
                  <div className="font-semibold text-red-400 mb-1">ASKS</div>
                  {depth.asks.map(([p, q]) => (
                    <div key={`a${p}`} className="flex justify-between border-b border-border/40 py-0.5">
                      <span className="text-red-400">{p.toFixed(2)}</span>
                      <span>{q.toFixed(6)}</span>
                    </div>
                  ))}
                  {depth.asks.length === 0 && <div className="text-muted-foreground">empty</div>}
                </div>
              </div>
            )}
            {meStatus?.perSymbol && Object.keys(meStatus.perSymbol).length > 0 && (
              <div className="mt-4">
                <div className="text-xs font-semibold mb-1">Per-symbol activity</div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Symbol</TableHead>
                      <TableHead>Trades</TableHead>
                      <TableHead>Volume</TableHead>
                      <TableHead>Last</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(meStatus.perSymbol as Record<string, any>).map(([sym, s]) => (
                      <TableRow key={sym}>
                        <TableCell className="font-mono">{sym}</TableCell>
                        <TableCell>{s.trades}</TableCell>
                        <TableCell>{s.volume.toLocaleString(undefined, { maximumFractionDigits: 2 })}</TableCell>
                        <TableCell className="text-xs">{s.lastTs ? new Date(s.lastTs).toLocaleTimeString() : "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="explorer" className="mt-4">
          <div className="premium-card rounded-xl p-4">
            <div className="flex gap-2 mb-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input className="pl-9" placeholder="Pattern (e.g. price:*, orderbook:BTCINR:*)" value={pattern} onChange={(e) => setPattern(e.target.value)} />
              </div>
              <Button onClick={() => refetchKeys()} disabled={keysLoading}><Search className="w-3 h-3 mr-1" /> Scan</Button>
              <Button variant="destructive" onClick={() => setConfirmFlushPattern(pattern)}>Flush Match</Button>
            </div>
            {keysData && (
              <>
                <div className="text-xs text-muted-foreground mb-2">Found {keysData.total} keys (showing first {keysData.keys.length})</div>
                {keysData.keys.length === 0 ? (
                  <EmptyState icon={Database} title="No keys matched" description="Try a different pattern or wildcard." />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Key</TableHead>
                        <TableHead className="w-20">Type</TableHead>
                        <TableHead className="w-20">TTL</TableHead>
                        <TableHead>Preview</TableHead>
                        <TableHead className="w-20"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {keysData.keys.map((k) => (
                        <TableRow key={k.key} className="hover:bg-muted/20">
                          <TableCell className="font-mono text-xs">{k.key}</TableCell>
                          <TableCell><Badge variant="secondary" className="text-[10px]">{k.type}</Badge></TableCell>
                          <TableCell className="text-xs">{k.ttl < 0 ? "∞" : `${k.ttl}s`}</TableCell>
                          <TableCell className="font-mono text-[10px] max-w-md truncate">{typeof k.preview === "string" ? k.preview : JSON.stringify(k.preview)}</TableCell>
                          <TableCell>
                            <Button size="sm" variant="ghost" onClick={() => setConfirmDelKey(k.key)} aria-label={`Delete key ${k.key}`}>
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </>
            )}
          </div>
        </TabsContent>

        <TabsContent value="info" className="mt-4">
          <div className="premium-card rounded-xl p-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Info label="Version" value={status?.version} />
              <Info label="Uptime" value={fmtSec(status?.uptimeSec)} />
              <Info label="Memory Used" value={status?.memoryUsed} />
              <Info label="Memory Peak" value={status?.memoryPeak} />
              <Info label="Max Memory" value={status?.maxMemory} />
              <Info label="Eviction Policy" value={status?.maxMemoryPolicy} />
              <Info label="Connected Clients" value={status?.connectedClients} />
              <Info label="Total Commands" value={status?.totalCommands?.toLocaleString()} />
              <Info label="Ops / Second" value={status?.opsPerSec} />
              <Info label="Total Keys" value={status?.keysCount?.toLocaleString()} />
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <AlertDialog open={confirmFlushAll} onOpenChange={setConfirmFlushAll}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Flush ALL Redis cache?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove every key from Redis. Live ticker, orderbooks, sessions and rate-limit counters will be lost. The system will rebuild caches on demand but performance will dip momentarily. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => flushAll.mutate()} className="bg-destructive hover:bg-destructive/90">
              Flush everything
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmDelKey} onOpenChange={(o) => !o && setConfirmDelKey(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this Redis key?</AlertDialogTitle>
            <AlertDialogDescription>
              Key: <span className="font-mono font-semibold">{confirmDelKey}</span>
              <br />This single key will be removed from Redis. The system will rebuild the cached value on next demand.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (confirmDelKey) { delKey.mutate(confirmDelKey); setConfirmDelKey(null); } }}
              className="bg-destructive hover:bg-destructive/90"
            >
              Delete key
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmFlushPattern} onOpenChange={(o) => !o && setConfirmFlushPattern(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Flush keys matching pattern?</AlertDialogTitle>
            <AlertDialogDescription>
              Pattern: <span className="font-mono font-semibold">{confirmFlushPattern}</span>
              <br />Keys matching this glob will be removed from Redis.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmFlushPattern && flushPattern.mutate(confirmFlushPattern)} className="bg-destructive hover:bg-destructive/90">
              Flush match
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Info({ label, value }: { label: string; value: any }) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-border/40 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-mono text-xs">{value ?? "—"}</span>
    </div>
  );
}
