import { useState, useMemo, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearch } from "wouter";
import { get } from "@/lib/api";
import {
  Search,
  Star,
  Flame,
  TrendingUp,
  TrendingDown,
  ArrowUpDown,
  Sparkles,
  ChevronRight,
  ChevronLeft,
  ChevronsLeft,
  ChevronsRight,
  BarChart3,
  Activity,
  Coins,
  Trophy,
  IndianRupee,
} from "lucide-react";
import { useTickers, useInrRate, encodeSymbol, type NormalizedTicker } from "@/lib/marketSocket";
import { useMarketCatalog } from "@/lib/marketCatalog";
import { buildUsdRates, quoteVolUsd } from "@/lib/volumeUsd";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// ──────────────────────────────────────────────────────────────────
// Coin logos hook — fetches /api/coins once, builds symbol → logoUrl
// ──────────────────────────────────────────────────────────────────
function useCoinLogos(): Map<string, string | null> {
  const { data } = useQuery<any[]>({
    queryKey: ["public-coins-logos"],
    queryFn: () => get("/coins"),
    staleTime: 300_000,
    refetchOnWindowFocus: false,
  });
  return useMemo(() => {
    const map = new Map<string, string | null>();
    if (Array.isArray(data)) {
      for (const c of data) {
        if (c?.symbol) map.set(String(c.symbol), c.logoUrl ?? null);
      }
    }
    return map;
  }, [data]);
}

// ──────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────
function isInr(sym: string) {
  return sym.endsWith("/INR") || sym.endsWith("INR");
}
function baseAsset(sym: string) {
  return sym.split("/")[0] || sym;
}
function quoteAsset(sym: string) {
  return sym.split("/")[1] || "";
}
function currencyPrefix(sym: string): string {
  if (isInr(sym)) return "₹";
  return "";
}
function fmtPrice(n: number, sym: string): string {
  if (!isFinite(n) || n === 0) return "—";
  const inr = isInr(sym);
  const digits = inr ? 2 : n < 1 ? 6 : n < 100 ? 4 : 2;
  const q = sym.split("/")[1] ?? "";
  const suffix = !inr && q ? ` ${q}` : "";
  return currencyPrefix(sym) + n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits }) + suffix;
}
function fmtCompact(n: number, prefix = "") {
  if (!isFinite(n) || n === 0) return prefix + "0";
  const abs = Math.abs(n);
  if (abs >= 1e9) return prefix + (n / 1e9).toFixed(2) + "B";
  if (abs >= 1e6) return prefix + (n / 1e6).toFixed(2) + "M";
  if (abs >= 1e3) return prefix + (n / 1e3).toFixed(2) + "K";
  return prefix + n.toFixed(2);
}
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}
// Deterministic synthetic sparkline points (0..1 normalized)
function synthSpark(symbol: string, pct: number, n = 24): number[] {
  const h = hash(symbol);
  const arr: number[] = [];
  let v = 0.5;
  for (let i = 0; i < n; i++) {
    const noise = (((h >>> (i % 24)) & 0xff) / 255 - 0.5) * 0.18;
    const drift = (pct / 100) * (i / (n - 1)) * 0.6;
    v = Math.max(0.05, Math.min(0.95, 0.5 + drift + noise));
    arr.push(v);
  }
  // Anchor end based on pct sign
  if (pct >= 0) arr[n - 1] = Math.max(arr[n - 1], 0.55);
  else arr[n - 1] = Math.min(arr[n - 1], 0.45);
  return arr;
}

// ──────────────────────────────────────────────────────────────────
// Asset icon — tries DB logoUrl → CDN → gradient letter fallback
// ──────────────────────────────────────────────────────────────────
const CDN_BASE = "https://cdn.jsdelivr.net/gh/atomiclabs/cryptocurrency-icons@1a63530be6e374711a8554f31b17e4cb92c25fa/svg/color";

