import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { SuccessModal, type GenericSuccess } from "@/components/SuccessModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Link } from "wouter";
import {
  BarChart3, TrendingUp, TrendingDown, Search, Building2,
  Globe, RefreshCw, Info, Flag, Link2, ChevronRight, Clock,
} from "lucide-react";

// ─── OHLC types & helpers ─────────────────────────────────────────────────────
type OHLC = { t: number; o: number; h: number; l: number; c: number; v: number };
type TF = "M5" | "M15" | "H1" | "H4" | "D1";

const TF_MS: Record<TF, number> = { M5: 300_000, M15: 900_000, H1: 3_600_000, H4: 14_400_000, D1: 86_400_000 };

function genOHLC(base: number, count: number, tfMs: number): OHLC[] {
  const bars: OHLC[] = [];
  let price = base;
  const now = Date.now();
  for (let i = count; i >= 0; i--) {
    const t = now - i * tfMs;
    const vol = base * 0.0015;
    const o = price;
    const m1 = (Math.random() - 0.49) * vol;
    const m2 = (Math.random() - 0.49) * vol;
    const m3 = (Math.random() - 0.49) * vol;
    const c = o + m1 + m2;
    const h = Math.max(o, c) + Math.abs(m3) * 0.4;
    const l = Math.min(o, c) - Math.abs(m3) * 0.4;
    bars.push({ t, o: +o.toFixed(2), h: +h.toFixed(2), l: +l.toFixed(2), c: +c.toFixed(2), v: Math.floor(Math.random() * 800000 + 100000) });
    price = c;
  }
  return bars;
}

function fmtTime(ts: number, tf: TF) {
  const d = new Date(ts);
  if (tf === "D1") return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return d.getHours().toString().padStart(2, "0") + ":" + d.getMinutes().toString().padStart(2, "0");
}

