import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, put, post } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/premium/PageHeader";
import { PremiumStatCard } from "@/components/premium/PremiumStatCard";
import { StatusPill } from "@/components/premium/StatusPill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Wrench, ToggleRight, Layout, Megaphone, Save, AlertTriangle, Sparkles, Building2,
  Power, Eye, EyeOff,
} from "lucide-react";

type SiteConfig = Record<string, string>;

const SITE_KEYS = {
  brand: "site.brand",
  maintenance: "site.maintenance",
  features: "site.features",
  footer: "site.footer",
  bannerStrip: "site.banner_strip",
} as const;

const DEFAULTS = {
  brand: { name: "Zebvix", tagline: "India's pro-grade crypto exchange.", copyright: "© Zebvix Technologies Pvt Ltd. All rights reserved.", supportEmail: "support@zebvix.com" },
  maintenance: { enabled: false, message: "We are currently undergoing scheduled maintenance. We'll be back shortly.", eta: "" },
  features: {
    showFutures: true, showP2P: true, showConvert: true, showEarn: true,
    showLeagues: true, showNews: true, showAnnouncements: true, showDex: true,
    showTools: true, showSignup: true, showLogin: true, signupBonusZbx: 50,
  },
  bannerStrip: { enabled: false, message: "", ctaLabel: "", ctaUrl: "", kind: "info" as "info" | "success" | "warning" | "danger" },
  footer: {
    columns: [],
    socials: [],
    badges: [],
    riskWarning: "",
  },
};

function mergeJson<T>(raw: string | undefined, fb: T): T {
  if (!raw) return fb;
  try { return { ...fb, ...JSON.parse(raw) } as T; } catch { return fb; }
}

const FEATURE_LABELS: { key: keyof typeof DEFAULTS.features; label: string; hint: string }[] = [
  { key: "showFutures", label: "Futures trading", hint: "Show /futures route + Futures nav item" },
  { key: "showP2P", label: "P2P", hint: "Show /p2p in nav" },
  { key: "showConvert", label: "Convert", hint: "Quick swap UI in header + page" },
  { key: "showEarn", label: "Earn", hint: "Earn products page + nav item" },
  { key: "showDex", label: "DEX (coming soon)", hint: "DEX toggle in header" },
  { key: "showLeagues", label: "Trading Leagues", hint: "/leagues page + Explore menu" },
  { key: "showNews", label: "News", hint: "/news page + Promotion menu" },
  { key: "showAnnouncements", label: "Announcements", hint: "/announcements page + Promotion menu" },
  { key: "showTools", label: "Tools (Calc / Convert / Compare / Predictions)", hint: "Show Tools group in More menu" },
  { key: "showSignup", label: "Signup CTA", hint: "Show Sign Up button in header" },
  { key: "showLogin", label: "Login CTA", hint: "Show Log In button in header" },
];

