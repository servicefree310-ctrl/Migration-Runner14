import { useState, useMemo, useEffect, useRef } from "react";
import { useLocation, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { SuccessModal, type PlanSuccess } from "@/components/SuccessModal";
import {
  TrendingUp, Bot, DollarSign, Clock, Shield, Zap, Flame,
  ChevronRight, RefreshCw, BarChart2, Cpu, Target, Sparkles,
  Calendar, CheckCircle2, Activity, Lock,
  Star, Users, Play, Info, Award, Layers, Infinity,
  Receipt, FileText, ArrowUpRight, ArrowDownRight, Wifi,
  Brain, Network, TrendingDown, Eye, Gauge, ChevronDown,
  CircleDollarSign, Banknote,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell, PieChart, Pie,
  LineChart, Line, RadarChart, Radar, PolarGrid, PolarAngleAxis,
} from "recharts";

/* ─── Types ─────────────────────────────────────────────────────────────── */

interface Plan {
  id: number; name: string; description?: string;
  dailyReturnPercent: number; minInvestment: number; maxInvestment: number;
  durationDays: number; riskLevel: "low" | "medium" | "high" | "ultra";
  isActive: boolean; totalInvestors: number;
}

interface Subscription {
  id: number; planId: number; planName: string; riskLevel: string;
  investedAmount: number; currentValue: number; startedAt: string;
  expiresAt: string | null; noExpire: boolean; durationDays: number;
  dailyReturnPercent: number; status: "active" | "completed" | "cancelled";
  totalEarned: number; dailyReturn: number;
}

interface Earning {
  id: number; subscriptionId: number; planName: string;
  amountUsdt: number; creditedAt: string;
}

/* ─── Constants ─────────────────────────────────────────────────────────── */

const RISK = {
  low: {
    label: "Conservative", color: "#10b981", glow: "rgba(16,185,129,0.2)",
    bg: "bg-emerald-500/10", border: "border-emerald-500/30", text: "text-emerald-400",
    gradient: "from-emerald-500 to-teal-400", icon: <Shield className="w-4 h-4" />,
    badge: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    strategy: "Delta-neutral market making with dynamic hedging",
  },
  medium: {
    label: "Moderate", color: "#f59e0b", glow: "rgba(245,158,11,0.2)",
    bg: "bg-amber-500/10", border: "border-amber-500/30", text: "text-amber-400",
    gradient: "from-amber-500 to-yellow-400", icon: <TrendingUp className="w-4 h-4" />,
    badge: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    strategy: "Trend-following with momentum oscillators across top pairs",
  },
  high: {
    label: "Aggressive", color: "#f97316", glow: "rgba(249,115,22,0.2)",
    bg: "bg-orange-500/10", border: "border-orange-500/30", text: "text-orange-400",
    gradient: "from-orange-500 to-red-400", icon: <Zap className="w-4 h-4" />,
    badge: "bg-orange-500/15 text-orange-400 border-orange-500/30",
    strategy: "Multi-leg arbitrage with cross-exchange price discrepancy capture",
  },
  ultra: {
    label: "Ultra High", color: "#f43f5e", glow: "rgba(244,63,94,0.2)",
    bg: "bg-rose-500/10", border: "border-rose-500/30", text: "text-rose-400",
    gradient: "from-rose-500 to-pink-400", icon: <Flame className="w-4 h-4" />,
    badge: "bg-rose-500/15 text-rose-400 border-rose-500/30",
    strategy: "High-frequency scalping with ML-driven signal generation",
  },
} as const;

type RiskKey = keyof typeof RISK;
function getRisk(key: string) { return RISK[(key as RiskKey)] ?? RISK.medium; }

function daysLeft(expiresAt: string) {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86_400_000));
}

function useNow(active = true) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

function fmtDuration(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (d > 0) return `${d}d ${pad(h)}h ${pad(m)}m ${pad(sec)}s`;
  if (h > 0) return `${pad(h)}h ${pad(m)}m ${pad(sec)}s`;
  return `${pad(m)}m ${pad(sec)}s`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function fmtUSD(n: number, dp = 2) {
  return n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp }) + " USDT";
}

function useCountUp(target: number, duration = 900) {
  const [val, setVal] = useState(0);
  const ref = useRef<number>(0);
  useEffect(() => {
    const start = ref.current;
    const diff = target - start;
    const steps = 40;
    const stepMs = duration / steps;
    let i = 0;
    const id = setInterval(() => {
      i++;
      const t = i / steps;
      const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      const next = start + diff * ease;
      setVal(next);
      if (i >= steps) { setVal(target); ref.current = target; clearInterval(id); }
    }, stepMs);
    return () => clearInterval(id);
  }, [target, duration]);
  return val;
}

/* ─── Live Activity Feed ─────────────────────────────────────────────────── */

const BOT_PAIRS = ["BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT", "XRP/USDT", "LINK/USDT", "AVAX/USDT", "MATIC/USDT"];
const BOT_ACTIONS = ["BUY", "SELL"];
const BOT_STRATS = ["Scalp", "Arbitrage", "Momentum", "Grid", "DCA", "Reversal"];

interface LiveEvent {
  id: number;
  action: "BUY" | "SELL";
  pair: string;
  amount: string;
  profit: string;
  strategy: string;
  ts: number;
}

function useLiveFeed() {
  const [events, setEvents] = useState<LiveEvent[]>(() =>
    Array.from({ length: 6 }, (_, i) => ({
      id: i,
      action: BOT_ACTIONS[Math.floor(Math.random() * 2)] as "BUY" | "SELL",
      pair: BOT_PAIRS[Math.floor(Math.random() * BOT_PAIRS.length)],
      amount: (Math.random() * 4000 + 100).toFixed(2),
      profit: (Math.random() * 12 + 0.5).toFixed(3),
      strategy: BOT_STRATS[Math.floor(Math.random() * BOT_STRATS.length)],
      ts: Date.now() - i * 8000,
    }))
  );

  useEffect(() => {
    let counter = 100;
    const tick = () => {
      setEvents(prev => [{
        id: counter++,
        action: BOT_ACTIONS[Math.floor(Math.random() * 2)] as "BUY" | "SELL",
        pair: BOT_PAIRS[Math.floor(Math.random() * BOT_PAIRS.length)],
        amount: (Math.random() * 4000 + 100).toFixed(2),
        profit: (Math.random() * 12 + 0.5).toFixed(3),
        strategy: BOT_STRATS[Math.floor(Math.random() * BOT_STRATS.length)],
        ts: Date.now(),
      }, ...prev.slice(0, 9)]);
    };
    const id = setInterval(tick, 2200 + Math.random() * 1800);
    return () => clearInterval(id);
  }, []);

  return events;
}

/* ─── Animated Components ───────────────────────────────────────────────── */

function PulsingDot({ color }: { color: string }) {
  return (
    <span className="relative flex h-2 w-2 shrink-0">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60" style={{ backgroundColor: color }} />
      <span className="relative inline-flex rounded-full h-2 w-2" style={{ backgroundColor: color }} />
    </span>
  );
}

