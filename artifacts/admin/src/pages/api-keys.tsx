import { useMemo, useState } from "react";
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
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  KeyRound, Plus, Trash2, Pencil, Search, ShieldCheck, ShieldAlert, Globe2, Eye, EyeOff,
  Server, Activity, Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";

type ApiKey = {
  id: number; provider: string; label: string;
  apiKey: string; apiSecret: string; baseUrl: string | null;
  isActive: string; createdAt: string;
};

const PROVIDER_GRADIENTS: Record<string, string> = {
  binance: "from-yellow-500 to-amber-500",
  coinbase: "from-blue-500 to-indigo-500",
  kucoin: "from-emerald-500 to-teal-500",
  bybit: "from-orange-500 to-red-500",
  okx: "from-slate-500 to-zinc-500",
  coingecko: "from-green-500 to-emerald-500",
  default: "from-purple-500 to-fuchsia-500",
};

function ProviderChip({ provider }: { provider: string }) {
  const grad = PROVIDER_GRADIENTS[provider.toLowerCase()] ?? PROVIDER_GRADIENTS.default;
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wide bg-gradient-to-br text-white shadow-sm",
      grad,
    )}>
      <Layers className="w-2.5 h-2.5" />{provider}
    </span>
  );
}

function maskSecret(s?: string | null) {
  if (!s) return "—";
  if (s.length <= 8) return "•".repeat(s.length);
  return `${s.slice(0, 4)}${"•".repeat(Math.max(4, s.length - 8))}${s.slice(-4)}`;
}

