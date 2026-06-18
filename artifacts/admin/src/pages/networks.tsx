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
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  Network as NetworkIcon, Plus, Trash2, Pencil, Wifi, Wallet, KeyRound,
  ExternalLink, RefreshCw, AlertTriangle, Search, Eye, EyeOff, Copy, Check,
  Activity, ShieldCheck, ArrowDownToLine, ArrowUpFromLine, Layers, Server,
  Zap, Loader2, Calculator, Tag, CircleDollarSign, Settings2, Hash,
  LayoutGrid, LayoutList, PauseCircle, PlayCircle, Shield, ChevronDown,
  AlertOctagon, ToggleLeft, ToggleRight, Boxes, CheckSquare, Square,
  Workflow,
} from "lucide-react";

type Coin = { id: number; symbol: string; logoUrl: string | null };
type Network = {
  id: number; coinId: number; name: string; chain: string; contractAddress: string | null;
  minDeposit: string; minWithdraw: string; withdrawFee: string;
  withdrawFeePercent: string; withdrawFeeMin: string;
  confirmations: number;
  depositEnabled: boolean; withdrawEnabled: boolean; memoRequired: boolean; status: string;
  nodeAddress: string | null; nodeStatus: string; lastNodeCheckAt: string | null;
  providerType: string;
  rpcApiKey: string | null; rpcApiKeySet?: boolean;
  hotWalletAddress: string | null; hotWalletKeySet?: boolean; autoSweepEnabled: boolean;
  hotWalletPrivateKey?: string;
  explorerUrl: string | null;
  lastBlockHeight: number | null; blockHeightCheckedAt: string | null;
};

const PROVIDERS: Record<string, { label: string; placeholder: string; chains: string[]; signupUrl: string }> = {
  alchemy:    { label: "Alchemy (EVM)",      placeholder: "https://bnb-mainnet.g.alchemy.com/v2/YOUR_KEY", chains: ["BNB","ETH","POLYGON","ARBITRUM"], signupUrl: "https://alchemy.com" },
  infura:     { label: "Infura (EVM)",       placeholder: "https://mainnet.infura.io/v3/YOUR_KEY",        chains: ["ETH","POLYGON","ARBITRUM"],       signupUrl: "https://infura.io" },
  trongrid:   { label: "TronGrid (TRC-20)",  placeholder: "https://api.trongrid.io",                      chains: ["TRX"],                            signupUrl: "https://trongrid.io" },
  blockcypher:{ label: "BlockCypher (BTC)",  placeholder: "https://api.blockcypher.com/v1/btc/main",      chains: ["BTC"],                            signupUrl: "https://blockcypher.com" },
  helius:     { label: "Helius (Solana)",    placeholder: "https://mainnet.helius-rpc.com/?api-key=KEY",  chains: ["SOL"],                            signupUrl: "https://helius.xyz" },
  quicknode:  { label: "QuickNode",          placeholder: "https://your-endpoint.quiknode.pro/TOKEN/",    chains: ["BTC","SOL","ETH","BNB"],          signupUrl: "https://quicknode.com" },
  custom:     { label: "Custom RPC",         placeholder: "https://your-rpc-url",                         chains: [],                                 signupUrl: "" },
};

const CHAIN_COLORS: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  BTC:      { bg: "rgba(247,147,26,0.12)", border: "rgba(247,147,26,0.35)", text: "#F7931A", dot: "bg-orange-400" },
  ETH:      { bg: "rgba(98,126,234,0.12)", border: "rgba(98,126,234,0.35)", text: "#627EEA", dot: "bg-indigo-400" },
  BNB:      { bg: "rgba(240,185,11,0.12)", border: "rgba(240,185,11,0.35)", text: "#F0B90B", dot: "bg-yellow-400" },
  TRX:      { bg: "rgba(239,0,39,0.1)",    border: "rgba(239,0,39,0.3)",    text: "#EF0027", dot: "bg-red-400" },
  SOL:      { bg: "rgba(153,69,255,0.1)",  border: "rgba(153,69,255,0.3)",  text: "#9945FF", dot: "bg-violet-400" },
  POLYGON:  { bg: "rgba(130,71,229,0.1)",  border: "rgba(130,71,229,0.3)",  text: "#8247E5", dot: "bg-purple-400" },
  ARBITRUM: { bg: "rgba(40,160,240,0.1)",  border: "rgba(40,160,240,0.3)",  text: "#28A0F0", dot: "bg-sky-400" },
};
const chainColor = (c: string) => CHAIN_COLORS[c.toUpperCase()] ?? { bg: "rgba(148,163,184,0.1)", border: "rgba(148,163,184,0.3)", text: "#94a3b8", dot: "bg-slate-400" };

const CHAIN_GRADIENTS: Record<string, string> = {
  BTC: "from-orange-500 to-amber-500", ETH: "from-indigo-500 to-blue-500",
  BNB: "from-yellow-500 to-amber-500", TRX: "from-red-500 to-rose-500",
  SOL: "from-violet-500 to-fuchsia-500", POLYGON: "from-purple-500 to-violet-500",
  ARBITRUM: "from-sky-500 to-blue-500", DEFAULT: "from-slate-500 to-zinc-500",
};
const chainGradient = (c: string) => CHAIN_GRADIENTS[c.toUpperCase()] ?? CHAIN_GRADIENTS.DEFAULT;

function CoinChip({ coin }: { coin: Coin | undefined }) {
  if (!coin) return <span className="text-muted-foreground">—</span>;
  const [errored, setErrored] = useState(false);
  return (
    <div className="flex items-center gap-2">
      {coin.logoUrl && !errored ? (
        <img src={coin.logoUrl} alt={coin.symbol} className="w-7 h-7 rounded-full ring-1 ring-border/60 object-cover" onError={() => setErrored(true)} />
      ) : (
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white text-[10px] font-bold ring-1 ring-white/15">
          {coin.symbol.slice(0, 3)}
        </div>
      )}
      <span className="font-semibold">{coin.symbol}</span>
    </div>
  );
}

function ChainBadge({ chain }: { chain: string }) {
  const col = chainColor(chain);
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide"
      style={{ backgroundColor: col.bg, border: `1px solid ${col.border}`, color: col.text }}
    >
      <Layers className="w-2.5 h-2.5" />{chain}
    </span>
  );
}

