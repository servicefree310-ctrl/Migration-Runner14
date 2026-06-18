import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, put } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Gift, Users, TrendingUp, Bot, PiggyBank, Plus, Trash2,
  Save, RotateCcw, ChevronUp, ChevronDown, Info, Trophy,
} from "lucide-react";

interface ReferralTier {
  name: string;
  minInvites: number;
  maxInvites: number | null;
  pct: number;
}

interface ReferralConfig {
  enabled: boolean;
  registrationBonus: number;
  trading: Record<string, number>;
  ai: Record<string, number>;
  earn: Record<string, number>;
  tiers: ReferralTier[];
}

const LEVELS = ["1", "2", "3", "4", "5"];
const TIER_COLORS = ["text-amber-600", "text-zinc-500", "text-amber-500", "text-sky-500", "text-violet-500"];

function SectionHeading({ icon, title, sub }: { icon: React.ReactNode; title: string; sub?: string }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div>
        <div className="font-semibold text-sm">{title}</div>
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      </div>
    </div>
  );
}

function LevelInput({
  label, value, onChange,
}: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 shrink-0 text-xs font-semibold text-muted-foreground">L{label}</div>
      <Input
        type="number"
        min={0}
        max={100}
        step={0.1}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        className="h-8 text-sm w-24"
      />
      <span className="text-xs text-muted-foreground">%</span>
    </div>
  );
}

