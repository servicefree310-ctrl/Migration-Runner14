import { useEffect, useMemo, useState } from "react";
import {
  Calculator as CalcIcon, ArrowDownUp, TrendingUp, TrendingDown, Info, RotateCcw,
  IndianRupee, Percent, PiggyBank, Clock, Zap, Calendar,
} from "lucide-react";
import { PageHeader } from "@/components/premium/PageHeader";
import { SectionCard } from "@/components/premium/SectionCard";
import { PremiumStatCard } from "@/components/premium/PremiumStatCard";
import { StatusPill } from "@/components/premium/StatusPill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTickers } from "@/lib/marketSocket";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

type Side = "long" | "short";

const FEE_RATE = 0.001;

function fmt(n: number, dp = 2) {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-IN", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

function fmtINR(n: number) {
  if (!Number.isFinite(n)) return "—";
  if (n >= 10_000_000) return `₹${fmt(n / 10_000_000, 2)} Cr`;
  if (n >= 100_000) return `₹${fmt(n / 100_000, 2)} L`;
  return `₹${fmt(n, 2)}`;
}

function currencySymbol(pair: string): string {
  const quote = pair.split("/")[1] || "";
  if (quote === "INR") return "₹";
  if (quote === "USDT" || quote === "USDC" || quote === "USD") return "";
  if (quote === "BTC") return "₿";
  if (quote === "ETH") return "Ξ";
  return quote ? `${quote} ` : "₹";
}

// ── Investment Return Calculator ───────────────────────────────────────────

const PRESETS = [
  { label: "1 Day",    days: 1 },
  { label: "30 Days",  days: 30 },
  { label: "180 Days", days: 180 },
  { label: "1 Year",   days: 365 },
  { label: "5 Years",  days: 1825 },
];

function calcReturn(principal: number, annualRatePercent: number, days: number, compound: boolean): {
  interest: number; total: number; rateForPeriod: number;
} {
  if (!principal || !annualRatePercent || !days) return { interest: 0, total: principal, rateForPeriod: 0 };
  const r = annualRatePercent / 100;
  let total: number;
  if (compound) {
    total = principal * Math.pow(1 + r / 365, days);
  } else {
    total = principal * (1 + r * (days / 365));
  }
  const interest = total - principal;
  const rateForPeriod = (interest / principal) * 100;
  return { interest, total, rateForPeriod };
}

function ReturnRow({ label, days, principal, rate, compound }: {
  label: string; days: number; principal: number; rate: number; compound: boolean;
}) {
  const { interest, total, rateForPeriod } = useMemo(
    () => calcReturn(principal, rate, days, compound),
    [principal, rate, days, compound],
  );
  const hasValue = principal > 0 && rate > 0;
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-border/40 bg-muted/10 hover:bg-muted/20 transition-colors">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
          <Calendar className="h-3.5 w-3.5 text-amber-400" />
        </div>
        <div>
          <div className="text-sm font-semibold">{label}</div>
          <div className="text-[11px] text-muted-foreground">{days} {days === 1 ? "day" : "days"}</div>
        </div>
      </div>
      {hasValue ? (
        <div className="flex flex-col items-end gap-0.5 shrink-0">
          <div className="text-sm font-bold text-emerald-400">+{fmtINR(interest)}</div>
          <div className="text-[11px] text-muted-foreground">
            Total: <span className="text-foreground font-medium">{fmtINR(total)}</span>
          </div>
          <Badge className="text-[9px] bg-emerald-500/10 text-emerald-400 border-emerald-500/25 px-1.5 py-0">
            +{fmt(rateForPeriod, 2)}%
          </Badge>
        </div>
      ) : (
        <div className="text-sm text-muted-foreground/40">—</div>
      )}
    </div>
  );
}