function AssetIcon({ symbol, size = 8, logoUrl }: { symbol: string; size?: 6 | 7 | 8 | 10; logoUrl?: string | null }) {
  const b = baseAsset(symbol);
  const letter = b.slice(0, 1);
  const palette = [
    "from-amber-500 to-orange-600",
    "from-sky-500 to-blue-600",
    "from-violet-500 to-purple-600",
    "from-emerald-500 to-teal-600",
    "from-rose-500 to-pink-600",
    "from-fuchsia-500 to-indigo-600",
    "from-yellow-500 to-amber-600",
    "from-cyan-500 to-sky-600",
  ];
  const grad = palette[hash(b) % palette.length];
  const dim =
    size === 6 ? "h-6 w-6 text-[10px]" :
    size === 7 ? "h-7 w-7 text-[11px]" :
    size === 10 ? "h-10 w-10 text-sm" :
    "h-8 w-8 text-xs";

  // Stage: "db" → try logoUrl, "cdn" → try CDN, "letter" → show gradient
  const [stage, setStage] = useState<"db" | "cdn" | "letter">(() =>
    logoUrl ? "db" : "cdn"
  );

  // Reset when logoUrl prop changes (e.g. after coins data loads)
  useEffect(() => {
    setStage(logoUrl ? "db" : "cdn");
  }, [logoUrl]);

  const cdnUrl = `${CDN_BASE}/${b.toLowerCase()}.svg`;
  const imgSrc = stage === "db" ? logoUrl! : cdnUrl;

  if (stage === "letter") {
    return (
      <div className={`${dim} rounded-full bg-gradient-to-br ${grad} text-white flex items-center justify-center font-bold shadow-md flex-shrink-0`}>
        {letter}
      </div>
    );
  }

  return (
    <div className={`${dim} rounded-full flex-shrink-0 overflow-hidden bg-black/20 flex items-center justify-center`}>
      <img
        src={imgSrc}
        alt={b}
        className="h-full w-full object-contain"
        onError={() => {
          if (stage === "db") setStage("cdn");
          else setStage("letter");
        }}
      />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Mini sparkline (deterministic SVG)
// ──────────────────────────────────────────────────────────────────
function MiniSpark({ symbol, pct, w = 80, h = 28 }: { symbol: string; pct: number; w?: number; h?: number }) {
  const points = useMemo(() => synthSpark(symbol, pct), [symbol, pct]);
  const positive = pct >= 0;
  const stroke = positive ? "hsl(var(--success))" : "hsl(var(--destructive))";
  const stepX = w / (points.length - 1);
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${(i * stepX).toFixed(2)},${(h - p * h).toFixed(2)}`).join(" ");
  const fillId = `ms-${symbol.replace(/[^a-z0-9]/gi, "")}-${positive ? "p" : "n"}`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible block">
      <defs>
        <linearGradient id={fillId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.35" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${path} L${w},${h} L0,${h} Z`} fill={`url(#${fillId})`} />
      <path d={path} stroke={stroke} strokeWidth="1.5" fill="none" />
    </svg>
  );
}

// ──────────────────────────────────────────────────────────────────
// Favorites (localStorage)
// ──────────────────────────────────────────────────────────────────
const FAV_KEY = "zebvix:favorites";

