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
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  Coins as CoinsIcon, Plus, Pencil, Trash2, Search, RefreshCw, ListChecks,
  Eye, EyeOff, TrendingUp, TrendingDown, Activity, Sparkles, Calendar, Link2,
  Image as ImageIcon, FileText, Hash, Tag, Layers, Zap, Loader2,
  CircleDollarSign, AlertTriangle, Download, ExternalLink,
} from "lucide-react";

type Coin = {
  id: number; symbol: string; name: string; type: string; decimals: number;
  logoUrl: string | null; description: string | null; status: string; isListed: boolean;
  listingAt: string | null; currentPrice: string; change24h: string;
  binanceSymbol: string | null; priceSource: string; manualPrice: string | null;
  infoUrl: string | null; marketCapRank: number | null;
  createdAt?: string; updatedAt?: string;
};

const COIN_GRADIENTS = [
  "from-orange-500 to-amber-500",
  "from-blue-500 to-cyan-500",
  "from-violet-500 to-fuchsia-500",
  "from-emerald-500 to-teal-500",
  "from-rose-500 to-pink-500",
  "from-indigo-500 to-blue-500",
  "from-yellow-500 to-orange-500",
  "from-sky-500 to-blue-500",
];

function coinGradient(symbol: string): string {
  let h = 0;
  for (let i = 0; i < symbol.length; i++) h = (h * 31 + symbol.charCodeAt(i)) >>> 0;
  return COIN_GRADIENTS[h % COIN_GRADIENTS.length];
}

function CoinAvatar({ coin, size = 9 }: { coin: Pick<Coin, "symbol" | "logoUrl">; size?: number }) {
  const [errored, setErrored] = useState(false);
  const px = `w-${size} h-${size}`;
  if (coin.logoUrl && !errored) {
    return (
      <img
        src={coin.logoUrl}
        alt={coin.symbol}
        className={cn(px, "rounded-full bg-muted/30 object-cover ring-1 ring-border/60")}
        onError={() => setErrored(true)}
      />
    );
  }
  return (
    <div
      className={cn(
        px,
        "rounded-full bg-gradient-to-br flex items-center justify-center text-white font-bold ring-1 ring-white/15 shadow-md",
        coinGradient(coin.symbol),
        size <= 8 ? "text-[10px]" : "text-xs",
      )}
    >
      {coin.symbol.slice(0, 3)}
    </div>
  );
}

function fmtPrice(v: string | number, decimals = 6): string {
  const n = typeof v === "string" ? Number(v) : v;
  if (!Number.isFinite(n)) return "—";
  if (n === 0) return "0";
  if (n >= 1) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return n.toLocaleString("en-US", { maximumFractionDigits: decimals, minimumFractionDigits: 2 });
}

function relTime(s: string | null | undefined): string {
  if (!s) return "—";
  const t = new Date(s).getTime();
  if (!Number.isFinite(t)) return "—";
  const diff = t - Date.now();
  const abs = Math.abs(diff);
  const m = Math.round(abs / 60000);
  const h = Math.round(abs / 3600000);
  const d = Math.round(abs / 86400000);
  const txt = m < 60 ? `${m}m` : h < 48 ? `${h}h` : `${d}d`;
  return diff > 0 ? `in ${txt}` : `${txt} ago`;
}