// ─── Candlestick SVG chart ─────────────────────────────────────────────────────
function CandlestickChart({ bars, symbol, tf, pp }: { bars: OHLC[]; symbol: string; tf: TF; pp: number }) {
  const W = 900, H = 320, PAD_L = 66, PAD_R = 62, PAD_T = 14, PAD_B = 24;
  const vis = bars.slice(-100);
  const maxH = Math.max(...vis.map(b => b.h));
  const minL = Math.min(...vis.map(b => b.l));
  const range = maxH - minL || 0.01;
  const toY = (v: number) => PAD_T + ((maxH - v) / range) * (H - PAD_T - PAD_B);
  const bW = Math.max(2, (W - PAD_L - PAD_R) / vis.length - 1.2);
  const bX = (i: number) => PAD_L + i * ((W - PAD_L - PAD_R) / vis.length) + bW / 4;
  const maxVol = Math.max(...vis.map(b => b.v));
  const VOL_H = 48;
  const levels = Array.from({ length: 7 }, (_, i) => minL + (range * i) / 6);
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H + VOL_H}`} preserveAspectRatio="none" className="w-full">
      {levels.map((lv, i) => (
        <g key={i}>
          <line x1={PAD_L} x2={W - PAD_R} y1={toY(lv)} y2={toY(lv)} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
          <text x={W - PAD_R + 3} y={toY(lv) + 4} fill="rgba(255,255,255,0.3)" fontSize="9" textAnchor="start">{lv.toFixed(pp)}</text>
        </g>
      ))}
      {vis.map((b, i) => {
        const up = b.c >= b.o;
        const col = up ? "#22c55e" : "#ef4444";
        const x = bX(i);
        const cO = toY(b.o), cC = toY(b.c), cH = toY(b.h), cL = toY(b.l);
        const top = Math.min(cO, cC), bodyH = Math.max(Math.abs(cO - cC), 1);
        return (
          <g key={i}>
            <line x1={x + bW / 2} x2={x + bW / 2} y1={cH} y2={cL} stroke={col} strokeWidth="1" />
            <rect x={x} y={top} width={bW} height={bodyH} fill={col} rx="0.5" />
          </g>
        );
      })}
      {vis.length > 0 && (() => {
        const last = vis[vis.length - 1];
        const y = toY(last.c);
        const up = last.c >= last.o;
        return (
          <g>
            <line x1={PAD_L} x2={W - PAD_R} y1={y} y2={y} stroke={up ? "#22c55e" : "#ef4444"} strokeWidth="1" strokeDasharray="4 3" opacity="0.6" />
            <rect x={W - PAD_R + 1} y={y - 8} width={54} height={16} fill={up ? "#22c55e" : "#ef4444"} rx="2" />
            <text x={W - PAD_R + 28} y={y + 4} fill="white" fontSize="9" textAnchor="middle" fontWeight="bold">{last.c.toFixed(pp)}</text>
          </g>
        );
      })()}
      {vis.map((b, i) => {
        const up = b.c >= b.o;
        const vH = (b.v / maxVol) * VOL_H * 0.88;
        return <rect key={i} x={bX(i)} y={H + VOL_H - vH} width={bW} height={vH} fill={up ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"} rx="0.5" />;
      })}
      {vis.filter((_, i) => i % Math.floor(vis.length / 6) === 0).map((b, i) => (
        <text key={i} x={bX(i * Math.floor(vis.length / 6))} y={H + VOL_H - 2} fill="rgba(255,255,255,0.28)" fontSize="8">{fmtTime(b.t, tf)}</text>
      ))}
    </svg>
  );
}

type Instrument = {
  id: number; symbol: string; name: string; assetClass: string;
  exchange: string; quoteCurrency: string; currentPrice: string;
  change24h: string; high24h: string; low24h: string; volume24h: string;
  tradingEnabled: boolean; maxLeverage: number; marginRequired: string;
  takerFee: string; pricePrecision: number; sector: string | null;
  countryCode: string;
};

type Position = {
  id: number; symbol: string; name: string; side: string; qty: string;
  avgEntryPrice: number; currentPrice: number; unrealizedPnl: number;
  leverage: number; marginUsed: number; quoteCurrency: string;
  assetClass: string; createdAt: string;
};

type OrderRow = {
  id: number; symbol: string; name: string; side: string; type: string;
  qty: string; filledQty: string; avgFillPrice: string | null;
  status: string; fee: string; pnl: string; createdAt: string;
  assetClass: string; quoteCurrency: string;
};

function fmtPrice(n: number, precision = 2, currency = "INR") {
  if (!isFinite(n) || n === 0) return "—";
  const prefix = currency === "INR" ? "₹" : currency === "USD" ? "$" : "";
  return prefix + n.toLocaleString(currency === "INR" ? "en-IN" : "en-US", {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  });
}
function fmtChange(n: number) {
  return (n >= 0 ? "+" : "") + n.toFixed(2) + "%";
}

function StocksComingSoon() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  return (
    <div className="min-h-[calc(100vh-56px)] bg-background">
      <div className="max-w-xl mx-auto px-6 py-16 flex flex-col items-center text-center gap-8">
        <div className="relative">
          <div className="w-24 h-24 rounded-3xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
            <Building2 className="w-10 h-10 text-blue-400" />
          </div>
          <div className="absolute -top-2 -right-2 px-2 py-1 rounded-full text-[10px] font-bold bg-amber-400/15 border border-amber-400/30 text-amber-400">SOON</div>
        </div>
        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-amber-400">Coming Soon</p>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight">Stocks Trading</h1>
          <p className="text-muted-foreground leading-relaxed max-w-sm">NSE India & US NASDAQ/NYSE stocks — Reliance, TCS, AAPL, NVDA and more with real-time market depth.</p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {["NSE Equities", "NASDAQ · NYSE", "Real-time L2", "Up to 5× Leverage", "Angel One Integration"].map((f) => (
            <span key={f} className="px-3 py-1.5 rounded-full text-xs font-medium bg-blue-500/10 border border-blue-500/20 text-blue-400">{f}</span>
          ))}
        </div>
        <div className="w-full max-w-sm space-y-3">
          {submitted ? (
            <div className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-medium">
              ✓ You'll be notified when Stocks launches!
            </div>
          ) : (
            <div className="flex gap-2">
              <Input type="email" placeholder="your@email.com" value={email} onChange={(e) => setEmail(e.target.value)} className="flex-1" />
              <Button onClick={() => { if (email) { setSubmitted(true); } }}>Notify Me</Button>
            </div>
          )}
        </div>
        <div className="w-full max-w-sm space-y-3 text-left border border-border/50 rounded-xl p-4 bg-card/40">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-4">Roadmap</p>
          {[
            { q: "Q2 2025", label: "Angel One SmartAPI integration", done: true },
            { q: "Q3 2025", label: "NSE equity paper trading", done: false },
            { q: "Q4 2025", label: "NASDAQ & NYSE live data", done: false },
            { q: "Q1 2026", label: "Full live trading + margin", done: false },
          ].map((r) => (
            <div key={r.q} className="flex items-center gap-3">
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${r.done ? "bg-emerald-400" : "bg-muted-foreground/30"}`} />
              <span className="text-xs text-muted-foreground w-20 flex-shrink-0">{r.q}</span>
              <span className={`text-sm ${r.done ? "text-foreground font-medium" : "text-muted-foreground"}`}>{r.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const SECTOR_COLORS: Record<string, string> = {
  Technology: "text-blue-400",
  Banking: "text-green-400",
  Finance: "text-emerald-400",
  Automobile: "text-orange-400",
  Metals: "text-muted-foreground",
  Conglomerate: "text-purple-400",
  Energy: "text-yellow-400",
};

export default function Stocks() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [successData, setSuccessData] = useState<GenericSuccess | null>(null);

  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [country, setCountry] = useState<"all" | "IN" | "US">("all");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [qty, setQty] = useState("");
  const [orderType, setOrderType] = useState<"MARKET" | "LIMIT">("MARKET");
  const [limitPrice, setLimitPrice] = useState("");
  const [leverage, setLeverage] = useState(1);
  const [activeTab, setActiveTab] = useState("chart");
  const [tf, setTf] = useState<TF>("H1");

  const { data: instrData, isLoading, refetch } = useQuery({
    queryKey: ["instruments", "stock"],
    queryFn: () => get<{ instruments: Instrument[] }>("/instruments?assetClass=stock"),
    refetchInterval: 30000,
  });

  const { data: posData } = useQuery({
    queryKey: ["instrument-positions"],
    queryFn: () => get<{ positions: Position[] }>("/instruments/positions"),
    enabled: !!user,
    refetchInterval: 15000,
  });

  const { data: orderData } = useQuery({
    queryKey: ["instrument-orders"],
    queryFn: () => get<{ orders: OrderRow[] }>("/instruments/orders"),
    enabled: !!user && activeTab === "orders",
  });

  const { data: quoteData } = useQuery({
    queryKey: ["instrument-quote", selectedSymbol],
    queryFn: () => get<{ quote: { ltp: number; open: number; high: number; low: number; changePct: number; volume: number } }>(`/instruments/${selectedSymbol}/quote`),
    enabled: !!selectedSymbol,
    refetchInterval: 10000,
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
  const brokerAccount = brokerData?.account;
  const brokerActive = brokerAccount?.status === "active" && !!brokerAccount?.angelClientId;
  const brokerSimulated = brokerActive && brokerAccount?.jwtToken?.startsWith("sim.");

  const instruments = instrData?.instruments ?? [];
  const positions = posData?.positions?.filter((p) => p.assetClass === "stock") ?? [];
  const orders = orderData?.orders?.filter((o) => o.assetClass === "stock") ?? [];

  const filtered = instruments.filter((i) => {
    if (country !== "all" && i.countryCode !== country) return false;
    if (search) return i.symbol.includes(search.toUpperCase()) || i.name.toUpperCase().includes(search.toUpperCase());
    return true;
  });

  const selected = instruments.find((i) => i.symbol === selectedSymbol) ?? null;
  const quote = quoteData?.quote ?? null;
  const ltp = quote?.ltp ?? (selected ? Number(selected.currentPrice) : 0);
  const changePct = quote?.changePct ?? (selected ? Number(selected.change24h) : 0);

  const bars = useMemo(() => {
    if (!selected) return [];
    const base = Number(selected.currentPrice) || 100;
    return genOHLC(base, 120, TF_MS[tf]);
  }, [selected?.symbol, tf]);

  useEffect(() => {
    if (!selectedSymbol && instruments.length > 0) setSelectedSymbol(instruments[0].symbol);
  }, [instruments, selectedSymbol]);

  const placeMutation = useMutation({
    mutationFn: (body: object) => post("/instruments/orders", body),
    onSuccess: () => {
      setSuccessData({
        kind: "generic", iconKind: "futures", accentColor: side === "buy" ? "#10b981" : "#f59e0b",
        title: "Order Placed",
        subtitle: "Your stock order has been executed.",
        rows: [
          { label: "Symbol", value: selectedSymbol ?? "" },
          { label: "Side", value: side.toUpperCase(), accent: side === "buy" ? "#10b981" : "#f59e0b" },
          { label: "Quantity", value: `${qty} shares` },
          { label: "Type", value: orderType },
        ],
      });
      setQty(""); setLimitPrice("");
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
        subtitle: "Your stock position has been closed.",
        rows: [{ label: "Status", value: "Closed", accent: "#6366f1" }],
      });
      qc.invalidateQueries({ queryKey: ["instrument-positions"] });
    },
    onError: (e: Error) => toast.error(e.message || "Failed to close position"),
  });

  const handlePlace = () => {
    if (!selectedSymbol || !qty) return;
    placeMutation.mutate({
      symbol: selectedSymbol, side, qty: Number(qty), type: orderType, leverage,
      ...(orderType === "LIMIT" && limitPrice ? { price: Number(limitPrice) } : {}),
    });
  };

  const notional = ltp * Number(qty || 0);
  const marginNeeded = selected ? notional * Number(selected.marginRequired) / leverage : 0;

  const indiaStocks = instruments.filter((i) => i.countryCode === "IN");
  const usStocks = instruments.filter((i) => i.countryCode === "US");

  const COMING_SOON_STOCKS: boolean = true;
  if (COMING_SOON_STOCKS) {
    return <StocksComingSoon />;
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="border-b border-border bg-card px-4 py-3 flex items-center gap-3">
        <Building2 className="w-5 h-5 text-blue-400" />
        <span className="font-bold text-lg tracking-tight">Stocks</span>
        <Badge variant="outline" className="border-blue-400/40 text-blue-400 text-[10px]">NSE · NASDAQ</Badge>
        <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
          <button onClick={() => refetch()} className="hover:text-foreground transition-colors flex items-center gap-1">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />Live</span>
        </div>
      </div>

      <div className="flex h-[calc(100vh-112px)] overflow-hidden">
        {/* Sidebar */}
        <div className="w-64 border-r border-border bg-card flex flex-col">
          <div className="p-2 border-b border-border space-y-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search stocks..."
                className="w-full bg-muted/30 border border-border rounded text-xs pl-7 pr-3 py-1.5 text-foreground placeholder-muted-foreground focus:outline-none focus:border-blue-500/50"
              />
            </div>
            <div className="flex gap-1">
              {(["all", "IN", "US"] as const).map((c) => (
                <button key={c} onClick={() => setCountry(c)}
                  className={cn("flex-1 text-[11px] py-1 rounded flex items-center justify-center gap-1 transition-colors",
                    country === c ? "bg-blue-500/20 text-blue-400 font-semibold" : "text-muted-foreground hover:text-foreground",
                  )}>
                  {c === "IN" ? "🇮🇳" : c === "US" ? "🇺🇸" : "🌐"} {c === "all" ? "All" : c}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="px-3 py-2.5 border-b border-border/40">
                  <Skeleton className="h-4 w-20 mb-1" /><Skeleton className="h-3 w-28" />
                </div>
              ))
            ) : filtered.length === 0 ? (
              <div className="text-center py-8 text-xs text-muted-foreground">No stocks found</div>
            ) : filtered.map((inst) => {
              const chg = Number(inst.change24h);
              const isUp = chg >= 0;
              const isActive = inst.symbol === selectedSymbol;
              const currency = inst.quoteCurrency;
              return (
                <button key={inst.symbol} onClick={() => setSelectedSymbol(inst.symbol)}
                  className={cn("w-full px-3 py-2.5 border-b border-border/40 text-left hover:bg-muted/30 transition-colors",
                    isActive && "bg-blue-500/10 border-l-2 border-l-blue-500")}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[13px] font-bold">{inst.symbol}</span>
                      <span className="text-[9px] text-muted-foreground">{inst.exchange}</span>
                    </div>
                    <span className={cn("text-[12px] font-medium tabular-nums", isUp ? "text-emerald-400" : "text-red-400")}>
                      {fmtChange(chg)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <span className="text-[11px] text-muted-foreground truncate max-w-[110px]">{inst.name.split(" ").slice(0, 3).join(" ")}</span>
                    <span className="text-[12px] tabular-nums">{fmtPrice(Number(inst.currentPrice), 2, currency)}</span>
                  </div>
                  {inst.sector && (
                    <span className={cn("text-[9px]", SECTOR_COLORS[inst.sector] ?? "text-muted-foreground")}>{inst.sector}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Main */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {selected && (
            <div className="border-b border-border bg-card px-4 py-2.5 flex items-center gap-6 flex-shrink-0 flex-wrap">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-base font-bold">{selected.symbol}</span>
                  <Badge variant="outline" className="text-[9px] border-white/20">{selected.exchange}</Badge>
                  {selected.sector && (
                    <Badge variant="outline" className={cn("text-[9px] border-white/20", SECTOR_COLORS[selected.sector ?? ""])}>{selected.sector}</Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">{selected.name}</div>
              </div>
              <div>
                <div className={cn("text-2xl font-bold tabular-nums", changePct >= 0 ? "text-emerald-400" : "text-red-400")}>
                  {fmtPrice(ltp, selected.pricePrecision, selected.quoteCurrency)}
                </div>
                <div className={cn("text-xs", changePct >= 0 ? "text-emerald-400" : "text-red-400")}>{fmtChange(changePct)}</div>
              </div>
              <div className="text-xs space-y-0.5">
                <div className="text-muted-foreground">High <span className="text-foreground">{fmtPrice(Number(selected.high24h), 2, selected.quoteCurrency)}</span></div>
                <div className="text-muted-foreground">Low <span className="text-foreground">{fmtPrice(Number(selected.low24h), 2, selected.quoteCurrency)}</span></div>
              </div>
              <div className="text-xs space-y-0.5">
                <div className="text-muted-foreground">Volume <span className="text-foreground">{Number(selected.volume24h) > 0 ? Number(selected.volume24h).toLocaleString("en-IN") : "—"}</span></div>
                <div className="text-muted-foreground">Country <span className="text-foreground">{selected.countryCode === "IN" ? "🇮🇳 India" : "🇺🇸 USA"}</span></div>
              </div>
            </div>
          )}

          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
            <TabsList className="border-b border-border bg-transparent rounded-none px-4 flex-shrink-0 justify-start h-10">
              <TabsTrigger value="chart" className="data-[state=active]:border-b-2 data-[state=active]:border-blue-400 rounded-none text-xs">Chart</TabsTrigger>
              <TabsTrigger value="positions" className="data-[state=active]:border-b-2 data-[state=active]:border-blue-400 rounded-none text-xs">
                Positions {positions.length > 0 && <Badge className="ml-1 bg-blue-500/20 text-blue-400 text-[10px]">{positions.length}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="orders" className="data-[state=active]:border-b-2 data-[state=active]:border-blue-400 rounded-none text-xs">Orders</TabsTrigger>
            </TabsList>

            <TabsContent value="chart" className="flex-1 overflow-auto m-0">
              {selected ? (
                <div className="bg-background border-b border-border">
                  <div className="flex items-center justify-between px-3 pt-2 pb-1">
                    <div className="flex gap-1">
                      {(["M5", "M15", "H1", "H4", "D1"] as TF[]).map((t) => (
                        <button
                          key={t}
                          onClick={() => setTf(t)}
                          className={cn("px-2 py-0.5 rounded text-[10px] font-semibold transition-colors",
                            tf === t ? "bg-blue-500 text-foreground" : "text-foreground/40 hover:text-foreground/70")}
                        >{t}</button>
                      ))}
                    </div>
                    <span className="text-[10px] text-foreground/30">Simulated OHLC · {selected.exchange}</span>
                  </div>
                  <div className="px-2 pb-1">
                    <CandlestickChart bars={bars} symbol={selected.symbol} tf={tf} pp={selected.pricePrecision} />
                  </div>
                </div>
              ) : (
                <div className="h-72 bg-background border-b border-border flex items-center justify-center">
                  <div className="text-center">
                    <BarChart3 className="w-10 h-10 text-blue-400/20 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">Select an instrument to view chart</p>
                  </div>
                </div>
              )}
              {selected && (
                <div className="p-4 grid grid-cols-2 gap-3 text-xs">
                  <div className="col-span-2 text-sm font-semibold text-foreground/80 mb-1">Instrument Details</div>
                  {[
                    ["Exchange", selected.exchange],
                    ["Quote Currency", selected.quoteCurrency],
                    ["Max Leverage", `${selected.maxLeverage}×`],
                    ["Margin Req.", `${(Number(selected.marginRequired) * 100).toFixed(0)}%`],
                    ["Taker Fee", `${(Number(selected.takerFee) * 100).toFixed(3)}%`],
                    ["Sector", selected.sector ?? "—"],
                  ].map(([label, val]) => (
                    <div key={label} className="bg-muted/30 rounded p-2.5">
                      <div className="text-muted-foreground mb-1">{label}</div>
                      <div className="font-semibold">{val}</div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="positions" className="flex-1 overflow-auto m-0 p-4">
              {!user ? (
                <div className="text-center py-12 text-muted-foreground text-sm">Login to view positions</div>
              ) : positions.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground text-sm">No open stock positions</div>
              ) : (
                <div className="space-y-2">
                  {positions.map((p) => {
                    const pnl = Number(p.unrealizedPnl ?? 0);
                    const isProfit = pnl >= 0;
                    return (
                      <div key={p.id} className="bg-muted/30 border border-border rounded-lg p-3 flex items-center gap-4">
                        <div>
                          <div className="font-bold text-sm">{p.symbol}</div>
                          <Badge variant="outline" className={cn("text-[10px] mt-0.5", p.side === "buy" ? "border-emerald-500/40 text-emerald-400" : "border-red-500/40 text-red-400")}>
                            {p.side.toUpperCase()}
                          </Badge>
                        </div>
                        <div className="text-xs space-y-0.5">
                          <div className="text-muted-foreground">Shares <span className="text-foreground">{p.qty}</span></div>
                          <div className="text-muted-foreground">Entry <span className="text-foreground">{fmtPrice(Number(p.avgEntryPrice), 2, p.quoteCurrency)}</span></div>
                        </div>
                        <div className="text-xs space-y-0.5">
                          <div className="text-muted-foreground">LTP <span className="text-foreground">{fmtPrice(Number(p.currentPrice), 2, p.quoteCurrency)}</span></div>
                          <div className="text-muted-foreground">Margin <span className="text-foreground">{fmtPrice(Number(p.marginUsed), 2, p.quoteCurrency)}</span></div>
                        </div>
                        <div className="ml-auto text-right">
                          <div className={cn("font-bold text-sm", isProfit ? "text-emerald-400" : "text-red-400")}>
                            {isProfit ? "+" : ""}{fmtPrice(pnl, 2, p.quoteCurrency)}
                          </div>
                          <div className="text-[10px] text-muted-foreground">Unrealized PnL</div>
                        </div>
                        <Button size="sm" variant="outline"
                          className="border-red-500/40 text-red-400 hover:bg-red-500/10 text-xs h-7"
                          onClick={() => closeMutation.mutate(p.id)} disabled={closeMutation.isPending}>
                          Close
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            <TabsContent value="orders" className="flex-1 overflow-auto m-0 p-4">
              {!user ? (
                <div className="text-center py-12 text-muted-foreground text-sm">Login to view orders</div>
              ) : orders.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground text-sm">No stock orders yet</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border text-muted-foreground">
                        <th className="text-left py-2 px-2">Symbol</th>
                        <th className="text-left py-2 px-2">Side</th>
                        <th className="text-right py-2 px-2">Qty</th>
                        <th className="text-right py-2 px-2">Avg Price</th>
                        <th className="text-left py-2 px-2">Status</th>
                        <th className="text-left py-2 px-2">Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders.map((o) => (
                        <tr key={o.id} className="border-b border-border/40">
                          <td className="py-2 px-2 font-medium">{o.symbol}</td>
                          <td className={cn("py-2 px-2 font-semibold", o.side === "buy" ? "text-emerald-400" : "text-red-400")}>{o.side.toUpperCase()}</td>
                          <td className="py-2 px-2 text-right tabular-nums">{o.filledQty}/{o.qty}</td>
                          <td className="py-2 px-2 text-right tabular-nums">{o.avgFillPrice ? fmtPrice(Number(o.avgFillPrice), 2, o.quoteCurrency) : "—"}</td>
                          <td className="py-2 px-2">
                            <Badge variant="outline" className={cn("text-[10px]",
                              o.status === "filled" ? "border-emerald-500/40 text-emerald-400" :
                              o.status === "rejected" ? "border-red-500/40 text-red-400" : "border-amber-500/40 text-amber-400")}>
                              {o.status}
                            </Badge>
                          </td>
                          <td className="py-2 px-2 text-muted-foreground">{new Date(o.createdAt).toLocaleTimeString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>

        {/* Order form */}
        <div className="w-72 border-l border-border bg-card p-4 flex flex-col gap-4 overflow-y-auto flex-shrink-0">
          <div className="text-sm font-semibold">Place Order</div>
          <div className="flex rounded-lg overflow-hidden border border-border">
            <button onClick={() => setSide("buy")} className={cn("flex-1 py-2 text-sm font-semibold transition-colors", side === "buy" ? "bg-emerald-600 text-foreground" : "text-muted-foreground hover:text-foreground")}>Buy</button>
            <button onClick={() => setSide("sell")} className={cn("flex-1 py-2 text-sm font-semibold transition-colors", side === "sell" ? "bg-red-600 text-foreground" : "text-muted-foreground hover:text-foreground")}>Sell</button>
          </div>
          <div className="flex gap-1">
            {(["MARKET", "LIMIT"] as const).map((t) => (
              <button key={t} onClick={() => setOrderType(t)}
                className={cn("flex-1 py-1 text-xs rounded transition-colors", orderType === t ? "bg-blue-500/20 text-blue-400 font-semibold" : "text-muted-foreground hover:text-foreground")}>
                {t}
              </button>
            ))}
          </div>
          {selected && (
            <div className="bg-muted/30 rounded p-2 text-xs">
              <div className="font-bold">{selected.symbol}</div>
              <div className={cn("font-semibold", changePct >= 0 ? "text-emerald-400" : "text-red-400")}>
                {fmtPrice(ltp, 2, selected.quoteCurrency)} {fmtChange(changePct)}
              </div>
              <div className="text-muted-foreground mt-0.5">{selected.name}</div>
            </div>
          )}
          {selected && selected.maxLeverage > 1 && (
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Leverage: <span className="text-blue-400 font-bold">{leverage}×</span></label>
              <input type="range" min={1} max={selected.maxLeverage} value={leverage}
                onChange={(e) => setLeverage(Number(e.target.value))} className="w-full accent-blue-500" />
            </div>
          )}
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Quantity (shares)</label>
            <Input type="number" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0"
              className="bg-muted/30 border-white/20 text-sm h-9" />
          </div>
          {orderType === "LIMIT" && (
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Limit Price</label>
              <Input type="number" value={limitPrice} onChange={(e) => setLimitPrice(e.target.value)}
                placeholder={ltp.toFixed(2)} className="bg-muted/30 border-white/20 text-sm h-9" />
            </div>
          )}
          {notional > 0 && (
            <div className="bg-blue-500/10 border border-blue-500/20 rounded p-2 text-xs space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">Notional</span><span className="font-semibold">{fmtPrice(notional, 2, selected?.quoteCurrency ?? "INR")}</span></div>
              {selected && selected.maxLeverage > 1 && <div className="flex justify-between"><span className="text-muted-foreground">Margin</span><span>{fmtPrice(marginNeeded, 2, selected.quoteCurrency)}</span></div>}
            </div>
          )}
          {/* Angel One account status */}
          {user && (
            brokerActive ? (
              <div className={cn(
                "rounded-lg p-2.5 text-xs border",
                brokerSimulated
                  ? "bg-yellow-500/10 border-yellow-500/30"
                  : "bg-emerald-500/10 border-emerald-500/30",
              )}>
                <div className="flex items-center justify-between gap-1">
                  <div className="flex items-center gap-1.5">
                    <Link2 className={cn("w-3 h-3", brokerSimulated ? "text-yellow-400" : "text-emerald-400")} />
                    <span className={cn("font-semibold", brokerSimulated ? "text-yellow-300" : "text-emerald-300")}>
                      {brokerSimulated ? "Simulated" : "Live"} · {brokerAccount.angelClientId}
                    </span>
                  </div>
                  <Link href="/broker/onboarding" className="text-blue-400 hover:underline text-[10px]">Manage</Link>
                </div>
                {brokerSimulated && (
                  <div className="text-yellow-500/70 mt-1 text-[10px]">
                    Add SmartAPI key for live NSE orders →&nbsp;
                    <Link href="/broker/onboarding" className="text-blue-400 underline">Setup</Link>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
                <div className="text-xs font-semibold text-blue-300 mb-1 flex items-center gap-1.5">
                  <Link2 className="w-3 h-3" /> Connect Angel One
                </div>
                <div className="text-[11px] text-muted-foreground mb-2.5">
                  Link your Angel One demat account to trade NSE, BSE &amp; NASDAQ stocks as an Authorized Person.
                </div>
                <div className="flex gap-2">
                  <Link href="/broker/onboarding"
                    className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded bg-blue-500 hover:bg-blue-600 text-foreground text-xs font-bold transition-colors">
                    <Link2 className="w-3 h-3" /> Connect
                  </Link>
                  <Link href="/broker/onboarding"
                    className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded bg-muted/50 hover:bg-muted/60 text-foreground text-xs transition-colors">
                    Open Account <ChevronRight className="w-3 h-3" />
                  </Link>
                </div>
              </div>
            )
          )}

          {!user ? (
            <Button className="bg-blue-500 hover:bg-blue-600 text-foreground font-bold" asChild><a href="/login">Login to Trade</a></Button>
          ) : (
            <Button onClick={handlePlace} disabled={!selectedSymbol || !qty || placeMutation.isPending}
              className={cn("font-bold", side === "buy" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700")}>
              {placeMutation.isPending ? "Placing..." : `${side === "buy" ? "Buy" : "Sell"} ${selectedSymbol ?? ""}`}
            </Button>
          )}
          <div className="text-[10px] text-muted-foreground/60 flex items-start gap-1">
            <Info className="w-3 h-3 flex-shrink-0 mt-0.5" />
            <span>
              {brokerActive && !brokerSimulated
                ? `Live trading via Angel One · ${brokerAccount.angelClientId} · NSE/BSE`
                : "NSE/BSE stocks via Angel One AP. Connect your account for live execution."}
            </span>
          </div>
        </div>
      </div>
      <SuccessModal open={successData !== null} payload={successData} onClose={() => setSuccessData(null)} />
    </div>
  );
}
