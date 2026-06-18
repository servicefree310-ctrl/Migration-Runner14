import { useState, useMemo, useEffect, useRef } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Coins, TrendingUp, Calendar, Lock, Unlock, Star, Zap, Loader2, AlertCircle,
  ArrowRight, Wallet as WalletIcon, Activity, ShieldCheck, Info, Filter,
  Layers, ChevronDown, Hourglass, RefreshCw, Clock, BarChart2, History,
  CheckCircle2, XCircle,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { get, post, ApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { SuccessModal, type GenericSuccess } from "@/components/SuccessModal";
import { PageHeader } from "@/components/premium/PageHeader";
import { PremiumStatCard } from "@/components/premium/PremiumStatCard";
import { SectionCard } from "@/components/premium/SectionCard";
import { EmptyState } from "@/components/premium/EmptyState";
import { StatusPill } from "@/components/premium/StatusPill";

type EarnProduct = {
  id: number; coinId: number; name: string; description: string | null;
  type: "simple" | "advanced"; durationDays: number; apy: string | number;
  minAmount: string | number; maxAmount: string | number; totalCap: string | number;
  currentSubscribed: string | number; payoutInterval: string; compounding: boolean;
  earlyRedemption: boolean; earlyRedemptionPenaltyPct: string | number;
  minVipTier: number; featured: boolean; coinSymbol: string; coinName: string;
  coinIcon: string | null;
};

type EarnPosition = {
  id: number; productId: number; amount: string | number; totalEarned: string | number;
  status: "active" | "matured" | "redeemed" | "early_redeemed" | "cancelled";
  startedAt: string; maturityAt: string | null; autoRenew: boolean;
  coinSymbol?: string; productName?: string; apy?: string | number;
  durationDays?: number; type?: string;
};

type EarnSummary = {
  totalLockedUsd: number; totalLockedInr: number;
  totalPendingYield: number; totalLifetimeEarned: number; activePositions: number;
  byCoins: { coinId: number; coinSymbol: string; locked: number; pendingYield: number; lockedUsd: number }[];
};

function fmtNum(n: number | string, dp = 4): string {
  const num = Number(n);
  if (!Number.isFinite(num)) return "—";
  if (num === 0) return "0";
  if (Math.abs(num) >= 1000) return num.toLocaleString("en-IN", { maximumFractionDigits: 2 });
  return num.toFixed(dp).replace(/\.?0+$/, "");
}
function fmtPct(n: number | string) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return `${v.toFixed(2)}%`;
}
function fmtDur(days: number): string {
  if (days === 0) return "Flexible";
  if (days < 30) return `${days}d`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${(days / 365).toFixed(1)}y`;
}
function msToHuman(ms: number): string {
  if (ms <= 0) return "Matured";
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  if (d > 1) return `${d}d ${h}h`;
  if (d === 1) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

// Live interest counter — updates every 5s using client-side APY calculation
function useLiveInterest(principal: number, apy: number, startedAt: string, active: boolean) {
  const [interest, setInterest] = useState(() => {
    if (!active || !startedAt) return 0;
    const elapsed = (Date.now() - new Date(startedAt).getTime()) / 86400_000;
    return principal * (apy / 100) * elapsed / 365;
  });
  useEffect(() => {
    if (!active || principal <= 0 || apy <= 0 || !startedAt) return;
    const interval = setInterval(() => {
      const elapsed = (Date.now() - new Date(startedAt).getTime()) / 86400_000;
      setInterest(principal * (apy / 100) * elapsed / 365);
    }, 5000);
    return () => clearInterval(interval);
  }, [principal, apy, startedAt, active]);
  return interest;
}

// Position-level live interest card
function PositionInterestCounter({ pos, product }: { pos: EarnPosition; product?: EarnProduct }) {
  const principal = Number(pos.amount);
  const apy = Number(pos.apy ?? product?.apy ?? 0);
  const live = useLiveInterest(principal, apy, pos.startedAt, pos.status === "active");
  return (
    <div className="text-right">
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Earned (live)</div>
      <div className="text-lg font-bold tabular-nums text-emerald-400">
        {fmtNum(live, 6)}
      </div>
      <div className="text-[10px] text-muted-foreground">{pos.coinSymbol ?? product?.coinSymbol}</div>
    </div>
  );
}

// Hero summary live pending yield counter
function PendingYieldCounter({ summary, products, positions }: {
  summary: EarnSummary | undefined;
  products: EarnProduct[];
  positions: EarnPosition[];
}) {
  const [live, setLive] = useState(summary?.totalPendingYield ?? 0);
  useEffect(() => {
    const activePositions = positions.filter(p => p.status === "active");
    const interval = setInterval(() => {
      let total = 0;
      for (const pos of activePositions) {
        const product = products.find(p => p.id === pos.productId);
        const principal = Number(pos.amount);
        const apy = Number(pos.apy ?? product?.apy ?? 0);
        if (principal > 0 && apy > 0 && pos.startedAt) {
          const elapsed = (Date.now() - new Date(pos.startedAt).getTime()) / 86400_000;
          total += principal * (apy / 100) * elapsed / 365;
        }
      }
      setLive(total);
    }, 5000);
    return () => clearInterval(interval);
  }, [positions, products]);

  return <span className="tabular-nums text-amber-400">{fmtNum(live, 6)}</span>;
}

export default function Earn() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const productsQ = useQuery<EarnProduct[]>({
    queryKey: ["/earn/products"],
    queryFn: () => get<EarnProduct[]>("/earn/products"),
  });
  const positionsQ = useQuery<EarnPosition[]>({
    queryKey: ["/earn/positions"],
    queryFn: () => get<EarnPosition[]>("/earn/positions"),
    retry: false,
  });
  const summaryQ = useQuery<EarnSummary>({
    queryKey: ["/earn/summary"],
    queryFn: () => get<EarnSummary>("/earn/summary"),
    retry: false,
    refetchInterval: 60_000,
  });

  const [coinFilter, setCoinFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("apy");
  const [subProduct, setSubProduct] = useState<EarnProduct | null>(null);
  const [earnSuccess, setEarnSuccess] = useState<GenericSuccess | null>(null);
  const [redeemFor, setRedeemFor] = useState<EarnPosition | null>(null);

  const products = productsQ.data ?? [];
  const positions = positionsQ.data ?? [];
  const summary = summaryQ.data;

  const coinOptions = useMemo(() => {
    const set = new Set(products.map((p) => p.coinSymbol));
    return ["all", ...Array.from(set).sort()];
  }, [products]);

  const filtered = useMemo(() => {
    let list = products;
    if (coinFilter !== "all") list = list.filter((p) => p.coinSymbol === coinFilter);
    if (typeFilter !== "all") list = list.filter((p) => p.type === typeFilter);
    list = [...list].sort((a, b) => {
      if (sortBy === "apy") return Number(b.apy) - Number(a.apy);
      if (sortBy === "duration") return a.durationDays - b.durationDays;
      if (sortBy === "min") return Number(a.minAmount) - Number(b.minAmount);
      return 0;
    });
    return [...list].sort((a, b) => Number(b.featured) - Number(a.featured));
  }, [products, coinFilter, typeFilter, sortBy]);

  const activePositions = positions.filter((p) => p.status === "active");
  const maturedPositions = positions.filter((p) => p.status === "matured");
  const closedPositions = positions.filter((p) => p.status === "redeemed" || p.status === "early_redeemed" || p.status === "cancelled");
  const totalLocked = activePositions.reduce((s, p) => s + Number(p.amount || 0), 0);
  const kycLevel = (user as any)?.kycLevel ?? 0;
  const canEarnSimple = kycLevel >= 1;
  const canEarnAdvanced = kycLevel >= 2;

  return (
    <div className="container mx-auto max-w-6xl p-4 sm:p-6 space-y-5">
      <PageHeader
        eyebrow="Passive Income"
        title="Zebvix Earn"
        description="Flexible and locked savings products — earn passive yield on your idle crypto."
        actions={
          <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-xs font-bold uppercase">
            <Star className="h-3 w-3 mr-1 fill-current" /> Up to 18.5% APY
          </Badge>
        }
      />

      {/* Stats strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <PremiumStatCard
          hero
          title="Total Locked"
          value={fmtNum(totalLocked, 2)}
          icon={Lock}
          hint={summary ? `≈ ${fmtNum(summary.totalLockedUsd, 2)} USDT` : "Loading…"}
          loading={summaryQ.isLoading}
        />
        <PremiumStatCard
          title="Pending Yield"
          value={user ? fmtNum(summary?.totalPendingYield ?? 0, 6) : "—"}
          icon={Activity}
          loading={summaryQ.isLoading}
          hint="Accrued continuously"
        />
        <PremiumStatCard
          title="Active Positions"
          value={activePositions.length}
          icon={Layers}
          hint={`${maturedPositions.length} matured`}
          loading={positionsQ.isLoading}
        />
        <PremiumStatCard
          title="Lifetime Earned"
          value={summary ? fmtNum(summary.totalLifetimeEarned, 4) : "—"}
          icon={TrendingUp}
          hint="All-time yield received"
          loading={summaryQ.isLoading}
        />
      </div>

      {/* Coin breakdown chips */}
      {summary && summary.byCoins.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {summary.byCoins.map((c) => (
            <div key={c.coinId} className="flex items-center gap-1.5 bg-muted/30 border border-border/40 rounded-full px-2.5 py-1 text-xs">
              <div className="w-4 h-4 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-[8px] font-bold text-black flex-shrink-0">
                {c.coinSymbol.charAt(0)}
              </div>
              <span className="font-medium">{c.coinSymbol}</span>
              <span className="text-muted-foreground">{fmtNum(c.locked, 4)} locked</span>
              <span className="text-emerald-400">+{fmtNum(c.pendingYield, 6)} yield</span>
            </div>
          ))}
        </div>
      )}

      {/* KYC notice */}
      {kycLevel < 1 && (
        <div className="flex items-center gap-3 p-3 rounded-xl border border-amber-500/30 bg-amber-500/5 text-sm">
          <ShieldCheck className="h-4 w-4 text-amber-400 shrink-0" />
          <div className="flex-1">
            <span className="font-medium text-amber-400">Complete KYC Level 1</span>
            <span className="text-muted-foreground"> to subscribe to Earn products.</span>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link href="/kyc">Verify now <ArrowRight className="h-3.5 w-3.5 ml-1" /></Link>
          </Button>
        </div>
      )}

      <Tabs defaultValue="products" className="space-y-4">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="products">
            <Layers className="h-4 w-4 mr-1.5" /> Products
          </TabsTrigger>
          <TabsTrigger value="positions">
            <Activity className="h-4 w-4 mr-1.5" /> Active
            {activePositions.length > 0 && (
              <Badge variant="outline" className="ml-2 text-[9px] h-4">{activePositions.length}</Badge>
            )}
          </TabsTrigger>
          {maturedPositions.length > 0 && (
            <TabsTrigger value="matured">
              <CheckCircle2 className="h-4 w-4 mr-1.5 text-emerald-400" /> Matured
              <Badge variant="outline" className="ml-2 text-[9px] h-4 border-emerald-500/40 text-emerald-400">{maturedPositions.length}</Badge>
            </TabsTrigger>
          )}
          <TabsTrigger value="history">
            <History className="h-4 w-4 mr-1.5" /> History
          </TabsTrigger>
        </TabsList>

        {/* ─── PRODUCTS TAB ─── */}
        <TabsContent value="products" className="space-y-4 mt-0">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5 text-sm">
              <Filter className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Filter</span>
            </div>
            <Select value={coinFilter} onValueChange={setCoinFilter}>
              <SelectTrigger className="w-[140px] h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                {coinOptions.map((c) => (
                  <SelectItem key={c} value={c}>{c === "all" ? "All coins" : c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[150px] h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="simple">Flexible</SelectItem>
                <SelectItem value="advanced">Locked</SelectItem>
              </SelectContent>
            </Select>
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Sort by</span>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-[140px] h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="apy">Highest APY</SelectItem>
                  <SelectItem value="duration">Shortest term</SelectItem>
                  <SelectItem value="min">Lowest min</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {productsQ.isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {[1,2,3].map(i => <Card key={i} className="h-64 animate-pulse bg-muted/30" />)}
            </div>
          ) : filtered.length === 0 ? (
            <Card className="p-12 text-center border-dashed">
              <Coins className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-40" />
              <p className="text-muted-foreground">No products match your filters.</p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filtered.map((p) => <ProductCard key={p.id} product={p} canEarn={p.type === "simple" ? canEarnSimple : canEarnAdvanced} onSubscribe={() => setSubProduct(p)} />)}
            </div>
          )}
        </TabsContent>

        {/* ─── ACTIVE POSITIONS ─── */}
        <TabsContent value="positions" className="space-y-3 mt-0">
          {positionsQ.isError ? (
            <Card className="p-4 border-rose-500/30 bg-rose-500/5">
              <div className="flex items-center gap-3 text-rose-400 text-sm">
                <AlertCircle className="h-4 w-4" />
                <span>Sign in to view your positions.</span>
                <Button asChild size="sm" variant="outline"><Link href="/login">Sign in</Link></Button>
              </div>
            </Card>
          ) : activePositions.length === 0 ? (
            <Card className="p-12 text-center border-dashed">
              <Activity className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-40" />
              <h3 className="text-lg font-semibold mb-1">No active positions</h3>
              <p className="text-sm text-muted-foreground mb-4">Subscribe to a product above to start earning passive yield.</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {activePositions.map((pos) => (
                <PositionCard key={pos.id} pos={pos} products={products} onRedeem={() => setRedeemFor(pos)} />
              ))}
            </div>
          )}
        </TabsContent>

        {/* ─── MATURED POSITIONS ─── */}
        <TabsContent value="matured" className="space-y-3 mt-0">
          {maturedPositions.length === 0 ? (
            <Card className="p-12 text-center border-dashed">
              <CheckCircle2 className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-40" />
              <p className="text-muted-foreground">No matured positions.</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {maturedPositions.map((pos) => (
                <PositionCard key={pos.id} pos={pos} products={products} onRedeem={() => setRedeemFor(pos)} />
              ))}
            </div>
          )}
        </TabsContent>

        {/* ─── HISTORY ─── */}
        <TabsContent value="history" className="space-y-3 mt-0">
          {closedPositions.length === 0 ? (
            <Card className="p-12 text-center border-dashed">
              <History className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-40" />
              <p className="text-muted-foreground">No redeemed positions yet.</p>
            </Card>
          ) : (
            <div className="space-y-2">
              {closedPositions.map((pos) => {
                const product = products.find((p) => p.id === pos.productId);
                const sym = pos.coinSymbol ?? product?.coinSymbol ?? "?";
                const isEarly = pos.status === "early_redeemed";
                return (
                  <Card key={pos.id} className="p-4 border-border/40 opacity-80">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center text-sm font-bold flex-shrink-0">
                        {sym.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{pos.productName ?? product?.name ?? `Product #${pos.productId}`}</span>
                          <StatusBadge status={pos.status} />
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {fmtNum(pos.amount, 4)} {sym} · {fmtPct(pos.apy ?? product?.apy ?? 0)} APY
                          {" · "} Started {new Date(pos.startedAt).toLocaleDateString("en-IN")}
                          {isEarly && <span className="text-amber-400 ml-1">· Early exit</span>}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-[10px] text-muted-foreground uppercase">Total earned</div>
                        <div className="font-bold tabular-nums text-emerald-400">{fmtNum(pos.totalEarned, 6)} {sym}</div>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <SubscribeDialog
        product={subProduct}
        onOpenChange={(v) => { if (!v) setSubProduct(null); }}
        onSuccess={(d) => {
          setEarnSuccess(d);
          qc.invalidateQueries({ queryKey: ["/earn/positions"] });
          qc.invalidateQueries({ queryKey: ["/earn/products"] });
          qc.invalidateQueries({ queryKey: ["/earn/summary"] });
          qc.invalidateQueries({ queryKey: ["/wallets"] });
          setSubProduct(null);
        }}
      />
      <RedeemDialog
        position={redeemFor}
        product={redeemFor ? products.find((p) => p.id === redeemFor.productId) ?? null : null}
        onOpenChange={(v) => { if (!v) setRedeemFor(null); }}
        onSuccess={(d) => {
          setEarnSuccess(d);
          qc.invalidateQueries({ queryKey: ["/earn/positions"] });
          qc.invalidateQueries({ queryKey: ["/earn/summary"] });
          qc.invalidateQueries({ queryKey: ["/wallets"] });
          setRedeemFor(null);
        }}
      />

      <SuccessModal
        open={earnSuccess !== null}
        onClose={() => setEarnSuccess(null)}
        payload={earnSuccess}
      />
    </div>
  );
}

