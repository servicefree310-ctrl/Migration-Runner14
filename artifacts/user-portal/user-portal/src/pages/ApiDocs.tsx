import { useEffect, useState, type ReactNode } from "react";
import { Link } from "wouter";
import {
  Code2, Terminal, KeyRound, Zap, Globe, ArrowRight, ChevronRight,
  Copy, Check, ShieldCheck, Webhook, Network, Sparkles, Activity,
  Server, TrendingUp, Layers, Bot, PiggyBank, ArrowLeftRight, Gift,
  Megaphone, Layout, BarChart2, Coins, BarChart,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

type Section = { id: string; title: string; content: ReactNode };
type Method = "GET" | "POST" | "DELETE" | "PUT";
type Endpoint = { method: Method; path: string; auth: boolean; desc: string };
type EndpointGroup = { id: string; label: string; icon: typeof Globe; color: string; endpoints: Endpoint[] };

// ─── Constants ────────────────────────────────────────────────────────────────

const REST_BASE = "https://api.zebvix.com/v1";
const WS_BASE   = "wss://stream.zebvix.com/ws";

const METHOD_COLOR: Record<Method, string> = {
  GET:    "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  POST:   "bg-sky-500/15 text-sky-400 border-sky-500/30",
  DELETE: "bg-rose-500/15 text-rose-400 border-rose-500/30",
  PUT:    "bg-amber-500/15 text-amber-400 border-amber-500/30",
};

// ─── All 127 public endpoints grouped by category ─────────────────────────────

const PUBLIC_GROUPS: EndpointGroup[] = [
  {
    id: "system", label: "System", icon: Server, color: "text-sky-400",
    endpoints: [
      { method: "GET", path: "/ping",               auth: false, desc: "Ping the server — returns {pong:true}" },
      { method: "GET", path: "/time",               auth: false, desc: "Server UTC timestamp in milliseconds" },
      { method: "GET", path: "/status",             auth: false, desc: "Platform operational status and maintenance flags" },
      { method: "GET", path: "/exchangeInfo",       auth: false, desc: "Full exchange info: pairs, coins, limits, rules" },
      { method: "GET", path: "/server/info",        auth: false, desc: "API version, build, and environment details" },
      { method: "GET", path: "/server/version",     auth: false, desc: "Current API version string" },
      { method: "GET", path: "/server/health",      auth: false, desc: "Health-check endpoint for load-balancers" },
      { method: "GET", path: "/server/maintenance", auth: false, desc: "Maintenance window details (if active)" },
      { method: "GET", path: "/server/statistics",  auth: false, desc: "Server-level counters (requests, latency p99)" },
      { method: "GET", path: "/server/config",      auth: false, desc: "Public feature flags and configuration" },
    ],
  },
  {
    id: "markets", label: "Markets", icon: Globe, color: "text-emerald-400",
    endpoints: [
      { method: "GET", path: "/markets",             auth: false, desc: "All trading pairs with 24h statistics" },
      { method: "GET", path: "/markets/search",      auth: false, desc: "Search pairs by base/quote symbol (?q=BTC)" },
      { method: "GET", path: "/markets/trending",    auth: false, desc: "Currently trending pairs by volume spike" },
      { method: "GET", path: "/markets/new",         auth: false, desc: "Recently listed pairs (last 30 days)" },
      { method: "GET", path: "/markets/gainers",     auth: false, desc: "Top 20 gainers in the last 24h" },
      { method: "GET", path: "/markets/losers",      auth: false, desc: "Top 20 losers in the last 24h" },
      { method: "GET", path: "/markets/high-volume", auth: false, desc: "Pairs sorted by descending 24h volume" },
      { method: "GET", path: "/markets/top",         auth: false, desc: "Top 10 pairs by combined score" },
      { method: "GET", path: "/markets/favorites",   auth: false, desc: "Platform-curated watchlist" },
      { method: "GET", path: "/markets/popular",     auth: false, desc: "Most-visited pairs (last 24h)" },
      { method: "GET", path: "/markets/featured",    auth: false, desc: "Editor-featured markets (homepage widgets)" },
      { method: "GET", path: "/markets/:symbol",     auth: false, desc: "Single pair detail by symbol (e.g. BTCUSDT)" },
    ],
  },
  {
    id: "ticker", label: "Ticker", icon: TrendingUp, color: "text-violet-400",
    endpoints: [
      { method: "GET", path: "/ticker",              auth: false, desc: "Brief ticker for all pairs" },
      { method: "GET", path: "/ticker/all",          auth: false, desc: "Full 24h stats for every coin (price, volume, change)" },
      { method: "GET", path: "/ticker/24hr",         auth: false, desc: "24h price change statistics for all symbols" },
      { method: "GET", path: "/ticker/price",        auth: false, desc: "Latest price only for all coins" },
      { method: "GET", path: "/ticker/bookTicker",   auth: false, desc: "Best bid/ask price + qty for a symbol (?symbol=)" },
      { method: "GET", path: "/ticker/mini",         auth: false, desc: "Minimal ticker (symbol, price, change) for UI" },
      { method: "GET", path: "/ticker/rolling",      auth: false, desc: "Rolling-window price statistics" },
      { method: "GET", path: "/ticker/statistics",   auth: false, desc: "Aggregate ticker statistics across all pairs" },
    ],
  },
  {
    id: "orderbook", label: "Order Book", icon: Layers, color: "text-amber-400",
    endpoints: [
      { method: "GET", path: "/depth",              auth: false, desc: "Binance-compat depth endpoint (?symbol=&limit=)" },
      { method: "GET", path: "/orderbook",          auth: false, desc: "Full order book snapshot (bids + asks)" },
      { method: "GET", path: "/orderbook/full",     auth: false, desc: "Full depth order book without limit cap" },
      { method: "GET", path: "/orderbook/snapshot", auth: false, desc: "Point-in-time snapshot with sequence number" },
      { method: "GET", path: "/orderbook/bids",     auth: false, desc: "Bid side only — sorted high to low" },
      { method: "GET", path: "/orderbook/asks",     auth: false, desc: "Ask side only — sorted low to high" },
      { method: "GET", path: "/orderbook/spread",   auth: false, desc: "Best bid, best ask, and spread for a symbol" },
    ],
  },
  {
    id: "trades", label: "Trades", icon: Activity, color: "text-rose-400",
    endpoints: [
      { method: "GET", path: "/trades",           auth: false, desc: "Recent trades for a symbol (?symbol=&limit=)" },
      { method: "GET", path: "/recentTrades",     auth: false, desc: "Alias for /trades — Binance-compatible" },
      { method: "GET", path: "/historicalTrades", auth: false, desc: "Older trades beyond the recent window" },
      { method: "GET", path: "/aggTrades",        auth: false, desc: "Aggregated trades (same price + side merged)" },
      { method: "GET", path: "/trade/history",    auth: false, desc: "Paginated full trade history for a symbol" },
      { method: "GET", path: "/trade/statistics", auth: false, desc: "Trade count, volume, and VWAP for a symbol" },
      { method: "GET", path: "/trade/volume",     auth: false, desc: "Buy/sell volume split for a symbol" },
    ],
  },
  {
    id: "klines", label: "Klines / OHLCV", icon: BarChart2, color: "text-cyan-400",
    endpoints: [
      { method: "GET", path: "/klines",        auth: false, desc: "OHLCV candlestick data (?symbol=&interval=1h)" },
      { method: "GET", path: "/uiKlines",      auth: false, desc: "Klines optimised for charting libraries" },
      { method: "GET", path: "/candles",       auth: false, desc: "Alias for /klines — semantic variant" },
      { method: "GET", path: "/ohlcv",         auth: false, desc: "Open/High/Low/Close/Volume array" },
      { method: "GET", path: "/chart/history", auth: false, desc: "TradingView UDF-compatible chart history" },
    ],
  },
  {
    id: "coins", label: "Coins & Networks", icon: Coins, color: "text-yellow-400",
    endpoints: [
      { method: "GET", path: "/coins",              auth: false, desc: "All listed coins with metadata" },
      { method: "GET", path: "/coin/:symbol",       auth: false, desc: "Single coin detail (e.g. /coin/BTC)" },
      { method: "GET", path: "/assets",             auth: false, desc: "Asset list alias — same as /coins" },
      { method: "GET", path: "/networks",           auth: false, desc: "All supported deposit/withdrawal networks" },
      { method: "GET", path: "/network/:network",   auth: false, desc: "Single network info (e.g. /network/ETH)" },
      { method: "GET", path: "/network/status",     auth: false, desc: "Live status of all networks (up/down/congested)" },
      { method: "GET", path: "/deposit-fees",       auth: false, desc: "Minimum deposit amounts per coin/network" },
      { method: "GET", path: "/withdraw-fees",      auth: false, desc: "Withdrawal fees per coin/network" },
      { method: "GET", path: "/minimum-deposit",    auth: false, desc: "Minimum deposit thresholds" },
      { method: "GET", path: "/minimum-withdraw",   auth: false, desc: "Minimum withdrawal thresholds" },
      { method: "GET", path: "/confirmation-count", auth: false, desc: "Required on-chain confirmations per network" },
      { method: "GET", path: "/token/info",         auth: false, desc: "Token contract info (?symbol=BTC)" },
    ],
  },
  {
    id: "spot", label: "Spot", icon: Zap, color: "text-lime-400",
    endpoints: [
      { method: "GET", path: "/spot/pairs",       auth: false, desc: "All active spot trading pairs" },
      { method: "GET", path: "/spot/statistics",  auth: false, desc: "Aggregate spot market statistics" },
      { method: "GET", path: "/spot/top-volume",  auth: false, desc: "Top pairs by 24h trade volume" },
      { method: "GET", path: "/spot/top-gainers", auth: false, desc: "Pairs with highest 24h price gain" },
      { method: "GET", path: "/spot/top-losers",  auth: false, desc: "Pairs with largest 24h price drop" },
      { method: "GET", path: "/spot/liquidity",   auth: false, desc: "Bid/ask liquidity depth for a pair (?symbol=)" },
      { method: "GET", path: "/spot/markets",     auth: false, desc: "Spot market list with enriched price data" },
    ],
  },
  {
    id: "futures", label: "Futures", icon: BarChart, color: "text-orange-400",
    endpoints: [
      { method: "GET", path: "/futures/contracts",     auth: false, desc: "All active perpetual futures contracts" },
      { method: "GET", path: "/futures/index-price",   auth: false, desc: "Index price for a contract (?symbol=)" },
      { method: "GET", path: "/futures/mark-price",    auth: false, desc: "Mark price (index × basis) for a contract" },
      { method: "GET", path: "/futures/open-interest", auth: false, desc: "Total open interest in qty for a contract" },
      { method: "GET", path: "/futures/funding-rate",  auth: false, desc: "Current funding rate per 8h for all / one pair" },
      { method: "GET", path: "/futures/insurance-fund",auth: false, desc: "Insurance fund balance" },
      { method: "GET", path: "/futures/statistics",    auth: false, desc: "Aggregate futures market statistics" },
      { method: "GET", path: "/futures/markets",       auth: false, desc: "Futures market list with mark price and OI" },
      { method: "GET", path: "/futures/leaderboard",   auth: false, desc: "Top traders by PnL (all time)" },
    ],
  },
  {
    id: "ai", label: "AI Trading", icon: Bot, color: "text-fuchsia-400",
    endpoints: [
      { method: "GET", path: "/ai/plans",          auth: false, desc: "Available AI trading subscription plans" },
      { method: "GET", path: "/ai/performance",    auth: false, desc: "Historical performance per AI plan" },
      { method: "GET", path: "/ai/statistics",     auth: false, desc: "Platform-wide AI trading statistics" },
      { method: "GET", path: "/ai/live",           auth: false, desc: "Simulated live AI trade feed" },
      { method: "GET", path: "/ai/strategies",     auth: false, desc: "Strategy descriptions for each plan" },
      { method: "GET", path: "/ai/leaderboard",    auth: false, desc: "Top AI plans by ROI" },
      { method: "GET", path: "/ai/top-performers", auth: false, desc: "Best performing AI subscribers" },
      { method: "GET", path: "/ai/roi",            auth: false, desc: "ROI breakdown by plan and timeframe" },
      { method: "GET", path: "/ai/profit",         auth: false, desc: "Profit statistics across all AI plans" },
      { method: "GET", path: "/ai/signals",        auth: false, desc: "Current AI trading signals" },
      { method: "GET", path: "/ai/backtest",       auth: false, desc: "Historical backtest results for strategies" },
    ],
  },
  {
    id: "earn", label: "Earn", icon: PiggyBank, color: "text-teal-400",
    endpoints: [
      { method: "GET", path: "/earn/plans",      auth: false, desc: "All earn/staking plan configurations" },
      { method: "GET", path: "/earn/categories", auth: false, desc: "Earn product categories (flexible, locked, DeFi)" },
      { method: "GET", path: "/earn/products",   auth: false, desc: "All earn products with APY and terms" },
      { method: "GET", path: "/earn/apy",        auth: false, desc: "Current APY rates per product" },
      { method: "GET", path: "/earn/statistics", auth: false, desc: "Total value locked and platform yield stats" },
      { method: "GET", path: "/earn/featured",   auth: false, desc: "Featured earn products for homepage widgets" },
    ],
  },
  {
    id: "convert", label: "Convert", icon: ArrowLeftRight, color: "text-indigo-400",
    endpoints: [
      { method: "GET", path: "/convert/quote",     auth: false, desc: "Instant conversion quote (?from=&to=&amount=)" },
      { method: "GET", path: "/convert/rates",     auth: false, desc: "All conversion rates (USDT and INR base)" },
      { method: "GET", path: "/convert/supported", auth: false, desc: "Supported coin pairs for instant convert" },
    ],
  },
  {
    id: "referral", label: "Referral", icon: Gift, color: "text-pink-400",
    endpoints: [
      { method: "GET", path: "/referral/info",       auth: false, desc: "Referral program overview and commission structure" },
      { method: "GET", path: "/referral/rules",      auth: false, desc: "Referral tier rules and eligibility" },
      { method: "GET", path: "/referral/rewards",    auth: false, desc: "Reward tiers and bonus thresholds" },
      { method: "GET", path: "/referral/statistics", auth: false, desc: "Platform-wide referral program statistics" },
      { method: "GET", path: "/referral/campaigns",  auth: false, desc: "Active referral bonus campaigns" },
    ],
  },
  {
    id: "announcements", label: "Announcements", icon: Megaphone, color: "text-sky-400",
    endpoints: [
      { method: "GET", path: "/announcements", auth: false, desc: "Platform announcements (new listings, alerts)" },
      { method: "GET", path: "/news",          auth: false, desc: "Exchange and crypto news feed" },
      { method: "GET", path: "/blog",          auth: false, desc: "Official blog posts" },
      { method: "GET", path: "/events",        auth: false, desc: "Upcoming and past platform events" },
      { method: "GET", path: "/notices",       auth: false, desc: "Compliance and regulatory notices" },
      { method: "GET", path: "/promotions",    auth: false, desc: "Active promotions and bonus campaigns" },
      { method: "GET", path: "/updates",       auth: false, desc: "Product update release notes" },
    ],
  },
  {
    id: "cms", label: "CMS / Content", icon: Layout, color: "text-violet-400",
    endpoints: [
      { method: "GET", path: "/banners",          auth: false, desc: "Hero banners for homepage carousels" },
      { method: "GET", path: "/sliders",          auth: false, desc: "Slider images for homepage" },
      { method: "GET", path: "/homepage",         auth: false, desc: "Homepage section configuration" },
      { method: "GET", path: "/faqs",             auth: false, desc: "Frequently asked questions" },
      { method: "GET", path: "/support/articles", auth: false, desc: "Help centre articles" },
      { method: "GET", path: "/pages",            auth: false, desc: "Legal pages list (terms, privacy, etc.)" },
      { method: "GET", path: "/company",          auth: false, desc: "Company / brand information" },
      { method: "GET", path: "/social-links",     auth: false, desc: "Official social media links" },
    ],
  },
  {
    id: "statistics", label: "Statistics", icon: BarChart2, color: "text-emerald-400",
    endpoints: [
      { method: "GET", path: "/statistics",      auth: false, desc: "Exchange-wide statistics (users, trades, pairs)" },
      { method: "GET", path: "/global",          auth: false, desc: "Global crypto market summary" },
      { method: "GET", path: "/exchange-volume", auth: false, desc: "Exchange trading volume by period" },
      { method: "GET", path: "/trading-volume",  auth: false, desc: "24h trading volume across all pairs" },
      { method: "GET", path: "/users",           auth: false, desc: "Registered and active user counts" },
      { method: "GET", path: "/liquidity",       auth: false, desc: "Total order book liquidity across pairs" },
      { method: "GET", path: "/market-cap",      auth: false, desc: "Market cap data for all listed coins" },
      { method: "GET", path: "/top-coins",       auth: false, desc: "Top coins ranked by market cap" },
      { method: "GET", path: "/top-volume",      auth: false, desc: "Top coins ranked by 24h trading volume" },
      { method: "GET", path: "/platform",        auth: false, desc: "Platform summary — uptime, users, pairs" },
    ],
  },
];

const PRIVATE_ENDPOINTS: Endpoint[] = [
  { method: "GET",    path: "/account/balances",  auth: true, desc: "Spot wallet balances for all coins" },
  { method: "GET",    path: "/account/positions", auth: true, desc: "Open futures positions" },
  { method: "POST",   path: "/orders",            auth: true, desc: "Place a new order (limit, market, stop)" },
  { method: "GET",    path: "/orders/:id",        auth: true, desc: "Get an order by id" },
  { method: "DELETE", path: "/orders/:id",        auth: true, desc: "Cancel an open order" },
  { method: "DELETE", path: "/orders",            auth: true, desc: "Cancel all open orders for a symbol" },
  { method: "GET",    path: "/orders/history",    auth: true, desc: "Filled & cancelled orders (paginated)" },
  { method: "POST",   path: "/transfers",         auth: true, desc: "Internal wallet-to-wallet transfer" },
];

const ERRORS = [
  { code: 400, name: "Bad Request",       meaning: "Validation failed — see errors[] for details" },
  { code: 401, name: "Unauthorized",      meaning: "Missing or invalid HMAC signature / API key" },
  { code: 403, name: "Forbidden",         meaning: "Key lacks required permission, or IP not whitelisted" },
  { code: 404, name: "Not Found",         meaning: "Resource (order, symbol, account) does not exist" },
  { code: 418, name: "Locked",            meaning: "Account temporarily locked for security review" },
  { code: 429, name: "Too Many Requests", meaning: "Rate limit exceeded — back off and retry" },
  { code: 451, name: "Unavailable",       meaning: "Service unavailable in your jurisdiction" },
  { code: 503, name: "Service Unavail.",  meaning: "Engine in maintenance mode — retry shortly" },
];

const TOTAL_PUBLIC = PUBLIC_GROUPS.reduce((s, g) => s + g.endpoints.length, 0);

// ─── Sub-components ───────────────────────────────────────────────────────────

function CodeBlock({ code, lang = "bash", id }: { code: string; lang?: string; id: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success("Code copied to clipboard");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Copy failed");
    }
  };
  return (
    <div className="not-prose group relative my-3 rounded-lg border border-border bg-card dark:bg-zinc-950/80 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-muted/50">
        <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{lang}</span>
        <button
          type="button"
          onClick={onCopy}
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 px-2 py-0.5 rounded transition-colors"
        >
          {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="px-4 py-3 text-xs font-mono leading-relaxed text-foreground overflow-x-auto"><code>{code}</code></pre>
    </div>
  );
}

function MethodBadge({ method }: { method: Method }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border shrink-0 ${METHOD_COLOR[method]}`}>
      {method}
    </span>
  );
}

function EndpointTable({ endpoints }: { endpoints: Endpoint[] }) {
  return (
    <div className="not-prose overflow-x-auto rounded-lg border border-border my-3">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="text-left font-semibold px-3 py-2.5 w-20">Method</th>
            <th className="text-left font-semibold px-3 py-2.5">Path</th>
            <th className="text-left font-semibold px-3 py-2.5 w-16">Auth</th>
            <th className="text-left font-semibold px-3 py-2.5">Description</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {endpoints.map((e) => (
            <tr key={`${e.method}-${e.path}`} className="hover:bg-accent/20">
              <td className="px-3 py-2"><MethodBadge method={e.method} /></td>
              <td className="px-3 py-2 font-mono text-xs">{e.path}</td>
              <td className="px-3 py-2">
                {e.auth
                  ? <span className="text-amber-400 text-xs inline-flex items-center gap-1"><KeyRound className="h-3 w-3" /> Signed</span>
                  : <span className="text-muted-foreground text-xs">Public</span>}
              </td>
              <td className="px-3 py-2 text-muted-foreground text-xs">{e.desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GroupedEndpointRef() {
  const [open, setOpen] = useState<Set<string>>(new Set(["system"]));
  const toggle = (id: string) =>
    setOpen((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <div className="not-prose space-y-2 my-4">
      {PUBLIC_GROUPS.map((g) => {
        const GIcon = g.icon;
        const isOpen = open.has(g.id);
        return (
          <div key={g.id} className="rounded-lg border border-border overflow-hidden">
            <button
              type="button"
              onClick={() => toggle(g.id)}
              className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
            >
              <div className="flex items-center gap-2.5">
                <GIcon className={`h-4 w-4 ${g.color}`} />
                <span className="font-semibold text-sm">{g.label}</span>
                <Badge variant="outline" className="text-[10px] ml-1">{g.endpoints.length}</Badge>
              </div>
              <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? "rotate-90" : ""}`} />
            </button>
            {isOpen && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-t border-border">
                  <tbody className="divide-y divide-border/50">
                    {g.endpoints.map((e) => (
                      <tr key={e.path} className="hover:bg-accent/10">
                        <td className="px-3 py-2 w-20"><MethodBadge method={e.method} /></td>
                        <td className="px-3 py-2 font-mono text-xs text-foreground/90">
                          <code>{REST_BASE}{e.path}</code>
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{e.desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Sections ────────────────────────────────────────────────────────────────

const SECTIONS: Section[] = [
  {
    id: "overview",
    title: "Overview",
    content: (
      <>
        <p>
          The Zebvix Exchange API gives you programmatic access to{" "}
          <strong>{TOTAL_PUBLIC} public market data endpoints</strong> and — with an API key —
          to your account, orders, positions, and transfers. The API is REST + WebSocket,
          JSON over HTTPS / WSS, designed for low-latency algorithmic trading.
        </p>
        <ul>
          <li><strong>REST base URL</strong> — <code>{REST_BASE}</code></li>
          <li><strong>WebSocket</strong> — <code>{WS_BASE}</code></li>
          <li><strong>Encoding</strong> — UTF-8 JSON; timestamps in milliseconds (epoch)</li>
          <li><strong>Time sync</strong> — keep your clock within 1 second of <code>GET /time</code></li>
          <li><strong>Live status</strong> — <Link href="/api-status">API Status Monitor</Link> — real-time test of all {TOTAL_PUBLIC} endpoints</li>
        </ul>
        <CodeBlock id="quick-ping" lang="bash" code={`curl -s "${REST_BASE}/ping"
# → {"pong":true,"ts":1718000000000}`} />
      </>
    ),
  },
  {
    id: "auth",
    title: "Authentication (HMAC-SHA256)",
    content: (
      <>
        <p>
          Generate an API key from <Link href="/settings">Settings → Security → API keys</Link>.
          Each key has a public <code>API-Key</code> id and a private secret used to sign requests.
        </p>
        <p>Every authenticated request must include three headers:</p>
        <CodeBlock id="auth-headers" lang="http" code={`X-ZBX-APIKEY: <your-api-key>
X-ZBX-TIMESTAMP: <unix-millis>
X-ZBX-SIGN: <hex-hmac-sha256(secret, timestamp + method + path + body)>`} />
        <p>Example signing in Node.js:</p>
        <CodeBlock id="auth-node" lang="javascript" code={`import crypto from "node:crypto";

const API_KEY = process.env.ZBX_API_KEY;
const SECRET  = process.env.ZBX_API_SECRET;

function sign({ method, path, body = "" }) {
  const ts  = Date.now().toString();
  const msg = ts + method.toUpperCase() + path + body;
  const sig = crypto.createHmac("sha256", SECRET).update(msg).digest("hex");
  return { "X-ZBX-APIKEY": API_KEY, "X-ZBX-TIMESTAMP": ts, "X-ZBX-SIGN": sig };
}`} />
      </>
    ),
  },
  {
    id: "rate-limits",
    title: "Rate limits",
    content: (
      <>
        <p>Limits are per API key, applied as a sliding 60-second window:</p>
        <ul>
          <li><strong>Public endpoints</strong> — 1,200 requests / minute</li>
          <li><strong>Private (order placement)</strong> — 100 req / sec, burst up to 200 req / sec</li>
          <li><strong>WebSocket subscriptions</strong> — 200 streams / connection, 20 connections / key</li>
        </ul>
        <p>
          When you hit a limit you receive HTTP <strong>429</strong> with a{" "}
          <code>Retry-After</code> header. Persistent abuse may result in a
          temporary 5-minute key suspension.
        </p>
      </>
    ),
  },
  {
    id: "public-endpoints",
    title: `Public REST endpoints (${TOTAL_PUBLIC})`,
    content: (
      <>
        <p>
          All {TOTAL_PUBLIC} endpoints listed below require <strong>no authentication</strong>.
          They are organised into <strong>16 categories</strong>. Click a category to expand its endpoint list.
          You can also use the <Link href="/api-status">API Status page</Link> to live-test all of them.
        </p>
        <GroupedEndpointRef />
        <h3>Example — fetch BTCUSDT order book</h3>
        <CodeBlock id="public-curl" lang="bash" code={`curl -s "${REST_BASE}/orderbook?symbol=BTCUSDT&limit=10" | jq`} />
        <h3>Example — top gainers</h3>
        <CodeBlock id="gainers-curl" lang="bash" code={`curl -s "${REST_BASE}/spot/top-gainers" | jq '.pairs[:5]'`} />
        <h3>Example — AI trading plans</h3>
        <CodeBlock id="ai-plans-curl" lang="bash" code={`curl -s "${REST_BASE}/ai/plans" | jq '.plans[] | {name, minAmount, roi30d}'`} />
      </>
    ),
  },
  {
    id: "private-endpoints",
    title: "Private REST endpoints",
    content: (
      <>
        <p>
          These endpoints require a valid <code>X-ZBX-APIKEY</code> and HMAC-SHA256 signature.
          See the <a href="#auth">Authentication</a> section for signing details.
        </p>
        <EndpointTable endpoints={PRIVATE_ENDPOINTS} />
        <h3>Example — place a limit buy order</h3>
        <CodeBlock id="place-order" lang="bash" code={`curl -X POST "${REST_BASE}/orders" \\
  -H "Content-Type: application/json" \\
  -H "X-ZBX-APIKEY: $ZBX_API_KEY" \\
  -H "X-ZBX-TIMESTAMP: $TS" \\
  -H "X-ZBX-SIGN: $SIG" \\
  -d '{
    "symbol": "BTCUSDT",
    "side":   "BUY",
    "type":   "LIMIT",
    "price":  "62500.00",
    "qty":    "0.005",
    "tif":    "GTC",
    "clientOrderId": "myapp-12345"
  }'`} />
      </>
    ),
  },
  {
    id: "websocket",
    title: "WebSocket streams",
    content: (
      <>
        <p>Connect to <code>{WS_BASE}</code> and send a JSON subscribe message:</p>
        <CodeBlock id="ws-sub" lang="json" code={`{
  "id": 1,
  "op": "subscribe",
  "args": [
    "ticker.BTCUSDT",
    "depth20.BTCUSDT",
    "trade.BTCUSDT",
    "kline.1m.BTCUSDT"
  ]
}`} />
        <p>Authenticated streams (account, orders, positions) require an extra <code>auth</code> message:</p>
        <CodeBlock id="ws-auth" lang="json" code={`{
  "id": 2,
  "op": "auth",
  "args": {
    "apiKey":    "<your-api-key>",
    "timestamp": 1714123456789,
    "signature": "<hex-hmac-sha256(secret, timestamp + 'WSAUTH')>"
  }
}`} />
        <p>
          The server pings every 30 s — your client must respond with a pong
          frame within 10 s or the connection will be closed.
        </p>
      </>
    ),
  },
  {
    id: "errors",
    title: "Error codes",
    content: (
      <>
        <p>All error responses follow a consistent shape:</p>
        <CodeBlock id="error-shape" lang="json" code={`{
  "ok": false,
  "code": "INSUFFICIENT_BALANCE",
  "message": "Available 12.30 USDT is less than required 50.00 USDT",
  "requestId": "req_01HX6YY0JTZ8M5"
}`} />
        <div className="not-prose overflow-x-auto rounded-lg border border-border my-4">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left font-semibold px-3 py-2.5">HTTP</th>
                <th className="text-left font-semibold px-3 py-2.5">Name</th>
                <th className="text-left font-semibold px-3 py-2.5">Meaning</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {ERRORS.map((e) => (
                <tr key={e.code} className="hover:bg-accent/20">
                  <td className="px-3 py-2.5 font-mono">{e.code}</td>
                  <td className="px-3 py-2.5 font-semibold">{e.name}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{e.meaning}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    ),
  },
  {
    id: "sdks",
    title: "Official SDKs",
    content: (
      <>
        <ul>
          <li><strong>Node.js / TypeScript</strong> — <code>npm i @zebvix/sdk</code></li>
          <li><strong>Python</strong> — <code>pip install zebvix</code></li>
          <li><strong>Go</strong> — <code>go get github.com/zebvix/go-sdk</code></li>
          <li><strong>Java / Kotlin</strong> — Maven / Gradle on Maven Central</li>
        </ul>
        <p>
          All SDKs handle HMAC signing, automatic time-sync, request retries
          with jittered back-off, WebSocket reconnection, and typed response models.
        </p>
      </>
    ),
  },
  {
    id: "best-practices",
    title: "Best practices",
    content: (
      <>
        <ul>
          <li>Whitelist the IPs your bot trades from — every API key supports up to 5 IPs;</li>
          <li>Use <strong>read-only</strong> keys for analytics; reserve <strong>trade</strong> permission for the executing service;</li>
          <li>Never enable <strong>withdraw</strong> permission unless absolutely necessary; always pair it with IP whitelist + 2FA;</li>
          <li>Set a unique <code>clientOrderId</code> on every new order so reconnect logic is idempotent;</li>
          <li>Subscribe to the private order stream and treat REST polling as a fallback;</li>
          <li>Implement exponential back-off on 429 / 503 — never hammer a degraded engine;</li>
          <li>Rotate API keys at least every 90 days; old keys can be revoked from <Link href="/settings">Settings</Link>.</li>
        </ul>
      </>
    ),
  },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ApiDocs() {
  const [activeId, setActiveId] = useState(SECTIONS[0]?.id ?? "");

  useEffect(() => {
    const onScroll = () => {
      const fromTop = window.scrollY + 140;
      let current = SECTIONS[0]?.id ?? "";
      for (const s of SECTIONS) {
        const el = document.getElementById(s.id);
        if (el && el.offsetTop <= fromTop) current = s.id;
      }
      setActiveId(current);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="container mx-auto px-4 py-10 max-w-7xl" data-testid="page-api-docs">

      {/* ── Hero ── */}
      <section className="rounded-2xl border border-border bg-gradient-to-br from-sky-500/10 via-card to-card p-8 md:p-12 mb-10 relative overflow-hidden">
        <div className="absolute -top-20 -right-20 h-72 w-72 rounded-full bg-sky-500/10 blur-3xl pointer-events-none" />
        <div className="relative max-w-3xl">
          <Badge variant="outline" className="mb-3 bg-background/50">
            <Code2 className="h-3 w-3 mr-1.5 text-primary" /> API Documentation
          </Badge>
          <h1 className="text-2xl md:text-4xl font-extrabold tracking-tight mb-4 leading-tight">
            Build on Zebvix.{" "}
            <span className="bg-gradient-to-r from-sky-400 to-cyan-400 bg-clip-text text-transparent">
              Trade programmatically.
            </span>
          </h1>
          <p className="text-base md:text-lg text-muted-foreground leading-relaxed mb-5">
            <strong className="text-foreground">{TOTAL_PUBLIC} public REST endpoints</strong> across 16 categories — no auth needed.
            Plus private signed endpoints for orders, positions, and account management.
          </p>
          <div className="flex flex-wrap gap-2 mb-5">
            <Badge variant="secondary"><Zap className="h-3 w-3 mr-1" /> Sub-ms matching</Badge>
            <Badge variant="secondary"><ShieldCheck className="h-3 w-3 mr-1" /> HMAC-SHA256 signed</Badge>
            <Badge variant="secondary"><Webhook className="h-3 w-3 mr-1" /> WebSocket streams</Badge>
            <Badge variant="secondary"><Network className="h-3 w-3 mr-1" /> 1,200 req / min</Badge>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/settings">
              <Button data-testid="button-api-create-key" className="bg-primary text-primary-foreground hover:bg-primary/90">
                Create API key <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </Link>
            <Link href="/api-status">
              <Button variant="outline" data-testid="button-api-status">
                <Activity className="h-4 w-4 mr-2" /> Live API Status
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* ── Quick start cards ── */}
      <section className="grid sm:grid-cols-3 gap-4 mb-10">
        <Card className="bg-card/40">
          <CardContent className="p-5">
            <Globe className="h-5 w-5 text-primary mb-2" />
            <div className="font-semibold mb-1">REST API</div>
            <code className="text-xs text-muted-foreground break-all">{REST_BASE}</code>
            <div className="text-xs text-muted-foreground mt-2">{TOTAL_PUBLIC} public endpoints</div>
          </CardContent>
        </Card>
        <Card className="bg-card/40">
          <CardContent className="p-5">
            <Webhook className="h-5 w-5 text-primary mb-2" />
            <div className="font-semibold mb-1">WebSocket</div>
            <code className="text-xs text-muted-foreground break-all">{WS_BASE}</code>
            <div className="text-xs text-muted-foreground mt-2">Real-time ticker, trades, orderbook</div>
          </CardContent>
        </Card>
        <Card className="bg-card/40">
          <CardContent className="p-5">
            <Sparkles className="h-5 w-5 text-primary mb-2" />
            <div className="font-semibold mb-1">API Status</div>
            <Link href="/api-status" className="text-xs text-primary hover:underline inline-flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
              View live status monitor
            </Link>
            <div className="text-xs text-muted-foreground mt-2">Live-tests all {TOTAL_PUBLIC} endpoints</div>
          </CardContent>
        </Card>
      </section>

      <div className="grid lg:grid-cols-12 gap-8">
        {/* ── TOC ── */}
        <aside className="lg:col-span-3 lg:sticky lg:top-24 lg:self-start order-2 lg:order-1">
          <div className="rounded-xl border border-border bg-card/40 p-4">
            <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3 px-2">
              Reference
            </div>
            <nav>
              <ol className="space-y-0.5">
                {SECTIONS.map((s, i) => {
                  const active = activeId === s.id;
                  return (
                    <li key={s.id}>
                      <a
                        href={`#${s.id}`}
                        className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors ${
                          active
                            ? "bg-primary/10 text-primary font-semibold"
                            : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                        }`}
                      >
                        <span className="text-xs tabular-nums opacity-60 w-5">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <span className="truncate">{s.title}</span>
                      </a>
                    </li>
                  );
                })}
              </ol>
            </nav>
          </div>

          <div className="rounded-xl border border-border bg-card/40 p-4 mt-4 text-xs text-muted-foreground space-y-2">
            <Terminal className="h-4 w-4 text-primary" />
            <div className="font-semibold text-foreground/90">Live status</div>
            <p>Test all {TOTAL_PUBLIC} endpoints in real time.</p>
            <Link href="/api-status" className="inline-flex items-center text-primary hover:underline">
              Open API Status <ChevronRight className="h-3 w-3 ml-0.5" />
            </Link>
          </div>

          <div className="rounded-xl border border-border bg-card/40 p-4 mt-4 text-xs text-muted-foreground space-y-2">
            <Terminal className="h-4 w-4 text-primary" />
            <div className="font-semibold text-foreground/90">Need help?</div>
            <p>API integration questions? Our developer-relations team responds within 24h.</p>
            <Link href="/support" className="inline-flex items-center text-primary hover:underline">
              Contact dev support <ChevronRight className="h-3 w-3 ml-0.5" />
            </Link>
          </div>
        </aside>

        {/* ── Content ── */}
        <article className="lg:col-span-9 order-1 lg:order-2 space-y-12 leading-relaxed">
          {SECTIONS.map((s, i) => (
            <section id={s.id} key={s.id} className="scroll-mt-24">
              <div className="flex items-baseline gap-3 mb-3">
                <span className="text-xs font-bold tabular-nums text-muted-foreground">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h2 className="text-xl md:text-2xl font-bold tracking-tight">{s.title}</h2>
              </div>
              <div className="prose prose-sm md:prose-base max-w-none text-foreground/90 [&_p]:my-3 [&_ul]:my-3 [&_li]:my-1 [&_a]:text-primary [&_a]:underline [&_strong]:text-foreground [&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:text-base [&_h3]:font-semibold [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:bg-muted [&_code]:text-xs [&_code]:font-mono">
                {s.content}
              </div>
            </section>
          ))}
        </article>
      </div>
    </div>
  );
}