export default function SiteSettingsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: rawMap = {}, isLoading } = useQuery<SiteConfig>({
    queryKey: ["/admin/site-config"],
    queryFn: () => get<SiteConfig>("/admin/site-config"),
  });

  const cfg = useMemo(() => ({
    brand: mergeJson(rawMap[SITE_KEYS.brand], DEFAULTS.brand),
    maintenance: mergeJson(rawMap[SITE_KEYS.maintenance], DEFAULTS.maintenance),
    features: mergeJson(rawMap[SITE_KEYS.features], DEFAULTS.features),
    bannerStrip: mergeJson(rawMap[SITE_KEYS.bannerStrip], DEFAULTS.bannerStrip),
    footer: mergeJson(rawMap[SITE_KEYS.footer], DEFAULTS.footer),
  }), [rawMap]);

  const save = useMutation({
    mutationFn: ({ key, value }: { key: string; value: any }) =>
      put(`/admin/site-config/${encodeURIComponent(key)}`, { value: typeof value === "string" ? value : JSON.stringify(value) }),
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ["/admin/site-config"] }); toast({ title: "Saved", description: v.key }); },
    onError: (e: any) => toast({ title: "Save failed", description: e?.message, variant: "destructive" }),
  });

  const toggleMaint = useMutation({
    mutationFn: (body: { enabled: boolean; message: string; eta: string }) =>
      post("/admin/site-config/maintenance", body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/admin/site-config"] }); toast({ title: "Maintenance updated" }); },
    onError: (e: any) => toast({ title: "Update failed", description: e?.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="System"
        title="Site Settings"
        description="Brand, maintenance mode, feature flags, banner strip and footer — all live-controlled from here. Changes broadcast to user-portal within 15s."
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <PremiumStatCard
          hero
          title="Maintenance"
          value={cfg.maintenance.enabled ? "ON" : "Off"}
          icon={Wrench}
          accent={cfg.maintenance.enabled}
        />
        <PremiumStatCard
          title="Features enabled"
          value={`${Object.values(cfg.features).filter((v) => v === true).length}/${FEATURE_LABELS.length}`}
          icon={ToggleRight}
        />
        <PremiumStatCard
          title="Banner strip"
          value={cfg.bannerStrip.enabled ? "Live" : "Off"}
          icon={Megaphone}
          accent={cfg.bannerStrip.enabled}
        />
        <PremiumStatCard title="Brand" value={cfg.brand.name} icon={Building2} />
      </div>

      <Tabs defaultValue="maintenance">
        <TabsList>
          <TabsTrigger value="maintenance"><Wrench className="w-3.5 h-3.5 mr-1.5" />Maintenance</TabsTrigger>
          <TabsTrigger value="features"><ToggleRight className="w-3.5 h-3.5 mr-1.5" />Features</TabsTrigger>
          <TabsTrigger value="banner"><Megaphone className="w-3.5 h-3.5 mr-1.5" />Banner strip</TabsTrigger>
          <TabsTrigger value="brand"><Building2 className="w-3.5 h-3.5 mr-1.5" />Brand</TabsTrigger>
          <TabsTrigger value="footer"><Layout className="w-3.5 h-3.5 mr-1.5" />Footer JSON</TabsTrigger>
        </TabsList>

        <TabsContent value="maintenance" className="mt-4">
          <MaintenancePanel cfg={cfg.maintenance} onSave={(v) => toggleMaint.mutate(v)} saving={toggleMaint.isPending} />
        </TabsContent>

        <TabsContent value="features" className="mt-4">
          <FeaturesPanel cfg={cfg.features} onSave={(v) => save.mutate({ key: SITE_KEYS.features, value: v })} saving={save.isPending} />
        </TabsContent>

        <TabsContent value="banner" className="mt-4">
          <BannerStripPanel cfg={cfg.bannerStrip} onSave={(v) => save.mutate({ key: SITE_KEYS.bannerStrip, value: v })} saving={save.isPending} />
        </TabsContent>

        <TabsContent value="brand" className="mt-4">
          <BrandPanel cfg={cfg.brand} onSave={(v) => save.mutate({ key: SITE_KEYS.brand, value: v })} saving={save.isPending} />
        </TabsContent>

        <TabsContent value="footer" className="mt-4">
          <FooterJsonPanel raw={rawMap[SITE_KEYS.footer] || JSON.stringify(DEFAULTS.footer, null, 2)} onSave={(v) => save.mutate({ key: SITE_KEYS.footer, value: v })} saving={save.isPending} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MaintenancePanel({ cfg, onSave, saving }: { cfg: typeof DEFAULTS.maintenance; onSave: (v: typeof DEFAULTS.maintenance) => void; saving?: boolean }) {
  const [v, setV] = useState(cfg);
  useEffect(() => { setV(cfg); }, [cfg]);
  const dirty = JSON.stringify(v) !== JSON.stringify(cfg);
  return (
    <div className="premium-card rounded-xl p-5 space-y-4">
      <div className="flex items-center gap-3">
        <div className={`flex items-center justify-center w-12 h-12 rounded-lg ${v.enabled ? "bg-rose-500/15 border border-rose-500/40" : "bg-emerald-500/10 border border-emerald-500/30"}`}>
          <Power className={`w-5 h-5 ${v.enabled ? "text-rose-300" : "text-emerald-300"}`} />
        </div>
        <div className="flex-1">
          <Label className="text-base font-semibold">Maintenance mode</Label>
          <div className="text-xs text-muted-foreground">Jab ON ho, sab non-admin users ko maintenance page dikhta hai. Admin console hamesha accessible rahega.</div>
        </div>
        <Switch checked={v.enabled} onCheckedChange={(b) => setV({ ...v, enabled: b })} />
      </div>
      <div>
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">Message</Label>
        <Textarea rows={3} value={v.message} onChange={(e) => setV({ ...v, message: e.target.value })} placeholder="We are currently undergoing scheduled maintenance. We'll be back shortly." />
      </div>
      <div>
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">ETA (optional)</Label>
        <Input value={v.eta} onChange={(e) => setV({ ...v, eta: e.target.value })} placeholder="e.g. 30 minutes / 6 PM IST" />
      </div>
      {v.enabled && (
        <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 flex items-start gap-2 text-xs text-rose-200">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>Saving with this ON will lock out all non-admin user-portal traffic immediately.</span>
        </div>
      )}
      <div className="flex justify-end">
        <Button onClick={() => onSave(v)} disabled={!dirty || saving}>
          <Save className="w-3.5 h-3.5 mr-1.5" /> Save maintenance
        </Button>
      </div>
    </div>
  );
}

function FeaturesPanel({ cfg, onSave, saving }: { cfg: typeof DEFAULTS.features; onSave: (v: typeof DEFAULTS.features) => void; saving?: boolean }) {
  const [v, setV] = useState(cfg);
  useEffect(() => { setV(cfg); }, [cfg]);
  const dirty = JSON.stringify(v) !== JSON.stringify(cfg);
  return (
    <div className="premium-card rounded-xl p-5 space-y-4">
      <div>
        <Label className="text-base font-semibold flex items-center gap-2"><ToggleRight className="w-4 h-4 text-amber-300" /> Feature flags</Label>
        <div className="text-xs text-muted-foreground">Flags set to OFF will hide the corresponding nav link and route in the user portal. Server-side route enforcement must be configured separately — this controls UI visibility only.</div>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        {FEATURE_LABELS.map((f) => (
          <div key={f.key} className="flex items-start gap-3 p-3 rounded-lg border border-border/60 bg-muted/10">
            <Switch
              checked={Boolean((v as any)[f.key])}
              onCheckedChange={(b) => setV({ ...v, [f.key]: b })}
            />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium flex items-center gap-2">
                {(v as any)[f.key] ? <Eye className="w-3 h-3 text-emerald-300" /> : <EyeOff className="w-3 h-3 text-muted-foreground" />}
                {f.label}
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">{f.hint}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Sign-up bonus (ZBX)</Label>
          <Input type="number" min="0" step="1" value={v.signupBonusZbx} onChange={(e) => setV({ ...v, signupBonusZbx: Number(e.target.value) || 0 })} />
        </div>
      </div>
      <div className="flex justify-end">
        <Button onClick={() => onSave(v)} disabled={!dirty || saving}>
          <Save className="w-3.5 h-3.5 mr-1.5" /> Save features
        </Button>
      </div>
    </div>
  );
}

function BannerStripPanel({ cfg, onSave, saving }: { cfg: typeof DEFAULTS.bannerStrip; onSave: (v: typeof DEFAULTS.bannerStrip) => void; saving?: boolean }) {
  const [v, setV] = useState(cfg);
  useEffect(() => { setV(cfg); }, [cfg]);
  const dirty = JSON.stringify(v) !== JSON.stringify(cfg);
  const tone = v.kind === "danger" ? "destructive" : v.kind === "warning" ? "warning" : v.kind === "success" ? "success" : "info";
  return (
    <div className="premium-card rounded-xl p-5 space-y-4">
      <div className="flex items-center gap-3">
        <Megaphone className="w-5 h-5 text-amber-300" />
        <div className="flex-1">
          <Label className="text-base font-semibold">Top announcement strip</Label>
          <div className="text-xs text-muted-foreground">Single one-liner that shows above the user-portal header. Use for big launches, security alerts ya scheduled downtime.</div>
        </div>
        <Switch checked={v.enabled} onCheckedChange={(b) => setV({ ...v, enabled: b })} />
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Message</Label>
          <Input value={v.message} onChange={(e) => setV({ ...v, message: e.target.value })} placeholder="USDT-M Futures live — up to 100× leverage." />
        </div>
        <div>
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">CTA label</Label>
          <Input value={v.ctaLabel} onChange={(e) => setV({ ...v, ctaLabel: e.target.value })} placeholder="Trade now" />
        </div>
        <div>
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">CTA URL</Label>
          <Input value={v.ctaUrl} onChange={(e) => setV({ ...v, ctaUrl: e.target.value })} placeholder="/futures" />
        </div>
        <div>
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Tone</Label>
          <select
            className="w-full h-10 rounded-md border border-border bg-background px-2 text-sm"
            value={v.kind}
            onChange={(e) => setV({ ...v, kind: e.target.value as any })}
          >
            <option value="info">Info</option>
            <option value="success">Success</option>
            <option value="warning">Warning</option>
            <option value="danger">Danger</option>
          </select>
        </div>
      </div>
      <div className="rounded-lg border border-border/60 bg-muted/10 p-3">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Preview</div>
        <div className={`rounded-md px-3 py-2 text-xs flex items-center gap-2 ${
          v.kind === "danger" ? "bg-rose-500/15 border border-rose-500/40 text-rose-100" :
          v.kind === "warning" ? "bg-amber-500/15 border border-amber-500/40 text-amber-100" :
          v.kind === "success" ? "bg-emerald-500/15 border border-emerald-500/40 text-emerald-100" :
          "bg-sky-500/15 border border-sky-500/40 text-sky-100"
        }`}>
          <Sparkles className="w-3 h-3" />
          <span className="flex-1">{v.message || "(empty)"}</span>
          {v.ctaLabel && <span className="font-semibold underline">{v.ctaLabel}</span>}
        </div>
      </div>
      <div className="flex justify-end">
        <Button onClick={() => onSave(v)} disabled={!dirty || saving}>
          <Save className="w-3.5 h-3.5 mr-1.5" /> Save banner strip
        </Button>
      </div>
    </div>
  );
}

function BrandPanel({ cfg, onSave, saving }: { cfg: typeof DEFAULTS.brand; onSave: (v: typeof DEFAULTS.brand) => void; saving?: boolean }) {
  const [v, setV] = useState(cfg);
  useEffect(() => { setV(cfg); }, [cfg]);
  const dirty = JSON.stringify(v) !== JSON.stringify(cfg);
  return (
    <div className="premium-card rounded-xl p-5 space-y-4">
      <Label className="text-base font-semibold">Brand</Label>
      <div className="grid sm:grid-cols-2 gap-3">
        <div><Label className="text-xs uppercase tracking-wider text-muted-foreground">Brand name</Label>
          <Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></div>
        <div><Label className="text-xs uppercase tracking-wider text-muted-foreground">Support email</Label>
          <Input type="email" value={v.supportEmail} onChange={(e) => setV({ ...v, supportEmail: e.target.value })} /></div>
        <div className="sm:col-span-2"><Label className="text-xs uppercase tracking-wider text-muted-foreground">Tagline</Label>
          <Input value={v.tagline} onChange={(e) => setV({ ...v, tagline: e.target.value })} /></div>
        <div className="sm:col-span-2"><Label className="text-xs uppercase tracking-wider text-muted-foreground">Copyright line</Label>
          <Input value={v.copyright} onChange={(e) => setV({ ...v, copyright: e.target.value })} /></div>
      </div>
      <div className="flex justify-end">
        <Button onClick={() => onSave(v)} disabled={!dirty || saving}>
          <Save className="w-3.5 h-3.5 mr-1.5" /> Save brand
        </Button>
      </div>
    </div>
  );
}

function FooterJsonPanel({ raw, onSave, saving }: { raw: string; onSave: (v: any) => void; saving?: boolean }) {
  const [text, setText] = useState(() => {
    try { return JSON.stringify(JSON.parse(raw), null, 2); } catch { return raw; }
  });
  useEffect(() => {
    try { setText(JSON.stringify(JSON.parse(raw), null, 2)); } catch { setText(raw); }
  }, [raw]);
  const [error, setError] = useState<string | null>(null);
  const handleSave = () => {
    try {
      const parsed = JSON.parse(text);
      setError(null);
      onSave(parsed);
    } catch (e: any) {
      setError(e?.message || "Invalid JSON");
    }
  };
  return (
    <div className="premium-card rounded-xl p-5 space-y-3">
      <div>
        <Label className="text-base font-semibold flex items-center gap-2"><Layout className="w-4 h-4 text-amber-300" />Footer (advanced JSON)</Label>
        <div className="text-xs text-muted-foreground">
          Schema: <code className="text-[11px]">{"{ columns: [{title, links: [{label, href, external?}]}], socials: [{label, href, kind}], badges: [{label, kind}], riskWarning }"}</code>
        </div>
      </div>
      <Textarea
        value={text}
        onChange={(e) => { setText(e.target.value); setError(null); }}
        rows={20}
        className="font-mono text-xs"
      />
      {error && (
        <div className="rounded-md border border-rose-500/40 bg-rose-500/10 p-2 text-xs text-rose-200 flex items-center gap-1.5">
          <AlertTriangle className="w-3 h-3" /> {error}
        </div>
      )}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          <Save className="w-3.5 h-3.5 mr-1.5" /> Save footer
        </Button>
      </div>
    </div>
  );
}
