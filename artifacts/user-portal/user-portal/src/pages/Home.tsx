import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  TrendingUp,
  TrendingDown,
  Flame,
  BarChart3,
  Zap,
  Shield,
  Lock,
  Banknote,
  Headphones,
  Sparkles,
  ChevronRight,
  Activity,
  ArrowLeftRight,
  Smartphone,
  CircleDollarSign,
  Cpu,
  Network,
  Check,
  X,
  Search,
  PiggyBank,
  Coins,
  Rocket,
  Gem,
  CircleCheck,
  Megaphone,
  Bell,
  Star,
  Brain,
  Globe2,
  Layers,
  Copy,
  Plus,
  ChevronDown,
  ChevronUp,
  UserCheck,
  Users,
  ReceiptText,
  HelpCircle,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useTickers, encodeSymbol, type NormalizedTicker } from "@/lib/marketSocket";
import { useAuth } from "@/lib/auth";
import { KycProgressBanner } from "@/components/KycGate";
import { get } from "@/lib/api";
import { useMarketCatalog } from "@/lib/marketCatalog";
import { buildUsdRates } from "@/lib/volumeUsd";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function isInr(sym: string) { return sym.endsWith("/INR") || sym.endsWith("INR"); }
function currencyPrefix(sym: string): string { return isInr(sym) ? "₹" : ""; }
function fmtPrice(n: number, sym: string): string {
  if (!isFinite(n) || n === 0) return "—";
  const inr = isInr(sym);
  const digits = inr ? 2 : n < 1 ? 6 : n < 100 ? 4 : 2;
  return currencyPrefix(sym) + n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
function fmtCompact(n: number, prefix = "") {
  if (!isFinite(n) || n === 0) return prefix + "0";
  const abs = Math.abs(n);
  if (abs >= 1e9) return prefix + (n / 1e9).toFixed(2) + "B";
  if (abs >= 1e6) return prefix + (n / 1e6).toFixed(2) + "M";
  if (abs >= 1e3) return prefix + (n / 1e3).toFixed(2) + "K";
  return prefix + n.toFixed(2);
}
function baseAsset(sym: string) { return sym.split("/")[0] || sym; }
function quoteAsset(sym: string) { return sym.split("/")[1] || ""; }

// ─────────────────────────────────────────────────────────────────────────────
// Sparkline
// ─────────────────────────────────────────────────────────────────────────────
type Candle = [number, number, number, number, number, number];
function Sparkline({ symbol, positive }: { symbol: string; positive: boolean }) {
  const [bRaw, qRaw] = symbol.split("/");
  const { data } = useQuery<Candle[] | { data?: Candle[] }>({
    queryKey: ["spark", symbol],
    queryFn: () => get(`/exchange/chart?currency=${encodeURIComponent(bRaw)}&pair=${encodeURIComponent(qRaw)}&interval=1h&limit=24`),
    staleTime: 60_000, refetchInterval: 60_000, retry: 1,
  });
  const points = useMemo(() => {
    const arr: Candle[] = Array.isArray(data) ? data : ((data as any)?.data ?? []);
    return arr.map((c) => Number(c[4])).filter((n) => isFinite(n));
  }, [data]);
  if (points.length < 2) return <div className="h-8 w-20 opacity-20 bg-muted rounded" />;
  const min = Math.min(...points), max = Math.max(...points), range = max - min || 1;
  const W = 80, H = 32;
  const stepX = W / (points.length - 1);
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${(i * stepX).toFixed(1)},${(H - ((p - min) / range) * H).toFixed(1)}`).join(" ");
  const stroke = positive ? "hsl(var(--success))" : "hsl(var(--destructive))";
  const id = `sf-${symbol.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="overflow-visible">
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.3" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${path} L${W},${H} L0,${H} Z`} fill={`url(#${id})`} />
      <path d={path} stroke={stroke} strokeWidth="1.5" fill="none" strokeLinecap="round" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Asset Icon
// ─────────────────────────────────────────────────────────────────────────────
function AssetIcon({ symbol, size = 8 }: { symbol: string; size?: number }) {
  const b = baseAsset(symbol);
  const palette = ["from-amber-500 to-orange-600","from-sky-500 to-blue-600","from-violet-500 to-purple-600","from-emerald-500 to-teal-600","from-rose-500 to-pink-600","from-fuchsia-500 to-indigo-600","from-yellow-500 to-amber-600","from-cyan-500 to-sky-600"];
  let hash = 0;
  for (let i = 0; i < b.length; i++) hash = (hash * 31 + b.charCodeAt(i)) >>> 0;
  return (
    <div className={`h-${size} w-${size} shrink-0 rounded-full bg-gradient-to-br ${palette[hash % palette.length]} text-white flex items-center justify-center text-xs font-bold shadow`}>
      {b.slice(0, 1)}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Ticker Tape
// ─────────────────────────────────────────────────────────────────────────────
function TickerTape({ tickers }: { tickers: NormalizedTicker[] }) {
  if (tickers.length === 0) return null;
  const items = [...tickers, ...tickers];
  return (
    <div className="w-full overflow-hidden border-b border-border/60 bg-card/40 backdrop-blur">
      <div className="flex gap-8 py-2 animate-[scroll_60s_linear_infinite] hover:[animation-play-state:paused]">
        {items.map((t, i) => {
          const pos = t.priceChangePercent >= 0;
          return (
            <Link key={`${t.symbol}-${i}`} href={`/trade/${encodeSymbol(t.symbol)}`}
              className="flex items-center gap-1.5 whitespace-nowrap text-xs hover:text-primary transition-colors">
              <span className="font-semibold text-foreground/80">{baseAsset(t.symbol)}</span>
              <span className="font-mono tabular-nums">{fmtPrice(t.lastPrice, t.symbol)}</span>
              <span className={pos ? "text-success" : "text-destructive"}>
                {pos ? "+" : ""}{t.priceChangePercent.toFixed(2)}%
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Animated Counter
// ─────────────────────────────────────────────────────────────────────────────
function AnimatedNumber({ value, prefix = "", suffix = "", compact = false }: { value: number; prefix?: string; suffix?: string; compact?: boolean }) {
  const [shown, setShown] = useState(0);
  const fromRef = useRef(0);
  useEffect(() => {
    const from = fromRef.current, to = value || 0, start = performance.now(), dur = 900;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      setShown(from + (to - from) * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick); else fromRef.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  const formatted = compact ? fmtCompact(shown) : shown.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  return <span className="font-mono tabular-nums">{prefix}{formatted}{suffix}</span>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Coin names
// ─────────────────────────────────────────────────────────────────────────────
const COIN_NAMES: Record<string, string> = {
  BTC:"Bitcoin",ETH:"Ethereum",BNB:"BNB",SOL:"Solana",XRP:"XRP",ADA:"Cardano",DOGE:"Dogecoin",
  TRX:"TRON",AVAX:"Avalanche",DOT:"Polkadot",MATIC:"Polygon",LINK:"Chainlink",LTC:"Litecoin",
  BCH:"Bitcoin Cash",UNI:"Uniswap",ATOM:"Cosmos",XLM:"Stellar",ETC:"Ethereum Classic",
  FIL:"Filecoin",APT:"Aptos",ARB:"Arbitrum",OP:"Optimism",NEAR:"NEAR",INJ:"Injective",
  SUI:"Sui",SHIB:"Shiba Inu",PEPE:"Pepe",AAVE:"Aave",ALGO:"Algorand",VET:"VeChain",
  USDT:"Tether",USDC:"USD Coin",DAI:"Dai",ZBX:"Zebvix",SEI:"Sei",WIF:"dogwifhat",JUP:"Jupiter",
};
function coinName(sym: string): string { return COIN_NAMES[baseAsset(sym).toUpperCase()] || baseAsset(sym); }

// ─────────────────────────────────────────────────────────────────────────────
// Favorites
// ─────────────────────────────────────────────────────────────────────────────
const FAV_KEY = "zbx:fav";
function useFavorites() {
  const [favs, setFavs] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(FAV_KEY) || "[]") as string[]); } catch { return new Set(); }
  });
  const toggle = (sym: string) => {
    setFavs(prev => {
      const next = new Set(prev);
      next.has(sym) ? next.delete(sym) : next.add(sym);
      try { localStorage.setItem(FAV_KEY, JSON.stringify([...next])); } catch {}
      return next;
    });
  };
  return { favs, toggle, has: (s: string) => favs.has(s) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Price flash
// ─────────────────────────────────────────────────────────────────────────────
function usePriceFlash(price: number) {
  const [dir, setDir] = useState<"up"|"down"|null>(null);
  const prev = useRef(price);
  useEffect(() => {
    if (!isFinite(price) || price === 0) return undefined;
    if (prev.current && price !== prev.current) {
      setDir(price > prev.current ? "up" : "down");
      const id = setTimeout(() => setDir(null), 700);
      prev.current = price;
      return () => clearTimeout(id);
    }
    prev.current = price;
    return undefined;
  }, [price]);
  return dir;
}

// ─────────────────────────────────────────────────────────────────────────────
// Scroll reveal
// ─────────────────────────────────────────────────────────────────────────────
function useReveal<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    if (typeof IntersectionObserver === "undefined") {
      el.classList.add("is-visible");
      return undefined;
    }
    const io = new IntersectionObserver(
      entries => { entries.forEach(e => { if (e.isIntersecting) { (e.target as HTMLElement).classList.add("is-visible"); io.unobserve(e.target); } }); },
      { threshold: 0.1, rootMargin: "0px 0px -50px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return ref;
}
function Reveal({ children, className = "", delay, direction = "up", as: Tag = "div" }: { children: React.ReactNode; className?: string; delay?: number; direction?: "up"|"left"|"right"|"scale"|"fast"; as?: "div"|"section" }) {
  const ref = useReveal<HTMLDivElement>();
  const cls = direction === "left" ? "reveal-left" : direction === "right" ? "reveal-right" : direction === "scale" ? "reveal-scale" : direction === "fast" ? "reveal-fast" : "reveal";
  return <Tag ref={ref as any} className={`${cls} ${className}`} style={delay ? { transitionDelay: `${delay}ms` } : undefined}>{children}</Tag>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Announcement bar
// ─────────────────────────────────────────────────────────────────────────────
function AnnouncementBar() {
  const [open, setOpen] = useState(true);
  useEffect(() => { try { if (sessionStorage.getItem("zbx_ann") === "1") setOpen(false); } catch {} }, []);
  if (!open) return null;
  return (
    <div className="relative w-full bg-gradient-to-r from-violet-600 via-fuchsia-600 to-amber-500 text-white">
      <div className="container mx-auto px-4 py-2 flex items-center justify-center gap-3 text-xs sm:text-sm">
        <Megaphone className="h-4 w-4 shrink-0" />
        <span className="text-center"><strong>New:</strong> AI-powered trading signals are live — try them on BTC/INR!</span>
        <Link href="/ai-trading" className="hidden sm:inline-flex items-center gap-1 underline-offset-2 hover:underline font-semibold shrink-0">
          Try now <ArrowRight className="h-3 w-3" />
        </Link>
        <button onClick={() => { setOpen(false); try { sessionStorage.setItem("zbx_ann","1"); } catch {} }}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded hover:bg-white/15 transition-colors" aria-label="Dismiss">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Hero Search
// ─────────────────────────────────────────────────────────────────────────────
function HeroSearch({ tickers }: { tickers: NormalizedTicker[] }) {
  const [q, setQ] = useState(""), [, setLocation] = useLocation(), [focused, setFocused] = useState(false);
  const matches = useMemo(() => {
    const t = q.trim().toUpperCase(); if (!t) return [];
    return tickers.filter(tk => { const s = tk.symbol.toUpperCase(); return s.includes(t) || baseAsset(s).startsWith(t); }).slice(0, 6);
  }, [q, tickers]);
  const go = (sym: string) => { setQ(""); setFocused(false); setLocation(`/trade/${encodeSymbol(sym)}`); };
  return (
    <form onSubmit={e => { e.preventDefault(); if (matches.length > 0) go(matches[0].symbol); else if (q.trim()) setLocation("/markets"); }}
      className="relative w-full max-w-lg" autoComplete="off">
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input value={q} onChange={e => setQ(e.target.value)} onFocus={() => setFocused(true)} onBlur={() => setTimeout(() => setFocused(false), 150)}
          placeholder="Search coins — BTC, ETH, SOL, DOGE…"
          className="pl-10 pr-24 h-12 sm:h-14 text-sm sm:text-base bg-card/80 backdrop-blur border-border/50 focus:border-primary/60 rounded-xl shadow-lg" />
        <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 h-8 sm:h-10 px-3 sm:px-4 rounded-lg bg-primary text-primary-foreground text-xs sm:text-sm font-semibold hover:bg-primary/90 transition-colors">
          Search
        </button>
      </div>
      {focused && matches.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1.5 z-40 rounded-xl border border-border bg-popover shadow-xl overflow-hidden">
          {matches.map(t => {
            const pos = t.priceChangePercent >= 0;
            return (
              <button key={t.symbol} type="button" onMouseDown={() => go(t.symbol)}
                className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-muted/40 transition-colors text-left">
                <AssetIcon symbol={t.symbol} size={8} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold">{baseAsset(t.symbol)}</div>
                  <div className="text-[11px] text-muted-foreground">{coinName(t.symbol)}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-mono font-semibold">{fmtPrice(t.lastPrice, t.symbol)}</div>
                  <div className={`text-[11px] font-medium ${pos ? "text-success" : "text-destructive"}`}>
                    {pos ? "+" : ""}{t.priceChangePercent.toFixed(2)}%
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Mini live price card (hero right panel)
// ─────────────────────────────────────────────────────────────────────────────
function LivePriceCard({ ticker }: { ticker: NormalizedTicker | undefined }) {
  const flash = usePriceFlash(ticker?.lastPrice ?? 0);
  if (!ticker) return null;
  const pos = ticker.priceChangePercent >= 0;
  return (
    <div className="rounded-2xl border border-border/40 bg-card/70 backdrop-blur p-4 sm:p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <AssetIcon symbol={ticker.symbol} size={10} />
          <div>
            <div className="font-bold text-base">{baseAsset(ticker.symbol)}<span className="text-muted-foreground text-xs ml-1">/{quoteAsset(ticker.symbol)}</span></div>
            <div className="text-[11px] text-muted-foreground">{coinName(ticker.symbol)}</div>
          </div>
        </div>
        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold ${pos ? "bg-success/10 text-success border border-success/20" : "bg-destructive/10 text-destructive border border-destructive/20"}`}>
          {pos ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {pos ? "+" : ""}{ticker.priceChangePercent.toFixed(2)}%
        </span>
      </div>
      <div className={`text-2xl sm:text-3xl font-black tabular-nums rounded-lg px-1 -mx-1 transition-colors duration-300 ${flash === "up" ? "text-success" : flash === "down" ? "text-destructive" : ""}`}>
        {fmtPrice(ticker.lastPrice, ticker.symbol)}
      </div>
      <div className="flex gap-3 text-xs text-muted-foreground">
        <div className="flex-1 rounded-lg bg-muted/30 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider mb-0.5">24h High</div>
          <div className="font-mono font-semibold text-foreground">{fmtCompact(ticker.high, currencyPrefix(ticker.symbol))}</div>
        </div>
        <div className="flex-1 rounded-lg bg-muted/30 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider mb-0.5">24h Low</div>
          <div className="font-mono font-semibold text-foreground">{fmtCompact(ticker.low, currencyPrefix(ticker.symbol))}</div>
        </div>
        <div className="flex-1 rounded-lg bg-muted/30 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider mb-0.5">Volume</div>
          <div className="font-mono font-semibold text-foreground">{fmtCompact(ticker.quoteVolume, currencyPrefix(ticker.symbol))}</div>
        </div>
      </div>
      <Link href={`/trade/${encodeSymbol(ticker.symbol)}`}>
        <Button className="w-full h-10 bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-xl">
          Trade {baseAsset(ticker.symbol)} <ArrowRight className="ml-1.5 h-4 w-4" />
        </Button>
      </Link>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Market table row
// ─────────────────────────────────────────────────────────────────────────────
function MarketRow({ t, rank, isFav, onToggleFav }: { t: NormalizedTicker; rank: number; isFav: boolean; onToggleFav: (s: string) => void }) {
  const positive = t.priceChangePercent >= 0;
  const flash = usePriceFlash(t.lastPrice);
  return (
    <Link href={`/trade/${encodeSymbol(t.symbol)}`} className="grid grid-cols-12 gap-2 items-center px-3 sm:px-5 py-3 hover:bg-muted/30 transition-colors border-b border-border/40 last:border-0 group cursor-pointer">
      {/* Asset */}
      <div className="col-span-5 sm:col-span-4 flex items-center gap-2 min-w-0">
        <button type="button" aria-label="Favorite" onClick={e => { e.preventDefault(); e.stopPropagation(); onToggleFav(t.symbol); }}
          className="shrink-0 p-1 rounded hover:bg-muted/50 transition-colors hidden sm:block">
          <Star className={`h-3.5 w-3.5 ${isFav ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40 hover:text-amber-300"}`} />
        </button>
        <span className="hidden lg:block text-[10px] font-mono text-muted-foreground/50 w-5 text-center shrink-0">{rank}</span>
        <AssetIcon symbol={t.symbol} size={8} />
        <div className="min-w-0">
          <div className="flex items-center gap-1">
            <span className="font-bold text-sm truncate">{baseAsset(t.symbol)}</span>
            <span className="text-[10px] text-muted-foreground hidden sm:inline shrink-0">/{quoteAsset(t.symbol)}</span>
          </div>
          <div className="text-[10px] text-muted-foreground truncate hidden sm:block">{coinName(t.symbol)}</div>
        </div>
      </div>
      {/* Price */}
      <div className={`col-span-4 sm:col-span-3 text-right font-mono tabular-nums text-sm font-semibold rounded px-1 transition-colors duration-300 ${flash === "up" ? "text-success" : flash === "down" ? "text-destructive" : ""}`}>
        {fmtPrice(t.lastPrice, t.symbol)}
      </div>
      {/* Change */}
      <div className="col-span-3 sm:col-span-2 flex justify-end">
        <span className={`inline-flex items-center gap-0.5 px-2 py-1 rounded-lg text-xs font-bold tabular-nums ${positive ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
          {positive ? "+" : ""}{t.priceChangePercent.toFixed(2)}%
        </span>
      </div>
      {/* Volume */}
      <div className="hidden sm:block sm:col-span-2 text-right font-mono text-xs text-muted-foreground tabular-nums">
        {fmtCompact(t.quoteVolume, isInr(t.symbol) ? "₹" : "$")}
      </div>
      {/* Sparkline */}
      <div className="hidden lg:flex lg:col-span-1 justify-end">
        <Sparkline symbol={t.symbol} positive={positive} />
      </div>
    </Link>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Skeleton row
// ─────────────────────────────────────────────────────────────────────────────
function SkeletonRow() {
  return (
    <div className="grid grid-cols-12 gap-2 items-center px-5 py-3 border-b border-border/40 animate-pulse">
      <div className="col-span-4 flex items-center gap-2">
        <div className="h-8 w-8 rounded-full bg-muted/50" />
        <div className="space-y-1.5">
          <div className="h-3 w-12 rounded bg-muted/50" />
          <div className="h-2.5 w-16 rounded bg-muted/40" />
        </div>
      </div>
      <div className="col-span-3 flex justify-end"><div className="h-3 w-16 rounded bg-muted/50" /></div>
      <div className="col-span-2 flex justify-end"><div className="h-6 w-14 rounded-lg bg-muted/50" /></div>
      <div className="col-span-2 flex justify-end"><div className="h-3 w-10 rounded bg-muted/40" /></div>
      <div className="col-span-1 flex justify-end"><div className="h-8 w-20 rounded bg-muted/40" /></div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Home Page
// ─────────────────────────────────────────────────────────────────────────────
export default function Home() {
  const tickersMap = useTickers();
  const { user } = useAuth();
  const { all: enabledSet } = useMarketCatalog();
  const all = useMemo(() => Object.values(tickersMap).filter(t => t.lastPrice > 0 && enabledSet.has(t.symbol)), [tickersMap, enabledSet]);

  const { data: dbStats } = useQuery<{ totalVolumeInr: number; totalTrades24h: number; activePairs: number; inrRate: number }>({
    queryKey: ["exchange-stats"],
    queryFn: () => get("/exchange/stats"),
    refetchInterval: 60_000, staleTime: 30_000,
  });

  const usdRates = useMemo(() => buildUsdRates(all), [all]);

  const stats = useMemo(() => ({
    totalVolumeInr: dbStats?.totalVolumeInr ?? 0,
    totalVolumeUsd: (dbStats?.inrRate ?? 85) > 0 ? (dbStats?.totalVolumeInr ?? 0) / (dbStats?.inrRate ?? 85) : 0,
    markets: all.length,
    totalTrades24h: dbStats?.totalTrades24h ?? 0,
  }), [all, dbStats]);

  const tape = useMemo(() => [...all].sort((a, b) => (b.quoteVolume || 0) - (a.quoteVolume || 0)).slice(0, 14), [all]);
  const btcTicker = useMemo(() => all.find(t => t.symbol === "BTC/USDT") ?? all.find(t => t.symbol === "BTC/INR"), [all]);

  const fav = useFavorites();
  const [search, setSearch] = useState("");
  const [quote, setQuote] = useState<"ALL" | "INR" | "USDT">("ALL");
  const [tab, setTab] = useState<"favorites" | "hot" | "gainers" | "losers" | "vol">("hot");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter(t => {
      if (quote !== "ALL" && quoteAsset(t.symbol).toUpperCase() !== quote) return false;
      if (q) { const s = t.symbol.toLowerCase(); const n = coinName(t.symbol).toLowerCase(); if (!s.includes(q) && !n.includes(q)) return false; }
      return true;
    });
  }, [all, search, quote]);

  const lists = useMemo(() => ({
    hot: [...filtered].sort((a, b) => Math.abs(b.priceChangePercent) * (b.quoteVolume || 1) - Math.abs(a.priceChangePercent) * (a.quoteVolume || 1)).slice(0, 10),
    gainers: [...filtered].sort((a, b) => b.priceChangePercent - a.priceChangePercent).slice(0, 10),
    losers: [...filtered].sort((a, b) => a.priceChangePercent - b.priceChangePercent).slice(0, 10),
    vol: [...filtered].sort((a, b) => (b.quoteVolume || 0) - (a.quoteVolume || 0)).slice(0, 10),
    favorites: filtered.filter(t => fav.has(t.symbol)).slice(0, 20),
  }), [filtered, fav.favs]);

  const currentList = lists[tab];

  return (
    <div className="flex flex-col w-full min-h-screen">
      <AnnouncementBar />
      <TickerTape tickers={tape} />

      {/* ─── STATS BAR ────────────────────────────────────────────────── */}
      <div className="w-full border-b border-border/50 bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-3">
          <div className="flex flex-wrap items-center justify-center sm:justify-between gap-x-8 gap-y-2">
            {[
              { label: "24h Volume", value: stats.totalVolumeInr || 6117647000, prefix: "₹", compact: true },
              { label: "Trades Today", value: stats.totalTrades24h || 18400, prefix: "", compact: true },
              { label: "Active Markets", value: stats.markets || 146, prefix: "", compact: false },
              { label: "Registered Users", value: 210000, prefix: "", suffix: "+", compact: true },
            ].map(s => (
              <div key={s.label} className="flex items-center gap-2 text-sm">
                <span className="font-bold text-foreground tabular-nums">
                  <AnimatedNumber value={s.value} prefix={s.prefix} suffix={s.suffix ?? ""} compact={s.compact} />
                </span>
                <span className="text-xs text-muted-foreground">{s.label}</span>
              </div>
            ))}
            <div className="hidden xl:flex items-center gap-4">
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
                All systems operational
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ─── KYC BANNER ───────────────────────────────────────────────── */}
      {user && (user.kycLevel ?? 0) < 2 && (
        <div className="container mx-auto px-4 pt-4">
          <KycProgressBanner />
        </div>
      )}

      {/* ─── HERO ─────────────────────────────────────────────────────── */}
      <section className="relative w-full overflow-hidden bg-background">
        {/* Background */}
        <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-amber-950/20 pointer-events-none" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_60%_at_60%_-10%,rgba(245,158,11,0.08),transparent)] pointer-events-none" />
        <div className="absolute inset-0 opacity-[0.04] pointer-events-none"
          style={{ backgroundImage: "linear-gradient(hsl(var(--border)) 1px,transparent 1px),linear-gradient(90deg,hsl(var(--border)) 1px,transparent 1px)", backgroundSize: "40px 40px" }} />
        {/* Orbs */}
        <div className="absolute -top-32 right-0 h-96 w-96 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 -left-20 h-64 w-64 rounded-full bg-violet-500/8 blur-3xl pointer-events-none" />

        <div className="relative container mx-auto px-4 py-12 sm:py-16 lg:py-20">
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            {/* Left */}
            <div className="space-y-6 sm:space-y-7">
              {/* Badge */}
              <div className="fade-in-up flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-success/25 bg-success/5 text-xs font-medium text-success">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-success/60 animate-ping" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
                  </span>
                  Live — {stats.markets || 146} markets trading
                </span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-amber-500/25 bg-amber-500/5 text-xs font-medium text-amber-400">
                  <Shield className="h-3 w-3" />
                  KYC &amp; AML Compliant
                </span>
              </div>

              {/* Headline */}
              <div className="fade-in-up space-y-3">
                <h1 className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-black tracking-tight leading-[1.1]">
                  Trade Crypto
                  <br />
                  <span className="bg-gradient-to-r from-amber-400 via-orange-400 to-amber-500 bg-clip-text text-transparent">
                    With Confidence
                  </span>
                </h1>
                <p className="text-sm sm:text-base lg:text-lg text-muted-foreground leading-relaxed max-w-xl">
                  India&apos;s professional crypto exchange — spot, futures, P2P, AI trading, earn &amp; more. 
                  Fast execution, deep liquidity, and institutional-grade security.
                </p>
              </div>

              {/* Search */}
              <div className="fade-in-up">
                <HeroSearch tickers={all} />
              </div>

              {/* CTAs */}
              <div className="fade-in-up flex flex-wrap gap-3">
                {user ? (
                  <>
                    <Button size="lg" className="h-12 px-6 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white font-bold shadow-lg shadow-amber-900/20 rounded-xl" asChild>
                      <Link href="/trade">Start Trading <ArrowRight className="ml-2 h-4 w-4" /></Link>
                    </Button>
                    <Button size="lg" variant="outline" className="h-12 px-6 rounded-xl" asChild>
                      <Link href="/portfolio">My Portfolio</Link>
                    </Button>
                  </>
                ) : (
                  <>
                    <Button size="lg" className="h-12 px-6 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white font-bold shadow-lg shadow-amber-900/20 rounded-xl" asChild>
                      <Link href="/signup">Get Started Free <ArrowRight className="ml-2 h-4 w-4" /></Link>
                    </Button>
                    <Button size="lg" variant="outline" className="h-12 px-6 rounded-xl" asChild>
                      <Link href="/trade">Explore Markets</Link>
                    </Button>
                  </>
                )}
              </div>

              {/* Trust chips */}
              <div className="fade-in-up flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5"><Shield className="h-3.5 w-3.5 text-success" />95% Cold Storage</span>
                <span className="flex items-center gap-1.5"><Zap className="h-3.5 w-3.5 text-amber-400" />Sub-10ms Execution</span>
                <span className="flex items-center gap-1.5"><Lock className="h-3.5 w-3.5 text-blue-400" />2FA &amp; KYC Protected</span>
                <span className="flex items-center gap-1.5"><Headphones className="h-3.5 w-3.5 text-violet-400" />24/7 Support</span>
              </div>
            </div>

            {/* Right — live price widget */}
            <div className="fade-in-up space-y-4">
              {btcTicker && <LivePriceCard ticker={btcTicker} />}

              {/* Mini watchlist */}
              <div className="rounded-2xl border border-border/40 bg-card/70 backdrop-blur overflow-hidden">
                <div className="px-4 py-2.5 border-b border-border/40 flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Top Markets</span>
                  <Link href="/markets" className="text-xs text-primary hover:underline flex items-center gap-1">
                    View all <ChevronRight className="h-3 w-3" />
                  </Link>
                </div>
                <div>
                  {tape.filter(t => t.symbol !== btcTicker?.symbol).slice(0, 5).map(t => {
                    const pos = t.priceChangePercent >= 0;
                    return (
                      <Link key={t.symbol} href={`/trade/${encodeSymbol(t.symbol)}`}
                        className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors border-b border-border/30 last:border-0">
                        <AssetIcon symbol={t.symbol} size={7} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1">
                            <span className="text-sm font-bold">{baseAsset(t.symbol)}</span>
                            <span className="text-[10px] text-muted-foreground">/{quoteAsset(t.symbol)}</span>
                          </div>
                          <div className="text-[10px] text-muted-foreground truncate">{coinName(t.symbol)}</div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-sm font-mono font-semibold">{fmtPrice(t.lastPrice, t.symbol)}</div>
                          <div className={`text-[11px] font-bold ${pos ? "text-success" : "text-destructive"}`}>
                            {pos ? "+" : ""}{t.priceChangePercent.toFixed(2)}%
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── MARKETS SECTION ──────────────────────────────────────────── */}
      <section className="w-full border-y border-border/50 bg-card/20">
        <div className="container mx-auto px-4 py-10 sm:py-14">
          <Reveal className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold">Live Markets</h2>
              <p className="text-sm text-muted-foreground mt-0.5">{all.length} trading pairs, real-time prices</p>
            </div>
            <Link href="/markets" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
              View all markets <ArrowRight className="h-4 w-4" />
            </Link>
          </Reveal>

          <Reveal>
            <div className="rounded-2xl border border-border/50 bg-card/80 overflow-hidden shadow-sm">
              {/* Controls */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-3 sm:px-5 py-3 border-b border-border/40 bg-muted/10">
                {/* Tabs */}
                <Tabs value={tab} onValueChange={v => setTab(v as any)}>
                  <TabsList className="h-9 bg-muted/40 rounded-lg p-0.5">
                    <TabsTrigger value="hot" className="h-8 px-3 text-xs rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm">
                      <Flame className="h-3 w-3 mr-1 text-amber-400" />Hot
                    </TabsTrigger>
                    <TabsTrigger value="gainers" className="h-8 px-3 text-xs rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm">
                      <TrendingUp className="h-3 w-3 mr-1 text-success" />Gainers
                    </TabsTrigger>
                    <TabsTrigger value="losers" className="h-8 px-3 text-xs rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm">
                      <TrendingDown className="h-3 w-3 mr-1 text-destructive" />Losers
                    </TabsTrigger>
                    <TabsTrigger value="vol" className="h-8 px-3 text-xs rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm">
                      <BarChart3 className="h-3 w-3 mr-1" />Volume
                    </TabsTrigger>
                    <TabsTrigger value="favorites" className="h-8 px-3 text-xs rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm">
                      <Star className="h-3 w-3 mr-1 text-amber-400" />Starred
                    </TabsTrigger>
                  </TabsList>
                </Tabs>

                <div className="flex items-center gap-2 sm:ml-auto">
                  {/* Quote filter */}
                  {(["ALL","INR","USDT"] as const).map(q => (
                    <button key={q} onClick={() => setQuote(q)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${quote === q ? "bg-primary text-primary-foreground" : "bg-muted/40 text-muted-foreground hover:bg-muted/60"}`}>
                      {q}
                    </button>
                  ))}
                  {/* Search */}
                  <div className="relative hidden sm:block">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
                      className="pl-8 pr-3 py-1.5 h-9 w-36 text-xs rounded-lg border border-border/60 bg-background/60 focus:outline-none focus:border-primary/50" />
                  </div>
                </div>
              </div>

              {/* Table header */}
              <div className="grid grid-cols-12 gap-2 px-3 sm:px-5 py-2 border-b border-border/30 bg-muted/5">
                <div className="col-span-5 sm:col-span-4 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Asset</div>
                <div className="col-span-4 sm:col-span-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-right">Price</div>
                <div className="col-span-3 sm:col-span-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-right">24h Change</div>
                <div className="hidden sm:block sm:col-span-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-right">Volume</div>
                <div className="hidden lg:block lg:col-span-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-right">7d Chart</div>
              </div>

              {/* Rows */}
              {all.length === 0 ? (
                <>{Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)}</>
              ) : currentList.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground text-sm">
                  {tab === "favorites" ? "Star markets to add them here" : "No markets found"}
                </div>
              ) : (
                currentList.map((t, i) => <MarketRow key={t.symbol} t={t} rank={i + 1} isFav={fav.has(t.symbol)} onToggleFav={fav.toggle} />)
              )}

              {/* Footer */}
              <div className="px-5 py-3 border-t border-border/30 bg-muted/5 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Showing top 10 of {filtered.length} markets</span>
                <Link href="/markets" className="text-xs font-medium text-primary hover:underline flex items-center gap-1">
                  View all {all.length} markets <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ─── PRODUCTS GRID ───────────────────────────────────────────── */}
      <section className="w-full py-14 sm:py-16 bg-background">
        <div className="container mx-auto px-4">
          <Reveal className="text-center mb-10">
            <Badge variant="outline" className="border-primary/30 text-primary mb-3">
              <Gem className="h-3 w-3 mr-1.5" />Products
            </Badge>
            <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight">Everything a trader needs</h2>
            <p className="text-muted-foreground text-sm mt-2 max-w-lg mx-auto">
              12 powerful products under one login — spot, futures, AI, bots, P2P, earn and more.
            </p>
          </Reveal>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {[
              { icon: <BarChart3 className="h-5 w-5" />, title: "Spot Trading", desc: "Limit, market & stop orders with live order book.", href: "/trade", accent: "text-amber-400", bg: "bg-amber-500/10" },
              { icon: <Zap className="h-5 w-5" />, title: "Futures", desc: "Up to 100× leverage, USDT-margined perpetuals.", href: "/futures", accent: "text-violet-400", bg: "bg-violet-500/10" },
              { icon: <Brain className="h-5 w-5" />, title: "AI Trading", desc: "Smart BUY/SELL signals with confidence scores.", href: "/ai-trading", accent: "text-fuchsia-400", bg: "bg-fuchsia-500/10" },
              { icon: <Rocket className="h-5 w-5" />, title: "Copy Trading", desc: "Mirror top traders automatically with risk limits.", href: "/copy-trading", accent: "text-sky-400", bg: "bg-sky-500/10" },
              { icon: <Cpu className="h-5 w-5" />, title: "Trading Bots", desc: "Grid & DCA bots — set-and-forget automation.", href: "/bots", accent: "text-emerald-400", bg: "bg-emerald-500/10" },
              { icon: <ArrowLeftRight className="h-5 w-5" />, title: "P2P Trading", desc: "Peer-to-peer INR deals with escrow protection.", href: "/p2p", accent: "text-teal-400", bg: "bg-teal-500/10" },
              { icon: <PiggyBank className="h-5 w-5" />, title: "Earn & Staking", desc: "Flexible & locked plans — up to 11% APY.", href: "/earn", accent: "text-yellow-400", bg: "bg-yellow-500/10" },
              { icon: <Banknote className="h-5 w-5" />, title: "INR Banking", desc: "UPI, IMPS, NEFT & RTGS deposits/withdrawals.", href: "/wallet", accent: "text-rose-400", bg: "bg-rose-500/10" },
              { icon: <Layers className="h-5 w-5" />, title: "Options", desc: "Black-Scholes options with Greeks & auto-settlement.", href: "/futures", accent: "text-orange-400", bg: "bg-orange-500/10" },
              { icon: <Globe2 className="h-5 w-5" />, title: "Web3 / DeFi", desc: "Multi-chain swaps across 8 networks.", href: "/wallet", accent: "text-indigo-400", bg: "bg-indigo-500/10" },
              { icon: <Activity className="h-5 w-5" />, title: "Portfolio Pro", desc: "PnL analytics, risk heatmap & trade history.", href: "/portfolio", accent: "text-cyan-400", bg: "bg-cyan-500/10" },
              { icon: <Bell className="h-5 w-5" />, title: "Price Alerts", desc: "Custom price targets via push & email.", href: "/price-alerts", accent: "text-amber-300", bg: "bg-amber-400/10" },
            ].map((p, i) => (
              <Reveal key={p.title} direction="scale" delay={i * 40}>
                <Link href={p.href} className="group block h-full">
                  <div className="h-full rounded-xl border border-border/50 hover:border-primary/40 bg-card/60 hover:bg-card/90 p-4 transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/5">
                    <div className={`h-10 w-10 rounded-xl ${p.bg} ${p.accent} flex items-center justify-center mb-3 transition-transform group-hover:scale-110`}>
                      {p.icon}
                    </div>
                    <h3 className="font-bold text-sm text-foreground leading-tight">{p.title}</h3>
                    <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed">{p.desc}</p>
                    <div className={`mt-3 flex items-center gap-1 text-[11px] font-semibold ${p.accent} opacity-0 group-hover:opacity-100 transition-opacity`}>
                      Explore <ArrowRight className="h-3 w-3" />
                    </div>
                  </div>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ─── TRUST BAR ───────────────────────────────────────────────── */}
      <div className="w-full border-y border-border/50 bg-card/30 py-6">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {[
              { icon: <Shield className="h-5 w-5" />, label: "KYC & AML", sub: "PMLA 2002 · FIU-IND", color: "text-success bg-success/10 border-success/20" },
              { icon: <Lock className="h-5 w-5" />, label: "95% Cold Storage", sub: "HSM-protected vaults", color: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
              { icon: <Banknote className="h-5 w-5" />, label: "TDS Compliant", sub: "Section 194S / IT Act", color: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
              { icon: <Activity className="h-5 w-5" />, label: "99.97% Uptime", sub: "Monitored 24/7", color: "text-violet-400 bg-violet-500/10 border-violet-500/20" },
              { icon: <Headphones className="h-5 w-5" />, label: "24/7 Support", sub: "Fast human response", color: "text-fuchsia-400 bg-fuchsia-500/10 border-fuchsia-500/20" },
              { icon: <CircleCheck className="h-5 w-5" />, label: "SEBI Aware", sub: "Under active guidance", color: "text-teal-400 bg-teal-500/10 border-teal-500/20" },
            ].map((b, i) => (
              <div key={i} className="flex items-center gap-2.5">
                <div className={`h-9 w-9 rounded-xl border flex items-center justify-center shrink-0 ${b.color}`}>{b.icon}</div>
                <div>
                  <div className="text-xs font-bold text-foreground leading-tight">{b.label}</div>
                  <div className="text-[10px] text-muted-foreground leading-tight">{b.sub}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ─── AI TRADING BANNER ──────────────────────────────────────── */}
      <AiTradingSection />

      {/* ─── EARN SECTION ────────────────────────────────────────────── */}
      <section className="w-full py-14 sm:py-16 bg-card/20 border-y border-border/50">
        <div className="container mx-auto px-4">
          <Reveal className="text-center mb-10">
            <Badge variant="outline" className="border-primary/30 text-primary mb-3">
              <Sparkles className="h-3 w-3 mr-1.5" />Earn
            </Badge>
            <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight">Put your assets to work</h2>
            <p className="text-muted-foreground text-sm mt-2">Flexible & locked plans for USDT, BTC & ETH — up to 11% APY, interest accrues daily.</p>
          </Reveal>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { title: "USDT Flexible", apy: "5.00", coin: "USDT", dur: "Anytime", tag: "Flexible", tagCls: "bg-success/10 text-success border-success/20", grad: "from-success/10 to-transparent", accent: "text-success", icon: <PiggyBank className="h-5 w-5" /> },
              { title: "USDT 30-Day", apy: "8.50", coin: "USDT", dur: "30 days", tag: "Locked", tagCls: "bg-amber-500/10 text-amber-400 border-amber-500/20", grad: "from-amber-500/10 to-transparent", accent: "text-amber-400", icon: <Lock className="h-5 w-5" /> },
              { title: "USDT 90-Day", apy: "11.00", coin: "USDT", dur: "90 days", tag: "Best APY", tagCls: "bg-primary/10 text-primary border-primary/20", grad: "from-primary/10 to-transparent", accent: "text-primary", icon: <Star className="h-5 w-5" /> },
              { title: "BTC Flexible", apy: "2.50", coin: "BTC", dur: "Anytime", tag: "Flexible", tagCls: "bg-success/10 text-success border-success/20", grad: "from-orange-500/10 to-transparent", accent: "text-orange-400", icon: <Coins className="h-5 w-5" /> },
              { title: "ETH 60-Day", apy: "4.50", coin: "ETH", dur: "60 days", tag: "Locked", tagCls: "bg-violet-500/10 text-violet-400 border-violet-500/20", grad: "from-violet-500/10 to-transparent", accent: "text-violet-400", icon: <Zap className="h-5 w-5" /> },
              { title: "BTC 90-Day", apy: "7.50", coin: "BTC", dur: "90 days", tag: "Premium", tagCls: "bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/20", grad: "from-fuchsia-500/10 to-transparent", accent: "text-fuchsia-400", icon: <Gem className="h-5 w-5" /> },
            ].map((p, i) => (
              <Reveal key={p.title} direction="scale" delay={i * 60}>
                <Link href="/earn" className="group block h-full">
                  <Card className={`relative overflow-hidden p-5 h-full border-border/50 hover:border-primary/40 hover:-translate-y-1 hover:shadow-lg hover:shadow-primary/8 transition-all`}>
                    <div className={`absolute inset-0 bg-gradient-to-br ${p.grad} opacity-70 pointer-events-none`} />
                    <div className="relative">
                      <div className="flex items-start justify-between mb-3">
                        <div className={`h-10 w-10 rounded-xl bg-card/60 ${p.accent} flex items-center justify-center`}>{p.icon}</div>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${p.tagCls}`}>{p.tag}</span>
                      </div>
                      <div className="flex items-baseline gap-1.5 mb-1">
                        <span className={`text-2xl sm:text-3xl font-extrabold tabular-nums ${p.accent}`}>{p.apy}%</span>
                        <span className="text-xs text-muted-foreground">APY</span>
                        <span className="ml-auto text-xs font-semibold bg-muted/40 px-2 py-0.5 rounded-full">{p.coin}</span>
                      </div>
                      <div className="font-semibold text-sm mb-1">{p.title}</div>
                      <div className="flex items-center justify-between mt-3">
                        <span className="text-[11px] text-muted-foreground">{p.dur}</span>
                        <span className={`inline-flex items-center text-xs font-medium ${p.accent} group-hover:gap-1.5 gap-1 transition-all`}>
                          Subscribe <ArrowRight className="h-3 w-3" />
                        </span>
                      </div>
                    </div>
                  </Card>
                </Link>
              </Reveal>
            ))}
          </div>
          <Reveal className="mt-8 text-center">
            <Link href="/earn" className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline">
              View all earn plans <ArrowRight className="h-4 w-4" />
            </Link>
          </Reveal>
        </div>
      </section>

      {/* ─── HOW IT WORKS ────────────────────────────────────────────── */}
      <section className="w-full py-14 sm:py-16 bg-background">
        <div className="container mx-auto px-4">
          <Reveal className="text-center mb-10">
            <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight">Get started in minutes</h2>
            <p className="text-muted-foreground text-sm mt-2">Four simple steps to your first trade</p>
          </Reveal>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { step: "01", title: "Create Account", desc: "Sign up with email in under 60 seconds. No credit card needed.", icon: <Plus className="h-6 w-6" />, color: "from-amber-500 to-orange-500" },
              { step: "02", title: "Verify Identity", desc: "Complete KYC with PAN & Aadhaar to unlock full features.", icon: <Shield className="h-6 w-6" />, color: "from-violet-500 to-purple-500" },
              { step: "03", title: "Add Funds", desc: "Deposit INR via UPI/IMPS or crypto directly to your wallet.", icon: <Banknote className="h-6 w-6" />, color: "from-success to-emerald-600" },
              { step: "04", title: "Start Trading", desc: "Buy, sell, stake, or copy top traders — all in one place.", icon: <BarChart3 className="h-6 w-6" />, color: "from-sky-500 to-blue-500" },
            ].map((s, i) => (
              <Reveal key={s.step} direction="up" delay={i * 80}>
                <div className="relative">
                  {i < 3 && <div className="hidden lg:block absolute top-8 left-full w-full h-px bg-gradient-to-r from-border to-transparent z-0" />}
                  <div className="relative z-10 flex flex-col items-start gap-4 p-5 rounded-2xl border border-border/50 bg-card/60 hover:border-primary/30 hover:bg-card/80 transition-all h-full">
                    <div className={`h-14 w-14 rounded-2xl bg-gradient-to-br ${s.color} text-white flex items-center justify-center shadow-lg`}>
                      {s.icon}
                    </div>
                    <div>
                      <div className="text-[10px] font-mono text-muted-foreground mb-1">STEP {s.step}</div>
                      <h3 className="font-bold text-base mb-1.5">{s.title}</h3>
                      <p className="text-xs text-muted-foreground leading-relaxed">{s.desc}</p>
                    </div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
          {!user && (
            <Reveal className="mt-10 text-center">
              <Button size="lg" className="h-12 px-8 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white font-bold rounded-xl shadow-lg shadow-amber-900/20" asChild>
                <Link href="/signup">Create Free Account <ArrowRight className="ml-2 h-4 w-4" /></Link>
              </Button>
            </Reveal>
          )}
        </div>
      </section>

      {/* ─── REFERRAL BANNER ─────────────────────────────────────────── */}
      <section className="relative w-full py-14 sm:py-16 overflow-hidden border-y border-border/40">
        {/* Background — theme-aware */}
        <div className="absolute inset-0 bg-gradient-to-br from-amber-50 via-orange-50/40 to-background dark:from-amber-950/40 dark:via-background dark:to-emerald-950/20 pointer-events-none" />
        <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05] pointer-events-none"
          style={{ backgroundImage: "radial-gradient(circle at 1px 1px, rgba(245,158,11,0.9) 1px, transparent 0)", backgroundSize: "28px 28px" }} />
        <div className="absolute -top-20 left-1/3 h-72 w-72 rounded-full bg-amber-400/10 dark:bg-amber-500/8 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 right-1/4 h-48 w-48 rounded-full bg-emerald-400/8 dark:bg-emerald-500/6 blur-3xl pointer-events-none" />

        <div className="relative container mx-auto px-4">
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">

            {/* ── Left: Copy ── */}
            <Reveal className="space-y-5 text-center lg:text-left">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400 text-xs font-bold">
                <Gem className="h-3.5 w-3.5" />
                Invite &amp; Earn
              </div>

              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight leading-[1.15] text-foreground">
                Earn{" "}
                <span className="bg-gradient-to-r from-amber-500 to-orange-500 dark:from-amber-400 dark:to-orange-400 bg-clip-text text-transparent">
                  20% commission
                </span>{" "}
                on every trade your friends make
              </h2>

              <p className="text-muted-foreground text-sm sm:text-base max-w-lg mx-auto lg:mx-0 leading-relaxed">
                Share your referral link. Earn 20% of trading fees from every friend —{" "}
                <span className="font-semibold text-foreground">forever</span>, across 5 referral levels.
              </p>

              {/* Mini 3-step how-it-works */}
              <div className="flex flex-wrap gap-3 justify-center lg:justify-start items-center">
                {[
                  { n: "1", label: "Share your link" },
                  { n: "2", label: "Friend signs up" },
                  { n: "3", label: "You earn 20%" },
                ].map((step, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="h-6 w-6 rounded-full bg-amber-500/15 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 text-[11px] font-black flex items-center justify-center shrink-0">
                      {step.n}
                    </div>
                    <span className="text-xs font-semibold text-foreground">{step.label}</span>
                    {i < 2 && <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />}
                  </div>
                ))}
              </div>

              <Button
                size="lg"
                className="h-12 px-7 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white rounded-xl font-bold shadow-lg shadow-amber-500/20"
                asChild
              >
                <Link href={user ? "/referrals" : "/signup"}>
                  {user ? "View My Referrals" : "Get Referral Link"}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </Reveal>

            {/* ── Right: Stats + Level Chain ── */}
            <Reveal delay={100} className="space-y-4">
              {/* Stats cards */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Commission",     value: "20%",  sub: "of trading fees", color: "text-amber-600 dark:text-amber-400",   bg: "border-amber-500/25 bg-amber-500/8" },
                  { label: "Referral Levels",value: "5×",   sub: "deep chain",      color: "text-success",                         bg: "border-success/25 bg-success/8"     },
                  { label: "Avg. Monthly",   value: "₹8K+", sub: "per referral",    color: "text-violet-600 dark:text-violet-400",  bg: "border-violet-500/25 bg-violet-500/8"},
                ].map(s => (
                  <div key={s.label} className={`rounded-2xl border p-4 text-center ${s.bg}`}>
                    <div className={`text-2xl sm:text-3xl font-extrabold tabular-nums ${s.color}`}>{s.value}</div>
                    <div className="text-[11px] font-semibold mt-1 text-foreground">{s.label}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">{s.sub}</div>
                  </div>
                ))}
              </div>

              {/* Level chain card */}
              <div className="rounded-2xl border border-border/50 bg-card/70 dark:bg-card/40 backdrop-blur p-5">
                <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
                  <Layers className="h-3 w-3" /> Referral Level Rewards
                </div>
                <div className="space-y-2.5">
                  {[
                    { lvl: "Level 1", desc: "Direct referrals",  pct: "20%", bar: 100, color: "bg-amber-500"    },
                    { lvl: "Level 2", desc: "Friends of friends", pct: "10%", bar: 50,  color: "bg-amber-400"    },
                    { lvl: "Level 3", desc: "3rd degree",         pct: "5%",  bar: 25,  color: "bg-orange-400"   },
                    { lvl: "Level 4", desc: "4th degree",         pct: "3%",  bar: 15,  color: "bg-orange-300"   },
                    { lvl: "Level 5", desc: "5th degree",         pct: "2%",  bar: 10,  color: "bg-orange-200"   },
                  ].map(l => (
                    <div key={l.lvl} className="flex items-center gap-3">
                      <div className="w-14 shrink-0">
                        <div className="text-[11px] font-bold text-foreground">{l.lvl}</div>
                        <div className="text-[9px] text-muted-foreground">{l.desc}</div>
                      </div>
                      <div className="flex-1 h-1.5 bg-muted/60 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${l.color}`} style={{ width: `${l.bar}%` }} />
                      </div>
                      <div className="text-xs font-black text-amber-600 dark:text-amber-400 w-8 text-right shrink-0">{l.pct}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 pt-3 border-t border-border/40 text-[10px] text-muted-foreground">
                  Commission paid in the same currency as the trading fee — credited instantly per trade.
                </div>
              </div>
            </Reveal>

          </div>
        </div>
      </section>

      {/* ─── FAQ ──────────────────────────────────────────────────────── */}
      <section className="w-full py-14 sm:py-16 bg-card/20">
        <div className="container mx-auto px-4 max-w-3xl">
          <Reveal className="text-center mb-10">
            <Badge variant="outline" className="border-primary/30 text-primary mb-3">
              <HelpCircle className="h-3 w-3 mr-1.5" />Help Centre
            </Badge>
            <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight mb-2">Frequently asked questions</h2>
            <p className="text-muted-foreground text-sm">
              Everything you need to know. Can't find your answer?{" "}
              <Link href="/support" className="text-primary hover:underline underline-offset-2 font-semibold">Contact support →</Link>
            </p>
          </Reveal>
          <Reveal>
            <FaqAccordion />
          </Reveal>
          <Reveal className="text-center mt-8">
            <Button variant="outline" className="rounded-full px-6" asChild>
              <Link href="/faq">View all FAQs <ArrowRight className="ml-2 h-3.5 w-3.5" /></Link>
            </Button>
          </Reveal>
        </div>
      </section>

      {/* ─── FINAL CTA ───────────────────────────────────────────────── */}
      {!user && (
        <section className="relative w-full py-16 sm:py-20 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-amber-950/40 via-background to-violet-950/30 pointer-events-none" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_80%_at_50%_50%,rgba(245,158,11,0.08),transparent)] pointer-events-none" />
          <div className="absolute -top-20 left-1/4 h-64 w-64 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />
          <div className="relative container mx-auto px-4 text-center space-y-6">
            <Badge variant="outline" className="border-primary/30 text-primary">
              <Rocket className="h-3 w-3 mr-1.5" />Start for free
            </Badge>
            <h2 className="text-2xl sm:text-3xl lg:text-5xl font-black tracking-tight leading-tight max-w-2xl mx-auto">
              Ready to trade like a <span className="bg-gradient-to-r from-amber-400 to-orange-400 bg-clip-text text-transparent">professional?</span>
            </h2>
            <p className="text-muted-foreground max-w-lg mx-auto text-sm sm:text-base">
              Join 2,10,000+ traders on Zebvix. Create your account in under 60 seconds — no credit card required.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4">
              <Button size="lg" className="h-12 sm:h-14 px-8 sm:px-10 text-base bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white font-bold rounded-xl shadow-xl shadow-amber-900/20" asChild>
                <Link href="/signup">Create Free Account <ArrowRight className="ml-2 h-5 w-5" /></Link>
              </Button>
              <Button size="lg" variant="outline" className="h-12 sm:h-14 px-8 rounded-xl text-base" asChild>
                <Link href="/markets">Explore Markets</Link>
              </Button>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground pt-2">
              <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-success" />Free to join</span>
              <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-success" />₹0 deposit fee</span>
              <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-success" />KYC in minutes</span>
              <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-success" />Cancel anytime</span>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AI Trading Section — premium terminal-style showcase
// ─────────────────────────────────────────────────────────────────────────────
function AiTradingSection() {
  const [activeSignal, setActiveSignal] = useState(0);
  const [scanPct, setScanPct] = useState(72);

  // Cycle through signal cards
  useEffect(() => {
    const id = setInterval(() => setActiveSignal(p => (p + 1) % 3), 3200);
    return () => clearInterval(id);
  }, []);

  // Animate scan bar
  useEffect(() => {
    const id = setInterval(() => setScanPct(p => p >= 98 ? 38 : p + 2), 120);
    return () => clearInterval(id);
  }, []);

  const signals = [
    { sym: "BTC", pair: "BTC/INR", action: "BUY",  conf: 81, color: "text-success", bg: "bg-success/10 border-success/25", dot: "bg-success",  momentum: "+4.2%", risk: "Low",  rsi: 62, macd: "Bullish", vol: "High"  },
    { sym: "ETH", pair: "ETH/INR", action: "HOLD", conf: 64, color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/25", dot: "bg-amber-400", momentum: "+0.8%", risk: "Med",  rsi: 54, macd: "Neutral", vol: "Med"   },
    { sym: "SOL", pair: "SOL/INR", action: "SELL", conf: 77, color: "text-destructive", bg: "bg-destructive/10 border-destructive/25", dot: "bg-destructive", momentum: "-3.1%", risk: "High", rsi: 74, macd: "Bearish", vol: "High"  },
  ];
  const s = signals[activeSignal];

  const scanRows = [
    { sym: "BTC/INR", signal: "BUY",  conf: 81, color: "text-success",     badge: "bg-success/15 text-success border-success/30" },
    { sym: "ETH/INR", signal: "HOLD", conf: 64, color: "text-amber-400",   badge: "bg-amber-500/10 text-amber-400 border-amber-500/30" },
    { sym: "SOL/INR", signal: "BUY",  conf: 71, color: "text-success",     badge: "bg-success/15 text-success border-success/30" },
    { sym: "XRP/INR", signal: "SELL", conf: 68, color: "text-destructive", badge: "bg-destructive/10 text-destructive border-destructive/30" },
    { sym: "BNB/INR", signal: "HOLD", conf: 55, color: "text-amber-400",   badge: "bg-amber-500/10 text-amber-400 border-amber-500/30" },
  ];

  return (
    <section className="relative w-full py-16 sm:py-20 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-100 via-background to-violet-50 dark:from-[#0d0d1a] dark:via-background dark:to-[#0d0a1a]" />
      <div className="absolute inset-0 opacity-[0.04] dark:opacity-[0.06] pointer-events-none"
        style={{ backgroundImage: "radial-gradient(circle at 1px 1px, rgba(139,92,246,0.8) 1px, transparent 0)", backgroundSize: "32px 32px" }} />
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-violet-500/30 to-transparent" />
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-violet-500/30 to-transparent" />
      {/* Orbs */}
      <div className="absolute -top-24 right-1/4 h-80 w-80 rounded-full bg-violet-600/8 dark:bg-violet-600/12 blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-1/4 h-64 w-64 rounded-full bg-amber-500/6 dark:bg-amber-500/8 blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 right-0 h-48 w-48 rounded-full bg-fuchsia-600/8 dark:bg-fuchsia-600/10 blur-3xl pointer-events-none" />

      <div className="relative container mx-auto px-4 grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">

        {/* ── LEFT: COPY ─────────────────────────────────────────── */}
        <Reveal className="space-y-6">
          {/* Badge */}
          <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full border border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-200 text-xs font-bold">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-violet-400 animate-ping opacity-60" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-violet-400" />
            </span>
            AI-Powered Trading Engine
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
          </div>

          {/* Headline */}
          <div className="space-y-2">
            <h2 className="text-2xl sm:text-4xl lg:text-5xl font-black tracking-tight leading-[1.1] text-foreground">
              Let AI do the<br />
              market analysis
            </h2>
            <h2 className="text-2xl sm:text-4xl lg:text-5xl font-black tracking-tight leading-[1.1]">
              <span className="bg-gradient-to-r from-violet-600 via-fuchsia-500 to-amber-500 dark:from-violet-400 dark:via-fuchsia-400 dark:to-amber-400 bg-clip-text text-transparent">
                while you stay ahead
              </span>
            </h2>
          </div>

          <p className="text-muted-foreground leading-relaxed text-sm sm:text-base max-w-lg">
            Zebvix AI scans live momentum, volume spikes, RSI divergence &amp; support/resistance in real-time
            across every market — then fires a BUY / SELL / HOLD signal with a confidence score directly
            inside your trade terminal. One tap to apply.
          </p>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { value: "12,400+", label: "Signals today",   color: "text-violet-600 dark:text-violet-300" },
              { value: "78%",     label: "Avg. win rate",   color: "text-amber-500 dark:text-amber-400"   },
              { value: "23",      label: "Markets scanned", color: "text-fuchsia-600 dark:text-fuchsia-400" },
            ].map(st => (
              <div key={st.label} className="rounded-2xl border border-border/60 bg-background/60 dark:bg-white/4 dark:border-white/8 backdrop-blur p-4 text-center">
                <div className={`text-xl sm:text-2xl font-black tabular-nums ${st.color}`}>{st.value}</div>
                <div className="text-[10px] text-muted-foreground mt-1 leading-tight">{st.label}</div>
              </div>
            ))}
          </div>

          {/* Feature list */}
          <div className="space-y-2.5">
            {[
              { icon: <Brain className="h-4 w-4" />,     title: "Multi-factor analysis",  desc: "RSI, MACD, volume, momentum & range position fused into one signal." },
              { icon: <Zap className="h-4 w-4" />,       title: "One-tap auto-execution", desc: "Signal applied to your order form instantly — you control the final trigger." },
              { icon: <Shield className="h-4 w-4" />,    title: "Built-in risk controls", desc: "Each signal comes with a risk rating and suggested stop-loss levels." },
              { icon: <BarChart3 className="h-4 w-4" />, title: "Live PnL tracking",      desc: "Track AI suggestion performance in your portfolio dashboard." },
            ].map(f => (
              <div key={f.title} className="flex items-start gap-3 p-3 rounded-xl border border-border/50 bg-background/50 dark:bg-white/3 dark:border-white/6 hover:bg-muted/40 dark:hover:bg-white/6 transition-colors">
                <div className="h-8 w-8 rounded-lg bg-violet-500/15 dark:bg-violet-500/20 text-violet-600 dark:text-violet-300 flex items-center justify-center shrink-0 mt-0.5">{f.icon}</div>
                <div>
                  <div className="text-sm font-semibold text-foreground">{f.title}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{f.desc}</div>
                </div>
              </div>
            ))}
          </div>

          {/* CTAs */}
          <div className="flex flex-wrap gap-3 pt-1">
            <Button size="lg" className="h-12 px-6 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white font-bold rounded-xl shadow-xl shadow-violet-500/25" asChild>
              <Link href="/trade/BTC_INR">Try AI on BTC <ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
            <Button size="lg" variant="outline" className="h-12 px-6 border-violet-500/40 text-violet-600 dark:text-violet-300 hover:bg-violet-500/10 rounded-xl" asChild>
              <Link href="/ai-trading">View AI Plans</Link>
            </Button>
          </div>
        </Reveal>

        {/* ── RIGHT: TERMINAL MOCKUP ──────────────────────────── */}
        <Reveal delay={120} className="flex justify-center lg:justify-end">
          <div className="relative w-full max-w-md">
            {/* Glow halo */}
            <div className="absolute -inset-4 bg-gradient-to-br from-violet-500/20 via-fuchsia-500/10 to-amber-500/10 rounded-3xl blur-3xl pointer-events-none" />

            {/* Terminal card */}
            <div className="relative rounded-2xl border border-violet-500/25 bg-white dark:bg-zinc-950/95 shadow-2xl overflow-hidden backdrop-blur">

              {/* Terminal header bar */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border/60 dark:border-white/8 bg-muted/30 dark:bg-white/3">
                <div className="flex items-center gap-3">
                  <div className="flex gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-red-500/70" />
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-500/70" />
                    <span className="h-2.5 w-2.5 rounded-full bg-green-500/70" />
                  </div>
                  <div className="flex items-center gap-2 ml-2">
                    <Brain className="h-4 w-4 text-violet-500" />
                    <span className="text-xs font-bold text-foreground font-mono">Zebvix AI Engine</span>
                    <span className="h-1.5 w-1.5 rounded-full bg-violet-500 animate-pulse" />
                  </div>
                </div>
                <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground">
                  <span className="text-violet-500 animate-pulse">●</span> LIVE SCANNING
                </div>
              </div>

              {/* Scanner progress */}
              <div className="px-4 py-2.5 border-b border-border/40 dark:border-white/5 bg-muted/20 dark:bg-black/20">
                <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground mb-1.5">
                  <span>Market scan in progress — {scanRows.length} pairs</span>
                  <span className="text-violet-500">{scanPct}%</span>
                </div>
                <div className="h-1 bg-muted dark:bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-all duration-150"
                    style={{ width: `${scanPct}%` }} />
                </div>
              </div>

              {/* Scan rows — mini signal list */}
              <div className="border-b border-border/40 dark:border-white/5">
                {scanRows.map((row, i) => (
                  <div key={row.sym}
                    className={`flex items-center justify-between px-4 py-2 border-b border-border/30 dark:border-white/4 last:border-0 transition-colors ${i === activeSignal ? "bg-violet-500/8" : ""}`}>
                    <div className="flex items-center gap-2.5">
                      <span className={`h-1.5 w-1.5 rounded-full ${row.conf > 70 ? "animate-pulse" : ""} ${i === activeSignal ? "bg-violet-500" : "bg-muted-foreground/40"}`} />
                      <span className="text-xs font-mono font-semibold text-foreground">{row.sym}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="hidden sm:flex items-center gap-1.5">
                        <div className="w-16 h-1 bg-muted dark:bg-white/8 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${row.color === "text-success" ? "bg-success" : row.color === "text-destructive" ? "bg-destructive" : "bg-amber-400"}`}
                            style={{ width: `${row.conf}%` }} />
                        </div>
                        <span className="text-[10px] font-mono text-muted-foreground">{row.conf}%</span>
                      </div>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black border ${row.badge}`}>
                        {row.signal}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Active signal — detailed card */}
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${s.dot} animate-pulse`} />
                    <span className="text-xs font-bold text-foreground font-mono">Active Signal — {s.pair}</span>
                  </div>
                  <span className="text-[9px] font-mono text-muted-foreground">Updated just now</span>
                </div>

                {/* Signal + confidence */}
                <div className={`rounded-xl border ${s.bg} p-4`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex flex-col">
                      <span className="text-[10px] text-muted-foreground font-mono mb-1">AI RECOMMENDATION</span>
                      <div className="flex items-center gap-2">
                        {s.action === "BUY" ? <TrendingUp className={`h-6 w-6 ${s.color}`} /> :
                         s.action === "SELL" ? <TrendingDown className={`h-6 w-6 ${s.color}`} /> :
                         <Activity className={`h-6 w-6 ${s.color}`} />}
                        <span className={`text-3xl font-black ${s.color}`}>{s.action}</span>
                      </div>
                      <span className="text-[11px] text-muted-foreground mt-1">{s.pair} · Momentum {s.momentum}</span>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[10px] text-muted-foreground mb-1">CONFIDENCE</div>
                      <div className={`text-2xl font-black tabular-nums ${s.color}`}>{s.conf}%</div>
                      <div className="mt-1 w-16 h-1.5 bg-muted dark:bg-white/8 rounded-full overflow-hidden ml-auto">
                        <div className={`h-full rounded-full transition-all duration-700 ${s.action === "BUY" ? "bg-success" : s.action === "SELL" ? "bg-destructive" : "bg-amber-400"}`}
                          style={{ width: `${s.conf}%` }} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Technical indicators */}
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: "RSI", value: String(s.rsi), sub: s.rsi > 70 ? "Overbought" : s.rsi < 30 ? "Oversold" : "Neutral", color: s.rsi > 65 ? "text-amber-500 dark:text-amber-400" : "text-success" },
                    { label: "MACD", value: s.macd, sub: "Signal line", color: s.macd === "Bullish" ? "text-success" : s.macd === "Bearish" ? "text-destructive" : "text-amber-500 dark:text-amber-400" },
                    { label: "Volume", value: s.vol, sub: "vs avg", color: s.vol === "High" ? "text-violet-600 dark:text-violet-400" : "text-muted-foreground" },
                  ].map(ind => (
                    <div key={ind.label} className="rounded-lg bg-muted/50 dark:bg-white/4 border border-border/50 dark:border-white/6 p-2.5 text-center">
                      <div className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">{ind.label}</div>
                      <div className={`text-sm font-black mt-1 ${ind.color}`}>{ind.value}</div>
                      <div className="text-[9px] text-muted-foreground mt-0.5">{ind.sub}</div>
                    </div>
                  ))}
                </div>

                {/* Signal reasons */}
                <div className="space-y-1.5">
                  {[
                    s.action === "BUY"  ? "Strong upward momentum detected" : s.action === "SELL" ? "Bearish divergence on 4h chart" : "Mixed signals — sideways range",
                    s.action === "BUY"  ? "Price approaching key support zone" : s.action === "SELL" ? "RSI overbought — correction likely" : "Volume declining — wait for breakout",
                    "Above-average trading volume confirming",
                  ].map((r, i) => (
                    <div key={i} className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <CircleCheck className="h-3.5 w-3.5 text-violet-500 shrink-0" />{r}
                    </div>
                  ))}
                </div>

                {/* Apply button */}
                <Button className={`w-full h-10 font-bold rounded-xl text-sm text-white ${
                  s.action === "BUY"  ? "bg-gradient-to-r from-success to-emerald-600 hover:from-emerald-500 hover:to-emerald-600" :
                  s.action === "SELL" ? "bg-gradient-to-r from-destructive to-rose-600 hover:from-rose-500 hover:to-rose-600" :
                  "bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500"
                }`} asChild>
                  <Link href="/trade/BTC_INR">
                    <Zap className="h-4 w-4 mr-1.5" />
                    Apply {s.action} Signal to Order Form
                  </Link>
                </Button>

                {/* Disclaimer */}
                <p className="text-[9px] text-muted-foreground/60 text-center leading-tight">
                  AI signals are suggestions only. Past performance ≠ future results. Trade at your own risk.
                </p>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FAQ Accordion — with live fee data
// ─────────────────────────────────────────────────────────────────────────────
interface FaqVipTier {
  level: number; name: string;
  spotMaker: number; spotTaker: number;
  futuresMaker: number; futuresTaker: number;
}

interface FaqItem {
  icon: React.ReactNode;
  iconBg: string;
  category: string;
  q: string;
  a: string;
  liveFeesNode?: boolean;
  link?: { label: string; href: string };
}

const FAQ_ITEMS: FaqItem[] = [
  {
    icon: <ReceiptText className="h-4 w-4" />,
    iconBg: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    category: "Fees",
    q: "What are the trading fees?",
    a: "Spot trading uses a maker-taker model. Fees below are for Regular users (VIP 0) — pulled live from our system. Higher VIP tiers unlock lower rates based on your 30-day volume.",
    liveFeesNode: true,
    link: { label: "View full fee schedule →", href: "/fees" },
  },
  {
    icon: <Banknote className="h-4 w-4" />,
    iconBg: "bg-success/15 text-success",
    category: "Deposits",
    q: "How do I deposit INR?",
    a: "Deposit INR via UPI, IMPS, NEFT or RTGS. After adding a verified bank account, go to Wallet → Deposit INR, choose your gateway, and follow the steps. UPI credits are typically instant.",
    link: { label: "Go to Wallet →", href: "/wallet" },
  },
  {
    icon: <UserCheck className="h-4 w-4" />,
    iconBg: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
    category: "KYC",
    q: "How long does KYC take?",
    a: "Level 1 (PAN verification) is instant. Level 2 (Aadhaar + selfie) is reviewed within 24 hours. After Level 2 you can deposit, trade, and withdraw without restrictions.",
    link: { label: "Start KYC →", href: "/kyc" },
  },
  {
    icon: <Shield className="h-4 w-4" />,
    iconBg: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
    category: "Security",
    q: "Is my crypto safe on Zebvix?",
    a: "Security is our top priority. 95% of assets are in cold wallets (HSM-protected vaults). Every account has 2FA, biometric login, and OTP for withdrawals. Regular third-party security audits are conducted.",
  },
  {
    icon: <Brain className="h-4 w-4" />,
    iconBg: "bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-400",
    category: "AI Trading",
    q: "What is AI Trading on Zebvix?",
    a: "Zebvix AI analyses real-time market data — price momentum, volume patterns, RSI divergence & support/resistance — to generate BUY/SELL/HOLD signals with a confidence score. Apply them to your order form in one tap.",
    link: { label: "Explore AI Trading →", href: "/ai-trading" },
  },
  {
    icon: <CircleCheck className="h-4 w-4" />,
    iconBg: "bg-teal-500/15 text-teal-600 dark:text-teal-400",
    category: "Compliance",
    q: "Is Zebvix regulated and legal in India?",
    a: "Yes. Zebvix operates under India's PMLA 2002 framework and is registered with FIU-IND. All INR transactions are TDS-compliant under Section 194S of the Income Tax Act.",
  },
  {
    icon: <Users className="h-4 w-4" />,
    iconBg: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
    category: "P2P",
    q: "How does P2P trading work?",
    a: "P2P lets you buy or sell crypto directly with other users using INR. An escrow system locks the seller's crypto until the buyer confirms payment. Disputes are handled by Zebvix support within 24 hours.",
    link: { label: "Try P2P →", href: "/p2p" },
  },
];

function LiveFeeTable({ tier }: { tier: FaqVipTier }) {
  return (
    <div className="mt-3 rounded-xl border border-border/60 overflow-hidden text-xs">
      <div className="grid grid-cols-4 text-center divide-x divide-border/50">
        {[
          { label: "Spot Maker", value: `${tier.spotMaker}%`, color: "text-success" },
          { label: "Spot Taker", value: `${tier.spotTaker}%`, color: "text-amber-500 dark:text-amber-400" },
          { label: "Futures Maker", value: `${tier.futuresMaker}%`, color: "text-violet-600 dark:text-violet-400" },
          { label: "Futures Taker", value: `${tier.futuresTaker}%`, color: "text-fuchsia-600 dark:text-fuchsia-400" },
        ].map(col => (
          <div key={col.label} className="p-3 bg-muted/40">
            <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-1.5">{col.label}</div>
            <div className={`text-base font-black tabular-nums ${col.color}`}>{col.value}</div>
          </div>
        ))}
      </div>
      <div className="px-4 py-2 bg-muted/20 border-t border-border/50 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="text-amber-500">⚠</span> +18% GST on trading fee</span>
        <span className="flex items-center gap-1"><span className="text-blue-500">ⓘ</span> 1% TDS on INR sell proceeds</span>
        <span className="flex items-center gap-1"><span className="text-success">↑</span> Higher VIP tier → lower rates</span>
      </div>
    </div>
  );
}

function FaqAccordion() {
  const [open, setOpen] = useState<number | null>(0);

  const { data: tiers } = useQuery<FaqVipTier[]>({
    queryKey: ["fees-tiers-faq"],
    queryFn: () => get("/api/fees/tiers"),
    staleTime: 60_000,
  });
  const regularTier = tiers?.[0];

  return (
    <div className="space-y-2.5">
      {FAQ_ITEMS.map((item, i) => {
        const isOpen = open === i;
        return (
          <div
            key={i}
            className={`rounded-2xl border overflow-hidden transition-colors duration-200 ${
              isOpen
                ? "border-primary/30 bg-primary/[0.03] dark:bg-primary/[0.05]"
                : "border-border/50 bg-card/60 hover:border-border/80"
            }`}
          >
            <button
              onClick={() => setOpen(isOpen ? null : i)}
              className="w-full flex items-center gap-3.5 px-5 py-4 text-left"
            >
              <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${item.iconBg}`}>
                {item.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-0.5">{item.category}</div>
                <div className="font-semibold text-sm leading-snug text-foreground">{item.q}</div>
              </div>
              <ChevronDown
                className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`}
              />
            </button>

            {/* Smooth grid-rows height animation */}
            <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
              <div className="overflow-hidden">
                <div className="px-5 pb-5 pt-0 border-t border-border/30">
                  <div className="pt-3 ml-[3.375rem]">
                    <p className="text-sm text-muted-foreground leading-relaxed">{item.a}</p>
                    {item.liveFeesNode && regularTier && <LiveFeeTable tier={regularTier} />}
                    {item.liveFeesNode && !regularTier && (
                      <div className="mt-3 h-16 rounded-xl bg-muted/40 animate-pulse" />
                    )}
                    {item.link && (
                      <Link
                        href={item.link.href}
                        className="inline-flex items-center gap-1 mt-3 text-xs font-semibold text-primary hover:underline underline-offset-2"
                      >
                        {item.link.label} <ArrowRight className="h-3 w-3" />
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
