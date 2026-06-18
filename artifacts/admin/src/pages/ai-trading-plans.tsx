import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post, patch, del, put } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  Bot, Plus, Pencil, Users, TrendingUp, BarChart2, Trash2,
  Zap, Shield, AlertTriangle, Flame, Activity, DollarSign,
  Calendar, ArrowUpRight, CheckCircle2, Clock, XCircle,
  RefreshCw, Eye, EyeOff, Target, Sparkles, Award, Layers,
  ChevronDown, ChevronUp, Settings2, Save,
} from "lucide-react";
import { PageHeader } from "@/components/premium/PageHeader";
import { PremiumStatCard } from "@/components/premium/PremiumStatCard";
import { SectionCard } from "@/components/premium/SectionCard";
import { cn } from "@/lib/utils";

interface Plan {
  id: number;
  name: string;
  description?: string | null;
  dailyReturnPercent: number;
  minInvestment: number;
  maxInvestment: number;
  durationDays: number;
  riskLevel: string;
  isActive: boolean;
  totalInvestors: number;
  createdAt: string;
}

interface Subscription {
  id: number;
  userId: number;
  planId: number;
  investedAmount: number;
  startedAt: string;
  expiresAt: string;
  status: string;
  totalEarned: number;
  userName?: string | null;
  userEmail?: string | null;
  planName?: string | null;
}

interface Stats {
  activeSubscriptions: number;
  totalSubscriptions: number;
  totalEarningsPaid: number;
}

interface HeroStats {
  baseVolume: string;
  baseBots: string;
  winRate: string;
  avgApy: string;
}

