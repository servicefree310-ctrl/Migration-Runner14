import { useParams, useLocation, Link } from "wouter";
import {
  useTicker,
  useTickers,
  useRecentTrades,
  useWsConnected,
  decodeSymbol,
  encodeSymbol,
} from "@/lib/marketSocket";
import { useFuturesOrderbook } from "@/lib/futuresSocket";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post, del, api } from "@/lib/api";
import { useMarketCatalog } from "@/lib/marketCatalog";
import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { KycGate } from "@/components/KycGate";
import { PriceChart } from "@/components/PriceChart";
import { DepthChart } from "@/components/DepthChart";
import {
  Star,
  ChevronDown,
  Search,
  TrendingUp,
  TrendingDown,
  X,
  Info,
  LayoutGrid,
  LayoutPanelLeft,
  Sparkles,
  Zap,
  Shield,
  Pencil,
  ArrowLeftRight,
  Check,
  Share2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const LAYOUT_KEY = "zebvix:futures:layout";
const FAV_KEY = "zebvix:futures:favorites";
type LayoutMode = "simple" | "advanced" | "pro";

// ──────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────
function baseAsset(sym: string) { return sym.split("/")[0] || sym; }
function quoteAsset(sym: string) { return sym.split("/")[1] || ""; }
function fmtNum(n: number, digits = 2): string {
  if (!isFinite(n) || n === 0) return "—";
  return n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
function fmtPrice(n: number, quote: string): string {
  if (!isFinite(n) || n === 0) return "—";
  const inr = quote === "INR";
  const digits = inr ? 2 : n < 1 ? 6 : n < 100 ? 4 : 2;
  const prefix = inr ? "₹" : "";
  const suffix = !inr && quote ? ` ${quote}` : "";
  return prefix + n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits }) + suffix;
}
function fmtCompact(n: number, prefix = "") {
  if (!isFinite(n) || n === 0) return prefix + "0";
  const abs = Math.abs(n);
  if (abs >= 1e9) return prefix + (n / 1e9).toFixed(2) + "B";
  if (abs >= 1e6) return prefix + (n / 1e6).toFixed(2) + "M";
  if (abs >= 1e3) return prefix + (n / 1e3).toFixed(2) + "K";
  return prefix + n.toFixed(2);
}
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

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
      if (next.has(sym)) next.delete(sym); else next.add(sym);
      try { window.localStorage.setItem(FAV_KEY, JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  }, []);
  return { favs, toggle };
}

function useFlashOnChange(value: number) {
  const [flash, setFlash] = useState<"up" | "down" | null>(null);
  const prev = useRef<number>(value);
  useEffect(() => {
    if (value === prev.current || prev.current === 0) { prev.current = value; return; }
    setFlash(value > prev.current ? "up" : "down");
    prev.current = value;
    const t = window.setTimeout(() => setFlash(null), 450);
    return () => window.clearTimeout(t);
  }, [value]);
  return flash;
}

// ── Funding-rate countdown (counts down within current 8h window) ──────────
function useFundingCountdown(intervalHours = 8): string {
  const [txt, setTxt] = useState("00:00:00");
  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      const window_ms = intervalHours * 3_600_000;
      const rem = window_ms - (now % window_ms);
      const hh = Math.floor(rem / 3_600_000);
      const mm = Math.floor((rem % 3_600_000) / 60_000);
      const ss = Math.floor((rem % 60_000) / 1_000);
      setTxt(`${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`);
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [intervalHours]);
  return txt;
}