function NodeStatusPill({ status }: { status: string }) {
  const map: Record<string, { variant: "success" | "warning" | "danger" | "neutral"; label: string }> = {
    online: { variant: "success", label: "Online" }, offline: { variant: "danger", label: "Offline" },
    syncing: { variant: "warning", label: "Syncing" }, unknown: { variant: "neutral", label: "Unknown" },
  };
  const { variant, label } = map[status] ?? map.unknown;
  return <StatusPill variant={variant}>{label}</StatusPill>;
}

function shortAddr(a?: string | null, head = 6, tail = 4): string {
  if (!a) return "—";
  if (a.length <= head + tail + 3) return a;
  return `${a.slice(0, head)}…${a.slice(-tail)}`;
}

function relTime(s: string | null | undefined): string {
  if (!s) return "—";
  const t = new Date(s).getTime();
  if (!Number.isFinite(t)) return "—";
  const diff = Date.now() - t;
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.round(m / 60)}h ago`;
  return `${Math.round(m / 1440)}d ago`;
}

// ──────────────────────────────────────────────────────────────────────────────
export default function NetworksPage() {
  const { user: me } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const isAdmin = me?.role === "admin" || me?.role === "superadmin";

  const [tab, setTab] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [coinFilter, setCoinFilter] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Network | null>(null);
  const [deleteFor, setDeleteFor] = useState<Network | null>(null);
  const [testResults, setTestResults] = useState<Record<number, any>>({});
  const [copied, setCopied] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [emergencyOpen, setEmergencyOpen] = useState(false);

  const { data: coins = [] } = useQuery<Coin[]>({ queryKey: ["/admin/coins"], queryFn: () => get<Coin[]>("/admin/coins") });
  const { data: networks = [], isLoading, refetch, isFetching } = useQuery<Network[]>({
    queryKey: ["/admin/networks"],
    queryFn: () => get<Network[]>("/admin/networks"),
  });

  const inv = () => qc.invalidateQueries({ queryKey: ["/admin/networks"] });

  const create = useMutation({
    mutationFn: (v: Partial<Network>) => post("/admin/networks", v),
    onSuccess: () => { inv(); setOpen(false); toast({ title: "Network added" }); },
    onError: (e: Error) => toast({ title: "Add failed", description: e.message, variant: "destructive" }),
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: number; body: any }) => patch(`/admin/networks/${id}`, body),
    onSuccess: () => { inv(); setEdit(null); toast({ title: "Network updated" }); },
    onError: (e: Error) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });
  const quickToggle = useMutation({
    mutationFn: ({ id, body }: { id: number; body: any }) => patch(`/admin/networks/${id}`, body),
    onSuccess: inv,
    onError: (e: Error) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });
  const bulkToggle = useMutation({
    mutationFn: (body: any) => patch("/admin/networks/bulk", body),
    onSuccess: (r: any) => { inv(); setSelected(new Set()); toast({ title: `${r?.updated ?? "?"} network(s) updated` }); },
    onError: (e: Error) => toast({ title: "Bulk update failed", description: e.message, variant: "destructive" }),
  });
  const remove = useMutation({
    mutationFn: (id: number) => del(`/admin/networks/${id}`),
    onSuccess: () => { inv(); setDeleteFor(null); toast({ title: "Network removed" }); },
    onError: (e: Error) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });
  const test = useMutation({
    mutationFn: (id: number) => post<any>(`/admin/networks/${id}/test`, {}),
    onSuccess: (r, id) => {
      setTestResults((prev) => ({ ...prev, [id]: r }));
      inv();
      toast({ title: r.ok ? "Node online" : "Node offline", description: r.ok ? `block #${r.blockHeight} · ${r.latencyMs}ms` : r.error, variant: r.ok ? undefined : "destructive" });
    },
    onError: (e: Error) => toast({ title: "Test failed", description: e.message, variant: "destructive" }),
  });

  const coinById = useMemo(() => { const m = new Map<number, Coin>(); for (const c of coins) m.set(c.id, c); return m; }, [coins]);

  const stats = useMemo(() => {
    const total = networks.length;
    const online = networks.filter((n) => n.nodeStatus === "online").length;
    const offline = networks.filter((n) => n.nodeStatus === "offline").length;
    const dep = networks.filter((n) => n.depositEnabled).length;
    const wd = networks.filter((n) => n.withdrawEnabled).length;
    const hot = networks.filter((n) => n.hotWalletAddress && n.hotWalletKeySet).length;
    return { total, online, offline, dep, wd, hot };
  }, [networks]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return networks.filter((n) => {
      if (coinFilter != null && n.coinId !== coinFilter) return false;
      if (tab === "online" && n.nodeStatus !== "online") return false;
      if (tab === "offline" && n.nodeStatus === "online") return false;
      if (tab === "deposits" && !n.depositEnabled) return false;
      if (tab === "withdrawals" && !n.withdrawEnabled) return false;
      if (tab === "disabled" && (n.depositEnabled || n.withdrawEnabled)) return false;
      if (!q) return true;
      const sym = coinById.get(n.coinId)?.symbol ?? "";
      return [sym, n.name, n.chain, n.providerType, n.nodeAddress ?? "", n.hotWalletAddress ?? "", n.contractAddress ?? "", String(n.id)].join(" ").toLowerCase().includes(q);
    });
  }, [networks, tab, search, coinFilter, coinById]);

  // Coins that actually have networks
  const coinsWithNetworks = useMemo(() => {
    const ids = new Set(networks.map((n) => n.coinId));
    return coins.filter((c) => ids.has(c.id));
  }, [coins, networks]);

  const copy = async (text: string, key: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(null), 1200); } catch { }
  };

  const allFilteredSelected = filtered.length > 0 && filtered.every((n) => selected.has(n.id));
  const someSelected = selected.size > 0;

  const toggleSelectAll = () => {
    if (allFilteredSelected) setSelected(new Set());
    else setSelected(new Set(filtered.map((n) => n.id)));
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Infrastructure"
        title="Networks & Nodes"
        description="Configure blockchain RPC nodes, hot wallets, network fees, and deposit/withdrawal toggles all in one place."
        actions={
          <>
            {isAdmin && (
              <Button
                variant="outline" size="sm"
                className="border-rose-500/40 text-rose-400 hover:bg-rose-500/10 hover:border-rose-500/60"
                onClick={() => setEmergencyOpen(true)}
                data-testid="button-emergency-controls"
              >
                <AlertOctagon className="w-4 h-4 mr-1.5" />
                Emergency
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} data-testid="button-refresh-networks">
              <RefreshCw className={cn("w-4 h-4 mr-1.5", isFetching && "animate-spin")} />
              Refresh
            </Button>
            {isAdmin && (
              <Button onClick={() => setOpen(true)} data-testid="button-add-network">
                <Plus className="w-4 h-4 mr-1.5" />
                Add Network
              </Button>
            )}
          </>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <PremiumStatCard title="Total Networks" value={stats.total} icon={NetworkIcon} hero hint={`${coins.length} coins`} />
        <PremiumStatCard title="Nodes Online" value={stats.online} icon={Server} hint={`${stats.offline} offline`} />
        <PremiumStatCard title="Deposits" value={stats.dep} icon={ArrowDownToLine} hint={`${stats.total - stats.dep} paused`} />
        <PremiumStatCard title="Withdrawals" value={stats.wd} icon={ArrowUpFromLine} hint={`${stats.total - stats.wd} paused`} />
        <PremiumStatCard title="Hot Wallets" value={stats.hot} icon={Wallet} hint="Address + key set" />
        <PremiumStatCard title="Coverage" value={Math.round((stats.online / Math.max(stats.total, 1)) * 100)} suffix="%" icon={ShieldCheck} hint="Online / total" />
      </div>

      {/* Controls bar */}
      <div className="flex flex-col gap-3">
        {/* Coin filter chips */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground font-medium">Coin:</span>
          <button
            onClick={() => setCoinFilter(null)}
            className={cn("px-3 py-1 rounded-full text-xs font-semibold border transition-all", coinFilter === null ? "bg-amber-500/20 border-amber-500/50 text-amber-300" : "border-border/50 text-muted-foreground hover:border-border hover:text-foreground")}
          >
            All
          </button>
          {coinsWithNetworks.map((c) => (
            <button
              key={c.id}
              onClick={() => setCoinFilter(coinFilter === c.id ? null : c.id)}
              className={cn("px-3 py-1 rounded-full text-xs font-semibold border transition-all", coinFilter === c.id ? "bg-amber-500/20 border-amber-500/50 text-amber-300" : "border-border/50 text-muted-foreground hover:border-border hover:text-foreground")}
            >
              {c.symbol}
            </button>
          ))}
        </div>

        {/* Tabs + search + view toggle */}
        <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
          <Tabs value={tab} onValueChange={setTab} className="w-full md:w-auto">
            <TabsList className="overflow-x-auto">
              <TabsTrigger value="all">All <span className="ml-1.5 text-xs text-muted-foreground">{networks.length}</span></TabsTrigger>
              <TabsTrigger value="online">Online <span className="ml-1.5 text-xs text-muted-foreground">{stats.online}</span></TabsTrigger>
              <TabsTrigger value="offline">Offline <span className="ml-1.5 text-xs text-muted-foreground">{stats.total - stats.online}</span></TabsTrigger>
              <TabsTrigger value="deposits">Deposits</TabsTrigger>
              <TabsTrigger value="withdrawals">Withdrawals</TabsTrigger>
              <TabsTrigger value="disabled">Disabled</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex items-center gap-2">
            <div className="relative flex-1 md:w-72">
              <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
              <Input placeholder="Search coin, chain, address…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
            </div>
            <div className="flex border border-border/60 rounded-lg overflow-hidden">
              <button
                onClick={() => setViewMode("table")}
                className={cn("px-2.5 py-2 transition-colors", viewMode === "table" ? "bg-amber-500/20 text-amber-300" : "text-muted-foreground hover:text-foreground")}
                title="Table view"
              >
                <LayoutList className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode("cards")}
                className={cn("px-2.5 py-2 transition-colors border-l border-border/60", viewMode === "cards" ? "bg-amber-500/20 text-amber-300" : "text-muted-foreground hover:text-foreground")}
                title="Card view"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Bulk action bar */}
      {isAdmin && someSelected && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/8 px-4 py-3 flex items-center gap-3 flex-wrap">
          <span className="text-sm font-semibold text-amber-300">{selected.size} selected</span>
          <div className="h-4 w-px bg-border/50" />
          <Button size="sm" variant="outline" className="h-7 text-xs border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10"
            onClick={() => bulkToggle.mutate({ ids: [...selected], depositEnabled: true })} disabled={bulkToggle.isPending}>
            <ArrowDownToLine className="w-3 h-3 mr-1" /> Enable Deposits
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs border-rose-500/40 text-rose-400 hover:bg-rose-500/10"
            onClick={() => bulkToggle.mutate({ ids: [...selected], depositEnabled: false })} disabled={bulkToggle.isPending}>
            <PauseCircle className="w-3 h-3 mr-1" /> Pause Deposits
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10"
            onClick={() => bulkToggle.mutate({ ids: [...selected], withdrawEnabled: true })} disabled={bulkToggle.isPending}>
            <ArrowUpFromLine className="w-3 h-3 mr-1" /> Enable Withdrawals
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs border-rose-500/40 text-rose-400 hover:bg-rose-500/10"
            onClick={() => bulkToggle.mutate({ ids: [...selected], withdrawEnabled: false })} disabled={bulkToggle.isPending}>
            <PauseCircle className="w-3 h-3 mr-1" /> Pause Withdrawals
          </Button>
          <button className="ml-auto text-xs text-muted-foreground hover:text-foreground" onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}

      {/* ── Table view ── */}
      {viewMode === "table" && (
        <div className="premium-card rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  {isAdmin && (
                    <th className="px-4 py-3 w-8">
                      <Checkbox checked={allFilteredSelected} onCheckedChange={toggleSelectAll} className="border-border/60" />
                    </th>
                  )}
                  <th className="text-left font-medium px-4 py-3">Coin</th>
                  <th className="text-left font-medium px-4 py-3">Network</th>
                  <th className="text-left font-medium px-4 py-3">Provider</th>
                  <th className="text-left font-medium px-4 py-3">Node</th>
                  <th className="text-left font-medium px-4 py-3">Hot Wallet</th>
                  <th className="text-right font-medium px-4 py-3">Min Dep / Fee</th>
                  <th className="text-center font-medium px-4 py-3">Deposits</th>
                  <th className="text-center font-medium px-4 py-3">Withdrawals</th>
                  {isAdmin && <th className="text-right font-medium px-4 py-3 pr-5">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {isLoading && Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}><td className="px-4 py-3" colSpan={isAdmin ? 10 : 8}><Skeleton className="h-9 w-full" /></td></tr>
                ))}
                {!isLoading && filtered.length === 0 && (
                  <tr>
                    <td className="px-4 py-3" colSpan={isAdmin ? 10 : 8}>
                      <EmptyState icon={NetworkIcon} title="No networks found"
                        description={search || coinFilter ? "Try adjusting your filters." : "Add your first blockchain network to get started."}
                        action={isAdmin && !search ? <Button onClick={() => setOpen(true)} size="sm"><Plus className="w-4 h-4 mr-1.5" />Add Network</Button> : undefined}
                      />
                    </td>
                  </tr>
                )}
                {!isLoading && filtered.map((n) => {
                  const coin = coinById.get(n.coinId);
                  const provider = PROVIDERS[n.providerType] ?? PROVIDERS.custom;
                  const tr = testResults[n.id];
                  const isSel = selected.has(n.id);
                  return (
                    <tr key={n.id} className={cn("hover:bg-muted/20 transition-colors", isSel && "bg-amber-500/5")} data-testid={`row-network-${n.id}`}>
                      {isAdmin && (
                        <td className="px-4 py-3">
                          <Checkbox checked={isSel} onCheckedChange={(c) => {
                            const s = new Set(selected);
                            c ? s.add(n.id) : s.delete(n.id);
                            setSelected(s);
                          }} className="border-border/60" />
                        </td>
                      )}
                      <td className="px-4 py-3"><CoinChip coin={coin} /></td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <span className="font-mono font-semibold">{n.name}</span>
                          <ChainBadge chain={n.chain} />
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-xs font-medium">{provider.label}</span>
                          {n.rpcApiKeySet && <span className="text-[10px] text-emerald-400 inline-flex items-center gap-1"><KeyRound className="w-2.5 h-2.5" />Key set</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <NodeStatusPill status={n.nodeStatus} />
                            {isAdmin && n.nodeAddress && (
                              <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" disabled={test.isPending && test.variables === n.id} onClick={() => test.mutate(n.id)}>
                                {test.isPending && test.variables === n.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3 mr-0.5" />}
                                Test
                              </Button>
                            )}
                          </div>
                          {n.lastBlockHeight && <div className="text-[11px] text-muted-foreground tabular-nums">block #{n.lastBlockHeight.toLocaleString()}</div>}
                          {tr && !tr.ok && <div className="text-[10px] text-red-400 max-w-[160px] truncate" title={tr.error}>{tr.error}</div>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {n.hotWalletAddress ? (
                          <div className="space-y-1">
                            <button type="button" onClick={() => copy(n.hotWalletAddress!, `hw-${n.id}`)} className="font-mono text-[11px] inline-flex items-center gap-1 hover:text-amber-300 transition-colors">
                              {shortAddr(n.hotWalletAddress, 8, 6)}
                              {copied === `hw-${n.id}` ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 opacity-50" />}
                            </button>
                            {n.hotWalletKeySet ? (
                              <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400"><ShieldCheck className="w-2.5 h-2.5" />Key set</span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] text-amber-400"><AlertTriangle className="w-2.5 h-2.5" />No key</span>
                            )}
                            {n.autoSweepEnabled && (
                              <span className="inline-flex items-center gap-1 text-[10px] text-amber-300 font-semibold">
                                <Workflow className="w-2.5 h-2.5" />Auto-sweep ON
                              </span>
                            )}
                          </div>
                        ) : <span className="text-xs text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-xs">
                        <div className="font-medium">min {n.minDeposit}</div>
                        <div className="text-muted-foreground">
                          {Number(n.withdrawFeePercent) > 0 ? (
                            <>{Number(n.withdrawFee) > 0 && `${n.withdrawFee} + `}<span className="text-amber-400 font-semibold">{n.withdrawFeePercent}%</span></>
                          ) : <>fee {n.withdrawFee}</>}
                        </div>
                      </td>
                      {/* Deposit toggle */}
                      <td className="px-4 py-3">
                        <div className="flex flex-col items-center gap-1">
                          <Switch
                            checked={n.depositEnabled}
                            disabled={!isAdmin || quickToggle.isPending}
                            onCheckedChange={(v) => quickToggle.mutate({ id: n.id, body: { depositEnabled: v } })}
                            data-testid={`switch-deposit-${n.id}`}
                          />
                          <span className={cn("text-[10px] font-semibold", n.depositEnabled ? "text-emerald-400" : "text-muted-foreground")}>
                            {n.depositEnabled ? "ON" : "OFF"}
                          </span>
                        </div>
                      </td>
                      {/* Withdrawal toggle */}
                      <td className="px-4 py-3">
                        <div className="flex flex-col items-center gap-1">
                          <Switch
                            checked={n.withdrawEnabled}
                            disabled={!isAdmin || quickToggle.isPending}
                            onCheckedChange={(v) => quickToggle.mutate({ id: n.id, body: { withdrawEnabled: v } })}
                            data-testid={`switch-withdraw-${n.id}`}
                          />
                          <span className={cn("text-[10px] font-semibold", n.withdrawEnabled ? "text-emerald-400" : "text-muted-foreground")}>
                            {n.withdrawEnabled ? "ON" : "OFF"}
                          </span>
                        </div>
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-3 pr-4 text-right whitespace-nowrap">
                          <Button size="sm" variant="ghost" onClick={() => setEdit(n)} data-testid={`button-edit-network-${n.id}`}>
                            <Pencil className="w-3.5 h-3.5 mr-1" />Edit
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => setDeleteFor(n)} data-testid={`button-delete-network-${n.id}`}>
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
            <div>{filtered.length} of {networks.length} networks{coinFilter ? ` · ${coinById.get(coinFilter)?.symbol}` : ""}</div>
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />{stats.online} online</span>
              <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-400" />{stats.offline} offline</span>
              <span className="inline-flex items-center gap-1"><Wallet className="w-3 h-3" />{stats.hot} ready</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Card view ── */}
      {viewMode === "cards" && (
        <div>
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {[0,1,2,3,4,5].map((i) => <Skeleton key={i} className="h-52 rounded-xl" />)}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState icon={NetworkIcon} title="No networks found"
              description={search || coinFilter ? "Try adjusting your filters." : "Add your first blockchain network to get started."}
              action={isAdmin ? <Button onClick={() => setOpen(true)} size="sm"><Plus className="w-4 h-4 mr-1.5" />Add Network</Button> : undefined}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filtered.map((n) => {
                const coin = coinById.get(n.coinId);
                const col = chainColor(n.chain);
                const tr = testResults[n.id];
                const isSel = selected.has(n.id);
                return (
                  <div
                    key={n.id}
                    className={cn("rounded-xl border overflow-hidden transition-all duration-150", isSel && "ring-2 ring-amber-500/40")}
                    style={{ borderColor: col.border, backgroundColor: col.bg }}
                    data-testid={`card-network-${n.id}`}
                  >
                    {/* Card header */}
                    <div className="px-4 pt-4 pb-3 flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        {isAdmin && (
                          <Checkbox checked={isSel} onCheckedChange={(c) => {
                            const s = new Set(selected);
                            c ? s.add(n.id) : s.delete(n.id);
                            setSelected(s);
                          }} className="border-border/60 mt-0.5" />
                        )}
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-bold text-sm">{coin?.symbol ?? "?"}</span>
                            <ChainBadge chain={n.chain} />
                            <NodeStatusPill status={n.nodeStatus} />
                          </div>
                          <div className="text-xs text-muted-foreground font-mono">{n.name}</div>
                        </div>
                      </div>
                      {isAdmin && (
                        <div className="flex items-center gap-1">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEdit(n)}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setDeleteFor(n)}>
                            <Trash2 className="w-3.5 h-3.5 text-destructive" />
                          </Button>
                        </div>
                      )}
                    </div>

                    {/* Toggle section — the star of the card */}
                    <div className="mx-4 mb-3 rounded-xl border border-border/40 bg-background/50 overflow-hidden divide-y divide-border/40">
                      {/* Deposit */}
                      <div className="flex items-center justify-between px-3.5 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center", n.depositEnabled ? "bg-emerald-500/15" : "bg-muted/30")}>
                            <ArrowDownToLine className={cn("w-3.5 h-3.5", n.depositEnabled ? "text-emerald-400" : "text-muted-foreground")} />
                          </div>
                          <div>
                            <div className="text-xs font-semibold">Deposits</div>
                            <div className={cn("text-[10px] font-bold", n.depositEnabled ? "text-emerald-400" : "text-rose-400/70")}>
                              {n.depositEnabled ? "ENABLED" : "PAUSED"}
                            </div>
                          </div>
                        </div>
                        <Switch
                          checked={n.depositEnabled}
                          disabled={!isAdmin || quickToggle.isPending}
                          onCheckedChange={(v) => quickToggle.mutate({ id: n.id, body: { depositEnabled: v } })}
                          data-testid={`card-switch-deposit-${n.id}`}
                        />
                      </div>
                      {/* Withdrawal */}
                      <div className="flex items-center justify-between px-3.5 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center", n.withdrawEnabled ? "bg-emerald-500/15" : "bg-muted/30")}>
                            <ArrowUpFromLine className={cn("w-3.5 h-3.5", n.withdrawEnabled ? "text-emerald-400" : "text-muted-foreground")} />
                          </div>
                          <div>
                            <div className="text-xs font-semibold">Withdrawals</div>
                            <div className={cn("text-[10px] font-bold", n.withdrawEnabled ? "text-emerald-400" : "text-rose-400/70")}>
                              {n.withdrawEnabled ? "ENABLED" : "PAUSED"}
                            </div>
                          </div>
                        </div>
                        <Switch
                          checked={n.withdrawEnabled}
                          disabled={!isAdmin || quickToggle.isPending}
                          onCheckedChange={(v) => quickToggle.mutate({ id: n.id, body: { withdrawEnabled: v } })}
                          data-testid={`card-switch-withdraw-${n.id}`}
                        />
                      </div>
                    </div>

                    {/* Info footer */}
                    <div className="px-4 pb-4 grid grid-cols-3 gap-2 text-[10px] text-muted-foreground">
                      <div>
                        <div className="font-semibold text-foreground/70 mb-0.5">Min Dep</div>
                        <div className="tabular-nums">{n.minDeposit}</div>
                      </div>
                      <div>
                        <div className="font-semibold text-foreground/70 mb-0.5">Fee</div>
                        <div className="tabular-nums">
                          {Number(n.withdrawFeePercent) > 0 ? `${n.withdrawFeePercent}%` : n.withdrawFee}
                        </div>
                      </div>
                      <div>
                        <div className="font-semibold text-foreground/70 mb-0.5">Confs</div>
                        <div className="tabular-nums">{n.confirmations}</div>
                      </div>
                    </div>

                    {/* Hot wallet row */}
                    {n.hotWalletAddress && (
                      <div className="border-t border-border/30 px-4 py-2 flex items-center gap-2">
                        <Wallet className="w-3 h-3 text-muted-foreground shrink-0" />
                        <button
                          onClick={() => copy(n.hotWalletAddress!, `card-hw-${n.id}`)}
                          className="font-mono text-[10px] text-muted-foreground hover:text-amber-300 transition-colors flex items-center gap-1 truncate"
                        >
                          {shortAddr(n.hotWalletAddress, 10, 6)}
                          {copied === `card-hw-${n.id}` ? <Check className="w-2.5 h-2.5 text-emerald-400 shrink-0" /> : <Copy className="w-2.5 h-2.5 opacity-50 shrink-0" />}
                        </button>
                        {n.hotWalletKeySet && <ShieldCheck className="w-3 h-3 text-emerald-400 shrink-0" />}
                      </div>
                    )}

                    {/* RPC test result */}
                    {isAdmin && n.nodeAddress && (
                      <div className="border-t border-border/30 px-4 py-2 flex items-center justify-between">
                        <span className="text-[10px] text-muted-foreground font-mono truncate mr-2">{shortAddr(n.nodeAddress, 20, 8)}</span>
                        <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px] shrink-0" disabled={test.isPending && test.variables === n.id} onClick={() => test.mutate(n.id)}>
                          {test.isPending && test.variables === n.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3 mr-0.5" />}
                          Test
                        </Button>
                      </div>
                    )}
                    {tr && (
                      <div className={cn("border-t border-border/30 px-4 py-1.5 text-[10px] font-medium", tr.ok ? "text-emerald-400" : "text-red-400")}>
                        {tr.ok ? `Online · block #${tr.blockHeight?.toLocaleString()} · ${tr.latencyMs}ms` : tr.error}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <div className="mt-3 text-xs text-muted-foreground">{filtered.length} of {networks.length} networks</div>
        </div>
      )}

      {/* Emergency controls dialog */}
      <Dialog open={emergencyOpen} onOpenChange={setEmergencyOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-400">
              <AlertOctagon className="w-5 h-5" />
              Emergency Controls
            </DialogTitle>
            <DialogDescription>
              Instantly pause or resume platform-wide deposits and withdrawals. These actions take effect immediately and impact all active users.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {/* Pause/Resume all deposits */}
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/8 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <ArrowDownToLine className="w-4 h-4 text-rose-400" />
                <span className="text-sm font-semibold">All Deposits</span>
                <Badge variant="outline" className="ml-auto text-[10px]">{stats.dep} enabled</Badge>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm" variant="outline"
                  className="flex-1 border-rose-500/40 text-rose-400 hover:bg-rose-500/10"
                  onClick={() => { bulkToggle.mutate({ all: true, depositEnabled: false }); setEmergencyOpen(false); }}
                  disabled={bulkToggle.isPending}
                >
                  <PauseCircle className="w-3.5 h-3.5 mr-1.5" />
                  Pause ALL Deposits
                </Button>
                <Button
                  size="sm" variant="outline"
                  className="flex-1 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10"
                  onClick={() => { bulkToggle.mutate({ all: true, depositEnabled: true }); setEmergencyOpen(false); }}
                  disabled={bulkToggle.isPending}
                >
                  <PlayCircle className="w-3.5 h-3.5 mr-1.5" />
                  Resume ALL Deposits
                </Button>
              </div>
            </div>
            {/* Pause/Resume all withdrawals */}
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/8 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <ArrowUpFromLine className="w-4 h-4 text-amber-400" />
                <span className="text-sm font-semibold">All Withdrawals</span>
                <Badge variant="outline" className="ml-auto text-[10px]">{stats.wd} enabled</Badge>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm" variant="outline"
                  className="flex-1 border-amber-500/40 text-amber-400 hover:bg-amber-500/10"
                  onClick={() => { bulkToggle.mutate({ all: true, withdrawEnabled: false }); setEmergencyOpen(false); }}
                  disabled={bulkToggle.isPending}
                >
                  <PauseCircle className="w-3.5 h-3.5 mr-1.5" />
                  Pause ALL Withdrawals
                </Button>
                <Button
                  size="sm" variant="outline"
                  className="flex-1 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10"
                  onClick={() => { bulkToggle.mutate({ all: true, withdrawEnabled: true }); setEmergencyOpen(false); }}
                  disabled={bulkToggle.isPending}
                >
                  <PlayCircle className="w-3.5 h-3.5 mr-1.5" />
                  Resume ALL Withdrawals
                </Button>
              </div>
            </div>
            {/* Pause everything */}
            <div className="rounded-xl border border-rose-600/40 bg-rose-600/10 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Shield className="w-4 h-4 text-rose-500" />
                <span className="text-sm font-semibold text-rose-300">Nuclear Option</span>
              </div>
              <Button
                variant="destructive" size="sm" className="w-full"
                onClick={() => { bulkToggle.mutate({ all: true, depositEnabled: false, withdrawEnabled: false }); setEmergencyOpen(false); }}
                disabled={bulkToggle.isPending}
              >
                <AlertOctagon className="w-3.5 h-3.5 mr-1.5" />
                Pause ALL Deposits + Withdrawals
              </Button>
              <p className="text-[10px] text-rose-400/70 mt-2 text-center">Use only during security incidents or scheduled maintenance</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmergencyOpen(false)}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add */}
      {isAdmin && (
        <NetworkFormDialog open={open} onOpenChange={setOpen}
          title="Add new network" description="Select a coin, then configure the RPC node and hot wallet."
          submitLabel="Add network" submitting={create.isPending} coins={coins} onSubmit={(v) => create.mutate(v)}
        />
      )}

      {/* Edit */}
      {isAdmin && edit && (
        <NetworkFormDialog open={!!edit} onOpenChange={(o) => { if (!o) setEdit(null); }}
          title={`Edit ${coinById.get(edit.coinId)?.symbol ?? "?"} / ${edit.name}`}
          description="Update network details. Changes will be applied immediately."
          submitLabel="Save changes" submitting={update.isPending} coins={coins} initial={edit}
          onTest={() => test.mutate(edit.id)} testing={test.isPending && test.variables === edit.id}
          testResult={testResults[edit.id]}
          onSubmit={(v) => update.mutate({ id: edit.id, body: v })}
        />
      )}

      {/* Delete confirm */}
      <Dialog open={!!deleteFor} onOpenChange={(o) => { if (!o) setDeleteFor(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-400" />Delete network
            </DialogTitle>
            <DialogDescription>
              {deleteFor && (<>Are you sure you want to delete <strong className="text-foreground">{coinById.get(deleteFor.coinId)?.symbol} / {deleteFor.name}</strong>? This action is permanent and cannot be undone.</>)}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteFor(null)}>Cancel</Button>
            <Button variant="destructive" disabled={remove.isPending} onClick={() => deleteFor && remove.mutate(deleteFor.id)} data-testid="button-confirm-delete-network">
              {remove.isPending && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}Delete network
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ───── Network form dialog ─────────────────────────────────────────────────
function NetworkFormDialog({
  open, onOpenChange, title, description, submitLabel, submitting,
  coins, initial, onTest, testing, testResult, onSubmit,
}: {
  open: boolean; onOpenChange: (o: boolean) => void;
  title: string; description?: string; submitLabel: string; submitting: boolean;
  coins: Coin[]; initial?: Network;
  onTest?: () => void; testing?: boolean; testResult?: any;
  onSubmit: (v: any) => void;
}) {
  const empty: any = {
    confirmations: 12, depositEnabled: true, withdrawEnabled: true, memoRequired: false,
    status: "active", nodeStatus: "unknown", providerType: "custom",
    minDeposit: "0", minWithdraw: "0", withdrawFee: "0", withdrawFeePercent: "0", withdrawFeeMin: "0",
  };
  const [v, setV] = useState<any>(initial ?? empty);
  const [showRpcKey, setShowRpcKey] = useState(false);
  const [showHotKey, setShowHotKey] = useState(false);

  useEffect(() => {
    if (open) { setV(initial ?? empty); setShowRpcKey(false); setShowHotKey(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial?.id]);

  const set = (k: string, val: any) => setV((p: any) => ({ ...p, [k]: val }));
  const provider = PROVIDERS[v.providerType] ?? PROVIDERS.custom;
  const canSave = !!v.coinId && !!v.name && !!v.chain && !submitting;
  const previewAmounts = [100, 500, 1000, 5000];
  const showFeePreview = Number(v.withdrawFeePercent) > 0 || Number(v.withdrawFeeMin) > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="stat-orb w-10 h-10 rounded-lg flex items-center justify-center shrink-0">
              <NetworkIcon className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <DialogTitle>{title}</DialogTitle>
              {description && <DialogDescription>{description}</DialogDescription>}
            </div>
          </div>
        </DialogHeader>

        <div className="max-h-[68vh] overflow-y-auto pr-1 space-y-4">
          {/* Identity */}
          <FormSection icon={Tag} title="Identity">
            <Field label="Coin *">
              <Select value={v.coinId ? String(v.coinId) : ""} onValueChange={(c) => set("coinId", Number(c))}>
                <SelectTrigger data-testid="select-network-coin"><SelectValue placeholder="Select coin" /></SelectTrigger>
                <SelectContent>{coins.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.symbol}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Network name *" hint="e.g. BEP20, TRC20, ERC20">
              <Input value={v.name ?? ""} onChange={(e) => set("name", e.target.value)} data-testid="input-network-name" />
            </Field>
            <Field label="Chain *" hint="BNB, ETH, TRX, BTC, SOL, POLYGON">
              <Input value={v.chain ?? ""} onChange={(e) => set("chain", e.target.value.toUpperCase())} placeholder="BNB" data-testid="input-network-chain" />
            </Field>
            <Field label="Token contract" hint="Blank for native coin">
              <Input value={v.contractAddress ?? ""} onChange={(e) => set("contractAddress", e.target.value)} placeholder="0x55d398…" className="font-mono text-xs" data-testid="input-contract-address" />
            </Field>
          </FormSection>

          {/* RPC Node */}
          <FormSection icon={Wifi} title="RPC Node">
            <Field label="Provider">
              <Select value={v.providerType ?? "custom"} onValueChange={(p) => set("providerType", p)}>
                <SelectTrigger data-testid="select-network-provider"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(PROVIDERS).map(([k, p]) => <SelectItem key={k} value={k}>{p.label}</SelectItem>)}</SelectContent>
              </Select>
              {provider.signupUrl && (
                <a href={provider.signupUrl} target="_blank" rel="noopener" className="text-[11px] text-sky-400 hover:underline inline-flex items-center gap-1 mt-0.5">
                  Get free API key <ExternalLink className="w-2.5 h-2.5" />
                </a>
              )}
            </Field>
            <Field label="Min confirmations">
              <Input type="number" min={1} value={v.confirmations ?? 12} onChange={(e) => set("confirmations", Number(e.target.value))} data-testid="input-confirmations" />
            </Field>
            <Field label="RPC URL" full>
              <Input value={v.nodeAddress ?? ""} onChange={(e) => set("nodeAddress", e.target.value)} placeholder={provider.placeholder} className="font-mono text-xs" data-testid="input-rpc-url" />
            </Field>
            <Field label="RPC API key" full hint="Optional. Encrypted at rest.">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <KeyRound className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
                  <Input type={showRpcKey ? "text" : "password"} className="pl-8 font-mono text-xs" value={v.rpcApiKey ?? ""} onChange={(e) => set("rpcApiKey", e.target.value)}
                    placeholder={initial?.rpcApiKeySet ? "•••• (set, blank = keep)" : "Paste API key"} data-testid="input-rpc-api-key" />
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => setShowRpcKey(!showRpcKey)}>{showRpcKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}</Button>
              </div>
            </Field>
            <Field label="Block explorer URL" full hint="Shown to users on tx pages">
              <div className="relative">
                <ExternalLink className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
                <Input className="pl-8" value={v.explorerUrl ?? ""} onChange={(e) => set("explorerUrl", e.target.value)} placeholder="https://bscscan.com" data-testid="input-explorer-url" />
              </div>
            </Field>
            {onTest && (
              <div className="md:col-span-2 flex items-center gap-2 pt-1">
                <Button type="button" size="sm" variant="secondary" onClick={onTest} disabled={testing} data-testid="button-test-rpc">
                  {testing ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Zap className="w-3 h-3 mr-1" />}
                  Test connection
                </Button>
                {testResult && (
                  testResult.ok ? (
                    <span className="text-xs text-emerald-400 inline-flex items-center gap-1"><Check className="w-3 h-3" />Online · block #{testResult.blockHeight} · {testResult.latencyMs}ms</span>
                  ) : (
                    <span className="text-xs text-red-400 inline-flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{testResult.error}</span>
                  )
                )}
              </div>
            )}
          </FormSection>

          {/* Hot Wallet */}
          <FormSection icon={Wallet} title="Hot Wallet">
            <Field label="Hot wallet address" full hint="Deposit destination + withdrawal source">
              <Input value={v.hotWalletAddress ?? ""} onChange={(e) => set("hotWalletAddress", e.target.value)} placeholder="0x… / TR… / bc1…" className="font-mono text-xs" data-testid="input-hot-wallet-address" />
            </Field>
            <Field label="Private key (encrypted)" full>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <KeyRound className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
                  <Input type={showHotKey ? "text" : "password"} className="pl-8 font-mono text-xs" value={v.hotWalletPrivateKey ?? ""} onChange={(e) => set("hotWalletPrivateKey", e.target.value)}
                    placeholder={initial?.hotWalletKeySet ? "•••• (set, blank = keep)" : "Private key / mnemonic"} data-testid="input-hot-wallet-key" />
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => setShowHotKey(!showHotKey)}>{showHotKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}</Button>
              </div>
              <p className="text-[11px] text-amber-400 inline-flex items-start gap-1 mt-1 md:col-span-2">
                <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                Encrypted at rest. Used only for server-side withdrawal signing. Never exposed via any API.
              </p>
            </Field>
          </FormSection>

          {/* Limits & Fees */}
          <FormSection icon={CircleDollarSign} title="Limits & Fees">
            <Field label="Min deposit">
              <Input value={v.minDeposit ?? "0"} onChange={(e) => set("minDeposit", e.target.value)} data-testid="input-min-deposit" />
            </Field>
            <Field label="Min withdraw">
              <Input value={v.minWithdraw ?? "0"} onChange={(e) => set("minWithdraw", e.target.value)} data-testid="input-min-withdraw" />
            </Field>
            <div className="md:col-span-2 rounded-lg border border-amber-500/30 bg-gradient-to-br from-amber-500/[0.06] to-orange-500/[0.04] p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Calculator className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-semibold text-amber-300">Withdraw fee structure</span>
              </div>
              <p className="text-[11px] text-muted-foreground">Total = <span className="font-mono">Fixed + (Amount × Percent)</span>, but never less than Minimum.</p>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Fixed fee">
                  <Input type="number" step="0.00000001" value={v.withdrawFee ?? "0"} onChange={(e) => set("withdrawFee", e.target.value)} data-testid="input-withdraw-fee" />
                  <p className="text-[10px] text-muted-foreground">in {v.chain || "coin"}</p>
                </Field>
                <Field label="Percent %">
                  <Input type="number" step="0.01" value={v.withdrawFeePercent ?? "0"} onChange={(e) => set("withdrawFeePercent", e.target.value)} data-testid="input-withdraw-fee-percent" />
                  <p className="text-[10px] text-muted-foreground">e.g. 2 = 2%</p>
                </Field>
                <Field label="Minimum">
                  <Input type="number" step="0.00000001" value={v.withdrawFeeMin ?? "0"} onChange={(e) => set("withdrawFeeMin", e.target.value)} data-testid="input-withdraw-fee-min" />
                  <p className="text-[10px] text-muted-foreground">floor cap</p>
                </Field>
              </div>
              {showFeePreview && (
                <div className="rounded-md border border-border/60 bg-background/40 p-2.5 space-y-1">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Live preview</div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] tabular-nums">
                    {previewAmounts.map((amt) => {
                      const calc = (Number(v.withdrawFee) || 0) + (amt * (Number(v.withdrawFeePercent) || 0)) / 100;
                      const fee = Math.max(calc, Number(v.withdrawFeeMin) || 0);
                      return (
                        <div key={amt} className="flex justify-between gap-2">
                          <span className="text-muted-foreground">{amt}</span>
                          <span className="font-semibold text-amber-300">{fee.toFixed(4)}{fee > calc && <span className="text-[9px] text-amber-500/70 ml-1">(min)</span>}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </FormSection>

          {/* Toggles & Status */}
          <FormSection icon={Settings2} title="Toggles & Status">
            <Field label="Status">
              <Select value={v.status ?? "active"} onValueChange={(s) => set("status", s)}>
                <SelectTrigger data-testid="select-network-status"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="paused">Paused</SelectItem></SelectContent>
              </Select>
            </Field>
            <Field label="Memo required" hint="Toggle if chain needs memo/tag (XRP, EOS, etc.)">
              <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
                <div className="flex items-center gap-2 text-sm"><Hash className="w-4 h-4 text-muted-foreground" /><span>{v.memoRequired ? "Required" : "Not required"}</span></div>
                <Switch checked={!!v.memoRequired} onCheckedChange={(c) => set("memoRequired", c)} data-testid="switch-memo-required" />
              </div>
            </Field>
            <Field label="Deposits" full>
              <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5">
                <div className="flex items-center gap-2 text-sm">
                  <ArrowDownToLine className={cn("w-4 h-4", v.depositEnabled ? "text-emerald-400" : "text-muted-foreground")} />
                  <span>{v.depositEnabled ? "Deposits enabled" : "Deposits paused"}</span>
                </div>
                <Switch checked={!!v.depositEnabled} onCheckedChange={(c) => set("depositEnabled", c)} data-testid="switch-form-deposit" />
              </div>
            </Field>
            <Field label="Withdrawals" full>
              <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5">
                <div className="flex items-center gap-2 text-sm">
                  <ArrowUpFromLine className={cn("w-4 h-4", v.withdrawEnabled ? "text-emerald-400" : "text-muted-foreground")} />
                  <span>{v.withdrawEnabled ? "Withdrawals enabled" : "Withdrawals paused"}</span>
                </div>
                <Switch checked={!!v.withdrawEnabled} onCheckedChange={(c) => set("withdrawEnabled", c)} data-testid="switch-form-withdraw" />
              </div>
            </Field>
            <Field label="Auto-Sweep to Master Wallet" full hint="Confirmed deposits automatically swept to hot wallet on-chain. Requires hot wallet address + private key to be set.">
              <div className={cn(
                "flex items-center justify-between rounded-lg border px-3 py-2.5 transition-colors",
                v.autoSweepEnabled
                  ? "border-amber-500/40 bg-amber-500/8"
                  : "border-border/60 bg-muted/20",
              )}>
                <div className="flex items-center gap-2 text-sm">
                  <Workflow className={cn("w-4 h-4", v.autoSweepEnabled ? "text-amber-400" : "text-muted-foreground")} />
                  <div>
                    <span className={v.autoSweepEnabled ? "text-amber-300 font-semibold" : ""}>
                      {v.autoSweepEnabled ? "Auto-sweep ON" : "Auto-sweep OFF"}
                    </span>
                    {v.autoSweepEnabled && (
                      <p className="text-[10px] text-amber-500/80 mt-0.5">
                        Deposits → hot wallet automatically after confirmation
                      </p>
                    )}
                  </div>
                </div>
                <Switch
                  checked={!!v.autoSweepEnabled}
                  onCheckedChange={(c) => set("autoSweepEnabled", c)}
                  data-testid="switch-auto-sweep"
                  disabled={!v.hotWalletAddress && !v.hotWalletKeySet}
                />
              </div>
              {v.autoSweepEnabled && !(v.hotWalletAddress || v.hotWalletKeySet) && (
                <p className="text-[11px] text-rose-400 inline-flex items-center gap-1 mt-1">
                  <AlertTriangle className="w-3 h-3 shrink-0" />
                  Set the hot wallet address and private key first
                </p>
              )}
            </Field>
          </FormSection>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => {
              const payload = { ...v };
              if (!payload.rpcApiKey) delete payload.rpcApiKey;
              if (!payload.hotWalletPrivateKey) delete payload.hotWalletPrivateKey;
              onSubmit(payload);
            }}
            disabled={!canSave} data-testid="button-save-network"
          >
            {submitting && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FormSection({ icon: Icon, title, children }: { icon: typeof Tag; title: string; children: React.ReactNode }) {
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
      <Label className="text-xs">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