function GlowOrb({ color, size = 320, opacity = 0.12, className = "" }: { color: string; size?: number; opacity?: number; className?: string }) {
  return (
    <div className={`absolute rounded-full pointer-events-none blur-3xl ${className}`}
      style={{ width: size, height: size, background: color, opacity }} />
  );
}

function StatCard({ title, value, sub, icon: Icon, accent, loading }: {
  title: string; value: string; sub?: string; icon: any; accent: string; loading?: boolean;
}) {
  return (
    <div className="relative rounded-2xl border border-border/50 bg-card/50 backdrop-blur p-4 overflow-hidden group hover:border-border transition-colors">
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl"
        style={{ background: `radial-gradient(circle at 50% 0%, ${accent}10 0%, transparent 70%)` }} />
      <div className="flex items-start justify-between mb-3">
        <div className="h-9 w-9 rounded-xl flex items-center justify-center" style={{ background: `${accent}18` }}>
          <Icon className="w-4 h-4" style={{ color: accent }} />
        </div>
        <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground/40" />
      </div>
      {loading ? (
        <div className="space-y-1.5">
          <div className="h-5 w-24 bg-muted/40 rounded animate-pulse" />
          <div className="h-3 w-16 bg-muted/30 rounded animate-pulse" />
        </div>
      ) : (
        <>
          <div className="text-lg font-bold tabular-nums" style={{ color: accent }}>{value}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">{title}</div>
          {sub && <div className="text-[10px] text-muted-foreground/60 mt-0.5">{sub}</div>}
        </>
      )}
    </div>
  );
}

