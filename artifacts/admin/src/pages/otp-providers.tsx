import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post, patch, del } from "@/lib/api";
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
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Plus, Trash2, Pencil, MessageSquare, Mail, Smartphone, ShieldCheck, Search, Eye, EyeOff,
  Key as KeyIcon, Hash, Tag, Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Provider = {
  id: number; channel: string; provider: string; apiKey: string | null;
  apiSecret: string | null; senderId: string | null; template: string | null; isActive: boolean;
};

const CHANNEL_META: Record<string, { icon: any; label: string; gradient: string; color: string }> = {
  sms:      { icon: Smartphone, label: "SMS",      gradient: "from-emerald-500 to-teal-500", color: "text-emerald-300" },
  email:    { icon: Mail,       label: "Email",    gradient: "from-blue-500 to-indigo-500",  color: "text-blue-300" },
  whatsapp: { icon: MessageSquare, label: "WhatsApp", gradient: "from-green-500 to-emerald-500", color: "text-green-300" },
};

function ChannelChip({ channel }: { channel: string }) {
  const meta = CHANNEL_META[channel] ?? CHANNEL_META.sms;
  const Icon = meta.icon;
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wide bg-gradient-to-br text-white shadow-sm",
      meta.gradient,
    )}>
      <Icon className="w-3 h-3" />{meta.label}
    </span>
  );
}

