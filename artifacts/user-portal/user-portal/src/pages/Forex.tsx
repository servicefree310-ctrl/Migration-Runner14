import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { SuccessModal, type GenericSuccess } from "@/components/SuccessModal";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import {
  Globe, RefreshCw, Info, Link2, ChevronRight, Star, StarOff,
  TrendingUp, TrendingDown, Activity, Clock, Shield, Zap,
  BarChart3, BookOpen, ChevronDown, ChevronUp, X, Settings,
  Calculator, AlertTriangle, CheckCircle2, Wifi, WifiOff,
  Terminal, Eye, EyeOff, Plug, PlugZap, ExternalLink,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
type Instrument = {
  id: number; symbol: string; name: string; assetClass: string;
  exchange: string; quoteCurrency: string; currentPrice: string;
  previousClose: string; change24h: string; high24h: string; low24h: string;
  volume24h: string; tradingEnabled: boolean; lotSize: string;
  minQty: string; maxQty: string; maxLeverage: number;
  marginRequired: string; takerFee: string; pricePrecision: number;
  qtyPrecision: number; sector: string | null; countryCode?: string;
};

type Position = {
  id: number; symbol: string; name: string; side: string; qty: string;
  avgEntryPrice: number; currentPrice: number; unrealizedPnl: number;
  realizedPnl: number; leverage: number; marginUsed: number;
  quoteCurrency: string; assetClass: string; createdAt: string;
};

type OrderRow = {
  id: number; symbol: string; name: string; side: string; type: string;
  qty: string; price: string | null; filledQty: string; avgFillPrice: string | null;
  status: string; fee: string; pnl: string; createdAt: string;
  assetClass: string; quoteCurrency: string;
};

type MT5Account = {
  id: number; server: string; login: string; name: string | null;
  currency: string | null; leverage: number | null; balance: string | null;
  equity: string | null; margin: string | null; freeMargin: string | null;
  status: string; isDemo: boolean; connectionType: string | null;
  lastError: string | null; lastConnectedAt: string | null;
  sessionToken?: string; createdAt: string;
};

type OHLC = { t: number; o: number; h: number; l: number; c: number; v: number };
type TF = "M1" | "M5" | "M15" | "H1" | "H4" | "D1";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function p(n: number, dp = 5) { return isFinite(n) && n ? n.toFixed(dp) : "—"; }
function pct(n: number) { return (n >= 0 ? "+" : "") + n.toFixed(3) + "%"; }
function pip(n: number, pp: number) { return (n * Math.pow(10, pp)).toFixed(1); }
function fmtTime(ts: number) {
  const d = new Date(ts);
  return d.getHours().toString().padStart(2, "0") + ":" + d.getMinutes().toString().padStart(2, "0");
}
function fmtCurrency(n: number, cur = "INR") {
  if (!isFinite(n)) return "—";
  const prefix = cur === "INR" ? "₹" : cur === "USD" ? "$" : cur + " ";
  return prefix + Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Generate simulated OHLC data
function genOHLC(base: number, count: number, tfMs: number): OHLC[] {
  const bars: OHLC[] = [];
  let price = base;
  const now = Date.now();
  for (let i = count; i >= 0; i--) {
    const t = now - i * tfMs;
    const volatility = base * 0.0018;
    const o = price;
    const move1 = (Math.random() - 0.49) * volatility;
    const move2 = (Math.random() - 0.49) * volatility;
    const move3 = (Math.random() - 0.49) * volatility;
    const c = o + move1 + move2;
    const h = Math.max(o, c) + Math.abs(move3) * 0.5;
    const l = Math.min(o, c) - Math.abs(move3) * 0.5;
    const v = Math.floor(Math.random() * 50000 + 10000);
    bars.push({ t, o: +o.toFixed(5), h: +h.toFixed(5), l: +l.toFixed(5), c: +c.toFixed(5), v });
    price = c;
  }
  return bars;
}

const TF_OPTIONS: { label: TF; ms: number }[] = [
  { label: "M1", ms: 60_000 },
  { label: "M5", ms: 300_000 },
  { label: "M15", ms: 900_000 },
  { label: "H1", ms: 3_600_000 },
  { label: "H4", ms: 14_400_000 },
  { label: "D1", ms: 86_400_000 },
];

const FOREX_SESSIONS = [
  { name: "Tokyo", open: 0, close: 9, color: "text-blue-400" },
  { name: "London", open: 8, close: 17, color: "text-purple-400" },
  { name: "New York", open: 13, close: 22, color: "text-amber-400" },
  { name: "Sydney", open: 22, close: 7, color: "text-emerald-400" },
];

const PAIR_FLAGS: Record<string, string> = {
  AUD: "🇦🇺", CAD: "🇨🇦", CHF: "🇨🇭", EUR: "🇪🇺", GBP: "🇬🇧",
  JPY: "🇯🇵", NZD: "🇳🇿", USD: "🇺🇸", INR: "🇮🇳", SGD: "🇸🇬",
  HKD: "🇭🇰", SEK: "🇸🇪", NOK: "🇳🇴", DKK: "🇩🇰", MXN: "🇲🇽",
};

// ─── CandlestickChart (SVG) ──────────────────────────────────────────────────
function CandlestickChart({ bars, symbol, tf, pp }: {
  bars: OHLC[]; symbol: string; tf: TF; pp: number;
}) {
  const W = 900, H = 340, PAD_L = 64, PAD_R = 60, PAD_T = 16, PAD_B = 28;
  const visibleBars = bars.slice(-80);
  const allH = visibleBars.map(b => b.h);
  const allL = visibleBars.map(b => b.l);
  const maxH = Math.max(...allH);
  const minL = Math.min(...allL);
  const range = maxH - minL || 0.0001;

  const toY = (v: number) => PAD_T + ((maxH - v) / range) * (H - PAD_T - PAD_B);
  const barW = Math.max(2, (W - PAD_L - PAD_R) / visibleBars.length - 1);
  const barX = (i: number) => PAD_L + i * ((W - PAD_L - PAD_R) / visibleBars.length) + barW / 4;

  // Volume
  const maxVol = Math.max(...visibleBars.map(b => b.v));
  const volH = 50;

  // Price levels
  const priceLevels = 6;
  const levels = Array.from({ length: priceLevels + 1 }, (_, i) =>
    minL + (range * i) / priceLevels
  );

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H + volH}`} className="w-full" preserveAspectRatio="none">
      {/* Grid */}
      {levels.map((lv, i) => (
        <g key={i}>
          <line x1={PAD_L} x2={W - PAD_R} y1={toY(lv)} y2={toY(lv)}
            stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
          <text x={W - PAD_R + 4} y={toY(lv) + 4} fill="rgba(255,255,255,0.35)"
            fontSize="9" textAnchor="start">{lv.toFixed(pp)}</text>
        </g>
      ))}

      {/* Candles */}
      {visibleBars.map((b, i) => {
        const isUp = b.c >= b.o;
        const color = isUp ? "#22c55e" : "#ef4444";
        const x = barX(i);
        const cO = toY(b.o), cC = toY(b.c), cH = toY(b.h), cL = toY(b.l);
        const bodyTop = Math.min(cO, cC);
        const bodyH = Math.max(Math.abs(cO - cC), 1);
        return (
          <g key={i}>
            <line x1={x + barW / 2} x2={x + barW / 2} y1={cH} y2={cL}
              stroke={color} strokeWidth="1" />
            <rect x={x} y={bodyTop} width={barW} height={bodyH} fill={color} rx="0.5" />
          </g>
        );
      })}

      {/* Current price line */}
      {visibleBars.length > 0 && (() => {
        const last = visibleBars[visibleBars.length - 1];
        const y = toY(last.c);
        const isUp = last.c >= last.o;
        return (
          <g>
            <line x1={PAD_L} x2={W - PAD_R} y1={y} y2={y}
              stroke={isUp ? "#22c55e" : "#ef4444"} strokeWidth="1" strokeDasharray="4 3" opacity="0.7" />
            <rect x={W - PAD_R + 2} y={y - 8} width={52} height={16}
              fill={isUp ? "#22c55e" : "#ef4444"} rx="2" />
            <text x={W - PAD_R + 28} y={y + 4} fill="white" fontSize="9"
              textAnchor="middle" fontWeight="bold">{last.c.toFixed(pp)}</text>
          </g>
        );
      })()}

      {/* Volume bars */}
      {visibleBars.map((b, i) => {
        const isUp = b.c >= b.o;
        const vH = (b.v / maxVol) * volH * 0.9;
        const x = barX(i);
        return (
          <rect key={i} x={x} y={H + volH - vH} width={barW} height={vH}
            fill={isUp ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"} rx="0.5" />
        );
      })}

      {/* Time labels */}
      {visibleBars.filter((_, i) => i % Math.floor(visibleBars.length / 6) === 0).map((b, i) => (
        <text key={i} x={barX(i * Math.floor(visibleBars.length / 6))}
          y={H + volH - 2} fill="rgba(255,255,255,0.3)" fontSize="8">{fmtTime(b.t)}</text>
      ))}
    </svg>
  );
}

// ─── MT5 Broker Catalog ───────────────────────────────────────────────────────
const MT5_BROKERS = [
  { id: "zebvix",    label: "Zebvix",        demo: "Zebvix-MT5Demo",    live: "Zebvix-MT5Live",      region: "IN", color: "#F59E0B", popular: true },
  { id: "icmarkets", label: "IC Markets",     demo: "ICMarkets-Demo",    live: "ICMarkets-Live01",    region: "AU", color: "#1E88E5", popular: true },
  { id: "peppers",   label: "Pepperstone",    demo: "Pepperstone-Demo",  live: "Pepperstone-MT5",     region: "AU", color: "#EF5350", popular: true },
  { id: "exness",    label: "Exness",         demo: "Exness-MT5Trial",   live: "Exness-MT5Real",      region: "CY", color: "#26A69A", popular: true },
  { id: "xm",        label: "XM",             demo: "XM.COM-Demo",       live: "XM.COM-Real",         region: "CY", color: "#FF7043", popular: true },
  { id: "fxtm",      label: "FXTM",           demo: "FXTM-Demo",         live: "FXTM-MT5",            region: "CY", color: "#5C6BC0", popular: false },
  { id: "angelone",  label: "Angel One",      demo: "AngelOne-MT5Demo",  live: "AngelOne-MT5Live",    region: "IN", color: "#AB47BC", popular: false },
  { id: "zerodha",   label: "ZerodhaFX",      demo: "ZerodhaFX-Demo",    live: "ZerodhaFX-Live",      region: "IN", color: "#66BB6A", popular: false },
  { id: "admiral",   label: "Admiral",        demo: "Admiral-MT5Demo",   live: "Admiral-MT5Live",     region: "EU", color: "#42A5F5", popular: false },
  { id: "alpari",    label: "Alpari",         demo: "Alpari-MT5Demo",    live: "Alpari-MT5Real",      region: "UK", color: "#FF5722", popular: false },
  { id: "fusion",    label: "Fusion Markets", demo: "FusionMarkets-MT5Demo", live: "FusionMarkets-MT5", region: "AU", color: "#00BCD4", popular: false },
  { id: "custom",    label: "Other Broker",   demo: "",                  live: "",                    region: "  ", color: "#78909C", popular: false },
];

const ALL_MT5_SERVERS = MT5_BROKERS.flatMap(b => [b.demo, b.live].filter(Boolean));

// ─── MT5 Connect Modal ────────────────────────────────────────────────────────
function MT5ConnectModal({ onClose, onConnected }: {
  onClose: () => void;
  onConnected: (acct: MT5Account) => void;
}) {
  const qc = useQueryClient();

  // Step 1 = choose broker, Step 2 = enter credentials
  const [step, setStep] = useState<1 | 2>(1);
  const [isDemo, setIsDemo] = useState(true);
  const [selectedBroker, setSelectedBroker] = useState<typeof MT5_BROKERS[0] | null>(null);
  const [server, setServer] = useState("");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [connType, setConnType] = useState<"investor" | "master">("master");
  const [serverSuggest, setServerSuggest] = useState(false);

  const filtered = ALL_MT5_SERVERS.filter(s => s.toLowerCase().includes(server.toLowerCase()) && server.length > 1);

  function pickBroker(b: typeof MT5_BROKERS[0]) {
    setSelectedBroker(b);
    setServer(isDemo ? b.demo : b.live);
    if (b.id !== "custom") setStep(2);
    else setStep(2);
  }

  const connectMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/mt5/connect", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ server, login, password, connectionType: connType }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Connection failed");
      return data;
    },
    onSuccess: (data) => {
      toast.success(`MT5 Connected ✓ — ${data.account.server} · ${data.account.login} (${data.account.isDemo ? "Demo" : "Live"})`);
      qc.invalidateQueries({ queryKey: ["mt5-accounts"] });
      onConnected(data.account);
      onClose();
    },
    onError: (e: Error) => toast.error(e.message || "MT5 connection failed"),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
        style={{ width: step === 1 ? 560 : 440 }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/60 bg-card">
          <div className="flex items-center gap-3">
            {step === 2 && (
              <button onClick={() => setStep(1)} className="text-foreground/30 hover:text-foreground transition-colors mr-1">
                <ChevronDown size={18} className="rotate-90" />
              </button>
            )}
            <div className="w-9 h-9 rounded-xl bg-blue-500/15 flex items-center justify-center">
              <Terminal size={17} className="text-blue-400" />
            </div>
            <div>
              <div className="font-bold text-sm text-foreground">Connect MetaTrader 5</div>
              <div className="text-[10px] text-foreground/30">
                {step === 1 ? "Step 1 of 2 — Choose your broker" : `Step 2 of 2 — ${selectedBroker?.label ?? "Enter credentials"}`}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Demo / Live toggle */}
            <div className="flex bg-muted/30 rounded-lg p-0.5 gap-0.5">
              <button onClick={() => setIsDemo(true)}
                className={cn("px-3 py-1 text-[11px] font-semibold rounded-md transition-colors",
                  isDemo ? "bg-amber-500/20 text-amber-400" : "text-foreground/25 hover:text-foreground/50")}>
                Demo
              </button>
              <button onClick={() => setIsDemo(false)}
                className={cn("px-3 py-1 text-[11px] font-semibold rounded-md transition-colors",
                  !isDemo ? "bg-blue-500/20 text-blue-400" : "text-foreground/25 hover:text-foreground/50")}>
                Live
              </button>
            </div>
            <button onClick={onClose} className="text-foreground/30 hover:text-foreground transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Step 1 — Broker Grid */}
        {step === 1 && (
          <div className="p-5 space-y-4">
            <div className="text-[11px] text-foreground/35 font-medium uppercase tracking-wide">
              Popular Brokers
            </div>
            <div className="grid grid-cols-4 gap-2.5">
              {MT5_BROKERS.filter(b => b.popular).map(b => (
                <button key={b.id} onClick={() => pickBroker(b)}
                  className="flex flex-col items-center gap-2 p-3 rounded-xl border border-border/60 bg-white/3 hover:bg-muted/40 hover:border-white/15 transition-all group">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold"
                    style={{ background: b.color + "22", color: b.color }}>
                    {b.label.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="text-center">
                    <div className="text-[11px] font-semibold text-foreground/80 group-hover:text-foreground leading-tight">{b.label}</div>
                    <div className="text-[9px] text-foreground/25 mt-0.5">
                      {b.region === "IN" ? "🇮🇳" : b.region === "AU" ? "🇦🇺" : b.region === "UK" ? "🇬🇧" : "🌐"} {isDemo ? "Demo" : "Live"}
                    </div>
                  </div>
                </button>
              ))}
            </div>

            <div className="text-[11px] text-foreground/35 font-medium uppercase tracking-wide mt-2">
              More Brokers
            </div>
            <div className="grid grid-cols-4 gap-2">
              {MT5_BROKERS.filter(b => !b.popular).map(b => (
                <button key={b.id} onClick={() => pickBroker(b)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/6 bg-white/3 hover:bg-white/7 hover:border-border transition-all text-left">
                  <div className="w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                    style={{ background: b.color + "22", color: b.color }}>
                    {b.label.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="text-[11px] text-foreground/60 truncate">{b.label}</div>
                </button>
              ))}
            </div>

            <div className="bg-blue-500/6 border border-blue-500/15 rounded-xl p-3 flex gap-2 text-[11px] text-foreground/40">
              <Info size={12} className="text-blue-400 flex-shrink-0 mt-0.5" />
              <span>
                Your Zebvix account works with any MT5 broker. Demo accounts are free — no real funds required.
                Credentials are <span className="text-blue-300">bcrypt-encrypted</span> and never stored in plaintext.
              </span>
            </div>
          </div>
        )}

        {/* Step 2 — Credentials */}
        {step === 2 && (
          <div className="p-6 space-y-4">
            {/* Broker badge */}
            {selectedBroker && (
              <div className="flex items-center gap-2.5 p-2.5 bg-muted/30 rounded-xl">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                  style={{ background: selectedBroker.color + "22", color: selectedBroker.color }}>
                  {selectedBroker.label.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div className="text-xs font-semibold text-foreground">{selectedBroker.label}</div>
                  <div className="text-[10px] text-foreground/30">{server}</div>
                </div>
                <span className={cn("ml-auto text-[9px] px-2 py-0.5 rounded-full font-bold",
                  isDemo ? "bg-amber-500/15 text-amber-400" : "bg-blue-500/15 text-blue-400")}>
                  {isDemo ? "DEMO" : "LIVE"}
                </span>
              </div>
            )}

            {/* Server (editable if custom) */}
            <div className="relative">
              <div className="flex justify-between mb-1">
                <div className="text-[10px] text-foreground/35 font-medium">Broker Server Address</div>
              </div>
              <input value={server} onChange={e => { setServer(e.target.value); setServerSuggest(true); }}
                onBlur={() => setTimeout(() => setServerSuggest(false), 200)}
                placeholder="e.g. ICMarkets-Demo, Pepperstone-MT5"
                className="w-full bg-muted/30 border border-border px-3 h-10 text-sm rounded-xl text-foreground placeholder-white/20 focus:border-blue-500/50 focus:outline-none font-mono text-xs" />
              {serverSuggest && filtered.length > 0 && (
                <div className="absolute top-full mt-1 left-0 right-0 bg-popover border border-border rounded-xl overflow-hidden z-10 shadow-2xl max-h-40 overflow-y-auto">
                  {filtered.slice(0, 8).map(s => (
                    <button key={s} onClick={() => { setServer(s); setServerSuggest(false); }}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-muted/40 transition-colors text-foreground/70 flex items-center gap-2">
                      <Terminal size={10} className="text-blue-400 flex-shrink-0" />
                      <span className="flex-1 truncate">{s}</span>
                      {s.toLowerCase().includes("demo") || s.toLowerCase().includes("trial")
                        ? <span className="text-[9px] bg-amber-500/15 text-amber-400 px-1.5 py-0.5 rounded">DEMO</span>
                        : <span className="text-[9px] bg-blue-500/15 text-blue-400 px-1.5 py-0.5 rounded">LIVE</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Login */}
            <div>
              <div className="text-[10px] text-foreground/35 mb-1 font-medium">MT5 Account Login Number</div>
              <input value={login} onChange={e => setLogin(e.target.value)}
                placeholder="e.g. 12345678"
                className="w-full bg-muted/30 border border-border px-3 h-10 text-sm rounded-xl text-foreground placeholder-white/20 focus:border-blue-500/50 focus:outline-none font-mono" />
            </div>

            {/* Password */}
            <div>
              <div className="flex justify-between mb-1">
                <div className="text-[10px] text-foreground/35 font-medium">Password</div>
                <div className="flex bg-muted/30 rounded-md overflow-hidden">
                  {(["investor", "master"] as const).map(t => (
                    <button key={t} onClick={() => setConnType(t)}
                      className={cn("px-2 py-0.5 text-[9px] font-semibold transition-colors",
                        connType === t ? "bg-blue-500/25 text-blue-300" : "text-foreground/25 hover:text-foreground/50")}>
                      {t === "investor" ? "Investor" : "Master"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="relative">
                <input type={showPw ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)}
                  placeholder={connType === "investor" ? "Investor (read-only) password" : "Master password"}
                  className="w-full bg-muted/30 border border-border px-3 pr-10 h-10 text-sm rounded-xl text-foreground placeholder-white/20 focus:border-blue-500/50 focus:outline-none" />
                <button onClick={() => setShowPw(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/25 hover:text-foreground/60">
                  {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              {connType === "master" && (
                <div className="mt-1 text-[10px] text-amber-400/60 flex items-center gap-1">
                  <AlertTriangle size={9} /> Master password allows full trade execution via Zebvix.
                </div>
              )}
            </div>

            {/* Connect button */}
            <button onClick={() => connectMutation.mutate()}
              disabled={!server || !login || !password || connectMutation.isPending}
              className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-foreground font-bold text-sm transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
              {connectMutation.isPending ? (
                <><RefreshCw size={14} className="animate-spin" /> Authenticating with MT5...</>
              ) : (
                <><PlugZap size={14} /> Connect {selectedBroker?.label ?? "MT5"} Account</>
              )}
            </button>

            <div className="text-[10px] text-foreground/20 text-center">
              {isDemo
                ? "Demo: No real funds. Free practice account from your broker."
                : "Live: Connects to real broker account. All trades are real."}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── MT5 Account Card ─────────────────────────────────────────────────────────
function MT5AccountCard({ account, onDisconnect, compact = false }: {
  account: MT5Account; onDisconnect: () => void; compact?: boolean;
}) {
  const isConnected = account.status === "connected";
  const balance = parseFloat(account.balance ?? "0");
  const equity = parseFloat(account.equity ?? "0");
  const margin = parseFloat(account.margin ?? "0");
  const freeMargin = parseFloat(account.freeMargin ?? "0");
  const marginLevel = equity > 0 ? (equity / margin) * 100 : 0;
  const marginUsedPct = equity > 0 ? (margin / equity) * 100 : 0;
  const floatingPnl = equity - balance;
  const cur = account.currency ?? "USD";
  const broker = MT5_BROKERS.find(b => b.live === account.server || b.demo === account.server);
  const brokerColor = broker?.color ?? "#1E88E5";

  const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className={cn("rounded-xl border text-xs transition-all",
      isConnected
        ? account.isDemo
          ? "bg-amber-500/5 border-amber-500/20"
          : "bg-blue-500/5 border-blue-500/20"
        : "bg-white/3 border-border/60")}>

      {/* Account header */}
      <div className="flex items-center justify-between px-3 pt-2.5 pb-2">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
            style={{ background: brokerColor + "22", color: brokerColor }}>
            {(broker?.label ?? account.server).slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-[11px] text-foreground">{account.login}</span>
              <span className={cn("px-1.5 py-0.5 rounded text-[8px] font-bold uppercase",
                !isConnected ? "bg-muted/30 text-foreground/20" :
                account.isDemo ? "bg-amber-500/15 text-amber-400" : "bg-blue-500/15 text-blue-400")}>
                {!isConnected ? "Offline" : account.isDemo ? "Demo" : "Live"}
              </span>
            </div>
            <div className="text-[9px] text-foreground/30 mt-0.5 truncate max-w-[160px]">{account.server}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isConnected && (
            <div className="flex items-center gap-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[9px] text-emerald-400">Connected</span>
            </div>
          )}
          <button onClick={onDisconnect}
            className="text-foreground/15 hover:text-red-400 transition-colors p-1 rounded">
            <X size={11} />
          </button>
        </div>
      </div>

      {/* Stats grid */}
      {isConnected && !compact && (
        <div className="px-3 pb-3 space-y-2.5">
          {/* Balance / Equity / Free Margin */}
          <div className="grid grid-cols-3 gap-1.5">
            {[
              { label: "Balance", value: fmt(balance), sub: cur },
              { label: "Equity", value: fmt(equity), sub: floatingPnl >= 0 ? `+${fmt(floatingPnl)}` : fmt(floatingPnl), subColor: floatingPnl >= 0 ? "text-emerald-400" : "text-red-400" },
              { label: "Free Margin", value: fmt(freeMargin), sub: cur },
            ].map(stat => (
              <div key={stat.label} className="bg-muted/30 rounded-lg p-2 text-center">
                <div className="text-foreground/30 text-[9px] mb-0.5">{stat.label}</div>
                <div className="font-mono font-bold text-[11px] text-foreground">{stat.value}</div>
                {stat.sub && <div className={cn("text-[9px] mt-0.5", stat.subColor ?? "text-foreground/25")}>{stat.sub}</div>}
              </div>
            ))}
          </div>

          {/* Margin / Leverage / Level */}
          <div className="grid grid-cols-3 gap-1.5 text-[10px]">
            <div className="bg-white/3 rounded-lg p-1.5">
              <div className="text-foreground/25 text-[9px]">Margin Used</div>
              <div className="font-mono font-semibold text-foreground mt-0.5">{fmt(margin)}</div>
            </div>
            <div className="bg-white/3 rounded-lg p-1.5">
              <div className="text-foreground/25 text-[9px]">Leverage</div>
              <div className="font-semibold text-foreground mt-0.5">1:{account.leverage ?? "—"}</div>
            </div>
            <div className="bg-white/3 rounded-lg p-1.5">
              <div className="text-foreground/25 text-[9px]">Margin Level</div>
              <div className={cn("font-semibold mt-0.5", marginLevel > 200 ? "text-emerald-400" : marginLevel > 100 ? "text-amber-400" : "text-red-400")}>
                {margin > 0 ? marginLevel.toFixed(0) + "%" : "—"}
              </div>
            </div>
          </div>

          {/* Margin bar */}
          <div>
            <div className="flex justify-between text-[9px] text-foreground/25 mb-1">
              <span>Margin utilization</span>
              <span>{marginUsedPct.toFixed(1)}%</span>
            </div>
            <div className="w-full bg-muted/40 rounded-full h-1.5">
              <div className={cn("h-1.5 rounded-full transition-all",
                marginUsedPct > 80 ? "bg-red-500" : marginUsedPct > 50 ? "bg-amber-500" : "bg-blue-500")}
                style={{ width: `${Math.min(marginUsedPct, 100)}%` }} />
            </div>
          </div>

          {/* Floating P&L */}
          {floatingPnl !== 0 && (
            <div className={cn("flex items-center justify-between rounded-lg px-2 py-1.5",
              floatingPnl >= 0 ? "bg-emerald-500/8" : "bg-red-500/8")}>
              <span className="text-foreground/40 text-[10px]">Floating P&L</span>
              <span className={cn("font-mono font-bold text-[11px]", floatingPnl >= 0 ? "text-emerald-400" : "text-red-400")}>
                {floatingPnl >= 0 ? "+" : ""}{fmt(floatingPnl)} {cur}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Compact mode: just balance + equity inline */}
      {isConnected && compact && (
        <div className="px-3 pb-2.5 flex items-center justify-between">
          <span className="text-foreground/30 text-[10px]">Balance <span className="text-foreground font-mono font-semibold">{fmt(balance)} {cur}</span></span>
          <span className={cn("text-[10px] font-mono font-semibold", floatingPnl >= 0 ? "text-emerald-400" : "text-red-400")}>
            {floatingPnl >= 0 ? "+" : ""}{fmt(floatingPnl)}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Session Clock ────────────────────────────────────────────────────────────
function SessionBadges() {
  const [hour] = useState(() => new Date().getUTCHours());
  return (
    <div className="flex items-center gap-2">
      {FOREX_SESSIONS.map(s => {
        const active = s.open < s.close
          ? hour >= s.open && hour < s.close
          : hour >= s.open || hour < s.close;
        return (
          <div key={s.name} className={cn(
            "flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border",
            active ? `${s.color} border-current bg-current/10` : "text-foreground/20 border-border",
          )}>
            <span className={cn("w-1.5 h-1.5 rounded-full", active ? "bg-current animate-pulse" : "bg-white/20")} />
            {s.name}
          </div>
        );
      })}
    </div>
  );
}

// ─── OrderBook (simulated) ───────────────────────────────────────────────────
function OrderBook({ ltp, pp }: { ltp: number; pp: number }) {
  const spread = ltp * 0.00025;
  const bid = ltp - spread / 2;
  const ask = ltp + spread / 2;

  const levels = Array.from({ length: 8 }, (_, i) => ({
    bidPrice: bid - i * ltp * 0.0001,
    bidQty: +(Math.random() * 4 + 0.5).toFixed(2),
    askPrice: ask + i * ltp * 0.0001,
    askQty: +(Math.random() * 4 + 0.5).toFixed(2),
  }));

  const maxQty = Math.max(...levels.map(l => Math.max(l.bidQty, l.askQty)));

  return (
    <div className="h-full overflow-hidden">
      <div className="grid grid-cols-3 text-[10px] text-foreground/40 px-2 py-1 border-b border-border/40">
        <span>Size</span><span className="text-center">Price</span><span className="text-right">Size</span>
      </div>
      {levels.map((l, i) => (
        <div key={i} className="grid grid-cols-3 text-[11px] px-2 py-0.5 relative hover:bg-muted/30">
          <div className="relative z-10 text-emerald-400 tabular-nums">{l.bidQty.toFixed(2)}</div>
          <div className="relative z-10 text-center">
            <span className="text-emerald-400">{l.bidPrice.toFixed(pp)}</span>
            <span className="text-foreground/20 mx-1">|</span>
            <span className="text-red-400">{l.askPrice.toFixed(pp)}</span>
          </div>
          <div className="relative z-10 text-right text-red-400 tabular-nums">{l.askQty.toFixed(2)}</div>
          <div className="absolute inset-y-0 left-0 bg-emerald-500/10 rounded-sm"
            style={{ width: `${(l.bidQty / maxQty) * 40}%` }} />
          <div className="absolute inset-y-0 right-0 bg-red-500/10 rounded-sm"
            style={{ width: `${(l.askQty / maxQty) * 40}%` }} />
        </div>
      ))}
      <div className="border-t border-border mt-1 px-2 py-1.5 flex justify-between text-xs">
        <div className="text-emerald-400 font-bold">{bid.toFixed(pp)}</div>
        <div className="text-foreground/40 text-[10px]">Spread: {(spread * Math.pow(10, pp)).toFixed(1)} pips</div>
        <div className="text-red-400 font-bold">{ask.toFixed(pp)}</div>
      </div>
    </div>
  );
}

// ─── Analysis Panel ──────────────────────────────────────────────────────────
function AnalysisPanel({ inst, ltp }: { inst: Instrument | null; ltp: number }) {
  if (!inst) return <div className="p-4 text-foreground/30 text-sm text-center">Select a pair</div>;
  const prev = Number(inst.previousClose) || ltp;
  const chg = prev ? ((ltp - prev) / prev) * 100 : 0;
  const high = Number(inst.high24h) || ltp * 1.005;
  const low = Number(inst.low24h) || ltp * 0.995;
  const r1 = high + (high - low) * 0.382;
  const s1 = low - (high - low) * 0.382;
  const pivot = (high + low + ltp) / 3;

  const sentiment = chg >= 0 ? "Bullish" : "Bearish";
  const rsi = 40 + Math.random() * 30;
  const macdSignal = Math.random() > 0.5 ? "Buy" : "Sell";
  const maValue = ltp * (1 + (Math.random() - 0.5) * 0.002);

  return (
    <div className="p-4 space-y-4 overflow-auto h-full">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-muted/30 rounded-lg p-3">
          <div className="text-[10px] text-foreground/40 mb-1">Overall Sentiment</div>
          <div className={cn("font-bold text-sm flex items-center gap-1.5",
            chg >= 0 ? "text-emerald-400" : "text-red-400")}>
            {chg >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            {sentiment}
          </div>
          <div className="text-[10px] text-foreground/40 mt-1">{chg.toFixed(3)}% today</div>
        </div>
        <div className="bg-muted/30 rounded-lg p-3">
          <div className="text-[10px] text-foreground/40 mb-1">RSI (14)</div>
          <div className={cn("font-bold text-sm", rsi > 70 ? "text-red-400" : rsi < 30 ? "text-emerald-400" : "text-foreground")}>
            {rsi.toFixed(1)}
          </div>
          <div className="text-[10px] text-foreground/40 mt-1">
            {rsi > 70 ? "Overbought" : rsi < 30 ? "Oversold" : "Neutral"}
          </div>
          <div className="w-full bg-muted/50 rounded-full h-1 mt-1.5">
            <div className={cn("h-1 rounded-full", rsi > 70 ? "bg-red-400" : rsi < 30 ? "bg-emerald-400" : "bg-amber-400")}
              style={{ width: `${rsi}%` }} />
          </div>
        </div>
      </div>

      <div className="bg-muted/30 rounded-lg p-3">
        <div className="text-[10px] text-foreground/40 mb-2">Pivot Points (Classic)</div>
        <div className="space-y-1.5 text-xs">
          {[
            ["R2", (r1 + (pivot - s1)).toFixed(inst.pricePrecision), "text-red-300"],
            ["R1", r1.toFixed(inst.pricePrecision), "text-red-400"],
            ["Pivot", pivot.toFixed(inst.pricePrecision), "text-amber-400 font-bold"],
            ["S1", s1.toFixed(inst.pricePrecision), "text-emerald-400"],
            ["S2", (s1 - (pivot - s1)).toFixed(inst.pricePrecision), "text-emerald-300"],
          ].map(([label, val, cls]) => (
            <div key={label} className="flex justify-between items-center">
              <span className="text-foreground/40">{label}</span>
              <span className={cn("tabular-nums font-mono", cls)}>{val}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-muted/30 rounded-lg p-3 space-y-2">
        <div className="text-[10px] text-foreground/40 mb-1">Technical Indicators</div>
        {[
          { name: "MACD (12,26,9)", signal: macdSignal, color: macdSignal === "Buy" ? "text-emerald-400" : "text-red-400" },
          { name: "MA (50)", signal: ltp > maValue ? "Buy" : "Sell", color: ltp > maValue ? "text-emerald-400" : "text-red-400" },
          { name: "Bollinger Bands", signal: rsi > 60 ? "Upper Band" : rsi < 40 ? "Lower Band" : "Middle", color: "text-foreground/60" },
          { name: "Stochastic (14,3)", signal: rsi > 65 ? "Overbought" : rsi < 35 ? "Oversold" : "Neutral", color: "text-foreground/60" },
        ].map(ind => (
          <div key={ind.name} className="flex justify-between text-xs">
            <span className="text-foreground/40">{ind.name}</span>
            <span className={ind.color}>{ind.signal}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        {[
          ["Swap Long", `${(ltp * -0.00003).toFixed(5)}`],
          ["Swap Short", `${(ltp * 0.00001).toFixed(5)}`],
          ["Tick Value", `${(ltp * 0.00001 * 1000).toFixed(2)} ${inst.quoteCurrency}`],
          ["Lot Size", inst.lotSize],
        ].map(([k, v]) => (
          <div key={k} className="bg-muted/30 rounded p-2">
            <div className="text-foreground/30">{k}</div>
            <div className="font-mono mt-0.5">{v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── MT5 Dashboard (bottom panel) ─────────────────────────────────────────────
type MT5Position = {
  ticket: string; mt5AccountId: number; accountServer: string; accountLogin: string;
  isDemo: boolean; symbol: string; side: string; volume: number;
  openPrice: number; currentPrice: number; stopLoss: number | null; takeProfit: number | null;
  pnl: number; pips: number; openedAt: string | null; simulated: boolean; comment: string | null;
};
type MT5OrderRow = {
  id: number; mt5AccountId: number; symbol: string; orderType: string; side: string;
  volume: string; openPrice: string | null; stopLoss: string | null; takeProfit: string | null;
  mt5Ticket: string | null; status: string; comment: string | null; openedAt: string | null; createdAt: string;
};

function MT5Dashboard({ accounts, positions, orders, onDisconnect, onAddAccount, onRefresh, onClosePosition }: {
  accounts: MT5Account[];
  positions: MT5Position[];
  orders: MT5OrderRow[];
  onDisconnect: (id: number) => void;
  onAddAccount: () => void;
  onRefresh: () => void;
  onClosePosition: (ticket: string) => void;
}) {
  const [subTab, setSubTab] = useState<"positions" | "accounts" | "history">("positions");
  const [closingTicket, setClosingTicket] = useState<string | null>(null);
  const totalPnl = positions.reduce((s, p) => s + p.pnl, 0);
  const connected = accounts.filter(a => a.status === "connected");

  return (
    <div className="flex h-full">
      {/* Sub-tab sidebar */}
      <div className="flex flex-col border-r border-border/60 px-1.5 py-2 gap-0.5 w-24 flex-shrink-0">
        {([
          { id: "positions", label: "Positions", count: positions.length },
          { id: "accounts", label: "Accounts", count: connected.length },
          { id: "history", label: "History", count: orders.length },
        ] as const).map(tab => (
          <button key={tab.id} onClick={() => setSubTab(tab.id)}
            className={cn("flex flex-col items-center gap-0.5 py-1.5 px-1 rounded-lg text-center transition-colors",
              subTab === tab.id ? "bg-blue-500/15 text-blue-300" : "text-foreground/25 hover:text-foreground/50 hover:bg-muted/30")}>
            <span className="text-[10px] font-semibold">{tab.label}</span>
            {tab.count > 0 && (
              <span className={cn("text-[9px] px-1.5 py-0.5 rounded-full font-bold",
                subTab === tab.id ? "bg-blue-500/25 text-blue-300" : "bg-muted/50 text-foreground/30")}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
        <div className="flex-1" />
        <button onClick={onRefresh} className="p-1.5 rounded-lg text-foreground/20 hover:text-foreground/50 hover:bg-muted/30 transition-colors">
          <RefreshCw size={12} />
        </button>
        <button onClick={onAddAccount} className="p-1.5 rounded-lg text-blue-400/40 hover:text-blue-400 hover:bg-blue-500/10 transition-colors">
          <PlugZap size={12} />
        </button>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-auto">

        {/* ── Positions sub-tab ── */}
        {subTab === "positions" && (
          <>
            {/* Summary strip */}
            {positions.length > 0 && (
              <div className="flex items-center gap-4 px-3 py-1.5 border-b border-border/40 bg-white/2">
                <div className="text-[10px] text-foreground/30">{positions.length} open position{positions.length !== 1 ? "s" : ""}</div>
                <div className={cn("text-[10px] font-bold tabular-nums ml-auto", totalPnl >= 0 ? "text-emerald-400" : "text-red-400")}>
                  Float P&L: {totalPnl >= 0 ? "+" : ""}{totalPnl.toFixed(2)}
                </div>
              </div>
            )}
            {positions.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-28 gap-2 text-foreground/20">
                <Activity size={20} />
                <div className="text-xs">No open MT5 positions</div>
                <div className="text-[10px] text-foreground/15">Place a trade to see positions here</div>
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-foreground/25 border-b border-border/40 text-[10px]">
                    {["Ticket", "Account", "Symbol", "Side", "Vol", "Open Price", "Current", "SL", "TP", "Pips", "Profit / Loss", ""].map(h => (
                      <th key={h} className="px-2 py-1.5 text-left font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {positions.map(pos => (
                    <tr key={pos.ticket}
                      className={cn("border-b border-white/4 hover:bg-white/3 transition-colors",
                        closingTicket === pos.ticket && "opacity-50")}>
                      <td className="px-2 py-2 font-mono text-foreground/30 text-[10px]">{pos.ticket?.slice(-8)}</td>
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-1">
                          <span className={cn("text-[9px] px-1 py-0.5 rounded font-bold",
                            pos.isDemo ? "bg-amber-500/15 text-amber-400" : "bg-blue-500/15 text-blue-400")}>
                            {pos.isDemo ? "D" : "L"}
                          </span>
                          <span className="text-foreground/35 text-[10px] font-mono">{pos.accountLogin}</span>
                        </div>
                      </td>
                      <td className="px-2 py-2 font-bold text-foreground">{pos.symbol}</td>
                      <td className="px-2 py-2">
                        <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-bold",
                          pos.side === "buy" ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400")}>
                          {pos.side.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-2 py-2 tabular-nums text-foreground/60">{pos.volume}</td>
                      <td className="px-2 py-2 tabular-nums font-mono text-foreground/50 text-[10px]">{pos.openPrice.toFixed(5)}</td>
                      <td className="px-2 py-2 tabular-nums font-mono text-foreground text-[10px]">{pos.currentPrice.toFixed(5)}</td>
                      <td className="px-2 py-2 tabular-nums font-mono text-red-400/50 text-[10px]">{pos.stopLoss?.toFixed(5) ?? <span className="text-foreground/15">—</span>}</td>
                      <td className="px-2 py-2 tabular-nums font-mono text-emerald-400/50 text-[10px]">{pos.takeProfit?.toFixed(5) ?? <span className="text-foreground/15">—</span>}</td>

                      {/* Pips */}
                      <td className="px-2 py-2">
                        <span className={cn("text-[11px] font-semibold tabular-nums",
                          pos.pips >= 0 ? "text-emerald-400" : "text-red-400")}>
                          {pos.pips >= 0 ? "+" : ""}{pos.pips}
                        </span>
                      </td>

                      {/* P&L — most important cell */}
                      <td className="px-2 py-2">
                        <div className={cn("inline-flex items-center gap-1 px-2 py-1 rounded-lg font-bold tabular-nums text-[12px]",
                          pos.pnl >= 0
                            ? "bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/25"
                            : "bg-red-500/15 text-red-400 ring-1 ring-red-500/25")}>
                          {pos.pnl >= 0
                            ? <TrendingUp size={10} />
                            : <TrendingDown size={10} />}
                          {pos.pnl >= 0 ? "+" : ""}{pos.pnl.toFixed(2)}
                        </div>
                      </td>

                      {/* Close button */}
                      <td className="px-2 py-2">
                        <button
                          onClick={() => {
                            setClosingTicket(pos.ticket);
                            onClosePosition(pos.ticket);
                          }}
                          disabled={closingTicket === pos.ticket}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg bg-red-500/10 hover:bg-red-500/25 border border-red-500/20 hover:border-red-500/40 text-red-400 text-[10px] font-semibold transition-all disabled:opacity-40 whitespace-nowrap">
                          {closingTicket === pos.ticket
                            ? <><RefreshCw size={9} className="animate-spin" /> Closing...</>
                            : <><X size={9} /> Close</>}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}

        {/* ── Accounts sub-tab ── */}
        {subTab === "accounts" && (
          <div className="p-3 space-y-2.5 overflow-auto">
            {accounts.map(acct => (
              <MT5AccountCard key={acct.id} account={acct}
                onDisconnect={() => onDisconnect(acct.id)} />
            ))}
            <button onClick={onAddAccount}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border border-dashed border-blue-500/25 text-blue-400/60 hover:text-blue-400 hover:border-blue-500/40 text-xs transition-colors">
              <PlugZap size={11} /> Add another MT5 account
            </button>
          </div>
        )}

        {/* ── History sub-tab ── */}
        {subTab === "history" && (
          orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-28 gap-2 text-foreground/20">
              <BookOpen size={20} />
              <div className="text-xs">No MT5 order history yet</div>
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-foreground/25 border-b border-border/40 text-[10px]">
                  {["Ticket", "Symbol", "Side", "Type", "Vol", "Open Price", "SL", "TP", "Status", "Time"].map(h => (
                    <th key={h} className="px-2 py-1.5 text-left font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.map(o => (
                  <tr key={o.id} className="border-b border-white/4 hover:bg-white/3">
                    <td className="px-2 py-1.5 font-mono text-foreground/30 text-[10px]">{o.mt5Ticket?.slice(-8) ?? "—"}</td>
                    <td className="px-2 py-1.5 font-semibold">{o.symbol}</td>
                    <td className={cn("px-2 py-1.5 font-bold", o.side === "buy" ? "text-emerald-400" : "text-red-400")}>
                      {o.side.toUpperCase()}
                    </td>
                    <td className="px-2 py-1.5 text-foreground/40 uppercase text-[10px]">{o.orderType}</td>
                    <td className="px-2 py-1.5 tabular-nums">{o.volume}</td>
                    <td className="px-2 py-1.5 tabular-nums font-mono">{o.openPrice ? Number(o.openPrice).toFixed(5) : "—"}</td>
                    <td className="px-2 py-1.5 tabular-nums font-mono text-red-400/60">{o.stopLoss ? Number(o.stopLoss).toFixed(5) : "—"}</td>
                    <td className="px-2 py-1.5 tabular-nums font-mono text-emerald-400/60">{o.takeProfit ? Number(o.takeProfit).toFixed(5) : "—"}</td>
                    <td className="px-2 py-1.5">
                      <span className={cn("px-1.5 py-0.5 rounded text-[9px] font-semibold",
                        o.status === "filled" ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400")}>
                        {o.status}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-foreground/25 whitespace-nowrap">
                      {o.openedAt ? new Date(o.openedAt).toLocaleTimeString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}
      </div>
    </div>
  );
}

// ─── Main Forex Terminal ──────────────────────────────────────────────────────
export default function Forex() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [successData, setSuccessData] = useState<GenericSuccess | null>(null);

  // UI state
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [category, setCategory] = useState("Major");
  const [search, setSearch] = useState("");
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [tf, setTf] = useState<TF>("H1");
  const [centerTab, setCenterTab] = useState<"chart" | "depth" | "analysis">("chart");
  const [bottomTab, setBottomTab] = useState<"positions" | "history" | "mt5">("positions");

  // Order state
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [orderType, setOrderType] = useState<"MARKET" | "LIMIT" | "STOP">("MARKET");
  const [qty, setQty] = useState("0.01");
  const [limitPrice, setLimitPrice] = useState("");
  const [stopLoss, setStopLoss] = useState("");
  const [takeProfit, setTakeProfit] = useState("");
  const [slMode, setSlMode] = useState<"pips" | "price">("pips");
  const [showCalc, setShowCalc] = useState(false);
  const [oneClick, setOneClick] = useState(false);

  // MT5 state
  const [showMt5Modal, setShowMt5Modal] = useState(false);
  const [activeMt5, setActiveMt5] = useState<MT5Account | null>(null);

  // Data queries
  const { data: instrData, isLoading } = useQuery({
    queryKey: ["instruments", "forex"],
    queryFn: () => get<{ instruments: Instrument[] }>("/instruments?assetClass=forex"),
    refetchInterval: 15000,
  });

  const { data: posData, refetch: refetchPos } = useQuery({
    queryKey: ["instrument-positions"],
    queryFn: () => get<{ positions: Position[] }>("/instruments/positions"),
    enabled: !!user,
    refetchInterval: 5000,
  });

  const { data: orderData } = useQuery({
    queryKey: ["instrument-orders"],
    queryFn: () => get<{ orders: OrderRow[] }>("/instruments/orders"),
    enabled: !!user && bottomTab === "history",
  });

  const { data: quoteData, refetch: refetchQuote } = useQuery({
    queryKey: ["instrument-quote", selectedSymbol],
    queryFn: () => get<{ quote: { ltp: number; open: number; high: number; low: number; changePct: number; volume: number } }>(`/instruments/${selectedSymbol}/quote`),
    enabled: !!selectedSymbol,
    refetchInterval: 3000,
  });

  const { data: brokerData } = useQuery({
    queryKey: ["broker-account"],
    queryFn: async () => {
      const r = await fetch("/api/broker/account", { credentials: "include" });
      if (!r.ok) return null;
      return r.json();
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  const { data: mt5Data, refetch: refetchMt5 } = useQuery({
    queryKey: ["mt5-accounts"],
    queryFn: async () => {
      const r = await fetch("/api/mt5/account", { credentials: "include" });
      if (!r.ok) return null;
      return r.json();
    },
    enabled: !!user,
    refetchInterval: bottomTab === "mt5" ? 10_000 : 30_000,
  });

  const { data: mt5PosData, refetch: refetchMt5Pos } = useQuery({
    queryKey: ["mt5-positions"],
    queryFn: async () => {
      const r = await fetch("/api/mt5/positions", { credentials: "include" });
      if (!r.ok) return null;
      return r.json();
    },
    enabled: !!user,
    refetchInterval: 5_000,
  });

  const { data: mt5OrdersData } = useQuery({
    queryKey: ["mt5-orders"],
    queryFn: async () => {
      const r = await fetch("/api/mt5/orders", { credentials: "include" });
      if (!r.ok) return null;
      return r.json();
    },
    enabled: !!user && bottomTab === "mt5",
  });

  // Use first connected MT5 account, else activeMt5 from state
  const mt5Accounts: MT5Account[] = mt5Data?.accounts ?? [];
  const connectedMt5 = activeMt5 ?? mt5Accounts.find(a => a.status === "connected") ?? null;
  const mt5Positions = mt5PosData?.positions ?? [];
  const mt5OrderHistory = mt5OrdersData?.orders ?? [];

  const mt5DisconnectMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch("/api/mt5/disconnect", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!r.ok) throw new Error("Disconnect failed");
      return r.json();
    },
    onSuccess: () => {
      setSuccessData({
        kind: "generic", iconKind: "withdraw", accentColor: "#ef4444",
        title: "MT5 Disconnected",
        subtitle: "Your MetaTrader 5 account has been unlinked.",
        rows: [{ label: "Status", value: "Disconnected", accent: "#ef4444" }],
      });
      setActiveMt5(null);
      qc.invalidateQueries({ queryKey: ["mt5-accounts"] });
    },
  });

  const mt5PlaceMutation = useMutation({
    mutationFn: async (body: object) => {
      const r = await fetch("/api/mt5/orders", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Order failed");
      return data;
    },
    onSuccess: (data) => {
      setSuccessData({
        kind: "generic", iconKind: "futures", accentColor: "#10b981",
        title: "MT5 Order Placed",
        subtitle: "Your forex order was routed to MetaTrader 5.",
        rows: [
          { label: "Ticket", value: String(data.ticket ?? "") },
          { label: "Status", value: "Filled ✓", accent: "#10b981" },
        ],
      });
      qc.invalidateQueries({ queryKey: ["mt5-positions"] });
      qc.invalidateQueries({ queryKey: ["mt5-orders"] });
    },
    onError: (e: Error) => toast.error(e.message || "MT5 order failed"),
  });

  const mt5CloseMutation = useMutation({
    mutationFn: async (ticket: string) => {
      const r = await fetch("/api/mt5/positions/close", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Close failed");
      return data;
    },
    onSuccess: (data) => {
      const pnl = data.realizedPnl ?? 0;
      setSuccessData({
        kind: "generic", iconKind: "futures", accentColor: pnl >= 0 ? "#10b981" : "#ef4444",
        title: "MT5 Position Closed",
        subtitle: "Your MetaTrader 5 position has been closed.",
        rows: [
          { label: "Realized PnL", value: `${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}`, accent: pnl >= 0 ? "#10b981" : "#ef4444" },
          { label: "Close Price", value: String(data.closePrice ?? "") },
          { label: "Ticket", value: String(data.ticket ?? "").slice(-8) },
        ],
      });
      qc.invalidateQueries({ queryKey: ["mt5-positions"] });
      qc.invalidateQueries({ queryKey: ["mt5-orders"] });
    },
    onError: (e: Error) => toast.error(e.message || "Close failed"),
  });

  const instruments = instrData?.instruments ?? [];
  const positions = posData?.positions?.filter(p => p.assetClass === "forex") ?? [];
  const orders = orderData?.orders?.filter(o => o.assetClass === "forex") ?? [];
  const brokerAccount = brokerData?.account;
  const brokerActive = brokerAccount?.status === "active" && !!brokerAccount?.angelClientId;
  const brokerSimulated = brokerActive && brokerAccount?.jwtToken?.startsWith("sim.");

  const selected = instruments.find(i => i.symbol === selectedSymbol) ?? null;
  const quote = quoteData?.quote ?? null;
  const ltp = quote?.ltp ?? (selected ? Number(selected.currentPrice) : 0);
  const changePct = quote?.changePct ?? (selected ? Number(selected.change24h) : 0);
  const pp = selected?.pricePrecision ?? 5;

  // Bid / Ask
  const spread = ltp * 0.00025;
  const bid = ltp - spread / 2;
  const ask = ltp + spread / 2;
  const spreadPips = spread * Math.pow(10, pp);

  // OHLC chart data
  const tfMs = TF_OPTIONS.find(t => t.label === tf)?.ms ?? 3_600_000;
  const chartBars = useMemo(() => {
    if (!ltp) return [];
    return genOHLC(ltp, 100, tfMs);
  }, [selectedSymbol, tf, ltp ? Math.floor(ltp * 1000) : 0]);

  // Pip value (per lot)
  const pipValue = ltp ? (Math.pow(10, -pp) * Number(selected?.lotSize ?? 1000)) : 0;
  const lots = parseFloat(qty) || 0;
  const notional = lots * Number(selected?.lotSize ?? 1000) * ltp;
  const margin = notional ? notional * Number(selected?.marginRequired ?? 0.02) : 0;
  const pipValueLots = pipValue * lots;

  // SL/TP calculations
  const slPrice = stopLoss ? (slMode === "pips"
    ? (side === "buy" ? ltp - parseFloat(stopLoss) * Math.pow(10, -pp) : ltp + parseFloat(stopLoss) * Math.pow(10, -pp))
    : parseFloat(stopLoss)) : null;
  const tpPrice = takeProfit ? (slMode === "pips"
    ? (side === "buy" ? ltp + parseFloat(takeProfit) * Math.pow(10, -pp) : ltp - parseFloat(takeProfit) * Math.pow(10, -pp))
    : parseFloat(takeProfit)) : null;
  const slPnl = slPrice && pipValueLots ? Math.abs(slPrice - ltp) * Math.pow(10, pp) * pipValueLots : null;
  const tpPnl = tpPrice && pipValueLots ? Math.abs(tpPrice - ltp) * Math.pow(10, pp) * pipValueLots : null;

  // Categories
  const CATEGORIES = ["Major", "Minor", "INR", "Exotic", "All", "★"];
  const majorPairs = new Set(["EURUSD","GBPUSD","USDJPY","USDCHF","AUDUSD","NZDUSD","USDCAD"]);
  const filtered = instruments.filter(i => {
    if (search) return i.symbol.includes(search.toUpperCase()) || i.name.toUpperCase().includes(search.toUpperCase());
    if (category === "★") return favorites.has(i.symbol);
    if (category === "Major") return majorPairs.has(i.symbol);
    if (category === "INR") return i.quoteCurrency === "INR" || i.symbol.includes("INR");
    if (category === "Minor") return !majorPairs.has(i.symbol) && !i.symbol.includes("INR") && !i.symbol.includes("JPY");
    if (category === "Exotic") return i.symbol.includes("JPY") || i.symbol.includes("CHF") || i.symbol.includes("NOK");
    return true;
  });

  useEffect(() => {
    if (!selectedSymbol && instruments.length > 0) setSelectedSymbol(instruments[0].symbol);
  }, [instruments]);

  const placeMutation = useMutation({
    mutationFn: (body: object) => post("/instruments/orders", body),
    onSuccess: () => {
      setSuccessData({
        kind: "generic", iconKind: "futures", accentColor: side === "buy" ? "#10b981" : "#f59e0b",
        title: "Forex Order Placed",
        subtitle: "Your simulated forex order has been filled.",
        rows: [
          { label: "Symbol", value: selectedSymbol ?? "" },
          { label: "Side", value: side.toUpperCase(), accent: side === "buy" ? "#10b981" : "#f59e0b" },
          { label: "Quantity", value: `${qty} lots` },
          { label: "Type", value: orderType },
        ],
      });
      if (!oneClick) { setQty("0.01"); setLimitPrice(""); }
      qc.invalidateQueries({ queryKey: ["instrument-positions"] });
      qc.invalidateQueries({ queryKey: ["instrument-orders"] });
    },
    onError: (e: Error) => toast.error(e.message || "Order failed"),
  });

  const closeMutation = useMutation({
    mutationFn: (id: number) => post(`/instruments/positions/${id}/close`),
    onSuccess: () => {
      setSuccessData({
        kind: "generic", iconKind: "futures", accentColor: "#6366f1",
        title: "Position Closed",
        subtitle: "Your forex position has been closed.",
        rows: [{ label: "Status", value: "Closed", accent: "#6366f1" }],
      });
      qc.invalidateQueries({ queryKey: ["instrument-positions"] });
    },
  });

  const handlePlace = (forceSide?: "buy" | "sell") => {
    const activeSide = forceSide ?? side;
    if (!selectedSymbol || !qty) return;

    // If MT5 connected → route through MT5
    if (connectedMt5) {
      mt5PlaceMutation.mutate({
        mt5AccountId: connectedMt5.id,
        symbol: selectedSymbol,
        side: activeSide,
        orderType: orderType.toLowerCase(),
        volume: Number(qty),
        ...(slPrice ? { stopLoss: slPrice } : {}),
        ...(tpPrice ? { takeProfit: tpPrice } : {}),
        comment: `Zebvix Forex ${activeSide.toUpperCase()}`,
      });
      return;
    }

    // Default: platform instruments order
    placeMutation.mutate({
      symbol: selectedSymbol, side: activeSide, qty: Number(qty),
      type: orderType,
      ...(orderType !== "MARKET" && limitPrice ? { price: Number(limitPrice) } : {}),
      leverage: 10,
    });
  };

  // total unrealized PnL
  const totalUnrealizedPnl = positions.reduce((sum, p) => sum + Number(p.unrealizedPnl ?? 0), 0);

  const toggleFav = (sym: string) => {
    setFavorites(f => {
      const n = new Set(f);
      n.has(sym) ? n.delete(sym) : n.add(sym);
      return n;
    });
  };

  const COMING_SOON_FOREX: boolean = true;
  if (COMING_SOON_FOREX) {
    return (
      <div className="min-h-[calc(100vh-56px)] bg-background">
        <div className="max-w-xl mx-auto px-6 py-16 flex flex-col items-center text-center gap-8">
          <div className="relative">
            <div className="w-24 h-24 rounded-3xl bg-green-500/10 border border-green-500/20 flex items-center justify-center">
              <Globe className="w-10 h-10 text-green-400" />
            </div>
            <div className="absolute -top-2 -right-2 px-2 py-1 rounded-full text-[10px] font-bold bg-amber-400/15 border border-amber-400/30 text-amber-400">SOON</div>
          </div>
          <div className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-widest text-amber-400">Coming Soon</p>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight">Forex Trading</h1>
            <p className="text-muted-foreground leading-relaxed max-w-sm">Trade currency pairs with up to 50× leverage — EURINR, USDINR, GBPINR and major G10 pairs via MT5.</p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {["8+ Currency Pairs", "USDINR · EURINR · GBPINR", "Up to 50× Leverage", "MT5 Integration", "24/5 Markets"].map((f) => (
              <span key={f} className="px-3 py-1.5 rounded-full text-xs font-medium bg-green-500/10 border border-green-500/20 text-green-400">{f}</span>
            ))}
          </div>
          <div className="w-full max-w-sm space-y-3 text-left border border-border/50 rounded-xl p-4 bg-card/40">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-4">Roadmap</p>
            {[
              { q: "Q3 2025", label: "MT5 demo account integration", done: false },
              { q: "Q4 2025", label: "INR pairs live (USDINR, EURINR)", done: false },
              { q: "Q1 2026", label: "G10 major pairs + micro lots", done: false },
              { q: "Q2 2026", label: "Full live trading + swap-free", done: false },
            ].map((r) => (
              <div key={r.q} className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full flex-shrink-0 bg-muted-foreground/30" />
                <span className="text-xs text-muted-foreground w-20 flex-shrink-0">{r.q}</span>
                <span className="text-sm text-muted-foreground">{r.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col overflow-hidden" style={{ height: "100vh" }}>

      {/* ── Top Header ─────────────────────────────────────────────────────── */}
      <div className="border-b border-border/60 bg-card px-4 py-2 flex items-center gap-4 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-amber-400" />
          <span className="font-bold text-sm tracking-tight">Forex CFD</span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[10px] text-foreground/40">Live</span>
        </div>

        {/* Selected pair ticker */}
        {selected && ltp > 0 && (
          <div className="flex items-center gap-4 pl-3 border-l border-border">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold">{selected.symbol}</span>
              <span className={cn("text-lg font-bold tabular-nums",
                changePct >= 0 ? "text-emerald-400" : "text-red-400")}>
                {p(ltp, pp)}
              </span>
              <span className={cn("text-xs", changePct >= 0 ? "text-emerald-400" : "text-red-400")}>
                {pct(changePct)}
              </span>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-foreground/40">
              <span>Bid: <span className="text-emerald-400 font-mono">{p(bid, pp)}</span></span>
              <span>Ask: <span className="text-red-400 font-mono">{p(ask, pp)}</span></span>
              <span>Spread: <span className="text-amber-400">{spreadPips.toFixed(1)} pips</span></span>
              <span>H: <span className="text-foreground">{quote?.high ? p(quote.high, pp) : "—"}</span></span>
              <span>L: <span className="text-foreground">{quote?.low ? p(quote.low, pp) : "—"}</span></span>
            </div>
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          <SessionBadges />

          {/* Angel One badge */}
          {brokerActive && (
            <div className={cn("flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-full border",
              brokerSimulated ? "text-yellow-400 border-yellow-500/30 bg-yellow-500/10"
                : "text-emerald-400 border-emerald-500/30 bg-emerald-500/10")}>
              {brokerSimulated ? <WifiOff size={10} /> : <Wifi size={10} />}
              AO {brokerSimulated ? "Sim" : "Live"} · {brokerAccount.angelClientId}
            </div>
          )}

          {/* MT5 badge */}
          {connectedMt5 ? (
            <div className={cn("flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-full border cursor-pointer hover:opacity-80",
              connectedMt5.isDemo ? "text-amber-400 border-amber-500/30 bg-amber-500/10"
                : "text-blue-400 border-blue-500/30 bg-blue-500/10")}
              onClick={() => setBottomTab("mt5")}>
              <Terminal size={10} />
              MT5 {connectedMt5.isDemo ? "Demo" : "Live"} · {connectedMt5.login}
            </div>
          ) : user && (
            <button onClick={() => setShowMt5Modal(true)}
              className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-full border border-white/15 text-foreground/30 hover:text-foreground/60 hover:border-white/30 transition-colors">
              <PlugZap size={10} /> MT5
            </button>
          )}

          <button onClick={() => refetchQuote()} className="text-foreground/30 hover:text-foreground transition-colors">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── Main 3-column layout ───────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── LEFT: Watchlist ─────────────────────────────────────────────── */}
        <div className="w-56 border-r border-border/60 flex flex-col bg-card flex-shrink-0">
          {/* Search */}
          <div className="p-2 border-b border-border/60">
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search pairs..."
              className="w-full bg-muted/30 text-xs px-2.5 py-1.5 rounded-md text-foreground placeholder-white/25 border border-border focus:border-amber-500/40 focus:outline-none"
            />
          </div>

          {/* Category tabs */}
          <div className="flex flex-wrap gap-0.5 p-1.5 border-b border-border/60">
            {CATEGORIES.map(cat => (
              <button key={cat} onClick={() => { setCategory(cat); setSearch(""); }}
                className={cn("px-2 py-0.5 text-[10px] rounded transition-colors font-medium",
                  category === cat && !search ? "bg-amber-500/20 text-amber-400" : "text-foreground/30 hover:text-foreground/60")}>
                {cat}
              </button>
            ))}
          </div>

          {/* Instrument list */}
          <div className="flex-1 overflow-y-auto">
            {isLoading ? Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="px-3 py-2.5 border-b border-border/40 animate-pulse">
                <div className="h-3 bg-muted/50 rounded w-16 mb-1" />
                <div className="h-2.5 bg-muted/30 rounded w-12" />
              </div>
            )) : filtered.length === 0 ? (
              <div className="text-center py-8 text-foreground/20 text-xs">No pairs found</div>
            ) : filtered.map(inst => {
              const chg = Number(inst.change24h);
              const isUp = chg >= 0;
              const isActive = inst.symbol === selectedSymbol;
              const isFav = favorites.has(inst.symbol);
              const base = inst.symbol.slice(0, 3);
              const quote2 = inst.symbol.slice(3, 6);
              return (
                <div key={inst.symbol}
                  className={cn("flex items-center gap-1 px-2 py-2 border-b border-border/40 cursor-pointer hover:bg-white/4 transition-colors group",
                    isActive && "bg-amber-500/8 border-l-2 border-l-amber-500")}>
                  <button onClick={() => toggleFav(inst.symbol)}
                    className={cn("opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0",
                      isFav && "opacity-100")}>
                    {isFav ? <Star size={10} className="text-amber-400 fill-amber-400" /> : <StarOff size={10} className="text-foreground/30" />}
                  </button>
                  <button className="flex-1 text-left" onClick={() => setSelectedSymbol(inst.symbol)}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <span className="text-[10px]">{PAIR_FLAGS[base] ?? "🏳️"}</span>
                        <span className="text-xs font-semibold">{inst.symbol}</span>
                      </div>
                      <span className={cn("text-[11px] font-medium tabular-nums",
                        isUp ? "text-emerald-400" : "text-red-400")}>
                        {pct(chg)}
                      </span>
                    </div>
                    <div className="flex justify-between mt-0.5">
                      <span className="text-[10px] text-foreground/30">{PAIR_FLAGS[quote2] ?? ""} {quote2}</span>
                      <span className="text-[11px] tabular-nums text-foreground/70 font-mono">
                        {Number(inst.currentPrice).toFixed(pp)}
                      </span>
                    </div>
                  </button>
                </div>
              );
            })}
          </div>

          {/* Account summary mini */}
          <div className="border-t border-border/60 p-2 space-y-1">
            <div className="text-[10px] text-foreground/30 mb-1.5">Open Positions ({positions.length})</div>
            {positions.length > 0 && (
              <div className={cn("text-xs font-bold",
                totalUnrealizedPnl >= 0 ? "text-emerald-400" : "text-red-400")}>
                {totalUnrealizedPnl >= 0 ? "+" : ""}{totalUnrealizedPnl.toFixed(2)} P&L
              </div>
            )}
            <div className="text-[10px] text-foreground/25 flex justify-between">
              <span>Margin used</span>
              <span>{positions.reduce((s, p) => s + Number(p.marginUsed), 0).toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* ── CENTER: Chart + Bottom positions ────────────────────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">

          {/* Timeframe + tabs bar */}
          <div className="flex items-center gap-0 border-b border-border/60 bg-card px-3 flex-shrink-0">
            <div className="flex items-center gap-0 mr-4">
              {TF_OPTIONS.map(t => (
                <button key={t.label} onClick={() => setTf(t.label)}
                  className={cn("px-2.5 py-2 text-[11px] font-semibold transition-colors",
                    tf === t.label ? "text-amber-400 border-b-2 border-amber-400" : "text-foreground/30 hover:text-foreground/60")}>
                  {t.label}
                </button>
              ))}
            </div>
            <div className="h-4 w-px bg-muted/50 mr-3" />
            {(["chart", "depth", "analysis"] as const).map(tab => (
              <button key={tab} onClick={() => setCenterTab(tab)}
                className={cn("px-3 py-2 text-[11px] capitalize transition-colors",
                  centerTab === tab ? "text-amber-400 border-b-2 border-amber-400" : "text-foreground/30 hover:text-foreground/60")}>
                {tab === "depth" ? "Order Book" : tab === "analysis" ? "Analysis" : "Chart"}
              </button>
            ))}
          </div>

          {/* Chart area */}
          <div className="flex-1 overflow-hidden relative bg-background" style={{ minHeight: 0 }}>
            {centerTab === "chart" && (
              <div className="w-full h-full overflow-hidden">
                {ltp > 0 && selected ? (
                  <CandlestickChart bars={chartBars} symbol={selected.symbol} tf={tf} pp={pp} />
                ) : (
                  <div className="flex items-center justify-center h-full text-foreground/20 text-sm">
                    Select a pair to view chart
                  </div>
                )}
              </div>
            )}
            {centerTab === "depth" && ltp > 0 && selected && (
              <OrderBook ltp={ltp} pp={pp} />
            )}
            {centerTab === "analysis" && (
              <AnalysisPanel inst={selected} ltp={ltp} />
            )}
          </div>

          {/* ── Bottom: positions / history ─────────────────────────────── */}
          <div className="border-t border-border/60 bg-card" style={{ height: "200px" }}>
            <div className="flex items-center gap-0 border-b border-border/60 px-3">
              <button onClick={() => setBottomTab("positions")}
                className={cn("px-3 py-2 text-[11px] flex items-center gap-1.5 transition-colors",
                  bottomTab === "positions" ? "text-amber-400 border-b-2 border-amber-400" : "text-foreground/30 hover:text-foreground/60")}>
                Open Positions
                {positions.length > 0 && (
                  <span className="bg-amber-500/20 text-amber-400 text-[9px] px-1.5 py-0.5 rounded-full">{positions.length}</span>
                )}
              </button>
              <button onClick={() => setBottomTab("history")}
                className={cn("px-3 py-2 text-[11px] flex items-center gap-1.5 transition-colors",
                  bottomTab === "history" ? "text-amber-400 border-b-2 border-amber-400" : "text-foreground/30 hover:text-foreground/60")}>
                Order History
              </button>
              <button onClick={() => setBottomTab("mt5")}
                className={cn("px-3 py-2 text-[11px] flex items-center gap-1.5 transition-colors",
                  bottomTab === "mt5" ? "text-blue-400 border-b-2 border-blue-400" : "text-foreground/30 hover:text-foreground/60")}>
                <Terminal size={10} /> MT5
                {connectedMt5 && (
                  <span className={cn("text-[9px] px-1.5 py-0.5 rounded-full",
                    connectedMt5.isDemo ? "bg-amber-500/20 text-amber-400" : "bg-blue-500/20 text-blue-400")}>
                    {connectedMt5.isDemo ? "Demo" : "Live"}
                  </span>
                )}
              </button>
              {totalUnrealizedPnl !== 0 && (
                <div className={cn("ml-auto text-xs font-bold tabular-nums",
                  totalUnrealizedPnl >= 0 ? "text-emerald-400" : "text-red-400")}>
                  {totalUnrealizedPnl >= 0 ? "+" : ""}{totalUnrealizedPnl.toFixed(2)} Unrealized
                </div>
              )}
            </div>

            <div className="overflow-y-auto" style={{ height: "152px" }}>
              {bottomTab === "positions" && (
                !user ? (
                  <div className="text-center py-8 text-foreground/20 text-xs">Login to view positions</div>
                ) : positions.length === 0 ? (
                  <div className="text-center py-8 text-foreground/20 text-xs">No open forex positions</div>
                ) : (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-foreground/25 border-b border-border/40">
                        {["Symbol", "Side", "Lots", "Open Price", "Current", "P&L", "Margin", "Leverage", "Time", ""].map(h => (
                          <th key={h} className="px-3 py-1.5 text-left font-medium whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {positions.map(pos => {
                        const pnl = Number(pos.unrealizedPnl ?? 0);
                        const isProfit = pnl >= 0;
                        const pnlPips = pos.avgEntryPrice ? Math.abs(pos.currentPrice - pos.avgEntryPrice) * Math.pow(10, pp) : 0;
                        return (
                          <tr key={pos.id} className="border-b border-border/40 hover:bg-white/3">
                            <td className="px-3 py-1.5 font-semibold">{pos.symbol}</td>
                            <td className={cn("px-3 py-1.5 font-bold", pos.side === "buy" ? "text-emerald-400" : "text-red-400")}>
                              {pos.side === "buy" ? "▲ BUY" : "▼ SELL"}
                            </td>
                            <td className="px-3 py-1.5 tabular-nums">{pos.qty}</td>
                            <td className="px-3 py-1.5 tabular-nums font-mono">{pos.avgEntryPrice.toFixed(pp)}</td>
                            <td className="px-3 py-1.5 tabular-nums font-mono">{pos.currentPrice.toFixed(pp)}</td>
                            <td className={cn("px-3 py-1.5 font-bold tabular-nums", isProfit ? "text-emerald-400" : "text-red-400")}>
                              {isProfit ? "+" : ""}{pnl.toFixed(2)} {pos.quoteCurrency}
                              <span className="text-foreground/30 font-normal ml-1">({pnlPips.toFixed(1)} pips)</span>
                            </td>
                            <td className="px-3 py-1.5 tabular-nums text-foreground/50">{Number(pos.marginUsed).toFixed(2)}</td>
                            <td className="px-3 py-1.5 text-amber-400">{pos.leverage}×</td>
                            <td className="px-3 py-1.5 text-foreground/30 whitespace-nowrap">{new Date(pos.createdAt).toLocaleTimeString()}</td>
                            <td className="px-3 py-1.5">
                              <button onClick={() => closeMutation.mutate(pos.id)}
                                disabled={closeMutation.isPending}
                                className="px-2 py-0.5 text-[10px] text-red-400 border border-red-500/30 rounded hover:bg-red-500/10 transition-colors">
                                Close
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )
              )}

              {bottomTab === "history" && (
                !user ? (
                  <div className="text-center py-8 text-foreground/20 text-xs">Login to view orders</div>
                ) : orders.length === 0 ? (
                  <div className="text-center py-8 text-foreground/20 text-xs">No forex orders yet</div>
                ) : (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-foreground/25 border-b border-border/40">
                        {["Symbol", "Side", "Type", "Qty", "Fill Price", "Fee", "P&L", "Status", "Time"].map(h => (
                          <th key={h} className="px-3 py-1.5 text-left font-medium whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {orders.map(o => (
                        <tr key={o.id} className="border-b border-border/40 hover:bg-white/3">
                          <td className="px-3 py-1.5 font-semibold">{o.symbol}</td>
                          <td className={cn("px-3 py-1.5 font-bold", o.side === "buy" ? "text-emerald-400" : "text-red-400")}>
                            {o.side.toUpperCase()}
                          </td>
                          <td className="px-3 py-1.5 text-foreground/40">{o.type}</td>
                          <td className="px-3 py-1.5 tabular-nums">{o.filledQty}/{o.qty}</td>
                          <td className="px-3 py-1.5 tabular-nums font-mono">{o.avgFillPrice ? Number(o.avgFillPrice).toFixed(pp) : "—"}</td>
                          <td className="px-3 py-1.5 tabular-nums text-foreground/40">{Number(o.fee).toFixed(4)}</td>
                          <td className={cn("px-3 py-1.5 tabular-nums font-bold",
                            Number(o.pnl) >= 0 ? "text-emerald-400" : "text-red-400")}>
                            {Number(o.pnl) !== 0 ? (Number(o.pnl) >= 0 ? "+" : "") + Number(o.pnl).toFixed(2) : "—"}
                          </td>
                          <td className="px-3 py-1.5">
                            <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-semibold",
                              o.status === "filled" ? "bg-emerald-500/15 text-emerald-400" :
                              o.status === "rejected" ? "bg-red-500/15 text-red-400" :
                              "bg-amber-500/15 text-amber-400")}>
                              {o.status}
                            </span>
                          </td>
                          <td className="px-3 py-1.5 text-foreground/30 whitespace-nowrap">
                            {new Date(o.createdAt).toLocaleTimeString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              )}

              {/* ── MT5 Tab ─────────────────────────────────────────────── */}
              {bottomTab === "mt5" && (
                !user ? (
                  <div className="flex flex-col items-center justify-center py-8 gap-3">
                    <Terminal size={24} className="text-blue-400/30" />
                    <div className="text-foreground/20 text-xs">Login to connect MT5</div>
                  </div>
                ) : mt5Accounts.length === 0 ? (
                  /* No accounts: show broker grid CTA */
                  <div className="p-4 space-y-3">
                    <div className="text-[10px] text-foreground/30 font-medium uppercase tracking-wide">Popular Brokers — Connect Free Demo</div>
                    <div className="grid grid-cols-5 gap-2">
                      {MT5_BROKERS.filter(b => b.popular).map(b => (
                        <button key={b.id} onClick={() => setShowMt5Modal(true)}
                          className="flex flex-col items-center gap-1.5 p-2.5 rounded-xl border border-border/60 bg-white/3 hover:bg-muted/40 transition-all">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold"
                            style={{ background: b.color + "22", color: b.color }}>
                            {b.label.slice(0, 2)}
                          </div>
                          <div className="text-[10px] text-foreground/50 text-center leading-tight">{b.label}</div>
                        </button>
                      ))}
                    </div>
                    <button onClick={() => setShowMt5Modal(true)}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-blue-500/30 text-blue-400 hover:bg-blue-500/8 text-xs transition-colors font-semibold">
                      <PlugZap size={12} /> Connect MT5 Account
                    </button>
                  </div>
                ) : (
                  /* Accounts connected: show full dashboard */
                  <MT5Dashboard
                    accounts={mt5Accounts}
                    positions={mt5Positions}
                    orders={mt5OrderHistory}
                    onDisconnect={id => mt5DisconnectMutation.mutate(id)}
                    onAddAccount={() => setShowMt5Modal(true)}
                    onRefresh={() => { refetchMt5(); refetchMt5Pos(); }}
                    onClosePosition={ticket => mt5CloseMutation.mutate(ticket)}
                  />
                )
              )}
            </div>
          </div>
        </div>

        {/* ── RIGHT: Order panel ──────────────────────────────────────────── */}
        <div className="w-72 border-l border-border/60 bg-card flex flex-col flex-shrink-0 overflow-y-auto">

          {/* Pair header */}
          {selected && ltp > 0 && (
            <div className="px-4 pt-4 pb-3 border-b border-border/60">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold">{selected.symbol}</span>
                    <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-semibold",
                      changePct >= 0 ? "text-emerald-400 bg-emerald-500/10" : "text-red-400 bg-red-500/10")}>
                      {pct(changePct)}
                    </span>
                  </div>
                  <div className="text-[10px] text-foreground/30 mt-0.5">{selected.name}</div>
                </div>
                <button onClick={() => setShowCalc(s => !s)}
                  className={cn("p-1.5 rounded transition-colors", showCalc ? "bg-amber-500/20 text-amber-400" : "text-foreground/20 hover:text-foreground/50")}>
                  <Calculator size={13} />
                </button>
              </div>

              {/* Bid / Ask big display */}
              <div className="grid grid-cols-2 gap-2 mt-3">
                <button onClick={() => setSide("sell")}
                  className={cn("py-2 rounded-lg transition-all text-center",
                    side === "sell" ? "bg-red-600 ring-1 ring-red-500" : "bg-red-600/15 hover:bg-red-600/25")}>
                  <div className="text-[10px] text-red-300/70 mb-0.5">SELL</div>
                  <div className="text-lg font-bold text-red-400 tabular-nums font-mono leading-none">{p(bid, pp)}</div>
                </button>
                <button onClick={() => setSide("buy")}
                  className={cn("py-2 rounded-lg transition-all text-center",
                    side === "buy" ? "bg-emerald-600 ring-1 ring-emerald-500" : "bg-emerald-600/15 hover:bg-emerald-600/25")}>
                  <div className="text-[10px] text-emerald-300/70 mb-0.5">BUY</div>
                  <div className="text-lg font-bold text-emerald-400 tabular-nums font-mono leading-none">{p(ask, pp)}</div>
                </button>
              </div>
              <div className="text-center text-[10px] text-foreground/25 mt-1">
                Spread {spreadPips.toFixed(1)} pips · {selected.exchange}
              </div>
            </div>
          )}

          <div className="flex-1 p-3 space-y-3">

            {/* Order type */}
            <div className="flex gap-0.5 bg-muted/30 rounded-lg p-0.5">
              {(["MARKET", "LIMIT", "STOP"] as const).map(t => (
                <button key={t} onClick={() => setOrderType(t)}
                  className={cn("flex-1 py-1.5 text-[11px] font-semibold rounded-md transition-colors",
                    orderType === t ? "bg-amber-500/20 text-amber-400" : "text-foreground/30 hover:text-foreground/60")}>
                  {t}
                </button>
              ))}
            </div>

            {/* Lot size */}
            <div>
              <div className="flex justify-between text-[10px] text-foreground/35 mb-1">
                <span>Volume (lots)</span>
                <span>Min: {selected?.minQty ?? "0.01"}</span>
              </div>
              <div className="flex gap-1">
                <button onClick={() => setQty(q => Math.max(0.01, parseFloat(q) - 0.01).toFixed(2))}
                  className="w-8 h-9 flex items-center justify-center bg-muted/30 hover:bg-muted/50 rounded-lg text-foreground/50 text-lg">−</button>
                <input type="number" value={qty} onChange={e => setQty(e.target.value)} step="0.01"
                  className="flex-1 bg-muted/30 border border-border text-center text-sm font-bold rounded-lg h-9 text-foreground focus:border-amber-500/50 focus:outline-none tabular-nums" />
                <button onClick={() => setQty(q => (parseFloat(q) + 0.01).toFixed(2))}
                  className="w-8 h-9 flex items-center justify-center bg-muted/30 hover:bg-muted/50 rounded-lg text-foreground/50 text-lg">+</button>
              </div>
              <div className="flex gap-1.5 mt-1.5">
                {["0.01", "0.05", "0.1", "0.5", "1.0"].map(v => (
                  <button key={v} onClick={() => setQty(v)}
                    className={cn("flex-1 py-0.5 text-[10px] rounded border transition-colors",
                      qty === v ? "border-amber-500/50 text-amber-400 bg-amber-500/10" : "border-border text-foreground/30 hover:text-foreground/50")}>
                    {v}
                  </button>
                ))}
              </div>
            </div>

            {/* Limit/Stop price */}
            {orderType !== "MARKET" && (
              <div>
                <div className="text-[10px] text-foreground/35 mb-1">{orderType === "LIMIT" ? "Limit" : "Stop"} Price</div>
                <input type="number" value={limitPrice} onChange={e => setLimitPrice(e.target.value)}
                  placeholder={p(side === "buy" ? ask : bid, pp)}
                  className="w-full bg-muted/30 border border-border px-3 h-9 text-sm font-mono rounded-lg text-foreground focus:border-amber-500/50 focus:outline-none" />
              </div>
            )}

            {/* SL / TP */}
            <div className="bg-white/3 rounded-xl p-3 space-y-2 border border-border/60">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-foreground/35 font-semibold">Risk Management</span>
                <div className="flex gap-0.5 bg-muted/30 rounded-md p-0.5">
                  {(["pips", "price"] as const).map(m => (
                    <button key={m} onClick={() => setSlMode(m)}
                      className={cn("px-1.5 py-0.5 text-[9px] rounded transition-colors",
                        slMode === m ? "bg-muted/50 text-foreground" : "text-foreground/25")}>
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[10px] text-foreground/30 mb-0.5">
                  <span className="flex items-center gap-1"><Shield size={9} className="text-red-400" /> Stop Loss</span>
                  {slPrice && <span className="font-mono text-red-400">{p(slPrice, pp)}</span>}
                </div>
                <div className="flex gap-1.5">
                  <input type="number" value={stopLoss} onChange={e => setStopLoss(e.target.value)}
                    placeholder={slMode === "pips" ? "e.g. 20" : p(bid * 0.998, pp)}
                    className="flex-1 bg-muted/30 border border-red-500/20 px-2 h-8 text-xs font-mono rounded-md text-foreground focus:border-red-500/50 focus:outline-none" />
                  {stopLoss && <button onClick={() => setStopLoss("")} className="text-foreground/20 hover:text-foreground/50"><X size={12} /></button>}
                </div>
                {slPnl && <div className="text-[10px] text-red-400/70 mt-0.5">Risk: −{fmtCurrency(slPnl, selected?.quoteCurrency)}</div>}
              </div>

              <div>
                <div className="flex justify-between text-[10px] text-foreground/30 mb-0.5">
                  <span className="flex items-center gap-1"><Zap size={9} className="text-emerald-400" /> Take Profit</span>
                  {tpPrice && <span className="font-mono text-emerald-400">{p(tpPrice, pp)}</span>}
                </div>
                <div className="flex gap-1.5">
                  <input type="number" value={takeProfit} onChange={e => setTakeProfit(e.target.value)}
                    placeholder={slMode === "pips" ? "e.g. 40" : p(ask * 1.002, pp)}
                    className="flex-1 bg-muted/30 border border-emerald-500/20 px-2 h-8 text-xs font-mono rounded-md text-foreground focus:border-emerald-500/50 focus:outline-none" />
                  {takeProfit && <button onClick={() => setTakeProfit("")} className="text-foreground/20 hover:text-foreground/50"><X size={12} /></button>}
                </div>
                {tpPnl && <div className="text-[10px] text-emerald-400/70 mt-0.5">Reward: +{fmtCurrency(tpPnl, selected?.quoteCurrency)}</div>}
              </div>

              {stopLoss && takeProfit && slPnl && tpPnl && (
                <div className="text-[10px] text-foreground/30 flex justify-between pt-1 border-t border-border/40">
                  <span>R:R Ratio</span>
                  <span className={cn("font-semibold", tpPnl / slPnl >= 2 ? "text-emerald-400" : tpPnl / slPnl >= 1 ? "text-amber-400" : "text-red-400")}>
                    1:{(tpPnl / slPnl).toFixed(2)}
                  </span>
                </div>
              )}
            </div>

            {/* Pip calculator */}
            {showCalc && (
              <div className="bg-amber-500/5 border border-amber-500/15 rounded-xl p-3 space-y-1.5">
                <div className="text-[10px] text-amber-400 font-semibold mb-1.5 flex items-center gap-1.5">
                  <Calculator size={10} /> Pip Calculator
                </div>
                {[
                  ["Pip Value", `${fmtCurrency(pipValue, selected?.quoteCurrency ?? "INR")}/pip`],
                  ["Lots", lots.toFixed(2)],
                  ["Value/Lot", fmtCurrency(pipValueLots, selected?.quoteCurrency ?? "INR")],
                  ["Notional", fmtCurrency(notional, selected?.quoteCurrency ?? "INR")],
                  ["Margin Req.", fmtCurrency(margin, selected?.quoteCurrency ?? "INR")],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between text-xs">
                    <span className="text-foreground/30">{k}</span>
                    <span className="font-mono text-amber-300/80">{v}</span>
                  </div>
                ))}
              </div>
            )}

            {/* ── MT5 section ── */}
            {user && (
              connectedMt5 ? (
                <MT5AccountCard account={connectedMt5}
                  onDisconnect={() => mt5DisconnectMutation.mutate(connectedMt5.id)} />
              ) : (
                <button onClick={() => setShowMt5Modal(true)}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-blue-500/20 bg-blue-500/5 hover:bg-blue-500/10 transition-colors text-left">
                  <div className="w-7 h-7 rounded-lg bg-blue-500/15 flex items-center justify-center flex-shrink-0">
                    <Terminal size={13} className="text-blue-400" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-blue-300">Connect MetaTrader 5</div>
                    <div className="text-[10px] text-foreground/25 mt-0.5">Route orders via your MT5 broker account</div>
                  </div>
                  <PlugZap size={12} className="ml-auto text-blue-400/50" />
                </button>
              )
            )}

            {/* MT5 active indicator */}
            {connectedMt5 && (
              <div className="bg-blue-500/5 border border-blue-500/15 rounded-lg px-3 py-2 flex items-center gap-1.5 text-[10px]">
                <CheckCircle2 size={10} className="text-blue-400" />
                <span className="text-blue-300/70">
                  Orders routing via MT5 · {connectedMt5.server}
                </span>
              </div>
            )}

            {/* Angel One status */}
            {user && !connectedMt5 && (
              brokerActive ? (
                <div className={cn("rounded-xl p-2.5 border text-xs",
                  brokerSimulated ? "bg-yellow-500/8 border-yellow-500/25" : "bg-emerald-500/8 border-emerald-500/25")}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      {brokerSimulated ? <WifiOff size={10} className="text-yellow-400" /> : <Wifi size={10} className="text-emerald-400" />}
                      <span className={brokerSimulated ? "text-yellow-300" : "text-emerald-300"}>
                        {brokerSimulated ? "Simulated" : "Live"} · {brokerAccount.angelClientId}
                      </span>
                    </div>
                    <Link href="/broker/onboarding" className="text-amber-400 hover:underline text-[10px]">Manage</Link>
                  </div>
                  {brokerSimulated && (
                    <div className="text-yellow-500/60 text-[10px] mt-1">
                      Add SmartAPI key for live orders →&nbsp;
                      <Link href="/broker/onboarding" className="text-amber-400 underline">Setup</Link>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-amber-500/8 border border-amber-500/25 rounded-xl p-3">
                  <div className="text-xs font-semibold text-amber-300 mb-1.5 flex items-center gap-1.5">
                    <Link2 size={11} /> Connect Angel One
                  </div>
                  <div className="text-[10px] text-foreground/35 mb-2.5 leading-relaxed">
                    Link your Angel One account to execute live Forex CFD orders via our AP license.
                  </div>
                  <div className="flex gap-2">
                    <Link href="/broker/onboarding"
                      className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-black text-[11px] font-bold transition-colors">
                      <Link2 size={10} /> Connect
                    </Link>
                    <Link href="/broker/onboarding"
                      className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-muted/40 hover:bg-white/12 text-foreground text-[11px] transition-colors">
                      Open Account <ChevronRight size={10} />
                    </Link>
                  </div>
                </div>
              )
            )}

            {/* One-click toggle */}
            {user && (
              <div className="flex items-center justify-between text-[10px] text-foreground/30 px-1">
                <span>One-click trading</span>
                <button onClick={() => setOneClick(s => !s)}
                  className={cn("w-8 h-4 rounded-full transition-colors relative",
                    oneClick ? "bg-amber-500" : "bg-muted/60")}>
                  <span className={cn("absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform",
                    oneClick ? "translate-x-4" : "translate-x-0.5")} />
                </button>
              </div>
            )}

            {/* Place order button */}
            {!user ? (
              <a href="/login" className="block w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-black font-bold text-sm text-center transition-colors">
                Login to Trade
              </a>
            ) : (
              <div className="space-y-1.5">
                {/* Sell button */}
                <button onClick={() => handlePlace("sell")}
                  disabled={!selectedSymbol || !qty || placeMutation.isPending || mt5PlaceMutation.isPending}
                  className="w-full py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-foreground font-bold text-sm transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
                  <TrendingDown size={14} />
                  {connectedMt5 ? "MT5 " : ""}Sell {qty} {selectedSymbol ?? "—"}
                  <span className="font-mono text-xs opacity-80">{p(bid, pp)}</span>
                </button>

                {/* Buy button */}
                <button onClick={() => handlePlace("buy")}
                  disabled={!selectedSymbol || !qty || placeMutation.isPending || mt5PlaceMutation.isPending}
                  className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-foreground font-bold text-sm transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
                  <TrendingUp size={14} />
                  {connectedMt5 ? "MT5 " : ""}Buy {qty} {selectedSymbol ?? "—"}
                  <span className="font-mono text-xs opacity-80">{p(ask, pp)}</span>
                </button>

                {(placeMutation.isPending || mt5PlaceMutation.isPending) && (
                  <div className="text-center text-xs animate-pulse flex items-center justify-center gap-1.5">
                    <RefreshCw size={10} className={connectedMt5 ? "text-blue-400" : "text-amber-400"} />
                    <span className={connectedMt5 ? "text-blue-400" : "text-amber-400"}>
                      {connectedMt5 ? "Sending to MT5..." : "Placing order..."}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Risk notice */}
            <div className="flex items-start gap-1.5 text-[10px] text-foreground/20 pb-2">
              <AlertTriangle size={10} className="flex-shrink-0 mt-0.5 text-amber-500/40" />
              <span>
                {connectedMt5
                  ? `${connectedMt5.isDemo ? "Demo" : "Live"} execution via MT5 · ${connectedMt5.server}. CFDs carry risk.`
                  : brokerActive && !brokerSimulated
                  ? `Live execution via Angel One (${brokerAccount.angelClientId}). CFDs carry risk.`
                  : "CFDs carry significant risk. 74% of retail investors lose money."}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── MT5 Connect Modal ──────────────────────────────────────────────── */}
      {showMt5Modal && (
        <MT5ConnectModal
          onClose={() => setShowMt5Modal(false)}
          onConnected={(acct) => setActiveMt5(acct)}
        />
      )}
      <SuccessModal open={successData !== null} payload={successData} onClose={() => setSuccessData(null)} />
    </div>
  );
}
