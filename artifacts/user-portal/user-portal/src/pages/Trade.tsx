import { useParams, Link, useLocation } from "wouter";
import {
  useTicker,
  useTickers,
  useOrderbook,
  useRecentTrades,
  decodeSymbol,
  encodeSymbol,
} from "@/lib/marketSocket";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post, del } from "@/lib/api";
import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { PriceChart } from "@/components/PriceChart";
import { DepthChart } from "@/components/DepthChart";
import { OrderFillsDialog } from "@/components/OrderFillsDialog";
import { cn } from "@/lib/utils";
import {
  Star,
  ChevronDown,
  Search,
  TrendingUp,
  TrendingDown,
  X,
  ArrowUpDown,
  Wallet as WalletIcon,
  Info,
  LayoutGrid,
  LayoutPanelLeft,
  Sparkles,
  Bot,
  Brain,
  Zap,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  RefreshCw,
} from "lucide-react";

const LAYOUT_KEY = "zebvix:trade:layout";
type LayoutMode = "simple" | "advanced" | "pro";

// ──────────────────────────────────────────────────────────────────
// Helpers (inlined; mirrors Markets.tsx)
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
function fmtNum(n: number, digits = 2): string {
  if (!isFinite(n) || n === 0) return "—";
  return n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
function fmtBal(n: number, digits = 2): string {
  if (!isFinite(n)) return "—";
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
    <div className={`${dim} rounded-full bg-gradient-to-br ${grad} text-foreground flex items-center justify-center font-bold shadow-md flex-shrink-0`}>
      {b.slice(0, 1)}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Symbol switcher (popover with live search across tickers)
// Only shows pairs that are ENABLED on the server (active + tradingEnabled
// + both coins listed). The set comes from /api/pairs.
// ──────────────────────────────────────────────────────────────────
function SymbolSwitcher({ current, enabledPairSet }: { current: string; enabledPairSet: Set<string> }) {
  const tickers = useTickers();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [, navigate] = useLocation();
  const { favs } = useFavorites();

  const list = useMemo(() => {
    const all = Object.values(tickers)
      .filter((t) => enabledPairSet.size === 0 || enabledPairSet.has(t.symbol))
      .sort((a, b) => (b.quoteVolume || 0) - (a.quoteVolume || 0));
    const trimmed = search.trim().toLowerCase();
    if (!trimmed) return all;
    return all.filter((t) => t.symbol.toLowerCase().includes(trimmed));
  }, [tickers, search, enabledPairSet]);

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
            </div>
            <span className="text-[10px] text-muted-foreground mt-0.5">Spot · Click to switch</span>
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
              placeholder="Search market…"
              className="pl-8 h-8 text-sm"
            />
          </div>
        </div>
        <div className="max-h-80 overflow-auto">
          {favList.length > 0 && (
            <div>
              <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium bg-muted/20">
                Favorites
              </div>
              {favList.map((t) => (
                <SwitcherRow key={`fav-${t.symbol}`} t={t} active={decodeSymbol(t.symbol) === current} onPick={() => { setOpen(false); navigate(`/trade/${encodeSymbol(t.symbol)}`); }} />
              ))}
            </div>
          )}
          <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium bg-muted/20">
            All markets
          </div>
          {otherList.map((t) => (
            <SwitcherRow key={t.symbol} t={t} active={decodeSymbol(t.symbol) === current} onPick={() => { setOpen(false); navigate(`/trade/${encodeSymbol(t.symbol)}`); }} />
          ))}
          {list.length === 0 && (
            <div className="px-4 py-6 text-center text-xs text-muted-foreground">No matches.</div>
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
          {baseAsset(t.symbol)}<span className="text-[10px] text-muted-foreground font-normal">/{quoteAsset(t.symbol)}</span>
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
// Animated price (flashes on update)
// ──────────────────────────────────────────────────────────────────
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

// ──────────────────────────────────────────────────────────────────
// Main Trade page
// ──────────────────────────────────────────────────────────────────
type OrderType = "limit" | "market" | "stop";

const FEE_TAKER_DEFAULT = 0.001; // 0.10% fallback
const FEE_MAKER_DEFAULT = 0.0008; // 0.08% fallback

export default function Trade() {
  const params = useParams<{ symbol?: string }>();
  const symbol = decodeSymbol(params.symbol || "BTC_INR");
  const [base, quote = "INR"] = symbol.split("/");
  const ticker = useTicker(symbol);
  const orderbook = useOrderbook(symbol, 25);
  const trades = useRecentTrades(symbol, 100);
  const { user } = useAuth();
  const qc = useQueryClient();
  const { favs, toggle: toggleFav } = useFavorites();
  const isFav = favs.has(symbol);

  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [type, setType] = useState<OrderType>("limit");
  const [price, setPrice] = useState("");
  const [stopPrice, setStopPrice] = useState("");
  const [amount, setAmount] = useState("");
  const [pctSlider, setPctSlider] = useState<number[]>([0]);
  const [postOnly, setPostOnly] = useState(false);
  const [reduceOnly, setReduceOnly] = useState(false);
  const [slTpEnabled, setSlTpEnabled] = useState(false);
  const [slPrice, setSlPrice] = useState("");
  const [tpPrice, setTpPrice] = useState("");
  const [bookAggregation, setBookAggregation] = useState<"0.01" | "0.1" | "1" | "10">("0.1");
  const [bottomTab, setBottomTab] = useState<"open" | "history">("open");
  const [pairScope, setPairScope] = useState<"this" | "all">("this");
  const [fillsOrderId, setFillsOrderId] = useState<number | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<null | {
    action: "BUY" | "SELL" | "HOLD";
    confidence: number;
    suggestedPrice: string;
    suggestedAmount: string;
    reasoning: string[];
    riskLevel: "Low" | "Medium" | "High";
  }>(null);
  // "Recent Trades" panel toggle: market-wide tape (default) vs only this user's
  // own fills for this pair. The market tape comes from the WebSocket feed
  // (everyone's prints) — that's the standard exchange behaviour but it can
  // confuse users who think they're seeing other people's orders. The "Mine"
  // tab shows only their own filled trades for the current symbol.
  const [tradeFeed, setTradeFeed] = useState<"market" | "mine">("market");
  const [layoutMode, setLayoutMode] = useState<LayoutMode>(() => {
    try {
      const v = window.localStorage.getItem(LAYOUT_KEY);
      if (v === "simple" || v === "advanced" || v === "pro") return v;
    } catch { /* ignore */ }
    return "advanced";
  });
  useEffect(() => {
    try { window.localStorage.setItem(LAYOUT_KEY, layoutMode); } catch { /* ignore */ }
    if (layoutMode === "simple" && type === "stop") setType("limit");
  }, [layoutMode, type]);
  const isSimple = layoutMode === "simple";
  const isPro = layoutMode === "pro";
  const bookRows = isPro ? 16 : 12;

  // ─── Keyboard shortcuts (B=buy, S=sell, ignore when typing) ──────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) return;
      if (e.key === "b" || e.key === "B") setSide("buy");
      if (e.key === "s" || e.key === "S") setSide("sell");
      if (e.key === "1") setType("limit");
      if (e.key === "2") setType("market");
      if (e.key === "3") setType("stop");
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const lastPx = ticker?.lastPrice || 0;
  const pct = ticker?.priceChangePercent || 0;
  const high = ticker?.high || 0;
  const low = ticker?.low || 0;
  const vol = ticker?.volume || 0;
  const quoteVol = ticker?.quoteVolume || 0;
  const flash = useFlashOnChange(lastPx);


  // ─── Active pairs (server-filtered: status=active + tradingEnabled
  //     + both coins listed). Used to filter the SymbolSwitcher and to
  //     normalize compact pair labels in the orders table without any
  //     hardcoded quote-coin list. ────────────────────────────────────
  const { data: pairsData } = useQuery<any[]>({
    queryKey: ["pairs", "active"],
    queryFn: () => get("/pairs"),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const enabledPairSet = useMemo(() => {
    const s = new Set<string>();
    for (const p of pairsData || []) {
      const b = p?.baseSymbol; const q = p?.quoteSymbol;
      if (b && q) s.add(`${b}/${q}`);
    }
    return s;
  }, [pairsData]);
  const enabledQuotes = useMemo(() => {
    const s = new Set<string>();
    for (const p of pairsData || []) if (p?.quoteSymbol) s.add(String(p.quoteSymbol));
    // Sort longest-first so "USDT" matches before "USD" (if both ever exist).
    return Array.from(s).sort((a, b) => b.length - a.length);
  }, [pairsData]);

  // ─── Pair ID (needed for DB-backed recent trades) ───────────────
  const pairId = useMemo(() => {
    const p = (pairsData || []).find((x: any) => x.baseSymbol === base && x.quoteSymbol === quote);
    return p?.id as number | undefined;
  }, [pairsData, base, quote]);

  // ─── DB-backed recent trades (fallback when Redis / WS is empty) ──
  // Polls every 15s so newly executed trades always appear even when
  // the matching engine's Redis list is stale or empty.
  const { data: dbTradesRaw, isLoading: dbTradesLoading } = useQuery<any[]>({
    queryKey: ["recent-trades-db", pairId],
    queryFn: () => get(`/recent-trades?pairId=${pairId}&limit=100`),
    enabled: !!pairId,
    staleTime: 10_000,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });
  const dbTrades = useMemo(() => {
    const arr: any[] = Array.isArray(dbTradesRaw) ? dbTradesRaw : [];
    return arr.map((r: any) => ({
      price: Number(r.price),
      qty: Number(r.qty),
      side: (String(r.side || "buy").toLowerCase() === "sell" ? "sell" : "buy") as "buy" | "sell",
      isBuyerMaker: String(r.side || "").toLowerCase() === "sell",
      ts: Number(r.ts ?? r.createdAt ? new Date(r.createdAt).getTime() : Date.now()),
    })).filter((t) => t.price > 0);
  }, [dbTradesRaw]);

  // ─── Wallet + balances ────────────────────────────
  // 5s polling + window-focus refetch keeps the buy/sell "Available"
  // strip live without us needing to invalidate from every interaction.
  const { data: walletData } = useQuery<any>({
    queryKey: ["wallet"],
    queryFn: () => get("/finance/wallet"),
    enabled: !!user,
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
  });

  // Fetch user's actual VIP fee rates — fallback to defaults when not logged in.
  const { data: feesData } = useQuery<any>({
    queryKey: ["fees", "my"],
    queryFn: () => get("/fees/my"),
    enabled: !!user,
    staleTime: 60_000,
    refetchInterval: 300_000,
  });
  const feeRateTaker = (user && feesData?.currentTier)
    ? Number(feesData.currentTier.spotTaker ?? (FEE_TAKER_DEFAULT * 100)) / 100
    : FEE_TAKER_DEFAULT;
  const feeRateMaker = (user && feesData?.currentTier)
    ? Number(feesData.currentTier.spotMaker ?? (FEE_MAKER_DEFAULT * 100)) / 100
    : FEE_MAKER_DEFAULT;
  const wallets: any[] = useMemo(() => {
    if (!walletData) return [];
    if (Array.isArray(walletData)) return walletData;
    if (Array.isArray(walletData.items)) return walletData.items;
    if (Array.isArray(walletData.wallets)) return walletData.wallets;
    if (Array.isArray(walletData.data)) return walletData.data;
    return [];
  }, [walletData]);
  const findWallet = (sym: string) => {
    const matches = wallets.filter(w => (w.currency || w.symbol || w.coin) === sym);
    // INR spot orders use the FIAT (inr) wallet on the server side; every other
    // currency uses the SPOT wallet. Match that preference here so the displayed
    // balance reflects what the order engine will actually debit.
    const preferType = sym === "INR" ? "FIAT" : "SPOT";
    return matches.find(w => w.type === preferType) ?? matches[0];
  };
  const availOf = (w: any) => {
    if (!w) return 0;
    if (w.available != null) return Number(w.available);
    if (w.free != null) return Number(w.free);
    // `balance` is the NET available amount — locked amounts are already deducted
    // from `balance` when orders/AI-trading investments are placed. `inOrder` /
    // `locked` is purely informational (shown in Wallet page) and must NOT be
    // subtracted again here.
    return Math.max(0, Number(w.balance ?? 0));
  };
  const baseBal = findWallet(base);
  const quoteBal = findWallet(quote);
  const availBuy = availOf(quoteBal);
  const availSell = availOf(baseBal);

  // ─── AI Trade suggestion generator ───────────────────────────────
  const generateAiSuggestion = useCallback(() => {
    if (!lastPx) return;
    setAiLoading(true);
    setAiSuggestion(null);
    setTimeout(() => {
      const range = high - low || 1;
      const posInRange = low > 0 ? (lastPx - low) / range : 0.5;
      const momentum = pct;
      const volRatio = quoteVol > 0 ? Math.min(vol / (quoteVol / lastPx), 2) : 1;

      let score = 0;
      const reasons: string[] = [];

      if (momentum > 3)       { score += 2; reasons.push(`Strong upward momentum +${momentum.toFixed(1)}%`); }
      else if (momentum > 0)  { score += 1; reasons.push(`Positive trend +${momentum.toFixed(1)}%`); }
      else if (momentum < -3) { score -= 2; reasons.push(`Bearish momentum ${momentum.toFixed(1)}%`); }
      else                    { score -= 1; reasons.push(`Slight pullback ${momentum.toFixed(1)}%`); }

      if (posInRange < 0.25)      { score += 2; reasons.push("Price near 24h support level"); }
      else if (posInRange > 0.80) { score -= 1; reasons.push("Price approaching 24h resistance"); }
      else                        { reasons.push(`Mid-range position (${(posInRange * 100).toFixed(0)}% of day range)`); }

      if (volRatio > 1.3)      { score += 1; reasons.push("Above-average volume — strong participation"); }
      else if (volRatio < 0.7) { score -= 1; reasons.push("Below-average volume — weak conviction"); }
      else                     { reasons.push("Normal trading volume"); }

      const action: "BUY" | "SELL" | "HOLD" =
        score >= 2 ? "BUY" : score <= -2 ? "SELL" : "HOLD";
      const confidence = Math.min(95, Math.max(52, 65 + Math.abs(score) * 8));
      const riskLevel: "Low" | "Medium" | "High" =
        Math.abs(momentum) > 5 || posInRange > 0.85 ? "High" : Math.abs(momentum) > 2 ? "Medium" : "Low";

      const priceFactor = action === "BUY" ? 0.998 : action === "SELL" ? 1.002 : 1;
      const suggestedPrice = (lastPx * priceFactor).toFixed(quote === "INR" ? 2 : 4);

      const avail = side === "buy" ? availBuy : availSell;
      const rawAmt = action === "BUY" ? (avail * 0.1) / lastPx : avail * 0.1;
      const suggestedAmount = rawAmt > 0 ? rawAmt.toFixed(6) : "0.001";

      setAiSuggestion({ action, confidence, suggestedPrice, suggestedAmount, reasoning: reasons, riskLevel });
      setAiLoading(false);
    }, 1100);
  }, [lastPx, pct, high, low, vol, quoteVol, availBuy, availSell, side, quote]);

  // Refresh wallet, orders and history the instant the user switches pair
  // so the right "Available" / orderbook depth / open orders show up
  // without waiting for the next polling tick.
  useEffect(() => {
    qc.invalidateQueries({ queryKey: ["wallet"] });
    qc.invalidateQueries({ queryKey: ["orders"] });
  }, [symbol, qc]);

  // ─── Orders ────────────────────────────
  const { data: openOrders } = useQuery<any>({
    queryKey: ["orders", "open", base, quote, pairScope],
    queryFn: () => pairScope === "this"
      ? get(`/exchange/order?status=OPEN&currency=${encodeURIComponent(base)}&pair=${encodeURIComponent(quote)}`)
      : get(`/exchange/order?status=OPEN`),
    enabled: !!user,
    refetchInterval: 5000,
  });
  const orderRows: any[] = useMemo(() => {
    if (!openOrders) return [];
    if (Array.isArray(openOrders)) return openOrders;
    if (Array.isArray(openOrders.items)) return openOrders.items;
    if (Array.isArray(openOrders.orders)) return openOrders.orders;
    if (Array.isArray(openOrders.data)) return openOrders.data;
    return [];
  }, [openOrders]);

  const { data: historyData } = useQuery<any>({
    queryKey: ["orders", "history", base, quote, bottomTab, pairScope],
    queryFn: () => pairScope === "this"
      ? get(`/exchange/order?currency=${encodeURIComponent(base)}&pair=${encodeURIComponent(quote)}&limit=30`)
      : get(`/exchange/order?limit=50`),
    enabled: !!user && bottomTab === "history",
    refetchInterval: 15000,
  });
  const historyRows: any[] = useMemo(() => {
    if (!historyData) return [];
    if (Array.isArray(historyData)) return historyData;
    if (Array.isArray(historyData.items)) return historyData.items;
    if (Array.isArray(historyData.orders)) return historyData.orders;
    if (Array.isArray(historyData.data)) return historyData.data;
    return [];
  }, [historyData]);

  // ─── My Trades (per-symbol) ──────────────────
  // /api/trades is server-scoped to the logged-in user (filters out bot orders
  // via NOT EXISTS). Adding ?symbol=BTCINR also restricts to the active pair.
  const compactSym = `${base}${quote}`;
  const { data: myTradesData } = useQuery<any[]>({
    queryKey: ["my-trades", compactSym],
    queryFn: () => get(`/trades?symbol=${encodeURIComponent(compactSym)}&limit=50`),
    enabled: !!user && tradeFeed === "mine",
    refetchInterval: 10000,
  });
  const myTrades = useMemo(() => {
    // /api/trades returns { data: [], nextCursor, count } — extract the array
    const raw = myTradesData as any;
    const rows: any[] = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
    return rows.map((r) => ({
      side: String(r.side || "").toLowerCase() as "buy" | "sell",
      price: Number(r.price ?? 0),
      qty: Number(r.qty ?? 0),
      ts: r.createdAt ? new Date(r.createdAt).getTime() : Date.now(),
    }));
  }, [myTradesData]);

  const [chartView, setChartView] = useState<"price" | "depth">("price");

  const pendingOrderRef = useRef<{
    side: "buy" | "sell"; orderType: string; base: string;
    quote: string; amount: string; price: string;
  } | null>(null);
  const pendingPayloadRef = useRef<Record<string, any> | null>(null);
  const [confirmOrderOpen, setConfirmOrderOpen] = useState(false);
  const [confirmCancelAll, setConfirmCancelAll] = useState(false);

  // ─── Mutations ────────────────────────────
  const orderMutation = useMutation({
    mutationFn: (data: any) => post("/exchange/order", data),
    onSuccess: (_res: any) => {
      const p = pendingOrderRef.current;
      if (p) {
        const sideLabel = p.side === "buy" ? "▲ Buy" : "▼ Sell";
        const typeLabel = p.orderType === "market" ? "market order" : `limit @ ${p.price} ${p.quote}`;
        toast.success(`${sideLabel} ${typeLabel}`, {
          description: `${Number(p.amount).toFixed(6).replace(/\.?0+$/, "")} ${p.base} · ${p.base}/${p.quote}`,
        });
      }
      setPrice("");
      setAmount("");
      setStopPrice("");
      setSlPrice("");
      setTpPrice("");
      setPctSlider([0]);
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["wallet"] });
      qc.invalidateQueries({ queryKey: ["my-trades"] });
    },
    onError: (err: any) => toast.error(err?.message || "Failed to place order"),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string | number) => del(`/exchange/order/${id}`),
    onSuccess: () => {
      toast.success("Order cancelled");
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["wallet"] });
    },
    onError: (err: any) => toast.error(err?.message || "Cancel failed"),
  });

  const cancelAllMutation = useMutation({
    mutationFn: async () => {
      await Promise.all(orderRows.map((o) => del(`/exchange/order/${o.id}`).catch(() => null)));
    },
    onSuccess: () => {
      toast.success("All open orders cancelled");
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["wallet"] });
    },
  });

  // ─── Handlers ────────────────────────────
  const handleOrder = () => {
    if (!user) { toast.error("Please log in to trade"); return; }
    if ((user.kycLevel ?? 0) < 1) { toast.error("Complete KYC Level 1 to start trading", { description: "Go to Profile → KYC to verify your identity." }); return; }
    const amt = Number(amount);
    if (!(amt > 0)) { toast.error("Enter an amount"); return; }
    if (type !== "market" && !(Number(price) > 0)) { toast.error("Enter a price"); return; }
    if (type === "stop" && !(Number(stopPrice) > 0)) { toast.error("Enter a stop trigger price"); return; }
    const slNum = slTpEnabled && slPrice ? Number(slPrice) : undefined;
    const tpNum = slTpEnabled && tpPrice ? Number(tpPrice) : undefined;
    pendingOrderRef.current = { side: side as "buy" | "sell", orderType: type, base, quote, amount, price };
    pendingPayloadRef.current = {
      currency: base, pair: quote, side, type, amount: amt,
      price: type !== "market" ? Number(price) : undefined,
      stopPrice: type === "stop" ? Number(stopPrice) : undefined,
      postOnly: type === "limit" ? postOnly : undefined,
      reduceOnly: type !== "market" ? reduceOnly : undefined,
      slPrice: slNum && slNum > 0 ? slNum : undefined,
      tpPrice: tpNum && tpNum > 0 ? tpNum : undefined,
    };
    setConfirmOrderOpen(true);
  };

  const executeOrder = () => {
    if (!pendingPayloadRef.current) return;
    setConfirmOrderOpen(false);
    orderMutation.mutate(pendingPayloadRef.current);
  };

  const setPct = (p: number) => {
    setPctSlider([Math.round(p * 100)]);
    const px = type !== "market" ? Number(price) : lastPx;
    if (side === "buy") {
      const total = availBuy * p;
      if (px > 0) setAmount((total / px).toFixed(6));
    } else {
      setAmount((availSell * p).toFixed(6));
    }
  };

  // Sync amount when slider changes manually
  const onSliderChange = (vals: number[]) => {
    setPctSlider(vals);
    setPct((vals[0] || 0) / 100);
  };

  const fillFromOrderbook = (px: number, qty: number, asSide: "buy" | "sell") => {
    setSide(asSide);
    if (type === "market") setType("limit");
    setPrice(String(px));
    setAmount(String(qty));
  };

  // ─── Derived ────────────────────────────
  const effectivePx = type !== "market" ? Number(price) || 0 : lastPx;
  const total = Number(amount || 0) * effectivePx;
  const fee = total * (postOnly ? feeRateMaker : feeRateTaker);
  const totalWithFee = side === "buy" ? total + fee : total - fee;

  const maxBidQty = Math.max(1, ...orderbook.bids.slice(0, 14).map(([, q]) => q));
  const maxAskQty = Math.max(1, ...orderbook.asks.slice(0, 14).map(([, q]) => q));
  const bestBid = orderbook.bids[0]?.[0] || 0;
  const bestAsk = orderbook.asks[0]?.[0] || 0;
  const spread = bestAsk && bestBid ? bestAsk - bestBid : 0;
  const spreadPct = bestBid > 0 ? (spread / bestBid) * 100 : 0;

  // Bottom Open Orders / History panel — used on desktop inside the chart
  // column and on mobile as a standalone section at the bottom.
  const bottomOrdersJsx = !isSimple && (
    <Tabs value={bottomTab} onValueChange={(v) => setBottomTab(v as "open" | "history")} className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 border-b border-border">
        <TabsList className="bg-transparent h-9 p-0 gap-1">
          <TabsTrigger value="open" className="text-xs h-9 px-3 data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-foreground rounded-none">
            Open Orders <span className="ml-1.5 text-[10px] text-muted-foreground">({orderRows.length})</span>
          </TabsTrigger>
          <TabsTrigger value="history" className="text-xs h-9 px-3 data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-foreground rounded-none">
            Order History
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
          {bottomTab === "open" && orderRows.length > 0 && (
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
      <TabsContent value="open" className="flex-1 m-0 overflow-auto">
        <OrdersTable rows={orderRows} loading={!user} mode="open" onCancel={(id) => cancelMutation.mutate(id)} cancelingId={cancelMutation.variables as any} quotesForLabel={enabledQuotes} onViewFills={(id) => setFillsOrderId(Number(id))} />
      </TabsContent>
      <TabsContent value="history" className="flex-1 m-0 overflow-auto">
        <OrdersTable rows={historyRows} loading={!user} mode="history" quotesForLabel={enabledQuotes} onViewFills={(id) => setFillsOrderId(Number(id))} />
      </TabsContent>
    </Tabs>
  );

  return (
    <div className="flex-1 flex flex-col min-h-[calc(100vh-56px)] lg:h-[calc(100vh-56px)] bg-background">
      {/* ── Header strip ───────────────────────────────── */}
      <div className="border-b border-border bg-card/60 backdrop-blur shrink-0">
        <div className="flex items-center px-2 sm:px-4 gap-2 sm:gap-5 h-16 overflow-x-auto">
          <button
            type="button"
            onClick={() => toggleFav(symbol)}
            className={`p-1.5 rounded hover:bg-muted/40 transition flex-shrink-0 ${isFav ? "text-amber-400" : "text-muted-foreground/40 hover:text-amber-400"}`}
            aria-label={isFav ? "Remove from favorites" : "Add to favorites"}
          >
            <Star className={`h-4 w-4 ${isFav ? "fill-current" : ""}`} />
          </button>
          <SymbolSwitcher current={symbol} enabledPairSet={enabledPairSet} />

          {/* Spot / Futures mode toggle */}
          <div className="flex items-center gap-0.5 p-0.5 bg-muted/40 rounded-md border border-border flex-shrink-0">
            <span className="px-3 py-1 text-[11px] font-bold rounded-sm bg-card text-foreground shadow-sm">Spot</span>
            <Link href={`/futures`} className="px-3 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground rounded-sm transition-colors">Futures</Link>
          </div>

          <div className="h-8 w-px bg-border flex-shrink-0 hidden sm:block" />

          <div className="flex flex-col items-start flex-shrink-0">
            <div className="text-[10px] uppercase text-muted-foreground tracking-wider hidden sm:block">Last Price</div>
            <div className={`font-mono font-extrabold text-base sm:text-xl tabular-nums leading-tight transition-colors ${
              flash === "up" ? "text-success" : flash === "down" ? "text-destructive" : pct >= 0 ? "text-success" : "text-destructive"
            }`}>
              {fmtPrice(lastPx, quote)}
            </div>
          </div>

          <Stat label="24h Change" tone={pct >= 0 ? "success" : "destructive"}>
            <span className="font-mono tabular-nums">
              {pct >= 0 ? "+" : ""}{fmtNum(pct, 2)}%
            </span>
          </Stat>
          <Stat label="24h High" className="hidden sm:flex">{fmtPrice(high, quote)}</Stat>
          <Stat label="24h Low" className="hidden sm:flex">{fmtPrice(low, quote)}</Stat>
          <Stat label={`24h Vol (${base})`} className="hidden md:flex">{fmtCompact(vol)}</Stat>
          <Stat label={`24h Vol (${quote})`} className="hidden md:flex">{fmtCompact(quoteVol, quote === "INR" ? "₹" : "")}{quote !== "INR" && quote ? ` ${quote}` : ""}</Stat>

          {/* Layout switcher (right) */}
          <div className="ml-auto flex items-center gap-2 flex-shrink-0">
            {/* AI Trade button — top bar */}
            <button
              type="button"
              disabled={!lastPx}
              onClick={() => { setAiOpen(true); generateAiSuggestion(); }}
              title="AI Trade Suggestion"
              className={cn(
                "hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-bold transition-all border flex-shrink-0",
                "bg-gradient-to-r from-violet-600/20 via-purple-600/20 to-amber-500/20",
                "border-violet-500/40 hover:border-violet-400/70 text-violet-300 hover:text-violet-200",
                "hover:from-violet-600/30 hover:via-purple-600/30 hover:to-amber-500/30",
                "disabled:opacity-40 disabled:cursor-not-allowed",
              )}
            >
              <Brain className="h-3 w-3 text-amber-400" />
              <span className="hidden md:inline">AI Trade</span>
              <Sparkles className="h-2.5 w-2.5 text-violet-400" />
            </button>

            <span className="text-[10px] uppercase text-muted-foreground tracking-wider hidden xl:inline">View</span>
            <div className="inline-flex items-center bg-muted/30 rounded-md p-0.5 border border-border">
              {([
                { id: "simple" as const, label: "Simple", icon: LayoutPanelLeft },
                { id: "advanced" as const, label: "Advanced", icon: LayoutGrid },
                { id: "pro" as const, label: "Pro", icon: Sparkles },
              ]).map((m) => {
                const Icon = m.icon;
                const active = layoutMode === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setLayoutMode(m.id)}
                    title={`${m.label} layout`}
                    className={`px-2 sm:px-2.5 py-1 text-[11px] font-semibold rounded inline-flex items-center gap-1 transition-colors ${
                      active
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                    }`}
                  >
                    <Icon className="h-3 w-3" />
                    <span className="hidden sm:inline">{m.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── Body ───────────────────────────────── */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0 lg:overflow-hidden">
        {/* Orderbook + Recent trades. Side-by-side on mobile, stacked column on desktop LEFT. */}
        {!isSimple && (
        <div className={`order-3 lg:order-1 w-full ${isPro ? "lg:w-72" : "lg:w-64"} flex flex-col bg-card/40 shrink-0 border-t lg:border-t-0 lg:border-r border-border h-[44vh] lg:h-auto`}>
          <div className="flex flex-row lg:flex-col h-full min-h-0">
          {/* Orderbook — shrinks to content, caps at 55% so recent trades fills the gap */}
          <div className="w-1/2 lg:w-full flex flex-col border-r lg:border-r-0 lg:border-b border-border min-h-0 lg:max-h-[55%]">
            <div className="px-3 py-2 flex items-center justify-between border-b border-border">
              <span className="font-semibold text-[11px] uppercase tracking-wider text-muted-foreground">Order Book</span>
              <Popover>
                <PopoverTrigger asChild>
                  <button className="text-[10px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                    Tick {bookAggregation} <ChevronDown className="h-3 w-3" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-28 p-1">
                  {(["0.01", "0.1", "1", "10"] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setBookAggregation(v)}
                      className={`w-full text-left px-2 py-1 rounded text-xs hover:bg-muted/50 ${bookAggregation === v ? "bg-primary/15 text-primary" : ""}`}
                    >
                      Tick {v}
                    </button>
                  ))}
                </PopoverContent>
              </Popover>
            </div>
            <div className="flex-1 overflow-auto px-2 py-1 text-xs font-mono">
              <div className="grid grid-cols-3 text-[10px] text-muted-foreground py-1 px-1 sticky top-0 bg-card/40 backdrop-blur z-10">
                <span>Price ({quote})</span>
                <span className="text-right">Amount ({base})</span>
                <span className="text-right">Total ({quote})</span>
              </div>
              {/* Asks reversed (lowest near spread) */}
              {(() => {
                const asks = orderbook.asks.slice(0, bookRows);
                const totalAskQty = asks.reduce((s, [, q]) => s + q, 0) || 1;
                let cumAsk = 0;
                const cumAsks: number[] = [];
                let cumAskVal = 0;
                const cumAskVals: number[] = [];
                for (const [px, q] of asks) {
                  cumAsk += q;    cumAsks.push(cumAsk);
                  cumAskVal += px * q; cumAskVals.push(cumAskVal);
                }
                return asks.slice().reverse().map(([px, qty], i) => {
                  const cumIdx = asks.length - 1 - i;
                  const cumPct = ((cumAsks[cumIdx] ?? 0) / totalAskQty) * 100;
                  const rowPct = (qty / (maxAskQty || 1)) * 100;
                  const totalVal = cumAskVals[cumIdx] ?? 0;
                  return (
                    <button
                      key={`ask-${i}`}
                      type="button"
                      onClick={() => fillFromOrderbook(px, qty, "buy")}
                      className="relative grid grid-cols-3 py-[2px] px-1 w-full hover:bg-destructive/10 transition-colors"
                    >
                      <div className="absolute right-0 top-0 bottom-0 bg-destructive/[0.07] pointer-events-none" style={{ width: `${cumPct}%` }} />
                      <div className="absolute right-0 top-0 bottom-0 bg-destructive/[0.14] pointer-events-none" style={{ width: `${rowPct}%` }} />
                      <span className="relative text-destructive tabular-nums text-left text-[11px]">{fmtNum(px, quote === "INR" ? 2 : 5)}</span>
                      <span className="relative text-right tabular-nums text-[11px]">{fmtNum(qty, 5)}</span>
                      <span className="relative text-right tabular-nums text-muted-foreground/70 text-[10px]">{fmtNum(totalVal, quote === "INR" ? 0 : 2)}</span>
                    </button>
                  );
                });
              })()}
              {/* Spread row */}
              <div className="my-1 border-y border-border bg-muted/20 px-2 py-1.5 flex items-center justify-between">
                <span className={`font-bold text-sm tabular-nums ${pct >= 0 ? "text-success" : "text-destructive"}`}>
                  {fmtPrice(lastPx, quote)}
                </span>
                <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
                  <ArrowUpDown className="h-3 w-3" />
                  Spread {spread > 0 ? `${fmtNum(spread, quote === "INR" ? 2 : 5)} (${spreadPct.toFixed(3)}%)` : "—"}
                </span>
              </div>
              {/* Bids */}
              {(() => {
                const bids = orderbook.bids.slice(0, bookRows);
                const totalBidQty = bids.reduce((s, [, q]) => s + q, 0) || 1;
                let cumBid = 0;
                let cumBidVal = 0;
                return bids.map(([px, qty], i) => {
                  cumBid += qty;
                  cumBidVal += px * qty;
                  const cumPct = (cumBid / totalBidQty) * 100;
                  const rowPct = (qty / (maxBidQty || 1)) * 100;
                  return (
                    <button
                      key={`bid-${i}`}
                      type="button"
                      onClick={() => fillFromOrderbook(px, qty, "sell")}
                      className="relative grid grid-cols-3 py-[2px] px-1 w-full hover:bg-success/10 transition-colors"
                    >
                      <div className="absolute right-0 top-0 bottom-0 bg-success/[0.07] pointer-events-none" style={{ width: `${cumPct}%` }} />
                      <div className="absolute right-0 top-0 bottom-0 bg-success/[0.14] pointer-events-none" style={{ width: `${rowPct}%` }} />
                      <span className="relative text-success tabular-nums text-left text-[11px]">{fmtNum(px, quote === "INR" ? 2 : 5)}</span>
                      <span className="relative text-right tabular-nums text-[11px]">{fmtNum(qty, 5)}</span>
                      <span className="relative text-right tabular-nums text-muted-foreground/70 text-[10px]">{fmtNum(cumBidVal, quote === "INR" ? 0 : 2)}</span>
                    </button>
                  );
                });
              })()}
              {orderbook.bids.length === 0 && orderbook.asks.length === 0 && (
                <div className="animate-pulse px-1 py-1 space-y-[3px]">
                  {/* Ask shimmer rows — red tint */}
                  {Array.from({ length: 10 }).map((_, i) => (
                    <div key={`ask-sh-${i}`} className="grid grid-cols-3 py-[2px] gap-2">
                      <div className="h-3 rounded bg-destructive/20" style={{ width: `${55 + Math.random() * 35}%` }} />
                      <div className="h-3 rounded bg-muted/40 ml-auto" style={{ width: `${40 + Math.random() * 40}%` }} />
                      <div className="h-3 rounded bg-muted/30 ml-auto" style={{ width: `${30 + Math.random() * 40}%` }} />
                    </div>
                  ))}
                  {/* Spread shimmer */}
                  <div className="my-1 border-y border-border bg-muted/20 px-2 py-1.5 flex items-center gap-3">
                    <div className="h-4 w-20 rounded bg-muted/50" />
                    <div className="h-3 w-24 rounded bg-muted/30 ml-auto" />
                  </div>
                  {/* Bid shimmer rows — green tint */}
                  {Array.from({ length: 10 }).map((_, i) => (
                    <div key={`bid-sh-${i}`} className="grid grid-cols-3 py-[2px] gap-2">
                      <div className="h-3 rounded bg-success/20" style={{ width: `${55 + Math.random() * 35}%` }} />
                      <div className="h-3 rounded bg-muted/40 ml-auto" style={{ width: `${40 + Math.random() * 40}%` }} />
                      <div className="h-3 rounded bg-muted/30 ml-auto" style={{ width: `${30 + Math.random() * 40}%` }} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          {/* Recent trades — fills remaining space below orderbook */}
          <div className="w-1/2 lg:w-full lg:flex-1 flex flex-col min-h-0">
            <div className="px-3 py-2 flex items-center justify-between border-b border-border gap-2">
              {/* Market vs Mine toggle. "Market" = public tape (everyone's prints,
                  standard exchange feature). "Mine" = only this user's filled
                  trades for the current pair (server-scoped). */}
              <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider">
                <button
                  type="button"
                  onClick={() => setTradeFeed("market")}
                  className={cn(
                    "px-2 py-0.5 rounded transition-colors",
                    tradeFeed === "market"
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  data-testid="recent-trades-tab-market"
                >
                  Market
                </button>
                <button
                  type="button"
                  onClick={() => setTradeFeed("mine")}
                  disabled={!user}
                  className={cn(
                    "px-2 py-0.5 rounded transition-colors",
                    tradeFeed === "mine"
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:text-foreground disabled:opacity-50",
                  )}
                  data-testid="recent-trades-tab-mine"
                >
                  Mine
                </button>
              </div>
              <span className="text-[10px] text-muted-foreground">
                {tradeFeed === "market"
                  ? (trades.length === 0 && dbTradesLoading ? "loading…" : `${(trades.length > 0 ? trades : dbTrades).length} prints`)
                  : `${myTrades.length} fills`}
              </span>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-2 py-1 text-xs font-mono">
              <div className="grid grid-cols-3 text-[10px] text-muted-foreground py-1 px-1 sticky top-0 bg-card/40 backdrop-blur z-10">
                <span>Price ({quote})</span>
                <span className="text-right">Amount ({base})</span>
                <span className="text-right">Time</span>
              </div>
              {(() => {
                const MIN_ROWS = 22;
                const displayList = (tradeFeed === "market"
                  ? (trades.length > 0 ? trades : dbTrades).slice(0, 100)
                  : myTrades.slice(0, 100));
                const isMarketLoading = tradeFeed === "market" && trades.length === 0 && dbTrades.length === 0 && dbTradesLoading;
                const padCount = Math.max(0, MIN_ROWS - displayList.length);
                // deterministic widths so React doesn't re-render shimmer rows on every tick
                const W1 = [55,72,60,80,50,68,75,58,65,82,53,70,63,78,56,73,61,79,52,67,76,59];
                const W2 = [60,45,70,50,65,55,75,40,68,48,72,42,62,58,78,44,66,52,74,46,64,56];
                const W3 = [45,55,35,65,40,60,30,70,38,58,42,62,32,68,36,64,34,72,48,54,38,66];
                return (
                  <>
                    {displayList.map((t, i) => (
                      <div key={i} className="grid grid-cols-3 py-[2px] px-1 hover:bg-muted/20 transition-colors rounded">
                        <span className={`tabular-nums ${t.side === "buy" ? "text-success" : "text-destructive"}`}>{fmtNum(t.price, quote === "INR" ? 2 : 5)}</span>
                        <span className="text-right tabular-nums">{fmtNum(t.qty, 5)}</span>
                        <span className="text-right text-muted-foreground">{new Date(t.ts).toLocaleTimeString([], { hour12: false })}</span>
                      </div>
                    ))}
                    {/* Shimmer pad — shown while loading OR when fewer than MIN_ROWS */}
                    {(isMarketLoading || padCount > 0) && (
                      <div className="animate-pulse space-y-[3px] pt-[2px]">
                        {Array.from({ length: isMarketLoading ? MIN_ROWS : padCount }).map((_, i) => (
                          <div key={`sh-${i}`} className="grid grid-cols-3 py-[2px] px-1 gap-2">
                            <div
                              className={`h-3 rounded ${i % 4 === 0 ? "bg-destructive/20" : "bg-success/15"}`}
                              style={{ width: `${W1[i % W1.length]}%` }}
                            />
                            <div className="h-3 rounded bg-muted/35 ml-auto" style={{ width: `${W2[i % W2.length]}%` }} />
                            <div className="h-3 rounded bg-muted/25 ml-auto" style={{ width: `${W3[i % W3.length]}%` }} />
                          </div>
                        ))}
                      </div>
                    )}
                    {tradeFeed === "market" && trades.length === 0 && dbTrades.length === 0 && !dbTradesLoading && (
                      <div className="py-6 text-center text-muted-foreground text-xs">No recent trades</div>
                    )}
                  </>
                );
              })()}
              {tradeFeed === "mine" && myTrades.length === 0 && (
                <div className="py-6 text-center text-muted-foreground text-xs">
                  {user ? "You haven't made any trades on this pair yet." : "Log in to see your trade history."}
                </div>
              )}
            </div>
          </div>
          </div>
        </div>
        )}

        {/* Chart + bottom orders — CENTER column on desktop */}
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
              ? <PriceChart symbol={symbol} openOrders={orderRows} myTrades={myTrades} />
              : <DepthChart bids={orderbook.bids} asks={orderbook.asks} />
            }
          </div>

          {/* Bottom panel — desktop only (mobile renders it as a separate section below) */}
          {!isSimple && (
            <div className={`hidden lg:flex border-t border-border bg-card/60 ${isPro ? "h-60" : "h-56"} flex-col shrink-0`}>
              {bottomOrdersJsx}
            </div>
          )}
        </div>

        {/* ── Order Entry Sidebar ─────────────────────────────────── */}
        <div className={`order-2 lg:order-3 w-full ${isSimple ? "lg:max-w-sm lg:mx-auto" : "lg:w-[288px]"} flex flex-col shrink-0 lg:overflow-y-auto border-t lg:border-t-0 border-border`}
          style={{ background: "linear-gradient(180deg, hsl(var(--card)/0.7) 0%, hsl(var(--background)/0.5) 100%)" }}>
          <div className="p-3 space-y-2.5">

            {/* ── Balance widget ─────────────────────────────────── */}
            <div className={cn(
              "rounded-xl border px-3 py-2.5 transition-colors",
              side === "buy"
                ? "bg-emerald-500/5 border-emerald-500/20"
                : "bg-rose-500/5 border-rose-500/20",
            )}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                  {side === "buy" ? `${quote} Balance` : `${base} Balance`}
                </span>
                {user ? (
                  <Link href="/wallet" className="text-[10px] text-primary hover:underline flex items-center gap-0.5 font-semibold">
                    <WalletIcon className="h-2.5 w-2.5" />Deposit
                  </Link>
                ) : (
                  <span className="text-[10px] text-muted-foreground">—</span>
                )}
              </div>
              <div className="flex items-end justify-between gap-2">
                <span className="font-mono font-bold text-base tabular-nums text-foreground leading-none">
                  {user
                    ? (side === "buy" ? fmtBal(availBuy, 2) : fmtBal(availSell, 6))
                    : "—"}
                </span>
                <span className="text-[11px] text-muted-foreground font-mono leading-none pb-0.5">
                  {side === "buy" ? quote : base}
                </span>
              </div>
              {/* Utilization bar */}
              {user && total > 0 && (
                <div className="mt-2">
                  <div className="h-1 w-full rounded-full bg-white/8 overflow-hidden">
                    <div
                      className={cn("h-full rounded-full transition-all duration-300", side === "buy" ? "bg-emerald-500" : "bg-rose-500")}
                      style={{ width: `${Math.min(100, (total / Math.max(side === "buy" ? availBuy : availSell * effectivePx, 0.001)) * 100).toFixed(1)}%` }}
                    />
                  </div>
                  <div className="flex justify-between mt-0.5">
                    <span className="text-[9px] text-muted-foreground">Using {Math.min(100, (total / Math.max(side === "buy" ? availBuy : availSell * effectivePx, 0.001)) * 100).toFixed(0)}%</span>
                    <span className="text-[9px] font-mono text-muted-foreground">{fmtNum(total, 2)} {quote}</span>
                  </div>
                </div>
              )}
            </div>

            {/* ── Buy / Sell toggle ──────────────────────────────── */}
            <div className="grid grid-cols-2 gap-1 p-1 bg-muted/30 rounded-xl border border-border/60">
              <button
                type="button"
                onClick={() => setSide("buy")}
                className={cn(
                  "relative py-2.5 rounded-lg text-sm font-bold transition-all",
                  side === "buy"
                    ? "bg-gradient-to-b from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-900/40"
                    : "text-muted-foreground hover:text-foreground hover:bg-white/5",
                )}
              >
                <TrendingUp className="h-3.5 w-3.5 inline-block mr-1.5 -mt-0.5" />
                Buy {base}
                <span className={`absolute top-1 right-2 text-[8px] font-mono leading-none ${side === "buy" ? "text-emerald-100/50" : "text-muted-foreground/30"}`}>B</span>
              </button>
              <button
                type="button"
                onClick={() => setSide("sell")}
                className={cn(
                  "relative py-2.5 rounded-lg text-sm font-bold transition-all",
                  side === "sell"
                    ? "bg-gradient-to-b from-rose-500 to-rose-600 text-white shadow-lg shadow-rose-900/40"
                    : "text-muted-foreground hover:text-foreground hover:bg-white/5",
                )}
              >
                <TrendingDown className="h-3.5 w-3.5 inline-block mr-1.5 -mt-0.5" />
                Sell {base}
                <span className={`absolute top-1 right-2 text-[8px] font-mono leading-none ${side === "sell" ? "text-rose-100/50" : "text-muted-foreground/30"}`}>S</span>
              </button>
            </div>

            {/* ── Order type tabs ────────────────────────────────── */}
            <div className="flex gap-0.5 p-0.5 bg-muted/20 rounded-lg border border-border/40">
              {((isSimple ? ["limit", "market"] : ["limit", "market", "stop"]) as OrderType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={cn(
                    "flex-1 py-1.5 text-[11px] font-semibold rounded-md transition-all capitalize",
                    type === t
                      ? "bg-card text-foreground shadow-sm border border-border/60"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t === "stop" ? "Stop-Limit" : t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>

            {/* ── Stop trigger ───────────────────────────────────── */}
            {type === "stop" && (
              <FieldRow label="Trigger Price" right={
                <button type="button" className="text-primary text-[10px] font-semibold hover:underline" onClick={() => setStopPrice(String(lastPx || ""))}>use last</button>
              }>
                <div className="relative">
                  <Input type="number" inputMode="decimal" value={stopPrice} onChange={(e) => setStopPrice(e.target.value)} placeholder="0.00"
                    className="font-mono pr-14 h-10 bg-muted/20 border-border/60 focus:border-primary/50 focus:ring-1 focus:ring-primary/20 text-sm" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground font-mono">{quote}</span>
                </div>
              </FieldRow>
            )}

            {/* ── Price input ────────────────────────────────────── */}
            {type !== "market" ? (
              <FieldRow label="Price" right={
                <div className="flex gap-0.5">
                  {[
                    { label: "Bid", val: String(bestBid || lastPx), color: "text-emerald-400 hover:text-emerald-300" },
                    { label: "Last", val: String(lastPx || ""), color: "text-muted-foreground hover:text-foreground" },
                    { label: "Ask", val: String(bestAsk || lastPx), color: "text-rose-400 hover:text-rose-300" },
                  ].map(({ label, val, color }) => (
                    <button key={label} type="button"
                      className={cn("text-[10px] px-1.5 py-0.5 rounded bg-muted/40 hover:bg-muted/70 font-mono font-semibold transition-colors", color)}
                      onClick={() => setPrice(val)}>{label}</button>
                  ))}
                </div>
              }>
                <div className="relative">
                  <Input type="number" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00"
                    className="font-mono pr-14 h-10 bg-muted/20 border-border/60 focus:border-primary/50 focus:ring-1 focus:ring-primary/20 text-sm" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground font-mono">{quote}</span>
                </div>
              </FieldRow>
            ) : (
              <div className="rounded-lg bg-muted/20 border border-border/40 px-3 py-2.5 flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">Market Price</span>
                <span className={cn("font-mono font-bold tabular-nums text-sm", pct >= 0 ? "text-emerald-400" : "text-rose-400")}>{fmtPrice(lastPx, quote)}</span>
              </div>
            )}

            {/* ── Amount input ───────────────────────────────────── */}
            <FieldRow label={`Amount (${base})`}>
              <div className="relative">
                <Input type="number" inputMode="decimal" value={amount}
                  onChange={(e) => { setAmount(e.target.value); setPctSlider([0]); }}
                  placeholder="0.00"
                  className="font-mono pr-14 h-10 bg-muted/20 border-border/60 focus:border-primary/50 focus:ring-1 focus:ring-primary/20 text-sm" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground font-mono">{base}</span>
              </div>
            </FieldRow>

            {/* ── Percentage selector ────────────────────────────── */}
            <div className="space-y-2">
              <Slider value={pctSlider} onValueChange={onSliderChange} min={0} max={100} step={1} disabled={!user}
                className={cn("my-1", side === "buy" ? "[&>span]:bg-emerald-500" : "[&>span]:bg-rose-500")} />
              <div className="grid grid-cols-4 gap-1">
                {[0.25, 0.5, 0.75, 1].map((p) => {
                  const active = pctSlider[0] === p * 100;
                  return (
                    <button key={p} type="button" onClick={() => setPct(p)}
                      className={cn(
                        "py-1.5 rounded-lg text-[11px] font-bold transition-all border",
                        active && side === "buy"
                          ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-400"
                          : active && side === "sell"
                          ? "bg-rose-500/20 border-rose-500/50 text-rose-400"
                          : "bg-muted/20 border-border/40 text-muted-foreground hover:text-foreground hover:bg-muted/40",
                      )}
                    >
                      {p === 1 ? "MAX" : `${p * 100}%`}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ── Total ──────────────────────────────────────────── */}
            <FieldRow label={side === "buy" ? "Total Spend" : "Total Receive"}>
              <div className="relative">
                <Input readOnly value={total > 0 ? fmtNum(total, 2) : ""}
                  placeholder="0.00"
                  className="font-mono pr-14 h-10 bg-muted/10 border-border/40 text-sm cursor-default" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground font-mono">{quote}</span>
              </div>
            </FieldRow>

            {/* ── Switches ──────────────────────────────────────── */}
            {!isSimple && type !== "market" && (
              <div className="flex flex-col gap-1.5 rounded-xl bg-muted/15 border border-border/40 px-3 py-2">
                {type === "limit" && (
                  <ToggleRow label="Post-only" hint="Maker-only fills (cancel if would take)" checked={postOnly} onCheckedChange={setPostOnly} />
                )}
                <ToggleRow label="Reduce-only" hint="Will not increase position size" checked={reduceOnly} onCheckedChange={setReduceOnly} />
              </div>
            )}

            {/* ── Spread bar (Advanced/Pro) ──────────────────────── */}
            {!isSimple && bestBid > 0 && bestAsk > 0 && (
              <div className="rounded-xl bg-muted/15 border border-border/40 px-3 py-2">
                <div className="flex justify-between text-[10px] mb-1.5">
                  <span className="font-mono text-emerald-400 font-semibold">{fmtPrice(bestBid, quote)}</span>
                  <span className="text-muted-foreground">Spread {spreadPct.toFixed(3)}%</span>
                  <span className="font-mono text-rose-400 font-semibold">{fmtPrice(bestAsk, quote)}</span>
                </div>
                <div className="h-1.5 w-full rounded-full overflow-hidden flex">
                  {(() => {
                    const totalDepth = orderbook.bids.slice(0, 8).reduce((s, [, q]) => s + q, 0)
                      + orderbook.asks.slice(0, 8).reduce((s, [, q]) => s + q, 0);
                    const bidDepth = totalDepth > 0
                      ? orderbook.bids.slice(0, 8).reduce((s, [, q]) => s + q, 0) / totalDepth : 0.5;
                    return (
                      <>
                        <div className="h-full rounded-l-full bg-emerald-500/70 transition-all duration-500" style={{ width: `${bidDepth * 100}%` }} />
                        <div className="h-full flex-1 rounded-r-full bg-rose-500/70" />
                      </>
                    );
                  })()}
                </div>
                <div className="flex justify-between mt-0.5 text-[9px] text-muted-foreground">
                  <span>Bid depth</span>
                  <span>Ask depth</span>
                </div>
              </div>
            )}

            {/* ── Summary card ──────────────────────────────────── */}
            <div className="rounded-xl bg-muted/15 border border-border/40 px-3 py-2.5 space-y-1.5 text-[11px]">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Available</span>
                <div className="flex items-center gap-1.5">
                  <span className="tabular-nums font-mono text-foreground font-semibold">
                    {user
                      ? (side === "buy" ? `${fmtBal(availBuy, 2)} ${quote}` : `${fmtBal(availSell, 6)} ${base}`)
                      : `— ${side === "buy" ? quote : base}`}
                  </span>
                </div>
              </div>
              {!isSimple && (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground flex items-center gap-1">
                    Est. Fee
                    <span className={cn(
                      "text-[9px] px-1 py-0.5 rounded font-bold",
                      postOnly && type === "limit"
                        ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                        : "bg-amber-500/15 text-amber-400 border border-amber-500/30",
                    )}>
                      {postOnly && type === "limit" ? "MAKER 0.08%" : "TAKER 0.10%"}
                    </span>
                  </span>
                  <span className="tabular-nums font-mono text-foreground">{fee > 0 ? fmtNum(fee, 2) : "—"} {quote}</span>
                </div>
              )}
              <div className="h-px bg-border/50 my-0.5" />
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground font-semibold">{side === "buy" ? "Total + Fee" : "You receive"}</span>
                <span className={cn(
                  "tabular-nums font-mono font-bold text-sm",
                  totalWithFee > 0 ? (side === "buy" ? "text-emerald-400" : "text-rose-400") : "text-foreground",
                )}>
                  {totalWithFee > 0 ? fmtNum(totalWithFee, 2) : "—"} {quote}
                </span>
              </div>
              {isPro && spread > 0 && (
                <>
                  <div className="h-px bg-border/50 my-0.5" />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Best Bid</span>
                    <span className="tabular-nums font-mono text-emerald-400">{fmtPrice(bestBid, quote)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Best Ask</span>
                    <span className="tabular-nums font-mono text-rose-400">{fmtPrice(bestAsk, quote)}</span>
                  </div>
                </>
              )}
            </div>

            {/* ── SL / PL bracket ──────────────────────────────── */}
            {!isSimple && (
              <div className="rounded-xl border border-border/40 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setSlTpEnabled(!slTpEnabled)}
                  className="w-full flex items-center justify-between px-3 py-2 bg-muted/15 hover:bg-muted/25 transition-colors"
                >
                  <span className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1.5">
                    <ShieldCheck className="h-3 w-3 text-amber-400" />
                    Stop Loss / Take Profit
                    {slTpEnabled && (slPrice || tpPrice) && (
                      <span className="ml-1 px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 text-[9px] font-bold border border-amber-500/30">OCO</span>
                    )}
                  </span>
                  <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform duration-200", slTpEnabled && "rotate-180")} />
                </button>
                {slTpEnabled && (
                  <div className="px-3 py-2.5 space-y-2.5 bg-muted/5 border-t border-border/30">
                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                      Placed after your order fills. One-Cancels-Other — when SL or TP triggers, the other is auto-cancelled.
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-[10px] text-rose-400 font-semibold flex items-center gap-1">
                          <TrendingDown className="h-2.5 w-2.5" />Stop Loss
                        </label>
                        <div className="relative">
                          <Input
                            type="number" inputMode="decimal" value={slPrice}
                            onChange={(e) => setSlPrice(e.target.value)}
                            placeholder="SL price"
                            className="font-mono pr-9 h-8 text-xs bg-muted/20 border-rose-500/30 focus:border-rose-500/60 focus:ring-1 focus:ring-rose-500/20"
                          />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-muted-foreground">{quote}</span>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
                          <TrendingUp className="h-2.5 w-2.5" />Take Profit
                        </label>
                        <div className="relative">
                          <Input
                            type="number" inputMode="decimal" value={tpPrice}
                            onChange={(e) => setTpPrice(e.target.value)}
                            placeholder="TP price"
                            className="font-mono pr-9 h-8 text-xs bg-muted/20 border-emerald-500/30 focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/20"
                          />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-muted-foreground">{quote}</span>
                        </div>
                      </div>
                    </div>
                    {slTpEnabled && (
                      <div className="space-y-0.5">
                        {slPrice && Number(slPrice) > 0 && side === "buy" && Number(slPrice) >= (type !== "market" ? Number(price) || lastPx : lastPx) && (
                          <p className="text-[9px] text-amber-400 flex items-center gap-1"><AlertTriangle className="h-2.5 w-2.5" />SL should be below entry price</p>
                        )}
                        {tpPrice && Number(tpPrice) > 0 && side === "buy" && Number(tpPrice) <= (type !== "market" ? Number(price) || lastPx : lastPx) && (
                          <p className="text-[9px] text-amber-400 flex items-center gap-1"><AlertTriangle className="h-2.5 w-2.5" />TP should be above entry price</p>
                        )}
                        {slPrice && Number(slPrice) > 0 && side === "sell" && Number(slPrice) <= (type !== "market" ? Number(price) || lastPx : lastPx) && (
                          <p className="text-[9px] text-amber-400 flex items-center gap-1"><AlertTriangle className="h-2.5 w-2.5" />SL should be above entry price</p>
                        )}
                        {tpPrice && Number(tpPrice) > 0 && side === "sell" && Number(tpPrice) >= (type !== "market" ? Number(price) || lastPx : lastPx) && (
                          <p className="text-[9px] text-amber-400 flex items-center gap-1"><AlertTriangle className="h-2.5 w-2.5" />TP should be below entry price</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── CTA button ────────────────────────────────────── */}
            <Button
              className={cn(
                "w-full font-bold h-12 text-sm transition-all active:scale-[0.98] rounded-xl",
                side === "buy"
                  ? "bg-gradient-to-b from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white shadow-lg shadow-emerald-900/40 border border-emerald-400/30"
                  : "bg-gradient-to-b from-rose-500 to-rose-600 hover:from-rose-400 hover:to-rose-500 text-white shadow-lg shadow-rose-900/40 border border-rose-400/30",
              )}
              onClick={handleOrder}
              disabled={orderMutation.isPending || !user}
            >
              {!user ? (
                <span className="flex items-center gap-2">
                  <WalletIcon className="h-4 w-4 opacity-70" />Log in to Trade
                </span>
              ) : orderMutation.isPending ? (
                <span className="flex items-center gap-2"><RefreshCw className="h-4 w-4 animate-spin" />Placing…</span>
              ) : side === "buy" ? (
                <span className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />Buy {base}
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <TrendingDown className="h-4 w-4" />Sell {base}
                </span>
              )}
            </Button>

            {/* ── AI Trade button ───────────────────────────────── */}
            <button
              type="button"
              disabled={!user || !lastPx}
              onClick={() => { setAiOpen(true); generateAiSuggestion(); }}
              className={cn(
                "w-full h-9 rounded-xl text-[12px] font-bold flex items-center justify-center gap-2 transition-all border",
                "bg-gradient-to-r from-violet-600/15 via-purple-600/15 to-amber-500/15",
                "border-violet-500/30 hover:border-violet-400/60 text-violet-300 hover:text-violet-200",
                "hover:from-violet-600/25 hover:via-purple-600/25 hover:to-amber-500/25",
                "disabled:opacity-35 disabled:cursor-not-allowed",
              )}
            >
              <Brain className="h-3.5 w-3.5 text-amber-400" />
              AI Trade Suggestion
              <Sparkles className="h-3 w-3 text-violet-400" />
            </button>

            {/* ── Auth prompt ───────────────────────────────────── */}
            {!user && (
              <div className="text-[11px] text-center text-muted-foreground">
                <Link href="/login" className="text-primary font-semibold hover:underline">Log in</Link>
                {" or "}
                <Link href="/signup" className="text-primary font-semibold hover:underline">Sign up</Link>
                {" to start trading"}
              </div>
            )}

            {/* ── Pair info badge ───────────────────────────────── */}
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground border-t border-border/40 pt-2.5">
              <Info className="h-3 w-3 shrink-0" />
              <span>Spot · Settled in {quote}</span>
              <Badge variant="outline" className="ml-auto h-4 px-1.5 text-[9px] border-border/60">ZBX-20</Badge>
            </div>
          </div>
        </div>

        {/* Mobile-only bottom orders panel (Advanced/Pro). On desktop the same
            content lives inside the chart column, above. */}
        {!isSimple && (
          <div className="lg:hidden order-4 border-t border-border bg-card/60 h-[55vh] flex flex-col shrink-0">
            {bottomOrdersJsx}
          </div>
        )}
      </div>

      <OrderFillsDialog
        orderId={fillsOrderId}
        open={fillsOrderId !== null}
        onOpenChange={(o) => !o && setFillsOrderId(null)}
      />


      {/* ── AI Trade Suggestion Dialog ───────────────────────────── */}
      <Dialog open={aiOpen} onOpenChange={setAiOpen}>
        <DialogContent className="bg-card border border-violet-500/30 text-foreground max-w-md shadow-2xl shadow-violet-900/20">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <Brain className="h-4 w-4 text-amber-400" />
              <span className="bg-gradient-to-r from-violet-400 to-amber-400 bg-clip-text text-transparent">
                AI Trade Suggestion
              </span>
              <Badge variant="outline" className="ml-auto text-[9px] border-violet-500/40 text-violet-400">
                {base}/{quote}
              </Badge>
            </DialogTitle>
          </DialogHeader>

          {/* Loading state */}
          {aiLoading && (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <div className="relative">
                <div className="h-12 w-12 rounded-full border-2 border-violet-500/30 border-t-violet-400 animate-spin" />
                <Bot className="absolute inset-0 m-auto h-5 w-5 text-violet-400" />
              </div>
              <p className="text-sm text-muted-foreground animate-pulse">Analysing market signals…</p>
              <div className="flex gap-1">
                {["Momentum", "Volume", "Range"].map((s) => (
                  <span key={s} className="text-[10px] bg-violet-500/10 border border-violet-500/20 text-violet-400 px-2 py-0.5 rounded-full animate-pulse">{s}</span>
                ))}
              </div>
            </div>
          )}

          {/* Result */}
          {!aiLoading && aiSuggestion && (
            <div className="space-y-4">
              {/* Action badge */}
              <div className="flex items-center gap-3">
                <div className={cn(
                  "flex-1 rounded-xl p-4 border flex flex-col items-center gap-1",
                  aiSuggestion.action === "BUY"  && "bg-emerald-500/10 border-emerald-500/30",
                  aiSuggestion.action === "SELL" && "bg-rose-500/10 border-rose-500/30",
                  aiSuggestion.action === "HOLD" && "bg-amber-500/10 border-amber-500/30",
                )}>
                  {aiSuggestion.action === "BUY"  && <TrendingUp className="h-8 w-8 text-emerald-400" />}
                  {aiSuggestion.action === "SELL" && <TrendingDown className="h-8 w-8 text-rose-400" />}
                  {aiSuggestion.action === "HOLD" && <ShieldCheck className="h-8 w-8 text-amber-400" />}
                  <span className={cn(
                    "text-2xl font-black tracking-tight",
                    aiSuggestion.action === "BUY"  && "text-emerald-400",
                    aiSuggestion.action === "SELL" && "text-rose-400",
                    aiSuggestion.action === "HOLD" && "text-amber-400",
                  )}>
                    {aiSuggestion.action}
                  </span>
                  <span className="text-[11px] text-muted-foreground">AI Recommendation</span>
                </div>

                <div className="flex flex-col gap-2 flex-1">
                  {/* Confidence */}
                  <div className="bg-muted/30 rounded-lg p-3 border border-border/40">
                    <div className="text-[10px] text-muted-foreground mb-1.5">Confidence</div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className={cn("h-full rounded-full transition-all",
                            aiSuggestion.confidence > 75 ? "bg-emerald-500" :
                            aiSuggestion.confidence > 60 ? "bg-amber-500" : "bg-rose-500"
                          )}
                          style={{ width: `${aiSuggestion.confidence}%` }}
                        />
                      </div>
                      <span className="text-sm font-bold text-foreground tabular-nums">{aiSuggestion.confidence}%</span>
                    </div>
                  </div>
                  {/* Risk */}
                  <div className="bg-muted/30 rounded-lg p-3 border border-border/40">
                    <div className="text-[10px] text-muted-foreground mb-1">Risk Level</div>
                    <div className={cn("text-sm font-bold flex items-center gap-1",
                      aiSuggestion.riskLevel === "Low"    && "text-emerald-400",
                      aiSuggestion.riskLevel === "Medium" && "text-amber-400",
                      aiSuggestion.riskLevel === "High"   && "text-rose-400",
                    )}>
                      {aiSuggestion.riskLevel === "Low"    && <ShieldCheck className="h-3.5 w-3.5" />}
                      {aiSuggestion.riskLevel === "Medium" && <AlertTriangle className="h-3.5 w-3.5" />}
                      {aiSuggestion.riskLevel === "High"   && <Zap className="h-3.5 w-3.5" />}
                      {aiSuggestion.riskLevel}
                    </div>
                  </div>
                </div>
              </div>

              {/* Suggested entry */}
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-muted/30 rounded-lg p-3 border border-border/40">
                  <div className="text-[10px] text-muted-foreground mb-1">Suggested Price</div>
                  <div className="text-sm font-bold font-mono text-foreground">{aiSuggestion.suggestedPrice} <span className="text-[10px] font-normal text-muted-foreground">{quote}</span></div>
                </div>
                <div className="bg-muted/30 rounded-lg p-3 border border-border/40">
                  <div className="text-[10px] text-muted-foreground mb-1">Suggested Qty</div>
                  <div className="text-sm font-bold font-mono text-foreground">{aiSuggestion.suggestedAmount} <span className="text-[10px] font-normal text-muted-foreground">{base}</span></div>
                </div>
              </div>

              {/* Reasoning */}
              <div className="bg-muted/20 rounded-lg p-3 border border-border/30 space-y-1.5">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">Analysis Signals</div>
                {aiSuggestion.reasoning.map((r, i) => (
                  <div key={i} className="flex items-start gap-2 text-[12px] text-muted-foreground">
                    <CheckCircle2 className="h-3.5 w-3.5 text-violet-400 mt-0.5 shrink-0" />
                    <span>{r}</span>
                  </div>
                ))}
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                {aiSuggestion.action !== "HOLD" && (
                  <Button
                    className={cn(
                      "flex-1 h-10 font-bold text-sm",
                      aiSuggestion.action === "BUY"
                        ? "bg-gradient-to-b from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-foreground shadow-md shadow-emerald-500/30"
                        : "bg-gradient-to-b from-rose-500 to-rose-600 hover:from-rose-400 hover:to-rose-500 text-foreground shadow-md shadow-rose-500/30",
                    )}
                    onClick={() => {
                      setSide(aiSuggestion.action === "BUY" ? "buy" : "sell");
                      setType("limit");
                      setPrice(aiSuggestion.suggestedPrice);
                      setAmount(aiSuggestion.suggestedAmount);
                      setAiOpen(false);
                      toast.success(`AI suggestion applied — review and confirm your order`);
                    }}
                  >
                    <Zap className="h-3.5 w-3.5 mr-1.5" />
                    Apply Suggestion
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="h-10 px-3 border-violet-500/30 text-violet-400 hover:bg-violet-500/10 hover:border-violet-400/60"
                  onClick={() => { setAiSuggestion(null); generateAiSuggestion(); }}
                  title="Refresh analysis"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>

              {/* Link to AI Trading plans */}
              <Link
                href="/ai-trading"
                className="flex items-center justify-center gap-1.5 text-[11px] text-violet-400 hover:text-violet-300 transition-colors pt-1"
                onClick={() => setAiOpen(false)}
              >
                <Bot className="h-3.5 w-3.5" />
                Explore AI Auto-Trading Plans
                <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Order Confirmation Dialog ─────────────────────────────── */}
      <Dialog open={confirmOrderOpen} onOpenChange={(o) => { if (!o) setConfirmOrderOpen(false); }}>
        <DialogContent className="max-w-sm bg-card border border-border/80">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Confirm Order</DialogTitle>
            <DialogDescription className="sr-only">Review your order details before placing.</DialogDescription>
          </DialogHeader>
          {pendingOrderRef.current && (
            <div className="space-y-3 py-1">
              <div className={`flex items-center justify-between rounded-lg px-3 py-2 ${pendingOrderRef.current.side === "buy" ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-rose-500/10 border border-rose-500/20"}`}>
                <span className="text-xs text-muted-foreground">Side</span>
                <span className={`font-bold text-sm ${pendingOrderRef.current.side === "buy" ? "text-emerald-400" : "text-rose-400"}`}>
                  {pendingOrderRef.current.side === "buy" ? "▲ Buy" : "▼ Sell"}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex flex-col gap-0.5 rounded-md bg-muted/40 px-3 py-2">
                  <span className="text-muted-foreground">Pair</span>
                  <span className="font-mono font-semibold">{pendingOrderRef.current.base}/{pendingOrderRef.current.quote}</span>
                </div>
                <div className="flex flex-col gap-0.5 rounded-md bg-muted/40 px-3 py-2">
                  <span className="text-muted-foreground">Type</span>
                  <span className="font-semibold capitalize">{pendingOrderRef.current.orderType}</span>
                </div>
                <div className="flex flex-col gap-0.5 rounded-md bg-muted/40 px-3 py-2">
                  <span className="text-muted-foreground">Amount</span>
                  <span className="font-mono font-semibold">{Number(pendingOrderRef.current.amount).toFixed(6).replace(/\.?0+$/, "")} {pendingOrderRef.current.base}</span>
                </div>
                {pendingOrderRef.current.orderType !== "market" && pendingOrderRef.current.price && (
                  <div className="flex flex-col gap-0.5 rounded-md bg-muted/40 px-3 py-2">
                    <span className="text-muted-foreground">Price</span>
                    <span className="font-mono font-semibold">{Number(pendingOrderRef.current.price).toLocaleString()} {pendingOrderRef.current.quote}</span>
                  </div>
                )}
                {pendingOrderRef.current.orderType === "market" && lastPx > 0 && (
                  <div className="flex flex-col gap-0.5 rounded-md bg-muted/40 px-3 py-2">
                    <span className="text-muted-foreground">Est. Price</span>
                    <span className="font-mono font-semibold">{lastPx.toLocaleString()} {pendingOrderRef.current.quote}</span>
                  </div>
                )}
              </div>
              {pendingOrderRef.current.orderType !== "market" && Number(pendingOrderRef.current.price) > 0 && Number(pendingOrderRef.current.amount) > 0 && (
                <div className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-2 text-xs">
                  <span className="text-muted-foreground">Est. Total</span>
                  <span className="font-mono font-semibold">{(Number(pendingOrderRef.current.amount) * Number(pendingOrderRef.current.price)).toLocaleString(undefined, { maximumFractionDigits: 2 })} {pendingOrderRef.current.quote}</span>
                </div>
              )}
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="sm" onClick={() => setConfirmOrderOpen(false)}>Cancel</Button>
            <Button
              size="sm"
              className={pendingOrderRef.current?.side === "buy"
                ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                : "bg-rose-600 hover:bg-rose-700 text-white"}
              onClick={executeOrder}
              disabled={orderMutation.isPending}
            >
              {orderMutation.isPending ? "Placing…" : pendingOrderRef.current?.side === "buy" ? "Confirm Buy" : "Confirm Sell"}
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
              This will cancel all {pairScope === "this" ? `${base}/${quote}` : ""} open orders immediately. This action cannot be undone.
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
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Header stat
// ──────────────────────────────────────────────────────────────────
function Stat({ label, children, tone, className }: { label: string; children: React.ReactNode; tone?: "success" | "destructive"; className?: string }) {
  const color = tone === "success" ? "text-success" : tone === "destructive" ? "text-destructive" : "text-foreground";
  return (
    <div className={`flex flex-col items-start flex-shrink-0 ${className ?? ""}`}>
      <div className="text-[10px] uppercase text-muted-foreground tracking-wider">{label}</div>
      <div className={`font-mono text-sm tabular-nums ${color}`}>{children}</div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Field row
// ──────────────────────────────────────────────────────────────────
function FieldRow({ label, right, children }: { label: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5 flex justify-between items-center">
        <span>{label}</span>
        {right}
      </div>
      {children}
    </div>
  );
}

function ToggleRow({ label, hint, checked, onCheckedChange }: { label: string; hint?: string; checked: boolean; onCheckedChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 cursor-pointer group py-0.5">
      <div className="flex flex-col">
        <span className="text-xs font-semibold text-foreground/90">{label}</span>
        {hint && <span className="text-[10px] text-muted-foreground leading-tight mt-0.5">{hint}</span>}
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} className="shrink-0" />
    </label>
  );
}

function SummaryRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center">
      <span>{label}</span>
      <div>{children}</div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Bottom orders table
// ──────────────────────────────────────────────────────────────────
function OrdersTable({
  rows,
  loading,
  mode,
  onCancel,
  cancelingId,
  quotesForLabel = [],
  onViewFills,
}: {
  rows: any[];
  loading: boolean;
  mode: "open" | "history";
  onCancel?: (id: string | number) => void;
  cancelingId?: string | number;
  quotesForLabel?: string[];
  onViewFills?: (id: string | number) => void;
}) {
  if (loading) {
    return (
      <div className="px-4 py-6 text-xs text-center text-muted-foreground">
        <Link href="/login" className="text-primary hover:underline">Log in</Link> to see your orders.
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="px-4 py-6 text-xs text-center text-muted-foreground">
        {mode === "open" ? "No open orders." : "No order history."}
      </div>
    );
  }
  return (
    <table className="w-full text-xs">
      <thead className="bg-muted/20 text-[10px] uppercase tracking-wider text-muted-foreground sticky top-0">
        <tr>
          <th className="text-left px-3 py-1.5 font-medium">Pair</th>
          <th className="text-left px-2 py-1.5 font-medium">Side</th>
          <th className="text-left px-2 py-1.5 font-medium">Type</th>
          <th className="text-right px-2 py-1.5 font-medium">Price</th>
          <th className="text-right px-2 py-1.5 font-medium">Amount</th>
          <th className="text-right px-2 py-1.5 font-medium">Filled</th>
          {mode === "history" && <th className="text-right px-2 py-1.5 font-medium">Status</th>}
          <th className="text-right px-2 py-1.5 font-medium">Time</th>
          {mode === "open" && <th className="text-right px-3 py-1.5 font-medium">Action</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((o: any) => {
          const sideStr = String(o.side || "").toLowerCase();
          const typeStr = String(o.type || "limit").toLowerCase();
          const isMarket = typeStr === "market";
          const limitPx = Number(o.price ?? 0);
          const avgPx = Number(o.avgPrice ?? 0);
          const qty = Number(o.amount ?? o.qty ?? 0);
          // API returns `filledQty`; keep `filled` as fallback for legacy payloads.
          const filled = Number(o.filledQty ?? o.filled ?? 0);
          // For market orders the stored `price` is the ±10% slippage cap, not a
          // real fill price. Show "Market" when nothing has filled yet, otherwise
          // surface the avg fill (truth) for both market and limit rows.
          const showAvg = filled > 0 && avgPx > 0;
          const px = showAvg ? avgPx : (isMarket ? 0 : limitPx);
          const ts = Number(o.createdAt ? new Date(o.createdAt).getTime() : o.ts ?? Date.now());
          const status = String(o.status || "OPEN").toUpperCase();
          // Pair label — API returns `symbol` (either "BTC/USDT" or "BTCUSDT").
          // Older payloads may carry `currency`+`pair` instead. Normalize to BASE/QUOTE.
          // Quote suffix list comes from /api/pairs (no hardcoded coins).
          const pairLabel = (() => {
            const sym = String(o.symbol ?? "").trim();
            if (sym.includes("/")) return sym;
            if (o.currency && o.pair) return `${o.currency}/${o.pair}`;
            if (sym) {
              for (const q of quotesForLabel) {
                if (sym.endsWith(q) && sym.length > q.length) {
                  return `${sym.slice(0, -q.length)}/${q}`;
                }
              }
              return sym;
            }
            return "—";
          })();
          const handleRowClick = () => onViewFills?.(o.id);
          return (
            <tr
              key={o.id}
              className={cn(
                "border-b border-border last:border-b-0 hover:bg-muted/15",
                onViewFills && "cursor-pointer",
              )}
              onClick={onViewFills ? handleRowClick : undefined}
              onKeyDown={
                onViewFills
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleRowClick();
                      }
                    }
                  : undefined
              }
              role={onViewFills ? "button" : undefined}
              tabIndex={onViewFills ? 0 : undefined}
              aria-label={onViewFills ? `View fills for order ${o.id}` : undefined}
            >
              <td className="px-3 py-1.5 font-semibold whitespace-nowrap">{pairLabel}</td>
              <td className={`px-2 py-1.5 font-bold ${sideStr === "buy" ? "text-success" : "text-destructive"}`}>{sideStr.toUpperCase()}</td>
              <td className="px-2 py-1.5 capitalize text-muted-foreground">{typeStr}</td>
              <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                {px > 0 ? (
                  showAvg ? (
                    <span className="inline-flex flex-col items-end leading-tight">
                      <span>{fmtNum(px, 2)}</span>
                      <span className="text-[9px] text-muted-foreground">avg</span>
                    </span>
                  ) : (
                    fmtNum(px, 2)
                  )
                ) : isMarket ? (
                  <span className="text-muted-foreground">Market</span>
                ) : (
                  "—"
                )}
              </td>
              <td className="px-2 py-1.5 text-right font-mono tabular-nums">{fmtNum(qty, 6)}</td>
              <td className="px-2 py-1.5 text-right font-mono tabular-nums">{fmtNum(filled, 6)}</td>
              {mode === "history" && (
                <td className="px-2 py-1.5 text-right">
                  <Badge variant="outline" className={`text-[9px] h-4 px-1.5 ${
                    status === "CLOSED" || status === "FILLED" ? "border-success/30 text-success bg-success/5"
                    : status === "CANCELED" || status === "CANCELLED" ? "border-muted-foreground/30 text-muted-foreground"
                    : status === "PENDING_TRIGGER" ? "border-blue-500/30 text-blue-400 bg-blue-500/5"
                    : status === "PARTIAL_CANCELLED" ? "border-orange-500/30 text-orange-400 bg-orange-500/5"
                    : "border-amber-500/30 text-amber-400 bg-amber-500/5"
                  }`}>{status === "PENDING_TRIGGER" ? "TRIGGER" : status === "PARTIAL_CANCELLED" ? "PART. CANCELLED" : status}</Badge>
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
