import { useEffect, useMemo, useState } from "react";
import { Sparkles, TrendingUp, TrendingDown, AlertTriangle, Brain, Activity } from "lucide-react";
import { PageHeader } from "@/components/premium/PageHeader";
import { SectionCard } from "@/components/premium/SectionCard";
import { PremiumStatCard } from "@/components/premium/PremiumStatCard";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTickers } from "@/lib/marketSocket";

type Scenario = "bull" | "neutral" | "bear";

// `direction` forces the projection sign (bull = up, bear = down, neutral = follows observed trend).
// `strength` scales the observed |24h move| as the per-day momentum estimate.
const SCENARIOS: { id: Scenario; label: string; direction: 1 | 0 | -1; strength: number; tone: string; icon: typeof TrendingUp }[] = [
  { id: "bull",    label: "Bullish", direction:  1, strength: 1.6, tone: "emerald", icon: TrendingUp },
  { id: "neutral", label: "Neutral", direction:  0, strength: 1.0, tone: "amber",   icon: Sparkles },
  { id: "bear",    label: "Bearish", direction: -1, strength: 1.0, tone: "rose",    icon: TrendingDown },
];

// Clamp price-floor at 1% of base and price-ceiling at 6× base to keep extrapolations sane.
function clampPrice(base: number, projected: number): number {
  return Math.min(Math.max(projected, base * 0.01), base * 6);
}