// ─── Product Card ─────────────────────────────────────────────────────────────
function ProductCard({ product: p, canEarn, onSubscribe }: {
  product: EarnProduct; canEarn: boolean; onSubscribe: () => void;
}) {
  const apy = Number(p.apy);
  const isSimple = p.type === "simple";
  const subscribed = Number(p.currentSubscribed);
  const cap = Number(p.totalCap);
  const capPct = cap > 0 ? Math.min(100, (subscribed / cap) * 100) : 0;
  const capFull = cap > 0 && subscribed >= cap;
  const perDayRate = apy / 365 / 100;

  return (
    <Card className={`p-4 relative overflow-hidden border flex flex-col ${p.featured ? "border-amber-500/40 bg-gradient-to-br from-amber-500/5 to-card" : "border-border/60"}`}>
      {p.featured && (
        <Badge className="absolute top-3 right-3 bg-amber-500/20 text-amber-400 border-transparent text-[9px] font-bold uppercase">
          <Star className="h-2.5 w-2.5 mr-0.5 fill-current" /> Featured
        </Badge>
      )}
      <div className="flex items-center gap-3 mb-2">
        {p.coinIcon ? (
          <img src={p.coinIcon} alt={p.coinSymbol} className="h-10 w-10 rounded-full object-contain bg-black/20" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
        ) : (
          <div className="h-10 w-10 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-black font-bold text-sm flex-shrink-0">
            {p.coinSymbol.charAt(0)}
          </div>
        )}
        <div>
          <div className="font-semibold text-sm">{p.coinSymbol}</div>
          <div className="text-[10px] text-muted-foreground">{p.coinName}</div>
        </div>
      </div>
      <h3 className="font-bold text-base leading-tight mb-1 pr-16">{p.name || `${p.coinSymbol} ${isSimple ? "Flexible" : `${p.durationDays}d Locked`}`}</h3>
      {p.description && <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{p.description}</p>}

      {/* APY */}
      <div className="my-3">
        <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Estimated APY</div>
        <div className="text-xl sm:text-2xl lg:text-3xl font-extrabold tabular-nums bg-gradient-to-r from-amber-400 to-emerald-400 bg-clip-text text-transparent">
          {fmtPct(apy)}
        </div>
        <div className="text-[10px] text-muted-foreground mt-0.5">
          ≈ {(perDayRate * 100).toFixed(4)}%/day · {(perDayRate * 30 * 100).toFixed(3)}%/mo
        </div>
      </div>

      <Separator className="my-2" />

      <div className="grid grid-cols-2 gap-2 text-xs my-2">
        <div>
          <div className="text-[10px] text-muted-foreground uppercase">Type</div>
          <div className="font-medium flex items-center gap-1">
            {isSimple ? <><Unlock className="h-3 w-3" /> Flexible</> : <><Lock className="h-3 w-3" /> Locked</>}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground uppercase">Duration</div>
          <div className="font-medium flex items-center gap-1">
            <Calendar className="h-3 w-3" /> {fmtDur(p.durationDays)}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground uppercase">Min</div>
          <div className="font-medium tabular-nums">{fmtNum(p.minAmount)} {p.coinSymbol}</div>
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground uppercase">Payout</div>
          <div className="font-medium capitalize">{p.payoutInterval}</div>
        </div>
      </div>

      {/* Flags */}
      <div className="flex flex-wrap gap-1 mb-2">
        {p.compounding && <Badge variant="outline" className="text-[9px] h-4 border-sky-500/40 text-sky-400">Auto-renew</Badge>}
        {p.earlyRedemption && <Badge variant="outline" className="text-[9px] h-4">Early exit</Badge>}
        {p.minVipTier > 0 && <Badge variant="outline" className="text-[9px] h-4 border-purple-500/40 text-purple-400">VIP {p.minVipTier}+</Badge>}
      </div>

      {cap > 0 && (
        <div className="my-2">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
            <span>Pool filled</span>
            <span className="tabular-nums">{capPct.toFixed(1)}%</span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all" style={{ width: `${capPct}%` }} />
          </div>
        </div>
      )}

      <div className="mt-auto pt-3">
        <Button
          onClick={onSubscribe}
          disabled={capFull || !canEarn}
          className="w-full bg-gradient-to-r from-amber-500 to-orange-500 text-black hover:from-amber-400 hover:to-orange-400 font-semibold disabled:opacity-50 disabled:from-zinc-600 disabled:to-zinc-700"
        >
          {capFull ? "Pool Full" : !canEarn ? `KYC L${isSimple ? 1 : 2} required` : <>Subscribe <ArrowRight className="h-4 w-4 ml-1.5" /></>}
        </Button>
      </div>
    </Card>
  );
}

