import { useCallback, useRef, useState } from "react";
import {
  Activity, CheckCircle2, XCircle, AlertTriangle, RefreshCw, Clock,
  ChevronDown, ChevronRight, Zap, Globe, BarChart2, Server,
  TrendingUp, Coins, Layers, Bot, PiggyBank, ArrowLeftRight,
  Gift, Megaphone, Layout, BarChart, Play, Pause, ChevronsUpDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

// ─── Types ───────────────────────────────────────────────────────────────────

type EndpointStatus = "idle" | "pending" | "ok" | "warn" | "error";

interface Endpoint {
  path: string;
  params?: string;
  desc: string;
}

interface Category {
  id: string;
  label: string;
  icon: typeof Globe;
  color: string;
  endpoints: Endpoint[];
}

interface EndpointResult {
  status: EndpointStatus;
  code: number | null;
  ms: number | null;
}

// ─── All API Endpoints ────────────────────────────────────────────────────────

const CATEGORIES: Category[] = [
  {
    id: "system",
    label: "System",
    icon: Server,
    color: "text-sky-400",
    endpoints: [
      { path: "/v1/ping",                desc: "Ping server" },
      { path: "/v1/time",                desc: "Server time" },
      { path: "/v1/status",              desc: "Platform status" },
      { path: "/v1/exchangeInfo",        desc: "Exchange info" },
      { path: "/v1/server/info",         desc: "Server info" },
      { path: "/v1/server/version",      desc: "API version" },
      { path: "/v1/server/health",       desc: "Health check" },
      { path: "/v1/server/maintenance",  desc: "Maintenance mode" },
      { path: "/v1/server/statistics",   desc: "Server statistics" },
      { path: "/v1/server/config",       desc: "Public config" },
    ],
  },
  {
    id: "markets",
    label: "Markets",
    icon: Globe,
    color: "text-emerald-400",
    endpoints: [
      { path: "/v1/markets",                    desc: "All markets" },
      { path: "/v1/markets/search",  params: "q=BTC", desc: "Search markets" },
      { path: "/v1/markets/trending",           desc: "Trending markets" },
      { path: "/v1/markets/new",                desc: "Newly listed" },
      { path: "/v1/markets/gainers",            desc: "Top gainers" },
      { path: "/v1/markets/losers",             desc: "Top losers" },
      { path: "/v1/markets/high-volume",        desc: "High volume" },
      { path: "/v1/markets/top",                desc: "Top markets" },
      { path: "/v1/markets/favorites",          desc: "Favorites list" },
      { path: "/v1/markets/popular",            desc: "Popular markets" },
      { path: "/v1/markets/featured",           desc: "Featured markets" },
      { path: "/v1/markets/BTCUSDT",            desc: "Single market — BTCUSDT" },
    ],
  },
  {
    id: "ticker",
    label: "Ticker",
    icon: TrendingUp,
    color: "text-violet-400",
    endpoints: [
      { path: "/v1/ticker",                                  desc: "Ticker overview" },
      { path: "/v1/ticker/all",                              desc: "All tickers" },
      { path: "/v1/ticker/24hr",                             desc: "24h stats" },
      { path: "/v1/ticker/price",                            desc: "Latest prices" },
      { path: "/v1/ticker/bookTicker", params: "symbol=BTCUSDT", desc: "Best bid/ask" },
      { path: "/v1/ticker/mini",                             desc: "Mini tickers" },
      { path: "/v1/ticker/rolling",                          desc: "Rolling window" },
      { path: "/v1/ticker/statistics",                       desc: "Ticker statistics" },
    ],
  },
  {
    id: "orderbook",
    label: "Order Book",
    icon: Layers,
    color: "text-amber-400",
    endpoints: [
      { path: "/v1/depth",               params: "symbol=BTCUSDT", desc: "Order depth" },
      { path: "/v1/orderbook",           params: "symbol=BTCUSDT", desc: "Full order book" },
      { path: "/v1/orderbook/full",      params: "symbol=BTCUSDT", desc: "Order book full" },
      { path: "/v1/orderbook/snapshot",  params: "symbol=BTCUSDT", desc: "OB snapshot" },
      { path: "/v1/orderbook/bids",      params: "symbol=BTCUSDT", desc: "Bid side only" },
      { path: "/v1/orderbook/asks",      params: "symbol=BTCUSDT", desc: "Ask side only" },
      { path: "/v1/orderbook/spread",    params: "symbol=BTCUSDT", desc: "Bid-ask spread" },
    ],
  },
  {
    id: "trades",
    label: "Trades",
    icon: Activity,
    color: "text-rose-400",
    endpoints: [
      { path: "/v1/trades",             params: "symbol=BTCUSDT", desc: "Recent trades" },
      { path: "/v1/recentTrades",       params: "symbol=BTCUSDT", desc: "Recent trades alias" },
      { path: "/v1/historicalTrades",   params: "symbol=BTCUSDT", desc: "Historical trades" },
      { path: "/v1/aggTrades",          params: "symbol=BTCUSDT", desc: "Aggregated trades" },
      { path: "/v1/trade/history",      params: "symbol=BTCUSDT", desc: "Trade history" },
      { path: "/v1/trade/statistics",   params: "symbol=BTCUSDT", desc: "Trade stats" },
      { path: "/v1/trade/volume",       params: "symbol=BTCUSDT", desc: "Trade volume" },
    ],
  },
  {
    id: "klines",
    label: "Klines / OHLCV",
    icon: BarChart2,
    color: "text-cyan-400",
    endpoints: [
      { path: "/v1/klines",        params: "symbol=BTCUSDT&interval=1h", desc: "Klines" },
      { path: "/v1/uiKlines",      params: "symbol=BTCUSDT&interval=1h", desc: "UI klines" },
      { path: "/v1/candles",       params: "symbol=BTCUSDT&interval=1h", desc: "Candles" },
      { path: "/v1/ohlcv",         params: "symbol=BTCUSDT&interval=1h", desc: "OHLCV" },
      { path: "/v1/chart/history", params: "symbol=BTCUSDT&interval=1h", desc: "Chart history" },
    ],
  },
  {
    id: "coins",
    label: "Coins & Networks",
    icon: Coins,
    color: "text-yellow-400",
    endpoints: [
      { path: "/v1/coins",               desc: "All coins" },
      { path: "/v1/coin/BTC",            desc: "Single coin — BTC" },
      { path: "/v1/assets",              desc: "Assets list" },
      { path: "/v1/networks",            desc: "All networks" },
      { path: "/v1/network/ETH",         desc: "Single network — ETH" },
      { path: "/v1/network/status",      desc: "Network status" },
      { path: "/v1/deposit-fees",        desc: "Deposit fees" },
      { path: "/v1/withdraw-fees",       desc: "Withdrawal fees" },
      { path: "/v1/minimum-deposit",     desc: "Minimum deposit" },
      { path: "/v1/minimum-withdraw",    desc: "Minimum withdrawal" },
      { path: "/v1/confirmation-count",  desc: "Confirmations required" },
      { path: "/v1/token/info", params: "symbol=BTC", desc: "Token info" },
    ],
  },
  {
    id: "spot",
    label: "Spot",
    icon: Zap,
    color: "text-lime-400",
    endpoints: [
      { path: "/v1/spot/pairs",                          desc: "All spot pairs" },
      { path: "/v1/spot/statistics",                     desc: "Spot statistics" },
      { path: "/v1/spot/top-volume",                     desc: "Top volume pairs" },
      { path: "/v1/spot/top-gainers",                    desc: "Top gainers" },
      { path: "/v1/spot/top-losers",                     desc: "Top losers" },
      { path: "/v1/spot/liquidity", params: "symbol=BTCUSDT", desc: "Pair liquidity" },
      { path: "/v1/spot/markets",                        desc: "Spot markets list" },
    ],
  },
  {
    id: "futures",
    label: "Futures",
    icon: BarChart,
    color: "text-orange-400",
    endpoints: [
      { path: "/v1/futures/contracts",                              desc: "All contracts" },
      { path: "/v1/futures/index-price",  params: "symbol=BTCUSDT", desc: "Index price" },
      { path: "/v1/futures/mark-price",   params: "symbol=BTCUSDT", desc: "Mark price" },
      { path: "/v1/futures/open-interest",params: "symbol=BTCUSDT", desc: "Open interest" },
      { path: "/v1/futures/funding-rate",                           desc: "Funding rates" },
      { path: "/v1/futures/insurance-fund",                         desc: "Insurance fund" },
      { path: "/v1/futures/statistics",                             desc: "Futures stats" },
      { path: "/v1/futures/markets",                                desc: "Futures markets" },
      { path: "/v1/futures/leaderboard",                            desc: "Leaderboard" },
    ],
  },
  {
    id: "ai",
    label: "AI Trading",
    icon: Bot,
    color: "text-fuchsia-400",
    endpoints: [
      { path: "/v1/ai/plans",          desc: "AI trading plans" },
      { path: "/v1/ai/performance",    desc: "Plan performance" },
      { path: "/v1/ai/statistics",     desc: "AI stats" },
      { path: "/v1/ai/live",           desc: "Live AI trades" },
      { path: "/v1/ai/strategies",     desc: "AI strategies" },
      { path: "/v1/ai/leaderboard",    desc: "AI leaderboard" },
      { path: "/v1/ai/top-performers", desc: "Top performers" },
      { path: "/v1/ai/roi",            desc: "ROI by plan" },
      { path: "/v1/ai/profit",         desc: "Profit stats" },
      { path: "/v1/ai/signals",        desc: "AI signals" },
      { path: "/v1/ai/backtest",       desc: "Backtest results" },
    ],
  },
  {
    id: "earn",
    label: "Earn",
    icon: PiggyBank,
    color: "text-teal-400",
    endpoints: [
      { path: "/v1/earn/plans",       desc: "Earn plans" },
      { path: "/v1/earn/categories",  desc: "Categories" },
      { path: "/v1/earn/products",    desc: "All products" },
      { path: "/v1/earn/apy",         desc: "APY rates" },
      { path: "/v1/earn/statistics",  desc: "Earn stats" },
      { path: "/v1/earn/featured",    desc: "Featured products" },
    ],
  },
  {
    id: "convert",
    label: "Convert",
    icon: ArrowLeftRight,
    color: "text-indigo-400",
    endpoints: [
      { path: "/v1/convert/quote",     params: "from=BTC&to=USDT&amount=1", desc: "Conversion quote" },
      { path: "/v1/convert/rates",     desc: "All conversion rates" },
      { path: "/v1/convert/supported", desc: "Supported pairs" },
    ],
  },
  {
    id: "referral",
    label: "Referral",
    icon: Gift,
    color: "text-pink-400",
    endpoints: [
      { path: "/v1/referral/info",        desc: "Referral program info" },
      { path: "/v1/referral/rules",       desc: "Referral rules" },
      { path: "/v1/referral/rewards",     desc: "Reward tiers" },
      { path: "/v1/referral/statistics",  desc: "Program statistics" },
      { path: "/v1/referral/campaigns",   desc: "Active campaigns" },
    ],
  },
  {
    id: "announcements",
    label: "Announcements",
    icon: Megaphone,
    color: "text-sky-400",
    endpoints: [
      { path: "/v1/announcements",  desc: "All announcements" },
      { path: "/v1/news",           desc: "News feed" },
      { path: "/v1/blog",           desc: "Blog posts" },
      { path: "/v1/events",         desc: "Events" },
      { path: "/v1/notices",        desc: "Platform notices" },
      { path: "/v1/promotions",     desc: "Promotions" },
      { path: "/v1/updates",        desc: "Product updates" },
    ],
  },
  {
    id: "cms",
    label: "CMS / Content",
    icon: Layout,
    color: "text-violet-400",
    endpoints: [
      { path: "/v1/banners",          desc: "Hero banners" },
      { path: "/v1/sliders",          desc: "Homepage sliders" },
      { path: "/v1/homepage",         desc: "Homepage sections" },
      { path: "/v1/faqs",             desc: "FAQ list" },
      { path: "/v1/support/articles", desc: "Help articles" },
      { path: "/v1/pages",            desc: "Legal pages" },
      { path: "/v1/company",          desc: "Company info" },
      { path: "/v1/social-links",     desc: "Social media links" },
    ],
  },
  {
    id: "statistics",
    label: "Statistics",
    // Bug fixed: was BarChart2 (duplicate of Klines). Now uses Activity icon.
    icon: Activity,
    color: "text-emerald-400",
    endpoints: [
      { path: "/v1/statistics",      desc: "Exchange statistics" },
      { path: "/v1/global",          desc: "Global market data" },
      { path: "/v1/exchange-volume", desc: "Exchange volume" },
      { path: "/v1/trading-volume",  desc: "Trading volume 24h" },
      { path: "/v1/users",           desc: "User statistics" },
      { path: "/v1/liquidity",       desc: "Global liquidity" },
      { path: "/v1/market-cap",      desc: "Market cap data" },
      { path: "/v1/top-coins",       desc: "Top coins by cap" },
      { path: "/v1/top-volume",      desc: "Top coins by volume" },
      { path: "/v1/platform",        desc: "Platform summary" },
    ],
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

const BASE = "/api";

function buildKey(ep: Endpoint) {
  return ep.path + (ep.params ? "?" + ep.params : "");
}

// Bug fixed: previously ALL 4xx were "warn". For public endpoints,
// any non-2xx (including 404, 401, 403) is a genuine failure → "error".
// Only 3xx redirects (e.g. 301/302) are treated as "warn" (unexpected but not broken).
function classifyStatus(code: number): EndpointStatus {
  if (code >= 200 && code < 300) return "ok";
  if (code >= 300 && code < 400) return "warn";   // redirect — unexpected but reachable
  return "error";                                   // 4xx/5xx — broken for public endpoint
}

function statusColor(s: EndpointStatus) {
  if (s === "ok")      return "text-emerald-400";
  if (s === "warn")    return "text-amber-400";
  if (s === "error")   return "text-rose-400";
  if (s === "pending") return "text-sky-400 animate-pulse";
  return "text-muted-foreground";
}

function statusBg(s: EndpointStatus) {
  if (s === "ok")      return "bg-emerald-500/10 border-emerald-500/20";
  if (s === "warn")    return "bg-amber-500/10 border-amber-500/20";
  if (s === "error")   return "bg-rose-500/10 border-rose-500/20";
  if (s === "pending") return "bg-sky-500/10 border-sky-500/20 animate-pulse";
  return "bg-muted/30 border-border";
}

function codeColor(code: number | null) {
  if (!code) return "text-muted-foreground";
  if (code >= 200 && code < 300) return "text-emerald-400";
  if (code >= 300 && code < 400) return "text-sky-400";
  if (code >= 400) return "text-rose-400";
  return "text-muted-foreground";
}

function StatusDot({ s }: { s: EndpointStatus }) {
  const cls = s === "ok" ? "bg-emerald-400"
    : s === "warn" ? "bg-amber-400"
    : s === "error" ? "bg-rose-400"
    : s === "pending" ? "bg-sky-400 animate-ping"
    : "bg-muted-foreground/40";
  return <span className={`inline-block h-2 w-2 rounded-full flex-shrink-0 ${cls}`} />;
}

async function pingEndpoint(ep: Endpoint, signal: AbortSignal): Promise<EndpointResult> {
  const url = BASE + ep.path + (ep.params ? "?" + ep.params : "");
  const t0 = performance.now();
  try {
    const r = await fetch(url, { signal: AbortSignal.any
      ? AbortSignal.any([signal, AbortSignal.timeout(8000)])
      : AbortSignal.timeout(8000) });
    const ms = Math.round(performance.now() - t0);
    return { status: classifyStatus(r.status), code: r.status, ms };
  } catch (err: any) {
    const ms = Math.round(performance.now() - t0);
    if (err?.name === "AbortError" || err?.name === "TimeoutError") {
      return { status: "error", code: null, ms };
    }
    return { status: "error", code: null, ms };
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ApiStatus() {
  const [results, setResults] = useState<Record<string, EndpointResult>>({});
  const [running, setRunning] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set(CATEGORIES.map((c) => c.id)));
  const [lastRun, setLastRun] = useState<Date | null>(null);
  const [progress, setProgress] = useState(0);
  const abortCtrlRef = useRef<AbortController | null>(null);

  const allEndpoints = CATEGORIES.flatMap((c) => c.endpoints);
  const total = allEndpoints.length;

  const runAll = useCallback(async () => {
    // Cancel any previous run
    abortCtrlRef.current?.abort();
    const ctrl = new AbortController();
    abortCtrlRef.current = ctrl;

    setRunning(true);
    setResults({});
    setProgress(0);

    let done = 0;
    const batchSize = 8;
    for (let i = 0; i < allEndpoints.length; i += batchSize) {
      if (ctrl.signal.aborted) break;
      const batch = allEndpoints.slice(i, i + batchSize);
      await Promise.all(
        batch.map(async (ep) => {
          setResults((prev) => ({ ...prev, [buildKey(ep)]: { status: "pending", code: null, ms: null } }));
          const result = await pingEndpoint(ep, ctrl.signal);
          setResults((prev) => ({ ...prev, [buildKey(ep)]: result }));
          done++;
          setProgress(Math.round((done / total) * 100));
        }),
      );
    }

    if (!ctrl.signal.aborted) {
      setLastRun(new Date());
    }
    setRunning(false);
  }, [allEndpoints, total]);

  const stop = () => {
    abortCtrlRef.current?.abort();
  };

  const toggleCategory = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const allExpanded = expanded.size === CATEGORIES.length;
  const toggleAll = () => {
    setExpanded(allExpanded ? new Set() : new Set(CATEGORIES.map((c) => c.id)));
  };

  // Summary stats
  const okCount    = Object.values(results).filter((r) => r.status === "ok").length;
  const warnCount  = Object.values(results).filter((r) => r.status === "warn").length;
  const errCount   = Object.values(results).filter((r) => r.status === "error").length;
  const testedCount = okCount + warnCount + errCount;

  // Bug fixed: avgMs denominator was `testedCount` but numerator filtered to ms !== null.
  // Now we compute the average only over results that actually have an ms value.
  const msValues = Object.values(results).map((r) => r.ms).filter((m): m is number => m !== null);
  const avgMs = msValues.length > 0 ? Math.round(msValues.reduce((s, v) => s + v, 0) / msValues.length) : null;

  const overallOk = testedCount > 0 && errCount === 0 && warnCount === 0;
  const hasTested = testedCount > 0;

  return (
    <div className="container mx-auto px-4 py-10 max-w-7xl" data-testid="page-api-status">

      {/* ── Header ── */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <Activity className="h-5 w-5 text-primary" />
          <Badge variant="outline" className="bg-background/60">API Health Monitor</Badge>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight mb-1">
              Public API Status
            </h1>
            <p className="text-muted-foreground text-sm">
              Live test of all <span className="font-semibold text-foreground">{total}</span> public{" "}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">/api/v1/*</code> endpoints across{" "}
              {CATEGORIES.length} categories.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {running ? (
              <Button variant="outline" onClick={stop} className="gap-2">
                <Pause className="h-4 w-4" /> Stop
              </Button>
            ) : (
              <Button
                onClick={runAll}
                className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2"
                data-testid="button-run-all"
              >
                <Play className="h-4 w-4" />
                {hasTested ? "Re-run all tests" : "Run all tests"}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="rounded-xl border border-border bg-card/40 p-4">
          <div className="text-xs text-muted-foreground mb-1">Total endpoints</div>
          <div className="text-2xl font-extrabold">{total}</div>
          <div className="text-xs text-muted-foreground mt-1">{CATEGORIES.length} categories</div>
        </div>
        <div className={`rounded-xl border p-4 ${hasTested ? "border-emerald-500/30 bg-emerald-500/5" : "border-border bg-card/40"}`}>
          <div className="text-xs text-muted-foreground mb-1">Passing</div>
          <div className="text-2xl font-extrabold text-emerald-400">{okCount}</div>
          <div className="text-xs text-muted-foreground mt-1">
            {testedCount > 0 ? `${Math.round((okCount / testedCount) * 100)}% pass rate` : "Not tested yet"}
          </div>
        </div>
        <div className={`rounded-xl border p-4 ${errCount > 0 ? "border-rose-500/30 bg-rose-500/5" : "border-border bg-card/40"}`}>
          <div className="text-xs text-muted-foreground mb-1">Errors</div>
          <div className={`text-2xl font-extrabold ${errCount > 0 ? "text-rose-400" : "text-muted-foreground"}`}>{errCount}</div>
          <div className="text-xs text-muted-foreground mt-1">{warnCount} warnings</div>
        </div>
        <div className="rounded-xl border border-border bg-card/40 p-4">
          <div className="text-xs text-muted-foreground mb-1">Avg response</div>
          <div className="text-2xl font-extrabold">{avgMs !== null ? `${avgMs}` : "—"}</div>
          <div className="text-xs text-muted-foreground mt-1">{avgMs !== null ? "ms" : "Run tests first"}</div>
        </div>
      </div>

      {/* ── Progress bar + overall status ── */}
      {(running || hasTested) && (
        <div className="rounded-xl border border-border bg-card/40 p-4 mb-6">
          <div className="flex items-center justify-between mb-2 text-sm">
            <div className="flex items-center gap-2">
              {running ? (
                <RefreshCw className="h-4 w-4 animate-spin text-sky-400" />
              ) : overallOk ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              ) : errCount > 0 ? (
                <XCircle className="h-4 w-4 text-rose-400" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-amber-400" />
              )}
              <span className="font-medium">
                {running
                  ? `Testing… ${testedCount} / ${total}`
                  : overallOk
                  ? "All systems operational"
                  : errCount > 0
                  ? `${errCount} endpoint${errCount > 1 ? "s" : ""} failed`
                  : `${warnCount} endpoint${warnCount > 1 ? "s" : ""} returned unexpected redirect`}
              </span>
            </div>
            {lastRun && !running && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {lastRun.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
            )}
          </div>
          <Progress value={running ? progress : 100} className="h-1.5" />
        </div>
      )}

      {/* ── Expand/Collapse All ── */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-muted-foreground">{CATEGORIES.length} categories</span>
        <button
          type="button"
          onClick={toggleAll}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronsUpDown className="h-3.5 w-3.5" />
          {allExpanded ? "Collapse all" : "Expand all"}
        </button>
      </div>

      {/* ── Categories ── */}
      <div className="space-y-3">
        {CATEGORIES.map((cat) => {
          const catResults = cat.endpoints.map((ep) => results[buildKey(ep)]);
          const catOk      = catResults.filter((r) => r?.status === "ok").length;
          const catErr     = catResults.filter((r) => r?.status === "error").length;
          const catWarn    = catResults.filter((r) => r?.status === "warn").length;
          const catTested  = catResults.filter((r) => r && r.status !== "idle" && r.status !== "pending").length;
          const catPending = catResults.some((r) => r?.status === "pending");
          const isOpen     = expanded.has(cat.id);

          const catHealth: EndpointStatus =
            catTested === 0 ? "idle"
            : catErr > 0 ? "error"
            : catWarn > 0 ? "warn"
            : catPending ? "pending"
            : "ok";

          const CatIcon = cat.icon;

          return (
            <div key={cat.id} className={`rounded-xl border overflow-hidden ${statusBg(catHealth)}`}>
              {/* Category header */}
              <button
                type="button"
                onClick={() => toggleCategory(cat.id)}
                className="w-full flex items-center justify-between p-4 text-left hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`h-8 w-8 rounded-lg bg-black/20 flex items-center justify-center flex-shrink-0 ${cat.color}`}>
                    <CatIcon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-sm">{cat.label}</div>
                    <div className="text-xs text-muted-foreground">
                      {cat.endpoints.length} endpoints
                      {catTested > 0 && ` · ${catOk} ok${catErr > 0 ? ` · ${catErr} err` : ""}${catWarn > 0 ? ` · ${catWarn} warn` : ""}`}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  {catTested > 0 && (
                    <div className="hidden sm:flex items-center gap-1">
                      {catErr > 0 && <Badge variant="outline" className="text-[10px] bg-rose-500/10 text-rose-400 border-rose-500/30">{catErr} failed</Badge>}
                      {catWarn > 0 && <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-400 border-amber-500/30">{catWarn} warn</Badge>}
                      {catErr === 0 && catWarn === 0 && <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/30">All pass</Badge>}
                    </div>
                  )}
                  <StatusDot s={catHealth} />
                  {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                </div>
              </button>

              {/* Endpoints table */}
              {isOpen && (
                <div className="border-t border-border/50">
                  <div className="grid grid-cols-[1fr_auto_auto_auto] text-[10px] font-semibold uppercase tracking-widest text-muted-foreground px-4 py-2 border-b border-border/30 bg-black/10">
                    <span>Endpoint</span>
                    <span className="text-right w-16">Status</span>
                    <span className="text-right w-14">HTTP</span>
                    <span className="text-right w-16">Time</span>
                  </div>
                  <div className="divide-y divide-border/20">
                    {cat.endpoints.map((ep) => {
                      const key = buildKey(ep);
                      const r = results[key];
                      const s: EndpointStatus = r?.status ?? "idle";
                      return (
                        <div
                          key={key}
                          className="grid grid-cols-[1fr_auto_auto_auto] items-center px-4 py-2.5 hover:bg-white/5 transition-colors"
                        >
                          <div className="min-w-0 pr-4">
                            <div className="flex items-center gap-2">
                              <StatusDot s={s} />
                              <code className="text-xs font-mono text-foreground/90 truncate">{ep.path}</code>
                              {ep.params && (
                                <code className="hidden md:inline text-[10px] font-mono text-muted-foreground truncate">
                                  ?{ep.params}
                                </code>
                              )}
                            </div>
                            <div className="text-[11px] text-muted-foreground mt-0.5 pl-4">{ep.desc}</div>
                          </div>
                          <div className={`text-xs font-semibold text-right w-16 ${statusColor(s)}`}>
                            {s === "idle"    ? "—"
                              : s === "pending" ? "..."
                              : s === "ok"      ? "PASS"
                              : s === "warn"    ? "WARN"
                              : "FAIL"}
                          </div>
                          <div className={`text-xs font-mono text-right w-14 ${codeColor(r?.code ?? null)}`}>
                            {r?.code ?? "—"}
                          </div>
                          <div className="text-xs text-right w-16 text-muted-foreground">
                            {r?.ms != null ? `${r.ms}ms` : "—"}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Footer note ── */}
      {!hasTested && !running && (
        <div className="text-center mt-12 text-muted-foreground text-sm">
          <Activity className="h-8 w-8 mx-auto mb-3 opacity-30" />
          <p>Click <span className="font-semibold text-foreground">Run all tests</span> to ping all {total} public API endpoints.</p>
          <p className="text-xs mt-1">Tests run directly from your browser — no server-side proxy needed.</p>
        </div>
      )}

      {hasTested && !running && (
        <div className="mt-6 text-center text-xs text-muted-foreground">
          Tested {testedCount} endpoints · {okCount} passed · {errCount} failed · {warnCount} warnings
          {avgMs !== null && ` · avg ${avgMs}ms`}
        </div>
      )}
    </div>
  );
}
