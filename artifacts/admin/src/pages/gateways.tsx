import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post, patch, del } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  Plus, Pencil, Trash2, Search, RefreshCw, Loader2, Wallet, Zap, Copy, CheckCircle2,
  AlertTriangle, ArrowDownToLine, ArrowUpFromLine, Settings2, KeyRound, FileJson,
} from "lucide-react";

type Gateway = {
  id: number; code: string; name: string; type: string; direction: string;
  provider: string; currency: string;
  minAmount: string; maxAmount: string; feeFlat: string; feePercent: string;
  processingTime: string; isAuto: boolean; status: string;
  apiKey: string | null; apiSecret: string | null; webhookSecret: string | null;
  testMode: boolean; logoUrl: string | null;
  config: string;
};

const GATEWAY_TYPES = ["upi", "imps", "neft", "rtgs", "bank", "wallet", "payment_gateway", "card"];
const PROVIDERS = [
  { value: "manual", label: "Manual (UTR-based)", auto: false },
  { value: "razorpay", label: "Razorpay (auto)", auto: true },
  { value: "payu", label: "PayU (manual config)", auto: false },
  { value: "cashfree", label: "Cashfree (manual config)", auto: false },
];

function providerColor(p: string): string {
  if (p === "razorpay") return "bg-blue-500/15 text-blue-300 border-blue-500/30";
  if (p === "payu") return "bg-violet-500/15 text-violet-300 border-violet-500/30";
  if (p === "cashfree") return "bg-orange-500/15 text-orange-300 border-orange-500/30";
  return "bg-muted text-muted-foreground border-border/60";
}