function fmt(n: number, dp = 2) {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-IN", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}
function dpFor(n: number) {
  if (n >= 1000) return 2;
  if (n >= 1) return 4;
  return 8;
}
function currencySymbol(pair: string): string {
  const quote = pair.split("/")[1] || "";
  if (quote === "INR") return "₹";
  if (quote === "USDT" || quote === "USDC" || quote === "USD") return "";
  if (quote === "BTC") return "₿";
  if (quote === "ETH") return "Ξ";
  return quote ? `${quote} ` : "₹";
}

export default function PredictionsPage() {
  const tickers = useTickers();
  const symbols = useMemo(
    () => Object.keys(tickers).filter((s) => tickers[s]?.lastPrice > 0).sort(),
    [tickers],
  );

  const [pair, setPair] = useState<string>("");
  const [scenario, setScenario] = useState<Scenario>("neutral");

  useEffect(() => {
    if (!pair && symbols.length) {
      setPair(symbols.find((s) => s.includes("BTC")) || symbols[0]);
    }
  }, [symbols, pair]);

  const t = pair ? tickers[pair] : null;
  const sc = SCENARIOS.find((s) => s.id === scenario)!;

  const projection = useMemo(() => {
    if (!t) return null;
    const base = t.lastPrice;
    const dailyChg = t.priceChangePercent / 100; // observed 24h move (signed)
    const momentum = Math.abs(dailyChg) * sc.strength; // unsigned magnitude per day
    // For neutral, follow the observed trend (signed dailyChg). For bull/bear, force direction.
    const adj = sc.direction === 0 ? dailyChg * sc.strength : sc.direction * momentum;

    const p24 = clampPrice(base, base * (1 + adj));
    const p7  = clampPrice(base, base * (1 + adj * 4));   // damped horizon scaling
    const p30 = clampPrice(base, base * (1 + adj * 10));
    return {
      base,
      p24, p7, p30,
      pct24: ((p24 - base) / base) * 100,
      pct7:  ((p7  - base) / base) * 100,
      pct30: ((p30 - base) / base) * 100,
    };
  }, [t, sc]);

  const sym = currencySymbol(pair);

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <PageHeader
        eyebrow="Tools"
        title="Price Predictions"
        description="Explore potential future crypto prices based on past trends. For educational simulation only."
      />

      <div className="rounded-md border border-rose-500/30 bg-rose-500/5 p-3 mb-4 flex items-start gap-2">
        <AlertTriangle className="h-5 w-5 text-rose-400 mt-0.5 flex-shrink-0" />
        <div>
          <div className="text-sm font-semibold text-rose-300">⚠️ This is NOT financial advice</div>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
            These predictions are a simple statistical projection (24 h trend × scenario multiplier). Crypto markets are highly volatile and unpredictable. Always do your own research before investing.
          </p>
        </div>
      </div>

      <SectionCard className="p-5 mb-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs uppercase tracking-wider text-muted-foreground">Asset</label>
            <Select value={pair} onValueChange={setPair}>
              <SelectTrigger>
                <SelectValue placeholder={symbols.length ? "Select pair" : "Loading…"} />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {symbols.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs uppercase tracking-wider text-muted-foreground">Market Scenario</label>
            <div className="grid grid-cols-3 gap-2">
              {SCENARIOS.map((s) => {
                const Icon = s.icon;
                const active = scenario === s.id;
                const bg = s.tone === "emerald"
                  ? active ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/40" : "bg-muted/30 text-muted-foreground border-border"
                  : s.tone === "rose"
                  ? active ? "bg-rose-500/15 text-rose-400 border-rose-500/40" : "bg-muted/30 text-muted-foreground border-border"
                  : active ? "bg-amber-500/15 text-amber-400 border-amber-500/40" : "bg-muted/30 text-muted-foreground border-border";
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setScenario(s.id)}
                    className={`h-10 rounded-md text-xs font-semibold border transition flex items-center justify-center gap-1 ${bg}`}
                  >
                    <Icon className="h-3.5 w-3.5" /> {s.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </SectionCard>

      {t && projection && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            <PremiumStatCard
              title="Current Price"
              value={`${sym}${fmt(projection.base, dpFor(projection.base))}`}
              icon={Activity}
              hint={`24h ${t.priceChangePercent >= 0 ? "+" : ""}${t.priceChangePercent.toFixed(2)}%`}
              accent={t.priceChangePercent >= 0}
            />
            <PremiumStatCard
              title="Trend Signal"
              value={sc.label}
              icon={Activity}
              hint={`Strength ${sc.strength.toFixed(1)}× • ${sc.direction === 0 ? "follows trend" : sc.direction > 0 ? "upward" : "downward"}`}
              accent={sc.tone !== "rose"}
            />
          </div>

          <SectionCard className="p-5">
            <h3 className="font-semibold flex items-center gap-2 mb-4">
              <Brain className="h-5 w-5 text-amber-400" /> Projected Prices ({sc.label})
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <ProjectionCard horizon="24 Hours" price={projection.p24} pct={projection.pct24} sym={sym} />
              <ProjectionCard horizon="7 Days" price={projection.p7} pct={projection.pct7} sym={sym} />
              <ProjectionCard horizon="30 Days" price={projection.p30} pct={projection.pct30} sym={sym} />
            </div>
            <div className="mt-4 text-[11px] text-muted-foreground leading-relaxed border-t border-border pt-3">
              <strong className="text-foreground">Method:</strong> Linear extrapolation of observed 24h price change, adjusted by scenario multiplier and damped over longer horizons. Real markets are non-linear — actual outcomes will differ significantly. Yeh sirf "what-if" exploration hai.
            </div>
          </SectionCard>
        </>
      )}
    </div>
  );
}

function ProjectionCard({ horizon, price, pct, sym }: { horizon: string; price: number; pct: number; sym: string }) {
  const positive = pct >= 0;
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-4">
      <div className="text-xs text-muted-foreground uppercase tracking-wider">{horizon}</div>
      <div className="text-xl font-bold font-mono mt-1">{sym}{fmt(price, dpFor(price))}</div>
      <div className={`text-xs font-semibold mt-1 inline-flex items-center gap-1 ${positive ? "text-emerald-400" : "text-rose-400"}`}>
        {positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
        {positive ? "+" : ""}{pct.toFixed(2)}%
      </div>
    </div>
  );
}
