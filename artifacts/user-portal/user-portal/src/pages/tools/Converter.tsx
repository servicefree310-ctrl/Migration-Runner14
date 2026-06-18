import { useMemo, useState } from "react";
import { ArrowDownUp, RefreshCw, TrendingUp, TrendingDown } from "lucide-react";
import { PageHeader } from "@/components/premium/PageHeader";
import { SectionCard } from "@/components/premium/SectionCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTickers, useInrRate } from "@/lib/marketSocket";
import { buildUsdRates } from "@/lib/volumeUsd";

function fmt(n: number, dp = 2) {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-IN", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

function dpFor(n: number) {
  if (n >= 1000) return 2;
  if (n >= 1) return 4;
  return 8;
}

export default function ConverterPage() {
  const tickers = useTickers();
  const liveInrRate = useInrRate(); // live USDT/INR rate from WebSocket

  // Build USD rate table for every base asset we can price
  const usdRates = useMemo(() => buildUsdRates(Object.values(tickers)), [tickers]);

  const assets = useMemo(() => {
    const set = new Set<string>(["USDT", "USD", "INR", "BTC", "ETH"]);
    Object.keys(usdRates).forEach((k) => set.add(k));
    return Array.from(set).sort();
  }, [usdRates]);

  const [from, setFrom] = useState<string>("BTC");
  const [to, setTo] = useState<string>("USDT");
  const [amount, setAmount] = useState<string>("1");

  // INR fallback: use live WebSocket rate; hardcoded 84 only if socket not yet ready
  const inrUsd = liveInrRate > 0 ? 1 / liveInrRate : 1 / 84;
  const fromUsd = usdRates[from] ?? (from === "USDT" || from === "USD" ? 1 : from === "INR" ? inrUsd : 0);
  const toUsd = usdRates[to] ?? (to === "USDT" || to === "USD" ? 1 : to === "INR" ? inrUsd : 0);

  const rate = fromUsd && toUsd ? fromUsd / toUsd : 0;
  const amt = parseFloat(amount) || 0;
  const result = amt * rate;

  // Find a direct ticker for change% display
  const directSymbol = useMemo(() => {
    const cands = [`${from}/${to}`, `${to}/${from}`, `${from}${to}`, `${to}${from}`];
    for (const c of cands) {
      const found = Object.keys(tickers).find(
        (s) => s.toUpperCase().replace(/[^A-Z0-9]/g, "") === c.toUpperCase().replace(/[^A-Z0-9]/g, ""),
      );
      if (found) return { sym: found, inverted: c.startsWith(to) };
    }
    return null;
  }, [from, to, tickers]);

  const change24h = directSymbol
    ? directSymbol.inverted
      ? -(tickers[directSymbol.sym]?.priceChangePercent ?? 0)
      : tickers[directSymbol.sym]?.priceChangePercent ?? 0
    : null;

  const swap = () => {
    setFrom(to);
    setTo(from);
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <PageHeader
        eyebrow="Tools"
        title="Currency Converter"
        description="Convert values between crypto and fiat — live rates with instant calculation."
      />

      <SectionCard className="p-6 space-y-5">
        {/* From */}
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">You Pay</Label>
          <div className="flex gap-2">
            <Input
              type="number"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="text-lg font-mono flex-1"
            />
            <Select value={from} onValueChange={setFrom}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {assets.map((a) => (
                  <SelectItem key={a} value={a}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex justify-center">
          <Button variant="outline" size="icon" onClick={swap} className="rounded-full h-10 w-10">
            <ArrowDownUp className="h-4 w-4" />
          </Button>
        </div>

        {/* To */}
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">You Get (Approx)</Label>
          <div className="flex gap-2">
            <div className="flex-1 h-10 rounded-md border border-border bg-muted/30 px-3 flex items-center font-mono text-lg">
              {result > 0 ? fmt(result, dpFor(result)) : "—"}
            </div>
            <Select value={to} onValueChange={setTo}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {assets.map((a) => (
                  <SelectItem key={a} value={a}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="border-t border-border pt-4 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" /> Exchange Rate
            </span>
            <span className="font-mono font-semibold">
              {rate > 0 ? `1 ${from} = ${fmt(rate, dpFor(rate))} ${to}` : "—"}
            </span>
          </div>
          {change24h !== null && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">24h Change</span>
              <span className={`font-mono font-semibold inline-flex items-center gap-1 ${
                change24h >= 0 ? "text-emerald-400" : "text-rose-400"
              }`}>
                {change24h >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                {change24h >= 0 ? "+" : ""}{change24h.toFixed(2)}%
              </span>
            </div>
          )}
          {fromUsd > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{from} → USDT</span>
              <span className="font-mono">{fmt(fromUsd, dpFor(fromUsd))} USDT</span>
            </div>
          )}
        </div>

        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Rates are indicative — actual execution price depends on order book depth and slippage. Conversion fee: 0.10%.
        </p>
      </SectionCard>

      {/* Quick presets */}
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { f: "BTC", t: "USDT", l: "BTC → USDT" },
          { f: "ETH", t: "USDT", l: "ETH → USDT" },
          { f: "USDT", t: "INR", l: "USDT → INR" },
          { f: "BTC", t: "INR", l: "BTC → INR" },
        ].map((p) => (
          <Button
            key={p.l}
            variant="outline"
            size="sm"
            onClick={() => { setFrom(p.f); setTo(p.t); }}
            className="text-xs"
          >
            {p.l}
          </Button>
        ))}
      </div>
    </div>
  );
}