function FormSection({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className="w-3.5 h-3.5 text-amber-300" />{title}
      </div>
      <div className="rounded-lg border border-border/60 bg-muted/10 p-3 space-y-3">{children}</div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">{label}</Label>
      {children}
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function maskSecret(s?: string | null) {
  if (!s) return "—";
  if (s.length <= 8) return "•".repeat(s.length);
  return `${s.slice(0, 4)}${"•".repeat(Math.max(4, s.length - 8))}${s.slice(-4)}`;
}

function ProviderForm({
  initial, onSubmit, saving,
}: {
  initial?: Partial<Provider>; onSubmit: (v: Partial<Provider>) => void; saving?: boolean;
}) {
  const [v, setV] = useState<Partial<Provider>>(initial || { channel: "sms", provider: "msg91", isActive: true });
  const [show, setShow] = useState(false);
  const isEdit = !!initial?.id;
  return (
    <div className="space-y-4">
      <FormSection title="Channel & Provider" icon={Tag}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Channel">
            <Select value={v.channel} onValueChange={(c) => setV({ ...v, channel: c })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sms">SMS</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Provider" hint="Select a provider or type a custom one">
            <Select
              value={v.provider || ""}
              onValueChange={(p) => setV({ ...v, provider: p })}
            >
              <SelectTrigger><SelectValue placeholder="Select provider" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ninzasms">🇮🇳 NinzaSMS (SMS — Indian)</SelectItem>
                <SelectItem value="ninzasms_whatsapp">🟢 NinzaSMS WhatsApp</SelectItem>
                <SelectItem value="msg91">MSG91</SelectItem>
                <SelectItem value="fast2sms">Fast2SMS</SelectItem>
                <SelectItem value="2factor">2Factor</SelectItem>
                <SelectItem value="twilio">Twilio</SelectItem>
                <SelectItem value="textlocal">TextLocal</SelectItem>
                <SelectItem value="sendgrid">SendGrid (email)</SelectItem>
                <SelectItem value="mailgun">Mailgun (email)</SelectItem>
                <SelectItem value="smtp">SMTP / Hostinger (email)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
      </FormSection>

      <FormSection title="Credentials" icon={KeyIcon}>
        <Field label="API Key" hint={isEdit ? "Leave blank to keep existing" : undefined}>
          <Input value={v.apiKey || ""} onChange={(e) => setV({ ...v, apiKey: e.target.value })} className="font-mono text-xs" placeholder={isEdit ? "(unchanged)" : "Paste key"} />
        </Field>
        <Field label="API Secret" hint={isEdit ? "Leave blank to keep existing" : undefined}>
          <div className="relative">
            <Input
              type={show ? "text" : "password"}
              value={v.apiSecret || ""}
              onChange={(e) => setV({ ...v, apiSecret: e.target.value })}
              className="font-mono text-xs pr-9"
              placeholder={isEdit ? "(unchanged)" : "Paste secret"}
            />
            <button
              type="button"
              onClick={() => setShow(s => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label={show ? "Hide secret" : "Show secret"}
            >
              {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </Field>
      </FormSection>

      {(v.provider === "ninzasms" || v.provider === "ninzasms_whatsapp") && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-300 space-y-1">
          <div className="font-semibold">NinzaSMS Setup:</div>
          <div>• <strong>API Key</strong> — paste your full Authorization key (e.g. <span className="font-mono">NINZASMSsite...</span>)</div>
          <div>• <strong>Sender ID</strong> — your numeric User ID from NinzaSMS dashboard (e.g. <span className="font-mono">15716</span>)</div>
          <div>• <strong>Route</strong> — SMS uses <span className="font-mono">sms</span>, WhatsApp uses <span className="font-mono">waninza</span> (auto-set)</div>
          <div>• API Secret field is not required for NinzaSMS</div>
        </div>
      )}
      <FormSection title="Identity & Template" icon={Hash}>
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Sender ID"
            hint={
              v.provider === "ninzasms" || v.provider === "ninzasms_whatsapp"
                ? "Numeric User ID from NinzaSMS (e.g. 15716)"
                : v.channel === "email" ? "From email/name" : "DLT/short code"
            }
          >
            <Input
              value={v.senderId || ""}
              onChange={(e) => setV({ ...v, senderId: e.target.value })}
              placeholder={
                v.provider === "ninzasms" || v.provider === "ninzasms_whatsapp"
                  ? "15716"
                  : v.channel === "email" ? "no-reply@zebvix.com" : "ZEBVIX"
              }
            />
          </Field>
          <Field label="Template ID" hint="Provider template ID/name (optional for NinzaSMS)">
            <Input value={v.template || ""} onChange={(e) => setV({ ...v, template: e.target.value })} placeholder="OTP_LOGIN" />
          </Field>
        </div>
      </FormSection>

      <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/10 p-3">
        <div>
          <div className="text-sm font-medium">Active</div>
          <div className="text-[11px] text-muted-foreground">When off, OTPs won't route through this provider</div>
        </div>
        <Switch checked={v.isActive ?? false} onCheckedChange={(c) => setV({ ...v, isActive: c })} aria-label="Toggle active" />
      </div>

      <Button className="w-full" onClick={() => onSubmit(v)} disabled={saving}>
        {saving ? "Saving…" : "Save provider"}
      </Button>
    </div>
  );
}

export default function OtpProvidersPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data = [], isLoading } = useQuery<Provider[]>({
    queryKey: ["/admin/otp-providers"],
    queryFn: () => get<Provider[]>("/admin/otp-providers"),
  });

  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Provider | null>(null);
  const [confirmDel, setConfirmDel] = useState<Provider | null>(null);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("all");
  const [pendingId, setPendingId] = useState<number | null>(null);

  const create = useMutation({
    mutationFn: (v: Partial<Provider>) => post("/admin/otp-providers", v),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/admin/otp-providers"] });
      setOpen(false);
      toast({ title: "Provider added" });
    },
    onError: (e: any) => toast({ title: "Add failed", description: e?.message, variant: "destructive" }),
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<Provider> }) => patch(`/admin/otp-providers/${id}`, body),
    onMutate: ({ id }) => setPendingId(id),
    onSettled: () => setPendingId(null),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/admin/otp-providers"] });
      setEdit(null);
      toast({ title: "Provider updated" });
    },
    onError: (e: any) => toast({ title: "Update failed", description: e?.message, variant: "destructive" }),
  });
  const remove = useMutation({
    mutationFn: (id: number) => del(`/admin/otp-providers/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/admin/otp-providers"] });
      setConfirmDel(null);
      toast({ title: "Provider removed" });
    },
    onError: (e: any) => toast({ title: "Delete failed", description: e?.message, variant: "destructive" }),
  });

  const stats = useMemo(() => {
    const total = data.length;
    const active = data.filter(p => p.isActive).length;
    const sms = data.filter(p => p.channel === "sms").length;
    const email = data.filter(p => p.channel === "email").length;
    const whatsapp = data.filter(p => p.channel === "whatsapp").length;
    return { total, active, sms, email, whatsapp };
  }, [data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.filter((p) => {
      if (tab !== "all" && p.channel !== tab) return false;
      if (!q) return true;
      return [p.provider, p.channel, p.senderId ?? "", p.template ?? ""].some((s) => s.toLowerCase().includes(q));
    });
  }, [data, search, tab]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="System"
        title="OTP Providers"
        description="Configure SMS, Email & WhatsApp delivery providers for one-time passwords."
        actions={
          <Button onClick={() => setOpen(true)} data-testid="button-add-otp-provider">
            <Plus className="w-4 h-4 mr-1.5" /> Add Provider
          </Button>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <PremiumStatCard hero title="Total Providers" value={stats.total} icon={ShieldCheck} hint={`${stats.active} active`} />
        <PremiumStatCard title="Active" value={stats.active} icon={ShieldCheck} accent />
        <PremiumStatCard title="SMS" value={stats.sms} icon={Smartphone} />
        <PremiumStatCard title="Email" value={stats.email} icon={Mail} />
        <PremiumStatCard title="WhatsApp" value={stats.whatsapp} icon={MessageSquare} />
      </div>

      <div className="premium-card rounded-xl">
        <div className="flex flex-col md:flex-row md:items-center gap-3 p-4 border-b border-border/60">
          <Tabs value={tab} onValueChange={setTab} className="w-full md:w-auto">
            <TabsList>
              <TabsTrigger value="all">All ({stats.total})</TabsTrigger>
              <TabsTrigger value="sms">SMS ({stats.sms})</TabsTrigger>
              <TabsTrigger value="email">Email ({stats.email})</TabsTrigger>
              <TabsTrigger value="whatsapp">WhatsApp ({stats.whatsapp})</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="relative md:ml-auto md:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search provider, sender…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase text-muted-foreground border-b border-border/60 bg-muted/20">
              <tr>
                <th className="text-left py-2.5 px-4">Channel</th>
                <th className="text-left py-2.5 px-4">Provider</th>
                <th className="text-left py-2.5 px-4">Sender / Template</th>
                <th className="text-left py-2.5 px-4">Key</th>
                <th className="text-left py-2.5 px-4">Status</th>
                <th className="text-right py-2.5 px-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={6} className="py-8 text-center text-muted-foreground"><Activity className="w-5 h-5 mx-auto mb-2 animate-pulse" />Loading…</td></tr>
              )}
              {!isLoading && filtered.length === 0 && (
                <tr><td colSpan={6}>
                  <EmptyState
                    icon={ShieldCheck}
                    title={search || tab !== "all" ? "No matching providers" : "No OTP providers yet"}
                    description={search || tab !== "all" ? "Try another filter or search." : "Add your first OTP delivery provider."}
                    action={!search && tab === "all" && (
                      <Button onClick={() => setOpen(true)}><Plus className="w-4 h-4 mr-1.5" /> Add Provider</Button>
                    )}
                  />
                </td></tr>
              )}
              {filtered.map((p) => (
                <tr key={p.id} className="border-b last:border-b-0 border-border/40 hover:bg-muted/20 transition-colors" data-testid={`row-otp-${p.id}`}>
                  <td className="py-3 px-4"><ChannelChip channel={p.channel} /></td>
                  <td className="py-3 px-4 font-semibold">{p.provider}</td>
                  <td className="py-3 px-4">
                    <div className="text-xs">{p.senderId || <span className="text-muted-foreground">—</span>}</div>
                    {p.template && <div className="text-[10px] font-mono text-muted-foreground">{p.template}</div>}
                  </td>
                  <td className="py-3 px-4 font-mono text-xs">{maskSecret(p.apiKey)}</td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={p.isActive}
                        disabled={pendingId === p.id}
                        onCheckedChange={(c) => update.mutate({ id: p.id, body: { isActive: c } })}
                        aria-label={`Toggle ${p.provider} active`}
                      />
                      <StatusPill variant={p.isActive ? "success" : "neutral"}>{p.isActive ? "Active" : "Off"}</StatusPill>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <Button size="icon" variant="ghost" onClick={() => setEdit(p)} aria-label={`Edit ${p.provider}`} data-testid={`button-edit-otp-${p.id}`}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => setConfirmDel(p)} aria-label={`Delete ${p.provider}`} data-testid={`button-delete-otp-${p.id}`}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-amber-300" /> Add OTP provider</DialogTitle>
            <DialogDescription>OTP delivery provider for SMS, Email or WhatsApp.</DialogDescription>
          </DialogHeader>
          <ProviderForm onSubmit={(v) => create.mutate(v)} saving={create.isPending} />
        </DialogContent>
      </Dialog>

      {edit && (
        <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Pencil className="w-4 h-4 text-amber-300" /> Edit {edit.provider}</DialogTitle>
              <DialogDescription>Leave key/secret blank to keep current values.</DialogDescription>
            </DialogHeader>
            <ProviderForm initial={{ ...edit, apiKey: "", apiSecret: "" }} onSubmit={(v) => update.mutate({ id: edit.id, body: v })} saving={update.isPending} />
          </DialogContent>
        </Dialog>
      )}

      <AlertDialog open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete OTP provider?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDel && <>This will permanently remove <span className="font-mono font-semibold">{confirmDel.provider}</span> ({confirmDel.channel}). OTPs may fail until another provider is configured.</>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmDel && remove.mutate(confirmDel.id)} className="bg-destructive hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