// ─── Position Card (active + matured) ────────────────────────────────────────
function PositionCard({ pos, products, onRedeem }: {
  pos: EarnPosition; products: EarnProduct[]; onRedeem: () => void;
}) {
  const product = products.find((p) => p.id === pos.productId);
  const sym = pos.coinSymbol ?? product?.coinSymbol ?? "?";
  const apy = Number(pos.apy ?? product?.apy ?? 0);
  const principal = Number(pos.amount);
  const isActive = pos.status === "active";
  const isLocked = (pos.durationDays ?? product?.durationDays ?? 0) > 0;
  const maturityTs = pos.maturityAt ? new Date(pos.maturityAt).getTime() : null;
  const matured = maturityTs ? Date.now() >= maturityTs : !isLocked;
  const remainingMs = maturityTs ? Math.max(0, maturityTs - Date.now()) : 0;
  const durationMs = isLocked ? ((pos.durationDays ?? product?.durationDays ?? 0) * 86400_000) : 0;
  const elapsedMs = Date.now() - new Date(pos.startedAt).getTime();
  const progressPct = durationMs > 0 ? Math.min(100, (elapsedMs / durationMs) * 100) : 100;
  const [countdown, setCountdown] = useState(() => msToHuman(remainingMs));
  useEffect(() => {
    if (!isActive || matured || !maturityTs) return;
    const interval = setInterval(() => {
      setCountdown(msToHuman(Math.max(0, maturityTs - Date.now())));
    }, 1000);
    return () => clearInterval(interval);
  }, [isActive, matured, maturityTs]);

  return (
    <Card className={`p-4 border-border/60 ${pos.status === "matured" ? "border-emerald-500/30 bg-emerald-500/5" : ""}`}>
      <div className="flex flex-col sm:flex-row sm:items-start gap-4">
        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-black font-bold text-sm flex-shrink-0">
          {sym.charAt(0)}
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold">{pos.productName ?? product?.name ?? `Product #${pos.productId}`}</span>
            <StatusBadge status={pos.status} matured={!!matured} />
            {pos.autoRenew && <Badge variant="outline" className="text-[9px]"><Zap className="h-2.5 w-2.5 mr-0.5" /> Auto-renew</Badge>}
          </div>
          <div className="text-xs text-muted-foreground">
            {fmtNum(principal, 4)} {sym} · {fmtPct(apy)} APY · Started {new Date(pos.startedAt).toLocaleDateString("en-IN")}
          </div>
          {/* Progress bar for locked */}
          {isLocked && (
            <div className="space-y-1">
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all rounded-full ${matured ? "bg-emerald-500" : "bg-gradient-to-r from-amber-500 to-orange-500"}`}
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>{progressPct.toFixed(1)}% elapsed</span>
                {!matured && isActive ? (
                  <span className="text-amber-400 flex items-center gap-0.5"><Clock className="h-2.5 w-2.5" /> {countdown}</span>
                ) : (
                  <span className="text-emerald-400">Matured {pos.maturityAt ? new Date(pos.maturityAt).toLocaleDateString("en-IN") : ""}</span>
                )}
              </div>
            </div>
          )}
        </div>
        {/* Live interest counter */}
        {isActive ? (
          <PositionInterestCounter pos={pos} product={product} />
        ) : (
          <div className="text-right flex-shrink-0">
            <div className="text-[10px] text-muted-foreground uppercase">Earned</div>
            <div className="text-lg font-bold tabular-nums text-emerald-400">{fmtNum(pos.totalEarned, 6)}</div>
            <div className="text-[10px] text-muted-foreground">{sym}</div>
          </div>
        )}
        {(isActive || pos.status === "matured") && (
          <Button variant="outline" size="sm" onClick={onRedeem} className="flex-shrink-0">
            {pos.status === "matured" || (!isLocked) ? "Redeem" : "Early redeem"}
          </Button>
        )}
      </div>
    </Card>
  );
}

function StatusBadge({ status, matured }: { status: string; matured?: boolean }) {
  if (status === "active" && matured) return <Badge className="bg-emerald-500/15 text-emerald-400 border-transparent text-[9px]">MATURED</Badge>;
  if (status === "active") return <Badge className="bg-sky-500/15 text-sky-400 border-transparent text-[9px]">ACTIVE</Badge>;
  if (status === "matured") return <Badge className="bg-emerald-500/15 text-emerald-400 border-transparent text-[9px]">MATURED</Badge>;
  if (status === "redeemed") return <Badge className="bg-zinc-500/15 text-muted-foreground border-transparent text-[9px]">REDEEMED</Badge>;
  if (status === "early_redeemed") return <Badge className="bg-amber-500/15 text-amber-400 border-transparent text-[9px]">EARLY EXIT</Badge>;
  if (status === "cancelled") return <Badge className="bg-rose-500/15 text-rose-400 border-transparent text-[9px]">CANCELLED</Badge>;
  return <Badge variant="outline" className="text-[9px]">{status.toUpperCase()}</Badge>;
}

// ─── Subscribe Dialog ─────────────────────────────────────────────────────────
function SubscribeDialog({
  product, onOpenChange, onSuccess,
}: { product: EarnProduct | null; onOpenChange: (v: boolean) => void; onSuccess: (d: GenericSuccess) => void }) {
  const [amount, setAmount] = useState("");
  const [autoRenew, setAutoRenew] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const walletQ = useQuery<Array<{ coinId: number; balance: string; walletType: string }>>({
    queryKey: ["/wallets"],
    queryFn: () => get("/wallets"),
    enabled: product !== null,
  });
  const balance = useMemo(() => {
    if (!product || !walletQ.data) return 0;
    const spot = walletQ.data.find((w) => w.coinId === product.coinId && w.walletType === "spot");
    return Number(spot?.balance ?? 0);
  }, [walletQ.data, product]);

  const reset = () => { setAmount(""); setAutoRenew(false); setSubmitting(false); };
  const num = Number(amount);
  const min = Number(product?.minAmount ?? 0);
  const max = Number(product?.maxAmount ?? 0);
  const apy = Number(product?.apy ?? 0);
  const days = product?.durationDays ?? 0;
  const isLocked = days > 0;

  // Projected earnings
  const projectedEarn = days > 0 ? (num * apy / 100) * (days / 365) : (num * apy / 100);
  const projectedDaily = num * apy / 100 / 365;
  const projectedMonthly = projectedDaily * 30;

  const validation =
    !product ? null
    : !amount || num <= 0 ? "Enter an amount"
    : num < min ? `Minimum ${fmtNum(min)} ${product.coinSymbol}`
    : max > 0 && num > max ? `Maximum ${fmtNum(max)} ${product.coinSymbol}`
    : num > balance ? `Insufficient balance (${fmtNum(balance, 4)} ${product.coinSymbol} available)`
    : null;

  const submit = async () => {
    if (validation || !product) return;
    setSubmitting(true);
    try {
      await post("/earn/subscribe", { productId: product.id, amount: num, autoRenew });
      reset();
      onSuccess({
        kind: "generic",
        accentColor: "#F59E0B",
        iconKind: "earn",
        title: "Subscribed!",
        subtitle: `${product.name} · ${fmtPct(apy)} APY`,
        rows: [
          { label: "Amount",        value: `${fmtNum(num, 4)} ${product.coinSymbol}`, accent: "text-emerald-400" },
          { label: "APY",           value: fmtPct(apy), accent: "text-amber-300" },
          { label: "Daily Earning", value: `+${fmtNum(projectedDaily, 6)} ${product.coinSymbol}`, accent: "text-emerald-400" },
          { label: "Duration",      value: isLocked ? `${days} days` : "Flexible ∞" },
        ],
        primaryLabel: "View Earn",
      });
    } catch (e: any) {
      const msg = e instanceof ApiError ? (e.data?.error || e.message) : e?.message;
      toast.error(msg || "Subscribe failed");
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={!!product} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Coins className="h-5 w-5 text-amber-400" /> Subscribe to {product?.name}
          </DialogTitle>
          <DialogDescription>
            {isLocked ? `Locked for ${days} days at ${fmtPct(apy)} APY.` : `Flexible savings at ${fmtPct(apy)} APY — withdraw any time.`}
          </DialogDescription>
        </DialogHeader>

        {product && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Available</span>
              <button
                type="button"
                onClick={() => setAmount(String(Math.min(balance, max > 0 ? max : balance)))}
                className="font-mono font-medium hover:text-amber-400"
              >
                {fmtNum(balance, 4)} {product.coinSymbol}
              </button>
            </div>
            <div>
              <Label htmlFor="amt">Amount</Label>
              <div className="relative">
                <Input
                  id="amt"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                  placeholder={`Min ${fmtNum(min)}`}
                  inputMode="decimal"
                  className="pr-16 font-mono"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{product.coinSymbol}</span>
              </div>
            </div>

            {/* Projected earnings */}
            {num > 0 && (
              <div className="rounded-lg bg-gradient-to-br from-emerald-500/5 to-muted/30 border border-emerald-500/20 p-3 space-y-1.5 text-xs">
                <div className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wider flex items-center gap-1">
                  <BarChart2 className="h-3 w-3" /> Projected earnings
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Daily</span>
                  <span className="font-mono text-emerald-400">+{fmtNum(projectedDaily, 6)} {product.coinSymbol}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Monthly</span>
                  <span className="font-mono text-emerald-400">+{fmtNum(projectedMonthly, 4)} {product.coinSymbol}</span>
                </div>
                <div className="flex items-center justify-between border-t border-border/30 pt-1.5">
                  <span className="text-muted-foreground font-medium">{isLocked ? `At maturity (${days}d)` : "Yearly"}</span>
                  <span className="font-bold font-mono text-emerald-400">+{fmtNum(projectedEarn, 4)} {product.coinSymbol}</span>
                </div>
              </div>
            )}

            <div className="rounded-lg bg-muted/30 p-3 space-y-1.5 text-xs">
              <Row label="APY" value={fmtPct(apy)} highlight />
              <Row label="Payout" value={product.payoutInterval} />
              <Row label="Auto-renew" value={product.compounding ? "Yes" : "No"} />
              {isLocked && (
                <Row label="Early exit" value={product.earlyRedemption ? `Allowed (${fmtPct(product.earlyRedemptionPenaltyPct)} penalty)` : "Not allowed"} />
              )}
            </div>

            {isLocked && (
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/40">
                <div className="text-sm">
                  <div className="font-medium">Auto-renew on maturity</div>
                  <p className="text-xs text-muted-foreground">Re-subscribe automatically at maturity date.</p>
                </div>
                <Switch checked={autoRenew} onCheckedChange={setAutoRenew} />
              </div>
            )}

            {validation && (
              <p className="text-xs text-rose-400 flex items-center gap-1.5">
                <AlertCircle className="h-3.5 w-3.5" /> {validation}
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={submit}
            disabled={!!validation || submitting}
            className="bg-gradient-to-r from-amber-500 to-orange-500 text-black hover:from-amber-400 hover:to-orange-400 font-semibold"
          >
            {submitting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Coins className="h-4 w-4 mr-1.5" />}
            Confirm Subscribe
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={highlight ? "font-bold text-emerald-400 tabular-nums" : "tabular-nums"}>{value}</span>
    </div>
  );
}

// ─── Redeem Dialog ────────────────────────────────────────────────────────────
function RedeemDialog({
  position, product, onOpenChange, onSuccess,
}: { position: EarnPosition | null; product: EarnProduct | null; onOpenChange: (v: boolean) => void; onSuccess: (d: GenericSuccess) => void }) {
  const [submitting, setSubmitting] = useState(false);
  const isLocked = (product?.durationDays ?? 0) > 0;
  const matured = position?.maturityAt ? new Date(position.maturityAt) <= new Date() : !isLocked;
  const isEarly = !matured && isLocked;
  const penalty = Number(product?.earlyRedemptionPenaltyPct ?? 0);
  const amount = Number(position?.amount ?? 0);
  const earned = Number(position?.totalEarned ?? 0);
  const penaltyAmt = isEarly ? amount * penalty / 100 : 0;
  const expectedReturn = amount + earned - penaltyAmt;

  const submit = async () => {
    if (!position) return;
    setSubmitting(true);
    try {
      await post(`/earn/positions/${position.id}/redeem`, {});
      const sym = position.coinSymbol ?? product?.coinSymbol ?? "";
      onSuccess({
        kind: "generic",
        accentColor: "#10B981",
        iconKind: "redeem",
        title: "Redeemed!",
        subtitle: `${sym} returned to Spot Wallet`,
        rows: [
          { label: "Principal",    value: `${fmtNum(amount, 4)} ${sym}` },
          { label: "Earned",       value: `+${fmtNum(earned, 6)} ${sym}`, accent: "text-emerald-400" },
          ...(isEarly ? [{ label: "Early Penalty", value: `-${fmtNum(penaltyAmt, 6)} ${sym}`, accent: "text-rose-400" }] : []),
          { label: "You Receive",  value: `${fmtNum(expectedReturn, 6)} ${sym}`, accent: "text-amber-300" },
        ],
        primaryLabel: "Done",
      });
    } catch (e: any) {
      const msg = e instanceof ApiError ? (e.data?.error || e.message) : e?.message;
      toast.error(msg || "Redeem failed");
      setSubmitting(false);
    }
  };

  return (
    <AlertDialog open={!!position} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            {isEarly ? <Hourglass className="h-5 w-5 text-amber-400" /> : <Unlock className="h-5 w-5 text-emerald-400" />}
            {isEarly ? "Redeem early?" : "Redeem position"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isEarly && product?.earlyRedemption === false ? (
              <span className="text-rose-400">Early redemption not allowed for this product.</span>
            ) : (
              isEarly && (
                <span className="block text-amber-400">
                  Redeeming before maturity incurs a {fmtPct(penalty)} penalty on your principal.
                </span>
              )
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {position && product && (isEarly ? product.earlyRedemption : true) && (
          <div className="rounded-lg bg-muted/40 p-3 space-y-1.5 text-sm">
            <Row label="Principal" value={`${fmtNum(amount, 6)} ${product.coinSymbol}`} />
            <Row label="Earned" value={`${fmtNum(earned, 6)} ${product.coinSymbol}`} />
            {isEarly && penalty > 0 && (
              <Row label={`Penalty (${fmtPct(penalty)})`} value={`-${fmtNum(penaltyAmt, 6)} ${product.coinSymbol}`} />
            )}
            <Separator className="my-1" />
            <Row label="You receive" value={`${fmtNum(expectedReturn, 6)} ${product.coinSymbol}`} highlight />
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setSubmitting(false)}>Cancel</AlertDialogCancel>
          {(isEarly ? product?.earlyRedemption : true) && (
            <AlertDialogAction onClick={submit} disabled={submitting} className="bg-gradient-to-r from-amber-500 to-orange-500 text-black hover:from-amber-400 hover:to-orange-400">
              {submitting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
              Confirm Redeem
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