function useFavorites() {
  const [favs, setFavs] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(FAV_KEY);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) setFavs(new Set(arr.filter((x) => typeof x === "string")));
      }
    } catch { /* ignore */ }
  }, []);
  const toggle = useCallback((sym: string) => {
    setFavs((prev) => {
      const next = new Set(prev);
      if (next.has(sym)) next.delete(sym);
      else next.add(sym);
      try { window.localStorage.setItem(FAV_KEY, JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  }, []);
  return { favs, toggle };
}

// ──────────────────────────────────────────────────────────────────
// Categories & filters
// ──────────────────────────────────────────────────────────────────
type Category = "all" | "favorites" | "hot" | "gainers" | "losers" | "new";
type SortKey = "volume" | "change" | "price" | "name";

const CATEGORIES: { id: Category; label: string; icon: typeof Star }[] = [
  { id: "all", label: "All", icon: BarChart3 },
  { id: "favorites", label: "Favorites", icon: Star },
  { id: "hot", label: "Hot", icon: Flame },
  { id: "gainers", label: "Gainers", icon: TrendingUp },
  { id: "losers", label: "Losers", icon: TrendingDown },
  { id: "new", label: "New", icon: Sparkles },
];

const SORT_OPTIONS: { id: SortKey; label: string }[] = [
  { id: "volume", label: "24h Volume" },
  { id: "change", label: "24h Change" },
  { id: "price", label: "Last Price" },
  { id: "name", label: "Name (A–Z)" },
];

const QUOTE_FILTERS = ["ALL", "INR", "USDT", "BTC", "ZBX"] as const;
type Quote = (typeof QUOTE_FILTERS)[number];

// Hardcoded "new listings" — anything matching these bases is tagged NEW
const NEW_BASES = new Set(["ZBX"]);

// ──────────────────────────────────────────────────────────────────
// Component: Top movers card (one of: gainers, losers, volume)
// ──────────────────────────────────────────────────────────────────
function MoverCard({
  title,
  icon,
  tone,
  items,
  coinLogos,
}: {
  title: string;
  icon: React.ReactNode;
  tone: "emerald" | "rose" | "amber";
  items: NormalizedTicker[];
  coinLogos: Map<string, string | null>;
}) {
  const toneClass =
    tone === "emerald" ? "from-emerald-500/15 to-emerald-500/0 text-emerald-400 border-emerald-500/25"
    : tone === "rose" ? "from-rose-500/15 to-rose-500/0 text-rose-400 border-rose-500/25"
    : "from-amber-500/15 to-amber-500/0 text-amber-400 border-amber-500/25";
  return (
    <div className={`rounded-xl border bg-gradient-to-br ${toneClass} p-4`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-sm font-bold">
          {icon}
          <span className="uppercase tracking-wider text-xs">{title}</span>
        </div>
        <Link href="/markets" className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center">
          View all <ChevronRight className="h-3 w-3" />
        </Link>
      </div>
      <ul className="space-y-2.5">
        {items.length === 0 && (
          <li className="text-xs text-muted-foreground py-4 text-center">Loading…</li>
        )}
        {items.slice(0, 3).map((t) => {
          const positive = t.priceChangePercent >= 0;
          const base = baseAsset(t.symbol);
          return (
            <li key={t.symbol}>
              <Link
                href={`/trade/${encodeSymbol(t.symbol)}`}
                className="flex items-center gap-2 hover:bg-card/40 rounded-md p-1 -m-1 transition-colors"
              >
                <AssetIcon symbol={t.symbol} size={7} logoUrl={coinLogos.get(base)} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold">{base}</div>
                  <div className="text-[10px] text-muted-foreground line-clamp-1">{t.symbol}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-mono">{fmtPrice(t.lastPrice, t.symbol)}</div>
                  <div className={`text-[11px] font-bold ${positive ? "text-success" : "text-destructive"}`}>
                    {positive ? "+" : ""}
                    {t.priceChangePercent.toFixed(2)}%
                  </div>
                </div>
                <MiniSpark symbol={t.symbol} pct={t.priceChangePercent} w={48} h={20} />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Main Markets page
// ──────────────────────────────────────────────────────────────────
export default function Markets() {
  const tickers = useTickers();
  const inrRate = useInrRate();
  const { favs, toggle: toggleFav } = useFavorites();
  const coinLogos = useCoinLogos();

  // Read initial filters from URL query params (?category=gainers, ?quote=INR)
  // so deep-links from the header Markets dropdown land on the right view.
  const initialFilters = useMemo(() => {
    if (typeof window === "undefined") return { category: "all" as Category, quote: "ALL" as Quote };
    const params = new URLSearchParams(window.location.search);
    const rawCat = params.get("category");
    const rawQuote = params.get("quote");
    const validCats: Category[] = ["all", "favorites", "hot", "gainers", "losers", "new"];
    const cat = validCats.includes(rawCat as Category) ? (rawCat as Category) : "all";
    const quoteVal = (QUOTE_FILTERS as readonly string[]).includes(rawQuote ?? "")
      ? (rawQuote as Quote)
      : "ALL";
    return { category: cat, quote: quoteVal };
  }, []);

  const [search, setSearch] = useState("");
  const [quote, setQuote] = useState<Quote>(initialFilters.quote);
  const [category, setCategory] = useState<Category>(initialFilters.category);
  const [sortKey, setSortKey] = useState<SortKey>("volume");
  const [sortDesc, setSortDesc] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Re-apply filters when URL query string changes (e.g. user clicks
  // another item in the header Markets dropdown while already on /markets,
  // or navigates back to plain /markets which should reset to defaults).
  const search$ = useSearch();
  useEffect(() => {
    const params = new URLSearchParams(search$);
    const rawCat = params.get("category");
    const rawQuote = params.get("quote");
    const validCats: Category[] = ["all", "favorites", "hot", "gainers", "losers", "new"];
    setCategory(rawCat && validCats.includes(rawCat as Category) ? (rawCat as Category) : "all");
    setQuote(
      rawQuote && (QUOTE_FILTERS as readonly string[]).includes(rawQuote)
        ? (rawQuote as Quote)
        : "ALL",
    );
  }, [search$]);

  // Only show pairs the admin has actually enabled in the DB
  // (status='active' AND tradingEnabled or futuresEnabled). Without
  // this we'd display every spot ticker the WS feed knows about.
  const { all: enabledSet } = useMarketCatalog();
  const all = useMemo(
    () => Object.values(tickers).filter((t) => enabledSet.has(t.symbol)),
    [tickers, enabledSet],
  );

  // USD rates derived from the live tickers — used everywhere we need
  // to sort or sum volume across mixed quote currencies (INR / USDT /
  // BTC etc.). Without this, raw `quoteVolume` numbers can't be
  // compared because a BTC/INR pair's lakhs of rupees dominate any
  // USDT-quoted pair's thousands of dollars.
  const usdRates = useMemo(() => buildUsdRates(all), [all]);
  const volUsd = (t: NormalizedTicker) => quoteVolUsd(t, usdRates);

  // Aggregate stats
  const stats = useMemo(() => {
    const total = all.length;
    const totalQuoteVol = all.reduce((s, t) => s + volUsd(t), 0);
    const gainers = all.filter((t) => t.priceChangePercent > 0).length;
    const losers = all.filter((t) => t.priceChangePercent < 0).length;
    const sentiment = total === 0 ? 50 : Math.round((gainers / total) * 100);
    return { total, totalQuoteVol, gainers, losers, sentiment };
  }, [all, usdRates]);

  // Top movers
  const topGainers = useMemo(
    () => [...all].filter((t) => t.priceChangePercent > 0).sort((a, b) => b.priceChangePercent - a.priceChangePercent).slice(0, 3),
    [all]
  );
  const topLosers = useMemo(
    () => [...all].filter((t) => t.priceChangePercent < 0).sort((a, b) => a.priceChangePercent - b.priceChangePercent).slice(0, 3),
    [all]
  );
  const topVolume = useMemo(
    () => [...all].sort((a, b) => volUsd(b) - volUsd(a)).slice(0, 3),
    [all, usdRates]
  );

  // Filtered + sorted main list
  const list = useMemo(() => {
    const trimmed = search.trim().toLowerCase();
    let arr = all.filter((t) => {
      if (trimmed && !t.symbol.toLowerCase().includes(trimmed)) return false;
      if (quote !== "ALL") {
        const q = quoteAsset(t.symbol).toUpperCase();
        if (q !== quote) return false;
      }
      switch (category) {
        case "favorites":
          if (!favs.has(t.symbol)) return false;
          break;
        case "hot":
          // Hot = top quartile by USD-normalised quote volume
          break;
        case "gainers":
          if (!(t.priceChangePercent > 0)) return false;
          break;
        case "losers":
          if (!(t.priceChangePercent < 0)) return false;
          break;
        case "new":
          if (!NEW_BASES.has(baseAsset(t.symbol).toUpperCase())) return false;
          break;
      }
      return true;
    });
    if (category === "hot") {
      arr = arr.sort((a, b) => volUsd(b) - volUsd(a)).slice(0, Math.max(20, Math.ceil(arr.length * 0.25)));
    }
    const dir = sortDesc ? -1 : 1;
    arr.sort((a, b) => {
      switch (sortKey) {
        case "volume": return dir * (volUsd(a) - volUsd(b));
        case "change": return dir * (a.priceChangePercent - b.priceChangePercent);
        case "price": return dir * (a.lastPrice - b.lastPrice);
        case "name": return dir * a.symbol.localeCompare(b.symbol) * -1;
      }
    });
    return arr;
  }, [all, search, quote, category, favs, sortKey, sortDesc]);

  const setSort = (k: SortKey) => {
    if (sortKey === k) setSortDesc((d) => !d);
    else { setSortKey(k); setSortDesc(true); }
  };

  // Reset to page 1 when any filter/sort changes
  useEffect(() => { setPage(1); }, [search, quote, category, sortKey, sortDesc, pageSize]);

  const paged = useMemo(
    () => list.slice((page - 1) * pageSize, page * pageSize),
    [list, page, pageSize],
  );

  const totalPages = Math.max(1, Math.ceil(list.length / pageSize));

  const loading = all.length === 0;

  return (
    <div className="min-h-screen w-full bg-background">
      {/* ── Hero / Stats banner ───────────────────────────────── */}
      <section className="relative border-b border-border overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-amber-950/15" />
        <div className="absolute -top-32 -right-32 h-72 w-72 rounded-full bg-amber-500/10 blur-3xl" />
        <div className="absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-fuchsia-500/[0.05] blur-3xl" />

        <div className="relative container mx-auto px-4 py-6 sm:py-8">
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
            <div>
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full border border-success/30 bg-success/5 text-[11px] font-medium text-success mb-3">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-success animate-ping opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-success" />
                </span>
                Live
              </div>
              <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
                Markets
              </h1>
              <p className="text-sm text-muted-foreground mt-1.5 max-w-xl">
                Real-time spot markets across INR, USDT, BTC and ZBX pairs.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 lg:gap-4 lg:min-w-[44rem]">
              <StatTile
                icon={<Coins className="h-4 w-4" />}
                label="Pairs"
                value={loading ? "—" : stats.total.toString()}
              />
              <StatTile
                icon={<Activity className="h-4 w-4" />}
                label="24h Volume"
                value={loading ? "—" : fmtCompact(stats.totalQuoteVol, "₹")}
              />
              <StatTile
                icon={<TrendingUp className="h-4 w-4 text-success" />}
                label="Gainers"
                value={loading ? "—" : stats.gainers.toString()}
                tone="success"
              />
              <StatTile
                icon={<TrendingDown className="h-4 w-4 text-destructive" />}
                label="Losers"
                value={loading ? "—" : stats.losers.toString()}
                tone="destructive"
              />
              <StatTile
                icon={<IndianRupee className="h-4 w-4 text-amber-500" />}
                label="USDT / INR"
                value={inrRate > 0 ? `₹${inrRate.toFixed(2)}` : "—"}
              />
            </div>
          </div>

          {/* Sentiment bar */}
          {!loading && (
            <div className="mt-5">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1.5">
                <span>Market sentiment</span>
                <span className="font-semibold text-foreground">
                  {stats.sentiment >= 60 ? "Bullish" : stats.sentiment <= 40 ? "Bearish" : "Neutral"} · {stats.sentiment}% green
                </span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden bg-destructive/20 flex">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all"
                  style={{ width: `${stats.sentiment}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── Trading Leagues promo banner ───────────────────── */}
      <section className="container mx-auto px-4 pt-5 pb-0">
        <Link href="/leagues">
          <div className="relative overflow-hidden rounded-xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-orange-500/5 to-transparent hover:border-amber-500/50 transition-colors cursor-pointer">
            <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-amber-500/10 blur-2xl pointer-events-none" />
            <div className="relative flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4 gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-9 w-9 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center flex-shrink-0 shadow-lg shadow-amber-500/20">
                  <Trophy className="h-4 w-4 text-black" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold">Trading Leagues</span>
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-rose-500/15 text-rose-400 text-[10px] font-bold border border-rose-500/30">
                      <span className="h-1.5 w-1.5 rounded-full bg-rose-400 animate-pulse inline-block" />
                      LIVE NOW
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">Season 1 · June 2026 — Win a share of ₹20,00,000 prize pool</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="hidden sm:block text-xs font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-3 py-1.5 rounded-lg">
                  Join Now →
                </span>
                <ChevronRight className="h-4 w-4 text-amber-400 sm:hidden" />
              </div>
            </div>
          </div>
        </Link>
      </section>

      {/* ── Top movers strip ───────────────────────────────── */}
      <section className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
          <MoverCard
            title="Top Gainers"
            icon={<TrendingUp className="h-4 w-4" />}
            tone="emerald"
            items={topGainers}
            coinLogos={coinLogos}
          />
          <MoverCard
            title="Top Losers"
            icon={<TrendingDown className="h-4 w-4" />}
            tone="rose"
            items={topLosers}
            coinLogos={coinLogos}
          />
          <MoverCard
            title="Highest Volume"
            icon={<Flame className="h-4 w-4" />}
            tone="amber"
            items={topVolume}
            coinLogos={coinLogos}
          />
        </div>
      </section>

      {/* ── Filter toolbar + table ───────────────────────────────── */}
      <section className="container mx-auto px-4 pb-12">
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {/* Toolbar */}
          <div className="p-3 sm:p-4 border-b border-border flex flex-col gap-3">
            {/* Row 1: category tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
              {CATEGORIES.map((cat) => {
                const active = cat.id === category;
                const Icon = cat.icon;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategory(cat.id)}
                    className={`inline-flex items-center gap-1.5 px-3 h-8 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                      active
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted/70"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {cat.label}
                    {cat.id === "favorites" && favs.size > 0 && (
                      <span className={`inline-flex items-center justify-center min-w-[1.1rem] h-4 px-1 rounded-full text-[9px] font-bold ${
                        active ? "bg-primary-foreground/20" : "bg-primary/15 text-primary"
                      }`}>
                        {favs.size}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Row 2: search + quote pills + sort */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Search pair, symbol or asset…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 h-9 bg-background/60"
                />
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto -mx-1 px-1">
                {QUOTE_FILTERS.map((q) => {
                  const active = q === quote;
                  return (
                    <button
                      key={q}
                      type="button"
                      onClick={() => setQuote(q)}
                      className={`inline-flex items-center px-3 h-8 rounded-md text-xs font-semibold whitespace-nowrap transition-colors ${
                        active
                          ? "bg-foreground/10 text-foreground border border-foreground/20"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/50 border border-transparent"
                      }`}
                    >
                      {q}
                    </button>
                  );
                })}
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9 gap-1.5 flex-shrink-0">
                    <ArrowUpDown className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Sort: </span>
                    {SORT_OPTIONS.find((s) => s.id === sortKey)?.label}
                    <span className="text-[10px] text-muted-foreground ml-1">{sortDesc ? "↓" : "↑"}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuLabel>Sort by</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {SORT_OPTIONS.map((s) => (
                    <DropdownMenuItem key={s.id} onClick={() => setSort(s.id)} className="cursor-pointer">
                      <span className="flex-1">{s.label}</span>
                      {sortKey === s.id && <span className="text-xs text-primary">{sortDesc ? "↓" : "↑"}</span>}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b border-border text-xs text-muted-foreground uppercase tracking-wider">
                <tr>
                  <th className="text-left px-4 py-3 font-medium w-10"></th>
                  <th className="text-left px-2 py-3 font-medium">
                    <button onClick={() => setSort("name")} className="inline-flex items-center gap-1 hover:text-foreground">
                      Pair {sortKey === "name" && <span>{sortDesc ? "↓" : "↑"}</span>}
                    </button>
                  </th>
                  <th className="text-right px-2 py-3 font-medium">
                    <button onClick={() => setSort("price")} className="inline-flex items-center gap-1 hover:text-foreground">
                      Last Price {sortKey === "price" && <span>{sortDesc ? "↓" : "↑"}</span>}
                    </button>
                  </th>
                  <th className="text-right px-2 py-3 font-medium">
                    <button onClick={() => setSort("change")} className="inline-flex items-center gap-1 hover:text-foreground">
                      24h Change {sortKey === "change" && <span>{sortDesc ? "↓" : "↑"}</span>}
                    </button>
                  </th>
                  <th className="text-right px-2 py-3 font-medium hidden lg:table-cell">24h High</th>
                  <th className="text-right px-2 py-3 font-medium hidden lg:table-cell">24h Low</th>
                  <th className="text-right px-2 py-3 font-medium">
                    <button onClick={() => setSort("volume")} className="inline-flex items-center gap-1 hover:text-foreground">
                      24h Volume {sortKey === "volume" && <span>{sortDesc ? "↓" : "↑"}</span>}
                    </button>
                  </th>
                  <th className="text-center px-2 py-3 font-medium hidden xl:table-cell">7-Day Trend</th>
                  <th className="text-right px-4 py-3 font-medium">Trade</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <>
                    {Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i} className="border-b border-border">
                        <td className="px-4 py-3"><Skeleton className="h-4 w-4" /></td>
                        <td className="px-2 py-3">
                          <div className="flex items-center gap-2.5">
                            <Skeleton className="h-8 w-8 rounded-full" />
                            <div className="space-y-1.5">
                              <Skeleton className="h-3 w-20" />
                              <Skeleton className="h-2 w-12" />
                            </div>
                          </div>
                        </td>
                        <td className="px-2 py-3"><Skeleton className="h-4 w-16 ml-auto" /></td>
                        <td className="px-2 py-3"><Skeleton className="h-4 w-12 ml-auto" /></td>
                        <td className="px-2 py-3 hidden lg:table-cell"><Skeleton className="h-4 w-16 ml-auto" /></td>
                        <td className="px-2 py-3 hidden lg:table-cell"><Skeleton className="h-4 w-16 ml-auto" /></td>
                        <td className="px-2 py-3"><Skeleton className="h-4 w-14 ml-auto" /></td>
                        <td className="px-2 py-3 hidden xl:table-cell"><Skeleton className="h-7 w-20 mx-auto" /></td>
                        <td className="px-4 py-3"><Skeleton className="h-7 w-16 ml-auto" /></td>
                      </tr>
                    ))}
                  </>
                )}
                {!loading && paged.map((t) => {
                  const positive = t.priceChangePercent >= 0;
                  const isFav = favs.has(t.symbol);
                  const base = baseAsset(t.symbol);
                  const isNew = NEW_BASES.has(base.toUpperCase());
                  return (
                    <tr key={t.symbol} className="border-b border-border last:border-b-0 hover:bg-muted/20 transition-colors group">
                      <td className="px-4 py-3 align-middle">
                        <button
                          type="button"
                          onClick={() => toggleFav(t.symbol)}
                          className={`p-1 rounded hover:bg-muted/40 transition ${isFav ? "text-amber-400" : "text-muted-foreground/40 hover:text-amber-400"}`}
                          aria-label={isFav ? "Remove from favorites" : "Add to favorites"}
                        >
                          <Star className={`h-4 w-4 ${isFav ? "fill-current" : ""}`} />
                        </button>
                      </td>
                      <td className="px-2 py-3">
                        <Link href={`/trade/${encodeSymbol(t.symbol)}`} className="flex items-center gap-2.5 group">
                          <AssetIcon symbol={t.symbol} logoUrl={coinLogos.get(base)} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-sm">{base}</span>
                              <span className="text-[11px] text-muted-foreground">/{quoteAsset(t.symbol)}</span>
                              {isNew && (
                                <Badge className="h-4 px-1.5 text-[9px] bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20">
                                  NEW
                                </Badge>
                              )}
                            </div>
                            <div className="text-[10px] text-muted-foreground">{t.symbol}</div>
                          </div>
                        </Link>
                      </td>
                      <td className="px-2 py-3 text-right font-mono tabular-nums">
                        {fmtPrice(t.lastPrice, t.symbol)}
                      </td>
                      <td className="px-2 py-3 text-right">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold tabular-nums ${
                            positive ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
                          }`}
                        >
                          {positive ? "+" : ""}{t.priceChangePercent.toFixed(2)}%
                        </span>
                      </td>
                      <td className="px-2 py-3 text-right font-mono tabular-nums text-xs text-muted-foreground hidden lg:table-cell">
                        {fmtPrice(t.high, t.symbol)}
                      </td>
                      <td className="px-2 py-3 text-right font-mono tabular-nums text-xs text-muted-foreground hidden lg:table-cell">
                        {fmtPrice(t.low, t.symbol)}
                      </td>
                      <td className="px-2 py-3 text-right font-mono tabular-nums text-xs">
                        {isInr(t.symbol) ? fmtCompact(t.quoteVolume || 0, "₹") : fmtCompact(t.quoteVolume || 0) + " " + quoteAsset(t.symbol)}
                      </td>
                      <td className="px-2 py-3 hidden xl:table-cell">
                        <div className="flex justify-center">
                          <MiniSpark symbol={t.symbol} pct={t.priceChangePercent} w={80} h={28} />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button size="sm" variant="ghost" className="h-7 text-xs hover:bg-primary/10 hover:text-primary" asChild>
                          <Link href={`/trade/${encodeSymbol(t.symbol)}`}>
                            Trade <ChevronRight className="h-3 w-3 ml-0.5" />
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  );
                })}
                {!loading && list.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-16 text-center text-sm text-muted-foreground">
                      <div className="flex flex-col items-center gap-2">
                        <div className="h-12 w-12 rounded-full bg-muted/50 flex items-center justify-center">
                          <Search className="h-5 w-5" />
                        </div>
                        <div>No markets match your filters.</div>
                        <Button variant="outline" size="sm" onClick={() => { setSearch(""); setQuote("ALL"); setCategory("all"); }}>
                          Reset filters
                        </Button>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile card list */}
          <div className="md:hidden divide-y divide-border">
            {loading && (
              <div className="p-4 space-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-3 w-24" />
                      <Skeleton className="h-2 w-16" />
                    </div>
                    <div className="space-y-2 text-right">
                      <Skeleton className="h-3 w-16 ml-auto" />
                      <Skeleton className="h-2 w-10 ml-auto" />
                    </div>
                  </div>
                ))}
              </div>
            )}
            {!loading && paged.map((t) => {
              const positive = t.priceChangePercent >= 0;
              const isFav = favs.has(t.symbol);
              const base = baseAsset(t.symbol);
              const isNew = NEW_BASES.has(base.toUpperCase());
              return (
                <div key={t.symbol} className="p-3 flex items-center gap-3 hover:bg-muted/20">
                  <button
                    type="button"
                    onClick={() => toggleFav(t.symbol)}
                    className={`p-1 ${isFav ? "text-amber-400" : "text-muted-foreground/40"}`}
                    aria-label={isFav ? "Remove from favorites" : "Add to favorites"}
                  >
                    <Star className={`h-4 w-4 ${isFav ? "fill-current" : ""}`} />
                  </button>
                  <Link href={`/trade/${encodeSymbol(t.symbol)}`} className="flex items-center gap-2.5 flex-1 min-w-0">
                    <AssetIcon symbol={t.symbol} logoUrl={coinLogos.get(base)} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1 overflow-hidden">
                        <span className="font-bold text-sm shrink-0">{baseAsset(t.symbol)}</span>
                        <span className="text-[10px] text-muted-foreground shrink-0">/{quoteAsset(t.symbol)}</span>
                        {isNew && <Badge className="h-3.5 px-1 text-[8px] bg-emerald-500/15 text-emerald-400 border-emerald-500/30 shrink-0">NEW</Badge>}
                      </div>
                      <div className="text-[10px] text-muted-foreground line-clamp-1">
                        Vol {isInr(t.symbol) ? fmtCompact(t.quoteVolume || 0, "₹") : fmtCompact(t.quoteVolume || 0) + " " + quoteAsset(t.symbol)}
                      </div>
                    </div>
                    <MiniSpark symbol={t.symbol} pct={t.priceChangePercent} w={48} h={20} />
                    <div className="text-right shrink-0">
                      <div className="text-sm font-mono tabular-nums">{fmtPrice(t.lastPrice, t.symbol)}</div>
                      <div className={`text-[11px] font-bold tabular-nums ${positive ? "text-success" : "text-destructive"}`}>
                        {positive ? "+" : ""}{t.priceChangePercent.toFixed(2)}%
                      </div>
                    </div>
                  </Link>
                </div>
              );
            })}
            {!loading && list.length === 0 && (
              <div className="p-8 text-center text-sm text-muted-foreground">
                No markets match your filters.
              </div>
            )}
          </div>

          {/* Pagination footer */}
          {!loading && list.length > 0 && (
            <div className="px-4 py-3 border-t border-border flex flex-wrap items-center justify-between gap-3 text-[11px] text-muted-foreground">
              <div className="flex items-center gap-2">
                <span>Rows per page</span>
                <div className="flex items-center gap-1">
                  {[10, 20, 50].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setPageSize(s)}
                      className={`h-6 px-2 rounded text-[11px] font-medium transition-colors ${
                        pageSize === s
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted/40 hover:bg-muted/70 text-muted-foreground"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <span className="tabular-nums">
                {list.length === 0 ? "0" : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, list.length)}`} of{" "}
                <span className="font-semibold text-foreground">{list.length}</span> markets
              </span>

              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage(1)}
                  className="h-7 w-7 flex items-center justify-center rounded hover:bg-muted/50 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                  aria-label="First page"
                >
                  <ChevronsLeft className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="h-7 w-7 flex items-center justify-center rounded hover:bg-muted/50 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <span className="px-2 font-semibold text-foreground tabular-nums">{page} / {totalPages}</span>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="h-7 w-7 flex items-center justify-center rounded hover:bg-muted/50 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                  aria-label="Next page"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage(totalPages)}
                  className="h-7 w-7 flex items-center justify-center rounded hover:bg-muted/50 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                  aria-label="Last page"
                >
                  <ChevronsRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Stat tile
// ──────────────────────────────────────────────────────────────────
function StatTile({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "success" | "destructive";
}) {
  const valueColor = tone === "success" ? "text-success" : tone === "destructive" ? "text-destructive" : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-card/60 backdrop-blur p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
        {icon}
        {label}
      </div>
      <div className={`mt-1 font-extrabold text-lg sm:text-xl tabular-nums ${valueColor}`}>{value}</div>
    </div>
  );
}