const RISK_META: Record<string, {
  color: string; bg: string; border: string;
  glow: string; icon: typeof Zap; label: string; score: number;
}> = {
  low:   { color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30", glow: "shadow-emerald-500/20", icon: Shield, label: "Low Risk", score: 25 },
  medium:{ color: "text-amber-400",   bg: "bg-amber-500/10",   border: "border-amber-500/30",   glow: "shadow-amber-500/20",   icon: Target, label: "Medium Risk", score: 50 },
  high:  { color: "text-orange-400",  bg: "bg-orange-500/10",  border: "border-orange-500/30",  glow: "shadow-orange-500/20",  icon: AlertTriangle, label: "High Risk", score: 75 },
  ultra: { color: "text-red-400",     bg: "bg-red-500/10",     border: "border-red-500/30",     glow: "shadow-red-500/20",     icon: Flame, label: "Ultra Risk", score: 100 },
};

const STATUS_META: Record<string, { color: string; bg: string; icon: typeof CheckCircle2; label: string }> = {
  active:    { color: "text-emerald-400", bg: "bg-emerald-500/10", icon: CheckCircle2, label: "Active" },
  expired:   { color: "text-slate-400",   bg: "bg-slate-500/10",   icon: Clock,        label: "Expired" },
  cancelled: { color: "text-red-400",     bg: "bg-red-500/10",     icon: XCircle,      label: "Cancelled" },
};

const CHART_COLORS = ["#f59e0b", "#10b981", "#3b82f6", "#ef4444", "#8b5cf6", "#06b6d4"];

const EMPTY_FORM = {
  name: "", description: "", dailyReturnPercent: 0.5, minInvestment: 100,
  maxInvestment: 5000, durationDays: 30, riskLevel: "medium", isActive: true,
};

function fmt(n: number) {
  if (!Number.isFinite(n)) return "0";
  if (Math.abs(n) >= 1_000_000) return "$" + (n / 1_000_000).toFixed(2) + "M";
  if (Math.abs(n) >= 1_000) return "$" + (n / 1_000).toFixed(1) + "K";
  return "$" + n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function fmtNum(n: number) {
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function timeAgo(iso?: string | null) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function daysLeft(iso?: string | null) {
  if (!iso) return 0;
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000));
}

function roiProjection(daily: number, amount: number, days: number) {
  const total = amount * (daily / 100) * days;
  const totalReturn = amount + total;
  return { earned: total, total: totalReturn, pct: (total / amount) * 100 };
}

// ─── ROI Calculator Preview ─────────────────────────────────────────────────
function RoiPreview({
  daily, min, max, days,
}: { daily: number; min: number; max: number; days: number }) {
  const mid = (min + max) / 2;
  const lo  = roiProjection(daily, min, days);
  const med = roiProjection(daily, mid, days);
  const hi  = roiProjection(daily, max, days);

  const rows = [
    { label: "Min", amount: min, earned: lo.earned, total: lo.total, pct: lo.pct },
    { label: "Mid", amount: mid, earned: med.earned, total: med.total, pct: med.pct },
    { label: "Max", amount: max, earned: hi.earned, total: hi.total, pct: hi.pct },
  ];

  return (
    <div className="rounded-xl gold-bg-soft border border-amber-500/20 p-3 space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-semibold gold-text">
        <Sparkles className="w-3.5 h-3.5" /> ROI Preview ({days}d at {daily}%/day)
      </div>
      <div className="grid grid-cols-3 gap-2">
        {rows.map(r => (
          <div key={r.label} className="rounded-lg bg-black/20 px-3 py-2 text-center">
            <div className="text-[10px] text-slate-400 font-medium mb-1">{r.label} ${fmtNum(r.amount)}</div>
            <div className="text-sm font-bold text-emerald-400">+{fmt(r.earned)}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">+{r.pct.toFixed(1)}%</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Plan Form ───────────────────────────────────────────────────────────────
function PlanForm({
  initial, onSave, onCancel,
}: {
  initial?: Partial<typeof EMPTY_FORM & { id: number }>;
  onSave: (data: any) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({ ...EMPTY_FORM, ...initial });
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const set = (k: keyof typeof EMPTY_FORM, v: any) =>
    setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.name) { toast({ title: "Plan name is required", variant: "destructive" }); return; }
    if (form.dailyReturnPercent <= 0) { toast({ title: "Daily return must be > 0", variant: "destructive" }); return; }
    if (form.minInvestment >= form.maxInvestment) { toast({ title: "Max investment must exceed min", variant: "destructive" }); return; }
    setSaving(true);
    try {
      await onSave({
        name: form.name,
        description: form.description || null,
        dailyReturnPercent: form.dailyReturnPercent,
        minInvestment: form.minInvestment,
        maxInvestment: form.maxInvestment,
        durationDays: form.durationDays,
        riskLevel: form.riskLevel,
        isActive: form.isActive,
      });
    } finally { setSaving(false); }
  };

  const risk = RISK_META[form.riskLevel] ?? RISK_META.medium;

  return (
    <div className="space-y-5 max-h-[75vh] overflow-y-auto pr-1">
      {/* Name + Description */}
      <div className="space-y-3">
        <div>
          <Label className="text-xs text-muted-foreground">Plan Name *</Label>
          <Input
            value={form.name}
            onChange={e => set("name", e.target.value)}
            placeholder="e.g. Gold Arbitrage Bot"
            className="mt-1.5 bg-white/5 border-white/10 text-white"
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Description</Label>
          <Textarea
            value={form.description}
            onChange={e => set("description", e.target.value)}
            placeholder="Short description shown to users..."
            rows={2}
            className="mt-1.5 bg-white/5 border-white/10 text-white resize-none"
          />
        </div>
      </div>

      {/* Daily Return Slider */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <Label className="text-xs text-muted-foreground">Daily Return %</Label>
          <span className="text-sm font-bold gold-text">{form.dailyReturnPercent.toFixed(2)}%</span>
        </div>
        <Slider
          min={0.1} max={5} step={0.05}
          value={[form.dailyReturnPercent]}
          onValueChange={([v]) => set("dailyReturnPercent", v)}
          className="mb-1"
        />
        <div className="flex justify-between text-[10px] text-slate-500">
          <span>0.10%</span><span>5.00%</span>
        </div>
      </div>

      {/* Duration Slider */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <Label className="text-xs text-muted-foreground">Duration</Label>
          <span className="text-sm font-bold text-blue-400">{form.durationDays} days</span>
        </div>
        <Slider
          min={7} max={365} step={1}
          value={[form.durationDays]}
          onValueChange={([v]) => set("durationDays", v)}
          className="mb-1"
        />
        <div className="flex justify-between text-[10px] text-slate-500">
          <span>7d</span><span>365d</span>
        </div>
      </div>

      {/* Investment Range */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs text-muted-foreground">Min Investment (USDT)</Label>
          <Input
            type="number" min={1}
            value={form.minInvestment}
            onChange={e => set("minInvestment", parseFloat(e.target.value) || 0)}
            className="mt-1.5 bg-white/5 border-white/10 text-white"
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Max Investment (USDT)</Label>
          <Input
            type="number" min={1}
            value={form.maxInvestment}
            onChange={e => set("maxInvestment", parseFloat(e.target.value) || 0)}
            className="mt-1.5 bg-white/5 border-white/10 text-white"
          />
        </div>
      </div>

      {/* Risk Level */}
      <div>
        <Label className="text-xs text-muted-foreground mb-2 block">Risk Level</Label>
        <div className="grid grid-cols-4 gap-2">
          {Object.entries(RISK_META).map(([key, meta]) => {
            const Icon = meta.icon;
            const active = form.riskLevel === key;
            return (
              <button
                key={key}
                onClick={() => set("riskLevel", key)}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-xl border p-2.5 text-xs font-semibold transition-all",
                  active
                    ? `${meta.bg} ${meta.border} ${meta.color} shadow-lg ${meta.glow}`
                    : "bg-white/5 border-white/10 text-slate-400 hover:bg-white/10"
                )}
              >
                <Icon className="w-4 h-4" />
                <span className="capitalize">{key}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all duration-300", {
                "bg-emerald-400 w-1/4": form.riskLevel === "low",
                "bg-amber-400 w-2/4":   form.riskLevel === "medium",
                "bg-orange-400 w-3/4":  form.riskLevel === "high",
                "bg-red-400 w-full":    form.riskLevel === "ultra",
              })}
            />
          </div>
          <span className={cn("text-xs font-medium", risk.color)}>{risk.label}</span>
        </div>
      </div>

      {/* ROI Preview */}
      <RoiPreview
        daily={form.dailyReturnPercent}
        min={form.minInvestment}
        max={form.maxInvestment}
        days={form.durationDays}
      />

      {/* Active Toggle */}
      <div className="flex items-center justify-between rounded-xl bg-white/5 border border-white/10 px-4 py-3">
        <div>
          <div className="text-sm font-medium text-white">Visible to Users</div>
          <div className="text-xs text-muted-foreground">Plan will appear in the user portal</div>
        </div>
        <Switch checked={form.isActive} onCheckedChange={v => set("isActive", v)} />
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <Button
          className="flex-1 gold-bg text-black font-semibold hover:opacity-90 transition-opacity"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? (
            <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Saving…</>
          ) : (
            <><Sparkles className="w-4 h-4 mr-2" /> Save Plan</>
          )}
        </Button>
        <Button
          variant="outline"
          className="border-white/10 text-white hover:bg-white/5"
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ─── Plan Card ───────────────────────────────────────────────────────────────
function PlanCard({
  plan,
  onEdit,
  onToggle,
  onDelete,
}: {
  plan: Plan;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const risk = RISK_META[plan.riskLevel] ?? RISK_META.medium;
  const RiskIcon = risk.icon;
  const roi = roiProjection(plan.dailyReturnPercent, plan.minInvestment, plan.durationDays);
  const totalRoi = plan.dailyReturnPercent * plan.durationDays;

  return (
    <div className={cn(
      "premium-card rounded-2xl overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl group",
      !plan.isActive && "opacity-60"
    )}>
      {/* Top band */}
      <div className={cn("h-1 w-full", {
        "bg-gradient-to-r from-emerald-500 to-emerald-400": plan.riskLevel === "low",
        "bg-gradient-to-r from-amber-500 to-amber-400":    plan.riskLevel === "medium",
        "bg-gradient-to-r from-orange-500 to-orange-400":  plan.riskLevel === "high",
        "bg-gradient-to-r from-red-500 to-red-400":        plan.riskLevel === "ultra",
      })} />

      <div className="p-5">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Badge
                variant="outline"
                className={cn("text-[10px] px-2 py-0.5 font-semibold border", risk.bg, risk.border, risk.color)}
              >
                <RiskIcon className="w-2.5 h-2.5 mr-1" />
                {risk.label}
              </Badge>
              {plan.isActive ? (
                <Badge className="text-[10px] px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/10">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1 inline-block animate-pulse" />
                  Live
                </Badge>
              ) : (
                <Badge className="text-[10px] px-2 py-0.5 bg-slate-500/10 text-slate-400 border border-slate-500/30 hover:bg-slate-500/10">
                  Inactive
                </Badge>
              )}
            </div>
            <h3 className="text-base font-bold text-white truncate">{plan.name}</h3>
            {plan.description && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{plan.description}</p>
            )}
          </div>
          <div className="stat-orb w-10 h-10 rounded-xl flex items-center justify-center shrink-0">
            <Bot className="w-5 h-5 text-amber-300" />
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="rounded-xl bg-white/5 border border-white/8 p-3 text-center">
            <div className="text-[10px] text-muted-foreground mb-1">Daily</div>
            <div className="text-base font-bold gold-text">{plan.dailyReturnPercent}%</div>
          </div>
          <div className="rounded-xl bg-white/5 border border-white/8 p-3 text-center">
            <div className="text-[10px] text-muted-foreground mb-1">Duration</div>
            <div className="text-base font-bold text-blue-400">{plan.durationDays}d</div>
          </div>
          <div className="rounded-xl bg-white/5 border border-white/8 p-3 text-center">
            <div className="text-[10px] text-muted-foreground mb-1">Total ROI</div>
            <div className="text-base font-bold text-emerald-400">+{totalRoi.toFixed(1)}%</div>
          </div>
        </div>

        {/* Investment range */}
        <div className="flex items-center justify-between mb-3 rounded-xl bg-white/5 border border-white/8 px-3 py-2">
          <div className="text-[10px] text-muted-foreground">Investment Range</div>
          <div className="text-xs font-semibold text-white">
            ${fmtNum(plan.minInvestment)} – ${fmtNum(plan.maxInvestment)} USDT
          </div>
        </div>

        {/* ROI bar */}
        <div className="mb-4">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1.5">
            <span>Estimated profit on ${fmtNum(plan.minInvestment)}</span>
            <span className="text-emerald-400 font-semibold">+{fmt(roi.earned)}</span>
          </div>
          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div
              className={cn("h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-700")}
              style={{ width: `${Math.min(100, totalRoi)}%` }}
            />
          </div>
        </div>

        {/* Footer row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Users className="w-3.5 h-3.5" />
            <span>{plan.totalInvestors} investor{plan.totalInvestors !== 1 ? "s" : ""}</span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost" size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-white"
              onClick={onToggle}
              title={plan.isActive ? "Deactivate" : "Activate"}
            >
              {plan.isActive ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </Button>
            <Button
              variant="ghost" size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-white"
              onClick={onEdit}
              title="Edit plan"
            >
              <Pencil className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="ghost" size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-red-400"
              onClick={onDelete}
              title="Delete plan"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Custom Tooltip ──────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#1a1f2e] border border-white/10 rounded-xl px-3 py-2 text-xs shadow-xl">
      <div className="text-muted-foreground mb-1">{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-white font-medium">{p.name}: </span>
          <span style={{ color: p.color }}>{typeof p.value === "number" && p.value > 100 ? fmt(p.value) : p.value}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function AITradingPlansPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [editPlan, setEditPlan] = useState<Plan | null>(null);
  const [deletePlan, setDeletePlan] = useState<Plan | null>(null);
  const [subSearch, setSubSearch] = useState("");
  const [subStatusFilter, setSubStatusFilter] = useState("all");
  const [expandedPlan, setExpandedPlan] = useState<number | null>(null);

  const { data: plans = [], isLoading: plansLoading } = useQuery<Plan[]>({
    queryKey: ["/admin/ai-trading/plans"],
    queryFn: () => get<Plan[]>("/admin/ai-trading/plans"),
    refetchInterval: 30000,
  });

  const { data: subs = [], isLoading: subsLoading } = useQuery<Subscription[]>({
    queryKey: ["/admin/ai-trading/subscriptions"],
    queryFn: () => get<Subscription[]>("/admin/ai-trading/subscriptions"),
    refetchInterval: 30000,
  });

  const { data: stats } = useQuery<Stats>({
    queryKey: ["/admin/ai-trading/stats"],
    queryFn: () => get<Stats>("/admin/ai-trading/stats"),
    refetchInterval: 30000,
  });

  const { data: heroStats } = useQuery<HeroStats>({
    queryKey: ["/admin/ai-trading/hero-stats"],
    queryFn: () => get<HeroStats>("/admin/ai-trading/hero-stats"),
  });

  const [heroForm, setHeroForm] = useState({ baseVolume: "", baseBots: "", winRate: "", avgApy: "" });
  const [heroSaving, setHeroSaving] = useState(false);

  useEffect(() => {
    if (heroStats) {
      setHeroForm({
        baseVolume: heroStats.baseVolume,
        baseBots: heroStats.baseBots,
        winRate: heroStats.winRate,
        avgApy: heroStats.avgApy,
      });
    }
  }, [heroStats]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["/admin/ai-trading/plans"] });
    qc.invalidateQueries({ queryKey: ["/admin/ai-trading/subscriptions"] });
    qc.invalidateQueries({ queryKey: ["/admin/ai-trading/stats"] });
  };

  const createMut = useMutation({
    mutationFn: (data: any) => post("/admin/ai-trading/plans", data),
    onSuccess: () => { toast({ title: "Plan created successfully" }); setCreateOpen(false); invalidate(); },
    onError: (e: any) => toast({ title: "Failed to create", description: e.message, variant: "destructive" }),
  });

  const editMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => patch(`/admin/ai-trading/plans/${id}`, data),
    onSuccess: () => { toast({ title: "Plan updated" }); setEditPlan(null); invalidate(); },
    onError: (e: any) => toast({ title: "Failed to update", description: e.message, variant: "destructive" }),
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      patch(`/admin/ai-trading/plans/${id}`, { isActive }),
    onSuccess: () => invalidate(),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => del(`/admin/ai-trading/plans/${id}`),
    onSuccess: () => { toast({ title: "Plan deactivated" }); setDeletePlan(null); invalidate(); },
  });

  // Analytics data
  const planEarningsData = useMemo(() => {
    return plans.map(p => {
      const planSubs = subs.filter(s => s.planId === p.id);
      const earned = planSubs.reduce((a, s) => a + s.totalEarned, 0);
      const invested = planSubs.reduce((a, s) => a + s.investedAmount, 0);
      return { name: p.name.length > 12 ? p.name.slice(0, 12) + "…" : p.name, earned, invested, investors: p.totalInvestors };
    });
  }, [plans, subs]);

  const riskDistData = useMemo(() => {
    const groups: Record<string, number> = {};
    plans.forEach(p => { groups[p.riskLevel] = (groups[p.riskLevel] ?? 0) + 1; });
    return Object.entries(groups).map(([name, value]) => ({
      name: RISK_META[name]?.label ?? name,
      value,
      color: { low: "#10b981", medium: "#f59e0b", high: "#f97316", ultra: "#ef4444" }[name] ?? "#6b7280",
    }));
  }, [plans]);

  const dailyEarningsData = useMemo(() => {
    const byDay: Record<string, number> = {};
    subs.forEach(s => {
      if (!s.startedAt) return;
      const d = new Date(s.startedAt).toLocaleDateString("en-IN", { month: "short", day: "numeric" });
      byDay[d] = (byDay[d] ?? 0) + s.totalEarned;
    });
    return Object.entries(byDay).slice(-14).map(([date, earned]) => ({ date, earned }));
  }, [subs]);

  // Filtered subs
  const filteredSubs = useMemo(() => subs.filter(s => {
    const matchSearch = !subSearch ||
      s.userEmail?.toLowerCase().includes(subSearch.toLowerCase()) ||
      s.userName?.toLowerCase().includes(subSearch.toLowerCase()) ||
      s.planName?.toLowerCase().includes(subSearch.toLowerCase());
    const matchStatus = subStatusFilter === "all" || s.status === subStatusFilter;
    return matchSearch && matchStatus;
  }), [subs, subSearch, subStatusFilter]);

  const activePlans = plans.filter(p => p.isActive);
  const totalInvested = subs.filter(s => s.status === "active").reduce((a, s) => a + s.investedAmount, 0);
  const totalEarned = subs.reduce((a, s) => a + s.totalEarned, 0);

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        eyebrow="AI Engine"
        title="AI Trading Plans"
        description="Manage automated bot investment plans, track subscriptions, and monitor performance analytics."
        actions={
          <Button
            className="gold-bg text-black font-semibold hover:opacity-90 transition-opacity gap-2"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="w-4 h-4" /> New Plan
          </Button>
        }
      />

      {/* Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <PremiumStatCard
          title="Active Plans" hero
          value={activePlans.length}
          icon={Bot}
          suffix={` / ${plans.length}`}
          hint="Total plans configured"
          loading={plansLoading}
        />
        <PremiumStatCard
          title="Active Bots"
          value={stats?.activeSubscriptions ?? 0}
          icon={Zap}
          hint={`${stats?.totalSubscriptions ?? 0} total subscriptions`}
          loading={!stats}
        />
        <PremiumStatCard
          title="Total Invested"
          value={fmtNum(totalInvested)}
          icon={DollarSign}
          prefix="$"
          hint="Active subscriptions only"
          loading={subsLoading}
        />
        <PremiumStatCard
          title="Total Paid Out"
          value={fmtNum(stats?.totalEarningsPaid ?? 0)}
          icon={TrendingUp}
          prefix="$"
          hint="All-time earnings distributed"
          loading={!stats}
          accent
        />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="plans">
        <TabsList className="bg-white/5 border border-white/10 p-1 gap-1">
          <TabsTrigger value="plans" className="data-[state=active]:gold-bg data-[state=active]:text-black font-medium text-sm gap-2">
            <Layers className="w-4 h-4" /> Plans
            <span className="ml-1 text-xs opacity-70">({plans.length})</span>
          </TabsTrigger>
          <TabsTrigger value="subscriptions" className="data-[state=active]:gold-bg data-[state=active]:text-black font-medium text-sm gap-2">
            <Users className="w-4 h-4" /> Subscriptions
            <span className="ml-1 text-xs opacity-70">({subs.length})</span>
          </TabsTrigger>
          <TabsTrigger value="analytics" className="data-[state=active]:gold-bg data-[state=active]:text-black font-medium text-sm gap-2">
            <BarChart2 className="w-4 h-4" /> Analytics
          </TabsTrigger>
          <TabsTrigger value="hero-stats" className="data-[state=active]:gold-bg data-[state=active]:text-black font-medium text-sm gap-2">
            <Settings2 className="w-4 h-4" /> Hero Stats
          </TabsTrigger>
        </TabsList>

        {/* ── PLANS TAB ── */}
        <TabsContent value="plans" className="mt-5">
          {plansLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="premium-card rounded-2xl h-72 animate-pulse" />
              ))}
            </div>
          ) : plans.length === 0 ? (
            <div className="premium-card rounded-2xl flex flex-col items-center justify-center py-24 text-center">
              <div className="stat-orb w-16 h-16 rounded-2xl flex items-center justify-center mb-4">
                <Bot className="w-8 h-8 text-amber-300" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">No Trading Plans</h3>
              <p className="text-muted-foreground text-sm max-w-xs mb-6">
                Create your first AI trading plan to start attracting investors and generating returns.
              </p>
              <Button
                className="gold-bg text-black font-semibold hover:opacity-90 gap-2"
                onClick={() => setCreateOpen(true)}
              >
                <Plus className="w-4 h-4" /> Create First Plan
              </Button>
            </div>
          ) : (
            <>
              {/* Active / Inactive sections */}
              {activePlans.length > 0 && (
                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-xs font-semibold text-emerald-400 uppercase tracking-widest">Active Plans</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {activePlans.map(plan => (
                      <PlanCard
                        key={plan.id}
                        plan={plan}
                        onEdit={() => setEditPlan(plan)}
                        onToggle={() => toggleMut.mutate({ id: plan.id, isActive: !plan.isActive })}
                        onDelete={() => setDeletePlan(plan)}
                      />
                    ))}
                  </div>
                </div>
              )}
              {plans.filter(p => !p.isActive).length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="w-2 h-2 rounded-full bg-slate-500" />
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Inactive Plans</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {plans.filter(p => !p.isActive).map(plan => (
                      <PlanCard
                        key={plan.id}
                        plan={plan}
                        onEdit={() => setEditPlan(plan)}
                        onToggle={() => toggleMut.mutate({ id: plan.id, isActive: !plan.isActive })}
                        onDelete={() => setDeletePlan(plan)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </TabsContent>

        {/* ── SUBSCRIPTIONS TAB ── */}
        <TabsContent value="subscriptions" className="mt-5">
          <SectionCard
            title="All Subscriptions"
            icon={Users}
            description={`${filteredSubs.length} records`}
            actions={
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Search user or plan…"
                  value={subSearch}
                  onChange={e => setSubSearch(e.target.value)}
                  className="w-48 h-8 text-xs bg-white/5 border-white/10"
                />
                <Select value={subStatusFilter} onValueChange={setSubStatusFilter}>
                  <SelectTrigger className="h-8 w-28 text-xs bg-white/5 border-white/10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="expired">Expired</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            }
            padded={false}
          >
            {subsLoading ? (
              <div className="space-y-2 p-4">
                {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-14 rounded-lg bg-white/5 animate-pulse" />)}
              </div>
            ) : filteredSubs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <Users className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p className="text-muted-foreground text-sm">No subscriptions found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/8 text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">
                      <th className="text-left px-4 py-3">User</th>
                      <th className="text-left px-4 py-3">Plan</th>
                      <th className="text-right px-4 py-3">Invested</th>
                      <th className="text-right px-4 py-3">Earned</th>
                      <th className="text-right px-4 py-3">ROI%</th>
                      <th className="text-right px-4 py-3">Expires</th>
                      <th className="text-center px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSubs.map(s => {
                      const status = STATUS_META[s.status] ?? STATUS_META.active;
                      const StatusIcon = status.icon;
                      const roiPct = s.investedAmount > 0 ? (s.totalEarned / s.investedAmount) * 100 : 0;
                      const days = daysLeft(s.expiresAt);
                      return (
                        <tr key={s.id} className="border-b border-white/5 hover:bg-white/4 transition-colors">
                          <td className="px-4 py-3">
                            <div className="font-medium text-white text-xs">{s.userName || "—"}</div>
                            <div className="text-[11px] text-muted-foreground">{s.userEmail || "—"}</div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-xs text-white font-medium">{s.planName || "—"}</div>
                            <div className="text-[11px] text-muted-foreground">ID #{s.planId}</div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="text-xs font-semibold text-white">{fmt(s.investedAmount)}</div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="text-xs font-semibold text-emerald-400">+{fmt(s.totalEarned)}</div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className={cn("text-xs font-bold", roiPct > 0 ? "text-emerald-400" : "text-slate-400")}>
                              {roiPct > 0 ? "+" : ""}{roiPct.toFixed(2)}%
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            {s.status === "active" ? (
                              <div className="text-xs text-blue-400 font-medium">{days}d left</div>
                            ) : (
                              <div className="text-xs text-muted-foreground">{timeAgo(s.expiresAt)}</div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex justify-center">
                              <span className={cn("flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full", status.bg, status.color)}>
                                <StatusIcon className="w-2.5 h-2.5" />
                                {status.label}
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </TabsContent>

        {/* ── ANALYTICS TAB ── */}
        <TabsContent value="analytics" className="mt-5 space-y-5">
          {/* Top row: Earnings Area + Pie */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Earnings over time */}
            <SectionCard title="Earnings Trend" icon={TrendingUp} description="Last 14 days" className="lg:col-span-2">
              {dailyEarningsData.length === 0 ? (
                <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
                  No earnings data yet
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={dailyEarningsData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="earnGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => fmtNum(v) + " USDT"} />
                    <Tooltip content={<ChartTooltip />} />
                    <Area type="monotone" dataKey="earned" name="Earnings" stroke="#f59e0b" strokeWidth={2} fill="url(#earnGrad)" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </SectionCard>

            {/* Risk distribution pie */}
            <SectionCard title="Risk Distribution" icon={Shield} description="Plans by risk level">
              {riskDistData.length === 0 ? (
                <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
                  No plans yet
                </div>
              ) : (
                <div className="flex flex-col items-center">
                  <ResponsiveContainer width="100%" height={160}>
                    <PieChart>
                      <Pie
                        data={riskDistData}
                        cx="50%" cy="50%"
                        innerRadius={45} outerRadius={70}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {riskDistData.map((d, i) => (
                          <Cell key={i} fill={d.color} strokeWidth={0} />
                        ))}
                      </Pie>
                      <Tooltip content={<ChartTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex flex-wrap gap-2 justify-center mt-1">
                    {riskDistData.map(d => (
                      <div key={d.name} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <span className="w-2 h-2 rounded-full" style={{ background: d.color }} />
                        {d.name} ({d.value})
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </SectionCard>
          </div>

          {/* Plan performance bar chart */}
          <SectionCard title="Plan Performance Comparison" icon={BarChart2} description="Invested vs earned by plan">
            {planEarningsData.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
                No plan data yet
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={planEarningsData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => fmtNum(v) + " USDT"} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend
                    wrapperStyle={{ fontSize: 11, color: "#64748b" }}
                    formatter={v => <span style={{ color: "#94a3b8" }}>{v}</span>}
                  />
                  <Bar dataKey="invested" name="Invested" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={32} />
                  <Bar dataKey="earned" name="Earned" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={32} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </SectionCard>

          {/* Per-plan subscriber breakdown */}
          <SectionCard title="Plan Leaderboard" icon={Award} description="Plans ranked by investor count">
            {plans.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground text-sm">No plans configured</div>
            ) : (
              <div className="space-y-3">
                {[...plans].sort((a, b) => b.totalInvestors - a.totalInvestors).map((plan, idx) => {
                  const risk = RISK_META[plan.riskLevel] ?? RISK_META.medium;
                  const planSubs = subs.filter(s => s.planId === plan.id);
                  const planEarned = planSubs.reduce((a, s) => a + s.totalEarned, 0);
                  const planInvested = planSubs.reduce((a, s) => a + s.investedAmount, 0);
                  const maxInvestors = Math.max(...plans.map(p => p.totalInvestors), 1);
                  return (
                    <div key={plan.id} className="flex items-center gap-4 rounded-xl bg-white/4 border border-white/8 px-4 py-3">
                      <div className={cn(
                        "w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0",
                        idx === 0 ? "gold-bg text-black" : "bg-white/10 text-muted-foreground"
                      )}>
                        {idx + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-semibold text-white truncate">{plan.name}</span>
                          <Badge variant="outline" className={cn("text-[10px] shrink-0", risk.bg, risk.border, risk.color)}>
                            {plan.riskLevel}
                          </Badge>
                        </div>
                        <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                          <div
                            className="h-full rounded-full gold-bg transition-all duration-700"
                            style={{ width: `${(plan.totalInvestors / maxInvestors) * 100}%` }}
                          />
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xs font-bold text-white">{plan.totalInvestors} investors</div>
                        <div className="text-[11px] text-emerald-400">+{fmt(planEarned)} earned</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>
        </TabsContent>

        {/* ── HERO STATS TAB ── */}
        <TabsContent value="hero-stats" className="mt-5">
          <SectionCard
            title="Hero Section Stats"
            description="These numbers appear on the AI Trading page for all visitors. 'Active Bots' displayed = Base Bots + real subscriber count from DB."
          >
            <div className="space-y-6">
              {/* Info banner */}
              <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
                <Sparkles className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="text-sm text-amber-300/90">
                  <span className="font-semibold">Active Bots</span> shown to users = <span className="font-mono">Base Bots ({heroForm.baseBots || heroStats?.baseBots || "12000"})</span> + <span className="font-semibold text-emerald-400">{stats?.activeSubscriptions ?? 0} real subscribers</span> = <span className="font-bold text-white">{(parseInt(heroForm.baseBots || heroStats?.baseBots || "12000", 10) + (stats?.activeSubscriptions ?? 0)).toLocaleString()}</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {/* Base Volume */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-white flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-amber-400" />
                    Base Volume (USD)
                  </Label>
                  <Input
                    type="number"
                    className="bg-white/5 border-white/10 text-white"
                    placeholder="e.g. 284000000"
                    value={heroForm.baseVolume}
                    onChange={e => setHeroForm(f => ({ ...f, baseVolume: e.target.value }))}
                  />
                  <p className="text-[11px] text-muted-foreground">Displays as "$284M+" or "$1.2B+" depending on the value</p>
                </div>

                {/* Base Bots */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-white flex items-center gap-2">
                    <Bot className="w-4 h-4 text-emerald-400" />
                    Base Bots Count
                  </Label>
                  <Input
                    type="number"
                    className="bg-white/5 border-white/10 text-white"
                    placeholder="e.g. 12000"
                    value={heroForm.baseBots}
                    onChange={e => setHeroForm(f => ({ ...f, baseBots: e.target.value }))}
                  />
                  <p className="text-[11px] text-muted-foreground">Real subscriber count ({stats?.activeSubscriptions ?? 0} now) is added on top automatically</p>
                </div>

                {/* Win Rate */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-white flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-amber-400" />
                    Win Rate (%)
                  </Label>
                  <Input
                    type="number"
                    step="0.1"
                    className="bg-white/5 border-white/10 text-white"
                    placeholder="e.g. 74.6"
                    value={heroForm.winRate}
                    onChange={e => setHeroForm(f => ({ ...f, winRate: e.target.value }))}
                  />
                  <p className="text-[11px] text-muted-foreground">Shown as "74.6%" in ticker and trust stats</p>
                </div>

                {/* Avg APY */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-white flex items-center gap-2">
                    <Zap className="w-4 h-4 text-rose-400" />
                    Average APY (%)
                  </Label>
                  <Input
                    type="number"
                    className="bg-white/5 border-white/10 text-white"
                    placeholder="e.g. 156"
                    value={heroForm.avgApy}
                    onChange={e => setHeroForm(f => ({ ...f, avgApy: e.target.value }))}
                  />
                  <p className="text-[11px] text-muted-foreground">Shown as "156%" in ticker and trust stats</p>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-white/10">
                <div className="text-xs text-muted-foreground">
                  Changes apply immediately to the user portal hero section.
                </div>
                <Button
                  className="gold-bg text-black font-semibold hover:opacity-90 gap-2"
                  disabled={heroSaving}
                  onClick={async () => {
                    setHeroSaving(true);
                    try {
                      await put("/admin/ai-trading/hero-stats", {
                        baseVolume: heroForm.baseVolume,
                        baseBots: heroForm.baseBots,
                        winRate: heroForm.winRate,
                        avgApy: heroForm.avgApy,
                      });
                      qc.invalidateQueries({ queryKey: ["/admin/ai-trading/hero-stats"] });
                      toast({ title: "Hero stats saved", description: "User portal will reflect changes on next refresh." });
                    } catch (e: any) {
                      toast({ title: "Save failed", description: e.message, variant: "destructive" });
                    } finally {
                      setHeroSaving(false);
                    }
                  }}
                >
                  {heroSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {heroSaving ? "Saving…" : "Save Stats"}
                </Button>
              </div>
            </div>
          </SectionCard>
        </TabsContent>
      </Tabs>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="bg-[#12151f] border-white/10 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="stat-orb w-8 h-8 rounded-lg flex items-center justify-center">
                <Bot className="w-4 h-4 text-amber-300" />
              </div>
              Create AI Trading Plan
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-sm">
              Configure a new automated bot investment plan for users.
            </DialogDescription>
          </DialogHeader>
          <PlanForm
            onSave={async (data) => { await createMut.mutateAsync(data); }}
            onCancel={() => setCreateOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editPlan} onOpenChange={open => !open && setEditPlan(null)}>
        <DialogContent className="bg-[#12151f] border-white/10 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="stat-orb w-8 h-8 rounded-lg flex items-center justify-center">
                <Pencil className="w-4 h-4 text-amber-300" />
              </div>
              Edit — {editPlan?.name}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-sm">
              Update the configuration for this AI trading plan.
            </DialogDescription>
          </DialogHeader>
          {editPlan && (
            <PlanForm
              initial={{
                name: editPlan.name,
                description: editPlan.description ?? "",
                dailyReturnPercent: editPlan.dailyReturnPercent,
                minInvestment: editPlan.minInvestment,
                maxInvestment: editPlan.maxInvestment,
                durationDays: editPlan.durationDays,
                riskLevel: editPlan.riskLevel,
                isActive: editPlan.isActive,
              }}
              onSave={async (data) => { await editMut.mutateAsync({ id: editPlan.id, data }); }}
              onCancel={() => setEditPlan(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deletePlan} onOpenChange={open => !open && setDeletePlan(null)}>
        <AlertDialogContent className="bg-[#12151f] border-white/10 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate this plan?</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              <strong className="text-white">"{deletePlan?.name}"</strong> will be deactivated and hidden from users.
              Existing subscriptions will not be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-white/10 hover:bg-white/5">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-500 hover:bg-red-600 text-white"
              onClick={() => deletePlan && deleteMut.mutate(deletePlan.id)}
            >
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