function MiniSparkline({ color, height = 36 }: { color: string; height?: number }) {
  const data = useMemo(() => {
    let v = 100;
    return Array.from({ length: 20 }, (_, i) => {
      v = v + (Math.random() - 0.38) * 3;
      return { i, v };
    });
  }, []);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={`sg-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.3} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5}
          fill={`url(#sg-${color.replace("#", "")})`} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function ProjectionChart({ daily, days, amount, color }: { daily: number; days: number; amount: number; color: string }) {
  const data = useMemo(() => Array.from({ length: Math.min(days, 30) + 1 }, (_, i) => ({
    d: i, v: amount * Math.pow(1 + daily / 100, i),
  })), [daily, days, amount]);
  return (
    <ResponsiveContainer width="100%" height={56}>
      <AreaChart data={data} margin={{ top: 2, right: 2, left: 2, bottom: 0 }}>
        <defs>
          <linearGradient id={`pg-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.45} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5}
          fill={`url(#pg-${color.replace("#", "")})`} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/* ─── Hero Ticker ────────────────────────────────────────────────────────── */

const TICKER_STATIC = [
  { label: "BTC/USDT", value: "+2.43%", up: true },
  { label: "ETH/USDT", value: "+1.87%", up: true },
  { label: "SOL/USDT", value: "+4.12%", up: true },
  { label: "BNB/USDT", value: "-0.34%", up: false },
];

function fmtVolume(v: number) {
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(1)}B+`;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(0)}M+`;
  return `$${v.toLocaleString()}`;
}

interface PlatformStats { totalVolume: number; activeBots: number; winRate: number; avgApy: number; }

function Ticker({ stats }: { stats?: PlatformStats }) {
  const items = [
    ...TICKER_STATIC,
    { label: "Win Rate", value: stats ? `${stats.winRate}%` : "74.6%", up: true },
    { label: "Bots Active", value: stats ? stats.activeBots.toLocaleString() : "12,847", up: true },
    { label: "Total Traded", value: stats ? fmtVolume(stats.totalVolume) : "$284M+", up: true },
    { label: "Avg APY", value: stats ? `${stats.avgApy}%` : "156%", up: true },
  ];
  return (
    <div className="relative overflow-hidden">
      <div className="flex gap-6 animate-[scroll_28s_linear_infinite]" style={{ width: "max-content" }}>
        {[...items, ...items].map((item, i) => (
          <div key={i} className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] text-muted-foreground font-medium">{item.label}</span>
            <span className={`text-[11px] font-bold ${item.up ? "text-emerald-400" : "text-rose-400"}`}>
              {item.up ? <ArrowUpRight className="w-3 h-3 inline" /> : <ArrowDownRight className="w-3 h-3 inline" />}
              {item.value}
            </span>
            <span className="text-border/60">·</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Plan Card ──────────────────────────────────────────────────────────── */

function PlanCard({ plan, onSubscribe }: { plan: Plan; onSubscribe: () => void }) {
  const risk = getRisk(plan.riskLevel);
  const [hovered, setHovered] = useState(false);
  const [hoveredAmt, setHoveredAmt] = useState(plan.minInvestment);
  const dailyProfit = hoveredAmt * (plan.dailyReturnPercent / 100);
  const totalProfit = dailyProfit * plan.durationDays;
  const totalRoi = plan.durationDays > 0 ? (plan.dailyReturnPercent * plan.durationDays).toFixed(1) : "∞";
  const apy = (plan.dailyReturnPercent * 365).toFixed(0);
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="relative rounded-2xl border bg-card/40 backdrop-blur overflow-hidden flex flex-col transition-all duration-300 cursor-default"
      style={{
        borderColor: hovered ? `${risk.color}50` : `${risk.color}20`,
        boxShadow: hovered ? `0 0 40px ${risk.glow}, 0 0 0 1px ${risk.color}30` : `0 0 20px ${risk.glow}`,
        transform: hovered ? "translateY(-2px)" : "none",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Gradient top bar */}
      <div className="h-1" style={{ background: `linear-gradient(90deg, ${risk.color}, ${risk.color}60, transparent)` }} />

      {/* Animated bg orb */}
      <div className="absolute -top-12 -right-12 w-32 h-32 rounded-full blur-2xl pointer-events-none transition-opacity duration-300"
        style={{ background: risk.color, opacity: hovered ? 0.12 : 0.06 }} />

      <div className="p-5 flex flex-col flex-1 gap-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${risk.badge}`}>
                {risk.icon} {risk.label}
              </span>
              {plan.isActive && <PulsingDot color={risk.color} />}
            </div>
            <h3 className="font-bold text-base text-foreground leading-tight">{plan.name}</h3>
            {plan.description && <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">{plan.description}</p>}
          </div>
          <div className="text-right shrink-0">
            <div className="text-2xl font-black tabular-nums" style={{ color: risk.color }}>
              {plan.dailyReturnPercent}%
            </div>
            <div className="text-[10px] text-muted-foreground font-medium">per day</div>
          </div>
        </div>

        {/* Key metrics row */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "APY", value: `${apy}%`, color: "text-emerald-400" },
            { label: "Duration", value: plan.durationDays > 0 ? `${plan.durationDays}d` : "∞", color: "text-foreground" },
            { label: "Investors", value: (plan.totalInvestors || 0) > 999 ? `${((plan.totalInvestors || 0) / 1000).toFixed(1)}k` : String(plan.totalInvestors || 0), color: "text-foreground" },
          ].map(m => (
            <div key={m.label} className="rounded-xl bg-muted/30 border border-border/40 p-2 text-center">
              <div className={`text-sm font-bold ${m.color}`}>{m.value}</div>
              <div className="text-[9px] text-muted-foreground uppercase tracking-wide">{m.label}</div>
            </div>
          ))}
        </div>

        {/* Sparkline */}
        <div className="rounded-xl overflow-hidden bg-muted/20 -mx-1 px-1 py-1">
          <MiniSparkline color={risk.color} height={40} />
        </div>

        {/* Profit calculator */}
        <div className="rounded-xl border p-3 space-y-2.5" style={{ borderColor: `${risk.color}20`, background: `${risk.color}06` }}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
              <Target className="w-3 h-3" /> Profit Calculator
            </span>
            <span className="text-[11px] font-mono text-foreground">${hoveredAmt.toLocaleString()}</span>
          </div>
          <Slider
            min={plan.minInvestment} max={Math.min(plan.maxInvestment, plan.minInvestment * 20)}
            step={plan.minInvestment} value={[hoveredAmt]}
            onValueChange={([v]) => setHoveredAmt(v)} className="mb-1"
          />
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-2 text-center">
              <div className="text-xs font-bold text-emerald-400">+{dailyProfit.toFixed(2)} USDT</div>
              <div className="text-[9px] text-muted-foreground">Daily</div>
            </div>
            <div className="rounded-lg p-2 text-center border" style={{ background: `${risk.color}10`, borderColor: `${risk.color}20` }}>
              <div className="text-xs font-bold" style={{ color: risk.color }}>+{totalProfit.toFixed(2)} USDT</div>
              <div className="text-[9px] text-muted-foreground">Total</div>
            </div>
          </div>
          <ProjectionChart daily={plan.dailyReturnPercent} days={plan.durationDays || 30} amount={hoveredAmt} color={risk.color} />
        </div>

        {/* Range & ROI */}
        <div className="space-y-1.5 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Investment</span>
            <span className="font-mono">${plan.minInvestment.toLocaleString()} – ${plan.maxInvestment.toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total ROI (est.)</span>
            <span className="font-mono font-semibold text-emerald-400">+{totalRoi}%</span>
          </div>
        </div>

        {/* ROI bar */}
        <div>
          <div className="h-1.5 bg-muted/40 rounded-full overflow-hidden">
            <div className="h-full rounded-full" style={{
              width: `${Math.min(100, parseFloat(totalRoi))}%`,
              background: `linear-gradient(90deg, ${risk.color}, ${risk.color}80)`,
            }} />
          </div>
          <div className="flex justify-between text-[9px] text-muted-foreground mt-1">
            <span>0%</span><span>{totalRoi}% return</span>
          </div>
        </div>

        {/* Expandable strategy */}
        <button onClick={() => setExpanded(!expanded)}
          className="flex items-center justify-between w-full text-[11px] text-muted-foreground hover:text-foreground transition-colors rounded-lg border border-border/40 px-3 py-2">
          <span className="flex items-center gap-1.5"><Brain className="w-3 h-3" /> AI Strategy</span>
          <ChevronDown className={`w-3 h-3 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </button>
        {expanded && (
          <div className="rounded-lg bg-muted/20 border border-border/40 p-3 text-[11px] text-muted-foreground leading-relaxed">
            {risk.strategy}
          </div>
        )}

        {/* CTA */}
        <div className="mt-auto">
          <Button className="w-full h-10 font-bold text-sm gap-2 transition-all duration-200"
            style={plan.isActive ? { background: risk.color, color: "#000" } : {}}
            variant={plan.isActive ? "default" : "outline"}
            onClick={onSubscribe} disabled={!plan.isActive}>
            {plan.isActive
              ? <><Play className="w-4 h-4" /> Activate Bot <ChevronRight className="w-4 h-4 ml-auto" /></>
              : "Coming Soon"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ─── Bot Card ───────────────────────────────────────────────────────────── */

function BotCard({ sub, onCancel, cancelling, onInvoice }: {
  sub: Subscription; onCancel: () => void; cancelling: boolean; onInvoice: () => void;
}) {
  const risk = getRisk(sub.riskLevel.toLowerCase());
  const now = useNow();
  const startMs = new Date(sub.startedAt).getTime();
  const noExpire = sub.noExpire || !sub.expiresAt;
  const elapsedMs = now - startMs;
  const remainingMs = sub.expiresAt ? new Date(sub.expiresAt).getTime() - now : 0;
  const totalMs = sub.expiresAt ? new Date(sub.expiresAt).getTime() - startMs : 0;
  const progress = noExpire ? 100 : totalMs > 0 ? Math.min(100, ((totalMs - Math.max(0, remainingMs)) / totalMs) * 100) : 0;
  const roi = sub.investedAmount > 0 ? ((sub.totalEarned || 0) / sub.investedAmount) * 100 : 0;
  const daysRunning = Math.max(1, elapsedMs / 86400000);
  const avgPerDay = (sub.totalEarned || 0) / daysRunning;
  const yearlyAvg = avgPerDay * 365;
  const yearlyRoi = sub.investedAmount > 0 ? (yearlyAvg / sub.investedAmount) * 100 : 0;

  return (
    <div className="relative rounded-2xl border bg-card/60 overflow-hidden"
      style={{ borderColor: `${risk.color}30`, boxShadow: `0 0 30px ${risk.glow}` }}>
      <div className="h-0.5" style={{ background: `linear-gradient(90deg, ${risk.color}, ${risk.color}40, transparent)` }} />

      <div className="p-5 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <PulsingDot color={sub.status === "active" ? risk.color : "#6b7280"} />
              <span className="font-bold text-foreground">{sub.planName}</span>
            </div>
            <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${risk.badge}`}>
              {risk.icon} {risk.label}
            </span>
          </div>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
            sub.status === "active" ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
            : sub.status === "completed" ? "bg-blue-500/15 text-blue-400 border-blue-500/30"
            : "bg-muted/40 text-muted-foreground border-border"
          }`}>{sub.status.toUpperCase()}</span>
        </div>

        {/* Metrics grid */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Invested", value: fmtUSD(sub.investedAmount), accent: "" },
            { label: "Earned", value: `+${fmtUSD(sub.totalEarned || 0, 4)}`, accent: "text-emerald-400" },
            { label: "ROI", value: `${roi.toFixed(2)}%`, accent: roi >= 0 ? "text-emerald-400" : "text-rose-400" },
            { label: "Daily", value: `+${fmtUSD(sub.dailyReturn, 2)}`, accent: "text-amber-400" },
            { label: "Avg/day", value: `+${fmtUSD(avgPerDay, 4)}`, accent: "text-emerald-400" },
            { label: "Portfolio", value: fmtUSD(sub.currentValue ?? sub.investedAmount, 2), accent: "" },
          ].map(m => (
            <div key={m.label} className="p-2 rounded-xl bg-muted/30 border border-border/40 text-center">
              <div className={`text-xs font-bold font-mono ${m.accent}`}>{m.value}</div>
              <div className="text-[9px] text-muted-foreground mt-0.5 uppercase tracking-wide">{m.label}</div>
            </div>
          ))}
        </div>

        {/* Timer */}
        <div className="rounded-xl border p-3" style={{ borderColor: `${risk.color}25`, background: `${risk.color}08` }}>
          <div className="flex items-center justify-between mb-1.5">
            <span className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              <Clock className="w-3 h-3" />{noExpire ? "Running For" : "Time Left"}
            </span>
            {noExpire
              ? <span className="flex items-center gap-1 text-[9px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  <Infinity className="w-3 h-3" /> No Expiry
                </span>
              : <span className="text-[10px] text-muted-foreground">{daysLeft(sub.expiresAt!)} days left</span>
            }
          </div>
          <div className="font-mono font-black text-xl tabular-nums tracking-tight" style={{ color: risk.color }}>
            {noExpire ? fmtDuration(elapsedMs) : fmtDuration(Math.max(0, remainingMs))}
          </div>
          {!noExpire && (
            <>
              <div className="h-1.5 bg-muted/40 rounded-full overflow-hidden mt-2">
                <div className="h-full rounded-full transition-all duration-1000"
                  style={{ width: `${progress}%`, background: `linear-gradient(90deg, ${risk.color}, ${risk.color}80)` }} />
              </div>
              <div className="flex justify-between text-[9px] text-muted-foreground mt-1">
                <span>{fmtDate(sub.startedAt)}</span>
                <span>{Math.round(progress)}% complete</span>
                <span>{fmtDate(sub.expiresAt!)}</span>
              </div>
            </>
          )}
          {noExpire && (
            <div className="text-[10px] text-muted-foreground mt-1">
              Started {fmtDate(sub.startedAt)} · {fmtUSD(sub.dailyReturn, 2)}/day · no time limit
            </div>
          )}
        </div>

        {/* Yearly projection */}
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
              <TrendingUp className="w-3 h-3" /> Projected Annual
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              {yearlyRoi >= 0 ? "+" : ""}{yearlyRoi.toFixed(1)}% / yr
            </span>
          </div>
          <div className="font-mono font-black text-lg tabular-nums text-emerald-400">
            +{fmtUSD(yearlyAvg, 2)}<span className="text-xs font-normal text-muted-foreground"> / year</span>
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            Annualised from {fmtUSD(avgPerDay, 4)}/day over {Math.floor(daysRunning)}d
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          {sub.status === "active" && (
            <Button variant="outline" size="sm"
              className="flex-1 border-rose-500/30 text-rose-400 hover:bg-rose-500/10 text-xs h-8 gap-1"
              onClick={onCancel} disabled={cancelling}>
              <Lock className="w-3.5 h-3.5" />
              {cancelling ? "Stopping…" : "Stop & Withdraw"}
            </Button>
          )}
          <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={onInvoice}>
            <Receipt className="w-3.5 h-3.5" /> Invoice
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ─── Subscribe Dialog ───────────────────────────────────────────────────── */

function SubscribeDialog({ plan, open, onClose, onSuccess }: {
  plan: Plan; open: boolean; onClose: () => void; onSuccess: (data: PlanSuccess) => void;
}) {
  const [amount, setAmount] = useState(String(plan.minInvestment));
  const [currency, setCurrency] = useState<"USDT" | "INR">("USDT");
  const [noExpire, setNoExpire] = useState(true);
  const risk = getRisk(plan.riskLevel);
  const qc = useQueryClient();

  const rateQ = useQuery<{ inrRate: number }>({
    queryKey: ["inr-rate"],
    queryFn: () => get<{ inrRate: number }>("/rates"),
    staleTime: 60_000,
    enabled: open,
  });

  const subscribeMutation = useMutation({
    mutationFn: (data: object) => post("/ai-trading/subscribe", data),
    onSuccess: () => {
      const dailyProfit = amtInUsdt * (plan.dailyReturnPercent / 100);
      onSuccess({
        kind: "plan", planName: plan.name, riskColor: risk.color,
        investedUsdt: amtInUsdt, dailyPct: plan.dailyReturnPercent,
        durationDays: noExpire ? null : plan.durationDays, dailyProfit,
        expectedProfit: noExpire ? 0 : +(dailyProfit * plan.durationDays).toFixed(4),
      });
      qc.invalidateQueries({ queryKey: ["ai-trading-subs"] });
      onClose();
      setAmount(String(plan.minInvestment));
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to start bot"),
  });

  const numAmt = parseFloat(amount) || 0;
  const rate = rateQ.data?.inrRate ?? 84;
  const minAmt = currency === "USDT" ? plan.minInvestment : plan.minInvestment * rate;
  const maxAmt = currency === "USDT" ? plan.maxInvestment : plan.maxInvestment * rate;
  const amtInUsdt = currency === "USDT" ? numAmt : numAmt / rate;
  const dailyProfit = amtInUsdt * (plan.dailyReturnPercent / 100);
  const totalProfit = dailyProfit * plan.durationDays;
  const totalReturn = amtInUsdt + totalProfit;
  const roi = amtInUsdt > 0 ? (totalProfit / amtInUsdt) * 100 : 0;
  const isValid = numAmt >= minAmt && numAmt <= maxAmt;

  const projData = useMemo(() => {
    if (amtInUsdt <= 0) return [];
    return Array.from({ length: Math.min(plan.durationDays || 30, 30) + 1 }, (_, i) => ({
      d: `D${i}`,
      v: parseFloat((amtInUsdt + amtInUsdt * (plan.dailyReturnPercent / 100) * i).toFixed(4)),
    }));
  }, [amtInUsdt, plan.dailyReturnPercent, plan.durationDays]);

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span style={{ color: risk.color }}>{risk.icon}</span>
            Activate {plan.name}
          </DialogTitle>
          <DialogDescription>Configure your investment and start earning daily returns.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Currency toggle */}
          <div className="flex rounded-xl overflow-hidden border border-border">
            {(["USDT", "INR"] as const).map(c => (
              <button key={c} onClick={() => setCurrency(c)}
                className={`flex-1 py-2.5 text-sm font-bold transition-all ${currency === c ? "text-black" : "text-muted-foreground hover:text-foreground"}`}
                style={currency === c ? { background: risk.color } : {}}>
                {c === "INR" ? "₹ INR" : "⬡ USDT"}
              </button>
            ))}
          </div>

          {/* Amount */}
          <div>
            <Label className="text-sm text-muted-foreground mb-1.5 block">
              Amount ({currency})
              <span className="ml-2 text-xs opacity-70">
                Min: {currency === "USDT" ? `${plan.minInvestment.toLocaleString()} USDT` : `₹${(plan.minInvestment * rate).toLocaleString()}`}
              </span>
            </Label>
            <Input type="number" value={amount} onChange={e => setAmount(e.target.value)}
              placeholder={String(minAmt)} className="h-11 text-base font-mono" />
            {numAmt > 0 && !isValid && (
              <p className="text-xs text-rose-400 mt-1.5">
                {numAmt < minAmt ? `Min: ${currency === "USDT" ? "" : "₹"}${minAmt.toLocaleString()}${currency === "USDT" ? " USDT" : ""}` : `Max: ${currency === "USDT" ? "" : "₹"}${maxAmt.toLocaleString()}${currency === "USDT" ? " USDT" : ""}`}
              </p>
            )}
          </div>

          {/* Duration */}
          <div>
            <Label className="text-sm text-muted-foreground mb-1.5 block">Run Duration</Label>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setNoExpire(true)}
                className={`flex flex-col items-start gap-0.5 p-3 rounded-xl border text-left transition-all ${noExpire ? "border-emerald-500/50 bg-emerald-500/10" : "border-border/60 hover:border-border"}`}>
                <span className="flex items-center gap-1.5 text-sm font-semibold">
                  <Infinity className="w-4 h-4 text-emerald-400" /> Run Forever
                </span>
                <span className="text-[10px] text-muted-foreground">No expiry · cancel anytime</span>
              </button>
              <button type="button" onClick={() => setNoExpire(false)}
                className={`flex flex-col items-start gap-0.5 p-3 rounded-xl border text-left transition-all ${!noExpire ? "border-amber-500/50 bg-amber-500/10" : "border-border/60 hover:border-border"}`}>
                <span className="flex items-center gap-1.5 text-sm font-semibold">
                  <Calendar className="w-4 h-4 text-amber-400" /> {plan.durationDays}-Day Term
                </span>
                <span className="text-[10px] text-muted-foreground">Auto-completes at end</span>
              </button>
            </div>
          </div>

          {/* Projection */}
          {amtInUsdt > 0 && (
            <>
              <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: `${risk.color}30`, background: `${risk.color}08` }}>
                <div className="flex items-center gap-1.5 text-xs font-bold mb-1" style={{ color: risk.color }}>
                  {risk.icon} Earnings Projection
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  {[
                    { label: "Per Day", value: `+${dailyProfit.toFixed(2)}`, accent: "text-emerald-400" },
                    { label: "Total Profit", value: `+${totalProfit.toFixed(2)}`, accent: "text-emerald-400" },
                    { label: "Final Value", value: totalReturn.toFixed(2), accent: "text-foreground" },
                  ].map(m => (
                    <div key={m.label} className="p-2 rounded-lg bg-background/60">
                      <div className={`text-sm font-bold ${m.accent}`}>{m.value} USDT</div>
                      <div className="text-[9px] text-muted-foreground">{m.label}</div>
                    </div>
                  ))}
                </div>
                <div className="text-center">
                  <span className="text-xs text-muted-foreground">Total ROI: </span>
                  <span className="text-xs font-bold text-emerald-400">+{roi.toFixed(2)}%</span>
                  {!noExpire && <span className="text-xs text-muted-foreground"> over {plan.durationDays} days</span>}
                </div>
                {projData.length > 0 && (
                  <div className="h-24 -mx-1">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={projData} margin={{ top: 2, right: 2, left: 2, bottom: 0 }}>
                        <defs>
                          <linearGradient id="dlGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={risk.color} stopOpacity={0.4} />
                            <stop offset="95%" stopColor={risk.color} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <Area type="monotone" dataKey="v" stroke={risk.color} strokeWidth={2}
                          fill="url(#dlGrad)" dot={false} />
                        <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }}
                          formatter={(v: any) => [`${Number(v).toFixed(2)} USDT`, "Value"]} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              <div className="flex gap-2 text-[11px] text-muted-foreground bg-muted/30 rounded-lg p-3">
                <Shield className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-400" />
                <span>Returns are estimates based on historical performance. Crypto markets are volatile. Cancel anytime for a full refund of principal.</span>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!isValid || subscribeMutation.isPending}
            onClick={() => subscribeMutation.mutate({ planId: plan.id, amount: currency === "INR" ? numAmt : amtInUsdt, currency, noExpire })}
            style={isValid ? { background: risk.color, color: "#000" } : {}}
            className="font-bold gap-2">
            {subscribeMutation.isPending ? "Activating…" : <><Play className="w-4 h-4" /> Run Bot</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────────────── */

export default function AITrading() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [subscribeOpen, setSubscribeOpen] = useState(false);
  const [filterRisk, setFilterRisk] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"daily" | "apy" | "investors">("daily");
  const [planSuccess, setPlanSuccess] = useState<PlanSuccess | null>(null);
  const [, navigate] = useLocation();
  const liveEvents = useLiveFeed();

  const platformStatsQ = useQuery<PlatformStats>({
    queryKey: ["ai-trading-platform-stats"],
    queryFn: () => get<PlatformStats>("/ai-trading/platform-stats"),
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const plansQ = useQuery<Plan[]>({
    queryKey: ["ai-trading-plans"],
    queryFn: () => get<Plan[]>("/ai-trading/plans").catch(() => []),
    staleTime: 60_000,
  });

  const subsQ = useQuery<Subscription[]>({
    queryKey: ["ai-trading-subs"],
    queryFn: () => get<Subscription[]>("/ai-trading/subscriptions").catch(() => []),
    enabled: !!user,
    refetchInterval: 30_000,
  });

  const earningsQ = useQuery<{ earnings: Earning[]; total: number }>({
    queryKey: ["ai-trading-earnings"],
    queryFn: () => get<{ earnings: Earning[]; total: number }>("/ai-trading/earnings?limit=200").catch(() => ({ earnings: [], total: 0 })),
    enabled: !!user,
    refetchInterval: 60_000,
  });

  interface PnlSummary { profit: number; loss: number; net: number; wins: number; losses: number; total: number; winRate: number; }
  const pnlSummaryQ = useQuery<PnlSummary>({
    queryKey: ["ai-trading-pnl-summary"],
    queryFn: () => get<PnlSummary>("/ai-trading/pnl-summary").catch(() => ({ profit: 0, loss: 0, net: 0, wins: 0, losses: 0, total: 0, winRate: 0 })),
    enabled: !!user,
    refetchInterval: 60_000,
  });

  const plans = useMemo(() => {
    let list = plansQ.data ?? [];
    if (filterRisk !== "all") list = list.filter(p => p.riskLevel === filterRisk);
    if (sortBy === "daily") list = [...list].sort((a, b) => b.dailyReturnPercent - a.dailyReturnPercent);
    if (sortBy === "apy") list = [...list].sort((a, b) => (b.dailyReturnPercent * 365) - (a.dailyReturnPercent * 365));
    if (sortBy === "investors") list = [...list].sort((a, b) => (b.totalInvestors || 0) - (a.totalInvestors || 0));
    return list;
  }, [plansQ.data, filterRisk, sortBy]);

  const subs = subsQ.data ?? [];
  const earnings = earningsQ.data?.earnings ?? [];
  const activeSubs = subs.filter(s => s.status === "active");
  const completedSubs = subs.filter(s => s.status === "completed");
  const pastSubs = subs.filter(s => s.status !== "active");
  const totalInvested = activeSubs.reduce((s, x) => s + x.investedAmount, 0);
  const totalEarned = subs.reduce((s, x) => s + (x.totalEarned || 0), 0);
  const totalCurrentValue = activeSubs.reduce((s, x) => s + (x.currentValue || x.investedAmount), 0);
  const unrealizedPnl = totalCurrentValue - totalInvested;
  const pnlStats = pnlSummaryQ.data ?? { profit: 0, loss: 0, net: 0, wins: 0, losses: 0, total: 0, winRate: 0 };

  const cancelMutation = useMutation({
    mutationFn: (id: number) => post(`/ai-trading/subscriptions/${id}/cancel`),
    onSuccess: () => { toast.success("Bot stopped — investment refunded to USDT wallet."); qc.invalidateQueries({ queryKey: ["ai-trading-subs"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Failed to cancel bot"),
  });

  const earningsChartData = useMemo(() => {
    const map = new Map<string, number>();
    let cum = 0;
    for (const e of [...earnings].reverse()) {
      const d = new Date(e.creditedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
      cum += e.amountUsdt;
      map.set(d, cum);
    }
    return Array.from(map.entries()).slice(-21).map(([date, cumAmount]) => ({ date, cumAmount }));
  }, [earnings]);

  const dailyEarnings = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of earnings) {
      const d = new Date(e.creditedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
      map.set(d, (map.get(d) ?? 0) + e.amountUsdt);
    }
    return Array.from(map.entries()).slice(-14).map(([date, amount]) => ({ date, amount }));
  }, [earnings]);

  const portfolioAlloc = useMemo(() => activeSubs.map(s => ({
    name: s.planName.length > 12 ? s.planName.slice(0, 12) + "…" : s.planName,
    value: s.investedAmount,
    color: getRisk(s.riskLevel.toLowerCase()).color,
  })), [activeSubs]);

  const cInvested = useCountUp(totalInvested);
  const cEarned = useCountUp(totalEarned);
  const cPnl = useCountUp(unrealizedPnl);

  const openInvoice = (id: number) => navigate(`/ai-trading/${id}/invoice`);

  return (
    <div className="relative">
      {/* ── Background ambient ── */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <GlowOrb color="#f59e0b" size={500} opacity={0.04} className="-top-40 -left-20" />
        <GlowOrb color="#10b981" size={400} opacity={0.04} className="top-1/3 -right-32" />
        <GlowOrb color="#f43f5e" size={300} opacity={0.03} className="bottom-1/4 left-1/4" />
      </div>

      <div className="relative z-10 container mx-auto px-4 py-6 max-w-7xl space-y-8">

        {/* ── Hero ── */}
        <div className="relative rounded-3xl border border-border/40 bg-gradient-to-br from-card/80 to-card/40 backdrop-blur overflow-hidden p-6 sm:p-8">
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-500/40 to-transparent" />
            <div className="absolute -top-24 left-1/3 w-64 h-64 rounded-full blur-3xl" style={{ background: "#f59e0b", opacity: 0.07 }} />
            <div className="absolute -bottom-12 right-0 w-48 h-48 rounded-full blur-3xl" style={{ background: "#10b981", opacity: 0.06 }} />
          </div>

          <div className="relative">
            {/* Live badge + ticker */}
            <div className="flex items-center gap-3 mb-5 overflow-hidden">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 shrink-0">
                <PulsingDot color="#f59e0b" />
                <span className="text-[10px] font-bold text-amber-400 uppercase tracking-widest">Live</span>
              </div>
              <div className="overflow-hidden flex-1 min-w-0">
                <Ticker stats={platformStatsQ.data} />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
              <div className="max-w-xl">
                <div className="flex items-center gap-2 mb-2">
                  <Brain className="w-6 h-6 text-amber-400" />
                  <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-foreground tracking-tight">
                    AI Trading Engine
                  </h1>
                </div>
                <p className="text-muted-foreground text-sm sm:text-base leading-relaxed mb-4">
                  Institutional-grade algorithms trading 24/7 across 150+ pairs. Deploy capital, earn daily returns — no experience needed.
                </p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { icon: <Lock className="w-3.5 h-3.5" />, text: "Non-custodial" },
                    { icon: <Activity className="w-3.5 h-3.5" />, text: "Daily payouts" },
                    { icon: <Shield className="w-3.5 h-3.5" />, text: "Stop-loss guard" },
                    { icon: <RefreshCw className="w-3.5 h-3.5" />, text: "Cancel anytime" },
                    { icon: <Award className="w-3.5 h-3.5" />, text: "Audited strategies" },
                    { icon: <Network className="w-3.5 h-3.5" />, text: "150+ pairs" },
                  ].map(f => (
                    <span key={f.text} className="flex items-center gap-1.5 text-[11px] text-muted-foreground bg-muted/30 border border-border/40 rounded-full px-3 py-1">
                      {f.icon} {f.text}
                    </span>
                  ))}
                </div>
              </div>

              {/* Trust stats — live from admin settings + real DB count */}
              <div className="grid grid-cols-2 gap-3 shrink-0 w-full sm:w-auto">
                {[
                  {
                    label: "Total Volume",
                    value: platformStatsQ.data ? fmtVolume(platformStatsQ.data.totalVolume) : "$284M+",
                    color: "#f59e0b",
                  },
                  {
                    label: "Active Bots",
                    value: platformStatsQ.data ? platformStatsQ.data.activeBots.toLocaleString() : "12,847",
                    color: "#10b981",
                  },
                  {
                    label: "Win Rate",
                    value: platformStatsQ.data ? `${platformStatsQ.data.winRate}%` : "74.6%",
                    color: "#f59e0b",
                  },
                  {
                    label: "Avg APY",
                    value: platformStatsQ.data ? `${platformStatsQ.data.avgApy}%` : "156%",
                    color: "#f43f5e",
                  },
                ].map(s => (
                  <div key={s.label} className="rounded-2xl border border-border/40 bg-background/40 p-3 text-center">
                    <div className="text-xl font-black" style={{ color: s.color }}>{s.value}</div>
                    <div className="text-[10px] text-muted-foreground">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 mt-5">
              <Link href="/ai-trading/statement">
                <Button variant="outline" size="sm" className="gap-1.5">
                  <FileText className="w-4 h-4" /> Statement
                </Button>
              </Link>
              <Button variant="outline" size="sm" className="gap-1.5"
                onClick={() => { plansQ.refetch(); subsQ.refetch(); }}>
                <RefreshCw className="w-4 h-4" /> Refresh
              </Button>
            </div>
          </div>
        </div>

        {/* ── Portfolio Stats (logged in) ── */}
        {user && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard title="Active Bots" sub={`${completedSubs.length} completed`}
              value={String(activeSubs.length)} icon={Bot} accent="#f59e0b" loading={subsQ.isLoading} />
            <StatCard title="Total Invested" sub="in active bots"
              value={cInvested.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " USDT"}
              icon={CircleDollarSign} accent="#10b981" loading={subsQ.isLoading} />
            <StatCard title="Total Earned" sub="all-time credited"
              value={cEarned.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 }) + " USDT"}
              icon={TrendingUp} accent="#f59e0b" loading={subsQ.isLoading} />
            <StatCard title="Unrealized P&L" sub="vs invested"
              value={(cPnl >= 0 ? "+" : "") + cPnl.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " USDT"}
              icon={Sparkles} accent={unrealizedPnl >= 0 ? "#10b981" : "#f43f5e"} loading={subsQ.isLoading} />
          </div>
        )}

        {/* ── Live Activity Feed ── */}
        <div className="rounded-2xl border border-border/50 bg-card/40 backdrop-blur overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
            <div className="flex items-center gap-2">
              <Wifi className="w-4 h-4 text-amber-400" />
              <span className="text-sm font-semibold">Live Bot Activity</span>
              <PulsingDot color="#10b981" />
            </div>
            <span className="text-[10px] text-muted-foreground">Auto-updating</span>
          </div>
          <div className="divide-y divide-border/30 max-h-48 overflow-hidden">
            {liveEvents.slice(0, 6).map((ev, i) => (
              <div key={ev.id}
                className={`flex items-center justify-between px-4 py-2 text-xs transition-all ${i === 0 ? "bg-amber-500/5" : ""}`}>
                <div className="flex items-center gap-3">
                  <span className={`w-10 text-center text-[10px] font-bold rounded px-1.5 py-0.5 ${ev.action === "BUY" ? "bg-emerald-500/15 text-emerald-400" : "bg-rose-500/15 text-rose-400"}`}>
                    {ev.action}
                  </span>
                  <span className="font-mono text-foreground font-semibold">{ev.pair}</span>
                  <span className="text-muted-foreground hidden sm:inline">{ev.strategy}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-muted-foreground font-mono">${ev.amount}</span>
                  <span className="text-emerald-400 font-mono font-semibold">+{ev.profit} USDT</span>
                  <span className="text-muted-foreground/50 text-[10px] hidden md:block">
                    {Math.floor((Date.now() - ev.ts) / 1000)}s ago
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Main Tabs ── */}
        <Tabs defaultValue="plans" className="space-y-6">
          <div className="flex items-center gap-3 flex-wrap">
            <TabsList className="bg-muted/60 border border-border/40 h-10">
              <TabsTrigger value="plans" className="gap-1.5 text-xs sm:text-sm">
                <Cpu className="w-4 h-4" /> Bot Plans
              </TabsTrigger>
              {user && (
                <TabsTrigger value="active" className="gap-1.5 text-xs sm:text-sm">
                  <Bot className="w-4 h-4" />
                  My Bots
                  {activeSubs.length > 0 && (
                    <Badge className="ml-1 h-4 min-w-[16px] px-1 text-[10px] bg-amber-500 text-black">
                      {activeSubs.length}
                    </Badge>
                  )}
                </TabsTrigger>
              )}
              {user && (
                <TabsTrigger value="earnings" className="gap-1.5 text-xs sm:text-sm">
                  <BarChart2 className="w-4 h-4" /> P&amp;L Analytics
                </TabsTrigger>
              )}
            </TabsList>
          </div>

          {/* ── Plans Tab ── */}
          <TabsContent value="plans" className="space-y-6">
            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex gap-1.5">
                {(["all", "low", "medium", "high", "ultra"] as const).map(r => (
                  <button key={r} onClick={() => setFilterRisk(r)}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-all font-semibold ${
                      filterRisk === r
                        ? "bg-amber-500 text-black border-amber-500"
                        : "border-border/60 text-muted-foreground hover:text-foreground hover:border-border"
                    }`}>
                    {r === "all" ? "All" : getRisk(r).label}
                  </button>
                ))}
              </div>
              <div className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="hidden sm:inline">Sort:</span>
                {(["daily", "apy", "investors"] as const).map(s => (
                  <button key={s} onClick={() => setSortBy(s)}
                    className={`px-2.5 py-1 rounded-lg border transition-all ${sortBy === s ? "bg-muted text-foreground border-border" : "border-transparent hover:border-border/40"}`}>
                    {s === "daily" ? "Daily %" : s === "apy" ? "APY" : "Popular"}
                  </button>
                ))}
              </div>
            </div>

            {plansQ.isLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {[1, 2, 3].map(i => <div key={i} className="h-96 rounded-2xl bg-muted/20 animate-pulse" />)}
              </div>
            ) : plans.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <Bot className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <div className="font-semibold">No plans match your filter</div>
                <div className="text-sm mt-1">Try selecting a different risk category.</div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {plans.map(plan => (
                  <PlanCard key={plan.id} plan={plan} onSubscribe={() => {
                    if (!user) { window.location.href = "/login"; return; }
                    setSelectedPlan(plan);
                    setSubscribeOpen(true);
                  }} />
                ))}
              </div>
            )}

            {/* How it works */}
            <div className="rounded-2xl border border-border/50 bg-card/30 p-6">
              <h3 className="font-bold text-foreground mb-5 flex items-center gap-2">
                <Info className="w-4 h-4 text-amber-400" /> How It Works
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-5">
                {[
                  { step: "01", title: "Choose a Strategy", desc: "Pick a bot plan matching your risk appetite and capital.", icon: <Target className="w-4 h-4" /> },
                  { step: "02", title: "Fund the Bot", desc: "Deposit USDT or INR into the AI engine's smart vault.", icon: <Banknote className="w-4 h-4" /> },
                  { step: "03", title: "AI Trades 24/7", desc: "Algorithms scan 150+ pairs, executing hundreds of trades daily.", icon: <Brain className="w-4 h-4" /> },
                  { step: "04", title: "Earn Every Day", desc: "Returns credited to your spot wallet daily at midnight UTC.", icon: <CircleDollarSign className="w-4 h-4" /> },
                ].map((s, idx) => (
                  <div key={s.step} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0 text-amber-400">
                        {s.icon}
                      </div>
                      {idx < 3 && <div className="w-px flex-1 bg-gradient-to-b from-amber-500/30 to-transparent mt-2 hidden sm:block" />}
                    </div>
                    <div className="pb-4">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-[10px] font-bold text-amber-400/60">{s.step}</span>
                        <div className="text-sm font-bold text-foreground">{s.title}</div>
                      </div>
                      <div className="text-[11px] text-muted-foreground leading-relaxed">{s.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>

          {/* ── My Bots Tab ── */}
          {user && (
            <TabsContent value="active" className="space-y-6">
              {subsQ.isLoading ? (
                <div className="space-y-4">
                  {[1, 2].map(i => <div key={i} className="h-48 rounded-2xl bg-muted/20 animate-pulse" />)}
                </div>
              ) : subs.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                  <Bot className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <div className="font-semibold">No bots yet</div>
                  <div className="text-sm mt-1">Browse plans and activate a bot to start earning daily returns.</div>
                </div>
              ) : (
                <>
                  {/* Portfolio allocation chart */}
                  {activeSubs.length > 1 && portfolioAlloc.length > 0 && (
                    <div className="rounded-2xl border border-border/50 bg-card/40 p-5">
                      <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
                        <Layers className="w-4 h-4 text-amber-400" /> Portfolio Allocation
                      </h3>
                      <div className="flex items-center gap-6">
                        <div className="w-32 h-32 shrink-0">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie data={portfolioAlloc} cx="50%" cy="50%" innerRadius={28} outerRadius={52}
                                dataKey="value" paddingAngle={3}>
                                {portfolioAlloc.map((entry, i) => (
                                  <Cell key={i} fill={entry.color} />
                                ))}
                              </Pie>
                              <Tooltip formatter={(v: any) => [`${Number(v).toFixed(2)} USDT`]} />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="flex-1 space-y-2">
                          {portfolioAlloc.map(a => (
                            <div key={a.name} className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full shrink-0" style={{ background: a.color }} />
                              <span className="text-xs text-muted-foreground flex-1 truncate">{a.name}</span>
                              <span className="text-xs font-mono font-semibold">{a.value.toLocaleString("en-US", { minimumFractionDigits: 2 })} USDT</span>
                              <span className="text-[10px] text-muted-foreground">
                                {totalInvested > 0 ? ((a.value / totalInvested) * 100).toFixed(1) : 0}%
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {activeSubs.length > 0 && (
                    <div>
                      <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
                        <PulsingDot color="#10b981" />
                        Active Bots ({activeSubs.length})
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {activeSubs.map(sub => (
                          <BotCard key={sub.id} sub={sub}
                            onCancel={() => cancelMutation.mutate(sub.id)}
                            cancelling={cancelMutation.isPending}
                            onInvoice={() => openInvoice(sub.id)} />
                        ))}
                      </div>
                    </div>
                  )}

                  {pastSubs.length > 0 && (
                    <div className="rounded-2xl border border-border/50 bg-card/30 overflow-hidden">
                      <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/40">
                        <h3 className="text-sm font-bold flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-muted-foreground" />
                          Bot History ({pastSubs.length})
                        </h3>
                      </div>
                      <div className="divide-y divide-border/30">
                        {pastSubs.map(sub => {
                          const risk = getRisk(sub.riskLevel.toLowerCase());
                          return (
                            <div key={sub.id} className="flex items-center justify-between px-5 py-3 gap-4">
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                                  style={{ background: `${risk.color}18` }}>
                                  <Bot className="w-4 h-4" style={{ color: risk.color }} />
                                </div>
                                <div className="min-w-0">
                                  <div className="text-sm font-semibold truncate">{sub.planName}</div>
                                  <div className="text-[10px] text-muted-foreground">{fmtDate(sub.startedAt)}</div>
                                </div>
                              </div>
                              <div className="flex items-center gap-4 shrink-0 text-right">
                                <div>
                                  <div className="text-xs font-mono">{fmtUSD(sub.investedAmount)}</div>
                                  <div className="text-[10px] text-muted-foreground">Invested</div>
                                </div>
                                <div>
                                  <div className="text-xs font-mono font-bold text-emerald-400">+{fmtUSD(sub.totalEarned || 0, 4)}</div>
                                  <div className="text-[10px] text-muted-foreground">Earned</div>
                                </div>
                                <button onClick={() => openInvoice(sub.id)}
                                  className="h-7 px-2 rounded-lg border border-border/60 text-[10px] flex items-center gap-1 hover:bg-muted/40 transition-colors">
                                  <Receipt className="w-3 h-3" /> Invoice
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </TabsContent>
          )}

          {/* ── P&L Analytics Tab ── */}
          {user && (
            <TabsContent value="earnings" className="space-y-6">
              {/* Summary stats */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  { label: "Total Profit", value: `+${fmtUSD(pnlStats.profit, 4)}`, accent: "#10b981", icon: TrendingUp },
                  { label: "Net P&L", value: (pnlStats.net >= 0 ? "+" : "") + fmtUSD(pnlStats.net, 4), accent: pnlStats.net >= 0 ? "#10b981" : "#f43f5e", icon: BarChart2 },
                  { label: "Win Rate", value: `${pnlStats.winRate.toFixed(1)}%`, accent: "#f59e0b", icon: Target },
                  { label: "Total Credits", value: String(pnlStats.total), accent: "#f59e0b", icon: Activity },
                ].map(s => (
                  <StatCard key={s.label} title={s.label} value={s.value} icon={s.icon} accent={s.accent} />
                ))}
              </div>

              {/* Cumulative earnings chart */}
              {earningsChartData.length > 0 && (
                <div className="rounded-2xl border border-border/50 bg-card/40 p-5">
                  <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-emerald-400" /> Cumulative Earnings
                  </h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={earningsChartData} margin={{ top: 5, right: 10, left: 5, bottom: 5 }}>
                      <defs>
                        <linearGradient id="cumGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                      <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                      <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }}
                        formatter={(v: any) => [`${Number(v).toFixed(4)} USDT`, "Cumulative"]} />
                      <Area type="monotone" dataKey="cumAmount" stroke="#10b981" strokeWidth={2}
                        fill="url(#cumGrad)" dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Daily bar chart */}
              {dailyEarnings.length > 0 && (
                <div className="rounded-2xl border border-border/50 bg-card/40 p-5">
                  <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
                    <BarChart2 className="w-4 h-4 text-amber-400" /> Daily Earnings (Last 14 Days)
                  </h3>
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={dailyEarnings} margin={{ top: 5, right: 10, left: 5, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                      <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                      <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }}
                        formatter={(v: any) => [`${Number(v).toFixed(4)} USDT`, "Daily"]} />
                      <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                        {dailyEarnings.map((_, i) => (
                          <Cell key={i} fill="#f59e0b" fillOpacity={0.7 + (i / dailyEarnings.length) * 0.3} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Earnings table */}
              {earnings.length > 0 && (
                <div className="rounded-2xl border border-border/50 bg-card/40 overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/40">
                    <h3 className="text-sm font-bold">Earning Credits</h3>
                    <Link href="/ai-trading/statement">
                      <Button variant="ghost" size="sm" className="text-xs gap-1 h-7">
                        <FileText className="w-3.5 h-3.5" /> Full Statement
                      </Button>
                    </Link>
                  </div>
                  <div className="divide-y divide-border/30 max-h-72 overflow-y-auto">
                    {earnings.slice(0, 30).map(e => (
                      <div key={e.id} className="flex items-center justify-between px-5 py-2.5">
                        <div className="flex items-center gap-3">
                          <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                            <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                          </div>
                          <div>
                            <div className="text-xs font-semibold">{e.planName}</div>
                            <div className="text-[10px] text-muted-foreground">{fmtDate(e.creditedAt)}</div>
                          </div>
                        </div>
                        <div className="text-xs font-mono font-bold text-emerald-400">
                          +{e.amountUsdt.toFixed(4)} USDT
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {earnings.length === 0 && (
                <div className="text-center py-16 text-muted-foreground">
                  <BarChart2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <div className="font-semibold">No earnings yet</div>
                  <div className="text-sm mt-1">Activate a bot to start earning daily returns.</div>
                </div>
              )}
            </TabsContent>
          )}
        </Tabs>
      </div>

      {/* ── Subscribe Dialog ── */}
      {selectedPlan && (
        <SubscribeDialog
          plan={selectedPlan}
          open={subscribeOpen}
          onClose={() => { setSubscribeOpen(false); setSelectedPlan(null); }}
          onSuccess={(data) => { setPlanSuccess(data); qc.invalidateQueries({ queryKey: ["ai-trading-subs"] }); }}
        />
      )}

      {/* ── Success Modal ── */}
      <SuccessModal
        open={!!planSuccess}
        payload={planSuccess}
        onClose={() => setPlanSuccess(null)}
      />
    </div>
  );
}
