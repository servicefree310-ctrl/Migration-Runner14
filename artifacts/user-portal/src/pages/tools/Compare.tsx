import { useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, TrendingUp, TrendingDown, Activity, Crown } from "lucide-react";
import { PageHeader } from "@/components/premium/PageHeader";
import { SectionCard } from "@/components/premium/SectionCard";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTickers } from "@/lib/marketSocket";
import { quoteVolUsd, buildUsdRates } from "@/lib/volumeUsd";

function fmt(n: number, dp = 2) {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-IN", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}
function currencySymbol(pair: string): string {
  const quote = pair.split("/")[1] || "";
  if (quote === "INR") return "₹";
  if (quote === "USDT" || quote === "USDC" || quote === "USD") return "";
  if (quote === "BTC") return "₿";
  if (quote === "ETH") return "Ξ";
  return quote ? `${quote} ` : "₹";
}
function fmtCompact(n: number) {
  if (!Number.isFinite(n) || n === 0) return "—";
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B USDT`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M USDT`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(2)}K USDT`;
  return `${n.toFixed(2)} USDT`;
}
function dpFor(n: number) {
  if (n >= 1000) return 2;
  if (n >= 1) return 4;
  return 8;
}

export default function ComparePage() {
  const tickers = useTickers();
  const symbols = useMemo(
    () => Object.keys(tickers).filter((s) => tickers[s]?.lastPrice > 0).sort(),
    [tickers],
  );
  const usdRates = useMemo(() => buildUsdRates(Object.values(tickers)), [tickers]);

  const [aSym, setASym] = useState<string>("");
  const [bSym, setBSym] = useState<string>("");

  useEffect(() => {
    if (!aSym && symbols.length) {
      setASym(symbols.find((s) => s.includes("BTC")) || symbols[0]);
    }
    if (!bSym && symbols.length) {
      setBSym(symbols.find((s) => s.includes("ETH")) || symbols[1] || symbols[0]);
    }
  }, [symbols, aSym, bSym]);

  const a = aSym ? tickers[aSym] : null;
  const b = bSym ? tickers[bSym] : null;

  type Row = {
    label: string;
    a: string;
    b: string;
    aTone?: "up" | "down";
    bTone?: "up" | "down";
    winner: "a" | "b" | null;
  };

  const rows = useMemo<Row[]>(() => {
    if (!a || !b) return [];
    const aVolUsd = quoteVolUsd(a, usdRates);
    const bVolUsd = quoteVolUsd(b, usdRates);
    return [
      {
        label: "Last Price",
        a: `${currencySymbol(aSym)}${fmt(a.lastPrice, dpFor(a.lastPrice))}`,
        b: `${currencySymbol(bSym)}${fmt(b.lastPrice, dpFor(b.lastPrice))}`,
        winner: null,
      },
      {
        label: "24h Change",
        a: `${a.priceChangePercent >= 0 ? "+" : ""}${a.priceChangePercent.toFixed(2)}%`,
        b: `${b.priceChangePercent >= 0 ? "+" : ""}${b.priceChangePercent.toFixed(2)}%`,
        aTone: a.priceChangePercent >= 0 ? "up" : "down",
        bTone: b.priceChangePercent >= 0 ? "up" : "down",
        winner: a.priceChangePercent > b.priceChangePercent ? "a" : a.priceChangePercent < b.priceChangePercent ? "b" : null,
      },
      {
        label: "24h High",
        a: `${currencySymbol(aSym)}${fmt(a.high, dpFor(a.high))}`,
        b: `${currencySymbol(bSym)}${fmt(b.high, dpFor(b.high))}`,
        winner: null,
      },
      {
        label: "24h Low",
        a: `${currencySymbol(aSym)}${fmt(a.low, dpFor(a.low))}`,
        b: `${currencySymbol(bSym)}${fmt(b.low, dpFor(b.low))}`,
        winner: null,
      },
      {
        label: "24h Volume",
        a: fmtCompact(aVolUsd),
        b: fmtCompact(bVolUsd),
        winner: aVolUsd > bVolUsd ? "a" : aVolUsd < bVolUsd ? "b" : null,
      },
      {
        label: "24h Range Width",
        a: `${(((a.high - a.low) / (a.low || 1)) * 100).toFixed(2)}%`,
        b: `${(((b.high - b.low) / (b.low || 1)) * 100).toFixed(2)}%`,
        winner: null,
      },
    ];
  }, [a, b, usdRates]);

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <PageHeader
        eyebrow="Tools"
        title="Crypto Compare"
        description="Side-by-side prices, change, and volume metrics — spot the best opportunity at a glance."
      />

      <SectionCard className="p-5 mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-end gap-3">
          <div className="space-y-1.5">
            <label className="text-xs uppercase tracking-wider text-muted-foreground">Asset A</label>
            <Select value={aSym} onValueChange={setASym}>
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
          <div className="hidden sm:flex h-10 items-end pb-1">
            <ArrowLeftRight className="h-5 w-5 text-amber-400" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs uppercase tracking-wider text-muted-foreground">Asset B</label>
            <Select value={bSym} onValueChange={setBSym}>
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
        </div>
      </SectionCard>

      {a && b ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <CompareCard symbol={aSym} ticker={a} accent="amber" />
          <CompareCard symbol={bSym} ticker={b} accent="violet" />

          <SectionCard className="lg:col-span-2 p-5">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <Activity className="h-5 w-5 text-amber-400" /> Head-to-Head
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="text-left py-2 pr-3 font-medium">Metric</th>
                    <th className="text-right py-2 px-3 font-medium">{aSym}</th>
                    <th className="text-right py-2 pl-3 font-medium">{bSym}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.label} className="border-t border-border">
                      <td className="py-2.5 pr-3 text-muted-foreground">{r.label}</td>
                      <td className={`py-2.5 px-3 text-right font-mono ${r.aTone === "up" ? "text-emerald-400" : r.aTone === "down" ? "text-rose-400" : ""}`}>
                        <span className="inline-flex items-center gap-1">
                          {r.winner === "a" && <Crown className="h-3 w-3 text-amber-400" />}
                          {r.a}
                        </span>
                      </td>
                      <td className={`py-2.5 pl-3 text-right font-mono ${r.bTone === "up" ? "text-emerald-400" : r.bTone === "down" ? "text-rose-400" : ""}`}>
                        <span className="inline-flex items-center gap-1">
                          {r.winner === "b" && <Crown className="h-3 w-3 text-amber-400" />}
                          {r.b}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-muted-foreground mt-3">
              Crown indicates the winner for that metric. This comparison uses historical data and is not a guarantee of future performance.
            </p>
          </SectionCard>
        </div>
      ) : (
        <SectionCard className="p-12 text-center text-sm text-muted-foreground">
          Loading market data…
        </SectionCard>
      )}
    </div>
  );
}

function CompareCard({
  symbol,
  ticker,
  accent,
}: {
  symbol: string;
  ticker: { lastPrice: number; priceChangePercent: number; high: number; low: number };
  accent: "amber" | "violet";
}) {
  const positive = ticker.priceChangePercent >= 0;
  const gradient = accent === "amber"
    ? "from-amber-500/15 via-amber-500/5 to-transparent"
    : "from-violet-500/15 via-violet-500/5 to-transparent";
  const dotColor = accent === "amber" ? "bg-amber-400" : "bg-violet-400";

  return (
    <div className={`relative overflow-hidden rounded-xl border border-border bg-gradient-to-br ${gradient} p-5`}>
      <div className="flex items-center gap-2 mb-2">
        <span className={`h-2 w-2 rounded-full ${dotColor}`} />
        <span className="text-sm font-semibold">{symbol}</span>
      </div>
      <div className="text-3xl font-bold font-mono">{currencySymbol(symbol)}{fmt(ticker.lastPrice, dpFor(ticker.lastPrice))}</div>
      <div className={`mt-1 text-sm font-semibold inline-flex items-center gap-1 ${positive ? "text-emerald-400" : "text-rose-400"}`}>
        {positive ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
        {positive ? "+" : ""}{ticker.priceChangePercent.toFixed(2)}% (24h)
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
        <div>
          <div className="text-muted-foreground">24h High</div>
          <div className="font-mono font-medium">{currencySymbol(symbol)}{fmt(ticker.high, dpFor(ticker.high))}</div>
        </div>
        <div>
          <div className="text-muted-foreground">24h Low</div>
          <div className="font-mono font-medium">{currencySymbol(symbol)}{fmt(ticker.low, dpFor(ticker.low))}</div>
        </div>
      </div>
    </div>
  );
}
