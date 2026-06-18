import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { get } from "@/lib/api";
import {
  Receipt, TrendingUp, ArrowDownToLine, ArrowUpFromLine, Star, Coins,
  IndianRupee, Sparkles, Info, ArrowRight, Award, Percent, BadgeCheck,
  Zap, Shield, CheckCircle2, Clock, RefreshCw, AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────
type VipTier = {
  level: number; name: string; minVolume: number;
  spotMaker: number; spotTaker: number;
  futuresMaker: number; futuresTaker: number;
  convertFee: number; withdrawDiscount: number;
};

type NetworkFee = {
  asset: string; symbol: string; network: string; chain: string;
  depositEnabled: boolean; withdrawEnabled: boolean;
  depositFee: string; withdrawFee: string; minWithdraw: string;
};

// ── Hardcoded fallbacks (used when API is unreachable) ─────────────────────
const FALLBACK_TIERS: VipTier[] = [
  { level: 0, name: "Regular", minVolume: 0,        spotMaker: 0.20, spotTaker: 0.25, futuresMaker: 0.050, futuresTaker: 0.070, convertFee: 0.300, withdrawDiscount: 0 },
  { level: 1, name: "VIP 1",   minVolume: 100000,   spotMaker: 0.16, spotTaker: 0.20, futuresMaker: 0.040, futuresTaker: 0.060, convertFee: 0.250, withdrawDiscount: 5 },
  { level: 2, name: "VIP 2",   minVolume: 500000,   spotMaker: 0.12, spotTaker: 0.15, futuresMaker: 0.030, futuresTaker: 0.050, convertFee: 0.200, withdrawDiscount: 10 },
  { level: 3, name: "VIP 3",   minVolume: 2500000,  spotMaker: 0.08, spotTaker: 0.10, futuresMaker: 0.020, futuresTaker: 0.040, convertFee: 0.150, withdrawDiscount: 15 },
  { level: 4, name: "VIP 4",   minVolume: 10000000, spotMaker: 0.06, spotTaker: 0.08, futuresMaker: 0.015, futuresTaker: 0.030, convertFee: 0.100, withdrawDiscount: 20 },
  { level: 5, name: "VIP 5",   minVolume: 50000000, spotMaker: 0.04, spotTaker: 0.06, futuresMaker: 0.010, futuresTaker: 0.025, convertFee: 0.075, withdrawDiscount: 25 },
];

const FALLBACK_NETWORKS: NetworkFee[] = [
  { asset: "Indian Rupee", symbol: "INR", network: "UPI",       chain: "UPI",       depositEnabled: true, withdrawEnabled: true, depositFee: "Free (≤ ₹5,000) / 0.50% above", withdrawFee: "₹15 flat",   minWithdraw: "₹100" },
  { asset: "Indian Rupee", symbol: "INR", network: "IMPS",      chain: "IMPS",      depositEnabled: true, withdrawEnabled: true, depositFee: "Free", withdrawFee: "₹10 flat",   minWithdraw: "₹100" },
  { asset: "Indian Rupee", symbol: "INR", network: "NEFT",      chain: "NEFT",      depositEnabled: true, withdrawEnabled: true, depositFee: "Free", withdrawFee: "Free",        minWithdraw: "₹500" },
  { asset: "Tether",       symbol: "USDT",network: "TRC-20",    chain: "TRC-20",    depositEnabled: true, withdrawEnabled: true, depositFee: "Free", withdrawFee: "1 USDT",      minWithdraw: "10 USDT" },
  { asset: "Tether",       symbol: "USDT",network: "ERC-20",    chain: "ERC-20",    depositEnabled: true, withdrawEnabled: true, depositFee: "Free", withdrawFee: "5 USDT",      minWithdraw: "20 USDT" },
  { asset: "Tether",       symbol: "USDT",network: "BEP-20",    chain: "BEP-20",    depositEnabled: true, withdrawEnabled: true, depositFee: "Free", withdrawFee: "0.30 USDT",   minWithdraw: "10 USDT" },
  { asset: "Tether",       symbol: "USDT",network: "Zebvix L1", chain: "Zebvix L1", depositEnabled: true, withdrawEnabled: true, depositFee: "Free", withdrawFee: "0.10 USDT",   minWithdraw: "1 USDT" },
  { asset: "Bitcoin",      symbol: "BTC", network: "Bitcoin",   chain: "Bitcoin",   depositEnabled: true, withdrawEnabled: true, depositFee: "Free", withdrawFee: "0.0002 BTC",  minWithdraw: "0.001 BTC" },
  { asset: "Ethereum",     symbol: "ETH", network: "ERC-20",    chain: "ERC-20",    depositEnabled: true, withdrawEnabled: true, depositFee: "Free", withdrawFee: "0.003 ETH",   minWithdraw: "0.01 ETH" },
  { asset: "Ethereum",     symbol: "ETH", network: "Zebvix L1", chain: "Zebvix L1", depositEnabled: true, withdrawEnabled: true, depositFee: "Free", withdrawFee: "0.0005 ETH",  minWithdraw: "0.005 ETH" },
  { asset: "BNB",          symbol: "BNB", network: "BEP-20",    chain: "BEP-20",    depositEnabled: true, withdrawEnabled: true, depositFee: "Free", withdrawFee: "0.0008 BNB",  minWithdraw: "0.01 BNB" },
  { asset: "Solana",       symbol: "SOL", network: "Solana",    chain: "Solana",    depositEnabled: true, withdrawEnabled: true, depositFee: "Free", withdrawFee: "0.01 SOL",    minWithdraw: "0.05 SOL" },
  { asset: "Zebvix",       symbol: "ZBX", network: "Zebvix L1", chain: "Zebvix L1", depositEnabled: true, withdrawEnabled: true, depositFee: "Free", withdrawFee: "0.50 ZBX",    minWithdraw: "5 ZBX" },
];

const DISCOUNTS = [
  { icon: Coins,      color: "text-amber-400 bg-amber-400/10",    title: "Pay fees in ZBX (Coming Soon)", body: "ZBX fee discounts are coming in a future update. Hold ZBX now to qualify when the feature launches." },
  { icon: Sparkles,   color: "text-violet-400 bg-violet-400/10",  title: "First-week welcome",            body: "0% spot maker/taker fees on your first ₹50,000 of trading volume in your first 7 days." },
  { icon: Award,      color: "text-blue-400 bg-blue-400/10",      title: "VIP tier upgrades",             body: "Tiers recalculated daily at 00:00 IST based on rolling 30-day volume. Higher VIP tiers get 5%–25% withdrawal fee discounts." },
  { icon: BadgeCheck, color: "text-emerald-400 bg-emerald-400/10",title: "Referral kick-back",            body: "Earn up to 30% of fees paid by users you refer across 5 levels, instantly credited as USDT to your spot wallet." },
];

const HIGHLIGHTS = [
  { icon: CheckCircle2, label: "Free INR NEFT deposits & withdrawals" },
  { icon: CheckCircle2, label: "All crypto deposits free" },
  { icon: CheckCircle2, label: "First-week 0% fee promo" },
  { icon: CheckCircle2, label: "Up to 25% withdrawal discount (VIP 5)" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtPct(n: number) { return `${n.toFixed(n >= 0.1 ? 2 : 3)}%`; }
function fmtVol(n: number) {
  if (n === 0) return "< $100K";
  if (n >= 1_000_000) return `≥ $${(n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0)}M`;
  return `≥ $${(n / 1_000).toFixed(0)}K`;
}

function TierSkeleton() {
  return (
    <div className="space-y-2 p-4">
      {[...Array(6)].map((_, i) => (
        <Skeleton key={i} className="h-10 w-full rounded-lg" />
      ))}
    </div>
  );
}

function NetworkSkeleton() {
  return (
    <div className="space-y-2 p-4">
      {[...Array(10)].map((_, i) => (
        <Skeleton key={i} className="h-9 w-full rounded-lg" />
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Fees() {
  const { data: tiers, isLoading: tiersLoading, isError: tiersError } = useQuery<VipTier[]>({
    queryKey: ["public", "fees", "tiers"],
    queryFn: () => get<VipTier[]>("/fees/tiers"),
    staleTime: 5 * 60_000,
    retry: 2,
  });

  const { data: networks, isLoading: networksLoading, isError: networksError } = useQuery<NetworkFee[]>({
    queryKey: ["public", "fees", "networks"],
    queryFn: () => get<NetworkFee[]>("/fees/networks"),
    staleTime: 5 * 60_000,
    retry: 2,
  });

  const displayTiers  = tiers  ?? FALLBACK_TIERS;
  const displayNets   = networks ?? FALLBACK_NETWORKS;
  const usingFallback = !tiers || !networks;

  // Best rates from the last tier
  const bestTier = [...displayTiers].sort((a, b) => b.level - a.level)[0];

  return (
    <div className="container mx-auto px-4 py-10 max-w-7xl" data-testid="page-fees">

      {/* ── Live-data banner ─────────────────────────────────────── */}
      {!usingFallback && (
        <div className="flex items-center gap-2 text-xs text-emerald-400 mb-4">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          Live fee data — updates within 30 seconds of any admin change
        </div>
      )}

      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-border bg-gradient-to-br from-amber-500/10 via-card to-card p-8 md:p-12 mb-10 relative overflow-hidden">
        <div className="absolute -top-16 -right-16 h-64 w-64 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />
        <div className="relative grid md:grid-cols-2 gap-8 items-center">
          <div>
            <Badge variant="outline" className="mb-3 bg-background/50">
              <Receipt className="h-3 w-3 mr-1.5 text-primary" /> Fee Schedule
            </Badge>
            <h1 className="text-2xl md:text-4xl font-extrabold tracking-tight mb-4 leading-tight">
              Transparent fees.{" "}
              <span className="bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent">
                No surprises.
              </span>
            </h1>
            <div className="text-base text-muted-foreground leading-relaxed mb-5">
              Every trading fee, deposit fee, withdrawal fee, and discount — published in one place.
              {" "}
              {tiersLoading ? (
                <span className="inline-block h-3 w-24 bg-muted animate-pulse rounded align-middle" />
              ) : (
                <span>
                  Best spot maker rate:{" "}
                  <strong className="text-foreground">{fmtPct(bestTier?.spotMaker ?? 0.04)}</strong>
                  {" "}(VIP {bestTier?.level ?? 5}).
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {tiersLoading ? (
                <><Skeleton className="h-6 w-40 rounded-full" /><Skeleton className="h-6 w-32 rounded-full" /></>
              ) : (
                <>
                  <Badge variant="secondary" className="gap-1">
                    <Percent className="h-3 w-3" /> Spot from {fmtPct(bestTier?.spotMaker ?? 0.04)} maker (VIP {bestTier?.level ?? 5})
                  </Badge>
                  <Badge variant="secondary" className="gap-1">
                    <IndianRupee className="h-3 w-3" /> Free NEFT deposits & withdrawals
                  </Badge>
                  <Badge variant="secondary" className="gap-1">
                    <Award className="h-3 w-3" /> Up to {bestTier?.withdrawDiscount ?? 25}% withdraw discount
                  </Badge>
                </>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {HIGHLIGHTS.map((h) => (
              <div key={h.label} className="rounded-xl border border-border bg-background/40 p-4 flex items-start gap-2.5">
                <h.icon className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                <span className="text-xs font-medium leading-relaxed">{h.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Tabs defaultValue="spot" className="w-full">
        <div className="overflow-x-auto -mx-1 px-1 mb-8">
          <TabsList className="grid grid-cols-4 w-full max-w-2xl min-w-[22rem]">
            <TabsTrigger value="spot" data-testid="tab-fees-spot"><TrendingUp className="h-4 w-4 mr-1.5" />Spot</TabsTrigger>
            <TabsTrigger value="futures" data-testid="tab-fees-futures"><Zap className="h-4 w-4 mr-1.5" />Futures</TabsTrigger>
            <TabsTrigger value="funding" data-testid="tab-fees-funding"><ArrowDownToLine className="h-4 w-4 mr-1.5" />Funding</TabsTrigger>
            <TabsTrigger value="discounts" data-testid="tab-fees-discounts"><Star className="h-4 w-4 mr-1.5" />Discounts</TabsTrigger>
          </TabsList>
        </div>

        {/* ── Spot ──────────────────────────────────────────────── */}
        <TabsContent value="spot" className="space-y-6">
          <Card>
            <CardContent className="p-0">
              <div className="p-5 border-b border-border flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold">Spot trading — maker / taker</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Tier based on rolling 30-day USD-equivalent volume, recalculated daily at 00:00 IST.
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {tiersError ? (
                    <Badge variant="destructive" className="gap-1 text-[10px]"><AlertCircle className="h-3 w-3" /> Showing defaults</Badge>
                  ) : tiersLoading ? (
                    <Badge variant="secondary" className="gap-1 text-[10px]"><RefreshCw className="h-3 w-3 animate-spin" /> Loading…</Badge>
                  ) : (
                    <Badge variant="secondary" className="gap-1 text-[10px]"><Clock className="h-3 w-3" /> Daily update</Badge>
                  )}
                </div>
              </div>
              {tiersLoading ? <TierSkeleton /> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                      <tr>
                        <th className="text-left font-semibold px-4 py-3">Tier</th>
                        <th className="text-left font-semibold px-4 py-3">30-day volume</th>
                        <th className="text-right font-semibold px-4 py-3">Maker</th>
                        <th className="text-right font-semibold px-4 py-3">Taker</th>
                        <th className="text-right font-semibold px-4 py-3">Withdraw discount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {displayTiers.map((t, idx) => {
                        const isPopular = idx === Math.floor(displayTiers.length / 2);
                        return (
                          <tr key={t.level}
                            className={cn("transition-colors", isPopular ? "bg-primary/5 hover:bg-primary/10" : "hover:bg-accent/20")}
                            data-testid={`row-spot-${t.name.toLowerCase().replace(/\s+/g, "-")}`}
                          >
                            <td className="px-4 py-3 font-semibold">
                              <span className="flex items-center gap-2">
                                {t.name}
                                {isPopular && <Badge variant="secondary" className="text-[10px] py-0">Popular</Badge>}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">{fmtVol(t.minVolume)}</td>
                            <td className="px-4 py-3 text-right tabular-nums font-mono text-emerald-400">{fmtPct(t.spotMaker)}</td>
                            <td className="px-4 py-3 text-right tabular-nums font-mono">{fmtPct(t.spotTaker)}</td>
                            <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{t.withdrawDiscount}%</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-card/40">
            <CardContent className="p-5 flex items-start gap-3">
              <Info className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
              <div className="text-sm text-muted-foreground leading-relaxed">
                <strong className="text-foreground">Conversion (instant buy/sell):</strong>{" "}
                a market spread of <strong>~0.10%</strong> is baked into the displayed rate, plus a conversion fee of{" "}
                <strong>
                  {tiersLoading ? "…" : `${fmtPct(displayTiers[displayTiers.length - 1]?.convertFee ?? 0.075)}–${fmtPct(displayTiers[0]?.convertFee ?? 0.30)}`}
                </strong>{" "}
                (depending on VIP tier) on the output amount. No separate maker/taker fee on Convert orders.
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Futures ────────────────────────────────────────────── */}
        <TabsContent value="futures" className="space-y-6">
          <Card>
            <CardContent className="p-0">
              <div className="p-5 border-b border-border flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold">Perpetual futures — maker / taker</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Margin: cross or isolated. Funding paid every 8 hours between longs and shorts (variable rate).
                  </p>
                </div>
                {tiersLoading ? (
                  <Badge variant="secondary" className="gap-1 text-[10px] shrink-0"><RefreshCw className="h-3 w-3 animate-spin" /> Loading…</Badge>
                ) : tiersError ? (
                  <Badge variant="destructive" className="gap-1 text-[10px] shrink-0"><AlertCircle className="h-3 w-3" /> Defaults</Badge>
                ) : null}
              </div>
              {tiersLoading ? <TierSkeleton /> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                      <tr>
                        <th className="text-left font-semibold px-4 py-3">Tier</th>
                        <th className="text-left font-semibold px-4 py-3">30-day volume</th>
                        <th className="text-right font-semibold px-4 py-3">Maker</th>
                        <th className="text-right font-semibold px-4 py-3">Taker</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {displayTiers.map((t) => (
                        <tr key={t.level} className="hover:bg-accent/20 transition-colors">
                          <td className="px-4 py-3 font-semibold">{t.name}</td>
                          <td className="px-4 py-3 text-muted-foreground">{fmtVol(t.minVolume)}</td>
                          <td className="px-4 py-3 text-right tabular-nums font-mono text-emerald-400">{fmtPct(t.futuresMaker)}</td>
                          <td className="px-4 py-3 text-right tabular-nums font-mono">{fmtPct(t.futuresTaker)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-card/40">
            <CardContent className="p-5 flex items-start gap-3">
              <Info className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
              <div className="text-sm text-muted-foreground leading-relaxed">
                <strong className="text-foreground">Liquidation fee:</strong>{" "}
                0.30% of the notional liquidated. <strong className="text-foreground">Insurance fund</strong> contributions
                may apply during periods of severe market stress.
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Funding ────────────────────────────────────────────── */}
        <TabsContent value="funding" className="space-y-6">
          <Card>
            <CardContent className="p-0">
              <div className="p-5 border-b border-border flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold">Deposits & withdrawals</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    All crypto deposits are free. INR rails settle through licensed Indian banking partners.
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {networksLoading ? (
                    <Badge variant="secondary" className="gap-1 text-[10px]"><RefreshCw className="h-3 w-3 animate-spin" /> Loading…</Badge>
                  ) : networksError ? (
                    <Badge variant="destructive" className="gap-1 text-[10px]"><AlertCircle className="h-3 w-3" /> Defaults</Badge>
                  ) : (
                    <Badge className="gap-1 text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/10">
                      <CheckCircle2 className="h-3 w-3" /> Live data · {displayNets.length} networks
                    </Badge>
                  )}
                </div>
              </div>
              {networksLoading ? <NetworkSkeleton /> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                      <tr>
                        <th className="text-left font-semibold px-4 py-3">Asset</th>
                        <th className="text-left font-semibold px-4 py-3">Network</th>
                        <th className="text-left font-semibold px-4 py-3">Deposit</th>
                        <th className="text-left font-semibold px-4 py-3">Withdraw fee</th>
                        <th className="text-left font-semibold px-4 py-3">Min withdraw</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {displayNets.map((f, i) => (
                        <tr key={i} className={cn("hover:bg-accent/20 transition-colors", (!f.depositEnabled || !f.withdrawEnabled) && "opacity-50")}>
                          <td className="px-4 py-3 font-semibold">
                            <span className="flex items-center gap-1.5">
                              {f.symbol}
                              {(!f.depositEnabled || !f.withdrawEnabled) && (
                                <Badge variant="outline" className="text-[9px] py-0">Paused</Badge>
                              )}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{f.network}</td>
                          <td className="px-4 py-3 text-emerald-400 font-medium">{f.depositFee}</td>
                          <td className="px-4 py-3 font-mono text-xs">{f.withdrawFee}</td>
                          <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{f.minWithdraw}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid sm:grid-cols-3 gap-4">
            <div className="rounded-xl border border-border bg-card/40 p-5">
              <ArrowDownToLine className="h-5 w-5 text-emerald-400 mb-2" />
              <div className="font-semibold mb-1 text-sm">Deposit limits</div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                KYC L1: ₹50,000 / day<br />
                KYC L2: ₹10L / day<br />
                KYC L3: case-by-case<br />
                Crypto: unlimited*
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card/40 p-5">
              <ArrowUpFromLine className="h-5 w-5 text-amber-400 mb-2" />
              <div className="font-semibold mb-1 text-sm">Withdrawal limits</div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                KYC L1: ₹25,000 / day<br />
                KYC L2: ₹5L / day<br />
                KYC L3: ₹50L / day<br />
                Higher via EDD
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card/40 p-5">
              <Shield className="h-5 w-5 text-blue-400 mb-2" />
              <div className="font-semibold mb-1 text-sm">KYC gating</div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                L1: Instant PAN check<br />
                L2: Aadhaar + selfie (~24 hrs)<br />
                L3: EDD for higher limits<br />
                <Link href="/kyc" className="text-primary hover:underline">Start KYC →</Link>
              </p>
            </div>
          </div>
        </TabsContent>

        {/* ── Discounts ──────────────────────────────────────────── */}
        <TabsContent value="discounts" className="space-y-6">
          <div className="grid md:grid-cols-2 gap-4">
            {DISCOUNTS.map((d) => (
              <div key={d.title} className="rounded-xl border border-border bg-card/40 hover:border-primary/40 transition-colors p-5">
                <div className={`h-10 w-10 rounded-lg ${d.color} flex items-center justify-center mb-3`}>
                  <d.icon className="h-5 w-5" />
                </div>
                <div className="font-semibold mb-1 text-sm">{d.title}</div>
                <p className="text-sm text-muted-foreground leading-relaxed">{d.body}</p>
              </div>
            ))}
          </div>

          {/* VIP ladder quick view (dynamic) */}
          {!tiersLoading && displayTiers.length > 0 && (
            <Card className="bg-card/40">
              <CardContent className="p-5">
                <h3 className="font-semibold mb-4 flex items-center gap-2 text-sm">
                  <TrendingUp className="h-4 w-4 text-primary" /> VIP tier ladder
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-muted-foreground">
                      <tr className="border-b border-border">
                        <th className="text-left font-semibold py-2 pr-4">Tier</th>
                        <th className="text-left font-semibold py-2 pr-4">Min 30d volume</th>
                        <th className="text-right font-semibold py-2 pr-4">Convert fee</th>
                        <th className="text-right font-semibold py-2">Withdraw discount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {displayTiers.map((t) => (
                        <tr key={t.level} className="hover:bg-accent/20">
                          <td className="py-2 pr-4 font-semibold">{t.name}</td>
                          <td className="py-2 pr-4 text-muted-foreground">{fmtVol(t.minVolume)}</td>
                          <td className="py-2 pr-4 text-right font-mono">{fmtPct(t.convertFee)}</td>
                          <td className="py-2 text-right text-emerald-400 font-medium">{t.withdrawDiscount}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="rounded-xl border border-primary/30 bg-gradient-to-br from-primary/10 to-card p-6 flex flex-col md:flex-row items-start md:items-center gap-4 justify-between">
            <div>
              <div className="font-semibold mb-1">Want institutional pricing?</div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Trading more than $50M / month? We offer custom maker
                rebates, dedicated support, and colocation options.
              </p>
            </div>
            <Link href="/support">
              <Button data-testid="button-fees-contact-sales" className="bg-primary text-primary-foreground hover:bg-primary/90 whitespace-nowrap shrink-0">
                Talk to sales <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </Link>
          </div>
        </TabsContent>
      </Tabs>

      <p className="text-[11px] text-muted-foreground mt-10 leading-relaxed border-t border-border/40 pt-6">
        Fees and limits may change from time to time. Material changes are announced in-app and via email at least <strong>7 days</strong> in advance.
        All fees are exclusive of applicable GST, where chargeable. Crypto withdrawal fees are pass-through network fees plus a small handling fee.{" "}
        <Link href="/legal/terms" className="text-muted-foreground/80 hover:text-foreground underline underline-offset-2">
          Full terms →
        </Link>
      </p>
    </div>
  );
}