export default function GatewaysPage() {
  const { user: me } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const isAdmin = me?.role === "admin" || me?.role === "superadmin";

  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Gateway | null>(null);
  const [deleteFor, setDeleteFor] = useState<Gateway | null>(null);

  const { data: gateways = [], refetch, isLoading, isFetching } = useQuery<Gateway[]>({
    queryKey: ["/admin/gateways"], queryFn: () => get<Gateway[]>("/admin/gateways"),
  });

  const inv = () => qc.invalidateQueries({ queryKey: ["/admin/gateways"] });

  const create = useMutation({
    mutationFn: (v: Partial<Gateway>) => post("/admin/gateways", v),
    onSuccess: () => { inv(); setCreateOpen(false); toast({ title: "Gateway created" }); },
    onError: (e: Error) => toast({ title: "Create failed", description: e.message, variant: "destructive" }),
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<Gateway> }) => patch(`/admin/gateways/${id}`, body),
    onSuccess: () => { inv(); setEditing(null); toast({ title: "Gateway updated" }); },
    onError: (e: Error) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });
  const remove = useMutation({
    mutationFn: (id: number) => del(`/admin/gateways/${id}`),
    onSuccess: () => { inv(); setDeleteFor(null); toast({ title: "Gateway removed" }); },
    onError: (e: Error) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });
  const toggle = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) => patch(`/admin/gateways/${id}`, { status: active ? "active" : "paused" }),
    onSuccess: (_d, v) => { inv(); toast({ title: v.active ? "Gateway active" : "Gateway paused" }); },
    onError: (e: Error) => toast({ title: "Toggle failed", description: e.message, variant: "destructive" }),
  });

  const stats = useMemo(() => {
    const total = gateways.length;
    const active = gateways.filter((g) => g.status === "active").length;
    const auto = gateways.filter((g) => g.isAuto).length;
    const razorpay = gateways.filter((g) => g.provider === "razorpay").length;
    const deposit = gateways.filter((g) => g.direction === "deposit").length;
    const withdraw = gateways.filter((g) => g.direction === "withdraw").length;
    return { total, active, auto, razorpay, deposit, withdraw };
  }, [gateways]);

  const filtered = useMemo(() => {
    return gateways.filter((g) => {
      if (tab === "deposit" && g.direction !== "deposit") return false;
      if (tab === "withdraw" && g.direction !== "withdraw") return false;
      if (tab === "auto" && !g.isAuto) return false;
      if (tab === "manual" && g.isAuto) return false;
      if (!search) return true;
      const hay = `${g.code} ${g.name} ${g.provider} ${g.type}`.toLowerCase();
      return hay.includes(search.toLowerCase());
    });
  }, [gateways, tab, search]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Treasury"
        title="Payment Gateways"
        description="Configure Razorpay, manual UPI, IMPS, and bank transfer gateways. Auto-credit gateways update balances via webhook; manual gateways require admin verification."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} data-testid="button-refresh-gateways">
              <RefreshCw className={cn("w-4 h-4 mr-1.5", isFetching && "animate-spin")} />Refresh
            </Button>
            {isAdmin && (
              <Button onClick={() => setCreateOpen(true)} data-testid="button-add-gateway">
                <Plus className="w-4 h-4 mr-1.5" />Add gateway
              </Button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 md:gap-4">
        <PremiumStatCard title="Total Gateways" value={stats.total} icon={Wallet} hero hint={`${stats.active} active`} />
        <PremiumStatCard title="Auto-Credit" value={stats.auto} icon={Zap} hint="Webhook driven" />
        <PremiumStatCard title="Manual" value={stats.total - stats.auto} icon={Settings2} hint="Admin verify" />
        <PremiumStatCard title="Razorpay" value={stats.razorpay} icon={Zap} hint="Hosted checkout" />
        <PremiumStatCard title="Deposit Routes" value={stats.deposit} icon={ArrowDownToLine} hint="Money in" />
        <PremiumStatCard title="Withdraw Routes" value={stats.withdraw} icon={ArrowUpFromLine} hint="Money out" />
      </div>

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="all" data-testid="tab-all">All ({stats.total})</TabsTrigger>
            <TabsTrigger value="deposit" data-testid="tab-deposit">Deposit ({stats.deposit})</TabsTrigger>
            <TabsTrigger value="withdraw" data-testid="tab-withdraw">Withdraw ({stats.withdraw})</TabsTrigger>
            <TabsTrigger value="auto" data-testid="tab-auto">Auto ({stats.auto})</TabsTrigger>
            <TabsTrigger value="manual" data-testid="tab-manual">Manual ({stats.total - stats.auto})</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input
            placeholder="Code, name, provider…" value={search} onChange={(e) => setSearch(e.target.value)}
            className="pl-8" data-testid="input-search-gateways"
          />
        </div>
      </div>

      <div className="premium-card rounded-xl overflow-hidden border border-border/60">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-3 pl-5">Code / Name</th>
                <th className="text-left font-medium px-4 py-3">Provider</th>
                <th className="text-left font-medium px-4 py-3">Type</th>
                <th className="text-left font-medium px-4 py-3">Direction</th>
                <th className="text-right font-medium px-4 py-3">Min / Max</th>
                <th className="text-right font-medium px-4 py-3">Fee</th>
                <th className="text-left font-medium px-4 py-3">Mode</th>
                <th className="text-center font-medium px-4 py-3">Status</th>
                {isAdmin && <th className="text-right font-medium px-4 py-3 pr-5">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {isLoading && Array.from({ length: 4 }).map((_, i) => (
                <tr key={i}><td className="px-4 py-3" colSpan={isAdmin ? 9 : 8}><Skeleton className="h-9 w-full" /></td></tr>
              ))}
              {!isLoading && filtered.length === 0 && (
                <tr><td colSpan={isAdmin ? 9 : 8} className="px-4 py-3">
                  <EmptyState icon={Wallet} title="No gateways"
                    description={search || tab !== "all" ? "Try adjusting your filters." : "Add your first payment gateway (Razorpay, manual UPI, etc.)"}
                    action={isAdmin && !search && tab === "all" ? <Button onClick={() => setCreateOpen(true)} size="sm"><Plus className="w-4 h-4 mr-1.5" />Add gateway</Button> : undefined} />
                </td></tr>
              )}
              {!isLoading && filtered.map((g) => (
                <tr key={g.id} className="hover:bg-muted/20 transition-colors" data-testid={`row-gateway-${g.id}`}>
                  <td className="px-4 py-3 pl-5">
                    <div className="font-semibold text-sm">{g.name}</div>
                    <div className="font-mono text-[10px] text-muted-foreground">{g.code}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn("px-2 py-0.5 rounded-md text-[11px] font-medium border inline-flex items-center gap-1", providerColor(g.provider))}>
                      {g.provider === "razorpay" && <Zap className="w-3 h-3" />}
                      {g.provider}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted/40 border border-border/60">{g.type.toUpperCase()}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium border inline-flex items-center gap-1",
                      g.direction === "deposit" ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/25" : "bg-amber-500/15 text-amber-300 border-amber-500/30")}>
                      {g.direction === "deposit" ? <ArrowDownToLine className="w-3 h-3" /> : <ArrowUpFromLine className="w-3 h-3" />}
                      {g.direction}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-xs">
                    {g.currency} {Number(g.minAmount).toLocaleString("en-IN")} – {Number(g.maxAmount).toLocaleString("en-IN")}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-xs">
                    {Number(g.feeFlat) > 0 && `${g.currency} ${g.feeFlat}`}
                    {Number(g.feeFlat) > 0 && Number(g.feePercent) > 0 && " + "}
                    {Number(g.feePercent) > 0 && `${g.feePercent}%`}
                    {Number(g.feeFlat) === 0 && Number(g.feePercent) === 0 && <span className="text-muted-foreground">free</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      {g.isAuto ? (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/25 inline-flex items-center gap-1 w-fit">
                          <Zap className="w-3 h-3" />Auto
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted/40 border border-border/60 w-fit">Manual</span>
                      )}
                      {g.testMode && <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-yellow-500/15 text-yellow-300 border border-yellow-500/30 w-fit">TEST</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {isAdmin ? (
                      <Switch checked={g.status === "active"} disabled={toggle.isPending}
                        onCheckedChange={(c) => toggle.mutate({ id: g.id, active: c })}
                        data-testid={`switch-gateway-${g.id}`} />
                    ) : <StatusPill status={g.status} />}
                  </td>
                  {isAdmin && (
                    <td className="px-4 py-3 pr-4 text-right whitespace-nowrap">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(g)} data-testid={`button-edit-${g.id}`}>
                        <Pencil className="w-3.5 h-3.5 mr-1" />Edit
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => setDeleteFor(g)} data-testid={`button-delete-${g.id}`}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-border/60 px-4 py-2.5 flex items-center justify-between text-xs text-muted-foreground bg-muted/10">
          <div>{filtered.length} of {gateways.length} gateways</div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />{stats.active} active</span>
            <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-blue-400" />{stats.auto} auto</span>
          </div>
        </div>
      </div>

      <GatewayFormDialog
        open={createOpen} onOpenChange={setCreateOpen}
        title="New payment gateway" description="Select a provider, then configure credentials, fees, and limits."
        submitLabel="Create gateway" submitting={create.isPending}
        onSubmit={(v) => create.mutate(v)}
      />
      {editing && (
        <GatewayFormDialog
          open={!!editing} onOpenChange={(o) => !o && setEditing(null)}
          title={`Edit gateway — ${editing.name}`}
          description="Secrets blank chhodne par unchanged rahenge."
          submitLabel="Save changes" submitting={update.isPending}
          initial={{ ...editing, apiSecret: "", webhookSecret: "" }} isEdit
          onSubmit={(v) => update.mutate({ id: editing.id, body: v })}
        />
      )}

      <Dialog open={!!deleteFor} onOpenChange={(o) => !o && setDeleteFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-destructive" />Delete gateway</DialogTitle>
            <DialogDescription>This gateway will be permanently deleted. Future deposits and withdrawals cannot be processed through it. Past records will remain intact.</DialogDescription>
          </DialogHeader>
          {deleteFor && (
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-sm">
              <div className="font-semibold">{deleteFor.name}</div>
              <div className="text-xs text-muted-foreground font-mono">{deleteFor.code} · {deleteFor.provider} · {deleteFor.direction}</div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteFor(null)}>Cancel</Button>
            <Button variant="destructive" disabled={remove.isPending} onClick={() => deleteFor && remove.mutate(deleteFor.id)} data-testid="button-confirm-delete-gateway">
              {remove.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Trash2 className="w-4 h-4 mr-1.5" />}
              Delete gateway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function GatewayFormDialog({
  open, onOpenChange, title, description, submitLabel, submitting,
  initial, isEdit = false, onSubmit,
}: {
  open: boolean; onOpenChange: (o: boolean) => void;
  title: string; description: string; submitLabel: string; submitting: boolean;
  initial?: Partial<Gateway>; isEdit?: boolean;
  onSubmit: (v: Partial<Gateway>) => void;
}) {
  const [v, setV] = useState<Partial<Gateway>>(initial || {});
  useEffect(() => {
    if (open) {
      setV(initial || {
        type: "upi", direction: "deposit", provider: "manual", currency: "INR",
        processingTime: "Instant", isAuto: false, testMode: true, status: "active", config: "{}",
        minAmount: "100", maxAmount: "200000", feeFlat: "0", feePercent: "0",
      });
    }
  }, [open, initial]);
  useEffect(() => {
    if (open && !isEdit && v.provider === "razorpay") {
      setV((s) => ({ ...s, isAuto: true, type: s.type === "upi" ? "payment_gateway" : s.type }));
    }
  }, [v.provider, isEdit, open]);

  const set = <K extends keyof Gateway>(k: K, val: Gateway[K]) => setV((s) => ({ ...s, [k]: val }));
  const isRazorpay = v.provider === "razorpay";
  const canSave = !!v.code && !!v.name;

  const webhookUrl = isEdit && initial?.id
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/api/webhooks/razorpay/${initial.id}`
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <FormSection icon={Wallet} title="Provider & Identity">
            <Field label="Provider" full hint={isRazorpay ? "Razorpay creates orders, redirects to checkout, auto-credits via webhook." : undefined}>
              <Select value={v.provider} onValueChange={(p) => set("provider", p)}>
                <SelectTrigger data-testid="select-provider"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PROVIDERS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Code (unique)" hint="Internal identifier — cannot be changed after creation">
              <Input value={v.code || ""} disabled={isEdit} onChange={(e) => set("code", e.target.value)} placeholder="razorpay_inr" data-testid="input-code" />
            </Field>
            <Field label="Display name">
              <Input value={v.name || ""} onChange={(e) => set("name", e.target.value)} placeholder="Razorpay" data-testid="input-name" />
            </Field>
            <Field label="Type">
              <Select value={v.type} onValueChange={(t) => set("type", t)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{GATEWAY_TYPES.map((t) => <SelectItem key={t} value={t}>{t.toUpperCase()}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Direction">
              <Select value={v.direction} onValueChange={(t) => set("direction", t)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="deposit">Deposit (money in)</SelectItem>
                  <SelectItem value="withdraw">Withdraw (money out)</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Currency">
              <Select value={v.currency || "INR"} onValueChange={(c) => set("currency", c)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["INR", "USD", "EUR", "AED", "GBP"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Logo URL" full hint="Optional — user-facing logo">
              <Input value={v.logoUrl || ""} onChange={(e) => set("logoUrl", e.target.value)} placeholder="https://…" />
            </Field>
          </FormSection>

          <FormSection icon={Settings2} title="Limits & Fees">
            <Field label="Min amount">
              <Input value={v.minAmount || "0"} onChange={(e) => set("minAmount", e.target.value)} />
            </Field>
            <Field label="Max amount">
              <Input value={v.maxAmount || "0"} onChange={(e) => set("maxAmount", e.target.value)} />
            </Field>
            <Field label="Fee flat" hint="Per-transaction flat fee">
              <Input value={v.feeFlat || "0"} onChange={(e) => set("feeFlat", e.target.value)} />
            </Field>
            <Field label="Fee %" hint="Percentage on amount">
              <Input value={v.feePercent || "0"} onChange={(e) => set("feePercent", e.target.value)} />
            </Field>
            <Field label="Processing time" full>
              <Input value={v.processingTime || ""} onChange={(e) => set("processingTime", e.target.value)} placeholder="Instant / 1-3 hours" />
            </Field>
          </FormSection>

          <FormSection icon={Zap} title="Behavior">
            <ToggleRow label="Auto-credit on success" hint="Update balance via webhook" icon={Zap} checked={!!v.isAuto} onChange={(c) => set("isAuto", c)} />
            <ToggleRow label="Test mode" hint="Use sandbox credentials" icon={AlertTriangle} checked={!!v.testMode} onChange={(c) => set("testMode", c)} />
            <Field label="Status" full>
              <Select value={v.status || "active"} onValueChange={(s) => set("status", s)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active (visible to users)</SelectItem>
                  <SelectItem value="paused">Paused (hidden)</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </FormSection>

          {isRazorpay && (
            <FormSection icon={KeyRound} title="Razorpay Credentials" tone="primary">
              <Field label="Key ID" full hint="rzp_test_… ya rzp_live_…">
                <Input value={v.apiKey || ""} onChange={(e) => set("apiKey", e.target.value)} placeholder="rzp_test_xxxxxxxxxx" data-testid="input-rzp-key" />
              </Field>
              <Field label={`Key Secret${isEdit ? " (blank = unchanged)" : ""}`} full>
                <Input type="password" value={v.apiSecret || ""} onChange={(e) => set("apiSecret", e.target.value)} placeholder={isEdit ? "•••••••• stored" : "secret"} data-testid="input-rzp-secret" />
              </Field>
              <Field label={`Webhook Secret${isEdit ? " (blank = unchanged)" : ""}`} full>
                <Input type="password" value={v.webhookSecret || ""} onChange={(e) => set("webhookSecret", e.target.value)} placeholder="whsec_…" data-testid="input-rzp-whsec" />
              </Field>
              {webhookUrl && (
                <div className="md:col-span-2 space-y-1.5">
                  <Label className="text-xs">Webhook URL — Configure this in the Razorpay dashboard</Label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-background border border-border/60 rounded px-2 py-1.5 text-[11px] break-all">{webhookUrl}</code>
                    <Button type="button" size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(webhookUrl)}>
                      <Copy className="w-3.5 h-3.5 mr-1" />Copy
                    </Button>
                  </div>
                  <div className="text-[11px] text-muted-foreground">Subscribe events: <code className="font-mono">payment.captured</code>, <code className="font-mono">order.paid</code></div>
                </div>
              )}
            </FormSection>
          )}

          <FormSection icon={FileJson} title="Extra Config">
            <Field label="Config JSON" full hint="UPI ID, account no., extra metadata — JSON format">
              <Textarea rows={3} value={v.config || "{}"} onChange={(e) => set("config", e.target.value)} className="font-mono text-xs" />
            </Field>
          </FormSection>
        </div>

        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => onSubmit(v)} disabled={!canSave || submitting} data-testid="button-save-gateway">
            {submitting ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-1.5" />}
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FormSection({ icon: Icon, title, tone = "default", children }: {
  icon: any; title: string; tone?: "default" | "primary"; children: React.ReactNode;
}) {
  return (
    <div className={cn("rounded-lg border p-4", tone === "primary" ? "border-primary/40 bg-primary/5" : "border-border/60 bg-muted/10")}>
      <div className={cn("flex items-center gap-2 text-xs font-semibold uppercase tracking-wider mb-3",
        tone === "primary" ? "text-primary" : "text-muted-foreground")}>
        <Icon className="w-3.5 h-3.5" />{title}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{children}</div>
    </div>
  );
}
function Field({ label, hint, full, children }: { label: string; hint?: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div className={cn("space-y-1.5", full && "md:col-span-2")}>
      <Label className="text-xs">{label}</Label>
      {children}
      {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}
function ToggleRow({ label, hint, icon: Icon, checked, onChange }: {
  label: string; hint?: string; icon: any; checked: boolean; onChange: (c: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-background/40 px-3 py-2.5">
      <div className="flex items-center gap-2 text-sm">
        <Icon className="w-4 h-4 text-muted-foreground" />
        <div>
          <div>{label}</div>
          {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
