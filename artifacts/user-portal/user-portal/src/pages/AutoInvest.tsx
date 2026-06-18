import { useState, useRef, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post, patch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell,
} from "recharts";
import {
  TrendingUp, ArrowUpRight, ArrowDownRight,
  Zap, RefreshCw, PiggyBank, Activity, Shield,
  Brain, Play, Pause, Plus, Minus, Settings2, CheckCircle2,
  Info, Wallet, BarChart2, Clock, Infinity, AlertCircle, Bot,
  Sparkles, CalendarDays,
} from "lucide-react";

/* ─── Types ─────────────────────────────────────────────────────────────── */
interface Account {
  id: number; balance: number; totalDeposited: number; totalWithdrawn: number;
  totalEarned: number; dailyRatePct: number; status: string;
  createdAt: string; inrWalletBalance: number; inrRate: number;
}

interface Trade {
  id: number; pair: string; side: string; strategy: string;
  entryPrice: number; exitPrice: number; amountUsdt: number;
  pnlUsdt: number; pnlInr: number; pnlPct: number; isWin: boolean;
  openedAt: string; closedAt: string;
}

interface Summary {
  totalEarned: number; balance: number; pnl24h: number; trades24h: number;
  wins24h: number; losses24h: number; winRate24h: number;
  dailyRatePct: number; inrRate: number;
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */
function inrFmt(n: number, dp = 0) {
  return "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

/* ─── Animated counter ───────────────────────────────────────────────────── */
function useCountUp(target: number) {
  const val = useRef(target);
  val.current = target;
  return target;
}

/* ─── Pulsing dot ────────────────────────────────────────────────────────── */
function PulsingDot({ color = "#f59e0b" }: { color?: string }) {
  return (
    <span className="relative inline-flex w-2 h-2">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60" style={{ background: color }} />
      <span className="relative inline-flex rounded-full w-2 h-2" style={{ background: color }} />
    </span>
  );
}

/* ─── Trade Row ──────────────────────────────────────────────────────────── */
function TradeRow({ trade }: { trade: Trade }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border/30 last:border-0">
      {/* Pair + strategy */}
      <div className="flex items-center gap-2 w-[130px] shrink-0">
        <div className={`w-1.5 h-6 rounded-full shrink-0 ${trade.side === "buy" ? "bg-emerald-500" : "bg-rose-500"}`} />
        <div>
          <div className="text-[11px] font-bold text-white">{trade.pair}</div>
          <div className="text-[9px] text-muted-foreground truncate max-w-[110px]">{trade.strategy}</div>
        </div>
      </div>

      {/* Side badge */}
      <Badge className={`text-[9px] px-1.5 h-4 font-bold shrink-0 ${trade.side === "buy" ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : "bg-rose-500/20 text-rose-400 border-rose-500/30"}`}>
        {trade.side.toUpperCase()}
      </Badge>

      {/* Strategy */}
      <div className="flex-1 text-[10px] text-muted-foreground hidden sm:block truncate">
        {trade.strategy}
      </div>

      {/* PnL in INR */}
      <div className={`flex items-center gap-1 text-[12px] font-bold shrink-0 ${trade.isWin ? "text-emerald-400" : "text-rose-400"}`}>
        {trade.isWin ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
        {trade.isWin ? "+" : ""}{inrFmt(trade.pnlInr, 2)}
      </div>

      {/* Time */}
      <div className="text-[10px] text-muted-foreground shrink-0 w-[55px] text-right">
        {timeAgo(trade.closedAt)}
      </div>
    </div>
  );
}

/* ─── Growth Projection ──────────────────────────────────────────────────── */
function GrowthProjection({ balance, dailyRatePct }: { balance: number; dailyRatePct: number }) {
  const [customYears, setCustomYears] = useState("");

  const annualRatePct = dailyRatePct * 365;

  function project(years: number): number {
    return balance * (1 + (annualRatePct / 100) * years);
  }

  // Build data points for 10 years (every 6 months)
  const chartData = useMemo(() => {
    const points: { month: string; value: number }[] = [];
    for (let m = 0; m <= 120; m += 6) {
      const years = (m * 30.44) / 365;
      const label = m === 0 ? "Now"
        : m < 12 ? `${m}M`
        : m % 12 === 0 ? `${m / 12}Y`
        : `${Math.floor(m / 12)}Y${m % 12}M`;
      points.push({ month: label, value: +(balance * (1 + (annualRatePct / 100) * years)).toFixed(0) });
    }
    return points;
  }, [balance, annualRatePct]);

  const proj1Y  = project(1);
  const proj10Y = project(10);

  const gain1Y  = proj1Y  - balance;
  const gain10Y = proj10Y - balance;
  const pct1Y   = balance > 0 ? (gain1Y  / balance) * 100 : 0;
  const pct10Y  = balance > 0 ? (gain10Y / balance) * 100 : 0;

  const customYearsNum = parseFloat(customYears) || 0;
  const projCustom  = customYearsNum > 0 ? project(customYearsNum) : 0;
  const gainCustom  = projCustom - balance;
  const pctCustom   = balance > 0 && projCustom > 0 ? (gainCustom / balance) * 100 : 0;

  const fmt = (n: number) => {
    if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(2)} Cr`;
    if (n >= 100_000)   return `₹${(n / 100_000).toFixed(2)} L`;
    return "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  };

  const noBalance = balance <= 0;

  return (
    <div className="rounded-2xl border border-amber-500/20 bg-gradient-to-br from-card/80 to-card/50 backdrop-blur p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-amber-500/15 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <div className="text-sm font-bold text-white">Growth Projection</div>
            <div className="text-[11px] text-muted-foreground">
              {noBalance ? "Deposit karke dekhein kitna milega" : `${inrFmt(balance)} invested @ ${dailyRatePct.toFixed(2)}%/day`}
            </div>
          </div>
        </div>
        <Badge className="text-[10px] bg-sky-500/15 text-sky-400 border-sky-500/30">Average Return</Badge>
      </div>

      {noBalance ? (
        <div className="rounded-xl border border-dashed border-amber-500/30 bg-amber-500/5 p-6 text-center space-y-2">
          <PiggyBank className="w-8 h-8 text-amber-400/50 mx-auto" />
          <div className="text-sm text-muted-foreground">
            Pehle deposit karo — phir dekhein kitna badhega!
          </div>
          <div className="text-[11px] text-amber-400/70">
            Example: ₹10,000 @ {annualRatePct.toFixed(0)}%/year → 1 saal mein{" "}
            {fmt(10000 * (1 + annualRatePct / 100))}
          </div>
        </div>
      ) : (
        <>
          {/* 1Y and 10Y cards */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "1 Year", Icon: CalendarDays, total: proj1Y, gain: gain1Y, pct: pct1Y, accent: "#f59e0b" },
              { label: "10 Years", Icon: Sparkles,   total: proj10Y, gain: gain10Y, pct: pct10Y, accent: "#10b981" },
            ].map(({ label, Icon, total, gain, pct, accent }) => (
              <div
                key={label}
                className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-2"
              >
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Icon className="w-3.5 h-3.5" style={{ color: accent }} />
                  {label}
                </div>
                <div className="text-xl font-black text-white">{fmt(total)}</div>
                <div className="flex items-center justify-between text-[11px]">
                  <span style={{ color: accent }} className="font-semibold">
                    +{fmt(gain)} earned
                  </span>
                  <span className="text-muted-foreground">+{pct.toFixed(0)}%</span>
                </div>
              </div>
            ))}
          </div>

          {/* Custom year card */}
          <div className="rounded-xl border border-dashed border-indigo-500/40 bg-indigo-500/5 p-4">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2 shrink-0">
                <CalendarDays className="w-4 h-4 text-indigo-400" />
                <span className="text-sm font-semibold text-white">Custom Year</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0.5}
                    max={50}
                    step={0.5}
                    value={customYears}
                    onChange={(e) => setCustomYears(e.target.value)}
                    placeholder="Saal daalo…"
                    className="h-8 w-32 text-sm bg-white/5 border-white/20 text-white placeholder:text-muted-foreground pr-10"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">yr</span>
                </div>
                <div className="flex gap-1">
                  {[2, 3, 5, 15, 20].map((y) => (
                    <button
                      key={y}
                      type="button"
                      onClick={() => setCustomYears(String(y))}
                      className="text-[10px] px-2 py-1 rounded border border-indigo-500/30 hover:border-indigo-500/60 text-muted-foreground hover:text-indigo-300 transition-colors"
                    >
                      {y}Y
                    </button>
                  ))}
                </div>
              </div>
              {customYearsNum > 0 && projCustom > 0 ? (
                <div className="ml-auto flex items-center gap-4 shrink-0">
                  <div className="text-right">
                    <div className="text-lg font-black text-white">{fmt(projCustom)}</div>
                    <div className="text-[11px] text-indigo-400 font-semibold">+{fmt(gainCustom)} earned</div>
                  </div>
                  <Badge className="text-[10px] bg-indigo-500/15 text-indigo-400 border-indigo-500/30 shrink-0">
                    +{pctCustom.toFixed(0)}%
                  </Badge>
                </div>
              ) : (
                <div className="ml-auto text-[11px] text-muted-foreground/50">← saal daalo</div>
              )}
            </div>
          </div>

          {/* Growth chart */}
          <div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-widest mb-3 font-medium">
              10-Year Growth Curve (every 6 months)
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="growthGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#38bdf8" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                <XAxis dataKey="month" tick={{ fill: "#64748b", fontSize: 9 }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fill: "#64748b", fontSize: 9 }} axisLine={false} tickLine={false}
                  tickFormatter={(v) => v >= 100000 ? `${(v / 100000).toFixed(0)}L` : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
                />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }}
                  formatter={(v: any) => [fmt(Number(v)), "Average Return"]}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#38bdf8"
                  strokeWidth={2}
                  fill="url(#growthGrad)"
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="flex items-start gap-2 rounded-xl bg-white/5 border border-white/10 p-3">
            <Info className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Average return: {annualRatePct.toFixed(0)}% saal ka average rate se projection — yeh ek estimate hai actual returns vary kar sakte hain.
              {" "}Yeh projection current rate ({dailyRatePct.toFixed(2)}%/day) constant maankar hai.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

/* ─── Deposit / Withdraw Dialog ──────────────────────────────────────────── */
const MIN_DEPOSIT = 100;

function FundsDialog({ open, mode, account, onClose, onDone }: {
  open: boolean; mode: "deposit" | "withdraw";
  account: Account | null; onClose: () => void; onDone: () => void;
}) {
  const [amount, setAmount] = useState("");
  const num = parseFloat(amount) || 0;
  const max = mode === "deposit" ? Math.floor(account?.inrWalletBalance ?? 0) : Math.floor(account?.balance ?? 0);
  const min = mode === "deposit" ? MIN_DEPOSIT : 100;
  const isValid = num >= min && num <= max;

  const dailyEst = account ? num * account.dailyRatePct / 100 : 0;

  const mut = useMutation({
    mutationFn: (amt: number) => post(`/auto-invest/${mode}`, { amount: amt }),
    onSuccess: () => {
      toast.success(mode === "deposit"
        ? `${inrFmt(num)} deposited to Auto Invest`
        : `${inrFmt(num)} withdrawn to INR wallet`);
      setAmount("");
      onDone();
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="bg-[#0d1117] border-border/40 text-white max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mode === "deposit"
              ? <><Plus className="w-5 h-5 text-emerald-400" /> Deposit from INR Wallet</>
              : <><Minus className="w-5 h-5 text-rose-400" /> Withdraw to INR Wallet</>}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm">
            {mode === "deposit"
              ? `Min ₹${MIN_DEPOSIT.toLocaleString("en-IN")} · Available: ${inrFmt(account?.inrWalletBalance ?? 0)}`
              : `Available: ${inrFmt(account?.balance ?? 0)}`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold">₹</span>
              <Input
                type="number" min={min} max={max} step="100"
                value={amount} onChange={e => setAmount(e.target.value)}
                placeholder={`Min ₹${MIN_DEPOSIT.toLocaleString("en-IN")}`}
                className="bg-white/5 border-white/10 text-white pl-7 pr-16"
              />
              <button
                onClick={() => setAmount(String(max))}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-amber-400 font-bold hover:text-amber-300"
              >MAX</button>
            </div>
          </div>

          {max > min && (
            <Slider
              min={min} max={max} step={100} value={[Math.max(min, Math.min(num, max))]}
              onValueChange={([v]) => setAmount(String(v))}
            />
          )}

          <div className="flex justify-between text-[11px] text-muted-foreground">
            <span>{inrFmt(min)} min</span>
            <span>{inrFmt(max)} max</span>
          </div>

          {mode === "deposit" && num >= MIN_DEPOSIT && (
            <div className="text-[11px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
              Est. daily earnings: <strong>{inrFmt(dailyEst, 2)} – {inrFmt(dailyEst * 1.33, 2)}</strong> per day
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" className="border-white/10" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!isValid || mut.isPending}
            onClick={() => mut.mutate(num)}
            className={mode === "deposit" ? "bg-emerald-500 hover:bg-emerald-600 text-white font-bold" : "bg-rose-500 hover:bg-rose-600 text-white font-bold"}
          >
            {mut.isPending && <RefreshCw className="w-4 h-4 animate-spin mr-1" />}
            {mode === "deposit" ? `Deposit ${num > 0 ? inrFmt(num) : ""}` : `Withdraw ${num > 0 ? inrFmt(num) : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────────────── */
export default function AutoInvest() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [fundsMode, setFundsMode] = useState<"deposit" | "withdraw" | null>(null);

  const accountQ = useQuery<Account>({
    queryKey: ["auto-invest-account"],
    queryFn:  () => get<Account>("/auto-invest/account"),
    enabled:  !!user,
    refetchInterval: 15_000,
  });

  const tradesQ = useQuery<Trade[]>({
    queryKey: ["auto-invest-trades"],
    queryFn:  () => get<Trade[]>("/auto-invest/trades?limit=100"),
    enabled:  !!user,
    refetchInterval: 10_000,
  });

  const summaryQ = useQuery<Summary>({
    queryKey: ["auto-invest-summary"],
    queryFn:  () => get<Summary>("/auto-invest/summary"),
    enabled:  !!user,
    refetchInterval: 15_000,
  });

  const acct    = accountQ.data;
  const trades  = tradesQ.data ?? [];
  const summary = summaryQ.data;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["auto-invest-account"] });
    qc.invalidateQueries({ queryKey: ["auto-invest-trades"] });
    qc.invalidateQueries({ queryKey: ["auto-invest-summary"] });
  };

