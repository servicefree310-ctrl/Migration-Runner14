import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, put, patch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  Brain, Users, TrendingUp, BarChart2, Settings2, RefreshCw,
  PiggyBank, Activity, Play, Pause, Plus, Minus, Save,
  IndianRupee, Zap, CircleDot, CircleOff, Pencil, AlertTriangle,
} from "lucide-react";
import { PageHeader } from "@/components/premium/PageHeader";
import { PremiumStatCard } from "@/components/premium/PremiumStatCard";
import { SectionCard } from "@/components/premium/SectionCard";
import { cn } from "@/lib/utils";

/* ─── Types ─────────────────────────────────────────────────────────────── */
interface Settings {
  enabled: boolean;
  minDepositInr: number;
  dailyRateMin: number;
  dailyRateMax: number;
  tickIntervalMin: number;
}

interface Stats {
  activeAccounts: number;
  totalAccounts: number;
  tvlInr: number;
  totalEarnedInr: number;
  totalDepositedInr: number;
  totalTrades: number;
  winTrades: number;
  winRate: number;
}

interface Account {
  id: number;
  userId: number;
  userName: string | null;
  userEmail: string | null;
  balance: number;
  totalDeposited: number;
  totalWithdrawn: number;
  totalEarned: number;
  dailyRatePct: number;
  status: string;
  reinvestMode: string;
  createdAt: string;
  updatedAt: string;
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */
function inr(n: number) {
  return "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

/* ─── Edit Account Dialog ────────────────────────────────────────────────── */
function EditAccountDialog({ account, open, onClose, onDone }: {
  account: Account | null;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [dailyRate, setDailyRate] = useState(String(account?.dailyRatePct ?? 0.75));
  const [creditAmt, setCreditAmt] = useState("");
  const [debitAmt,  setDebitAmt]  = useState("");
  const [note,      setNote]      = useState("");

  const mut = useMutation({
    mutationFn: (body: any) =>
      patch(`/admin/auto-invest/accounts/${account?.userId}`, body),
    onSuccess: () => { toast({ title: "Account updated" }); onDone(); },
    onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
  });

  const toggleStatus = () =>
    mut.mutate({ status: account?.status === "active" ? "paused" : "active" });

  const saveRate = () =>
    mut.mutate({ dailyRatePct: parseFloat(dailyRate) });

  const doCredit = () => {
    const amt = parseFloat(creditAmt);
    if (amt > 0) mut.mutate({ creditInr: amt, note });
  };

  const doDebit = () => {
    const amt = parseFloat(debitAmt);
    if (amt > 0) mut.mutate({ debitInr: amt, note });
  };

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-lg bg-card border-border text-foreground">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="w-4 h-4 text-amber-400" />
            Manage Account — {account?.userEmail ?? `User #${account?.userId}`}
          </DialogTitle>
          <DialogDescription>
            Balance: <strong>{inr(account?.balance ?? 0)}</strong> · Earned: <strong>{inr(account?.totalEarned ?? 0)}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Status toggle */}
          <div className="flex items-center justify-between rounded-xl border border-border/60 p-3 bg-muted/20">
            <div>
              <div className="text-sm font-semibold">Engine Status</div>
              <div className="text-xs text-muted-foreground">
                Currently: <span className={account?.status === "active" ? "text-emerald-400" : "text-amber-400"}>
                  {account?.status ?? "unknown"}
                </span>
              </div>
            </div>
            <Button
              size="sm" variant="outline"
              className={cn("gap-1.5", account?.status === "active" ? "border-amber-500/30 text-amber-400 hover:bg-amber-500/10" : "border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10")}
              onClick={toggleStatus}
              disabled={mut.isPending}
            >
              {account?.status === "active" ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
              {account?.status === "active" ? "Pause" : "Resume"}
            </Button>
          </div>

          {/* Daily rate */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Daily Return Rate (%)</Label>
            <div className="flex items-center gap-3">
              <Slider
                min={0.1} max={5} step={0.05}
                value={[parseFloat(dailyRate) || 0.75]}
                onValueChange={([v]) => setDailyRate(v.toFixed(2))}
                className="flex-1"
              />
              <Input
                type="number" min={0.1} max={5} step={0.05}
                value={dailyRate}
                onChange={e => setDailyRate(e.target.value)}
                className="w-20 text-center bg-muted/30 border-border/60"
              />
              <span className="text-muted-foreground text-sm">%</span>
            </div>
            <Button size="sm" variant="outline" className="gap-1.5 border-amber-500/30 text-amber-400 hover:bg-amber-500/10" onClick={saveRate} disabled={mut.isPending}>
              <Save className="w-3.5 h-3.5" /> Save Rate
            </Button>
          </div>

          {/* Note */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Note (for ledger)</Label>
            <Input
              value={note} onChange={e => setNote(e.target.value)}
              placeholder="Reason for adjustment…"
              className="bg-muted/30 border-border/60 text-sm"
            />
          </div>

          {/* Manual credit / debit */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-emerald-400 flex items-center gap-1"><Plus className="w-3 h-3" />Credit (INR)</Label>
              <div className="flex gap-1.5">
                <span className="flex items-center text-muted-foreground text-sm">₹</span>
                <Input
                  type="number" min={0} placeholder="0"
                  value={creditAmt} onChange={e => setCreditAmt(e.target.value)}
                  className="bg-muted/30 border-border/60 text-sm"
                />
              </div>
              <Button size="sm" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white gap-1" onClick={doCredit} disabled={mut.isPending || !creditAmt}>
                <Plus className="w-3 h-3" /> Credit
              </Button>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-rose-400 flex items-center gap-1"><Minus className="w-3 h-3" />Debit (INR)</Label>
              <div className="flex gap-1.5">
                <span className="flex items-center text-muted-foreground text-sm">₹</span>
                <Input
                  type="number" min={0} placeholder="0"
                  value={debitAmt} onChange={e => setDebitAmt(e.target.value)}
                  className="bg-muted/30 border-border/60 text-sm"
                />
              </div>
              <Button size="sm" variant="destructive" className="w-full gap-1" onClick={doDebit} disabled={mut.isPending || !debitAmt}>
                <Minus className="w-3 h-3" /> Debit
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────────────── */
export default function AutoInvestAdminPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [editAccount, setEditAccount] = useState<Account | null>(null);

  const settingsQ = useQuery<Settings>({
    queryKey: ["admin-auto-invest-settings"],
    queryFn:  () => get<Settings>("/admin/auto-invest/settings"),
  });

  const statsQ = useQuery<Stats>({
    queryKey: ["admin-auto-invest-stats"],
    queryFn:  () => get<Stats>("/admin/auto-invest/stats"),
    refetchInterval: 30_000,
  });

  const accountsQ = useQuery<Account[]>({
    queryKey: ["admin-auto-invest-accounts"],
    queryFn:  () => get<Account[]>("/admin/auto-invest/accounts?limit=200"),
    refetchInterval: 30_000,
  });

  const settings  = settingsQ.data;
  const stats     = statsQ.data;
  const accounts  = accountsQ.data ?? [];

  /* Local settings state */
  const [localSettings, setLocalSettings] = useState<Partial<Settings>>({});
  const merged: Settings = {
    enabled:         localSettings.enabled         ?? settings?.enabled         ?? true,
    minDepositInr:   localSettings.minDepositInr   ?? settings?.minDepositInr   ?? 100,
    dailyRateMin:    localSettings.dailyRateMin    ?? settings?.dailyRateMin    ?? 0.5,
    dailyRateMax:    localSettings.dailyRateMax    ?? settings?.dailyRateMax    ?? 1.0,
    tickIntervalMin: localSettings.tickIntervalMin ?? settings?.tickIntervalMin ?? 3,
  };

  const saveSettings = useMutation({
    mutationFn: (body: Partial<Settings>) => put("/admin/auto-invest/settings", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-auto-invest-settings"] });
      setLocalSettings({});
      toast({ title: "Settings saved" });
    },
    onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
  });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["admin-auto-invest-accounts"] });
    qc.invalidateQueries({ queryKey: ["admin-auto-invest-stats"] });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Auto Invest"
        eyebrow="Earn & CMS"
        description="Manage the INR auto-invest feature — settings, user accounts, and daily returns."
      />

      {/* ── Stats Row ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <PremiumStatCard
          title="Total Value Locked"
          value={inr(stats?.tvlInr ?? 0)}
          icon={IndianRupee}
          hint="Active auto-invest balances"
        />
        <PremiumStatCard
          title="Total Earned"
          value={inr(stats?.totalEarnedInr ?? 0)}
          icon={TrendingUp}
          hint="All-time profit credited"
        />
        <PremiumStatCard
          title="Active Accounts"
          value={String(stats?.activeAccounts ?? 0)}
          icon={Users}
          hint={`of ${stats?.totalAccounts ?? 0} total`}
        />
        <PremiumStatCard
          title="Win Rate"
          value={`${(stats?.winRate ?? 0).toFixed(1)}%`}
          icon={BarChart2}
          hint={`${stats?.winTrades ?? 0} / ${stats?.totalTrades ?? 0} trades`}
        />
      </div>

      {/* ── Tabs ── */}
      <Tabs defaultValue="accounts">
        <TabsList>
          <TabsTrigger value="accounts" className="gap-1.5"><Users className="w-4 h-4" />User Accounts</TabsTrigger>
          <TabsTrigger value="settings" className="gap-1.5"><Settings2 className="w-4 h-4" />Global Settings</TabsTrigger>
        </TabsList>

        {/* ── USER ACCOUNTS ── */}
        <TabsContent value="accounts" className="mt-4">
          <SectionCard
            title="All Auto-Invest Accounts"
            description={`${accounts.length} accounts found`}
            actions={
              <Button size="sm" variant="outline" className="gap-1.5" onClick={invalidateAll}>
                <RefreshCw className="w-3.5 h-3.5" /> Refresh
              </Button>
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60">
                    {["User", "Balance", "Deposited", "Earned", "Rate/Day", "Mode", "Status", ""].map(h => (
                      <th key={h} className="text-left py-2.5 px-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {accounts.map(a => (
                    <tr key={a.id} className="border-b border-border/30 hover:bg-muted/20 transition-colors">
                      <td className="py-2.5 px-3">
                        <div className="font-medium text-sm">{a.userName ?? "—"}</div>
                        <div className="text-[11px] text-muted-foreground">{a.userEmail}</div>
                      </td>
                      <td className="py-2.5 px-3 font-semibold">{inr(a.balance)}</td>
                      <td className="py-2.5 px-3 text-muted-foreground">{inr(a.totalDeposited)}</td>
                      <td className="py-2.5 px-3 text-emerald-400 font-medium">{inr(a.totalEarned)}</td>
                      <td className="py-2.5 px-3">
                        <span className="text-amber-400 font-bold">{a.dailyRatePct.toFixed(2)}%</span>
                      </td>
                      <td className="py-2.5 px-3">
                        <Badge className={cn("text-[10px]",
                          a.reinvestMode === "reinvest"
                            ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                            : "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                        )}>
                          {a.reinvestMode === "reinvest" ? "Compound" : "INR Wallet"}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3">
                        <Badge className={cn("text-[10px]",
                          a.status === "active"
                            ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                            : "bg-rose-500/15 text-rose-400 border-rose-500/30"
                        )}>
                          {a.status === "active"
                            ? <CircleDot className="inline w-2.5 h-2.5 mr-1" />
                            : <CircleOff className="inline w-2.5 h-2.5 mr-1" />
                          }
                          {a.status}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3">
                        <Button size="sm" variant="ghost" className="h-7 px-2 gap-1 text-xs" onClick={() => setEditAccount(a)}>
                          <Pencil className="w-3 h-3" /> Manage
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {accounts.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-muted-foreground text-sm">
                        No auto-invest accounts yet
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </TabsContent>

        {/* ── GLOBAL SETTINGS ── */}
        <TabsContent value="settings" className="mt-4 space-y-4">
          <SectionCard title="Engine Settings" description="Controls applied globally to all auto-invest accounts">
            <div className="space-y-6 max-w-lg">

              {/* Enable / Disable */}
              <div className="flex items-center justify-between rounded-xl border border-border/50 p-4 bg-muted/10">
                <div>
                  <div className="text-sm font-semibold">Auto Invest Feature</div>
                  <div className="text-xs text-muted-foreground">Disabling stops new deposits and the AI engine globally</div>
                </div>
                <Switch
                  checked={merged.enabled}
                  onCheckedChange={v => setLocalSettings(s => ({ ...s, enabled: v }))}
                />
              </div>

              {/* Min deposit */}
              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  <IndianRupee className="w-3.5 h-3.5 text-amber-400" />
                  Minimum Deposit (₹)
                </Label>
                <div className="flex items-center gap-3">
                  <Slider
                    min={100} max={50000} step={100}
                    value={[merged.minDepositInr]}
                    onValueChange={([v]) => setLocalSettings(s => ({ ...s, minDepositInr: v }))}
                    className="flex-1"
                  />
                  <span className="w-24 text-right text-sm font-semibold">{inr(merged.minDepositInr)}</span>
                </div>
              </div>

              {/* Daily rate range */}
              <div className="space-y-3">
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                  Daily Return Rate Range (%)
                </Label>
                <div className="grid grid-cols-2 gap-4">
                  {([
                    { label: "Min %", key: "dailyRateMin" as const, color: "text-sky-400" },
                    { label: "Max %", key: "dailyRateMax" as const, color: "text-emerald-400" },
                  ]).map(f => (
                    <div key={f.key} className="space-y-1.5">
                      <Label className={cn("text-xs", f.color)}>{f.label}</Label>
                      <div className="flex items-center gap-2">
                        <Slider
                          min={0.1} max={5} step={0.05}
                          value={[merged[f.key]]}
                          onValueChange={([v]) => setLocalSettings(s => ({ ...s, [f.key]: parseFloat(v.toFixed(2)) }))}
                          className="flex-1"
                        />
                        <span className="text-sm font-bold w-12 text-right">{merged[f.key].toFixed(2)}%</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="text-[11px] text-muted-foreground bg-muted/30 rounded-lg px-3 py-2">
                  New accounts get a random daily rate between {merged.dailyRateMin.toFixed(2)}% and {merged.dailyRateMax.toFixed(2)}%
                  · APY: {((merged.dailyRateMin + merged.dailyRateMax) / 2 * 365).toFixed(0)}% avg
                </div>
              </div>

              {/* Tick interval */}
              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  Engine Tick Interval (minutes)
                </Label>
                <div className="flex items-center gap-3">
                  <Slider
                    min={1} max={15} step={1}
                    value={[merged.tickIntervalMin]}
                    onValueChange={([v]) => setLocalSettings(s => ({ ...s, tickIntervalMin: v }))}
                    className="flex-1"
                  />
                  <span className="text-sm font-semibold w-16 text-right">every {merged.tickIntervalMin} min</span>
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Requires server restart to take effect (currently always 3 min hardcoded in engine)
                </div>
              </div>

              {/* Warning if disabled */}
              {!merged.enabled && (
                <div className="flex items-center gap-2 text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 text-xs">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  Feature is disabled — existing users cannot deposit or earn.
                </div>
              )}

              <Button
                className="bg-amber-500 hover:bg-amber-600 text-black font-bold gap-1.5"
                onClick={() => saveSettings.mutate(merged)}
                disabled={saveSettings.isPending}
              >
                {saveSettings.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Settings
              </Button>
            </div>
          </SectionCard>

          {/* Summary of current live settings */}
          <SectionCard title="Current Live Settings" description="What's stored in DB right now">
            {settings ? (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {[
                  { label: "Status",        value: settings.enabled ? "✅ Enabled" : "🔴 Disabled" },
                  { label: "Min Deposit",   value: inr(settings.minDepositInr) },
                  { label: "Rate Min",      value: `${settings.dailyRateMin}% / day` },
                  { label: "Rate Max",      value: `${settings.dailyRateMax}% / day` },
                  { label: "Tick Interval", value: `${settings.tickIntervalMin} min` },
                  { label: "Avg APY",       value: `${((settings.dailyRateMin + settings.dailyRateMax) / 2 * 365).toFixed(0)}%` },
                ].map(s => (
                  <div key={s.label} className="rounded-xl border border-border/40 bg-muted/20 p-3">
                    <div className="text-[10px] text-muted-foreground mb-1">{s.label}</div>
                    <div className="text-sm font-semibold">{s.value}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground py-4 text-center">Loading…</div>
            )}
          </SectionCard>
        </TabsContent>
      </Tabs>

      {/* Edit dialog */}
      <EditAccountDialog
        account={editAccount}
        open={!!editAccount}
        onClose={() => setEditAccount(null)}
        onDone={() => { setEditAccount(null); invalidateAll(); }}
      />
    </div>
  );
}
