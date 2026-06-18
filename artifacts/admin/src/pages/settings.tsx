import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, put } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/premium/PageHeader";
import { PremiumStatCard } from "@/components/premium/PremiumStatCard";
import { EmptyState } from "@/components/premium/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import {
  IndianRupee, Percent, TrendingUp, Users, Crown, Plus, Trash2, RotateCcw, Settings2, Database,
  Search, Save, Sparkles, ShieldCheck, Mail, Phone, Wifi,
} from "lucide-react";

type Setting = { key: string; value: string };

interface VipTier {
  level: number; name: string; minVolume: number;
  spotMaker: number; spotTaker: number;
  futuresMaker: number; futuresTaker: number;
  withdrawDiscount: number;
}

const DEFAULT_TIERS: VipTier[] = [
  { level: 0, name: "Regular", minVolume: 0,        spotMaker: 0.20, spotTaker: 0.25, futuresMaker: 0.05, futuresTaker: 0.07, withdrawDiscount: 0 },
  { level: 1, name: "VIP 1",   minVolume: 100000,   spotMaker: 0.16, spotTaker: 0.20, futuresMaker: 0.04, futuresTaker: 0.06, withdrawDiscount: 5 },
  { level: 2, name: "VIP 2",   minVolume: 500000,   spotMaker: 0.12, spotTaker: 0.15, futuresMaker: 0.03, futuresTaker: 0.05, withdrawDiscount: 10 },
  { level: 3, name: "VIP 3",   minVolume: 2500000,  spotMaker: 0.08, spotTaker: 0.10, futuresMaker: 0.02, futuresTaker: 0.04, withdrawDiscount: 15 },
  { level: 4, name: "VIP 4",   minVolume: 10000000, spotMaker: 0.06, spotTaker: 0.08, futuresMaker: 0.015,futuresTaker: 0.03, withdrawDiscount: 20 },
  { level: 5, name: "VIP 5",   minVolume: 50000000, spotMaker: 0.04, spotTaker: 0.06, futuresMaker: 0.01, futuresTaker: 0.025,withdrawDiscount: 25 },
];

const FEE_KEYS = [
  { key: "spot.fee_percent",     label: "Spot Trading Fee",     hint: "Charged on both buy & sell (% of trade value)", def: "0.20", icon: Percent },
  { key: "spot.gst_percent",     label: "GST on Spot Fee",      hint: "GST applied on trading fee (India 18%)",       def: "18",   icon: Percent },
  { key: "tds.percent",          label: "TDS on Sell",          hint: "TDS deducted on sell value (India 1%)",        def: "1",    icon: Percent },
  { key: "futures.fee_percent",  label: "Futures Trading Fee",  hint: "Charged on position open + close (% of notional)", def: "0.05", icon: TrendingUp },
  { key: "futures.gst_percent",  label: "GST on Futures Fee",   hint: "GST applied on futures fee (India 18%)",       def: "18",   icon: Percent },
];

