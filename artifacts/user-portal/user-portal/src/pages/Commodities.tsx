import { useState, useEffect } from "react";
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
import { BarChart3, TrendingUp, TrendingDown, Info, Flame, Gem, Zap, Link2, ChevronRight, Clock } from "lucide-react";
import { Link } from "wouter";

type Instrument = {
  id: number; symbol: string; name: string; assetClass: string;
  exchange: string; quoteCurrency: string; currentPrice: string;
  change24h: string; high24h: string; low24h: string; volume24h: string;
  tradingEnabled: boolean; maxLeverage: number; marginRequired: string;
  takerFee: string; pricePrecision: number; sector: string | null;
  lotSize: string; minQty: string; qtyPrecision: number;
};

type Position = {
  id: number; symbol: string; name: string; side: string; qty: string;
  avgEntryPrice: number; currentPrice: number; unrealizedPnl: number;
  leverage: number; marginUsed: number; quoteCurrency: string; assetClass: string;
};

type OrderRow = {
  id: number; symbol: string; side: string; type: string;
  qty: string; filledQty: string; avgFillPrice: string | null;
  status: string; fee: string; createdAt: string; quoteCurrency: string; assetClass: string;
};

function fmtPrice(n: number, dp = 2, currency = "INR") {
  if (!isFinite(n) || n === 0) return "—";
  const prefix = currency === "INR" ? "₹" : "$";
  return prefix + n.toLocaleString("en-IN", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}
function fmtChange(n: number) { return (n >= 0 ? "+" : "") + n.toFixed(2) + "%"; }

const COMMODITY_ICONS: Record<string, typeof Gem> = {
  GOLD: Gem, SILVER: Gem,
  CRUDEOIL: Flame, NATURALGAS: Zap, COPPER: BarChart3,
};
const COMMODITY_COLORS: Record<string, string> = {
  "Precious Metals": "text-yellow-400",
  Energy: "text-orange-400",
  "Base Metals": "text-foreground/80",
};
const COMMODITY_SECTOR_BADGE: Record<string, string> = {
  "Precious Metals": "border-yellow-500/40 text-yellow-400",
  Energy: "border-orange-500/40 text-orange-400",
  "Base Metals": "border-gray-500/40 text-foreground/80",
};

function CommoditiesComingSoon() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  return (
    <div className="min-h-[calc(100vh-56px)] bg-background">
      <div className="max-w-xl mx-auto px-6 py-16 flex flex-col items-center text-center gap-8">
        <div className="relative">
          <div className="w-24 h-24 rounded-3xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
            <Gem className="w-10 h-10 text-amber-400" />
          </div>
          <div className="absolute -top-2 -right-2 px-2 py-1 rounded-full text-[10px] font-bold bg-amber-400/15 border border-amber-400/30 text-amber-400">SOON</div>
        </div>
        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-amber-400">Coming Soon</p>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight">Commodities</h1>
          <p className="text-muted-foreground leading-relaxed max-w-sm">Trade Gold, Silver, Crude Oil, Natural Gas and more — real-time commodity markets with MCX integration.</p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {["Gold · Silver · Platinum", "Crude Oil · Natural Gas", "MCX Integration", "Up to 10× Leverage", "INR Settlement"].map((f) => (
            <span key={f} className="px-3 py-1.5 rounded-full text-xs font-medium bg-amber-500/10 border border-amber-500/20 text-amber-400">{f}</span>
          ))}
        </div>
        <div className="w-full max-w-sm space-y-3">
          {submitted ? (
            <div className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-medium">
              ✓ You'll be notified when Commodities launches!
            </div>
          ) : (
            <div className="flex gap-2">
              <input type="email" placeholder="your@email.com" value={email} onChange={(e) => setEmail(e.target.value)}
                className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-amber-400/50" />
              <button onClick={() => { if (email) setSubmitted(true); }}
                className="px-4 py-2 rounded-lg bg-amber-500 text-white text-sm font-semibold hover:bg-amber-400 transition-colors">
                Notify Me
              </button>
            </div>
          )}
        </div>
        <div className="w-full max-w-sm space-y-3 text-left border border-border/50 rounded-xl p-4 bg-card/40">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-4">Roadmap</p>
          {[
            { q: "Q3 2025", label: "MCX API integration (paper mode)", done: false },
            { q: "Q4 2025", label: "Gold & Silver live pricing", done: false },
            { q: "Q1 2026", label: "Energy commodities (Crude, NG)", done: false },
            { q: "Q2 2026", label: "Full live trading + hedging", done: false },
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

export default function Commodities() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [successData, setSuccessData] = useState<GenericSuccess | null>(null);

  const COMING_SOON_COMMODITIES: boolean = true;
  if (COMING_SOON_COMMODITIES) {
    return <CommoditiesComingSoon />;
  }

  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [sector, setSector] = useState<string>("all");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [qty, setQty] = useState("");
  const [orderType, setOrderType] = useState<"MARKET" | "LIMIT">("MARKET");
  const [limitPrice, setLimitPrice] = useState("");
  const [leverage, setLeverage] = useState(5);
  const [activeTab, setActiveTab] = useState("chart");

  const { data: instrData, isLoading } = useQuery({
    queryKey: ["instruments", "commodity"],
    queryFn: () => get<{ instruments: Instrument[] }>("/instruments?assetClass=commodity"),
    refetchInterval: 15000,
  });

  const { data: posData } = useQuery({
    queryKey: ["instrument-positions"],
    queryFn: () => get<{ positions: Position[] }>("/instruments/positions"),
    enabled: !!user,
    refetchInterval: 10000,
  });

  const { data: orderData } = useQuery({
    queryKey: ["instrument-orders"],
    queryFn: () => get<{ orders: OrderRow[] }>("/instruments/orders"),
    enabled: !!user && activeTab === "orders",
  });

  const { data: quoteData } = useQuery({
    queryKey: ["instrument-quote", selectedSymbol],
    queryFn: () => get<{ quote: { ltp: number; open: number; high: number; low: number; changePct: number } }>(`/instruments/${selectedSymbol}/quote`),
    enabled: !!selectedSymbol,
    refetchInterval: 8000,
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
  const positions = posData?.positions?.filter((p) => p.assetClass === "commodity") ?? [];
  const orders = orderData?.orders?.filter((o) => o.assetClass === "commodity") ?? [];

  const sectors = ["all", ...Array.from(new Set(instruments.map((i) => i.sector ?? "Other")))];
  const filtered = instruments.filter((i) => sector === "all" || i.sector === sector);

  const selected = instruments.find((i) => i.symbol === selectedSymbol) ?? null;
  const quote = quoteData?.quote ?? null;
  const ltp = quote?.ltp ?? (selected ? Number(selected.currentPrice) : 0);
  const changePct = quote?.changePct ?? (selected ? Number(selected.change24h) : 0);

  useEffect(() => {
    if (!selectedSymbol && instruments.length > 0) setSelectedSymbol(instruments[0].symbol);
  }, [instruments, selectedSymbol]);

  const placeMutation = useMutation({
    mutationFn: (body: object) => post("/instruments/orders", body),
    onSuccess: () => {
      setSuccessData({
        kind: "generic", iconKind: "futures", accentColor: side === "buy" ? "#10b981" : "#f59e0b",
        title: "Order Placed",
        subtitle: "Your commodities order has been filled.",
        rows: [
          { label: "Symbol", value: selectedSymbol ?? "" },
          { label: "Side", value: side.toUpperCase(), accent: side === "buy" ? "#10b981" : "#f59e0b" },
          { label: "Quantity", value: `${qty} lots` },
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
        subtitle: "Your commodities position has been closed.",
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
  const Icon = selectedSymbol ? (COMMODITY_ICONS[selectedSymbol] ?? BarChart3) : BarChart3;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="border-b border-border bg-card px-4 py-3 flex items-center gap-3">
        <Gem className="w-5 h-5 text-yellow-400" />
        <span className="font-bold text-lg tracking-tight">Commodities</span>
        <div className="flex gap-1.5 ml-1">
          <Badge variant="outline" className="border-yellow-500/40 text-yellow-400 text-[10px]">Gold</Badge>
          <Badge variant="outline" className="border-yellow-500/40 text-yellow-400 text-[10px]">Silver</Badge>
          <Badge variant="outline" className="border-orange-500/40 text-orange-400 text-[10px]">Oil</Badge>
          <Badge variant="outline" className="border-gray-500/40 text-muted-foreground text-[10px]">MCX</Badge>
        </div>
        <div className="ml-auto text-xs text-muted-foreground flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse inline-block" />Live MCX
        </div>
      </div>

      <div className="flex h-[calc(100vh-112px)] overflow-hidden">
        {/* Sidebar */}
        <div className="w-60 border-r border-border bg-card flex flex-col">
          <div className="p-2 border-b border-border flex flex-wrap gap-1">
            {sectors.map((s) => (
              <button key={s} onClick={() => setSector(s)}
                className={cn("text-[11px] py-0.5 px-2 rounded transition-colors",
                  sector === s ? "bg-yellow-500/20 text-yellow-400 font-semibold" : "text-muted-foreground hover:text-foreground")}>
                {s === "all" ? "All" : s}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto">
            {isLoading ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="px-3 py-3 border-b border-border/40"><Skeleton className="h-4 w-20 mb-1" /><Skeleton className="h-3 w-28" /></div>
            )) : filtered.map((inst) => {
              const chg = Number(inst.change24h);
              const isUp = chg >= 0;
              const isActive = inst.symbol === selectedSymbol;
              const CIcon = COMMODITY_ICONS[inst.symbol] ?? BarChart3;
              return (
                <button key={inst.symbol} onClick={() => setSelectedSymbol(inst.symbol)}
                  className={cn("w-full px-3 py-3 border-b border-border/40 text-left hover:bg-muted/30 transition-colors",
                    isActive && "bg-yellow-500/10 border-l-2 border-l-yellow-500")}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CIcon className={cn("w-4 h-4", COMMODITY_COLORS[inst.sector ?? ""] ?? "text-muted-foreground")} />
                      <span className="text-[13px] font-bold">{inst.symbol}</span>
                    </div>
                    <span className={cn("text-[12px] font-medium", isUp ? "text-emerald-400" : "text-red-400")}>{fmtChange(chg)}</span>
                  </div>
                  <div className="flex justify-between mt-0.5 ml-6">
                    <span className="text-[11px] text-muted-foreground">{inst.exchange}</span>
                    <span className="text-[12px] tabular-nums">₹{Number(inst.currentPrice).toLocaleString("en-IN")}</span>
                  </div>
                  {inst.sector && (
                    <div className="ml-6 mt-0.5">
                      <span className={cn("text-[9px]", COMMODITY_COLORS[inst.sector] ?? "text-muted-foreground")}>{inst.sector}</span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Main */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {selected && (
            <div className="border-b border-border bg-card px-4 py-2.5 flex items-center gap-6 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center">
                  <Icon className="w-5 h-5 text-yellow-400" />
                </div>
                <div>
                  <div className="font-bold">{selected.symbol}</div>
                  <div className="text-xs text-muted-foreground">{selected.name}</div>
                </div>
              </div>
              <div>
                <div className={cn("text-2xl font-bold tabular-nums", changePct >= 0 ? "text-emerald-400" : "text-red-400")}>
                  ₹{ltp.toLocaleString("en-IN", { minimumFractionDigits: selected.pricePrecision, maximumFractionDigits: selected.pricePrecision })}
                </div>
                <div className={cn("text-xs", changePct >= 0 ? "text-emerald-400" : "text-red-400")}>{fmtChange(changePct)}</div>
              </div>
              <div className="text-xs space-y-0.5">
                <div className="text-muted-foreground">High <span className="text-foreground">₹{Number(selected.high24h).toLocaleString("en-IN")}</span></div>
                <div className="text-muted-foreground">Low <span className="text-foreground">₹{Number(selected.low24h).toLocaleString("en-IN")}</span></div>
              </div>
              <div className="text-xs">
                <div className="text-muted-foreground">Lot Size <span className="text-foreground">{selected.lotSize}</span></div>
                <div className="text-muted-foreground">Exchange <span className="text-foreground">{selected.exchange}</span></div>
              </div>
              {selected.sector && (
                <Badge variant="outline" className={cn("text-[10px]", COMMODITY_SECTOR_BADGE[selected.sector] ?? "")}>
                  {selected.sector}
                </Badge>
              )}
            </div>
          )}

          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
            <TabsList className="border-b border-border bg-transparent rounded-none px-4 flex-shrink-0 justify-start h-10">
              <TabsTrigger value="chart" className="data-[state=active]:border-b-2 data-[state=active]:border-yellow-400 rounded-none text-xs">Chart</TabsTrigger>
              <TabsTrigger value="positions" className="data-[state=active]:border-b-2 data-[state=active]:border-yellow-400 rounded-none text-xs">
                Positions {positions.length > 0 && <Badge className="ml-1 bg-yellow-500/20 text-yellow-400 text-[10px]">{positions.length}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="orders" className="data-[state=active]:border-b-2 data-[state=active]:border-yellow-400 rounded-none text-xs">Orders</TabsTrigger>
            </TabsList>

            <TabsContent value="chart" className="flex-1 overflow-auto m-0">
              <div className="h-64 bg-background border-b border-border flex items-center justify-center relative">
                <div className="text-center z-10">
                  <Gem className="w-10 h-10 text-yellow-400/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">MCX Live Chart</p>
                  <p className="text-xs text-muted-foreground/60">Connect Angel One API for live MCX data</p>
                </div>
                <div className="absolute bottom-0 left-0 right-0 h-40 flex items-end gap-0.5 px-4 pb-2 opacity-15">
                  {Array.from({ length: 60 }).map((_, i) => {
                    const h = 40 + Math.random() * 50;
                    const isUp = Math.random() > 0.45;
                    return <div key={i} style={{ height: `${h}%` }} className={cn("flex-1 rounded-sm", isUp ? "bg-yellow-500" : "bg-red-500")} />;
                  })}
                </div>
              </div>
              {selected && (
                <div className="p-4 grid grid-cols-3 gap-3 text-xs">
                  {[
                    ["Exchange", selected.exchange],
                    ["Lot Size", `${selected.lotSize} units`],
                    ["Max Leverage", `${selected.maxLeverage}×`],
                    ["Margin Req.", `${(Number(selected.marginRequired) * 100).toFixed(0)}%`],
                    ["Taker Fee", `${(Number(selected.takerFee) * 100).toFixed(3)}%`],
                    ["Tick Size", `₹${selected.pricePrecision === 0 ? "1" : "0.25"}`],
                  ].map(([label, val]) => (
                    <div key={label} className="bg-muted/30 rounded p-2">
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
                <div className="text-center py-12 text-muted-foreground text-sm">No open commodity positions</div>
              ) : (
                <div className="space-y-2">
                  {positions.map((p) => {
                    const pnl = Number(p.unrealizedPnl ?? 0);
                    return (
                      <div key={p.id} className="bg-muted/30 border border-border rounded-lg p-3 flex items-center gap-4">
                        <div>
                          <div className="font-bold text-sm">{p.symbol}</div>
                          <Badge variant="outline" className={cn("text-[10px] mt-0.5", p.side === "buy" ? "border-emerald-500/40 text-emerald-400" : "border-red-500/40 text-red-400")}>
                            {p.side.toUpperCase()} {p.leverage}×
                          </Badge>
                        </div>
                        <div className="text-xs space-y-0.5">
                          <div className="text-muted-foreground">Qty <span className="text-foreground">{p.qty}</span></div>
                          <div className="text-muted-foreground">Entry <span className="text-foreground">₹{Number(p.avgEntryPrice).toLocaleString("en-IN")}</span></div>
                        </div>
                        <div className="ml-auto text-right">
                          <div className={cn("font-bold", pnl >= 0 ? "text-emerald-400" : "text-red-400")}>
                            {pnl >= 0 ? "+" : ""}₹{pnl.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                          <div className="text-[10px] text-muted-foreground">Unrealized PnL</div>
                        </div>
                        <Button size="sm" variant="outline" className="border-red-500/40 text-red-400 hover:bg-red-500/10 text-xs h-7"
                          onClick={() => closeMutation.mutate(p.id)} disabled={closeMutation.isPending}>Close</Button>
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
                <div className="text-center py-12 text-muted-foreground text-sm">No commodity orders yet</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border text-muted-foreground">
                        <th className="text-left py-2 px-2">Symbol</th><th className="text-left py-2 px-2">Side</th>
                        <th className="text-right py-2 px-2">Qty</th><th className="text-right py-2 px-2">Fill Price</th>
                        <th className="text-left py-2 px-2">Status</th><th className="text-left py-2 px-2">Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders.map((o) => (
                        <tr key={o.id} className="border-b border-border/40">
                          <td className="py-2 px-2 font-medium">{o.symbol}</td>
                          <td className={cn("py-2 px-2 font-semibold", o.side === "buy" ? "text-emerald-400" : "text-red-400")}>{o.side.toUpperCase()}</td>
                          <td className="py-2 px-2 text-right">{o.filledQty}/{o.qty}</td>
                          <td className="py-2 px-2 text-right">{o.avgFillPrice ? `₹${Number(o.avgFillPrice).toLocaleString("en-IN")}` : "—"}</td>
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

        {/* Order Form */}
        <div className="w-72 border-l border-border bg-card p-4 flex flex-col gap-4 overflow-y-auto flex-shrink-0">
          <div className="text-sm font-semibold">Place Order</div>
          <div className="flex rounded-lg overflow-hidden border border-border">
            <button onClick={() => setSide("buy")} className={cn("flex-1 py-2 text-sm font-semibold transition-colors", side === "buy" ? "bg-emerald-600 text-foreground" : "text-muted-foreground hover:text-foreground")}>Buy</button>
            <button onClick={() => setSide("sell")} className={cn("flex-1 py-2 text-sm font-semibold transition-colors", side === "sell" ? "bg-red-600 text-foreground" : "text-muted-foreground hover:text-foreground")}>Sell</button>
          </div>
          <div className="flex gap-1">
            {(["MARKET", "LIMIT"] as const).map((t) => (
              <button key={t} onClick={() => setOrderType(t)} className={cn("flex-1 py-1 text-xs rounded transition-colors", orderType === t ? "bg-yellow-500/20 text-yellow-400 font-semibold" : "text-muted-foreground hover:text-foreground")}>{t}</button>
            ))}
          </div>
          {selected && (
            <div className="bg-muted/30 rounded p-2 text-xs">
              <div className="flex items-center gap-2">
                <Icon className={cn("w-4 h-4", COMMODITY_COLORS[selected.sector ?? ""] ?? "text-yellow-400")} />
                <span className="font-bold">{selected.name}</span>
              </div>
              <div className={cn("font-semibold mt-1", changePct >= 0 ? "text-emerald-400" : "text-red-400")}>
                ₹{ltp.toLocaleString("en-IN")} {fmtChange(changePct)}
              </div>
              <div className="text-muted-foreground mt-0.5">Lot: {selected.lotSize} · {selected.exchange}</div>
            </div>
          )}
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Leverage: <span className="text-yellow-400 font-bold">{leverage}×</span></label>
            <input type="range" min={1} max={selected?.maxLeverage ?? 25} value={leverage}
              onChange={(e) => setLeverage(Number(e.target.value))} className="w-full accent-yellow-500" />
            <div className="flex justify-between text-[10px] text-muted-foreground"><span>1×</span><span>{selected?.maxLeverage ?? 25}×</span></div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Quantity (lots)</label>
            <Input type="number" value={qty} onChange={(e) => setQty(e.target.value)} placeholder={`Min ${selected?.minQty ?? "1"}`}
              className="bg-muted/30 border-white/20 text-sm h-9" />
          </div>
          {orderType === "LIMIT" && (
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Limit Price (₹)</label>
              <Input type="number" value={limitPrice} onChange={(e) => setLimitPrice(e.target.value)}
                placeholder={ltp.toString()} className="bg-muted/30 border-white/20 text-sm h-9" />
            </div>
          )}
          {notional > 0 && (
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded p-2 text-xs space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">Notional</span><span className="font-semibold">₹{notional.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Margin</span><span>₹{marginNeeded.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span></div>
            </div>
          )}
          {/* Angel One account status */}
          {user && (
            brokerActive ? (
              <div className={cn(
                "rounded-lg p-2.5 text-xs border",
                brokerSimulated ? "bg-yellow-500/10 border-yellow-500/30" : "bg-emerald-500/10 border-emerald-500/30",
              )}>
                <div className="flex items-center justify-between gap-1">
                  <div className="flex items-center gap-1.5">
                    <Link2 className={cn("w-3 h-3", brokerSimulated ? "text-yellow-400" : "text-emerald-400")} />
                    <span className={cn("font-semibold", brokerSimulated ? "text-yellow-300" : "text-emerald-300")}>
                      {brokerSimulated ? "Simulated" : "Live"} · {brokerAccount.angelClientId}
                    </span>
                  </div>
                  <Link href="/broker/onboarding" className="text-yellow-400 hover:underline text-[10px]">Manage</Link>
                </div>
                {brokerSimulated && (
                  <div className="text-yellow-500/70 mt-1 text-[10px]">
                    Add SmartAPI key for live MCX orders →&nbsp;
                    <Link href="/broker/onboarding" className="text-yellow-400 underline">Setup</Link>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
                <div className="text-xs font-semibold text-yellow-300 mb-1 flex items-center gap-1.5">
                  <Link2 className="w-3 h-3" /> Connect Angel One
                </div>
                <div className="text-[11px] text-muted-foreground mb-2.5">
                  Link your Angel One account to trade MCX commodities — Gold, Silver, Crude Oil.
                </div>
                <div className="flex gap-2">
                  <Link href="/broker/onboarding"
                    className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded bg-yellow-500 hover:bg-yellow-600 text-black text-xs font-bold transition-colors">
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
            <Button className="bg-yellow-500 hover:bg-yellow-600 text-black font-bold" asChild><a href="/login">Login to Trade</a></Button>
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
                ? `Live MCX trading via Angel One · ${brokerAccount.angelClientId}`
                : "MCX commodity trading via Angel One AP. Connect for live execution."}
            </span>
          </div>
        </div>
      </div>
      <SuccessModal open={successData !== null} payload={successData} onClose={() => setSuccessData(null)} />
    </div>
  );
}