export default function ReferralSettingsPage() {
  const qc = useQueryClient();
  const [dirty, setDirty] = useState(false);

  const { data: cfg, isLoading } = useQuery<ReferralConfig>({
    queryKey: ["/admin/referral-settings"],
    queryFn: () => get<ReferralConfig>("/admin/referral-settings"),
  });

  const [form, setForm] = useState<ReferralConfig | null>(null);
  const current = form ?? cfg;

  function patch(fn: (c: ReferralConfig) => ReferralConfig) {
    setForm(prev => {
      const base = prev ?? cfg!;
      return fn({ ...base });
    });
    setDirty(true);
  }

  const saveMutation = useMutation({
    mutationFn: (payload: ReferralConfig) => put<ReferralConfig>("/admin/referral-settings", payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/admin/referral-settings"] });
      setDirty(false);
      setForm(null);
      toast.success("Referral settings saved successfully");
    },
    onError: (e: any) => toast.error(e?.message ?? "Save failed"),
  });

  function handleSave() {
    if (!current) return;
    saveMutation.mutate(current);
  }

  function handleReset() {
    setForm(null);
    setDirty(false);
  }

  function addTier() {
    patch(c => ({
      ...c,
      tiers: [
        ...c.tiers,
        { name: `Tier ${c.tiers.length + 1}`, minInvites: 100, maxInvites: null, pct: 40 },
      ],
    }));
  }

  function removeTier(idx: number) {
    patch(c => ({ ...c, tiers: c.tiers.filter((_, i) => i !== idx) }));
  }

  function moveTier(idx: number, dir: -1 | 1) {
    patch(c => {
      const arr = [...c.tiers];
      const target = idx + dir;
      if (target < 0 || target >= arr.length) return c;
      [arr[idx], arr[target]] = [arr[target], arr[idx]];
      return { ...c, tiers: arr };
    });
  }

  function patchTier(idx: number, fn: (t: ReferralTier) => ReferralTier) {
    patch(c => ({ ...c, tiers: c.tiers.map((t, i) => i === idx ? fn(t) : t) }));
  }

  function patchLevel(category: "trading" | "ai" | "earn", level: string, val: number) {
    patch(c => ({ ...c, [category]: { ...c[category], [level]: val } }));
  }

  if (isLoading || !current) {
    return (
      <div className="p-6 text-sm text-muted-foreground animate-pulse">Loading referral settings…</div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Referral Program Settings</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Configure commission tiers, per-level rates, and program toggles. Changes apply immediately across the platform.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {dirty && (
            <Button variant="outline" size="sm" onClick={handleReset}>
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Reset
            </Button>
          )}
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saveMutation.isPending || !dirty}
            className="bg-primary text-primary-foreground"
          >
            <Save className="h-3.5 w-3.5 mr-1.5" />
            {saveMutation.isPending ? "Saving…" : "Save Changes"}
          </Button>
        </div>
      </div>

      {dirty && (
        <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
          <Info className="h-3.5 w-3.5 shrink-0" />
          You have unsaved changes. Click "Save Changes" to apply.
        </div>
      )}

      {/* Enable toggle */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Gift className="h-5 w-5 text-amber-500" />
            <div>
              <div className="font-semibold text-sm">Referral Program</div>
              <div className="text-xs text-muted-foreground">Enable or disable the entire referral / affiliate system</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={current.enabled}
              onCheckedChange={v => patch(c => ({ ...c, enabled: v }))}
            />
            <Badge variant={current.enabled ? "default" : "secondary"} className="text-[10px]">
              {current.enabled ? "Active" : "Disabled"}
            </Badge>
          </div>
        </div>
        <Separator className="my-4" />
        <div className="flex items-center gap-4">
          <Label className="text-sm font-medium whitespace-nowrap">Sign-up Bonus (USDT)</Label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={0}
              max={1000}
              step={0.5}
              value={current.registrationBonus}
              onChange={e => patch(c => ({ ...c, registrationBonus: parseFloat(e.target.value) || 0 }))}
              className="h-8 w-32 text-sm"
            />
            <span className="text-xs text-muted-foreground">USDT per new KYC-verified referral</span>
          </div>
        </div>
      </div>

      {/* Commission Tiers */}
      <div className="rounded-xl border border-border bg-card p-5">
        <SectionHeading
          icon={<Trophy className="h-4 w-4" />}
          title="Commission Tiers"
          sub="Bronze / Silver / Gold — users auto-upgrade as KYC-verified invites grow"
        />

        <div className="space-y-3">
          {current.tiers.map((tier, idx) => (
            <div key={idx} className="flex items-center gap-3 p-3 rounded-lg border border-border/60 bg-muted/20">
              <div className="flex flex-col gap-1 shrink-0">
                <button
                  onClick={() => moveTier(idx, -1)}
                  disabled={idx === 0}
                  className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted disabled:opacity-30"
                >
                  <ChevronUp className="h-3 w-3" />
                </button>
                <button
                  onClick={() => moveTier(idx, 1)}
                  disabled={idx === current.tiers.length - 1}
                  className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted disabled:opacity-30"
                >
                  <ChevronDown className="h-3 w-3" />
                </button>
              </div>

              <div className={`text-xs font-black w-5 tabular-nums ${TIER_COLORS[idx % TIER_COLORS.length]}`}>
                {idx + 1}
              </div>

              <div className="flex flex-wrap items-center gap-3 flex-1">
                <div className="flex items-center gap-1.5">
                  <Label className="text-xs text-muted-foreground whitespace-nowrap">Name</Label>
                  <Input
                    value={tier.name}
                    onChange={e => patchTier(idx, t => ({ ...t, name: e.target.value }))}
                    className="h-7 w-24 text-xs"
                    maxLength={20}
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <Label className="text-xs text-muted-foreground whitespace-nowrap">Min invites</Label>
                  <Input
                    type="number"
                    min={0}
                    value={tier.minInvites}
                    onChange={e => patchTier(idx, t => ({ ...t, minInvites: parseInt(e.target.value) || 0 }))}
                    className="h-7 w-20 text-xs"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <Label className="text-xs text-muted-foreground whitespace-nowrap">Max invites</Label>
                  <Input
                    type="number"
                    min={0}
                    placeholder="∞"
                    value={tier.maxInvites ?? ""}
                    onChange={e => patchTier(idx, t => ({
                      ...t,
                      maxInvites: e.target.value === "" ? null : parseInt(e.target.value) || null,
                    }))}
                    className="h-7 w-20 text-xs"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <Label className="text-xs text-muted-foreground whitespace-nowrap">Commission %</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={tier.pct}
                    onChange={e => patchTier(idx, t => ({ ...t, pct: parseFloat(e.target.value) || 0 }))}
                    className="h-7 w-20 text-xs"
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
              </div>

              <button
                onClick={() => removeTier(idx)}
                disabled={current.tiers.length <= 1}
                className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-destructive/10 hover:text-destructive text-muted-foreground disabled:opacity-30 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>

        <Button variant="outline" size="sm" className="mt-3 text-xs h-8" onClick={addTier}>
          <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Tier
        </Button>

        <div className="mt-3 text-[11px] text-muted-foreground flex items-start gap-1.5">
          <Info className="h-3 w-3 text-amber-500 mt-0.5 shrink-0" />
          Leave "Max invites" blank (∞) for the highest tier. Tiers are matched by KYC-verified invite count from top to bottom.
        </div>
      </div>

      {/* Per-level commission rates */}
      <div className="rounded-xl border border-border bg-card p-5">
        <SectionHeading
          icon={<TrendingUp className="h-4 w-4" />}
          title="Multi-Level Commission Rates"
          sub="% of trading fees / AI profits / earn interest paid per referral depth level"
        />

        <div className="grid md:grid-cols-3 gap-6">
          {/* Trading */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Users className="h-4 w-4 text-sky-500" />
              <span className="text-sm font-semibold">Spot & Futures Trades</span>
            </div>
            <div className="space-y-2">
              {LEVELS.map(lvl => (
                <LevelInput
                  key={lvl}
                  label={lvl}
                  value={current.trading[lvl] ?? 0}
                  onChange={v => patchLevel("trading", lvl, v)}
                />
              ))}
            </div>
          </div>

          {/* AI */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Bot className="h-4 w-4 text-emerald-500" />
              <span className="text-sm font-semibold">AI Trading Plans</span>
            </div>
            <div className="space-y-2">
              {LEVELS.map(lvl => (
                <LevelInput
                  key={lvl}
                  label={lvl}
                  value={current.ai[lvl] ?? 0}
                  onChange={v => patchLevel("ai", lvl, v)}
                />
              ))}
            </div>
          </div>

          {/* Earn */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <PiggyBank className="h-4 w-4 text-violet-500" />
              <span className="text-sm font-semibold">Earn / Staking Plans</span>
            </div>
            <div className="space-y-2">
              {LEVELS.map(lvl => (
                <LevelInput
                  key={lvl}
                  label={lvl}
                  value={current.earn[lvl] ?? 0}
                  onChange={v => patchLevel("earn", lvl, v)}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 text-[11px] text-muted-foreground flex items-start gap-1.5">
          <Info className="h-3 w-3 text-sky-500 mt-0.5 shrink-0" />
          Level 1 = direct referral. Level 2 = referral of referral, and so on up to 5 levels deep.
          These percentages apply to the fee/profit earned by the referee, not their principal.
        </div>
      </div>

      {/* Live preview */}
      <div className="rounded-xl border border-border bg-muted/30 p-5">
        <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Live Preview — Tier Table</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Tier</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Invites needed</th>
                <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Commission %</th>
                <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Trading L1</th>
                <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">AI L1</th>
                <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Earn L1</th>
              </tr>
            </thead>
            <tbody>
              {current.tiers.map((tier, idx) => (
                <tr key={idx} className="border-b border-border/40 last:border-0">
                  <td className="px-3 py-2.5">
                    <Badge variant="outline" className={`text-[10px] ${TIER_COLORS[idx % TIER_COLORS.length]}`}>
                      {tier.name}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">
                    {tier.maxInvites == null
                      ? `${tier.minInvites}+`
                      : `${tier.minInvites}–${tier.maxInvites}`}
                  </td>
                  <td className="px-3 py-2.5 text-right font-bold text-amber-600 dark:text-amber-400">{tier.pct}%</td>
                  <td className="px-3 py-2.5 text-right text-sky-600 dark:text-sky-400">{current.trading["1"] ?? 0}%</td>
                  <td className="px-3 py-2.5 text-right text-emerald-600 dark:text-emerald-400">{current.ai["1"] ?? 0}%</td>
                  <td className="px-3 py-2.5 text-right text-violet-600 dark:text-violet-400">{current.earn["1"] ?? 0}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