function InvestmentCalculator() {
  const [principal, setPrincipal] = useState("10000");
  const [rate, setRate] = useState("12");
  const [compound, setCompound] = useState(true);
  const [customDays, setCustomDays] = useState("60");
  const [showCustom, setShowCustom] = useState(false);

  const p = parseFloat(principal) || 0;
  const r = parseFloat(rate) || 0;
  const cd = parseInt(customDays, 10) || 0;

  const customResult = useMemo(() => calcReturn(p, r, cd, compound), [p, r, cd, compound]);

  const reset = () => {
    setPrincipal("10000");
    setRate("12");
    setCompound(true);
    setCustomDays("60");
    setShowCustom(false);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PiggyBank className="h-5 w-5 text-amber-400" />
          <h3 className="font-semibold">Investment Return Calculator</h3>
        </div>
        <Button variant="ghost" size="sm" onClick={reset} className="h-7 text-xs text-muted-foreground">
          <RotateCcw className="h-3 w-3 mr-1" /> Reset
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">
            Invested Amount (₹)
          </Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">₹</span>
            <Input
              type="number"
              inputMode="decimal"
              value={principal}
              onChange={(e) => setPrincipal(e.target.value)}
              placeholder="10000"
              className="pl-7"
            />
          </div>
          <div className="flex gap-1 flex-wrap">
            {[1000, 5000, 10000, 50000, 100000].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setPrincipal(String(v))}
                className="text-[10px] px-1.5 py-0.5 rounded border border-border/50 hover:border-amber-500/50 text-muted-foreground hover:text-amber-400 transition-colors"
              >
                {v >= 100000 ? "1L" : v >= 1000 ? `${v / 1000}k` : v}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">
            Annual Return Rate (%)
          </Label>
          <div className="relative">
            <Input
              type="number"
              inputMode="decimal"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              placeholder="12"
              className="pr-7"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
          </div>
          <div className="flex gap-1 flex-wrap">
            {[5, 8, 12, 18, 24, 36].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setRate(String(v))}
                className="text-[10px] px-1.5 py-0.5 rounded border border-border/50 hover:border-amber-500/50 text-muted-foreground hover:text-amber-400 transition-colors"
              >
                {v}%
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">
            Interest Type
          </Label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setCompound(true)}
              className={`h-10 rounded-md text-xs font-semibold border transition flex items-center justify-center gap-1.5 ${
                compound
                  ? "bg-amber-500/15 text-amber-400 border-amber-500/40"
                  : "bg-muted/40 text-muted-foreground border-border hover:text-foreground"
              }`}
            >
              <Zap className="h-3.5 w-3.5" /> Compound
            </button>
            <button
              type="button"
              onClick={() => setCompound(false)}
              className={`h-10 rounded-md text-xs font-semibold border transition flex items-center justify-center gap-1.5 ${
                !compound
                  ? "bg-sky-500/15 text-sky-400 border-sky-500/40"
                  : "bg-muted/40 text-muted-foreground border-border hover:text-foreground"
              }`}
            >
              <TrendingUp className="h-3.5 w-3.5" /> Simple
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            {compound ? "Daily compounding (recommended for crypto)" : "Simple interest (flat rate)"}
          </p>
        </div>
      </div>

      <Separator />

      <div className="space-y-2.5">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold flex items-center gap-1.5">
          <Clock className="h-3 w-3" /> Returns by Time Period
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {PRESETS.map((preset) => (
            <ReturnRow
              key={preset.days}
              label={preset.label}
              days={preset.days}
              principal={p}
              rate={r}
              compound={compound}
            />
          ))}

          {/* Custom period row */}
          <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-dashed border-amber-500/30 bg-amber-500/5">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-8 w-8 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0">
                <CalcIcon className="h-3.5 w-3.5 text-amber-400" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-amber-400">Custom</div>
                {showCustom ? (
                  <div className="flex items-center gap-1 mt-0.5">
                    <Input
                      type="number"
                      inputMode="numeric"
                      value={customDays}
                      onChange={(e) => setCustomDays(e.target.value)}
                      className="h-6 w-20 text-xs px-2 py-0"
                      placeholder="days"
                    />
                    <span className="text-[11px] text-muted-foreground">days</span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowCustom(true)}
                    className="text-[11px] text-amber-400/70 hover:text-amber-400 underline"
                  >
                    Set custom days →
                  </button>
                )}
              </div>
            </div>
            {showCustom && p > 0 && r > 0 && cd > 0 ? (
              <div className="flex flex-col items-end gap-0.5 shrink-0">
                <div className="text-sm font-bold text-emerald-400">+{fmtINR(customResult.interest)}</div>
                <div className="text-[11px] text-muted-foreground">
                  Total: <span className="text-foreground font-medium">{fmtINR(customResult.total)}</span>
                </div>
                <Badge className="text-[9px] bg-emerald-500/10 text-emerald-400 border-emerald-500/25 px-1.5 py-0">
                  +{fmt(customResult.rateForPeriod, 2)}%
                </Badge>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground/40">—</div>
            )}
          </div>
        </div>
      </div>

      {p > 0 && r > 0 && (
        <div className="rounded-lg bg-muted/20 border border-border/40 p-3 flex items-start gap-2">
          <Info className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Calculation: <span className="font-medium text-foreground">₹{fmt(p, 0)}</span> invested at{" "}
            <span className="font-medium text-foreground">{r}% per year</span> with{" "}
            <span className="font-medium text-foreground">{compound ? "daily compounding" : "simple interest"}</span>.
            Yeh estimate hai — actual returns market performance par depend karte hain.
          </p>
        </div>
      )}
    </div>
  );
}

