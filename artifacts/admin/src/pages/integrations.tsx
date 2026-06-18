import { useEffect, useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post, patch, del } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { PageHeader } from "@/components/premium/PageHeader";
import { PremiumStatCard } from "@/components/premium/PremiumStatCard";
import { StatusPill } from "@/components/premium/StatusPill";
import { EmptyState } from "@/components/premium/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  Wallet, Zap, Mail, Smartphone, Globe, Plus, Pencil, Trash2, RefreshCw,
  Loader2, KeyRound, Eye, EyeOff, Copy, Check, AlertTriangle, CheckCircle2,
  Settings2, ExternalLink, Activity, Server, Webhook, ArrowUpDown, Shield,
  MessageSquare, AtSign, Lock, Hash, Link2, Play,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────
type Gateway = {
  id: number; code: string; name: string; type: string; direction: string;
  provider: string; currency: string; minAmount: string; maxAmount: string;
  feeFlat: string; feePercent: string; isAuto: boolean; status: string;
  testMode: boolean; apiKey?: string | null;
};
type OtpProvider = {
  id: number; channel: string; provider: string; apiKey: string | null;
  apiSecret: string | null; senderId: string | null; template: string | null; isActive: boolean;
};
type EmailConfig = {
  id: number; name: string; provider: string;
  smtpHost: string | null; smtpPort: number | null; smtpSecure: boolean | null;
  username: string | null; password: string | null; fromEmail: string | null; fromName: string | null;
  apiKey: string | null; domain: string | null; region: string | null;
  isActive: boolean; testStatus: string; lastTestedAt: string | null;
  _passwordSet?: boolean; _apiKeySet?: boolean;
  createdAt: string;
};
type CustomApi = {
  id: number; name: string; description: string | null; category: string;
  endpointUrl: string; method: string; authType: string; authValue: string | null;
  headers: string; isActive: boolean; lastStatus: string | null; lastCalledAt: string | null;
  createdAt: string;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function mask(s?: string | null) {
  if (!s) return "—";
  if (s.startsWith("••")) return s;
  if (s.length <= 8) return "•".repeat(s.length);
  return `${s.slice(0, 4)}${"•".repeat(Math.max(4, s.length - 8))}${s.slice(-4)}`;
}
function relTime(s: string | null | undefined) {
  if (!s) return "—";
  const m = Math.round((Date.now() - new Date(s).getTime()) / 60000);
  if (m < 1) return "just now"; if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.round(m / 60)}h ago`; return `${Math.round(m / 1440)}d ago`;
}

// ─── Status badge helpers ─────────────────────────────────────────────────────
function TestBadge({ status }: { status: string }) {
  if (status === "ok") return <StatusPill variant="success">OK</StatusPill>;
  if (status === "failed" || status === "error") return <StatusPill variant="danger">Failed</StatusPill>;
  return <StatusPill variant="neutral">Untested</StatusPill>;
}

// ─── Provider color chips ─────────────────────────────────────────────────────
const PROVIDER_COLORS: Record<string, string> = {
  razorpay: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  payu: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  cashfree: "bg-orange-500/15 text-orange-300 border-orange-500/30",
  sendgrid: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  mailgun: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  aws_ses: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  smtp: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  postmark: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  msg91: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  twilio: "bg-red-500/15 text-red-300 border-red-500/30",
  fast2sms: "bg-green-500/15 text-green-300 border-green-500/30",
  "2factor": "bg-purple-500/15 text-purple-300 border-purple-500/30",
  textlocal: "bg-teal-500/15 text-teal-300 border-teal-500/30",
};
function ProviderChip({ provider }: { provider: string }) {
  return (
    <span className={cn("px-2 py-0.5 rounded-md text-[11px] font-semibold border inline-flex items-center gap-1 capitalize", PROVIDER_COLORS[provider] ?? "bg-muted/40 border-border/60 text-muted-foreground")}>
      {provider}
    </span>
  );
}

function FormField({ label, hint, full, children }: { label: string; hint?: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div className={cn("space-y-1.5", full && "md:col-span-2")}>
      <Label className="text-xs">{label}</Label>
      {children}
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
function Section({ icon: Icon, title, tone = "default", children }: { icon: any; title: string; tone?: "default" | "amber"; children: React.ReactNode }) {
  return (
    <div className={cn("rounded-xl border overflow-hidden", tone === "amber" ? "border-amber-500/30 bg-amber-500/5" : "border-border/60 bg-muted/10")}>
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/50 bg-muted/20">
        <div className="stat-orb w-7 h-7 rounded-md flex items-center justify-center shrink-0">
          <Icon className="w-3.5 h-3.5 text-amber-300" />
        </div>
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-4">{children}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
export default function IntegrationsPage() {
  const { user: me } = useAuth();
  const qc = useQueryClient();
  const isAdmin = me?.role === "admin" || me?.role === "superadmin";

  const [tab, setTab] = useState("payment");

  const { data: gateways = [], isLoading: gLoad, refetch: gRefetch } = useQuery<Gateway[]>({
    queryKey: ["/admin/gateways"], queryFn: () => get<Gateway[]>("/admin/gateways"),
  });
  const { data: otpProviders = [], isLoading: otpLoad, refetch: otpRefetch } = useQuery<OtpProvider[]>({
    queryKey: ["/admin/otp-providers"], queryFn: () => get<OtpProvider[]>("/admin/otp-providers"),
  });
  const { data: emailConfigs = [], isLoading: emailLoad, refetch: emailRefetch } = useQuery<EmailConfig[]>({
    queryKey: ["/admin/email-configs"], queryFn: () => get<EmailConfig[]>("/admin/email-configs"),
  });
  const { data: customApis = [], isLoading: apiLoad, refetch: apiRefetch } = useQuery<CustomApi[]>({
    queryKey: ["/admin/custom-apis"], queryFn: () => get<CustomApi[]>("/admin/custom-apis"),
  });

  const stats = useMemo(() => ({
    gActive: gateways.filter((g) => g.status === "active").length,
    otpActive: otpProviders.filter((p) => p.isActive).length,
    emailActive: emailConfigs.filter((e) => e.isActive).length,
    apiActive: customApis.filter((a) => a.isActive).length,
    total: gateways.length + otpProviders.length + emailConfigs.length + customApis.length,
  }), [gateways, otpProviders, emailConfigs, customApis]);

  const refetchAll = () => { gRefetch(); otpRefetch(); emailRefetch(); apiRefetch(); };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="System"
        title="API & Integrations"
        description="Manage payment gateways (UPI, Razorpay), email providers (SMTP, SendGrid), mobile SMS, and custom webhooks — all in one place."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={refetchAll}>
              <RefreshCw className="w-4 h-4 mr-1.5" />Refresh All
            </Button>
          </>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <PremiumStatCard hero title="Payment Gateways" value={stats.gActive} icon={Wallet} hint={`${gateways.length} total · ${gateways.filter(g=>g.isAuto).length} auto`} />
        <PremiumStatCard title="Email APIs" value={stats.emailActive} icon={Mail} hint={`${emailConfigs.length} configured`} />
        <PremiumStatCard title="SMS / OTP" value={stats.otpActive} icon={Smartphone} hint={`${otpProviders.length} providers`} />
        <PremiumStatCard title="Custom APIs" value={stats.apiActive} icon={Globe} hint={`${customApis.length} endpoints`} />
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="payment" className="gap-1.5">
            <Wallet className="w-3.5 h-3.5" />Payment
            <Badge variant="outline" className="ml-1 text-[10px] h-4 px-1">{gateways.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="email" className="gap-1.5">
            <Mail className="w-3.5 h-3.5" />Email API
            <Badge variant="outline" className="ml-1 text-[10px] h-4 px-1">{emailConfigs.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="sms" className="gap-1.5">
            <Smartphone className="w-3.5 h-3.5" />SMS / Mobile
            <Badge variant="outline" className="ml-1 text-[10px] h-4 px-1">{otpProviders.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="custom" className="gap-1.5">
            <Webhook className="w-3.5 h-3.5" />Custom APIs
            <Badge variant="outline" className="ml-1 text-[10px] h-4 px-1">{customApis.length}</Badge>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* ── Payment Gateways ── */}
      {tab === "payment" && <PaymentTab gateways={gateways} isLoading={gLoad} isAdmin={isAdmin} qc={qc} toast={toast} />}

      {/* ── Email API ── */}
      {tab === "email" && <EmailTab configs={emailConfigs} isLoading={emailLoad} isAdmin={isAdmin} qc={qc} toast={toast} />}

      {/* ── SMS / Mobile ── */}
      {tab === "sms" && <SmsTab providers={otpProviders} isLoading={otpLoad} isAdmin={isAdmin} qc={qc} toast={toast} />}

      {/* ── Custom APIs ── */}
      {tab === "custom" && <CustomApiTab apis={customApis} isLoading={apiLoad} isAdmin={isAdmin} qc={qc} toast={toast} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PAYMENT TAB
// ═══════════════════════════════════════════════════════════════════════════
function PaymentTab({ gateways, isLoading, isAdmin, qc, toast }: any) {
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Gateway | null>(null);
  const inv = () => qc.invalidateQueries({ queryKey: ["/admin/gateways"] });

  const toggle = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) => patch(`/admin/gateways/${id}`, { status: active ? "active" : "paused" }),
    onSuccess: inv,
    onError: (e: Error) => toast.error(`Toggle failed: ${e.message}`),
  });
  const remove = useMutation({
    mutationFn: (id: number) => del(`/admin/gateways/${id}`),
    onSuccess: () => { inv(); toast.success("Gateway removed"); },
    onError: (e: Error) => toast.error(`Delete failed: ${e.message}`),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Payment Gateways</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Configure UPI (manual and automatic), Razorpay, PayU, and Cashfree</p>
        </div>
        {isAdmin && (
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="w-4 h-4 mr-1.5" />Add Gateway
          </Button>
        )}
      </div>

      {/* UPI + Razorpay quick-info cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="rounded-xl border border-border/60 bg-muted/10 p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center">
              <AtSign className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <div className="text-sm font-semibold">UPI Manual</div>
              <div className="text-[10px] text-muted-foreground">UTR-based verification</div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">The user pays via UPI and submits the UTR; admin verifies it. Set the <code className="font-mono bg-muted px-1 rounded">upiId</code> field in the config JSON.</p>
          <div className="mt-2 text-[10px] font-mono text-amber-300">config: {`{"upiId": "pay@zebvix"}`}</div>
        </div>
        <div className="rounded-xl border border-blue-500/30 bg-blue-500/8 p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-blue-500/15 flex items-center justify-center">
              <Zap className="w-4 h-4 text-blue-400" />
            </div>
            <div>
              <div className="text-sm font-semibold">Razorpay Auto</div>
              <div className="text-[10px] text-muted-foreground">Hosted checkout + webhook</div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Razorpay order create → user checkout → webhook se auto-credit. Key ID + Key Secret + Webhook Secret chahiye.</p>
          <div className="mt-2 text-[10px] text-blue-300">provider: <code className="font-mono">razorpay</code> · isAuto: true</div>
        </div>
        <div className="rounded-xl border border-border/60 bg-muted/10 p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center">
              <ArrowUpDown className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <div className="text-sm font-semibold">UPI Auto (VPA)</div>
              <div className="text-[10px] text-muted-foreground">Dynamic VPA collection</div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Auto-collection via Razorpay UPI intent or static QR. Set the <code className="font-mono bg-muted px-1 rounded">vpa</code> field in the config.</p>
          <div className="mt-2 text-[10px] font-mono text-emerald-300">config: {`{"vpa": "zebvix@razorpay"}`}</div>
        </div>
      </div>

      <div className="premium-card rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3">Name / Code</th>
                <th className="text-left px-4 py-3">Provider</th>
                <th className="text-left px-4 py-3">Type</th>
                <th className="text-left px-4 py-3">Direction</th>
                <th className="text-right px-4 py-3">Limits</th>
                <th className="text-left px-4 py-3">Mode</th>
                <th className="text-center px-4 py-3">Active</th>
                {isAdmin && <th className="text-right px-4 py-3 pr-5">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {isLoading && [0,1,2].map(i => <tr key={i}><td colSpan={isAdmin ? 8 : 7} className="px-4 py-3"><Skeleton className="h-8 w-full" /></td></tr>)}
              {!isLoading && gateways.length === 0 && (
                <tr><td colSpan={isAdmin ? 8 : 7}>
                  <EmptyState icon={Wallet} title="No gateways configured"
                    description="Add your first payment gateway (Razorpay, manual UPI, etc.)"
                    action={isAdmin ? <Button size="sm" onClick={() => setOpen(true)}><Plus className="w-4 h-4 mr-1.5" />Add Gateway</Button> : undefined}
                  />
                </td></tr>
              )}
              {!isLoading && gateways.map((g: Gateway) => (
                <tr key={g.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-sm">{g.name}</div>
                    <div className="font-mono text-[10px] text-muted-foreground">{g.code}</div>
                  </td>
                  <td className="px-4 py-3"><ProviderChip provider={g.provider} /></td>
                  <td className="px-4 py-3"><span className="text-[11px] font-mono bg-muted/40 border border-border/60 px-1.5 py-0.5 rounded">{g.type.toUpperCase()}</span></td>
                  <td className="px-4 py-3">
                    <span className={cn("text-[11px] font-medium border px-1.5 py-0.5 rounded inline-flex items-center gap-1",
                      g.direction === "deposit" ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/25" : "bg-amber-500/15 text-amber-300 border-amber-500/30")}>
                      {g.direction}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-xs tabular-nums">
                    {g.currency} {Number(g.minAmount).toLocaleString("en-IN")} – {Number(g.maxAmount).toLocaleString("en-IN")}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      {g.isAuto ? <span className="text-[10px] font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/25 px-1.5 py-0.5 rounded inline-flex items-center gap-1 w-fit"><Zap className="w-2.5 h-2.5" />Auto</span>
                        : <span className="text-[10px] font-medium bg-muted/40 border border-border/60 px-1.5 py-0.5 rounded w-fit">Manual</span>}
                      {g.testMode && <span className="text-[10px] font-medium bg-yellow-500/15 text-yellow-300 border border-yellow-500/30 px-1.5 py-0.5 rounded w-fit">TEST</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {isAdmin ? (
                      <Switch checked={g.status === "active"} disabled={toggle.isPending} onCheckedChange={(c) => toggle.mutate({ id: g.id, active: c })} />
                    ) : <StatusPill variant={g.status === "active" ? "success" : "neutral"}>{g.status}</StatusPill>}
                  </td>
                  {isAdmin && (
                    <td className="px-4 py-3 pr-4 text-right whitespace-nowrap">
                      <Button size="sm" variant="ghost" onClick={() => setEdit(g)}><Pencil className="w-3.5 h-3.5 mr-1" />Edit</Button>
                      <Button size="icon" variant="ghost" onClick={() => remove.mutate(g.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {isAdmin && <GatewayDialog open={open} onOpenChange={setOpen} qc={qc} toast={toast} />}
      {isAdmin && edit && <GatewayDialog open={!!edit} onOpenChange={(o: boolean) => { if (!o) setEdit(null); }} initial={edit} qc={qc} toast={toast} />}
    </div>
  );
}

function GatewayDialog({ open, onOpenChange, initial, qc, toast }: any) {
  const isEdit = !!initial?.id;
  const [v, setV] = useState<any>(initial ?? { type: "upi", direction: "deposit", provider: "manual", currency: "INR", isAuto: false, testMode: true, status: "active", config: "{}", minAmount: "100", maxAmount: "200000", feeFlat: "0", feePercent: "0" });
  useEffect(() => { if (open) setV(initial ?? { type: "upi", direction: "deposit", provider: "manual", currency: "INR", isAuto: false, testMode: true, status: "active", config: "{}", minAmount: "100", maxAmount: "200000", feeFlat: "0", feePercent: "0" }); }, [open]);
  const set = (k: string, val: any) => setV((p: any) => ({ ...p, [k]: val }));
  const inv = () => qc.invalidateQueries({ queryKey: ["/admin/gateways"] });

  const save = useMutation({
    mutationFn: (body: any) => isEdit ? patch(`/admin/gateways/${initial.id}`, body) : post("/admin/gateways", body),
    onSuccess: () => { inv(); onOpenChange(false); toast.success(isEdit ? "Gateway updated" : "Gateway created"); },
    onError: (e: Error) => toast.error(`Save failed: ${e.message}`),
  });

  const webhookUrl = isEdit ? `${window.location.origin.replace("/admin", "")}/api/webhooks/razorpay/${initial.id}` : null;
  const isRzp = v.provider === "razorpay";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit — ${initial.name}` : "Add Payment Gateway"}</DialogTitle>
          <DialogDescription>{isEdit ? "Leave credential fields blank to keep existing values." : "Select a provider and configure its credentials."}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Section icon={Wallet} title="Identity">
            <FormField label="Provider">
              <Select value={v.provider} onValueChange={(p) => { set("provider", p); if (p === "razorpay") set("isAuto", true); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual (UTR-based)</SelectItem>
                  <SelectItem value="razorpay">Razorpay (auto)</SelectItem>
                  <SelectItem value="payu">PayU</SelectItem>
                  <SelectItem value="cashfree">Cashfree</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Code (unique)" hint={isEdit ? "Cannot change" : "e.g. razorpay_inr"}>
              <Input value={v.code || ""} disabled={isEdit} onChange={(e) => set("code", e.target.value)} placeholder="upi_manual" />
            </FormField>
            <FormField label="Display name">
              <Input value={v.name || ""} onChange={(e) => set("name", e.target.value)} placeholder="UPI Manual" />
            </FormField>
            <FormField label="Type">
              <Select value={v.type} onValueChange={(t) => set("type", t)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["upi","imps","neft","rtgs","bank","wallet","payment_gateway","card"].map(t => <SelectItem key={t} value={t}>{t.toUpperCase()}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Direction">
              <Select value={v.direction} onValueChange={(d) => set("direction", d)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="deposit">Deposit (money in)</SelectItem>
                  <SelectItem value="withdraw">Withdrawal (money out)</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Currency">
              <Select value={v.currency || "INR"} onValueChange={(c) => set("currency", c)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["INR","USD","EUR","AED"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </FormField>
          </Section>
          <Section icon={Settings2} title="Limits & Fees">
            <FormField label="Min amount"><Input value={v.minAmount || "0"} onChange={(e) => set("minAmount", e.target.value)} /></FormField>
            <FormField label="Max amount"><Input value={v.maxAmount || "0"} onChange={(e) => set("maxAmount", e.target.value)} /></FormField>
            <FormField label="Flat fee"><Input value={v.feeFlat || "0"} onChange={(e) => set("feeFlat", e.target.value)} /></FormField>
            <FormField label="Fee %"><Input value={v.feePercent || "0"} onChange={(e) => set("feePercent", e.target.value)} /></FormField>
          </Section>
          {isRzp && (
            <Section icon={KeyRound} title="Razorpay Credentials" tone="amber">
              <FormField label="Key ID" full hint="rzp_test_… or rzp_live_…">
                <Input value={v.apiKey || ""} onChange={(e) => set("apiKey", e.target.value)} placeholder="rzp_test_xxxxxxxxxx" />
              </FormField>
              <FormField label={`Key Secret${isEdit ? " (blank = keep)" : ""}`} full>
                <Input type="password" value={v.apiSecret || ""} onChange={(e) => set("apiSecret", e.target.value)} placeholder={isEdit ? "•••••••• stored" : "Enter secret"} />
              </FormField>
              <FormField label={`Webhook Secret${isEdit ? " (blank = keep)" : ""}`} full>
                <Input type="password" value={v.webhookSecret || ""} onChange={(e) => set("webhookSecret", e.target.value)} placeholder="whsec_…" />
              </FormField>
              {webhookUrl && (
                <div className="md:col-span-2 space-y-1">
                  <Label className="text-xs">Webhook URL — Configure this in the Razorpay dashboard</Label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-background border border-border/60 rounded px-2 py-1.5 text-[11px] break-all">{webhookUrl}</code>
                    <Button type="button" size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(webhookUrl)}><Copy className="w-3.5 h-3.5" /></Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground">Events: <code className="font-mono">payment.captured</code>, <code className="font-mono">order.paid</code></p>
                </div>
              )}
            </Section>
          )}
          <Section icon={Settings2} title="Behavior">
            <div className="flex items-center justify-between rounded-lg border border-border/60 bg-background/40 px-3 py-2.5">
              <div className="flex items-center gap-2 text-sm"><Zap className="w-4 h-4 text-muted-foreground" />Auto-credit on success</div>
              <Switch checked={!!v.isAuto} onCheckedChange={(c) => set("isAuto", c)} />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border/60 bg-background/40 px-3 py-2.5">
              <div className="flex items-center gap-2 text-sm"><AlertTriangle className="w-4 h-4 text-muted-foreground" />Test / sandbox mode</div>
              <Switch checked={!!v.testMode} onCheckedChange={(c) => set("testMode", c)} />
            </div>
            <FormField label="Status" full>
              <Select value={v.status || "active"} onValueChange={(s) => set("status", s)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="paused">Paused</SelectItem></SelectContent>
              </Select>
            </FormField>
            <FormField label="Config JSON" full hint="UPI ID, account no., extra metadata">
              <Textarea rows={3} value={v.config || "{}"} onChange={(e) => set("config", e.target.value)} className="font-mono text-xs" />
            </FormField>
          </Section>
        </div>
        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => save.mutate(v)} disabled={!v.code || !v.name || save.isPending}>
            {save.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-1.5" />}
            {isEdit ? "Save changes" : "Create gateway"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// EMAIL TAB
// ═══════════════════════════════════════════════════════════════════════════
const EMAIL_PROVIDERS = [
  { value: "smtp", label: "Hostinger SMTP", icon: "🌐", desc: "smtp.hostinger.com · Port 587 (TLS)" },
  { value: "smtp", label: "SMTP (Universal)", icon: "📧", desc: "Gmail, Outlook, any SMTP server" },
  { value: "sendgrid", label: "SendGrid", icon: "📨", desc: "Twilio SendGrid API" },
  { value: "mailgun", label: "Mailgun", icon: "🔫", desc: "Mailgun HTTP API + domain" },
  { value: "postmark", label: "Postmark", icon: "📮", desc: "Postmark transactional email" },
];

function EmailTab({ configs, isLoading, isAdmin, qc, toast }: any) {
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<EmailConfig | null>(null);
  const [testId, setTestId] = useState<number | null>(null);
  const inv = () => qc.invalidateQueries({ queryKey: ["/admin/email-configs"] });

  const remove = useMutation({
    mutationFn: (id: number) => del(`/admin/email-configs/${id}`),
    onSuccess: () => { inv(); toast.success("Email config removed"); },
    onError: (e: Error) => toast.error(`Delete failed: ${e.message}`),
  });
  const toggle = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) => patch(`/admin/email-configs/${id}`, { isActive: active }),
    onSuccess: inv,
    onError: (e: Error) => toast.error(`Toggle failed: ${e.message}`),
  });
  const testMut = useMutation({
    mutationFn: (id: number) => { setTestId(id); return post<any>(`/admin/email-configs/${id}/test`, {}); },
    onSuccess: (r: any, id: number) => {
      setTestId(null); inv();
      toast({ title: r.ok ? "Config valid" : "Config issue", description: r.message, variant: r.ok ? undefined : "destructive" });
    },
    onError: (e: Error) => { setTestId(null); toast({ title: "Test failed", description: e.message, variant: "destructive" }); },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Email API Configuration</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Set up an email provider for transactional emails, OTP delivery, and notifications</p>
        </div>
        {isAdmin && <Button size="sm" onClick={() => setOpen(true)}><Plus className="w-4 h-4 mr-1.5" />Add Email Config</Button>}
      </div>

      {/* Provider quick guide */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {EMAIL_PROVIDERS.map((p) => (
          <div key={p.value} className="rounded-lg border border-border/60 bg-muted/10 p-3 text-center space-y-1">
            <div className="text-xl">{p.icon}</div>
            <div className="text-xs font-semibold">{p.label}</div>
            <div className="text-[10px] text-muted-foreground">{p.desc}</div>
          </div>
        ))}
      </div>

      {isLoading ? <Skeleton className="h-40 w-full rounded-xl" /> : configs.length === 0 ? (
        <EmptyState icon={Mail} title="No email configs" description="Add an email provider — SMTP, SendGrid, Mailgun, AWS SES, or Postmark."
          action={isAdmin ? <Button size="sm" onClick={() => setOpen(true)}><Plus className="w-4 h-4 mr-1.5" />Add Email Config</Button> : undefined} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {configs.map((c: EmailConfig) => (
            <div key={c.id} className={cn("rounded-xl border overflow-hidden", c.isActive ? "border-emerald-500/30" : "border-border/60")}>
              <div className="px-4 py-3 bg-muted/20 flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", c.isActive ? "bg-emerald-500/15" : "bg-muted/30")}>
                    <Mail className={cn("w-4 h-4", c.isActive ? "text-emerald-400" : "text-muted-foreground")} />
                  </div>
                  <div>
                    <div className="font-semibold text-sm">{c.name}</div>
                    <ProviderChip provider={c.provider} />
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <TestBadge status={c.testStatus} />
                  {isAdmin && (
                    <>
                      <Switch checked={c.isActive} onCheckedChange={(a) => toggle.mutate({ id: c.id, active: a })} />
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => testMut.mutate(c.id)} disabled={testId === c.id}>
                        {testId === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 text-amber-400" />}
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEdit(c)}><Pencil className="w-3.5 h-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => remove.mutate(c.id)}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
                    </>
                  )}
                </div>
              </div>
              <div className="px-4 py-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                {c.provider === "smtp" && c.smtpHost && <><div className="text-muted-foreground">Host</div><div className="font-mono truncate">{c.smtpHost}:{c.smtpPort}</div></>}
                {c.fromEmail && <><div className="text-muted-foreground">From</div><div className="font-mono truncate">{c.fromEmail}</div></>}
                {c.username && <><div className="text-muted-foreground">User</div><div className="font-mono truncate">{c.username}</div></>}
                {c._apiKeySet && <><div className="text-muted-foreground">API Key</div><div className="text-emerald-400 flex items-center gap-1"><Lock className="w-3 h-3" />Set</div></>}
                {c._passwordSet && <><div className="text-muted-foreground">Password</div><div className="text-emerald-400 flex items-center gap-1"><Lock className="w-3 h-3" />Set</div></>}
                {c.lastTestedAt && <><div className="text-muted-foreground">Tested</div><div>{relTime(c.lastTestedAt)}</div></>}
              </div>
            </div>
          ))}
        </div>
      )}

      {isAdmin && <EmailConfigDialog open={open} onOpenChange={setOpen} qc={qc} toast={toast} />}
      {isAdmin && edit && <EmailConfigDialog open={!!edit} onOpenChange={(o: boolean) => { if (!o) setEdit(null); }} initial={edit} qc={qc} toast={toast} />}
    </div>
  );
}

function EmailConfigDialog({ open, onOpenChange, initial, qc, toast }: any) {
  const isEdit = !!initial?.id;
  const emptyV = { name: "", provider: "smtp", smtpHost: "", smtpPort: 587, smtpSecure: false, username: "", password: "", fromEmail: "", fromName: "", apiKey: "", domain: "", region: "us-east-1", isActive: false };
  const [v, setV] = useState<any>(initial ?? emptyV);
  const [showPass, setShowPass] = useState(false);
  const [showKey, setShowKey] = useState(false);
  useEffect(() => { if (open) setV(initial ?? emptyV); }, [open]);
  const set = (k: string, val: any) => setV((p: any) => ({ ...p, [k]: val }));
  const inv = () => qc.invalidateQueries({ queryKey: ["/admin/email-configs"] });
  const save = useMutation({
    mutationFn: (body: any) => isEdit ? patch(`/admin/email-configs/${initial.id}`, body) : post("/admin/email-configs", body),
    onSuccess: () => { inv(); onOpenChange(false); toast({ title: isEdit ? "Email config updated" : "Email config added" }); },
    onError: (e: Error) => toast.error(`Save failed: ${e.message}`),
  });
  const isSmtp = v.provider === "smtp";
  const needsApi = ["sendgrid","mailgun","aws_ses","postmark"].includes(v.provider);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit — ${initial.name}` : "Add Email Config"}</DialogTitle>
          <DialogDescription>Configure provider credentials for email delivery.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Section icon={Mail} title="Provider">
            <FormField label="Config name">
              <Input value={v.name} onChange={(e) => set("name", e.target.value)} placeholder="Production Email" />
            </FormField>
            <FormField label="Provider">
              <Select value={v.provider} onValueChange={(p) => set("provider", p)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{EMAIL_PROVIDERS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
              </Select>
            </FormField>
            <FormField label="From Email" hint="Sender email address">
              <Input type="email" value={v.fromEmail || ""} onChange={(e) => set("fromEmail", e.target.value)} placeholder="no-reply@zebvix.com" />
            </FormField>
            <FormField label="From Name">
              <Input value={v.fromName || ""} onChange={(e) => set("fromName", e.target.value)} placeholder="Zebvix" />
            </FormField>
          </Section>

          {isSmtp && (
            <Section icon={Server} title="SMTP Settings">
              <div className="md:col-span-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-300 space-y-0.5">
                <div className="font-semibold">Hostinger Mail:</div>
                <div>Host: <span className="font-mono">smtp.hostinger.com</span> &nbsp;·&nbsp; Port: <span className="font-mono">587</span> (TLS) or <span className="font-mono">465</span> (SSL) &nbsp;·&nbsp; Username: your full email address</div>
              </div>
              <FormField label="SMTP Host">
                <Input value={v.smtpHost || ""} onChange={(e) => set("smtpHost", e.target.value)} placeholder="smtp.hostinger.com" className="font-mono text-xs" />
              </FormField>
              <FormField label="Port">
                <Input type="number" value={v.smtpPort || 587} onChange={(e) => set("smtpPort", Number(e.target.value))} />
              </FormField>
              <FormField label="Username / Email">
                <Input value={v.username || ""} onChange={(e) => set("username", e.target.value)} placeholder="noreply@yourdomain.com" />
              </FormField>
              <FormField label={isEdit ? "Password (blank = keep)" : "Password"}>
                <div className="flex gap-2">
                  <Input type={showPass ? "text" : "password"} value={v.password || ""} onChange={(e) => set("password", e.target.value)} placeholder={isEdit ? "••••••••" : "Hostinger email password"} className="font-mono text-xs flex-1" />
                  <Button type="button" size="icon" variant="outline" onClick={() => setShowPass(s => !s)}>{showPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}</Button>
                </div>
              </FormField>
              <div className="flex items-center justify-between rounded-lg border border-border/60 bg-background/40 px-3 py-2.5 md:col-span-2">
                <div className="flex items-center gap-2 text-sm"><Lock className="w-4 h-4 text-muted-foreground" />SSL (Port 465) — disable for TLS port 587</div>
                <Switch checked={!!v.smtpSecure} onCheckedChange={(c) => set("smtpSecure", c)} />
              </div>
            </Section>
          )}

          {needsApi && (
            <Section icon={KeyRound} title="API Credentials" tone="amber">
              <FormField label={isEdit ? "API Key (blank = keep)" : "API Key"} full>
                <div className="flex gap-2">
                  <Input type={showKey ? "text" : "password"} value={v.apiKey || ""} onChange={(e) => set("apiKey", e.target.value)} placeholder={isEdit ? "•••••••• stored" : "Paste API key"} className="font-mono text-xs flex-1" />
                  <Button type="button" size="icon" variant="outline" onClick={() => setShowKey(s => !s)}>{showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}</Button>
                </div>
              </FormField>
              {v.provider === "mailgun" && <FormField label="Domain" hint="e.g. mail.zebvix.com"><Input value={v.domain || ""} onChange={(e) => set("domain", e.target.value)} placeholder="mail.zebvix.com" /></FormField>}
              {v.provider === "aws_ses" && <FormField label="Region"><Select value={v.region || "us-east-1"} onValueChange={(r) => set("region", r)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["us-east-1","us-west-2","eu-west-1","ap-south-1"].map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent></Select></FormField>}
            </Section>
          )}

          <div className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/10 px-4 py-3">
            <div className="flex items-center gap-2 text-sm"><Activity className="w-4 h-4 text-muted-foreground" />Active (use this config for sending)</div>
            <Switch checked={!!v.isActive} onCheckedChange={(c) => set("isActive", c)} />
          </div>
        </div>
        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => save.mutate(v)} disabled={!v.name || !v.provider || save.isPending}>
            {save.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-1.5" />}
            {isEdit ? "Save changes" : "Add config"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SMS TAB
// ═══════════════════════════════════════════════════════════════════════════
const SMS_PROVIDERS = [
  { value: "msg91", label: "MSG91", desc: "India ka most popular SMS gateway. DLT registered templates." },
  { value: "twilio", label: "Twilio", desc: "Global SMS + WhatsApp OTP. Account SID + Auth Token." },
  { value: "fast2sms", label: "Fast2SMS", desc: "Indian bulk SMS. Quick API key setup." },
  { value: "2factor", label: "2Factor", desc: "OTP focused Indian provider." },
  { value: "textlocal", label: "TextLocal", desc: "India/UK bulk SMS." },
  { value: "custom", label: "Custom SMS", desc: "Any custom SMS HTTP API endpoint." },
];

function SmsTab({ providers, isLoading, isAdmin, qc, toast }: any) {
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<OtpProvider | null>(null);
  const inv = () => qc.invalidateQueries({ queryKey: ["/admin/otp-providers"] });

  const toggle = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) => patch(`/admin/otp-providers/${id}`, { isActive: active }),
    onSuccess: inv,
    onError: (e: Error) => toast.error(`Toggle failed: ${e.message}`),
  });
  const remove = useMutation({
    mutationFn: (id: number) => del(`/admin/otp-providers/${id}`),
    onSuccess: () => { inv(); toast({ title: "Provider removed" }); },
    onError: (e: Error) => toast.error(`Delete failed: ${e.message}`),
  });

  const smsList = providers.filter((p: OtpProvider) => p.channel === "sms");
  const whatsapp = providers.filter((p: OtpProvider) => p.channel === "whatsapp");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">SMS & Mobile API</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Configure MSG91, Twilio, Fast2SMS, or a custom provider for OTP SMS delivery</p>
        </div>
        {isAdmin && <Button size="sm" onClick={() => setOpen(true)}><Plus className="w-4 h-4 mr-1.5" />Add Provider</Button>}
      </div>

      {/* Provider cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {SMS_PROVIDERS.map((p) => (
          <div key={p.value} className="rounded-lg border border-border/60 bg-muted/10 p-3 space-y-1">
            <div className="flex items-center gap-2">
              <ProviderChip provider={p.value} />
              {providers.some((pr: OtpProvider) => pr.provider === p.value) && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />}
            </div>
            <div className="text-[10px] text-muted-foreground">{p.desc}</div>
          </div>
        ))}
      </div>

      {isLoading ? <Skeleton className="h-40 w-full rounded-xl" /> : providers.length === 0 ? (
        <EmptyState icon={Smartphone} title="No SMS providers" description="Add a provider to enable OTP delivery via SMS."
          action={isAdmin ? <Button size="sm" onClick={() => setOpen(true)}><Plus className="w-4 h-4 mr-1.5" />Add Provider</Button> : undefined} />
      ) : (
        <div className="premium-card rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3">Channel</th>
                <th className="text-left px-4 py-3">Provider</th>
                <th className="text-left px-4 py-3">Sender / Template</th>
                <th className="text-left px-4 py-3">API Key</th>
                <th className="text-center px-4 py-3">Active</th>
                {isAdmin && <th className="text-right px-4 py-3 pr-5">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {providers.map((p: OtpProvider) => (
                <tr key={p.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3">
                    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wide text-white",
                      p.channel === "sms" ? "bg-gradient-to-br from-emerald-500 to-teal-500" : p.channel === "email" ? "bg-gradient-to-br from-blue-500 to-indigo-500" : "bg-gradient-to-br from-green-500 to-emerald-500")}>
                      {p.channel === "sms" ? <Smartphone className="w-3 h-3" /> : p.channel === "email" ? <Mail className="w-3 h-3" /> : <MessageSquare className="w-3 h-3" />}
                      {p.channel}
                    </span>
                  </td>
                  <td className="px-4 py-3"><ProviderChip provider={p.provider} /></td>
                  <td className="px-4 py-3">
                    <div className="text-xs">{p.senderId || <span className="text-muted-foreground">—</span>}</div>
                    {p.template && <div className="font-mono text-[10px] text-muted-foreground">{p.template}</div>}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{mask(p.apiKey)}</td>
                  <td className="px-4 py-3 text-center">
                    {isAdmin ? (
                      <Switch checked={p.isActive} onCheckedChange={(a) => toggle.mutate({ id: p.id, active: a })} />
                    ) : <StatusPill variant={p.isActive ? "success" : "neutral"}>{p.isActive ? "Active" : "Off"}</StatusPill>}
                  </td>
                  {isAdmin && (
                    <td className="px-4 py-3 pr-4 text-right whitespace-nowrap">
                      <Button size="sm" variant="ghost" onClick={() => setEdit(p)}><Pencil className="w-3.5 h-3.5 mr-1" />Edit</Button>
                      <Button size="icon" variant="ghost" onClick={() => remove.mutate(p.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {isAdmin && <SmsProviderDialog open={open} onOpenChange={setOpen} qc={qc} toast={toast} />}
      {isAdmin && edit && <SmsProviderDialog open={!!edit} onOpenChange={(o: boolean) => { if (!o) setEdit(null); }} initial={edit} qc={qc} toast={toast} />}
    </div>
  );
}

function SmsProviderDialog({ open, onOpenChange, initial, qc, toast }: any) {
  const isEdit = !!initial?.id;
  const [v, setV] = useState<any>(initial ?? { channel: "sms", provider: "msg91", isActive: true });
  const [showSecret, setShowSecret] = useState(false);
  useEffect(() => { if (open) setV(initial ?? { channel: "sms", provider: "msg91", isActive: true }); }, [open]);
  const set = (k: string, val: any) => setV((p: any) => ({ ...p, [k]: val }));
  const inv = () => qc.invalidateQueries({ queryKey: ["/admin/otp-providers"] });
  const save = useMutation({
    mutationFn: (body: any) => isEdit ? patch(`/admin/otp-providers/${initial.id}`, body) : post("/admin/otp-providers", body),
    onSuccess: () => { inv(); onOpenChange(false); toast({ title: isEdit ? "Provider updated" : "Provider added" }); },
    onError: (e: Error) => toast.error(`Save failed: ${e.message}`),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit — ${initial.provider}` : "Add SMS / Mobile Provider"}</DialogTitle>
          <DialogDescription>Configure an SMS or WhatsApp provider for OTP delivery.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Section icon={Smartphone} title="Channel & Provider">
            <FormField label="Channel">
              <Select value={v.channel} onValueChange={(c) => set("channel", c)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sms">SMS</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="email">Email (OTP)</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Provider">
              <Select value={v.provider} onValueChange={(p) => set("provider", p)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SMS_PROVIDERS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormField>
          </Section>
          <Section icon={KeyRound} title="Credentials">
            <FormField label={isEdit ? "API Key (blank = keep)" : "API Key"} full>
              <Input value={v.apiKey || ""} onChange={(e) => set("apiKey", e.target.value)} placeholder={isEdit ? "(unchanged)" : "Paste API key"} className="font-mono text-xs" />
            </FormField>
            <FormField label={isEdit ? "API Secret (blank = keep)" : "API Secret"} full>
              <div className="flex gap-2">
                <Input type={showSecret ? "text" : "password"} value={v.apiSecret || ""} onChange={(e) => set("apiSecret", e.target.value)} placeholder={isEdit ? "(unchanged)" : "Paste secret"} className="font-mono text-xs flex-1" />
                <Button type="button" size="icon" variant="outline" onClick={() => setShowSecret(s => !s)}>{showSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}</Button>
              </div>
            </FormField>
            <FormField label="Sender ID" hint={v.channel === "sms" ? "DLT approved sender (e.g. ZEBVIX)" : "WhatsApp number"}>
              <Input value={v.senderId || ""} onChange={(e) => set("senderId", e.target.value)} placeholder="ZEBVIX" />
            </FormField>
            <FormField label="Template ID" hint="DLT approved template name or ID">
              <Input value={v.template || ""} onChange={(e) => set("template", e.target.value)} placeholder="OTP_LOGIN_TEMPLATE" />
            </FormField>
          </Section>
          <div className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/10 px-4 py-3">
            <div className="flex items-center gap-2 text-sm"><Activity className="w-4 h-4 text-muted-foreground" />Active</div>
            <Switch checked={!!v.isActive} onCheckedChange={(c) => set("isActive", c)} />
          </div>
        </div>
        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => save.mutate(v)} disabled={save.isPending}>
            {save.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-1.5" />}
            {isEdit ? "Save changes" : "Add provider"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// CUSTOM API TAB
// ═══════════════════════════════════════════════════════════════════════════
const CATEGORIES = ["webhook", "payment", "kyc", "notification", "data_feed", "other"];

function CustomApiTab({ apis, isLoading, isAdmin, qc, toast }: any) {
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<CustomApi | null>(null);
  const [testId, setTestId] = useState<number | null>(null);
  const inv = () => qc.invalidateQueries({ queryKey: ["/admin/custom-apis"] });

  const toggle = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) => patch(`/admin/custom-apis/${id}`, { isActive: active }),
    onSuccess: inv,
    onError: (e: Error) => toast.error(`Toggle failed: ${e.message}`),
  });
  const remove = useMutation({
    mutationFn: (id: number) => del(`/admin/custom-apis/${id}`),
    onSuccess: () => { inv(); toast({ title: "API removed" }); },
    onError: (e: Error) => toast.error(`Delete failed: ${e.message}`),
  });
  const testMut = useMutation({
    mutationFn: (id: number) => { setTestId(id); return post<any>(`/admin/custom-apis/${id}/test`, {}); },
    onSuccess: (r: any) => {
      setTestId(null); inv();
      r.ok ? toast.success(`Connected — ${r.status} · ${r.latencyMs}ms`) : toast.error(`Connection failed: ${r.error ?? "Unknown error"}`);
    },
    onError: (e: Error) => { setTestId(null); toast.error(`Test failed: ${e.message}`); },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Custom APIs & Webhooks</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Manage custom HTTP endpoints, outgoing webhooks, and external integrations</p>
        </div>
        {isAdmin && <Button size="sm" onClick={() => setOpen(true)}><Plus className="w-4 h-4 mr-1.5" />Add API</Button>}
      </div>

      {isLoading ? <Skeleton className="h-40 w-full rounded-xl" /> : apis.length === 0 ? (
        <EmptyState icon={Webhook} title="No custom APIs" description="Add an outgoing webhook or any external HTTP API endpoint."
          action={isAdmin ? <Button size="sm" onClick={() => setOpen(true)}><Plus className="w-4 h-4 mr-1.5" />Add API</Button> : undefined} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {apis.map((a: CustomApi) => (
            <div key={a.id} className={cn("rounded-xl border overflow-hidden", a.isActive ? "border-blue-500/30" : "border-border/60")}>
              <div className="px-4 py-3 bg-muted/20 flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", a.isActive ? "bg-blue-500/15" : "bg-muted/30")}>
                    <Webhook className={cn("w-4 h-4", a.isActive ? "text-blue-400" : "text-muted-foreground")} />
                  </div>
                  <div>
                    <div className="font-semibold text-sm">{a.name}</div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-mono bg-muted/40 border border-border/60 px-1.5 py-0.5 rounded">{a.method}</span>
                      <span className="text-[10px] text-muted-foreground capitalize">{a.category}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <TestBadge status={a.lastStatus ?? "untested"} />
                  {isAdmin && (
                    <>
                      <Switch checked={a.isActive} onCheckedChange={(ac) => toggle.mutate({ id: a.id, active: ac })} />
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => testMut.mutate(a.id)} disabled={testId === a.id} title="Test connection">
                        {testId === a.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 text-amber-400" />}
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEdit(a)}><Pencil className="w-3.5 h-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => remove.mutate(a.id)}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
                    </>
                  )}
                </div>
              </div>
              <div className="px-4 py-3 space-y-1">
                <div className="flex items-center gap-1.5">
                  <Link2 className="w-3 h-3 text-muted-foreground shrink-0" />
                  <span className="font-mono text-[10px] text-muted-foreground truncate">{a.endpointUrl}</span>
                </div>
                {a.description && <p className="text-xs text-muted-foreground">{a.description}</p>}
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground pt-1">
                  {a.authType !== "none" && <span className="inline-flex items-center gap-1"><Shield className="w-3 h-3" />{a.authType}</span>}
                  {a.lastCalledAt && <span>Last: {relTime(a.lastCalledAt)}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {isAdmin && <CustomApiDialog open={open} onOpenChange={setOpen} qc={qc} toast={toast} />}
      {isAdmin && edit && <CustomApiDialog open={!!edit} onOpenChange={(o: boolean) => { if (!o) setEdit(null); }} initial={edit} qc={qc} toast={toast} />}
    </div>
  );
}

function CustomApiDialog({ open, onOpenChange, initial, qc, toast }: any) {
  const isEdit = !!initial?.id;
  const [v, setV] = useState<any>(initial ?? { name: "", category: "webhook", endpointUrl: "", method: "POST", authType: "none", authValue: "", headers: "{}", isActive: false });
  const [showAuth, setShowAuth] = useState(false);
  useEffect(() => { if (open) setV(initial ?? { name: "", category: "webhook", endpointUrl: "", method: "POST", authType: "none", authValue: "", headers: "{}", isActive: false }); }, [open]);
  const set = (k: string, val: any) => setV((p: any) => ({ ...p, [k]: val }));
  const inv = () => qc.invalidateQueries({ queryKey: ["/admin/custom-apis"] });
  const save = useMutation({
    mutationFn: (body: any) => isEdit ? patch(`/admin/custom-apis/${initial.id}`, body) : post("/admin/custom-apis", body),
    onSuccess: () => { inv(); onOpenChange(false); toast({ title: isEdit ? "API updated" : "API added" }); },
    onError: (e: Error) => toast.error(`Save failed: ${e.message}`),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit — ${initial.name}` : "Add Custom API"}</DialogTitle>
          <DialogDescription>Configure an HTTP endpoint or outgoing webhook.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Section icon={Globe} title="Endpoint">
            <FormField label="Name">
              <Input value={v.name} onChange={(e) => set("name", e.target.value)} placeholder="KYC Webhook" />
            </FormField>
            <FormField label="Category">
              <Select value={v.category} onValueChange={(c) => set("category", c)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </FormField>
            <FormField label="Endpoint URL" full hint="Full HTTP/HTTPS URL">
              <Input value={v.endpointUrl} onChange={(e) => set("endpointUrl", e.target.value)} placeholder="https://api.example.com/webhook" className="font-mono text-xs" />
            </FormField>
            <FormField label="HTTP Method">
              <Select value={v.method} onValueChange={(m) => set("method", m)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["POST","GET","PUT","PATCH"].map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </FormField>
            <FormField label="Description" full>
              <Input value={v.description || ""} onChange={(e) => set("description", e.target.value)} placeholder="Short description" />
            </FormField>
          </Section>
          <Section icon={Shield} title="Authentication">
            <FormField label="Auth Type">
              <Select value={v.authType} onValueChange={(t) => set("authType", t)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="bearer">Bearer Token</SelectItem>
                  <SelectItem value="basic">Basic Auth (user:pass)</SelectItem>
                  <SelectItem value="hmac">HMAC Secret</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            {v.authType !== "none" && (
              <FormField label="Auth Value" hint={v.authType === "basic" ? "Format: username:password" : v.authType === "hmac" ? "HMAC signing secret" : "Bearer token"}>
                <div className="flex gap-2">
                  <Input type={showAuth ? "text" : "password"} value={v.authValue || ""} onChange={(e) => set("authValue", e.target.value)} className="font-mono text-xs flex-1" />
                  <Button type="button" size="icon" variant="outline" onClick={() => setShowAuth(s => !s)}>{showAuth ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}</Button>
                </div>
              </FormField>
            )}
          </Section>
          <Section icon={Hash} title="Extra Headers">
            <FormField label="Headers (JSON)" full hint='e.g. {"X-API-Version": "2", "Accept": "application/json"}'>
              <Textarea rows={3} value={v.headers || "{}"} onChange={(e) => set("headers", e.target.value)} className="font-mono text-xs" />
            </FormField>
          </Section>
          <div className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/10 px-4 py-3">
            <div className="flex items-center gap-2 text-sm"><Activity className="w-4 h-4 text-muted-foreground" />Active</div>
            <Switch checked={!!v.isActive} onCheckedChange={(c) => set("isActive", c)} />
          </div>
        </div>
        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => save.mutate(v)} disabled={!v.name || !v.endpointUrl || save.isPending}>
            {save.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-1.5" />}
            {isEdit ? "Save changes" : "Add API"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