  const toggleMut = useMutation({
    mutationFn: (status: string) => patch("/auto-invest/settings", { status }),
    onSuccess: () => { invalidate(); toast.success("Updated"); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  /* ── Earnings chart ── */
  const earningsChart = useMemo(() => {
    const sorted = [...trades].sort((a, b) => new Date(a.closedAt).getTime() - new Date(b.closedAt).getTime());
    let cum = 0;
    return sorted.slice(-20).map(t => {
      cum += t.pnlInr;
      return {
        time: new Date(t.closedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
        cumPnl: +cum.toFixed(2),
      };
    });
  }, [trades]);

  /* ── Per-pair P&L ── */
  const pairPnl = useMemo(() => {
    const map: Record<string, number> = {};
    for (const t of trades) map[t.pair] = (map[t.pair] ?? 0) + t.pnlInr;
    return Object.entries(map)
      .map(([pair, pnl]) => ({ pair: pair.replace("/USDT", ""), pnl }))
      .sort((a, b) => b.pnl - a.pnl)
      .slice(0, 8);
  }, [trades]);

  const isActive  = acct?.status === "active";
  const hasBalance = (acct?.balance ?? 0) >= MIN_DEPOSIT;

  const dailyEstLow  = (acct?.balance ?? 0) * (acct?.dailyRatePct ?? 0.75) / 100;
  const dailyEstHigh = dailyEstLow * 1.33;

  return (
    <div className="relative min-h-screen">
      {/* Background glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-32 -left-20 w-[500px] h-[500px] rounded-full blur-3xl" style={{ background: "#f59e0b", opacity: 0.04 }} />
        <div className="absolute top-1/3 -right-32 w-[400px] h-[400px] rounded-full blur-3xl" style={{ background: "#10b981", opacity: 0.04 }} />
      </div>

      <div className="relative z-10 container mx-auto px-4 py-6 max-w-7xl space-y-6">

        {/* ── Hero Card ── */}
        <div className="relative rounded-3xl border border-amber-500/20 bg-gradient-to-br from-card/90 to-card/60 backdrop-blur overflow-hidden p-6 sm:p-8">
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-500/50 to-transparent" />
            <div className="absolute -top-20 left-1/4 w-72 h-72 rounded-full blur-3xl" style={{ background: "#f59e0b", opacity: 0.07 }} />
          </div>

          <div className="relative flex flex-col lg:flex-row items-start justify-between gap-6">
            {/* Left — title + pills */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-3">
                {isActive && hasBalance
                  ? <><PulsingDot color="#10b981" /><span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">AI Active</span></>
                  : <><div className="w-2 h-2 rounded-full bg-amber-500" /><span className="text-[10px] font-bold text-amber-400 uppercase tracking-widest">Auto Invest</span></>
                }
              </div>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
                  <Brain className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">Auto Invest</h1>
                  <p className="text-muted-foreground text-sm">Deposit ₹ · AI trades every 1–10 min · Earn daily returns</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mt-4">
                {[
                  { icon: <Infinity className="w-3 h-3" />, text: "0.5–1% daily returns" },
                  { icon: <Bot className="w-3 h-3" />, text: "AI-powered trading" },
                  { icon: <Shield className="w-3 h-3" />, text: "Cancel anytime" },
                  { icon: <PiggyBank className="w-3 h-3" />, text: "INR wallet deposit only" },
                ].map(f => (
                  <span key={f.text} className="flex items-center gap-1.5 text-[11px] text-muted-foreground bg-muted/30 border border-border/40 rounded-full px-3 py-1">
                    {f.icon} {f.text}
                  </span>
                ))}
              </div>
            </div>

            {/* Right — balance card */}
            <div className="w-full lg:w-auto shrink-0">
              <div className="rounded-2xl bg-white/5 border border-white/10 p-5 min-w-[260px]">
                <div className="text-[11px] text-muted-foreground mb-1 flex items-center gap-1.5">
                  <Wallet className="w-3 h-3" /> Investment Balance
                </div>
                <div className="text-3xl font-black text-white mb-1">
                  {inrFmt(acct?.balance ?? 0)}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  INR Wallet: <span className="text-white font-medium">{inrFmt(acct?.inrWalletBalance ?? 0)}</span>
                </div>

                {/* Daily rate */}
                <div className="mt-3 flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2.5 py-0.5">
                    <TrendingUp className="w-3 h-3" /> {(acct?.dailyRatePct ?? 0.75).toFixed(2)}% / day
                  </span>
                  {hasBalance && (
                    <span className="text-[10px] text-muted-foreground">
                      ≈ {inrFmt(dailyEstLow, 0)}–{inrFmt(dailyEstHigh, 0)}/day
                    </span>
                  )}
                </div>

                {/* Buttons */}
                <div className="flex gap-2 mt-4">
                  <Button
                    size="sm"
                    className="flex-1 bg-amber-500 hover:bg-amber-600 text-black font-bold gap-1.5 h-8"
                    onClick={() => setFundsMode("deposit")}
                  >
                    <Plus className="w-3.5 h-3.5" /> Deposit ₹
                  </Button>
                  <Button
                    size="sm" variant="outline"
                    className="flex-1 border-white/10 text-white hover:bg-white/5 gap-1.5 h-8"
                    onClick={() => setFundsMode("withdraw")}
                    disabled={!hasBalance}
                  >
                    <Minus className="w-3.5 h-3.5" /> Withdraw
                  </Button>
                </div>

                {hasBalance && (
                  <Button
                    size="sm" variant="outline"
                    className={`w-full mt-2 h-8 gap-1.5 text-xs border-white/10 ${isActive ? "hover:bg-amber-500/10 hover:text-amber-400" : "hover:bg-emerald-500/10 hover:text-emerald-400"}`}
                    onClick={() => toggleMut.mutate(isActive ? "paused" : "active")}
                    disabled={toggleMut.isPending}
                  >
                    {isActive ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    {isActive ? "Pause AI" : "Resume AI"}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Stat Row ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              label: "Total Earned", icon: <span className="text-emerald-400 font-black text-sm">₹</span>,
              value: inrFmt(summary?.totalEarned ?? 0), sub: "All time",
            },
            {
              label: "24h P&L", icon: <Activity className="w-4 h-4 text-amber-400" />,
              value: `${(summary?.pnl24h ?? 0) >= 0 ? "+" : ""}${inrFmt(summary?.pnl24h ?? 0)}`,
              sub: `${summary?.trades24h ?? 0} trades`,
              color: (summary?.pnl24h ?? 0) >= 0 ? "#10b981" : "#f43f5e",
            },
            {
              label: "Win Rate", icon: <BarChart2 className="w-4 h-4 text-indigo-400" />,
              value: `${(summary?.winRate24h ?? 0).toFixed(1)}%`,
              sub: `${summary?.wins24h ?? 0}W / ${summary?.losses24h ?? 0}L`,
            },
            {
              label: "Daily Rate", icon: <Zap className="w-4 h-4 text-amber-400" />,
              value: `${(acct?.dailyRatePct ?? 0.75).toFixed(2)}%`,
              sub: `≈ ${((acct?.dailyRatePct ?? 0.75) * 365 / 100).toFixed(0)}% APY`,
            },
          ].map(s => (
            <div key={s.label} className="rounded-2xl border border-border/40 bg-card/60 backdrop-blur p-4">
              <div className="flex items-center gap-2 mb-2 text-[11px] text-muted-foreground">
                {s.icon} {s.label}
              </div>
              <div className="text-xl font-black" style={s.color ? { color: s.color } : { color: "#fff" }}>
                {s.value}
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">{s.sub}</div>
            </div>
          ))}
        </div>

        {/* ── Growth Projection ── */}
        <GrowthProjection
          balance={acct?.balance ?? 0}
          dailyRatePct={acct?.dailyRatePct ?? 0.75}
        />

        {/* ── Main Tabs ── */}
        <Tabs defaultValue="live">
          <TabsList className="bg-white/5 border border-white/10 p-1 gap-1">
            <TabsTrigger value="live" className="data-[state=active]:bg-amber-500 data-[state=active]:text-black font-medium text-sm gap-1.5">
              <Activity className="w-4 h-4" /> Live Trades
            </TabsTrigger>
            <TabsTrigger value="analytics" className="data-[state=active]:bg-amber-500 data-[state=active]:text-black font-medium text-sm gap-1.5">
              <BarChart2 className="w-4 h-4" /> Analytics
            </TabsTrigger>
            <TabsTrigger value="settings" className="data-[state=active]:bg-amber-500 data-[state=active]:text-black font-medium text-sm gap-1.5">
              <Settings2 className="w-4 h-4" /> Settings
            </TabsTrigger>
          </TabsList>

          {/* ── LIVE TRADES ── */}
          <TabsContent value="live" className="mt-4">
            <div className="rounded-2xl border border-border/40 bg-card/60 backdrop-blur overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
                <div className="flex items-center gap-2">
                  <PulsingDot color="#10b981" />
                  <span className="text-sm font-semibold text-white">AI Trade Activity</span>
                  <Badge className="text-[9px] bg-emerald-500/15 text-emerald-400 border-emerald-500/30">{trades.length} trades</Badge>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <Clock className="w-3.5 h-3.5" /> Updates every 3 min
                </div>
              </div>

              {/* Headers */}
              <div className="flex items-center gap-3 px-4 py-2 border-b border-border/20 bg-white/2">
                <div className="w-[130px] shrink-0 text-[10px] text-muted-foreground font-medium">PAIR / SIDE</div>
                <div className="w-14 shrink-0" />
                <div className="flex-1 hidden sm:block text-[10px] text-muted-foreground font-medium">STRATEGY</div>
                <div className="text-[10px] text-muted-foreground font-medium">P&L (INR)</div>
                <div className="w-[55px] text-right text-[10px] text-muted-foreground font-medium">TIME</div>
              </div>

              {trades.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  {hasBalance ? (
                    <>
                      <Bot className="w-10 h-10 text-amber-400/50 mb-3" />
                      <div className="text-sm text-muted-foreground">AI warming up… first trade in ~3 min</div>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-10 h-10 text-amber-400/50 mb-3" />
                      <div className="text-sm font-semibold text-white mb-1">Deposit to start</div>
                      <div className="text-xs text-muted-foreground mb-4">Min ₹{MIN_DEPOSIT.toLocaleString("en-IN")} from your INR wallet</div>
                      <Button
                        size="sm"
                        className="bg-amber-500 hover:bg-amber-600 text-black font-bold gap-1.5"
                        onClick={() => setFundsMode("deposit")}
                      >
                        <Plus className="w-3.5 h-3.5" /> Deposit ₹
                      </Button>
                    </>
                  )}
                </div>
              ) : (
                <div className="max-h-[480px] overflow-y-auto">
                  {trades.map(t => <TradeRow key={t.id} trade={t} />)}
                </div>
              )}
            </div>
          </TabsContent>

          {/* ── ANALYTICS ── */}
          <TabsContent value="analytics" className="mt-4 space-y-4">
            {/* Cumulative P&L */}
            <div className="rounded-2xl border border-border/40 bg-card/60 backdrop-blur p-5">
              <div className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-400" /> Cumulative Earnings (₹)
              </div>
              {earningsChart.length > 2 ? (
                <ResponsiveContainer width="100%" height={180}>
                  <AreaChart data={earningsChart}>
                    <defs>
                      <linearGradient id="pnlGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                    <XAxis dataKey="time" tick={{ fill: "#64748b", fontSize: 9 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: "#64748b", fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={v => "₹" + v.toLocaleString("en-IN")} />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }}
                      formatter={(v: any) => ["₹" + Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2 }), "Earnings"]}
                    />
                    <Area type="monotone" dataKey="cumPnl" stroke="#10b981" strokeWidth={2} fill="url(#pnlGrad)" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[180px] flex items-center justify-center text-muted-foreground text-sm">
                  Not enough data yet — keep your AI running
                </div>
              )}
            </div>

            {/* Per-pair bar */}
            <div className="rounded-2xl border border-border/40 bg-card/60 backdrop-blur p-5">
              <div className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-amber-400" /> P&L by Pair (₹)
              </div>
              {pairPnl.length > 0 ? (
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={pairPnl} barSize={24}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                    <XAxis dataKey="pair" tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => "₹" + Math.round(v)} />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }}
                      formatter={(v: any) => [inrFmt(Number(v), 2), "P&L"]}
                    />
                    <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>
                      {pairPnl.map((entry, i) => (
                        <Cell key={i} fill={entry.pnl >= 0 ? "#10b981" : "#f43f5e"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[160px] flex items-center justify-center text-muted-foreground text-sm">No data yet</div>
              )}
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {[
                { label: "Total Deposited", value: inrFmt(acct?.totalDeposited ?? 0) },
                { label: "Total Withdrawn", value: inrFmt(acct?.totalWithdrawn ?? 0) },
                { label: "Total Earned",    value: inrFmt(summary?.totalEarned ?? 0), color: "#10b981" },
                { label: "All-time Trades", value: trades.length.toString() },
                { label: "Win Trades",      value: trades.filter(t => t.isWin).length.toString(), color: "#10b981" },
                { label: "Loss Trades",     value: trades.filter(t => !t.isWin).length.toString(), color: "#f43f5e" },
              ].map(s => (
                <div key={s.label} className="rounded-xl border border-border/40 bg-white/5 p-3">
                  <div className="text-[10px] text-muted-foreground mb-1">{s.label}</div>
                  <div className="text-base font-bold" style={s.color ? { color: s.color } : { color: "#fff" }}>{s.value}</div>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* ── SETTINGS ── */}
          <TabsContent value="settings" className="mt-4">
            <div className="rounded-2xl border border-border/40 bg-card/60 backdrop-blur p-5 space-y-6">
              <div className="pt-0 border-border/40 space-y-3">
                <div className="text-sm font-semibold text-white">Engine Status</div>
                <div className="flex items-center justify-between rounded-xl border border-border/40 p-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${isActive ? "bg-emerald-500/15" : "bg-amber-500/15"}`}>
                      {isActive ? <Play className="w-4 h-4 text-emerald-400" /> : <Pause className="w-4 h-4 text-amber-400" />}
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-white">
                        AI Engine: <span className={isActive ? "text-emerald-400" : "text-amber-400"}>{isActive ? "Running" : "Paused"}</span>
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {hasBalance ? "Trades every 1–10 minutes" : `Deposit min ₹${MIN_DEPOSIT.toLocaleString("en-IN")} to activate`}
                      </div>
                    </div>
                  </div>
                  <Switch
                    checked={isActive}
                    onCheckedChange={v => toggleMut.mutate(v ? "active" : "paused")}
                    disabled={!hasBalance || toggleMut.isPending}
                  />
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Funds dialog */}
      <FundsDialog
        open={!!fundsMode}
        mode={fundsMode ?? "deposit"}
        account={acct ?? null}
        onClose={() => setFundsMode(null)}
        onDone={() => { setFundsMode(null); invalidate(); }}
      />
    </div>
  );
}