// ── P&L Calculator ─────────────────────────────────────────────────────────

export default function CalculatorPage() {
  const tickers = useTickers();
  const symbols = useMemo(
    () => Object.keys(tickers).filter((s) => tickers[s]?.lastPrice > 0).sort(),
    [tickers],
  );

  const [pair, setPair] = useState<string>("");
  const [side, setSide] = useState<Side>("long");
  const [leverage, setLeverage] = useState<number>(1);
  const [entry, setEntry] = useState<string>("");
  const [exit, setExit] = useState<string>("");
  const [size, setSize] = useState<string>("1000");

  useEffect(() => {
    if (!pair && symbols.length) {
      const pick = symbols.find((s) => s.includes("BTC")) || symbols[0];
      setPair(pick);
    }
  }, [symbols, pair]);

  useEffect(() => {
    if (pair && tickers[pair]?.lastPrice && !entry) {
      const p = tickers[pair].lastPrice;
      setEntry(p.toFixed(p < 1 ? 6 : 2));
      setExit((p * 1.05).toFixed(p < 1 ? 6 : 2));
    }
  }, [pair, tickers, entry]);

  const live = pair ? tickers[pair]?.lastPrice ?? 0 : 0;
  const sym = currencySymbol(pair);

  const calc = useMemo(() => {
    const e = parseFloat(entry);
    const x = parseFloat(exit);
    const s = parseFloat(size);
    if (!e || !x || !s || e <= 0 || x <= 0 || s <= 0) return null;

    const positionValue = s * leverage;
    const qty = positionValue / e;
    const direction = side === "long" ? 1 : -1;
    const pnl = (x - e) * qty * direction;
    const margin = s;
    const roi = (pnl / margin) * 100;
    const fees = positionValue * FEE_RATE * 2;
    const netPnl = pnl - fees;
    const netRoi = (netPnl / margin) * 100;

    const liq =
      leverage > 1
        ? side === "long"
          ? e * (1 - 1 / leverage)
          : e * (1 + 1 / leverage)
        : null;

    return { qty, positionValue, pnl, roi, fees, netPnl, netRoi, liq };
  }, [entry, exit, size, leverage, side]);

  const reset = () => {
    setSide("long");
    setLeverage(1);
    setEntry("");
    setExit("");
    setSize("1000");
  };

  const useLivePrice = () => {
    if (live > 0) setEntry(live.toFixed(live < 1 ? 6 : 2));
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl space-y-6">
      <PageHeader
        eyebrow="Tools"
        title="Calculator"
        description="P&L calculator for trading aur investment return calculator — dono ek jagah."
        actions={
          <Button variant="outline" size="sm" onClick={reset}>
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Reset P&L
          </Button>
        }
      />

      {/* ── Investment Return Calculator ── */}
      <SectionCard className="p-5">
        <InvestmentCalculator />
      </SectionCard>

      <Separator className="my-2" />

      {/* ── P&L Calculator ── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <SectionCard className="lg:col-span-3 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <CalcIcon className="h-5 w-5 text-amber-400" />
            <h3 className="font-semibold">Trade P&L Calculator</h3>
            <Badge variant="outline" className="text-[10px] ml-auto">Futures / Spot</Badge>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Trading Pair</Label>
              <Select value={pair} onValueChange={setPair}>
                <SelectTrigger>
                  <SelectValue placeholder={symbols.length ? "Select pair" : "Loading…"} />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {symbols.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s} <span className="text-muted-foreground ml-1">{currencySymbol(s)}{fmt(tickers[s]?.lastPrice ?? 0, 2)}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {live > 0 && (
                <button type="button" onClick={useLivePrice} className="text-[11px] text-amber-400 hover:underline mt-1">
                  Use live price ({sym}{fmt(live, live < 1 ? 6 : 2)})
                </button>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Direction</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSide("long")}
                  className={`h-10 rounded-md text-sm font-semibold transition flex items-center justify-center gap-1.5 ${
                    side === "long"
                      ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/40"
                      : "bg-muted/50 text-muted-foreground border border-border hover:text-foreground"
                  }`}
                >
                  <TrendingUp className="h-4 w-4" /> Long
                </button>
                <button
                  type="button"
                  onClick={() => setSide("short")}
                  className={`h-10 rounded-md text-sm font-semibold transition flex items-center justify-center gap-1.5 ${
                    side === "short"
                      ? "bg-rose-500/15 text-rose-400 border border-rose-500/40"
                      : "bg-muted/50 text-muted-foreground border border-border hover:text-foreground"
                  }`}
                >
                  <TrendingDown className="h-4 w-4" /> Short
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Entry Price ({sym})</Label>
              <Input type="number" inputMode="decimal" value={entry} onChange={(e) => setEntry(e.target.value)} placeholder="0.00" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Exit Price ({sym})</Label>
              <Input type="number" inputMode="decimal" value={exit} onChange={(e) => setExit(e.target.value)} placeholder="0.00" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Margin / Capital ({sym})</Label>
              <Input type="number" inputMode="decimal" value={size} onChange={(e) => setSize(e.target.value)} placeholder="1000" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Leverage</Label>
              <Select value={String(leverage)} onValueChange={(v) => setLeverage(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 5, 10, 20, 25, 50, 75, 100].map((l) => (
                    <SelectItem key={l} value={String(l)}>{l}× {l === 1 && "(Spot)"}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-3 flex items-start gap-2">
            <Info className="h-4 w-4 text-amber-400 mt-0.5 flex-shrink-0" />
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Fees ka calculation 0.10% maker/taker rate par based hai. Liquidation price simplified hai — actual depends on maintenance margin & funding.
            </p>
          </div>
        </SectionCard>

        <SectionCard className="lg:col-span-2 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold flex items-center gap-2">
              <ArrowDownUp className="h-5 w-5 text-amber-400" /> Result
            </h3>
            {calc && (
              <StatusPill variant={calc.netPnl >= 0 ? "success" : "danger"}>
                {calc.netPnl >= 0 ? "Profit" : "Loss"}
              </StatusPill>
            )}
          </div>

          {!calc ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Fill in all fields above to see the result.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3">
                <PremiumStatCard
                  title="Net P&L (after fees)"
                  value={`${calc.netPnl >= 0 ? "+" : ""}${sym}${fmt(calc.netPnl, 2)}`}
                  icon={IndianRupee}
                  hint={`Gross: ${calc.pnl >= 0 ? "+" : ""}${sym}${fmt(calc.pnl, 2)}`}
                  accent={calc.netPnl >= 0}
                />
                <PremiumStatCard
                  title="Net ROI"
                  value={`${calc.netRoi >= 0 ? "+" : ""}${fmt(calc.netRoi, 2)}%`}
                  icon={Percent}
                  hint={`Gross: ${calc.roi >= 0 ? "+" : ""}${fmt(calc.roi, 2)}%`}
                  accent={calc.netRoi >= 0}
                />
              </div>
              <div className="border-t border-border pt-3 space-y-2 text-sm">
                <Row label="Position Size" value={`${sym}${fmt(calc.positionValue, 2)}`} />
                <Row label="Quantity" value={fmt(calc.qty, calc.qty < 1 ? 6 : 4)} />
                <Row label="Estimated Fees" value={`${sym}${fmt(calc.fees, 2)}`} />
                {calc.liq && (
                  <Row label="Liquidation Price" value={`${sym}${fmt(calc.liq, calc.liq < 1 ? 6 : 2)}`} danger />
                )}
              </div>
            </>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

function Row({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-mono font-semibold ${danger ? "text-rose-400" : "text-foreground"}`}>{value}</span>
    </div>
  );
}