export default function SettingsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data = [] } = useQuery<Setting[]>({ queryKey: ["/admin/settings"], queryFn: () => get<Setting[]>("/admin/settings") });
  const save = useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) => put(`/admin/settings/${encodeURIComponent(key)}`, { value }),
    onSuccess: (_d, vars) => { qc.invalidateQueries({ queryKey: ["/admin/settings"] }); toast({ title: "Saved", description: vars.key }); },
    onError: (e: any) => toast({ title: "Save failed", description: e?.message, variant: "destructive" }),
  });

  const inrSetting = useMemo(() => data.find(s => s.key === "inr_usdt_rate"), [data]);
  const [inrRate, setInrRate] = useState("");
  useEffect(() => { if (inrSetting && !inrRate) setInrRate(inrSetting.value); }, [inrSetting]); // eslint-disable-line
  const [newKey, setNewKey] = useState("");
  const [newVal, setNewVal] = useState("");
  const [search, setSearch] = useState("");

  const settingsMap = useMemo(() => Object.fromEntries(data.map(s => [s.key, s.value])), [data]);

  // WebSocket ping interval (synced from settingsMap, default 5 s)
  const [pingSec, setPingSec] = useState("");
  useEffect(() => {
    const v = settingsMap["ws.ping_interval_sec"];
    if (v && !pingSec) setPingSec(v);
  }, [settingsMap]); // eslint-disable-line

  const [feeDraft, setFeeDraft] = useState<Record<string, string>>({});
  // Track the last-seen server value per key so we only re-sync clean fields,
  // never clobbering a field the user is currently editing.
  const lastServerRef = useRef<Record<string, string>>({});
  useEffect(() => {
    setFeeDraft(prev => {
      const next = { ...prev };
      FEE_KEYS.forEach(f => {
        const server = settingsMap[f.key] ?? "";
        const lastSeen = lastServerRef.current[f.key];
        const draft = prev[f.key];
        // First load OR clean (draft still equals previous server value) → sync
        if (lastSeen === undefined || draft === undefined || draft === lastSeen) {
          next[f.key] = server;
        }
        lastServerRef.current[f.key] = server;
      });
      return next;
    });
  }, [settingsMap]);

  const stats = useMemo(() => {
    const total = data.length;
    const tiers = (() => {
      const stored = data.find(s => s.key === "fees.vip_tiers")?.value;
      if (!stored) return DEFAULT_TIERS.length;
      try { const p = JSON.parse(stored); return Array.isArray(p) ? p.length : DEFAULT_TIERS.length; } catch { return DEFAULT_TIERS.length; }
    })();
    const feesConfigured = FEE_KEYS.filter(f => settingsMap[f.key]).length;
    return { total, tiers, feesConfigured, inr: inrSetting?.value };
  }, [data, settingsMap, inrSetting]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data;
    return data.filter(s => s.key.toLowerCase().includes(q) || (s.value || "").toLowerCase().includes(q));
  }, [data, search]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="System"
        title="Settings"
        description="Platform-wide rates, fees, VIP tiers and arbitrary key/value config consumed by all clients."
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <PremiumStatCard hero title="INR / USDT Rate" value={stats.inr ? `₹${stats.inr}` : "—"} icon={IndianRupee} hint="Live broadcast to clients" />
        <PremiumStatCard title="Fee Rules" value={`${stats.feesConfigured}/${FEE_KEYS.length}`} icon={Percent} accent />
        <PremiumStatCard title="VIP Tiers" value={stats.tiers} icon={Crown} />
        <PremiumStatCard title="Total Settings" value={stats.total} icon={Database} />
      </div>

      <Tabs defaultValue="rates">
        <TabsList>
          <TabsTrigger value="rates">Rates & Fees</TabsTrigger>
          <TabsTrigger value="vip">VIP Schedule</TabsTrigger>
          <TabsTrigger value="auth">Authentication</TabsTrigger>
          <TabsTrigger value="system">System</TabsTrigger>
          <TabsTrigger value="raw">Raw Settings ({stats.total})</TabsTrigger>
        </TabsList>

        <TabsContent value="rates" className="space-y-4 mt-4">
          <div className="premium-card rounded-xl p-5">
            <div className="flex items-center gap-2 mb-1">
              <IndianRupee className="w-4 h-4 text-amber-300" />
              <Label className="text-base font-semibold">INR / USDT Rate (live broadcast)</Label>
            </div>
            <div className="text-xs text-muted-foreground mb-4">
              All app prices use this rate. Changes are pushed to mobile clients within 5s via the price feed.
            </div>
            <div className="flex gap-2 items-center">
              <Input value={inrRate} onChange={(e) => setInrRate(e.target.value)} placeholder="e.g. 84.50" className="max-w-xs" data-testid="input-inr-rate" />
              <Button onClick={() => { if (inrRate) save.mutate({ key: "inr_usdt_rate", value: inrRate }); }} disabled={save.isPending} data-testid="button-save-inr-rate">
                <Save className="w-3.5 h-3.5 mr-1.5" /> Update Rate
              </Button>
              {inrSetting && <span className="text-xs text-muted-foreground ml-2">Current: <span className="gold-text font-semibold">₹{inrSetting.value}</span></span>}
            </div>
          </div>

          <div className="premium-card rounded-xl p-5">
            <div className="flex items-center gap-2 mb-1">
              <Percent className="w-4 h-4 text-amber-300" />
              <Label className="text-base font-semibold">Trading Fees, GST, TDS & Referral Commission</Label>
            </div>
            <div className="text-xs text-muted-foreground mb-4">
              Configure platform-wide fee rates. Mobile app pulls these every load and shows the breakdown to users at order time.
              GST applies on the trading fee (not trade value). TDS applies on sell value as per Indian crypto regulations.
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {FEE_KEYS.map(f => {
                const Icon = f.icon;
                const cur = settingsMap[f.key] ?? "";
                const draft = feeDraft[f.key] ?? "";
                const dirty = draft !== cur && draft !== "";
                return (
                  <div key={f.key} className="rounded-lg border border-border/60 bg-muted/10 p-3 hover:border-amber-500/30 transition-colors">
                    <div className="flex items-center gap-2 mb-1">
                      <Icon className="w-3.5 h-3.5 text-amber-300" />
                      <Label className="text-sm font-semibold">{f.label}</Label>
                      {cur && <span className="ml-auto text-xs text-muted-foreground">Now: <span className="font-mono">{cur}%</span></span>}
                    </div>
                    <div className="text-[11px] text-muted-foreground mb-2">{f.hint}</div>
                    <div className="flex gap-2 items-center">
                      <div className="relative flex-1">
                        <Input
                          type="number" step="0.01" min="0"
                          value={draft}
                          placeholder={`Default ${f.def}`}
                          onChange={(e) => setFeeDraft(d => ({ ...d, [f.key]: e.target.value }))}
                          className="pr-8"
                          aria-label={f.label}
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                      </div>
                      <Button
                        size="sm"
                        disabled={!dirty || save.isPending}
                        onClick={() => save.mutate({ key: f.key, value: draft })}
                      >
                        Save
                      </Button>
                    </div>
                    {dirty && <div className="text-[10px] text-amber-400 mt-1.5 flex items-center gap-1"><Sparkles className="w-2.5 h-2.5" />Unsaved</div>}
                  </div>
                );
              })}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="vip" className="mt-4">
          <VipTierEditor data={data} save={save} />
        </TabsContent>

        <TabsContent value="auth" className="space-y-4 mt-4">
          <AuthPolicyEditor settingsMap={settingsMap} save={save} />
        </TabsContent>

        <TabsContent value="system" className="space-y-4 mt-4">
          <div className="premium-card rounded-xl p-5">
            <div className="flex items-center gap-2 mb-1">
              <Wifi className="w-4 h-4 text-amber-300" />
              <Label className="text-base font-semibold">Go Service — WebSocket Ping Interval</Label>
            </div>
            <div className="text-xs text-muted-foreground mb-4">
              How often the Go matching engine pings connected WebSocket clients (futures orderbook &amp; trades).
              Pong timeout is automatically set to 3× this value. Changes take effect for all <span className="font-semibold">new</span> connections immediately — existing sessions keep their current interval until they reconnect.
              Allowed range: 1–300 seconds.
            </div>
            <div className="flex gap-2 items-center">
              <div className="relative">
                <Input
                  type="number" min={1} max={300} step={1}
                  value={pingSec}
                  onChange={(e) => setPingSec(e.target.value)}
                  placeholder="e.g. 5"
                  className="max-w-[160px] pr-10"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">sec</span>
              </div>
              <Button
                onClick={() => {
                  const s = parseInt(pingSec, 10);
                  if (!s || s < 1 || s > 300) return;
                  save.mutate({ key: "ws.ping_interval_sec", value: String(s) });
                }}
                disabled={save.isPending || !pingSec}
              >
                <Save className="w-3.5 h-3.5 mr-1.5" /> Apply
              </Button>
              {settingsMap["ws.ping_interval_sec"] && (
                <span className="text-xs text-muted-foreground ml-2">
                  Active: <span className="gold-text font-semibold">{settingsMap["ws.ping_interval_sec"]}s</span>
                  {" "}(pong timeout: <span className="gold-text font-semibold">{Number(settingsMap["ws.ping_interval_sec"]) * 3}s</span>)
                </span>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="raw" className="space-y-4 mt-4">
          <div className="premium-card rounded-xl p-4">
            <Label className="text-sm font-semibold mb-2 flex items-center gap-2"><Plus className="w-3.5 h-3.5 text-amber-300" />Add / Update Setting</Label>
            <div className="flex gap-2">
              <Input placeholder="Key (e.g. trading.maintenance)" value={newKey} onChange={(e) => setNewKey(e.target.value)} className="font-mono text-xs" />
              <Input placeholder="Value" value={newVal} onChange={(e) => setNewVal(e.target.value)} />
              <Button onClick={() => { if (newKey) { save.mutate({ key: newKey, value: newVal }); setNewKey(""); setNewVal(""); } }} disabled={!newKey || save.isPending}>
                <Save className="w-3.5 h-3.5 mr-1.5" />Save
              </Button>
            </div>
          </div>

          <div className="premium-card rounded-xl">
            <div className="p-3 border-b border-border/60">
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input className="pl-9 h-9" placeholder="Search keys / values…" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
            </div>
            {filtered.length === 0 ? (
              <EmptyState
                icon={Database}
                title={search ? "No matching settings" : "No settings yet"}
                description={search ? "Try a different search." : "Add a key/value pair above to get started."}
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Key</TableHead>
                    <TableHead>Value</TableHead>
                    <TableHead className="w-24"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((s) => <Row key={s.key} setting={s} onSave={(v) => save.mutate({ key: s.key, value: v })} saving={save.isPending} />)}
                </TableBody>
              </Table>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Row({ setting, onSave, saving }: { setting: Setting; onSave: (v: string) => void; saving?: boolean }) {
  const [v, setV] = useState(setting.value);
  useEffect(() => { setV(setting.value); }, [setting.value]);
  const dirty = v !== setting.value;
  return (
    <TableRow className="hover:bg-muted/20">
      <TableCell className="font-mono text-xs">{setting.key}</TableCell>
      <TableCell><Input value={v} onChange={(e) => setV(e.target.value)} className="h-8" aria-label={`Value for ${setting.key}`} /></TableCell>
      <TableCell>
        <Button size="sm" onClick={() => onSave(v)} disabled={!dirty || saving}>
          <Save className="w-3 h-3 mr-1" /> Save
        </Button>
      </TableCell>
    </TableRow>
  );
}

function VipTierEditor({ data, save }: { data: Setting[]; save: any }) {
  const stored = useMemo(() => data.find(s => s.key === "fees.vip_tiers")?.value, [data]);
  const [tiers, setTiers] = useState<VipTier[]>(DEFAULT_TIERS);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) { setTiers(parsed); setDirty(false); return; }
      } catch {}
    }
    setTiers(DEFAULT_TIERS);
  }, [stored]);

  const updateField = (idx: number, field: keyof VipTier, raw: string) => {
    setTiers(prev => prev.map((t, i) => {
      if (i !== idx) return t;
      const v = field === "name" ? raw : (raw === "" ? 0 : Number(raw));
      return { ...t, [field]: v };
    }));
    setDirty(true);
  };

  const addTier = () => {
    const last = tiers[tiers.length - 1];
    setTiers(prev => [...prev, {
      level: (last?.level ?? -1) + 1,
      name: `VIP ${(last?.level ?? -1) + 1}`,
      minVolume: (last?.minVolume ?? 0) * 5 || 100000,
      spotMaker: (last?.spotMaker ?? 0.20) * 0.8,
      spotTaker: (last?.spotTaker ?? 0.25) * 0.8,
      futuresMaker: (last?.futuresMaker ?? 0.05) * 0.8,
      futuresTaker: (last?.futuresTaker ?? 0.07) * 0.8,
      withdrawDiscount: Math.min(50, (last?.withdrawDiscount ?? 0) + 5),
    }]);
    setDirty(true);
  };

  const removeTier = (idx: number) => {
    setTiers(prev => prev.filter((_, i) => i !== idx));
    setDirty(true);
  };

  const reset = () => { setTiers(DEFAULT_TIERS); setDirty(true); };

  const persist = () => {
    const sorted = [...tiers].sort((a, b) => a.level - b.level).map((t, i) => ({ ...t, level: i }));
    save.mutate({ key: "fees.vip_tiers", value: JSON.stringify(sorted) }, {
      onSuccess: () => setDirty(false),
    });
  };

  const fmtVol = (v: number) => v >= 1e6 ? `${(v/1e6).toFixed(v % 1e6 ? 2 : 0)}M` : v >= 1e3 ? `${(v/1e3).toFixed(0)}K` : String(v);

  return (
    <div className="premium-card rounded-xl p-5">
      <div className="flex items-center gap-2 mb-1">
        <Crown className="w-4 h-4 text-amber-300" />
        <Label className="text-base font-semibold">Volume-Based VIP Fee Schedule</Label>
        <span className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={reset} title="Reset to defaults" aria-label="Reset to defaults">
            <RotateCcw className="w-3 h-3 mr-1" /> Reset
          </Button>
          <Button size="sm" onClick={persist} disabled={!dirty || save.isPending}>
            <Save className="w-3.5 h-3.5 mr-1.5" />Save Schedule
          </Button>
        </span>
      </div>
      <div className="text-xs text-muted-foreground mb-4">
        Users automatically promoted to higher tier based on 30-day trading volume (USDT). Lower fees + bigger withdraw discount at higher VIP.
        Fee values are in <span className="font-semibold gold-text">percent</span> (e.g. 0.20 = 0.20%).
      </div>

      <div className="overflow-x-auto rounded-lg border border-border/60 bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead className="w-14 text-xs">Lvl</TableHead>
              <TableHead className="w-28 text-xs">Name</TableHead>
              <TableHead className="text-xs">30d Vol ≥ (USDT)</TableHead>
              <TableHead className="text-xs text-blue-400">Spot Maker %</TableHead>
              <TableHead className="text-xs text-blue-500">Spot Taker %</TableHead>
              <TableHead className="text-xs text-orange-400">Fut Maker %</TableHead>
              <TableHead className="text-xs text-orange-500">Fut Taker %</TableHead>
              <TableHead className="text-xs text-emerald-400">Withdraw −%</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tiers.map((t, idx) => (
              <TableRow key={idx} className="hover:bg-muted/20">
                <TableCell className="text-center font-mono text-sm font-bold gold-text">{idx}</TableCell>
                <TableCell><Input className="h-8" value={t.name} onChange={e => updateField(idx, "name", e.target.value)} aria-label={`Tier ${idx} name`} /></TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Input className="h-8 w-32 font-mono text-xs" type="number" min="0" step="1000"
                      value={t.minVolume} onChange={e => updateField(idx, "minVolume", e.target.value)} aria-label={`Tier ${idx} min volume`} />
                    <span className="text-[10px] text-muted-foreground w-10">{fmtVol(t.minVolume)}</span>
                  </div>
                </TableCell>
                <TableCell><Input className="h-8 w-20" type="number" step="0.001" min="0"
                  value={t.spotMaker} onChange={e => updateField(idx, "spotMaker", e.target.value)} aria-label={`Tier ${idx} spot maker`} /></TableCell>
                <TableCell><Input className="h-8 w-20" type="number" step="0.001" min="0"
                  value={t.spotTaker} onChange={e => updateField(idx, "spotTaker", e.target.value)} aria-label={`Tier ${idx} spot taker`} /></TableCell>
                <TableCell><Input className="h-8 w-20" type="number" step="0.001" min="0"
                  value={t.futuresMaker} onChange={e => updateField(idx, "futuresMaker", e.target.value)} aria-label={`Tier ${idx} futures maker`} /></TableCell>
                <TableCell><Input className="h-8 w-20" type="number" step="0.001" min="0"
                  value={t.futuresTaker} onChange={e => updateField(idx, "futuresTaker", e.target.value)} aria-label={`Tier ${idx} futures taker`} /></TableCell>
                <TableCell><Input className="h-8 w-20" type="number" step="1" min="0" max="100"
                  value={t.withdrawDiscount} onChange={e => updateField(idx, "withdrawDiscount", e.target.value)} aria-label={`Tier ${idx} withdraw discount`} /></TableCell>
                <TableCell>
                  {tiers.length > 1 && (
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:bg-destructive/10"
                      onClick={() => removeTier(idx)} aria-label={`Remove tier ${idx}`}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between mt-3">
        <Button size="sm" variant="outline" onClick={addTier}>
          <Plus className="w-3.5 h-3.5 mr-1" /> Add Tier
        </Button>
        {dirty && <span className="text-xs text-amber-400 font-semibold flex items-center gap-1"><Sparkles className="w-3 h-3" />Unsaved changes — click "Save Schedule" to apply</span>}
      </div>
    </div>
  );
}

const AUTH_TOGGLES: { key: string; label: string; desc: string; icon: any }[] = [
  { key: "auth.signup_email_otp", label: "Email OTP at sign-up", desc: "Force every new user to verify their email with a one-time code before the account is activated.", icon: Mail },
  { key: "auth.signup_phone_otp", label: "Phone OTP at sign-up", desc: "Force every new user to verify their phone number with an SMS one-time code before activation.", icon: Phone },
  { key: "auth.login_email_otp",  label: "Email OTP at login", desc: "Require an email OTP on every login, in addition to password. Applies to all users.", icon: Mail },
  { key: "auth.login_phone_otp",  label: "Phone OTP at login", desc: "Require an SMS OTP on every login, in addition to password. Applies to all users with a verified phone.", icon: Phone },
];

function AuthPolicyEditor({ settingsMap, save }: { settingsMap: Record<string, string>; save: any }) {
  const isOn = (k: string) => (settingsMap[k] || "off").toLowerCase() === "on";
  return (
    <div className="premium-card rounded-xl p-5">
      <div className="flex items-center gap-2 mb-1">
        <ShieldCheck className="w-4 h-4 text-amber-300" />
        <Label className="text-base font-semibold">Authentication Policy</Label>
      </div>
      <div className="text-xs text-muted-foreground mb-4">
        Platform-wide OTP requirements for sign-up and login. When a toggle is on, users must complete that step on the same page — no skipping. Individual users can also opt-in to extra factors from their Profile, but they cannot turn off anything you mandate here.
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {AUTH_TOGGLES.map((t) => {
          const Icon = t.icon;
          const on = isOn(t.key);
          return (
            <div key={t.key} className="rounded-lg border border-border/60 bg-muted/10 p-4 hover:border-amber-500/30 transition-colors">
              <div className="flex items-start gap-3">
                <div className="mt-0.5"><Icon className="w-4 h-4 text-amber-300" /></div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-3">
                    <Label className="text-sm font-semibold">{t.label}</Label>
                    <Switch
                      checked={on}
                      disabled={save.isPending}
                      onCheckedChange={(v) => save.mutate({ key: t.key, value: v ? "on" : "off" })}
                      data-testid={`switch-${t.key}`}
                    />
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1 leading-snug">{t.desc}</div>
                  <div className="text-[10px] mt-2 font-mono text-muted-foreground/70">
                    {t.key} = <span className={on ? "text-emerald-400" : "text-muted-foreground"}>{on ? "on" : "off"}</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