// ──────────────────────────────────────────────────────────────────
// Asset icon
// ──────────────────────────────────────────────────────────────────
function AssetIcon({ symbol, size = 9 }: { symbol: string; size?: 6 | 7 | 8 | 9 | 10 }) {
  const b = baseAsset(symbol);
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
  const grad = palette[hashStr(b) % palette.length];
  const dim =
    size === 6 ? "h-6 w-6 text-[10px]"
    : size === 7 ? "h-7 w-7 text-[11px]"
    : size === 8 ? "h-8 w-8 text-xs"
    : size === 10 ? "h-10 w-10 text-sm"
    : "h-9 w-9 text-sm";
  return (
    <div className={`${dim} rounded-full bg-gradient-to-br ${grad} text-white flex items-center justify-center font-bold shadow-md flex-shrink-0`}>
      {b.slice(0, 1)}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Symbol switcher — perpetuals only (USDT-quoted markets)
// ──────────────────────────────────────────────────────────────────
function SymbolSwitcher({ current, enabled }: { current: string; enabled: Set<string> }) {
  const tickers = useTickers();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [, navigate] = useLocation();
  const { favs } = useFavorites();

  const list = useMemo(() => {
    const all = Object.values(tickers)
      .filter((t) => t.symbol.endsWith("/USDT") && enabled.has(t.symbol))
      .sort((a, b) => (b.quoteVolume || 0) - (a.quoteVolume || 0));
    const trimmed = search.trim().toLowerCase();
    if (!trimmed) return all;
    return all.filter((t) => t.symbol.toLowerCase().includes(trimmed));
  }, [tickers, search, enabled]);

  const favList = useMemo(() => list.filter((t) => favs.has(t.symbol)), [list, favs]);
  const otherList = useMemo(() => list.filter((t) => !favs.has(t.symbol)), [list, favs]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 hover:bg-muted/40 rounded-md px-2 py-1 transition-colors group"
        >
          <AssetIcon symbol={current} />
          <div className="flex flex-col items-start">
            <div className="flex items-center gap-1.5">
              <span className="text-base sm:text-lg font-extrabold leading-none tracking-tight">{baseAsset(current)}</span>
              <span className="text-xs text-muted-foreground leading-none">/{quoteAsset(current)}</span>
              <Badge className="h-4 px-1.5 text-[9px] bg-primary/15 text-primary border-primary/30 hover:bg-primary/15">PERP</Badge>
            </div>
            <span className="text-[10px] text-muted-foreground mt-0.5">USD-M Perpetual · Click to switch</span>
          </div>
          <ChevronDown className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={8} className="w-80 p-0">
        <div className="p-2 border-b border-border">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search PERP market…"
              className="pl-8 h-8 text-sm"
            />
          </div>
        </div>
        <div className="max-h-80 overflow-auto">
          {favList.length > 0 && (
            <div>
              <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium bg-muted/20">Favorites</div>
              {favList.map((t) => (
                <SwitcherRow key={`fav-${t.symbol}`} t={t} active={t.symbol === current} onPick={() => { setOpen(false); navigate(`/futures/${encodeSymbol(t.symbol)}`); }} />
              ))}
            </div>
          )}
          <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium bg-muted/20">All perpetuals</div>
          {otherList.map((t) => (
            <SwitcherRow key={t.symbol} t={t} active={t.symbol === current} onPick={() => { setOpen(false); navigate(`/futures/${encodeSymbol(t.symbol)}`); }} />
          ))}
          {list.length === 0 && (
            <div className="px-4 py-6 text-center text-xs text-muted-foreground">
              {enabled.size === 0
                ? "No futures markets enabled. Markets appear here once an admin activates a pair."
                : "No matching pairs found."}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function SwitcherRow({ t, active, onPick }: { t: { symbol: string; lastPrice: number; priceChangePercent: number }; active: boolean; onPick: () => void }) {
  const positive = t.priceChangePercent >= 0;
  return (
    <button
      type="button"
      onClick={onPick}
      className={`w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/40 text-left transition-colors ${active ? "bg-primary/10" : ""}`}
    >
      <AssetIcon symbol={t.symbol} size={7} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold line-clamp-1">
          {baseAsset(t.symbol)}<span className="text-[10px] text-muted-foreground font-normal">/{quoteAsset(t.symbol)} PERP</span>
        </div>
      </div>
      <div className="text-right">
        <div className="text-xs font-mono">{fmtPrice(t.lastPrice, quoteAsset(t.symbol))}</div>
        <div className={`text-[10px] font-bold ${positive ? "text-success" : "text-destructive"}`}>
          {positive ? "+" : ""}{t.priceChangePercent.toFixed(2)}%
        </div>
      </div>
    </button>
  );
}

// ──────────────────────────────────────────────────────────────────
// Header stat
// ──────────────────────────────────────────────────────────────────
function HeaderStat({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col leading-tight flex-shrink-0 ${className}`}>
      <span className="text-[9px] sm:text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{label}</span>
      <span className="font-mono tabular-nums text-xs sm:text-sm">{children}</span>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Main Futures page
// ──────────────────────────────────────────────────────────────────
type OrderType = "limit" | "market" | "trailing_stop";
type Side = "long" | "short";
type MarginType = "isolated" | "cross";

const LEVERAGES = [1, 2, 5, 10, 20, 25, 50, 75, 100];
const FEE_TAKER = 0.0006;  // 0.06% futures taker
const FEE_MAKER = 0.0002;  // 0.02% futures maker

export default function Futures() {
  const params = useParams<{ symbol?: string }>();
  const symbol = decodeSymbol(params.symbol || "BTC_USDT");
  const [base, quote = "USDT"] = symbol.split("/");
  const ticker = useTicker(symbol);
  const futuresTradesSeedUrl = base && quote
    ? `/api/futures/trades/recent?currency=${encodeURIComponent(base)}&pair=${encodeURIComponent(quote)}&limit=30`
    : undefined;
  const trades = useRecentTrades(symbol, 100, futuresTradesSeedUrl);

  // ─── Futures orderbook (Go matching engine) ──────────────────────────────
  // Fetch a REST snapshot first (gives us the numeric pairId needed for the
  // Go WS channel futures.orderbook:{pairId}), then keep live via WS.
  const snapshotQuery = useQuery<any>({
    queryKey: ["futures-orderbook-snapshot", base, quote],
    queryFn: () => get(`/futures/orderbook?currency=${encodeURIComponent(base)}&pair=${encodeURIComponent(quote)}&depth=25`),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  const fSnapshot = snapshotQuery.data
    ? { bids: snapshotQuery.data.bids as [number, number][], asks: snapshotQuery.data.asks as [number, number][] }
    : undefined;
  const orderbook = useFuturesOrderbook(symbol, fSnapshot);
  const { user } = useAuth();
  const qc = useQueryClient();
  const { favs, toggle: toggleFav } = useFavorites();
  const isFav = favs.has(symbol);

  const [chartView, setChartView] = useState<"price" | "depth">("price");
  const [side, setSide] = useState<Side>("long");
  const [type, setType] = useState<OrderType>("limit");
  const [marginType, setMarginType] = useState<MarginType>("isolated");
  const [postOnly, setPostOnly] = useState(false);
  const [trailPct, setTrailPct] = useState("0.5");
  const [pnlSharePos, setPnlSharePos] = useState<any | null>(null);
  const [leverage, setLeverage] = useState(10);
  const [price, setPrice] = useState("");
  const [amount, setAmount] = useState("");
  const [pctSlider, setPctSlider] = useState<number[]>([0]);
  const [tpEnabled, setTpEnabled] = useState(false);
  const [slEnabled, setSlEnabled] = useState(false);
  const [tpPrice, setTpPrice] = useState("");
  const [slPrice, setSlPrice] = useState("");
  const [reduceOnly, setReduceOnly] = useState(false);
  const [bottomTab, setBottomTab] = useState<"positions" | "posHistory" | "open" | "history" | "trades">("positions");
  const [pairScope, setPairScope] = useState<"this" | "all">("this");
  const [recentTradeFeed, setRecentTradeFeed] = useState<"market" | "mine">("market");

  // SL/TP edit state
  const [sltpEditPos, setSltpEditPos] = useState<any>(null);
  const [sltpEditSl, setSltpEditSl] = useState("");
  const [sltpEditTp, setSltpEditTp] = useState("");

  // Transfer dialog state
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferAmount, setTransferAmount] = useState("");

  const [layoutMode, setLayoutMode] = useState<LayoutMode>(() => {
    try {
      const v = window.localStorage.getItem(LAYOUT_KEY);
      if (v === "simple" || v === "advanced" || v === "pro") return v;
    } catch { /* ignore */ }
    return "advanced";
  });
  useEffect(() => {
    try { window.localStorage.setItem(LAYOUT_KEY, layoutMode); } catch { /* ignore */ }
  }, [layoutMode]);

  // ─── Keyboard shortcuts (B=long, S=short, Esc=cancel all) ─────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) return;
      if (e.key === "b" || e.key === "B") setSide("long");
      if (e.key === "s" || e.key === "S") setSide("short");
      if (e.key === "1") setType("limit");
      if (e.key === "2") setType("market");
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  const isSimple = layoutMode === "simple";
  const isPro = layoutMode === "pro";
  const bookRows = isPro ? 16 : 12;

  // Futures-enabled symbols (admin-controlled). If the current symbol
  // isn't in this set, show a banner + disable the order form so users
  // can't fire orders the API will reject with 400.
  const { futures: enabledFuturesSet, isLoading: enabledLoading } = useMarketCatalog();
  const symbolEnabled = enabledFuturesSet.has(symbol);
  const noFuturesEnabled = !enabledLoading && enabledFuturesSet.size === 0;

  const lastPx = ticker?.lastPrice || 0;
  const pct = ticker?.priceChangePercent || 0;
  const high = ticker?.high || 0;
  const low = ticker?.low || 0;
  const vol = ticker?.volume || 0;
  const quoteVol = ticker?.quoteVolume || 0;
  const flash = useFlashOnChange(lastPx);
  const wsConnected = useWsConnected();

  // ─── Wallet / collateral ─────────────────────
  const { data: walletData } = useQuery<any>({
    queryKey: ["wallet"],
    queryFn: () => get("/finance/wallet"),
    enabled: !!user,
    refetchInterval: 8000,
  });
  const wallets: any[] = useMemo(() => {
    if (!walletData) return [];
    if (Array.isArray(walletData)) return walletData;
    if (Array.isArray(walletData.items)) return walletData.items;
    if (Array.isArray(walletData.wallets)) return walletData.wallets;
    return [];
  }, [walletData]);
  // API returns { type: "FUTURES"|"SPOT"|"FIAT", currency: "USDT", balance: number }
  // Must match both FUTURES type AND quote currency to avoid picking the SPOT wallet.
  const collateralWallet = wallets.find(
    (w) => (w.type || "").toUpperCase() === "FUTURES" &&
           (w.currency || w.symbol || w.coin || "").toUpperCase() === quote.toUpperCase()
  );
  const collateral = collateralWallet ? Math.max(0, Number(collateralWallet.balance ?? 0)) : 0;

  // ─── Positions (this symbol) ─────────────────
  // NOTE: no silent .catch fallback — react-query surfaces error state so the
  // bottom panel can warn the user instead of showing a misleading empty list.
  const positionsQuery = useQuery<any>({
    queryKey: ["futures", "positions", base, quote, pairScope],
    queryFn: () => pairScope === "this"
      ? get(`/futures/position?currency=${encodeURIComponent(base)}&pair=${encodeURIComponent(quote)}`)
      : get(`/futures/position`),
    enabled: !!user,
    refetchInterval: 4000,
  });
  const positions: any[] = useMemo(() => {
    const d = positionsQuery.data;
    if (!d) return [];
    if (Array.isArray(d)) return d;
    if (Array.isArray(d.data)) return d.data;
    if (Array.isArray(d.items)) return d.items;
    if (Array.isArray(d.positions)) return d.positions;
    return [];
  }, [positionsQuery.data]);

  // ─── Orders for this symbol ──────────────────
  const openOrdersQuery = useQuery<any>({
    queryKey: ["futures", "orders", "open", base, quote, pairScope],
    queryFn: () => pairScope === "this"
      ? get(`/futures/order?status=OPEN&currency=${encodeURIComponent(base)}&pair=${encodeURIComponent(quote)}`)
      : get(`/futures/order?status=OPEN`),
    enabled: !!user,
    refetchInterval: 5000,
  });
  const openOrderRows: any[] = useMemo(() => {
    const d = openOrdersQuery.data;
    if (!d) return [];
    if (Array.isArray(d)) return d;
    if (Array.isArray(d.data)) return d.data;
    if (Array.isArray(d.items)) return d.items;
    return [];
  }, [openOrdersQuery.data]);

  const historyQuery = useQuery<any>({
    queryKey: ["futures", "orders", "history", base, quote, bottomTab, pairScope],
    queryFn: () => pairScope === "this"
      ? get(`/futures/order?currency=${encodeURIComponent(base)}&pair=${encodeURIComponent(quote)}&limit=30`)
      : get(`/futures/order?limit=50`),
    enabled: !!user && bottomTab === "history",
    refetchInterval: 15000,
  });
  const historyRows: any[] = useMemo(() => {
    const d = historyQuery.data;
    let rows: any[] = [];
    if (!d) return rows;
    if (Array.isArray(d)) rows = d;
    else if (Array.isArray(d.data)) rows = d.data;
    else if (Array.isArray(d.items)) rows = d.items;
    // The futures history endpoint may return open/partial rows when no
    // status filter is applied server-side. Strip them here so "Order History"
    // only shows terminal orders (FILLED / CANCELLED / REJECTED).
    return rows.filter(r => !["OPEN", "PARTIAL"].includes(String(r.status ?? "").toUpperCase()));
  }, [historyQuery.data]);

  // Trade fills (actual executions, taker + maker) — for the bottom panel "Trades" tab
  const tradesQuery = useQuery<any>({
    queryKey: ["futures", "trades", base, quote, bottomTab, pairScope],
    queryFn: () => pairScope === "this"
      ? get(`/futures/trades?currency=${encodeURIComponent(base)}&pair=${encodeURIComponent(quote)}&limit=50`)
      : get(`/futures/trades?limit=50`),
    enabled: !!user && bottomTab === "trades",
    refetchInterval: 10000,
  });
  const tradesRows: any[] = useMemo(() => {
    const d = tradesQuery.data;
    if (!d) return [];
    if (Array.isArray(d)) return d;
    if (Array.isArray(d.data)) return d.data;
    return [];
  }, [tradesQuery.data]);

  // ─── Closed Position History ─────────────────
  const posHistoryQuery = useQuery<any>({
    queryKey: ["futures", "positions", "history", base, quote, bottomTab, pairScope],
    queryFn: () => pairScope === "this"
      ? get(`/futures/position?status=closed&currency=${encodeURIComponent(base)}&pair=${encodeURIComponent(quote)}`)
      : get(`/futures/position?status=closed`),
    enabled: !!user && bottomTab === "posHistory",
    refetchInterval: 20000,
  });
  const posHistoryRows: any[] = useMemo(() => {
    const d = posHistoryQuery.data;
    if (!d) return [];
    if (Array.isArray(d)) return d;
    if (Array.isArray(d.data)) return d.data;
    return [];
  }, [posHistoryQuery.data]);

  // User's own fills for the "Mine" recent-trades sidebar feed
  const { data: myFillsRaw, isLoading: myFillsLoading } = useQuery<any>({
    queryKey: ["futures", "my-fills-sidebar", base, quote],
    queryFn: () => get(`/futures/trades?currency=${encodeURIComponent(base)}&pair=${encodeURIComponent(quote)}&limit=100`),
    enabled: !!user && recentTradeFeed === "mine",
    refetchInterval: 10000,
  });
  const myFills = useMemo(() => {
    const arr: any[] = Array.isArray(myFillsRaw) ? myFillsRaw
      : Array.isArray(myFillsRaw?.data) ? myFillsRaw.data : [];
    return arr.map((r: any) => ({
      price: Number(r.price ?? r.executedPrice ?? 0),
      qty: Number(r.qty ?? r.amount ?? 0),
      side: String(r.side ?? "buy").toLowerCase() as "buy" | "sell",
      isBuyerMaker: String(r.side ?? "").toLowerCase() === "sell",
      ts: r.createdAt ? new Date(r.createdAt).getTime() : Date.now(),
    })).filter((t) => t.price > 0);
  }, [myFillsRaw]);

  // Live funding rate for the current pair
  const fundingQuery = useQuery<any>({
    queryKey: ["futures", "funding-rates", base, quote],
    queryFn: () => get(`/futures/funding-rates?currency=${encodeURIComponent(base)}&pair=${encodeURIComponent(quote)}&limit=2`),
    refetchInterval: 60000,
    staleTime: 30000,
  });
  const fundingRows: any[] = useMemo(() => {
    const d = fundingQuery.data;
    if (!d) return [];
    if (Array.isArray(d)) return d;
    if (Array.isArray(d.data)) return d.data;
    return [];
  }, [fundingQuery.data]);
  const latestFunding = fundingRows[0] ?? null;
  const fundingRate = latestFunding ? Number(latestFunding.rate) * 100 : null; // as %
  const fundingHours = latestFunding?.intervalHours ?? 8;
  const fundingCountdown = useFundingCountdown(fundingHours);

  // ─── Mutations ───────────────────────────────
  const apiSide = side === "long" ? "buy" : "sell";

  const orderMutation = useMutation({
    mutationFn: (data: any) => post("/futures/order", data),
    onSuccess: () => {
      const isLong = side === "long";
      const sideLabel = isLong ? "▲ Long" : "▼ Short";
      const typeLabel = type === "market" ? "market order" : `limit @ ${price} ${quote}`;
      toast.success(`${sideLabel} ${typeLabel}`, {
        description: `${amount} ${base} · ${leverage}× ${marginType} · ${base}/${quote} PERP`,
      });
      setPrice("");
      setAmount("");
      setPctSlider([0]);
      qc.invalidateQueries({ queryKey: ["futures"] });
      qc.invalidateQueries({ queryKey: ["wallet"] });
    },
    onError: (err: any) => toast.error(err?.message || "Failed to place order"),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string | number) => del(`/futures/order/${id}`),
    onSuccess: () => {
      toast.success("Order cancelled");
      qc.invalidateQueries({ queryKey: ["futures"] });
      qc.invalidateQueries({ queryKey: ["wallet"] });
    },
    onError: (err: any) => toast.error(err?.message || "Cancel failed"),
  });

  const cancelAllMutation = useMutation({
    mutationFn: async () => {
      await Promise.all(openOrderRows.map((o) => del(`/futures/order/${o.id}`).catch(() => null)));
    },
    onSuccess: () => {
      toast.success("All orders cancelled");
      qc.invalidateQueries({ queryKey: ["futures"] });
      qc.invalidateQueries({ queryKey: ["wallet"] });
    },
  });

  const closeMutation = useMutation({
    mutationFn: (pos: any) => api(`/futures/position`, {
      method: "DELETE",
      body: JSON.stringify({
        currency: pos.currency || base,
        pair: pos.pair || quote,
        side: String(pos.side || "long").toLowerCase(),
        qty: pos.qty,   // partial-close qty from the slider
      }),
    }),
    onSuccess: (data: any) => {
      const c = data?._close;
      if (c) {
        const isProfit = c.net >= 0;
        const quote    = c.quote ?? "USDT";
        const px       = Number(c.price);
        const pxDec    = px > 10000 ? 2 : px > 1 ? 4 : 6;
        const pnlStr   = `${c.pnl >= 0 ? "+" : ""}${Number(c.pnl).toFixed(4)}`;
        const feeStr   = Number(c.fee).toFixed(4);
        const netStr   = `${c.net >= 0 ? "+" : ""}${Number(c.net).toFixed(4)}`;
        const sideLabel = String(c.side || "").toUpperCase();
        toast(
          <div className="text-[11px] space-y-1 min-w-[220px]">
            <div className="flex items-center gap-2 font-semibold text-xs mb-1">
              <span>{c.symbol}</span>
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${sideLabel === "LONG" ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}`}>{sideLabel}</span>
              <span className="text-muted-foreground font-normal">Closed</span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-muted-foreground">
              <span>Qty</span>       <span className="text-foreground font-mono">{Number(c.qty).toFixed(4)}</span>
              <span>Close Price</span><span className="text-foreground font-mono">{px.toFixed(pxDec)}</span>
              <span>Realized PnL</span><span className={`font-mono font-bold ${c.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>{pnlStr} {quote}</span>
              <span>Fee</span>       <span className="font-mono text-amber-400">−{feeStr} {quote}</span>
              <span className="font-semibold text-foreground">Net</span>
              <span className={`font-mono font-bold ${isProfit ? "text-emerald-400" : "text-red-400"}`}>{netStr} {quote}</span>
            </div>
          </div>,
          {
            duration: 8000,
            icon: isProfit ? "✅" : "🔴",
          }
        );
      } else {
        toast.success("Position closed at market");
      }
      qc.invalidateQueries({ queryKey: ["futures"] });
      qc.invalidateQueries({ queryKey: ["wallet"] });
    },
    onError: (err: any) => toast.error(err?.message || "Close failed"),
  });

  const closeLimitMutation = useMutation({
    mutationFn: (data: any) => post("/futures/order", data),
    onSuccess: (_data: any, vars: any) => {
      const qty = Number(vars.amount ?? 0);
      const px  = Number(vars.price ?? 0);
      const side = String(vars.side || "").toUpperCase();
      toast.success(
        `Limit close placed — ${side} ${qty > 0 ? qty.toFixed(4) : ""} @ ${px > 0 ? px.toFixed(px > 10000 ? 2 : 4) : "?"}`
      );
      qc.invalidateQueries({ queryKey: ["futures"] });
      qc.invalidateQueries({ queryKey: ["wallet"] });
    },
    onError: (err: any) => toast.error(err?.message || "Limit close failed"),
  });

  const leverageMutation = useMutation({
    mutationFn: (lv: number) => post("/futures/leverage", { currency: base, pair: quote, leverage: lv }),
    onSuccess: (_d: any, lv: number) => toast.success(`Leverage set to ${lv}×`),
    onError: (err: any) => toast.error(err?.message || "Leverage update failed"),
  });

  const transferMutation = useMutation({
    mutationFn: (amt: number) => post("/transfer", { fromWallet: "spot", toWallet: "futures", coinSymbol: quote, amount: amt }),
    onSuccess: () => {
      toast.success(`Transferred ${transferAmount} ${quote} to Futures`);
      setTransferOpen(false);
      setTransferAmount("");
      qc.invalidateQueries({ queryKey: ["wallet"] });
    },
    onError: (err: any) => toast.error(err?.error || err?.message || "Transfer failed"),
  });

  const sltpMutation = useMutation({
    mutationFn: ({ posId, sl, tp }: { posId: number; sl: string; tp: string }) =>
      api(`/futures/position/${posId}/sltp`, {
        method: "PATCH",
        body: JSON.stringify({
          stopLossPrice:  sl  !== "" ? Number(sl)  : null,
          takeProfitPrice: tp !== "" ? Number(tp) : null,
        }),
      }),
    onSuccess: () => {
      toast.success("SL/TP updated");
      setSltpEditPos(null);
      qc.invalidateQueries({ queryKey: ["futures", "positions"] });
    },
    onError: (err: any) => toast.error(err?.message || "SL/TP update failed"),
  });

  // ─── Order entry math ────────────────────────
  const refPrice = type === "limit" ? Number(price || 0) : lastPx;
  const amt = Number(amount || 0);
  const notional = amt * refPrice;
  const margin = notional / Math.max(leverage, 1);
  const feeTaker = notional * FEE_TAKER;
  const feeMaker = notional * FEE_MAKER;
  // Approx liquidation price for cross/isolated isolated PERP (mm 0.5%):
  // long:  liq ≈ entry × (1 − 1/lev + mm)
  // short: liq ≈ entry × (1 + 1/lev − mm)
  const MM_RATE = 0.005;
  const liqPrice = refPrice > 0
    ? side === "long"
      ? refPrice * (1 - 1 / leverage + MM_RATE)
      : refPrice * (1 + 1 / leverage - MM_RATE)
    : 0;

  // ─── Slider → amount (uses leveraged buying power) ───
  const buyingPower = collateral * leverage;
  const onSliderChange = (v: number[]) => {
    setPctSlider(v);
    if (!(refPrice > 0)) return;
    const px = refPrice;
    const tgtNotional = (buyingPower * v[0]) / 100;
    const tgtAmt = tgtNotional / px;
    setAmount(tgtAmt > 0 ? tgtAmt.toFixed(6) : "");
  };

  const futuresPendingRef = useRef<Record<string, any> | null>(null);
  const [confirmOrderOpen, setConfirmOrderOpen] = useState(false);
  const [confirmCancelAll, setConfirmCancelAll] = useState(false);
  const [confirmLeverageSave, setConfirmLeverageSave] = useState(false);

  const handleOrder = () => {
    if (!user) { toast.error("Please log in"); return; }
    if (type === "trailing_stop") { toast.error("Trailing stop coming soon", { description: "Use a limit or market order for now." }); return; }
    if (!(amt > 0)) { toast.error("Enter a size"); return; }
    if (type === "limit" && !(Number(price) > 0)) { toast.error("Enter a price"); return; }
    if (margin > collateral + 1e-9) { toast.error("Insufficient margin"); return; }
    futuresPendingRef.current = {
      currency: base, pair: quote, side: apiSide, type, amount: amt,
      price: type === "limit" ? Number(price) : undefined,
      leverage,
      reduceOnly: reduceOnly || undefined,
      postOnly: postOnly && type === "limit" ? true : undefined,
      stopLossPrice: slEnabled && Number(slPrice) > 0 ? Number(slPrice) : undefined,
      takeProfitPrice: tpEnabled && Number(tpPrice) > 0 ? Number(tpPrice) : undefined,
    };
    setConfirmOrderOpen(true);
  };

  const executeFuturesOrder = () => {
    if (!futuresPendingRef.current) return;
    setConfirmOrderOpen(false);
    orderMutation.mutate(futuresPendingRef.current);
  };

  // ─── Orderbook math ──────────────────────────
  const bestBid = orderbook.bids[0]?.[0] || 0;
  const bestAsk = orderbook.asks[0]?.[0] || 0;
  const spread = bestAsk > 0 && bestBid > 0 ? bestAsk - bestBid : 0;
  const spreadPct = bestBid > 0 ? (spread / bestBid) * 100 : 0;

  const maxBidQty = Math.max(1, ...orderbook.bids.slice(0, bookRows).map(([, q]) => q));
  const maxAskQty = Math.max(1, ...orderbook.asks.slice(0, bookRows).map(([, q]) => q));

  // Total unrealised PnL across positions (this symbol)
  const totalUpnl = positions.reduce((s, p) => s + Number(p.unrealisedPnl ?? p.unrealizedPnl ?? 0), 0);
  const totalMargin = positions.reduce((s, p) => s + Number(p.margin ?? 0), 0);

  // ─── Bottom panel JSX (used twice — desktop inside chart column, mobile standalone) ───
  const bottomPanelJsx = (
    <Tabs value={bottomTab} onValueChange={(v) => setBottomTab(v as any)} className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 border-b border-border">
        <TabsList className="bg-transparent h-9 p-0 gap-1">
          <TabsTrigger value="positions" className="text-xs h-9 px-3 data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-foreground rounded-none">
            Positions <span className="ml-1.5 text-[10px] text-muted-foreground">({positions.length})</span>
          </TabsTrigger>
          <TabsTrigger value="posHistory" className="text-xs h-9 px-3 data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-foreground rounded-none">
            Pos. History
          </TabsTrigger>
          <TabsTrigger value="open" className="text-xs h-9 px-3 data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-foreground rounded-none">
            Open Orders <span className="ml-1.5 text-[10px] text-muted-foreground">({openOrderRows.length})</span>
          </TabsTrigger>
          <TabsTrigger value="history" className="text-xs h-9 px-3 data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-foreground rounded-none">
            Order History
          </TabsTrigger>
          <TabsTrigger value="trades" className="text-xs h-9 px-3 data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-foreground rounded-none">
            Trade Fills
          </TabsTrigger>
        </TabsList>
        <div className="flex items-center gap-2">
          {/* Pair scope toggle */}
          <div className="flex items-center gap-0 p-0.5 bg-muted/30 rounded border border-border/60 text-[10px]">
            <button
              type="button"
              onClick={() => setPairScope("this")}
              className={`px-2 py-0.5 rounded-sm transition-colors font-medium ${pairScope === "this" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              This Pair
            </button>
            <button
              type="button"
              onClick={() => setPairScope("all")}
              className={`px-2 py-0.5 rounded-sm transition-colors font-medium ${pairScope === "all" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              All Pairs
            </button>
          </div>
          {bottomTab === "open" && openOrderRows.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-[11px] text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => setConfirmCancelAll(true)}
              disabled={cancelAllMutation.isPending}
            >
              Cancel all
            </Button>
          )}
        </div>
      </div>
      <TabsContent value="positions" className="flex-1 m-0 overflow-auto">
        <PositionsTable
          rows={positions}
          loggedOut={!user}
          isError={positionsQuery.isError}
          isFetching={positionsQuery.isFetching && !positionsQuery.data}
          onRetry={() => positionsQuery.refetch()}
          mark={lastPx}
          onClose={(p) => closeMutation.mutateAsync(p)}
          closingId={closeMutation.variables?.id as any}
          onCloseLimit={(p, price, qty) => {
            const sideStr = String(p.side || "long").toLowerCase();
            closeLimitMutation.mutate({
              currency: p.currency || base,
              pair: p.pair || quote,
              side: sideStr === "long" ? "sell" : "buy",
              type: "limit",
              price,
              amount: qty,  // POST /futures/order reads b.amount, not b.qty
              leverage: Number(p.leverage ?? 10),
              reduceOnly: true,
            });
          }}
          onEditSltp={(p) => {
            setSltpEditPos(p);
            setSltpEditSl(p.stopLoss ?? "");
            setSltpEditTp(p.takeProfit ?? "");
          }}
          onSharePnl={(p, pnl, roe) => setPnlSharePos({ ...p, _pnl: pnl, _roe: roe })}
        />
      </TabsContent>
      <TabsContent value="posHistory" className="flex-1 m-0 overflow-auto">
        <PositionHistoryTable
          rows={posHistoryRows}
          loggedOut={!user}
          isError={posHistoryQuery.isError}
          isFetching={posHistoryQuery.isFetching && !posHistoryQuery.data}
          onRetry={() => posHistoryQuery.refetch()}
        />
      </TabsContent>
      <TabsContent value="open" className="flex-1 m-0 overflow-auto">
        <OrdersTable
          rows={openOrderRows}
          loggedOut={!user}
          isError={openOrdersQuery.isError}
          isFetching={openOrdersQuery.isFetching && !openOrdersQuery.data}
          onRetry={() => openOrdersQuery.refetch()}
          mode="open"
          onCancel={(id) => cancelMutation.mutate(id)}
          cancelingId={cancelMutation.variables as any}
        />
      </TabsContent>
      <TabsContent value="history" className="flex-1 m-0 overflow-auto">
        <OrdersTable
          rows={historyRows}
          loggedOut={!user}
          isError={historyQuery.isError}
          isFetching={historyQuery.isFetching && !historyQuery.data}
          onRetry={() => historyQuery.refetch()}
          mode="history"
        />
      </TabsContent>
      <TabsContent value="trades" className="flex-1 m-0 overflow-auto">
        <TradesTable
          rows={tradesRows}
          loggedOut={!user}
          isError={tradesQuery.isError}
          isFetching={tradesQuery.isFetching && !tradesQuery.data}
          onRetry={() => tradesQuery.refetch()}
          quote={quote}
        />
      </TabsContent>
    </Tabs>
  );

  if (user && (user.kycLevel ?? 0) < 2) {
    return (
      <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-5">
        <KycGate requiredLevel={2} feature="Futures Trading" mode="page" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-[calc(100vh-56px)] lg:h-[calc(100vh-56px)] bg-background">
      {/* ── Header strip ───────────────────────────────── */}
      <div className="border-b border-border bg-card/60 backdrop-blur shrink-0">
        <div className="flex items-center px-2 sm:px-4 gap-2 sm:gap-4 h-11 overflow-x-auto">
          <button
            type="button"
            onClick={() => toggleFav(symbol)}
            className={`p-1.5 rounded hover:bg-muted/40 transition flex-shrink-0 ${isFav ? "text-amber-400" : "text-muted-foreground/40 hover:text-amber-400"}`}
            aria-label={isFav ? "Unfavorite" : "Favorite"}
          >
            <Star className={`h-4 w-4 ${isFav ? "fill-amber-400" : ""}`} />
          </button>

          <SymbolSwitcher current={symbol} enabled={enabledFuturesSet} />

          {/* Spot / Futures mode toggle */}
          <div className="flex items-center gap-0.5 p-0.5 bg-muted/40 rounded-md border border-border flex-shrink-0">
            <Link href={`/trade`} className="px-3 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground rounded-sm transition-colors">Spot</Link>
            <span className="px-3 py-1 text-[11px] font-bold rounded-sm bg-card text-foreground shadow-sm">Futures</span>
          </div>

          <div className="h-6 w-px bg-border flex-shrink-0" />

          <HeaderStat label="Mark">
            <span className={`font-bold text-sm transition-colors ${
              flash === "up" ? "text-success" : flash === "down" ? "text-destructive" : pct >= 0 ? "text-success" : "text-destructive"
            }`}>
              {fmtPrice(lastPx, quote)}
            </span>
          </HeaderStat>

          <HeaderStat label="24h %">
            <span className={`text-xs ${pct >= 0 ? "text-success" : "text-destructive"}`}>
              {pct >= 0 ? "+" : ""}{fmtNum(pct, 2)}%
            </span>
          </HeaderStat>

          <HeaderStat label="High">{fmtPrice(high, quote)}</HeaderStat>
          <HeaderStat label="Low">{fmtPrice(low, quote)}</HeaderStat>
          <HeaderStat label={`Vol(${base})`}>{fmtCompact(vol)}</HeaderStat>
          <HeaderStat label={`Vol(${quote})`}>{fmtCompact(quoteVol, quote === "INR" ? "₹" : "")}{quote !== "INR" && quote ? ` ${quote}` : ""}</HeaderStat>

          {!isSimple && (
            <HeaderStat label="Funding / Countdown">
              <div className="flex items-center gap-1.5">
                {fundingRate !== null ? (
                  <span className={`font-mono font-bold ${fundingRate >= 0 ? "text-success" : "text-destructive"}`}>
                    {fundingRate >= 0 ? "+" : ""}{fundingRate.toFixed(4)}%
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
                <span className="text-[10px] font-mono text-muted-foreground border border-border/60 rounded px-1 py-0.5 tracking-tight bg-muted/20">
                  {fundingCountdown}
                </span>
              </div>
            </HeaderStat>
          )}

          {/* Live heartbeat indicator */}
          <div className="ml-auto flex items-center gap-2 flex-shrink-0">
            <span className="flex items-center gap-1 flex-shrink-0" title={wsConnected ? "Connected" : "Reconnecting…"}>
              <span className={`relative flex h-1.5 w-1.5`}>
                {wsConnected && <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 bg-emerald-400" />}
                <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${wsConnected ? "bg-emerald-500" : "bg-amber-400"}`} />
              </span>
              <span className={`text-[9px] font-bold tracking-widest uppercase hidden sm:inline ${wsConnected ? "text-emerald-500" : "text-amber-400"}`}>
                {wsConnected ? "Live" : "…"}
              </span>
            </span>
            <span className="hidden sm:inline text-[10px] uppercase tracking-wider text-muted-foreground font-medium">View</span>
            <div className="inline-flex rounded-md border border-border bg-card overflow-hidden">
              <button
                onClick={() => setLayoutMode("simple")}
                className={`px-2.5 py-1.5 text-[11px] font-medium flex items-center gap-1 transition ${isSimple ? "bg-primary text-primary-foreground" : "hover:bg-muted/40 text-muted-foreground"}`}
              >
                <LayoutPanelLeft className="h-3 w-3" /> Simple
              </button>
              <button
                onClick={() => setLayoutMode("advanced")}
                className={`px-2.5 py-1.5 text-[11px] font-medium flex items-center gap-1 transition border-l border-border ${layoutMode === "advanced" ? "bg-primary text-primary-foreground" : "hover:bg-muted/40 text-muted-foreground"}`}
              >
                <LayoutGrid className="h-3 w-3" /> Advanced
              </button>
              <button
                onClick={() => setLayoutMode("pro")}
                className={`px-2.5 py-1.5 text-[11px] font-medium flex items-center gap-1 transition border-l border-border ${isPro ? "bg-primary text-primary-foreground" : "hover:bg-muted/40 text-muted-foreground"}`}
              >
                <Sparkles className="h-3 w-3" /> Pro
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Body ───────────────────────────────── */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0 lg:overflow-hidden">
        {/* Orderbook + Recent Trades — LEFT column on desktop */}
        {!isSimple && (
        <div className={`order-3 lg:order-1 w-full ${isPro ? "lg:w-72" : "lg:w-64"} flex flex-col bg-card/40 shrink-0 border-t lg:border-t-0 lg:border-r border-border h-[38vh] lg:h-auto`}>
          <div className="flex flex-row lg:flex-col h-full min-h-0">
          {/* Orderbook */}
          <div className="w-1/2 lg:w-full flex flex-col border-r lg:border-r-0 lg:border-b border-border min-h-0 lg:max-h-[55%]">
            <div className="px-3 py-2 flex items-center justify-between border-b border-border">
              <span className="font-semibold text-[11px] uppercase tracking-wider text-muted-foreground">Order Book</span>
              {spread > 0 && (
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  <span className="text-foreground font-mono">{fmtPrice(spread, quote)}</span>
                  <span className="ml-1 opacity-70">({spreadPct.toFixed(3)}%)</span>
                </span>
              )}
            </div>
            {/* Bid/Ask depth ratio bar */}
            {(orderbook.bids.length > 0 || orderbook.asks.length > 0) && (() => {
              const totalBid = orderbook.bids.slice(0, bookRows).reduce((s, [, q]) => s + q, 0);
              const totalAsk = orderbook.asks.slice(0, bookRows).reduce((s, [, q]) => s + q, 0);
              const tot = totalBid + totalAsk || 1;
              const bidPct = (totalBid / tot) * 100;
              return (
                <div className="px-2 py-1.5 border-b border-border/60 space-y-1">
                  <div className="flex justify-between text-[10px] font-mono">
                    <span className="text-success">{bidPct.toFixed(1)}% <span className="text-muted-foreground font-sans">B</span></span>
                    <span className="text-muted-foreground text-[9px]">{fmtCompact(totalBid + totalAsk)} {base}</span>
                    <span className="text-destructive"><span className="text-muted-foreground font-sans">A</span> {(100 - bidPct).toFixed(1)}%</span>
                  </div>
                  <div className="flex h-1 rounded-full overflow-hidden">
                    <div className="bg-success/60 h-full transition-all duration-500" style={{ width: `${bidPct}%` }} />
                    <div className="bg-destructive/60 h-full flex-1" />
                  </div>
                </div>
              );
            })()}
            <div className="flex-1 overflow-auto px-2 py-1 text-xs font-mono">
              <div className="grid grid-cols-3 text-[10px] text-muted-foreground py-1 px-1 sticky top-0 bg-card/40 backdrop-blur z-10">
                <span>Price ({quote})</span>
                <span className="text-right">Size ({base})</span>
                <span className="text-right">Total</span>
              </div>
              {orderbook.asks.slice(0, bookRows).reverse().map(([px, qty], i) => {
                const cumulative = orderbook.asks.slice(0, bookRows - i).reduce((s, [, q]) => s + q, 0);
                return (
                  <button
                    key={`ask-${i}`}
                    type="button"
                    onClick={() => setPrice(String(px))}
                    className="relative grid grid-cols-3 py-[2px] px-1 hover:bg-destructive/5 w-full text-left"
                  >
                    <div className="absolute right-0 top-0 bottom-0 bg-destructive/10" style={{ width: `${(qty / maxAskQty) * 100}%` }} />
                    <span className="relative text-destructive tabular-nums">{fmtNum(px, quote === "INR" ? 2 : 4)}</span>
                    <span className="relative text-right tabular-nums">{fmtNum(qty, 4)}</span>
                    <span className="relative text-right tabular-nums text-muted-foreground">{fmtCompact(cumulative)}</span>
                  </button>
                );
              })}
              <div className={`py-2 my-1 text-center text-base font-bold border-y border-border tabular-nums ${pct >= 0 ? "text-success" : "text-destructive"}`}>
                {fmtPrice(lastPx, quote)}
              </div>
              {orderbook.bids.slice(0, bookRows).map(([px, qty], i) => {
                const cumulative = orderbook.bids.slice(0, i + 1).reduce((s, [, q]) => s + q, 0);
                return (
                  <button
                    key={`bid-${i}`}
                    type="button"
                    onClick={() => setPrice(String(px))}
                    className="relative grid grid-cols-3 py-[2px] px-1 hover:bg-success/5 w-full text-left"
                  >
                    <div className="absolute right-0 top-0 bottom-0 bg-success/10" style={{ width: `${(qty / maxBidQty) * 100}%` }} />
                    <span className="relative text-success tabular-nums">{fmtNum(px, quote === "INR" ? 2 : 4)}</span>
                    <span className="relative text-right tabular-nums">{fmtNum(qty, 4)}</span>
                    <span className="relative text-right tabular-nums text-muted-foreground">{fmtCompact(cumulative)}</span>
                  </button>
                );
              })}
              {orderbook.bids.length === 0 && orderbook.asks.length === 0 && (
                <div className="py-6 text-center text-muted-foreground text-xs">No depth yet</div>
              )}
            </div>
          </div>
          {/* Recent trades */}
          <div className="w-1/2 lg:w-full lg:flex-1 flex flex-col min-h-0">
            <div className="px-3 py-2 flex items-center justify-between border-b border-border gap-2">
              <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider">
                <button
                  type="button"
                  onClick={() => setRecentTradeFeed("market")}
                  className={`px-2 py-0.5 rounded transition-colors ${recentTradeFeed === "market" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"}`}
                >
                  Market
                </button>
                <button
                  type="button"
                  onClick={() => setRecentTradeFeed("mine")}
                  disabled={!user}
                  className={`px-2 py-0.5 rounded transition-colors ${recentTradeFeed === "mine" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground disabled:opacity-50"}`}
                >
                  Mine
                </button>
              </div>
              <span className="text-[10px] text-muted-foreground">
                {recentTradeFeed === "market"
                  ? `${trades.length} prints`
                  : `${myFills.length} fills`}
              </span>
            </div>
            <div className="flex-1 overflow-auto px-2 py-1 text-xs font-mono">
              <div className="grid grid-cols-3 text-[10px] text-muted-foreground py-1 px-1 sticky top-0 bg-card/40 backdrop-blur z-10">
                <span>Price ({quote})</span>
                <span className="text-right">Size ({base})</span>
                <span className="text-right">Time</span>
              </div>
              {(() => {
                const MIN_ROWS = 18;
                const displayList = (recentTradeFeed === "market" ? trades : myFills).slice(0, 100);
                const isLoading = recentTradeFeed === "market"
                  ? trades.length === 0
                  : (myFillsLoading && myFills.length === 0);
                const padCount = Math.max(0, MIN_ROWS - displayList.length);
                const W1 = [55,72,60,80,50,68,75,58,65,82,53,70,63,78,56,73,61,79,52,67];
                const W2 = [60,45,70,50,65,55,75,40,68,48,72,42,62,58,78,44,66,52,74,46];
                const W3 = [45,55,35,65,40,60,30,70,38,58,42,62,32,68,36,64,34,72,48,54];
                return (
                  <>
                    {displayList.map((t, i) => (
                      <div key={i} className="grid grid-cols-3 py-[2px] px-1 hover:bg-muted/20 transition-colors rounded">
                        <span className={`tabular-nums ${t.side === "buy" ? "text-success" : "text-destructive"}`}>{fmtNum(t.price, quote === "INR" ? 2 : 4)}</span>
                        <span className="text-right tabular-nums">{fmtNum(t.qty, 4)}</span>
                        <span className="text-right text-muted-foreground">{new Date(t.ts).toLocaleTimeString([], { hour12: false })}</span>
                      </div>
                    ))}
                    {(isLoading || padCount > 0) && (
                      <div className="animate-pulse space-y-[3px] pt-[2px]">
                        {Array.from({ length: isLoading ? MIN_ROWS : padCount }).map((_, i) => (
                          <div key={`sh-${i}`} className="grid grid-cols-3 py-[2px] px-1 gap-2">
                            <div className={`h-3 rounded ${i % 4 === 0 ? "bg-destructive/20" : "bg-success/15"}`} style={{ width: `${W1[i % W1.length]}%` }} />
                            <div className="h-3 rounded bg-muted/35 ml-auto" style={{ width: `${W2[i % W2.length]}%` }} />
                            <div className="h-3 rounded bg-muted/25 ml-auto" style={{ width: `${W3[i % W3.length]}%` }} />
                          </div>
                        ))}
                      </div>
                    )}
                    {recentTradeFeed === "market" && trades.length === 0 && !isLoading && (
                      <div className="py-6 text-center text-muted-foreground text-xs">No recent trades</div>
                    )}
                  </>
                );
              })()}
              {recentTradeFeed === "mine" && myFills.length === 0 && !myFillsLoading && (
                <div className="py-6 text-center text-muted-foreground text-xs">
                  {user ? "No futures fills on this pair yet." : "Log in to see your trade history."}
                </div>
              )}
            </div>
          </div>
          </div>
        </div>
        )}

        {/* Chart + bottom panel — CENTER column on desktop */}
        <div className="flex flex-col min-w-0 order-1 lg:order-2 lg:flex-1 lg:border-r lg:border-border">
          <div className="flex items-center gap-1 px-3 shrink-0 h-8 border-b border-border bg-card/40">
            {(["price", "depth"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setChartView(v)}
                className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors ${chartView === v ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"}`}
              >
                {v === "price" ? "Price" : "Depth Chart"}
              </button>
            ))}
          </div>
          <div className={`h-[36vh] sm:h-[42vh] lg:h-auto lg:flex-1 lg:min-h-0 lg:min-w-0 ${isSimple ? "lg:max-h-[58vh]" : "lg:max-h-[52vh]"}`}>
            {chartView === "price"
              ? <PriceChart symbol={symbol} mode="futures" openOrders={openOrderRows} myTrades={myFills} />
              : <DepthChart bids={orderbook.bids} asks={orderbook.asks} />
            }
          </div>

          {!isSimple && (
            <div className={`hidden lg:flex border-t border-border bg-card/60 ${isPro ? "h-52" : "h-48"} flex-col shrink-0`}>
              {bottomPanelJsx}
            </div>
          )}
        </div>

        {/* ── Order Entry ── */}
        <div className={`order-2 lg:order-3 w-full ${isSimple ? "lg:max-w-sm lg:mx-auto" : "lg:w-[280px]"} bg-card/40 flex flex-col shrink-0 lg:overflow-y-auto border-t lg:border-t-0 border-border`}>
          <div className="p-3 sm:p-4 space-y-3">
            {/* ── Available balance strip ────────────────────────── */}
            {user && (
              <div className="flex items-center justify-between rounded-md bg-muted/20 border border-border/60 px-3 py-2 mb-1">
                <div className="flex flex-col">
                  <span className="text-[9px] uppercase tracking-wider text-muted-foreground">Available</span>
                  <span className="font-mono font-semibold text-sm">{fmtNum(collateral, 2)} <span className="text-xs text-muted-foreground">{quote}</span></span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-[9px] uppercase tracking-wider text-muted-foreground">Buying Power</span>
                  <span className="font-mono text-primary font-bold text-sm">{fmtNum(collateral * leverage, 2)} <span className="text-xs text-muted-foreground/80">{quote}</span></span>
                </div>
                <button
                  type="button"
                  onClick={() => setTransferOpen(true)}
                  title="Transfer from Spot"
                  className="ml-2 p-1.5 rounded hover:bg-muted/60 text-primary transition-colors"
                >
                  <ArrowLeftRight className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* Margin type + leverage */}
            {!isSimple && (
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="flex items-center justify-center gap-1 py-1.5 rounded border border-border bg-muted/30 hover:bg-muted/50 font-medium"
                    >
                      <Shield className="h-3 w-3" />
                      {marginType === "isolated" ? "Isolated" : "Cross"}
                      <ChevronDown className="h-3 w-3" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56 p-2">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-1 mb-1">Margin Mode</div>
                    {(["isolated", "cross"] as MarginType[]).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => m === "isolated" ? setMarginType(m) : undefined}
                        disabled={m === "cross"}
                        className={`w-full text-left px-2 py-1.5 text-xs rounded transition-colors ${m === "cross" ? "opacity-35 cursor-not-allowed" : "hover:bg-muted/40"} ${marginType === m ? "bg-primary/10 text-primary font-semibold" : ""}`}
                      >
                        {m === "isolated" ? "Isolated · Per-position margin" : "Cross · Shared margin (soon)"}
                      </button>
                    ))}
                  </PopoverContent>
                </Popover>
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="flex items-center justify-center gap-1 py-1.5 rounded border border-border bg-muted/30 hover:bg-muted/50 font-bold text-primary"
                    >
                      <Zap className="h-3 w-3" />
                      {leverage}×
                      <ChevronDown className="h-3 w-3" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72 p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold">Adjust Leverage</span>
                      <span className="text-base font-mono font-bold text-primary">{leverage}×</span>
                    </div>
                    <Slider
                      value={[leverage]}
                      onValueChange={(v) => setLeverage(Math.max(1, Math.min(100, v[0])))}
                      min={1}
                      max={100}
                      step={1}
                    />
                    <div className="grid grid-cols-9 gap-1">
                      {LEVERAGES.map((lv) => (
                        <button
                          key={lv}
                          type="button"
                          onClick={() => setLeverage(lv)}
                          className={`text-[10px] py-1 rounded font-mono ${leverage === lv ? "bg-primary text-primary-foreground" : "bg-muted/40 hover:bg-muted/60 text-muted-foreground"}`}
                        >
                          {lv}×
                        </button>
                      ))}
                    </div>
                    {user && (
                      <Button
                        size="sm"
                        className="w-full h-8 text-xs"
                        onClick={() => setConfirmLeverageSave(true)}
                        disabled={leverageMutation.isPending}
                      >
                        {leverageMutation.isPending ? "Saving…" : "Save as default"}
                      </Button>
                    )}
                    <p className="text-[10px] text-muted-foreground leading-tight">
                      Higher leverage means a higher chance of liquidation. Trade carefully.
                    </p>
                  </PopoverContent>
                </Popover>
              </div>
            )}

            {/* Long/Short pill */}
            <div className="grid grid-cols-2 gap-1 p-1 bg-muted/40 rounded-lg">
              <button
                type="button"
                onClick={() => setSide("long")}
                className={`py-2 rounded-md text-sm font-bold transition-all ${
                  side === "long"
                    ? "bg-gradient-to-b from-emerald-500 to-emerald-600 text-white shadow-sm shadow-emerald-500/30"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <TrendingUp className="h-3.5 w-3.5 inline-block mr-1 -mt-0.5" />
                Long
              </button>
              <button
                type="button"
                onClick={() => setSide("short")}
                className={`py-2 rounded-md text-sm font-bold transition-all ${
                  side === "short"
                    ? "bg-gradient-to-b from-rose-500 to-rose-600 text-white shadow-sm shadow-rose-500/30"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <TrendingDown className="h-3.5 w-3.5 inline-block mr-1 -mt-0.5" />
                Short
              </button>
            </div>

            {/* Order type tabs */}
            <div className="flex gap-1 p-0.5 bg-muted/30 rounded-md text-xs">
              {(["limit", "market", "trailing_stop"] as OrderType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`flex-1 py-1.5 rounded font-medium ${type === t ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {t === "trailing_stop" ? "Trail" : t === "limit" ? "Limit" : "Market"}
                </button>
              ))}
            </div>

            {/* Simple mode leverage row */}
            {isSimple && (
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="text-muted-foreground">Leverage</span>
                <div className="flex items-center gap-1">
                  {[1, 5, 10, 25, 50].map((lv) => (
                    <button
                      key={lv}
                      type="button"
                      onClick={() => setLeverage(lv)}
                      className={`text-[10px] px-2 py-1 rounded font-mono ${leverage === lv ? "bg-primary text-primary-foreground" : "bg-muted/40 text-muted-foreground"}`}
                    >
                      {lv}×
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Trailing stop — trail distance */}
            {type === "trailing_stop" && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Trail Distance (%)</div>
                <div className="relative">
                  <Input
                    type="number"
                    value={trailPct}
                    onChange={(e) => setTrailPct(e.target.value)}
                    placeholder="0.5"
                    className="font-mono pr-8 h-9"
                    step="0.1"
                    min="0.1"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                </div>
                <div className="text-[10px] text-muted-foreground mt-1">
                  Follows price · Triggers when market reverses by {trailPct || "0.5"}%
                </div>
              </div>
            )}

            {/* Price */}
            {type === "limit" && (
              <div>
                <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                  <span>Price</span>
                  <div className="flex gap-1">
                    {bestBid > 0 && <button onClick={() => setPrice(String(bestBid))} className="text-primary normal-case">Bid</button>}
                    {lastPx > 0 && <button onClick={() => setPrice(String(lastPx))} className="text-primary normal-case">Mark</button>}
                    {bestAsk > 0 && <button onClick={() => setPrice(String(bestAsk))} className="text-primary normal-case">Ask</button>}
                  </div>
                </div>
                <div className="relative">
                  <Input
                    type="number"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder={lastPx ? fmtNum(lastPx, 2) : "0.00"}
                    className="font-mono pr-14 h-9"
                    step="any"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{quote}</span>
                </div>
              </div>
            )}

            {/* Size */}
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Size</div>
              <div className="relative">
                <Input
                  type="number"
                  value={amount}
                  onChange={(e) => { setAmount(e.target.value); setPctSlider([0]); }}
                  placeholder="0.00"
                  className="font-mono pr-14 h-9"
                  step="any"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{base}</span>
              </div>
            </div>

            {/* Slider + pct buttons */}
            <div className="space-y-2">
              <Slider value={pctSlider} onValueChange={onSliderChange} max={100} step={1} />
              <div className="grid grid-cols-4 gap-1">
                {[25, 50, 75, 100].map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => onSliderChange([p])}
                    className="text-[10px] py-1 rounded bg-muted/30 hover:bg-muted/60 text-muted-foreground font-medium"
                  >
                    {p}%
                  </button>
                ))}
              </div>
            </div>

            {/* TP / SL */}
            {!isSimple && (
              <div className="space-y-2 border-t border-border pt-3">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <Switch checked={tpEnabled} onCheckedChange={setTpEnabled} />
                    <span className="text-success font-medium">Take Profit</span>
                  </label>
                  {tpEnabled && (
                    <div className="relative w-32">
                      <Input
                        type="number"
                        value={tpPrice}
                        onChange={(e) => setTpPrice(e.target.value)}
                        placeholder="0.00"
                        className="font-mono h-7 text-xs pr-10"
                        step="any"
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">{quote}</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <Switch checked={slEnabled} onCheckedChange={setSlEnabled} />
                    <span className="text-destructive font-medium">Stop Loss</span>
                  </label>
                  {slEnabled && (
                    <div className="relative w-32">
                      <Input
                        type="number"
                        value={slPrice}
                        onChange={(e) => setSlPrice(e.target.value)}
                        placeholder="0.00"
                        className="font-mono h-7 text-xs pr-10"
                        step="any"
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">{quote}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Reduce-only / Post-only */}
            {!isSimple && (
              <div className="grid grid-cols-2 gap-2">
                <label className="flex items-center justify-between gap-2 text-xs px-2 py-1.5 rounded border border-border bg-muted/20 cursor-pointer">
                  <span className="text-muted-foreground">Reduce-only</span>
                  <Switch checked={reduceOnly} onCheckedChange={setReduceOnly} />
                </label>
                <label className={`flex items-center justify-between gap-2 text-xs px-2 py-1.5 rounded border border-border bg-muted/20 ${type === "market" ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}>
                  <span className="text-muted-foreground">Post-only</span>
                  <Switch checked={postOnly} onCheckedChange={setPostOnly} disabled={type === "market"} />
                </label>
              </div>
            )}

            {/* Stats */}
            <div className="space-y-1 text-xs border-t border-border pt-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Notional</span>
                <span className="tabular-nums">{fmtNum(notional, 2)} {quote}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Required Margin</span>
                <span className={`tabular-nums font-semibold ${margin > collateral ? "text-destructive" : ""}`}>{fmtNum(margin, 2)} {quote}</span>
              </div>
              {!isSimple && (
                <>
                  {/* Liquidation price — highlighted box */}
                  {liqPrice > 0 && (
                    <div className={`flex justify-between items-center rounded px-2 py-1.5 mt-1 border ${side === "long" ? "border-destructive/25 bg-destructive/5" : "border-success/25 bg-success/5"}`}>
                      <span className="text-muted-foreground text-[11px]">Est. Liq. Price</span>
                      <span className={`tabular-nums font-mono font-bold text-[11px] ${side === "long" ? "text-destructive" : "text-success"}`}>
                        {fmtPrice(liqPrice, quote)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Fee (taker / maker)</span>
                    <span className="tabular-nums text-[11px]">{fmtNum(feeTaker, 4)} / {fmtNum(feeMaker, 4)}</span>
                  </div>
                </>
              )}
            </div>

            {/* Action button */}
            <Button
              className={`w-full font-bold h-10 text-sm shadow-md ${side === "long"
                ? "bg-gradient-to-b from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white shadow-emerald-500/30"
                : "bg-gradient-to-b from-rose-500 to-rose-600 hover:from-rose-600 hover:to-rose-700 text-white shadow-rose-500/30"
              }`}
              onClick={handleOrder}
              disabled={orderMutation.isPending || !user || !symbolEnabled}
            >
              {!user
                ? "Log in to Trade"
                : !symbolEnabled
                  ? (noFuturesEnabled ? "Futures markets disabled" : `${base}/${quote} futures off`)
                  : orderMutation.isPending
                    ? "Placing…"
                    : `${side === "long" ? "Open Long" : "Open Short"} ${leverage}× ${base}`
              }
            </Button>

            {/* Open positions summary chip */}
            {user && positions.length > 0 && (
              <div className="rounded-md border border-border bg-muted/10 p-2 text-[11px]">
                <div className="flex justify-between mb-1">
                  <span className="text-muted-foreground">Open positions ({positions.length})</span>
                  <span className={`font-mono font-bold ${totalUpnl >= 0 ? "text-success" : "text-destructive"}`}>
                    {totalUpnl >= 0 ? "+" : ""}{fmtNum(totalUpnl, 2)} {quote}
                  </span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Total margin</span>
                  <span className="tabular-nums">{fmtNum(totalMargin, 2)} {quote}</span>
                </div>
              </div>
            )}

            {/* Pair badge */}
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground border-t border-border pt-3">
              <Info className="h-3 w-3" />
              <span>USD-M Perpetual · Settled in {quote}</span>
              <Badge variant="outline" className="ml-auto h-4 px-1.5 text-[9px]">ZBX-PERP</Badge>
            </div>
          </div>
        </div>

        {/* Mobile-only bottom panel (Advanced/Pro). Desktop shows it inside chart column. */}
        {!isSimple && (
          <div className="lg:hidden order-4 border-t border-border bg-card/60 h-[50vh] flex flex-col shrink-0">
            {bottomPanelJsx}
          </div>
        )}
      </div>


      {/* ── Order Confirmation Dialog ─────────────────────────────── */}
      <Dialog open={confirmOrderOpen} onOpenChange={(o) => { if (!o) setConfirmOrderOpen(false); }}>
        <DialogContent className="max-w-sm bg-card border border-border/80">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Confirm Futures Order</DialogTitle>
            <DialogDescription className="sr-only">Review your leveraged futures order before placing.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className={`flex items-center justify-between rounded-lg px-3 py-2 ${side === "long" ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-rose-500/10 border border-rose-500/20"}`}>
              <span className="text-xs text-muted-foreground">Direction</span>
              <div className="flex items-center gap-2">
                <span className={`font-bold text-sm ${side === "long" ? "text-emerald-400" : "text-rose-400"}`}>
                  {side === "long" ? "▲ Long" : "▼ Short"}
                </span>
                <span className="text-xs font-mono bg-muted/60 px-1.5 py-0.5 rounded font-bold">{leverage}×</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex flex-col gap-0.5 rounded-md bg-muted/40 px-3 py-2">
                <span className="text-muted-foreground">Pair</span>
                <span className="font-mono font-semibold">{base}/{quote} PERP</span>
              </div>
              <div className="flex flex-col gap-0.5 rounded-md bg-muted/40 px-3 py-2">
                <span className="text-muted-foreground">Order Type</span>
                <span className="font-semibold capitalize">{type}</span>
              </div>
              <div className="flex flex-col gap-0.5 rounded-md bg-muted/40 px-3 py-2">
                <span className="text-muted-foreground">Size</span>
                <span className="font-mono font-semibold">{amt.toFixed(4)} {base}</span>
              </div>
              <div className="flex flex-col gap-0.5 rounded-md bg-muted/40 px-3 py-2">
                <span className="text-muted-foreground">Margin</span>
                <span className={`font-mono font-semibold ${margin > collateral ? "text-destructive" : ""}`}>{margin.toFixed(4)} {quote}</span>
              </div>
              {type === "limit" && price && (
                <div className="flex flex-col gap-0.5 rounded-md bg-muted/40 px-3 py-2 col-span-2">
                  <span className="text-muted-foreground">Limit Price</span>
                  <span className="font-mono font-semibold">{Number(price).toLocaleString()} {quote}</span>
                </div>
              )}
              {type !== "limit" && lastPx > 0 && (
                <div className="flex flex-col gap-0.5 rounded-md bg-muted/40 px-3 py-2 col-span-2">
                  <span className="text-muted-foreground">Est. Entry (Mark)</span>
                  <span className="font-mono font-semibold">{lastPx.toLocaleString()} {quote}</span>
                </div>
              )}
            </div>
            <p className="text-[11px] text-amber-400/80 leading-snug px-1">
              ⚠ Futures are leveraged products. You may lose more than your margin if the market moves against you.
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="sm" onClick={() => setConfirmOrderOpen(false)}>Cancel</Button>
            <Button
              size="sm"
              className={side === "long"
                ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                : "bg-rose-600 hover:bg-rose-700 text-white"}
              onClick={executeFuturesOrder}
              disabled={orderMutation.isPending}
            >
              {orderMutation.isPending ? "Placing…" : side === "long" ? `Open Long ${leverage}×` : `Open Short ${leverage}×`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Cancel All Orders AlertDialog ────────────────────────── */}
      <AlertDialog open={confirmCancelAll} onOpenChange={setConfirmCancelAll}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel all open orders?</AlertDialogTitle>
            <AlertDialogDescription>
              This will cancel all {pairScope === "this" ? `${base}/${quote} PERP` : ""} open futures orders immediately. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Orders</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              onClick={() => { setConfirmCancelAll(false); cancelAllMutation.mutate(); }}
            >
              Cancel All Orders
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Leverage Save Default AlertDialog ────────────────────── */}
      <AlertDialog open={confirmLeverageSave} onOpenChange={setConfirmLeverageSave}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Save {leverage}× as default leverage?</AlertDialogTitle>
            <AlertDialogDescription>
              This will set {leverage}× as your default leverage for {base}/{quote} PERP. Higher leverage increases your liquidation risk — trade carefully.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setConfirmLeverageSave(false); leverageMutation.mutate(leverage); }}>
              Save {leverage}×
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── SL/TP Edit Dialog ── */}
      <Dialog open={sltpEditPos !== null} onOpenChange={(o) => { if (!o) setSltpEditPos(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Edit Stop Loss / Take Profit</DialogTitle>
            <DialogDescription className="sr-only">Set stop-loss and take-profit prices for your position.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="text-xs text-muted-foreground">
              Position: <span className="font-semibold text-foreground">{String(sltpEditPos?.symbol ?? "")}</span>
              {" · "}
              <span className={String(sltpEditPos?.side ?? "").toLowerCase() === "long" ? "text-success" : "text-destructive"}>
                {String(sltpEditPos?.side ?? "").toUpperCase()}
              </span>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-success">Take Profit Price</Label>
              <div className="relative">
                <Input
                  type="number"
                  value={sltpEditTp}
                  onChange={(e) => setSltpEditTp(e.target.value)}
                  placeholder="Leave blank to clear"
                  className="font-mono h-8 text-xs pr-14"
                  step="any"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">{quote}</span>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-destructive">Stop Loss Price</Label>
              <div className="relative">
                <Input
                  type="number"
                  value={sltpEditSl}
                  onChange={(e) => setSltpEditSl(e.target.value)}
                  placeholder="Leave blank to clear"
                  className="font-mono h-8 text-xs pr-14"
                  step="any"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">{quote}</span>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setSltpEditPos(null)}>Cancel</Button>
            <Button
              size="sm"
              className="h-8 text-xs"
              disabled={sltpMutation.isPending}
              onClick={() => {
                if (!sltpEditPos) return;
                sltpMutation.mutate({ posId: Number(sltpEditPos.id), sl: sltpEditSl, tp: sltpEditTp });
              }}
            >
              {sltpMutation.isPending ? "Saving…" : <><Check className="h-3 w-3 mr-1" />Save SL/TP</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Transfer Dialog ── */}
      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Transfer to Futures Wallet</DialogTitle>
            <DialogDescription className="sr-only">Move funds from your spot wallet to your futures wallet.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="text-xs text-muted-foreground">Move {quote} from your Spot wallet to your Futures wallet.</div>
            <div className="space-y-1">
              <Label className="text-xs">Amount ({quote})</Label>
              <Input
                type="number"
                value={transferAmount}
                onChange={(e) => setTransferAmount(e.target.value)}
                placeholder="0.00"
                className="font-mono h-8 text-xs"
                step="any"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setTransferOpen(false)}>Cancel</Button>
            <Button
              size="sm"
              className="h-8 text-xs"
              disabled={transferMutation.isPending || !(Number(transferAmount) > 0)}
              onClick={() => transferMutation.mutate(Number(transferAmount))}
            >
              {transferMutation.isPending ? "Transferring…" : <><ArrowLeftRight className="h-3 w-3 mr-1" />Transfer</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── PnL Share Card Dialog ── */}
      <Dialog open={pnlSharePos !== null} onOpenChange={(o) => { if (!o) setPnlSharePos(null); }}>
        <DialogContent className="max-w-xs p-0 overflow-hidden rounded-2xl">
          <DialogTitle className="sr-only">Share Position PnL</DialogTitle>
          {pnlSharePos && (() => {
            const pnl: number = pnlSharePos._pnl ?? 0;
            const roe: number = pnlSharePos._roe ?? 0;
            const sym: string = String(pnlSharePos.symbol ?? "");
            const sideStr: string = String(pnlSharePos.side ?? "").toLowerCase();
            const isLong = sideStr === "long" || sideStr === "buy";
            const posColor = isLong ? "#10b981" : "#f43f5e";
            return (
              <div
                className="relative flex flex-col items-center justify-between p-6 min-h-[200px]"
                style={{
                  background: `linear-gradient(135deg, ${isLong ? "#052e16 0%, #14532d 60%, #052e16 100%" : "#450a0a 0%, #7f1d1d 60%, #450a0a 100%"})`,
                }}
              >
                {/* Watermark */}
                <div className="absolute inset-0 flex items-center justify-center opacity-5 select-none pointer-events-none">
                  <span className="text-7xl font-black tracking-widest text-white">ZEBVIX</span>
                </div>

                <div className="relative z-10 w-full flex flex-col gap-4">
                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-white/60 text-xs uppercase tracking-wider">Futures</div>
                      <div className="text-white font-bold text-lg">{sym.replace("/", "")}</div>
                    </div>
                    <div
                      className="px-3 py-1 rounded-full text-xs font-bold"
                      style={{ background: posColor + "33", color: posColor, border: `1px solid ${posColor}44` }}
                    >
                      {isLong ? "LONG" : "SHORT"} {pnlSharePos.leverage ?? ""}×
                    </div>
                  </div>

                  {/* PnL */}
                  <div className="text-center">
                    <div className="text-white/50 text-xs mb-1">Unrealised PnL</div>
                    <div className="font-black text-4xl" style={{ color: posColor }}>
                      {pnl >= 0 ? "+" : ""}{pnl.toFixed(2)} USDT
                    </div>
                    <div className="font-bold text-lg mt-1" style={{ color: posColor }}>
                      {roe >= 0 ? "+" : ""}{roe.toFixed(2)}% ROE
                    </div>
                  </div>

                  {/* Entry / Mark */}
                  <div className="flex justify-between text-xs text-white/50">
                    <span>Entry: <span className="text-white/80 font-mono">{Number(pnlSharePos.entryPrice ?? 0).toFixed(2)}</span></span>
                    <span>Mark: <span className="text-white/80 font-mono">{Number(pnlSharePos.markPrice ?? pnlSharePos.currentPrice ?? 0).toFixed(2)}</span></span>
                  </div>

                  {/* Branding */}
                  <div className="flex items-center justify-between pt-2 border-t border-white/10">
                    <span className="text-white/40 text-[10px]">zebvix.com</span>
                    <span className="text-white/30 text-[9px]">{new Date().toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Close-position popover: Market or Limit
// ──────────────────────────────────────────────────────────────────
function ClosePositionModal({
  p, sideStr, markPx, isClosing, onCloseMarket, onCloseLimit,
}: {
  p: any; sideStr: string; markPx: number; isClosing: boolean;
  onCloseMarket: (p: any) => Promise<any>;
  onCloseLimit: (p: any, price: number, qty: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"market" | "limit">("market");
  const [limitPrice, setLimitPrice] = useState("");
  const [pct, setPct] = useState(100);
  const [submitting, setSubmitting] = useState(false);
  const [closeResult, setCloseResult] = useState<any>(null);

  const isLong     = sideStr === "long";
  const size       = Number(p.amount ?? p.size ?? p.qty ?? 0);
  const entry      = Number(p.entryPrice ?? p.openPrice ?? 0);
  const lev        = Number(p.leverage ?? 1);
  const marginAmt  = Number(p.margin ?? (entry * size) / Math.max(lev, 1));
  // Use live markPx prop (WebSocket) for real-time PnL — don't use stale server field
  const curPnl     = (entry > 0 && markPx > 0)
    ? (markPx - entry) * size * (isLong ? 1 : -1)
    : Number(p.unrealisedPnl ?? p.unrealizedPnl ?? 0);
  const curRoe     = marginAmt > 0 ? (curPnl / marginAmt) * 100 : 0;
  const closeSide  = isLong ? "Sell" : "Buy";
  const quote      = String(p.symbol ?? "").split("/")[1] ?? "USDT";
  const sym        = String(p.symbol ?? "");

  const closeQty = size * (pct / 100);

  const estPnlAt = (px: number, qty: number) =>
    (px - entry) * qty * (isLong ? 1 : -1);

  const mktPnl   = markPx > 0 ? estPnlAt(markPx, closeQty) : null;
  const limPnl   = limitPrice && Number(limitPrice) > 0 ? estPnlAt(Number(limitPrice), closeQty) : null;

  const pxDecimals = markPx > 1000 ? 2 : markPx > 1 ? 4 : 6;

  const handleOpen = () => {
    setLimitPrice(markPx > 0 ? markPx.toFixed(pxDecimals) : "");
    setPct(100);
    setTab("market");
    setCloseResult(null);
    setOpen(true);
  };

  const handleMarket = async () => {
    setSubmitting(true);
    try {
      const data = await onCloseMarket({ ...p, side: sideStr, qty: closeQty });
      setCloseResult(data?._close ?? null);
    } catch (_e) {
      setOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  const handleLimit = () => {
    const px = parseFloat(limitPrice);
    if (!px || px <= 0 || closeQty <= 0) return;
    onCloseLimit(p, px, closeQty);
    setOpen(false);
  };

  const QUICK = [25, 50, 75, 100] as const;

  const pnlColor = (val: number | null) =>
    val === null ? "text-muted-foreground" : val >= 0 ? "text-emerald-400" : "text-red-400";

  const btnClass = isLong
    ? "bg-red-500 hover:bg-red-600 text-white"
    : "bg-emerald-500 hover:bg-emerald-600 text-white";

  return (
    <>
      <button
        className="text-destructive text-xs hover:bg-destructive/10 px-1.5 py-0.5 rounded disabled:opacity-50 flex items-center gap-0.5 border border-destructive/30 transition-colors"
        disabled={isClosing}
        onClick={handleOpen}
        aria-label="Close position"
      >
        <X className="h-3 w-3" /> Close
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md p-0 gap-0 overflow-hidden bg-background border border-border/80">
          {/* ── Header ── */}
          <DialogHeader className="px-5 pt-5 pb-3 border-b border-border/60">
            <DialogTitle className="text-sm font-semibold flex items-center justify-between">
              <span>Close Position</span>
              <span className="text-[11px] font-normal text-muted-foreground">Reduce-Only</span>
            </DialogTitle>
            <DialogDescription className="sr-only">Choose market or limit order to close your futures position. This is a reduce-only order.</DialogDescription>
          </DialogHeader>

          {/* ── Position Summary Card ── */}
          <div className="mx-4 mt-4 rounded-lg bg-muted/20 border border-border/40 px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-foreground">{sym}</span>
                <span className="text-[10px] font-bold text-primary bg-primary/10 border border-primary/20 rounded px-1.5 py-0.5">{lev}×</span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                  isLong ? "text-emerald-400 bg-emerald-400/10 border-emerald-400/30"
                         : "text-red-400 bg-red-400/10 border-red-400/30"
                }`}>
                  {isLong ? "▲ LONG" : "▼ SHORT"}
                </span>
              </div>
              <div className={`text-sm font-bold tabular-nums ${curPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {curPnl >= 0 ? "+" : ""}{curPnl.toFixed(2)} {quote}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 text-[11px]">
              <div>
                <div className="text-muted-foreground mb-0.5">Size</div>
                <div className="font-mono font-semibold text-foreground">{size.toFixed(4)}</div>
              </div>
              <div>
                <div className="text-muted-foreground mb-0.5">Entry Price</div>
                <div className="font-mono font-semibold text-foreground">{fmtNum(entry, pxDecimals)}</div>
              </div>
              <div>
                <div className="text-muted-foreground mb-0.5">Mark Price</div>
                <div className="font-mono font-semibold text-foreground">{markPx > 0 ? fmtNum(markPx, pxDecimals) : "—"}</div>
              </div>
              <div>
                <div className="text-muted-foreground mb-0.5">ROE%</div>
                <div className={`font-mono font-semibold ${curRoe >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {curRoe >= 0 ? "+" : ""}{curRoe.toFixed(2)}%
                </div>
              </div>
              <div>
                <div className="text-muted-foreground mb-0.5">Direction</div>
                <div className={`font-bold ${isLong ? "text-red-400" : "text-emerald-400"}`}>{closeSide} to Close</div>
              </div>
              <div>
                <div className="text-muted-foreground mb-0.5">Margin</div>
                <div className="font-mono font-semibold text-foreground">{fmtNum(marginAmt, 2)}</div>
              </div>
            </div>
          </div>

          {/* ── Order Type Tabs ── */}
          <div className="px-4 mt-4">
            <Tabs value={tab} onValueChange={(v) => setTab(v as "market" | "limit")}>
              <TabsList className="w-full h-8 bg-muted/30 border border-border/40">
                <TabsTrigger value="market" className="flex-1 text-xs h-7 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                  Market
                </TabsTrigger>
                <TabsTrigger value="limit" className="flex-1 text-xs h-7 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                  Limit
                </TabsTrigger>
              </TabsList>

              {/* ── Market Tab ── */}
              <TabsContent value="market" className="mt-4 space-y-4">
                {/* Quantity */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-xs text-muted-foreground">Close Amount</Label>
                    <div className="flex items-center gap-1">
                      <span className="text-xs font-mono font-semibold text-foreground">{closeQty.toFixed(4)}</span>
                      <span className="text-[10px] text-muted-foreground">/ {size.toFixed(4)}</span>
                    </div>
                  </div>
                  <Slider
                    value={[pct]}
                    min={1} max={100} step={1}
                    onValueChange={([v]) => setPct(v!)}
                    className="mb-2"
                  />
                  <div className="flex gap-1.5">
                    {QUICK.map((q) => (
                      <button
                        key={q}
                        onClick={() => setPct(q)}
                        className={`flex-1 h-7 text-xs rounded border transition-colors font-medium ${
                          pct === q
                            ? "bg-primary/15 border-primary/50 text-primary"
                            : "border-border/50 text-muted-foreground hover:border-border hover:text-foreground"
                        }`}
                      >
                        {q}%
                      </button>
                    ))}
                  </div>
                </div>

                {/* Est. Fill */}
                <div className="rounded-lg bg-muted/20 border border-border/40 px-3 py-2.5 space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Order Type</span>
                    <span className="font-medium text-foreground">Market</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Direction</span>
                    <span className={`font-bold ${isLong ? "text-red-400" : "text-emerald-400"}`}>{closeSide}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Est. Fill Price</span>
                    <span className="font-mono text-foreground">{markPx > 0 ? fmtNum(markPx, pxDecimals) : "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Close Qty</span>
                    <span className="font-mono text-foreground">{closeQty.toFixed(4)} ({pct}%)</span>
                  </div>
                  <div className="border-t border-border/40 pt-1.5 flex justify-between">
                    <span className="text-muted-foreground">Est. PnL</span>
                    <span className={`font-bold font-mono ${pnlColor(mktPnl)}`}>
                      {mktPnl !== null
                        ? `${mktPnl >= 0 ? "+" : ""}${mktPnl.toFixed(2)} ${quote}`
                        : "—"}
                    </span>
                  </div>
                </div>

                <Button
                  className={`w-full h-10 font-bold text-sm ${btnClass}`}
                  onClick={handleMarket}
                  disabled={isClosing || submitting}
                >
                  {submitting ? "Closing…" : isClosing ? "Closing…" : `${closeSide} / Close at Market`}
                </Button>
              </TabsContent>

              {/* ── Limit Tab ── */}
              <TabsContent value="limit" className="mt-4 space-y-4">
                {/* Price input */}
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Limit Price ({quote})</Label>
                  <div className="relative">
                    <Input
                      type="number"
                      value={limitPrice}
                      onChange={(e) => setLimitPrice(e.target.value)}
                      placeholder={markPx > 0 ? markPx.toFixed(pxDecimals) : "0.00"}
                      className="h-10 text-sm pr-20 font-mono"
                    />
                    <button
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-primary hover:text-primary/80 font-medium border border-primary/30 rounded px-1.5 py-0.5"
                      onClick={() => setLimitPrice(markPx > 0 ? markPx.toFixed(pxDecimals) : "")}
                    >
                      Mark
                    </button>
                  </div>
                  {limitPrice && Number(limitPrice) > 0 && (
                    <div className={`text-[10px] mt-1 ${
                      isLong
                        ? Number(limitPrice) < markPx ? "text-amber-400" : "text-emerald-400"
                        : Number(limitPrice) > markPx ? "text-amber-400" : "text-emerald-400"
                    }`}>
                      {isLong
                        ? Number(limitPrice) < markPx
                          ? "⚠ Below mark — may not fill immediately"
                          : "✓ Above mark — favourable limit"
                        : Number(limitPrice) > markPx
                          ? "⚠ Above mark — may not fill immediately"
                          : "✓ Below mark — favourable limit"}
                    </div>
                  )}
                </div>

                {/* Quantity */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-xs text-muted-foreground">Close Amount</Label>
                    <div className="flex items-center gap-1">
                      <span className="text-xs font-mono font-semibold text-foreground">{closeQty.toFixed(4)}</span>
                      <span className="text-[10px] text-muted-foreground">/ {size.toFixed(4)}</span>
                    </div>
                  </div>
                  <Slider
                    value={[pct]}
                    min={1} max={100} step={1}
                    onValueChange={([v]) => setPct(v!)}
                    className="mb-2"
                  />
                  <div className="flex gap-1.5">
                    {QUICK.map((q) => (
                      <button
                        key={q}
                        onClick={() => setPct(q)}
                        className={`flex-1 h-7 text-xs rounded border transition-colors font-medium ${
                          pct === q
                            ? "bg-primary/15 border-primary/50 text-primary"
                            : "border-border/50 text-muted-foreground hover:border-border hover:text-foreground"
                        }`}
                      >
                        {q}%
                      </button>
                    ))}
                  </div>
                </div>

                {/* Order summary */}
                <div className="rounded-lg bg-muted/20 border border-border/40 px-3 py-2.5 space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Order Type</span>
                    <span className="font-medium text-foreground">Limit · Reduce-Only</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Direction</span>
                    <span className={`font-bold ${isLong ? "text-red-400" : "text-emerald-400"}`}>{closeSide}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Limit Price</span>
                    <span className="font-mono text-foreground">{limitPrice || "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Close Qty</span>
                    <span className="font-mono text-foreground">{closeQty.toFixed(4)} ({pct}%)</span>
                  </div>
                  <div className="border-t border-border/40 pt-1.5 flex justify-between">
                    <span className="text-muted-foreground">Est. PnL</span>
                    <span className={`font-bold font-mono ${pnlColor(limPnl)}`}>
                      {limPnl !== null
                        ? `${limPnl >= 0 ? "+" : ""}${limPnl.toFixed(2)} ${quote}`
                        : "—"}
                    </span>
                  </div>
                </div>

                <Button
                  className={`w-full h-10 font-bold text-sm ${btnClass}`}
                  onClick={handleLimit}
                  disabled={!limitPrice || Number(limitPrice) <= 0 || isClosing}
                >
                  {isClosing ? "Placing…" : `Place ${closeSide} Limit Order`}
                </Button>
              </TabsContent>
            </Tabs>
          </div>

          {closeResult ? (
            /* ── Close Receipt (inline, inside dialog) ── */
            <div className="mx-4 mb-5 mt-1 rounded-xl border border-border/60 overflow-hidden">
              <div className={`px-4 py-2.5 flex items-center gap-2 ${closeResult.net >= 0 ? "bg-emerald-500/10 border-b border-emerald-500/20" : "bg-red-500/10 border-b border-red-500/20"}`}>
                <span className="text-base">{closeResult.net >= 0 ? "✅" : "🔴"}</span>
                <span className="font-semibold text-sm text-foreground">Position Closed</span>
                <span className={`ml-auto font-bold text-sm tabular-nums ${closeResult.net >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {closeResult.net >= 0 ? "+" : ""}{Number(closeResult.net).toFixed(4)} {closeResult.quote}
                </span>
              </div>
              <div className="px-4 py-3 space-y-2 text-xs bg-muted/10">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Closed Qty</span>
                  <span className="font-mono text-foreground">{Number(closeResult.qty).toFixed(4)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Close Price</span>
                  <span className="font-mono text-foreground">
                    {Number(closeResult.price).toFixed(Number(closeResult.price) > 1000 ? 2 : Number(closeResult.price) > 1 ? 4 : 6)}
                  </span>
                </div>
                <div className="border-t border-border/40 pt-2 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Realized PnL</span>
                    <span className={`font-mono font-bold ${closeResult.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {closeResult.pnl >= 0 ? "+" : ""}{Number(closeResult.pnl).toFixed(4)} {closeResult.quote}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Trading Fee</span>
                    <span className="font-mono text-amber-400">−{Number(closeResult.fee).toFixed(4)} {closeResult.quote}</span>
                  </div>
                  <div className="flex justify-between border-t border-border/40 pt-2">
                    <span className="font-semibold text-foreground">Net P&L</span>
                    <span className={`font-mono font-bold text-sm ${closeResult.net >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {closeResult.net >= 0 ? "+" : ""}{Number(closeResult.net).toFixed(4)} {closeResult.quote}
                    </span>
                  </div>
                </div>
              </div>
              <Button variant="outline" className="w-full rounded-none h-9 text-xs border-0 border-t border-border/60" onClick={() => setOpen(false)}>
                Done
              </Button>
            </div>
          ) : (
            <div className="px-4 pb-4 mt-1">
              <p className="text-[10px] text-muted-foreground/60 text-center">
                Order will only reduce your existing {isLong ? "long" : "short"} position and will not open a new position.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// ──────────────────────────────────────────────────────────────────
// Positions table
// ──────────────────────────────────────────────────────────────────
function PositionsTable({
  rows,
  loggedOut,
  isError,
  isFetching,
  onRetry,
  mark,
  onClose,
  closingId,
  onCloseLimit,
  onEditSltp,
  onSharePnl,
}: {
  rows: any[];
  loggedOut: boolean;
  isError: boolean;
  isFetching: boolean;
  onRetry: () => void;
  mark: number;
  onClose: (p: any) => Promise<any>;
  closingId?: string | number;
  onCloseLimit?: (p: any, price: number, qty: number) => void;
  onEditSltp?: (p: any) => void;
  onSharePnl?: (p: any, pnl: number, roe: number) => void;
}) {
  if (loggedOut) {
    return (
      <div className="px-4 py-6 text-xs text-center text-muted-foreground">
        <a href="/login" className="text-primary hover:underline">Log in</a> to see your positions.
      </div>
    );
  }
  if (isError) {
    return (
      <div className="px-4 py-6 text-xs text-center space-y-2">
        <div className="text-destructive font-semibold">⚠ Couldn’t load positions.</div>
        <div className="text-muted-foreground">Your live exposure is hidden — please retry before placing new orders.</div>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onRetry}>Retry</Button>
      </div>
    );
  }
  if (isFetching && rows.length === 0) {
    return <div className="px-4 py-6 text-xs text-center text-muted-foreground animate-pulse">Loading positions…</div>;
  }
  if (rows.length === 0) {
    return <div className="px-4 py-6 text-xs text-center text-muted-foreground">No open positions.</div>;
  }
  return (
    <table className="w-full text-xs">
      <thead className="bg-muted/30 text-[10px] uppercase tracking-wider text-muted-foreground sticky top-0 z-10">
        <tr>
          <th className="text-left px-3 py-2 font-medium">Symbol</th>
          <th className="text-left px-2 py-2 font-medium">Side</th>
          <th className="text-right px-2 py-2 font-medium">Size</th>
          <th className="text-right px-2 py-2 font-medium">Entry / Mark</th>
          <th className="text-right px-2 py-2 font-medium">Liq. Price</th>
          <th className="text-right px-2 py-2 font-medium">Margin</th>
          <th className="text-right px-2 py-2 font-medium">ROE% / PnL</th>
          <th className="text-right px-2 py-2 font-medium">SL/TP</th>
          <th className="text-right px-3 py-2 font-medium">Action</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((p: any) => {
          const sideStr = String(p.side || "long").toLowerCase();
          const isLong = sideStr === "long";
          const entry = Number(p.entryPrice ?? p.openPrice ?? 0);
          const size = Number(p.amount ?? p.size ?? p.qty ?? 0);
          // Prefer live WebSocket price over stale server-computed markPrice
          const markPx = mark > 0 ? mark : Number(p.markPrice ?? 0);
          const lev = Number(p.leverage ?? 1);
          const marginAmt = Number(p.margin ?? (entry * size) / Math.max(lev, 1));
          const liq = Number(p.liquidationPrice ?? 0);
          // Always compute PnL from live mark price so it updates in real-time
          const pnl = (entry > 0 && markPx > 0)
            ? (markPx - entry) * size * (isLong ? 1 : -1)
            : Number(p.unrealisedPnl ?? p.unrealizedPnl ?? 0);
          const roe = marginAmt > 0 ? (pnl / marginAmt) * 100 : 0;
          const sym = String(p.symbol ?? `${p.currency || ""}/${p.pair || ""}`);

          // Risk proximity: how close is mark to liq? 0% = far, 100% = liquidated
          const riskPct = (liq > 0 && entry > 0)
            ? Math.min(100, Math.abs(markPx - liq) / Math.abs(entry - liq) < 0 ? 0 : (1 - Math.abs(markPx - liq) / Math.abs(entry - liq)) * 100)
            : 0;
          const riskColor = riskPct > 80 ? "bg-destructive" : riskPct > 50 ? "bg-amber-400" : "bg-success/60";

          return (
            <tr key={p.id} className="border-b border-border/60 last:border-b-0 hover:bg-muted/10 transition-colors">
              {/* Symbol + leverage */}
              <td className="px-3 py-2 whitespace-nowrap">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-foreground">{sym}</span>
                  <span className="text-[9px] font-mono font-bold text-primary bg-primary/10 border border-primary/20 rounded px-1 py-0.5">{lev}×</span>
                </div>
              </td>

              {/* Side badge */}
              <td className="px-2 py-2">
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border ${
                  isLong
                    ? "bg-success/10 text-success border-success/30"
                    : "bg-destructive/10 text-destructive border-destructive/30"
                }`}>
                  {isLong ? "▲ LONG" : "▼ SHORT"}
                </span>
              </td>

              {/* Size */}
              <td className="px-2 py-2 text-right font-mono tabular-nums text-foreground">{fmtNum(size, 4)}</td>

              {/* Entry / Mark stacked */}
              <td className="px-2 py-2 text-right">
                <div className="font-mono tabular-nums text-muted-foreground text-[10px]">{fmtNum(entry, 2)}</div>
                <div className="font-mono tabular-nums font-semibold">{fmtNum(markPx, 2)}</div>
              </td>

              {/* Liq price + risk bar */}
              <td className="px-2 py-2 text-right">
                <div className={`font-mono tabular-nums text-[11px] font-semibold ${riskPct > 70 ? "text-destructive" : riskPct > 40 ? "text-amber-400" : "text-muted-foreground"}`}>
                  {liq > 0 ? fmtNum(liq, 2) : "—"}
                </div>
                {liq > 0 && (
                  <div className="mt-0.5 h-0.5 rounded-full bg-muted/30 overflow-hidden w-full">
                    <div className={`h-full rounded-full transition-all ${riskColor}`} style={{ width: `${Math.max(2, riskPct)}%` }} />
                  </div>
                )}
              </td>

              {/* Margin */}
              <td className="px-2 py-2 text-right font-mono tabular-nums text-muted-foreground">{fmtNum(marginAmt, 2)}</td>

              {/* ROE% + PnL — most prominent column */}
              <td className="px-2 py-2 text-right">
                <div className={`text-sm font-bold font-mono tabular-nums ${pnl >= 0 ? "text-success" : "text-destructive"}`}>
                  {pnl >= 0 ? "+" : ""}{roe.toFixed(2)}%
                </div>
                <div className={`text-[10px] font-mono tabular-nums opacity-80 ${pnl >= 0 ? "text-success" : "text-destructive"}`}>
                  {pnl >= 0 ? "+" : ""}{fmtNum(pnl, 2)}
                </div>
              </td>

              {/* SL/TP */}
              <td className="px-2 py-2 text-right">
                <button
                  className={`inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                    p.stopLoss || p.takeProfit
                      ? "text-success border-success/30 bg-success/5 hover:bg-success/10"
                      : "text-muted-foreground border-border/60 hover:bg-muted/40 hover:text-primary"
                  }`}
                  onClick={() => onEditSltp?.(p)}
                  title="Edit Stop Loss / Take Profit"
                >
                  <Pencil className="h-2.5 w-2.5" />
                  {p.stopLoss || p.takeProfit ? "Set" : "Add"}
                </button>
              </td>

              {/* Actions */}
              <td className="px-3 py-2 text-right">
                <div className="flex items-center justify-end gap-1">
                  <button
                    className="text-muted-foreground hover:text-violet-400 p-1 rounded hover:bg-muted/40 transition-colors"
                    onClick={() => onSharePnl?.(p, pnl, roe)}
                    title="Share PnL Card"
                    aria-label="Share PnL"
                  >
                    <Share2 className="h-3 w-3" />
                  </button>
                  <ClosePositionModal
                    p={p}
                    sideStr={sideStr}
                    markPx={markPx}
                    isClosing={closingId === p.id}
                    onCloseMarket={onClose}
                    onCloseLimit={onCloseLimit ?? (() => {})}
                  />
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ──────────────────────────────────────────────────────────────────
// Orders table (open + history)
// ──────────────────────────────────────────────────────────────────
function OrdersTable({
  rows,
  loggedOut,
  isError,
  isFetching,
  onRetry,
  mode,
  onCancel,
  cancelingId,
}: {
  rows: any[];
  loggedOut: boolean;
  isError: boolean;
  isFetching: boolean;
  onRetry: () => void;
  mode: "open" | "history";
  onCancel?: (id: string | number) => void;
  cancelingId?: string | number;
}) {
  if (loggedOut) {
    return (
      <div className="px-4 py-6 text-xs text-center text-muted-foreground">
        <a href="/login" className="text-primary hover:underline">Log in</a> to see your orders.
      </div>
    );
  }
  if (isError) {
    return (
      <div className="px-4 py-6 text-xs text-center space-y-2">
        <div className="text-destructive font-semibold">
          ⚠ Couldn’t load {mode === "open" ? "open orders" : "order history"}.
        </div>
        {mode === "open" && (
          <div className="text-muted-foreground">Pending orders are hidden — retry before placing new ones.</div>
        )}
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onRetry}>Retry</Button>
      </div>
    );
  }
  if (isFetching && rows.length === 0) {
    return <div className="px-4 py-6 text-xs text-center text-muted-foreground animate-pulse">Loading…</div>;
  }
  if (rows.length === 0) {
    return (
      <div className="px-4 py-6 text-xs text-center text-muted-foreground">
        {mode === "open" ? "No open futures orders." : "No order history yet."}
      </div>
    );
  }
  return (
    <table className="w-full text-xs">
      <thead className="bg-muted/20 text-[10px] uppercase tracking-wider text-muted-foreground sticky top-0">
        <tr>
          <th className="text-left px-3 py-1.5 font-medium">Symbol</th>
          <th className="text-left px-2 py-1.5 font-medium">Side</th>
          <th className="text-left px-2 py-1.5 font-medium">Type</th>
          <th className="text-right px-2 py-1.5 font-medium">Price</th>
          <th className="text-right px-2 py-1.5 font-medium">Size</th>
          <th className="text-right px-2 py-1.5 font-medium">Filled</th>
          <th className="text-right px-2 py-1.5 font-medium">Lev.</th>
          {mode === "history" && <th className="text-right px-2 py-1.5 font-medium">Status</th>}
          <th className="text-right px-2 py-1.5 font-medium">Time</th>
          {mode === "open" && <th className="text-right px-3 py-1.5 font-medium">Action</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((o: any) => {
          const sideStr = String(o.side || "BUY").toUpperCase();
          const isLongSide = sideStr === "BUY" || sideStr === "LONG";
          const px = Number(o.price ?? o.priceFilled ?? 0);
          const qty = Number(o.amount ?? o.qty ?? 0);
          const filled = Number(o.filled ?? o.filledQty ?? 0);
          const lev = Number(o.leverage ?? 1);
          const ts = Number(o.createdAt ? new Date(o.createdAt).getTime() : o.ts ?? Date.now());
          const status = String(o.status || "OPEN").toUpperCase();
          const sym = String(o.symbol ?? `${o.currency || ""}/${o.pair || ""}`);
          return (
            <tr key={o.id} className="border-b border-border last:border-b-0 hover:bg-muted/15">
              <td className="px-3 py-1.5 font-semibold whitespace-nowrap">{sym}</td>
              <td className={`px-2 py-1.5 font-bold ${isLongSide ? "text-success" : "text-destructive"}`}>{isLongSide ? "LONG" : "SHORT"}</td>
              <td className="px-2 py-1.5 capitalize text-muted-foreground">{String(o.type || "limit").toLowerCase()}</td>
              <td className="px-2 py-1.5 text-right font-mono tabular-nums">{px > 0 ? fmtNum(px, 2) : "Market"}</td>
              <td className="px-2 py-1.5 text-right font-mono tabular-nums">{fmtNum(qty, 4)}</td>
              <td className="px-2 py-1.5 text-right font-mono tabular-nums">{fmtNum(filled, 4)}</td>
              <td className="px-2 py-1.5 text-right font-mono tabular-nums text-primary">{lev}×</td>
              {mode === "history" && (
                <td className="px-2 py-1.5 text-right">
                  <Badge variant="outline" className={`text-[9px] h-4 px-1.5 ${
                    status === "FILLED" || status === "CLOSED" ? "border-success/30 text-success bg-success/5"
                    : status === "CANCELLED" || status === "CANCELED" ? "border-muted-foreground/30 text-muted-foreground"
                    : status === "REJECTED" ? "border-destructive/30 text-destructive bg-destructive/5"
                    : "border-amber-500/30 text-amber-400 bg-amber-500/5"
                  }`}>{status}</Badge>
                </td>
              )}
              <td className="px-2 py-1.5 text-right text-[10px] text-muted-foreground tabular-nums">
                {new Date(ts).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })}
              </td>
              {mode === "open" && (
                <td className="px-3 py-1.5 text-right">
                  <button
                    className="text-destructive text-xs hover:bg-destructive/10 px-1.5 py-0.5 rounded"
                    onClick={() => onCancel?.(o.id)}
                    disabled={cancelingId === o.id}
                    aria-label="Cancel order"
                  >
                    <X className="h-3 w-3 inline-block" /> Cancel
                  </button>
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ──────────────────────────────────────────────────────────────────
// Trade fills table
// ──────────────────────────────────────────────────────────────────
function TradesTable({
  rows,
  loggedOut,
  isError,
  isFetching,
  onRetry,
  quote,
}: {
  rows: any[];
  loggedOut: boolean;
  isError: boolean;
  isFetching: boolean;
  onRetry: () => void;
  quote: string;
}) {
  if (loggedOut) {
    return (
      <div className="px-4 py-6 text-xs text-center text-muted-foreground">
        <a href="/login" className="text-primary hover:underline">Log in</a> to see your trade fills.
      </div>
    );
  }
  if (isError) {
    return (
      <div className="px-4 py-6 text-xs text-center space-y-2">
        <div className="text-destructive font-semibold">⚠ Couldn't load trade fills.</div>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onRetry}>Retry</Button>
      </div>
    );
  }
  if (isFetching && rows.length === 0) {
    return <div className="px-4 py-6 text-xs text-center text-muted-foreground animate-pulse">Loading fills…</div>;
  }
  if (rows.length === 0) {
    return <div className="px-4 py-6 text-xs text-center text-muted-foreground">No trade fills yet.</div>;
  }
  return (
    <table className="w-full text-xs">
      <thead className="bg-muted/20 text-[10px] uppercase tracking-wider text-muted-foreground sticky top-0">
        <tr>
          <th className="text-left px-3 py-1.5 font-medium">Symbol</th>
          <th className="text-left px-2 py-1.5 font-medium">Side</th>
          <th className="text-left px-2 py-1.5 font-medium">Role</th>
          <th className="text-right px-2 py-1.5 font-medium">Price</th>
          <th className="text-right px-2 py-1.5 font-medium">Qty</th>
          <th className="text-right px-2 py-1.5 font-medium">Fee ({quote})</th>
          <th className="text-right px-2 py-1.5 font-medium">Time</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((t: any) => {
          const sideStr = String(t.side || "buy").toLowerCase();
          const isBuy = sideStr === "buy";
          const ts = t.createdAt ? new Date(t.createdAt).getTime() : Date.now();
          return (
            <tr key={t.id} className="border-b border-border last:border-b-0 hover:bg-muted/15">
              <td className="px-3 py-1.5 font-semibold whitespace-nowrap">{String(t.symbol ?? "")}</td>
              <td className={`px-2 py-1.5 font-bold ${isBuy ? "text-success" : "text-destructive"}`}>
                {isBuy ? "LONG" : "SHORT"}
              </td>
              <td className="px-2 py-1.5 text-muted-foreground capitalize">{String(t.role ?? "taker")}</td>
              <td className="px-2 py-1.5 text-right font-mono tabular-nums">{fmtNum(Number(t.price), 2)}</td>
              <td className="px-2 py-1.5 text-right font-mono tabular-nums">{fmtNum(Number(t.qty), 4)}</td>
              <td className="px-2 py-1.5 text-right font-mono tabular-nums text-muted-foreground">{fmtNum(Number(t.fee), 4)}</td>
              <td className="px-2 py-1.5 text-right text-[10px] text-muted-foreground tabular-nums">
                {new Date(ts).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ─── Position History Table ───────────────────────────────────────────────────
function PositionHistoryTable({
  rows, loggedOut, isError, isFetching, onRetry,
}: {
  rows: any[]; loggedOut: boolean; isError: boolean; isFetching: boolean; onRetry: () => void;
}) {
  if (loggedOut) {
    return <div className="px-4 py-6 text-xs text-center text-muted-foreground">Log in to see your position history.</div>;
  }
  if (isFetching) {
    return <div className="px-4 py-6 text-xs text-center text-muted-foreground animate-pulse">Loading position history…</div>;
  }
  if (isError) {
    return (
      <div className="px-4 py-4 text-xs text-center text-destructive flex flex-col items-center gap-2">
        <span>⚠ Couldn't load position history.</span>
        <button onClick={onRetry} className="underline text-primary">Retry</button>
      </div>
    );
  }
  if (rows.length === 0) {
    return <div className="px-4 py-6 text-xs text-center text-muted-foreground">No closed positions yet.</div>;
  }

  // Summary totals bar
  const totalNet = rows.reduce((s, r) => s + Number(r.netPnl ?? r.realizedPnl ?? 0), 0);
  const totalFee = rows.reduce((s, r) => s + Number(r.closeFee ?? 0), 0);
  const quoteSymbol = rows[0]?.quoteSymbol ?? rows[0]?.pair ?? "USDT";

  return (
    <div className="flex flex-col h-full">
      {/* Summary strip */}
      <div className="flex items-center gap-4 px-3 py-1.5 bg-muted/20 border-b border-border/40 text-[10px] text-muted-foreground">
        <span>Total realized</span>
        <span className={`font-bold tabular-nums ${totalNet >= 0 ? "text-emerald-400" : "text-red-400"}`}>
          {totalNet >= 0 ? "+" : ""}{totalNet.toFixed(4)} {quoteSymbol}
        </span>
        <span className="ml-auto">Total fees: <span className="text-amber-400 font-mono">{totalFee.toFixed(4)} {quoteSymbol}</span></span>
      </div>
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/20 text-[10px] uppercase tracking-wider text-muted-foreground sticky top-0">
            <tr>
              <th className="text-left px-3 py-1.5 font-medium">Closed</th>
              <th className="text-left px-2 py-1.5 font-medium">Symbol</th>
              <th className="text-left px-2 py-1.5 font-medium">Side</th>
              <th className="text-right px-2 py-1.5 font-medium">Qty</th>
              <th className="text-right px-2 py-1.5 font-medium">Entry</th>
              <th className="text-right px-2 py-1.5 font-medium">Exit</th>
              <th className="text-right px-2 py-1.5 font-medium">Realized PnL</th>
              <th className="text-right px-2 py-1.5 font-medium">Fee</th>
              <th className="text-right px-2 py-1.5 font-medium">Net PnL</th>
              <th className="text-right px-2 py-1.5 font-medium">Lev</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r: any) => {
              const isLong = String(r.side || "long").toLowerCase() === "long";
              const entryPx = Number(r.entryPrice ?? r.avgEntryPrice ?? 0);
              const exitPx = Number(r.exitPrice ?? r.markPrice ?? 0);
              const qty = Number(r.qty ?? r.size ?? 0);
              const grossPnl = Number(r.grossPnl ?? r.realizedPnl ?? 0);
              const fee = Number(r.closeFee ?? 0);
              const netPnl = Number(r.netPnl ?? grossPnl);
              const lev = Number(r.leverage ?? 1);
              const closedTs = r.closedAt ? new Date(r.closedAt).getTime() : null;
              const priceDecimals = exitPx > 1000 ? 2 : exitPx > 1 ? 4 : 6;
              const symbol = r.symbol ?? `${r.currency ?? ""}${r.pair ?? ""}`;
              const reason = String(r.closeReason ?? "user_close").replace(/_/g, " ");
              return (
                <tr key={r.id ?? r.uid} className="border-b border-border last:border-b-0 hover:bg-muted/15 group">
                  <td className="px-3 py-1.5 text-[10px] text-muted-foreground tabular-nums whitespace-nowrap">
                    {closedTs
                      ? new Date(closedTs).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })
                      : "—"}
                    <div className="text-[9px] text-muted-foreground/50 capitalize">{reason}</div>
                  </td>
                  <td className="px-2 py-1.5 font-semibold whitespace-nowrap">{symbol}</td>
                  <td className={`px-2 py-1.5 font-bold ${isLong ? "text-emerald-400" : "text-red-400"}`}>
                    {isLong ? "LONG" : "SHORT"}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono tabular-nums">{qty.toFixed(4)}</td>
                  <td className="px-2 py-1.5 text-right font-mono tabular-nums text-muted-foreground">
                    {entryPx.toFixed(priceDecimals)}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                    {exitPx.toFixed(priceDecimals)}
                  </td>
                  <td className={`px-2 py-1.5 text-right font-mono tabular-nums font-semibold ${grossPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {grossPnl >= 0 ? "+" : ""}{grossPnl.toFixed(4)}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono tabular-nums text-amber-400">
                    {fee > 0 ? `−${fee.toFixed(4)}` : "—"}
                  </td>
                  <td className={`px-2 py-1.5 text-right font-mono tabular-nums font-bold ${netPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {netPnl >= 0 ? "+" : ""}{netPnl.toFixed(4)}
                  </td>
                  <td className="px-2 py-1.5 text-right text-muted-foreground">
                    {lev}x
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