// ───────────────────────────────────────────────────────────────────────────
export default function CoinsPage() {
  const { user: me } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const isAdmin = me?.role === "admin" || me?.role === "superadmin";

  const [tab, setTab] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Coin | null>(null);
  const [deleteFor, setDeleteFor] = useState<Coin | null>(null);
  const [discoveryOpen, setDiscoveryOpen] = useState(false);
  const [prefill, setPrefill] = useState<Partial<Coin> | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSizeOption>(20);

  const { data = [], isLoading, refetch, isFetching } = useQuery<Coin[]>({
    queryKey: ["/admin/coins"],
    queryFn: () => get<Coin[]>("/admin/coins"),
  });

  const create = useMutation({
    mutationFn: (v: Partial<Coin>) => post("/admin/coins", v),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/admin/coins"] });
      setOpen(false);
      toast({ title: "Coin added" });
    },
    onError: (e: Error) => toast({ title: "Add failed", description: e.message, variant: "destructive" }),
  });
  const update = useMutation({
    mutationFn: ({ id, v }: { id: number; v: Partial<Coin> }) => patch(`/admin/coins/${id}`, v),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/admin/coins"] });
      setEdit(null);
      toast({ title: "Coin updated" });
    },
    onError: (e: Error) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });
  const quickToggle = useMutation({
    mutationFn: ({ id, v }: { id: number; v: Partial<Coin> }) => patch(`/admin/coins/${id}`, v),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/admin/coins"] }),
    onError: (e: Error) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });
  const remove = useMutation({
    mutationFn: (id: number) => del(`/admin/coins/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/admin/coins"] });
      setDeleteFor(null);
      toast({ title: "Coin removed" });
    },
    onError: (e: Error) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  // Stats from in-memory data
  const stats = useMemo(() => {
    const total = data.length;
    const listed = data.filter((c) => c.isListed).length;
    const active = data.filter((c) => c.status === "active").length;
    const manual = data.filter((c) => c.priceSource === "manual").length;
    const upcoming = data.filter((c) => c.listingAt && new Date(c.listingAt).getTime() > Date.now()).length;
    const gainers = data.filter((c) => Number(c.change24h) > 0).length;
    const losers = data.filter((c) => Number(c.change24h) < 0).length;
    const sorted = [...data].sort((a, b) => Number(b.change24h) - Number(a.change24h));
    const topGainer = sorted[0];
    const topLoser = sorted[sorted.length - 1];
    return { total, listed, active, manual, upcoming, gainers, losers, topGainer, topLoser };
  }, [data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.filter((c) => {
      if (tab === "listed" && !c.isListed) return false;
      if (tab === "unlisted" && c.isListed) return false;
      if (tab === "manual" && c.priceSource !== "manual") return false;
      if (tab === "upcoming") {
        if (!c.listingAt || new Date(c.listingAt).getTime() <= Date.now()) return false;
      }
      if (tab === "paused" && c.status !== "paused") return false;
      if (!q) return true;
      const fields = [c.symbol, c.name, c.binanceSymbol ?? "", c.type, String(c.id)]
        .join(" ").toLowerCase();
      return fields.includes(q);
    });
  }, [data, tab, search]);

  // Reset to page 1 whenever filters change
  useEffect(() => { setPage(1); }, [tab, search, pageSize]);

  const paged = useMemo(
    () => filtered.slice((page - 1) * pageSize, page * pageSize),
    [filtered, page, pageSize],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Markets"
        title="Coins & Tokens"
        description="Manage listed assets — pricing source, listing schedule, visibility, and status all in one place."
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              data-testid="button-refresh-coins"
            >
              <RefreshCw className={cn("w-4 h-4 mr-1.5", isFetching && "animate-spin")} />
              Refresh
            </Button>
            {isAdmin && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDiscoveryOpen(true)}
                data-testid="button-binance-discover"
              >
                <Download className="w-4 h-4 mr-1.5" />
                Import from Binance
              </Button>
            )}
            {isAdmin && (
              <Button onClick={() => { setPrefill(null); setOpen(true); }} data-testid="button-add-coin">
                <Plus className="w-4 h-4 mr-1.5" />
                Add Coin
              </Button>
            )}
          </>
        }
      />

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 md:gap-4">
        <PremiumStatCard
          title="Total Coins" value={stats.total} icon={CoinsIcon} hero
          hint={`${stats.listed} listed`}
        />
        <PremiumStatCard
          title="Active" value={stats.active} icon={Activity}
          hint={`${stats.total - stats.active} paused/delisted`}
        />
        <PremiumStatCard
          title="Listed" value={stats.listed} icon={Eye}
          hint={`${stats.total - stats.listed} hidden`}
        />
        <PremiumStatCard
          title="Manual Pricing" value={stats.manual} icon={Sparkles}
          hint={`${stats.total - stats.manual} live`}
        />
        <PremiumStatCard
          title="Gainers (24h)" value={stats.gainers} icon={TrendingUp}
          hint={stats.topGainer ? `${stats.topGainer.symbol} ${Number(stats.topGainer.change24h).toFixed(2)}%` : "—"}
        />
        <PremiumStatCard
          title="Upcoming" value={stats.upcoming} icon={Calendar}
          hint="Scheduled listings"
        />
      </div>

      {/* Tabs + Search */}
      <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
        <Tabs value={tab} onValueChange={setTab} className="w-full md:w-auto">
          <TabsList className="overflow-x-auto">
            <TabsTrigger value="all" data-testid="tab-coins-all">All <span className="ml-1.5 text-xs text-muted-foreground">{data.length}</span></TabsTrigger>
            <TabsTrigger value="listed" data-testid="tab-coins-listed">Listed <span className="ml-1.5 text-xs text-muted-foreground">{stats.listed}</span></TabsTrigger>
            <TabsTrigger value="unlisted" data-testid="tab-coins-unlisted">Unlisted <span className="ml-1.5 text-xs text-muted-foreground">{stats.total - stats.listed}</span></TabsTrigger>
            <TabsTrigger value="manual" data-testid="tab-coins-manual">Manual <span className="ml-1.5 text-xs text-muted-foreground">{stats.manual}</span></TabsTrigger>
            <TabsTrigger value="upcoming" data-testid="tab-coins-upcoming">Upcoming <span className="ml-1.5 text-xs text-muted-foreground">{stats.upcoming}</span></TabsTrigger>
            <TabsTrigger value="paused" data-testid="tab-coins-paused">Paused</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative md:w-80">
          <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input
            placeholder="Search symbol, name, binance pair…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
            data-testid="input-search-coins"
          />
        </div>
      </div>

      {/* Premium table */}
      <div className="premium-card rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-3">Coin</th>
                <th className="text-left font-medium px-4 py-3">Source</th>
                <th className="text-right font-medium px-4 py-3">Price (USDT)</th>
                <th className="text-right font-medium px-4 py-3">24h %</th>
                <th className="text-center font-medium px-4 py-3">Listed</th>
                <th className="text-left font-medium px-4 py-3">Status</th>
                <th className="text-left font-medium px-4 py-3">Listing</th>
                {isAdmin && <th className="text-right font-medium px-4 py-3 pr-5">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {isLoading && (
                <>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}>
                      <td className="px-4 py-3" colSpan={isAdmin ? 8 : 7}>
                        <Skeleton className="h-9 w-full" />
                      </td>
                    </tr>
                  ))}
                </>
              )}
              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td className="px-4 py-3" colSpan={isAdmin ? 8 : 7}>
                    <EmptyState
                      icon={CoinsIcon}
                      title="No coins found"
                      description={search ? "Try changing your search query." : "Add your first coin to get started."}
                      action={isAdmin && !search ? (
                        <Button onClick={() => setOpen(true)} size="sm">
                          <Plus className="w-4 h-4 mr-1.5" />Add Coin
                        </Button>
                      ) : undefined}
                    />
                  </td>
                </tr>
              )}
              {!isLoading && paged.map((c) => {
                const change = Number(c.change24h);
                const up = change >= 0;
                const isUpcoming = c.listingAt && new Date(c.listingAt).getTime() > Date.now();
                return (
                  <tr key={c.id} className="hover:bg-muted/20 transition-colors" data-testid={`row-coin-${c.symbol}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <CoinAvatar coin={c} size={9} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-foreground">{c.symbol}</span>
                            <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground border border-border/60">
                              {c.type}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground truncate max-w-[180px]">{c.name}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {c.priceSource === "manual" ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-violet-500/15 text-violet-300 border border-violet-500/30">
                          <Sparkles className="w-3 h-3" />Manual
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/25">
                          <Zap className="w-3 h-3" />Live{c.binanceSymbol ? ` · ${c.binanceSymbol}` : ""}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium">
                      ${fmtPrice(c.currentPrice)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={cn(
                        "inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded font-medium tabular-nums text-xs",
                        up ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400",
                      )}>
                        {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {change.toFixed(2)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Switch
                        checked={c.isListed}
                        disabled={!isAdmin || quickToggle.isPending}
                        onCheckedChange={(v) => quickToggle.mutate({ id: c.id, v: { isListed: v } })}
                        data-testid={`switch-listed-${c.symbol}`}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill status={c.status} />
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {c.listingAt ? (
                        <span className={cn("inline-flex items-center gap-1", isUpcoming && "text-amber-300 font-medium")}>
                          <Calendar className="w-3 h-3" />
                          {relTime(c.listingAt)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3 pr-4 text-right whitespace-nowrap">
                        <Button
                          size="sm" variant="ghost"
                          onClick={() => setEdit(c)}
                          data-testid={`button-edit-${c.symbol}`}
                        >
                          <Pencil className="w-3.5 h-3.5 mr-1" />Edit
                        </Button>
                        <Button
                          size="icon" variant="ghost"
                          onClick={() => setDeleteFor(c)}
                          data-testid={`button-delete-${c.symbol}`}
                        >
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
          label="coins"
        />
      </div>

      {/* Add coin (plain or pre-filled from Binance import) */}
      {isAdmin && (
        <CoinFormDialog
          open={open}
          onOpenChange={(o) => { if (!o) { setOpen(false); setPrefill(null); } else setOpen(true); }}
          title={prefill ? `Import ${prefill.symbol} from Binance` : "Add new coin"}
          description={prefill
            ? "Pre-filled from Binance. Review and adjust before saving."
            : "Set the symbol, pricing source, and listing details."}
          submitLabel="Add coin"
          submitting={create.isPending}
          initial={prefill as any}
          onSubmit={(v) => create.mutate(v)}
        />
      )}

      {/* Binance discovery */}
      {isAdmin && (
        <BinanceDiscoveryDialog
          open={discoveryOpen}
          onOpenChange={setDiscoveryOpen}
          existingSymbols={new Set(data.map((c) => c.symbol.toUpperCase()))}
          onImport={(coin) => {
            setDiscoveryOpen(false);
            setPrefill(coin);
            setOpen(true);
          }}
        />
      )}

      {/* Edit coin */}
      {isAdmin && edit && (
        <CoinFormDialog
          open={!!edit}
          onOpenChange={(o) => { if (!o) setEdit(null); }}
          title={`Edit ${edit.symbol}`}
          description="Update coin details. Changes will go live immediately."
          submitLabel="Save changes"
          submitting={update.isPending}
          initial={edit}
          onSubmit={(v) => update.mutate({ id: edit.id, v })}
        />
      )}

      {/* Delete confirm */}
      <Dialog open={!!deleteFor} onOpenChange={(o) => { if (!o) setDeleteFor(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
              Delete coin
            </DialogTitle>
            <DialogDescription>
              {deleteFor && (
                <>Are you sure you want to delete <strong className="text-foreground">{deleteFor.symbol} ({deleteFor.name})</strong>?
                This action is permanent and may affect all related networks, pairs, and wallets.</>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteFor(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => deleteFor && remove.mutate(deleteFor.id)}
              data-testid="button-confirm-delete"
            >
              {remove.isPending && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
              Delete coin
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ───── Binance discovery dialog ───────────────────────────────────────────
type DiscoveredCoin = {
  symbol: string; suggestedName: string; binanceSymbol: string;
  lastPrice: number; priceChangePercent: number; quoteVolume: number; logoUrl: string;
};

function BinanceDiscoveryDialog({
  open, onOpenChange, existingSymbols, onImport,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  existingSymbols: Set<string>;
  onImport: (coin: Partial<Coin>) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [coins, setCoins] = useState<DiscoveredCoin[]>([]);
  const [search, setSearch] = useState("");
  const [logoErrors, setLogoErrors] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    fetch("/api/admin/coins/binance-discover", { credentials: "include" })
      .then((r) => {
        if (!r.ok) return r.json().then((d) => { throw new Error(d?.error || "Failed"); });
        return r.json();
      })
      .then((data: DiscoveredCoin[]) => setCoins(data))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return coins;
    return coins.filter((c) =>
      c.symbol.toLowerCase().includes(q) ||
      c.binanceSymbol.toLowerCase().includes(q) ||
      c.suggestedName.toLowerCase().includes(q),
    );
  }, [coins, search]);

  function fmtVol(v: number): string {
    if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
    if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
    if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
    return `$${v.toFixed(0)}`;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="w-5 h-5 text-amber-400" />
            Import from Binance
          </DialogTitle>
          <DialogDescription>
            Coins trading on Binance (USDT pairs) not yet in your platform. Sorted by 24h volume.
            Click <strong>Pre-fill</strong> to open the add-coin form with the details already filled in.
          </DialogDescription>
        </DialogHeader>

        {/* Search */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input
            placeholder="Search symbol or name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
            autoFocus
          />
        </div>

        {/* Body */}
        <div className="max-h-[55vh] overflow-y-auto rounded-lg border border-border/50">
          {loading && (
            <div className="flex items-center justify-center py-16 gap-3 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
              Fetching from Binance…
            </div>
          )}
          {!loading && error && (
            <div className="flex items-center justify-center py-12 gap-2 text-destructive text-sm">
              <AlertTriangle className="w-4 h-4" />
              {error}
            </div>
          )}
          {!loading && !error && filtered.length === 0 && (
            <div className="text-center py-12 text-sm text-muted-foreground">
              {search ? "No coins match your search." : "All top Binance coins are already in your platform 🎉"}
            </div>
          )}
          {!loading && !error && filtered.length > 0 && (
            <table className="w-full text-sm">
              <thead className="bg-muted/30 sticky top-0 z-10">
                <tr className="text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="text-left font-medium px-4 py-2.5">Coin</th>
                  <th className="text-right font-medium px-4 py-2.5">Price</th>
                  <th className="text-right font-medium px-4 py-2.5">24h %</th>
                  <th className="text-right font-medium px-4 py-2.5">Volume</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {filtered.slice(0, 60).map((c) => {
                  const up = c.priceChangePercent >= 0;
                  const alreadyIn = existingSymbols.has(c.symbol);
                  return (
                    <tr key={c.symbol} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2.5">
                          {logoErrors.has(c.symbol) ? (
                            <div className={cn(
                              "w-7 h-7 rounded-full bg-gradient-to-br flex items-center justify-center text-white font-bold text-[10px] ring-1 ring-white/10",
                              coinGradient(c.symbol),
                            )}>
                              {c.symbol.slice(0, 3)}
                            </div>
                          ) : (
                            <img
                              src={c.logoUrl}
                              alt={c.symbol}
                              className="w-7 h-7 rounded-full bg-muted/20 ring-1 ring-border/40"
                              onError={() => setLogoErrors((s) => new Set([...s, c.symbol]))}
                            />
                          )}
                          <div>
                            <span className="font-semibold">{c.symbol}</span>
                            <div className="text-[11px] text-muted-foreground">{c.binanceSymbol}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-medium">
                        {c.lastPrice >= 1
                          ? `$${c.lastPrice.toLocaleString("en-US", { maximumFractionDigits: 2 })}`
                          : `$${c.lastPrice.toPrecision(4)}`}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span className={cn(
                          "inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-medium tabular-nums",
                          up ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400",
                        )}>
                          {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                          {c.priceChangePercent.toFixed(2)}%
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs text-muted-foreground tabular-nums">
                        {fmtVol(c.quoteVolume)}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Button
                          size="sm"
                          variant={alreadyIn ? "secondary" : "default"}
                          disabled={alreadyIn}
                          onClick={() => onImport({
                            symbol: c.symbol,
                            name: c.suggestedName,
                            binanceSymbol: c.binanceSymbol,
                            priceSource: "binance",
                            currentPrice: String(c.lastPrice),
                            change24h: String(c.priceChangePercent.toFixed(4)),
                            logoUrl: logoErrors.has(c.symbol) ? null : c.logoUrl,
                            type: "crypto",
                            decimals: 8,
                            status: "active",
                            isListed: true,
                          })}
                          data-testid={`button-import-${c.symbol}`}
                        >
                          {alreadyIn ? "Already added" : (
                            <><ExternalLink className="w-3.5 h-3.5 mr-1" />Pre-fill</>
                          )}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
          <span>{filtered.length} new coin{filtered.length !== 1 ? "s" : ""} found on Binance</span>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
void ExternalLink; void FileText; void Hash; void Layers;

// ───── Coin form dialog ────────────────────────────────────────────────────
function CoinFormDialog({
  open, onOpenChange, title, description, submitLabel, submitting, initial, onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: string;
  submitLabel: string;
  submitting: boolean;
  initial?: Coin;
  onSubmit: (v: Partial<Coin>) => void;
}) {
  const empty: Partial<Coin> = {
    type: "crypto", decimals: 8, status: "active", isListed: true,
    currentPrice: "0", change24h: "0", priceSource: "binance",
  };
  const [v, setV] = useState<Partial<Coin>>(initial ?? empty);
  useEffect(() => {
    if (open) setV(initial ?? empty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial?.id]);

  const set = <K extends keyof Coin>(k: K, val: Coin[K] | null | undefined) =>
    setV((p) => ({ ...p, [k]: val } as Partial<Coin>));

  const isManual = v.priceSource === "manual";
  const symValid = !!v.symbol && /^[A-Z0-9]{2,15}$/.test(v.symbol);
  const canSave = symValid && !!v.name && !submitting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            {(v.symbol || v.logoUrl) && (
              <CoinAvatar coin={{ symbol: (v.symbol || "??").toString(), logoUrl: v.logoUrl ?? null }} size={10} />
            )}
            <div>
              <DialogTitle>{title}</DialogTitle>
              {description && <DialogDescription>{description}</DialogDescription>}
            </div>
          </div>
        </DialogHeader>

        <div className="max-h-[65vh] overflow-y-auto pr-1 space-y-5">
          {/* Identity */}
          <FormSection icon={Tag} title="Identity">
            <Field label="Symbol *" hint="Uppercase, 2–15 chars (e.g. BTC, USDT)">
              <Input
                value={v.symbol ?? ""}
                onChange={(e) => set("symbol", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                placeholder="BTC"
                data-testid="input-coin-symbol"
              />
            </Field>
            <Field label="Name *">
              <Input
                value={v.name ?? ""}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Bitcoin"
                data-testid="input-coin-name"
              />
            </Field>
            <Field label="Type">
              <Select value={v.type ?? "crypto"} onValueChange={(t) => set("type", t)}>
                <SelectTrigger data-testid="select-coin-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="crypto">Crypto</SelectItem>
                  <SelectItem value="fiat">Fiat</SelectItem>
                  <SelectItem value="stable">Stablecoin</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Decimals">
              <Input
                type="number" min={0} max={18}
                value={v.decimals ?? 8}
                onChange={(e) => set("decimals", Number(e.target.value))}
                data-testid="input-coin-decimals"
              />
            </Field>
          </FormSection>

          {/* Pricing */}
          <FormSection icon={CircleDollarSign} title="Pricing">
            <Field label="Price source">
              <Select value={v.priceSource ?? "binance"} onValueChange={(t) => set("priceSource", t)}>
                <SelectTrigger data-testid="select-price-source"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="binance">Live (CoinGecko/Binance)</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Binance symbol (override)" hint="Empty = auto from symbol">
              <Input
                value={v.binanceSymbol ?? ""}
                placeholder="e.g. BTCUSDT"
                onChange={(e) => set("binanceSymbol", e.target.value.toUpperCase())}
                data-testid="input-binance-symbol"
              />
            </Field>
            <Field label="Manual price (USDT)" hint={isManual ? "Used as live price" : "Only when source = manual"}>
              <Input
                value={v.manualPrice ?? ""}
                onChange={(e) => set("manualPrice", e.target.value)}
                placeholder="0.00"
                disabled={!isManual}
                data-testid="input-manual-price"
              />
            </Field>
            <Field label="Current price (USDT)" hint="Auto-updated by feeds">
              <Input
                value={v.currentPrice ?? "0"}
                onChange={(e) => set("currentPrice", e.target.value)}
                data-testid="input-current-price"
              />
            </Field>
            <Field label="24h change %">
              <Input
                value={v.change24h ?? "0"}
                onChange={(e) => set("change24h", e.target.value)}
                placeholder="0.00"
                data-testid="input-change-24h"
              />
            </Field>
            <Field label="Market cap rank" hint="Optional, for sorting">
              <Input
                type="number"
                value={v.marketCapRank ?? ""}
                onChange={(e) => set("marketCapRank", e.target.value ? Number(e.target.value) : null)}
                placeholder="—"
                data-testid="input-market-rank"
              />
            </Field>
          </FormSection>

          {/* Listing & visibility */}
          <FormSection icon={ListChecks} title="Listing & Visibility">
            <Field label="Status">
              <Select value={v.status ?? "active"} onValueChange={(t) => set("status", t)}>
                <SelectTrigger data-testid="select-coin-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                  <SelectItem value="delisted">Delisted</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Listing time" hint="Future date = countdown shown to users">
              <Input
                type="datetime-local"
                value={v.listingAt ? new Date(v.listingAt).toISOString().slice(0, 16) : ""}
                onChange={(e) => set("listingAt", e.target.value || null)}
                data-testid="input-listing-at"
              />
            </Field>
            <Field label="Visible to users" full>
              <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5">
                <div className="flex items-center gap-2 text-sm">
                  {v.isListed ? <Eye className="w-4 h-4 text-emerald-400" /> : <EyeOff className="w-4 h-4 text-muted-foreground" />}
                  <span>{v.isListed ? "Listed publicly" : "Hidden from users"}</span>
                </div>
                <Switch
                  checked={v.isListed ?? true}
                  onCheckedChange={(c) => set("isListed", Boolean(c))}
                  data-testid="switch-coin-listed"
                />
              </div>
            </Field>
          </FormSection>

          {/* Media & description */}
          <FormSection icon={ImageIcon} title="Media & Description">
            <Field label="Logo URL" full hint="Square PNG/SVG recommended">
              <div className="flex items-center gap-3">
                <Input
                  value={v.logoUrl ?? ""}
                  onChange={(e) => set("logoUrl", e.target.value || null)}
                  placeholder="https://…"
                  data-testid="input-logo-url"
                />
                {v.logoUrl && (
                  <div className="shrink-0">
                    <CoinAvatar coin={{ symbol: v.symbol ?? "?", logoUrl: v.logoUrl }} size={9} />
                  </div>
                )}
              </div>
            </Field>
            <Field label="Info URL" full hint="Whitepaper / project site">
              <div className="relative">
                <Link2 className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
                <Input
                  className="pl-8"
                  value={v.infoUrl ?? ""}
                  onChange={(e) => set("infoUrl", e.target.value || null)}
                  placeholder="https://bitcoin.org"
                  data-testid="input-info-url"
                />
              </div>
            </Field>
            <Field label="Description" full>
              <Textarea
                rows={3}
                value={v.description ?? ""}
                onChange={(e) => set("description", e.target.value || null)}
                placeholder="Short description users will see…"
                data-testid="textarea-coin-description"
              />
            </Field>
          </FormSection>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => onSubmit(v)}
            disabled={!canSave}
            data-testid="button-save-coin"
          >
            {submitting && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FormSection({
  icon: Icon, title, children,
}: { icon: typeof Tag; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/10 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/60 bg-muted/20">
        <div className="stat-orb w-7 h-7 rounded-md flex items-center justify-center">
          <Icon className="w-3.5 h-3.5 text-amber-300" />
        </div>
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-4">
        {children}
      </div>
    </div>
  );
}

function Field({
  label, hint, children, full,
}: { label: string; hint?: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={cn("space-y-1.5", full && "md:col-span-2")}>
      <Label className="text-xs">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