function FormSection({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className="w-3.5 h-3.5 text-amber-300" />{title}
      </div>
      <div className="rounded-lg border border-border/60 bg-muted/10 p-3 space-y-3">
        {children}
      </div>
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

function ApiKeyForm({
  initial, onSubmit, saving,
}: {
  initial?: Partial<ApiKey>; onSubmit: (v: Partial<ApiKey>) => void; saving?: boolean;
}) {
  const [v, setV] = useState<Partial<ApiKey>>(initial || { provider: "binance", isActive: "true" });
  const [showSecret, setShowSecret] = useState(false);
  const isEdit = !!initial?.id;
  return (
    <div className="space-y-4">
      <FormSection title="Identity" icon={KeyRound}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Provider">
            <Select value={v.provider || ""} onValueChange={(p) => setV({ ...v, provider: p })}>
              <SelectTrigger><SelectValue placeholder="Choose provider" /></SelectTrigger>
              <SelectContent>
                {["binance", "coinbase", "kucoin", "bybit", "okx", "coingecko", "custom"].map((p) => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Label">
            <Input value={v.label || ""} onChange={(e) => setV({ ...v, label: e.target.value })} placeholder="prod-trading" />
          </Field>
        </div>
      </FormSection>

      <FormSection title="Credentials" icon={ShieldCheck}>
        <Field label="API Key" hint={isEdit ? "Leave blank to keep existing key" : "Public key from provider"}>
          <Input value={v.apiKey || ""} onChange={(e) => setV({ ...v, apiKey: e.target.value })} className="font-mono text-xs" placeholder={isEdit ? "(unchanged)" : "Paste key"} />
        </Field>
        <Field label="API Secret" hint={isEdit ? "Leave blank to keep existing secret" : "Stored encrypted"}>
          <div className="relative">
            <Input
              type={showSecret ? "text" : "password"}
              value={v.apiSecret || ""}
              onChange={(e) => setV({ ...v, apiSecret: e.target.value })}
              className="font-mono text-xs pr-9"
              placeholder={isEdit ? "(unchanged)" : "Paste secret"}
            />
            <button
              type="button"
              onClick={() => setShowSecret(s => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label={showSecret ? "Hide secret" : "Show secret"}
            >
              {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </Field>
      </FormSection>

      <FormSection title="Endpoint" icon={Globe2}>
        <Field label="Base URL" hint="Optional — leave blank to use provider default">
          <Input value={v.baseUrl || ""} onChange={(e) => setV({ ...v, baseUrl: e.target.value })} className="font-mono text-xs" placeholder="https://api.provider.com" />
        </Field>
      </FormSection>

      <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/10 p-3">
        <div>
          <div className="text-sm font-medium">Active</div>
          <div className="text-[11px] text-muted-foreground">When off, this key is not used by the system</div>
        </div>
        <Switch checked={v.isActive === "true"} onCheckedChange={(c) => setV({ ...v, isActive: c ? "true" : "false" })} aria-label="Toggle active" />
      </div>

      <Button className="w-full" onClick={() => onSubmit(v)} disabled={saving}>
        {saving ? "Saving…" : "Save API key"}
      </Button>
    </div>
  );
}

export default function ApiKeysPage() {
  const { user: me } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const isAdmin = me?.role === "admin" || me?.role === "superadmin";
  const { data = [], isLoading } = useQuery<ApiKey[]>({
    queryKey: ["/admin/api-keys"],
    queryFn: () => get<ApiKey[]>("/admin/api-keys"),
    enabled: isAdmin,
  });

  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<ApiKey | null>(null);
  const [confirmDel, setConfirmDel] = useState<ApiKey | null>(null);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("all");
  const [pendingId, setPendingId] = useState<number | null>(null);

  const create = useMutation({
    mutationFn: (v: Partial<ApiKey>) => post("/admin/api-keys", v),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/admin/api-keys"] });
      setOpen(false);
      toast({ title: "API key added" });
    },
    onError: (e: any) => toast({ title: "Add failed", description: e?.message, variant: "destructive" }),
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<ApiKey> }) => patch(`/admin/api-keys/${id}`, body),
    onMutate: ({ id }) => setPendingId(id),
    onSettled: () => setPendingId(null),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/admin/api-keys"] });
      setEdit(null);
      toast({ title: "API key updated" });
    },
    onError: (e: any) => toast({ title: "Update failed", description: e?.message, variant: "destructive" }),
  });
  const remove = useMutation({
    mutationFn: (id: number) => del(`/admin/api-keys/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/admin/api-keys"] });
      setConfirmDel(null);
      toast({ title: "API key removed" });
    },
    onError: (e: any) => toast({ title: "Delete failed", description: e?.message, variant: "destructive" }),
  });

  const stats = useMemo(() => {
    const total = data.length;
    const active = data.filter(k => k.isActive === "true").length;
    const inactive = total - active;
    const providers = new Set(data.map(k => k.provider)).size;
    return { total, active, inactive, providers };
  }, [data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.filter((k) => {
      if (tab === "active" && k.isActive !== "true") return false;
      if (tab === "inactive" && k.isActive === "true") return false;
      if (!q) return true;
      return [k.provider, k.label, k.baseUrl ?? ""].some((s) => s.toLowerCase().includes(q));
    });
  }, [data, search, tab]);

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="System" title="API Keys" description="Exchange + market-data provider credentials" />
        <EmptyState icon={ShieldAlert} title="Admin only" description="You need admin role to view API keys." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="System"
        title="API Keys"
        description="Exchange + market-data provider credentials. Secrets stored encrypted."
        actions={
          <Button onClick={() => setOpen(true)} data-testid="button-add-api-key">
            <Plus className="w-4 h-4 mr-1.5" /> Add API Key
          </Button>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <PremiumStatCard hero title="Total Keys" value={stats.total} icon={KeyRound} hint={`${stats.providers} providers`} />
        <PremiumStatCard title="Active" value={stats.active} icon={ShieldCheck} accent />
        <PremiumStatCard title="Inactive" value={stats.inactive} icon={ShieldAlert} />
        <PremiumStatCard title="Providers" value={stats.providers} icon={Server} />
      </div>

      <div className="premium-card rounded-xl">
        <div className="flex flex-col md:flex-row md:items-center gap-3 p-4 border-b border-border/60">
          <Tabs value={tab} onValueChange={setTab} className="w-full md:w-auto">
            <TabsList>
              <TabsTrigger value="all">All ({stats.total})</TabsTrigger>
              <TabsTrigger value="active">Active ({stats.active})</TabsTrigger>
              <TabsTrigger value="inactive">Inactive ({stats.inactive})</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="relative md:ml-auto md:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search provider, label…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase text-muted-foreground border-b border-border/60 bg-muted/20">
              <tr>
                <th className="text-left py-2.5 px-4">Provider / Label</th>
                <th className="text-left py-2.5 px-4">API Key</th>
                <th className="text-left py-2.5 px-4">Secret</th>
                <th className="text-left py-2.5 px-4">Base URL</th>
                <th className="text-left py-2.5 px-4">Status</th>
                <th className="text-left py-2.5 px-4">Created</th>
                <th className="text-right py-2.5 px-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={7} className="py-8 text-center text-muted-foreground"><Activity className="w-5 h-5 mx-auto mb-2 animate-pulse" />Loading…</td></tr>
              )}
              {!isLoading && filtered.length === 0 && (
                <tr><td colSpan={7}>
                  <EmptyState
                    icon={KeyRound}
                    title={search || tab !== "all" ? "No matching keys" : "No API keys yet"}
                    description={search || tab !== "all" ? "Try another filter or search." : "Add your first exchange or market-data provider key."}
                    action={!search && tab === "all" && (
                      <Button onClick={() => setOpen(true)}><Plus className="w-4 h-4 mr-1.5" /> Add API Key</Button>
                    )}
                  />
                </td></tr>
              )}
              {filtered.map((k) => (
                <tr key={k.id} className="border-b last:border-b-0 border-border/40 hover:bg-muted/20 transition-colors" data-testid={`row-apikey-${k.id}`}>
                  <td className="py-3 px-4">
                    <div className="flex flex-col gap-1">
                      <ProviderChip provider={k.provider} />
                      <span className="text-xs text-muted-foreground">{k.label || "—"}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 font-mono text-xs">{maskSecret(k.apiKey)}</td>
                  <td className="py-3 px-4 font-mono text-xs">{maskSecret(k.apiSecret)}</td>
                  <td className="py-3 px-4 font-mono text-[11px] text-muted-foreground max-w-[220px] truncate">{k.baseUrl || "—"}</td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={k.isActive === "true"}
                        disabled={pendingId === k.id}
                        onCheckedChange={(c) => update.mutate({ id: k.id, body: { isActive: c ? "true" : "false" } })}
                        aria-label={`Toggle ${k.provider}/${k.label} active`}
                      />
                      <StatusPill variant={k.isActive === "true" ? "success" : "neutral"}>{k.isActive === "true" ? "Active" : "Off"}</StatusPill>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-xs text-muted-foreground">{new Date(k.createdAt).toLocaleDateString("en-IN")}</td>
                  <td className="py-3 px-4 text-right">
                    <Button size="icon" variant="ghost" onClick={() => setEdit(k)} aria-label={`Edit ${k.provider}/${k.label}`} data-testid={`button-edit-apikey-${k.id}`}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => setConfirmDel(k)} aria-label={`Delete ${k.provider}/${k.label}`} data-testid={`button-delete-apikey-${k.id}`}>
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
            <DialogTitle className="flex items-center gap-2"><KeyRound className="w-4 h-4 text-amber-300" /> Add API key</DialogTitle>
            <DialogDescription>Provide credentials for an exchange or market-data provider.</DialogDescription>
          </DialogHeader>
          <ApiKeyForm onSubmit={(v) => create.mutate(v)} saving={create.isPending} />
        </DialogContent>
      </Dialog>

      {edit && (
        <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Pencil className="w-4 h-4 text-amber-300" /> Edit {edit.provider}/{edit.label}</DialogTitle>
              <DialogDescription>Leave key/secret blank to keep current values.</DialogDescription>
            </DialogHeader>
            <ApiKeyForm initial={{ ...edit, apiKey: "", apiSecret: "" }} onSubmit={(v) => update.mutate({ id: edit.id, body: v })} saving={update.isPending} />
          </DialogContent>
        </Dialog>
      )}

      <AlertDialog open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete API key?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDel && <>This will permanently remove <span className="font-mono font-semibold">{confirmDel.provider}/{confirmDel.label}</span>. Any service using this key will fail.</>}
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
