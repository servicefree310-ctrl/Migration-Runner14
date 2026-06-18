import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  KeyRound, Plus, Copy, Check, AlertTriangle, Trash2, Power, PowerOff,
  ShieldCheck, Loader2, Clock, MapPin, Eye, BookOpen, ExternalLink,
  ArrowLeftRight, Bot, TrendingUp, Users, Wallet,
} from "lucide-react";
import { get, post, del, ApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

type Permission =
  | "read"
  | "spot_trade"
  | "futures_trade"
  | "withdraw"
  | "transfer"
  | "ai_plan"
  | "invest"
  | "referral";

type ApiKey = {
  id: number;
  name: string;
  keyId: string;
  secretPreview: string;
  permissions: Permission[];
  ipWhitelist: string[];
  status: "active" | "disabled";
  lastUsedAt: string | null;
  lastUsedIp: string | null;
  expiresAt: string | null;
  createdAt: string;
};

type ListResp = { keys: ApiKey[] };
type CreateResp = { key: ApiKey; secret: string };

type PermConfig = {
  title: string;
  desc: string;
  tone: string;
  icon: React.ReactNode;
  dangerous?: boolean;
  group: string;
};

const PERM_DESC: Record<Permission, PermConfig> = {
  read: {
    title: "Read",
    desc: "View balances, orders, trade history, deposit addresses, positions — read-only access.",
    tone: "bg-sky-500/15 text-sky-400 border-sky-500/30",
    icon: <Eye className="h-3.5 w-3.5" />,
    group: "core",
  },
  spot_trade: {
    title: "Spot Trade",
    desc: "Place and cancel spot orders. Cannot withdraw funds.",
    tone: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    icon: <TrendingUp className="h-3.5 w-3.5" />,
    group: "trading",
  },
  futures_trade: {
    title: "Futures Trade",
    desc: "Place and cancel futures orders. Cannot withdraw funds.",
    tone: "bg-orange-500/15 text-orange-400 border-orange-500/30",
    icon: <TrendingUp className="h-3.5 w-3.5" />,
    group: "trading",
  },
  transfer: {
    title: "Transfer",
    desc: "Move funds between wallets (Spot ↔ Futures ↔ Earn). Cannot withdraw to external addresses.",
    tone: "bg-violet-500/15 text-violet-400 border-violet-500/30",
    icon: <ArrowLeftRight className="h-3.5 w-3.5" />,
    group: "funds",
  },
  withdraw: {
    title: "Withdraw",
    desc: "Initiate crypto withdrawals to external addresses. ⚠ Requires 2FA. IP whitelist strongly recommended.",
    tone: "bg-rose-500/15 text-rose-400 border-rose-500/30",
    icon: <Wallet className="h-3.5 w-3.5" />,
    dangerous: true,
    group: "funds",
  },
  ai_plan: {
    title: "AI Trading",
    desc: "View and manage AI trading plan subscriptions.",
    tone: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    icon: <Bot className="h-3.5 w-3.5" />,
    group: "features",
  },
  invest: {
    title: "Auto-Invest",
    desc: "View auto-invest account and trade history.",
    tone: "bg-teal-500/15 text-teal-400 border-teal-500/30",
    icon: <TrendingUp className="h-3.5 w-3.5" />,
    group: "features",
  },
  referral: {
    title: "Referral",
    desc: "View referral stats, referral code, and referral tree.",
    tone: "bg-pink-500/15 text-pink-400 border-pink-500/30",
    icon: <Users className="h-3.5 w-3.5" />,
    group: "features",
  },
};

const PERM_ORDER: Permission[] = [
  "read", "spot_trade", "futures_trade", "transfer", "withdraw", "ai_plan", "invest", "referral",
];

const GROUP_LABELS: Record<string, string> = {
  core: "Core Access",
  trading: "Trading",
  funds: "Funds",
  features: "Features",
};

function relTime(iso: string | null): string {
  if (!iso) return "Never";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return new Date(iso).toLocaleString();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

function permBadge(p: Permission) {
  const cfg = PERM_DESC[p];
  if (!cfg) return null;
  return (
    <Badge key={p} className={`${cfg.tone} text-[10px] border inline-flex items-center gap-1`} variant="outline">
      {cfg.icon} {cfg.title}
    </Badge>
  );
}

export default function ApiKeysTab() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [showSecret, setShowSecret] = useState<CreateResp | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ApiKey | null>(null);

  const listQ = useQuery<ListResp>({
    queryKey: ["/account/api-keys"],
    queryFn: () => get<ListResp>("/account/api-keys"),
  });

  const toggleM = useMutation({
    mutationFn: async (k: ApiKey) => {
      const action = k.status === "active" ? "disable" : "enable";
      return post(`/account/api-keys/${k.id}/${action}`, {});
    },
    onSuccess: (_, k) => {
      qc.invalidateQueries({ queryKey: ["/account/api-keys"] });
      toast.success(k.status === "active" ? "Key disabled" : "Key enabled");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : String(err) || "Action failed"),
  });

  const deleteM = useMutation({
    mutationFn: async (id: number) => del(`/account/api-keys/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/account/api-keys"] });
      toast.success("Key deleted");
      setConfirmDelete(null);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : String(err) || "Delete failed"),
  });

  const keys = listQ.data?.keys ?? [];

  return (
    <div className="space-y-4">
      {/* Intro */}
      <Card className="p-5 bg-gradient-to-br from-amber-500/10 to-orange-500/5 border-amber-500/20">
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          <div className="h-12 w-12 rounded-lg flex items-center justify-center flex-shrink-0 bg-amber-500/20 text-amber-400">
            <KeyRound className="h-6 w-6" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-base">API keys for programmatic access</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Create HMAC-SHA256 signed API keys to control your account from bots, scripts, or apps.
              Each key has its own permissions — choose only what the key needs.
              Withdraw permission requires 2FA.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" asChild>
                <a href="/user/docs/api" className="inline-flex items-center gap-1.5">
                  <BookOpen className="h-3.5 w-3.5" /> API docs <ExternalLink className="h-3 w-3" />
                </a>
              </Button>
              <Button
                size="sm"
                className="bg-gradient-to-r from-amber-500 to-orange-500 text-black hover:from-amber-400 hover:to-orange-400 font-semibold"
                onClick={() => setCreateOpen(true)}
                data-testid="button-create-api-key"
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> Create new key
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Keys list */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" /> Your API keys
            {keys.length > 0 && <Badge variant="outline" className="text-[10px]">{keys.length}</Badge>}
          </h3>
          {listQ.isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>

        {!listQ.isLoading && keys.length === 0 && (
          <div className="text-center py-8 text-sm text-muted-foreground">
            <KeyRound className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p>No API keys yet.</p>
            <p className="text-xs mt-1">Create your first key to start using the Zebvix REST API.</p>
          </div>
        )}

        <div className="space-y-3">
          {keys.map((k) => (
            <div
              key={k.id}
              className={`rounded-lg border p-4 ${k.status === "active" ? "border-border" : "border-rose-500/20 bg-rose-500/5"}`}
              data-testid={`api-key-row-${k.id}`}
            >
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="font-medium text-sm">{k.name}</div>
                    {k.status === "active" ? (
                      <Badge className="bg-emerald-500/15 text-emerald-400 border-transparent text-[10px]">ACTIVE</Badge>
                    ) : (
                      <Badge className="bg-rose-500/15 text-rose-400 border-transparent text-[10px]">DISABLED</Badge>
                    )}
                    {k.expiresAt && new Date(k.expiresAt) < new Date() && (
                      <Badge className="bg-rose-500/15 text-rose-400 border-transparent text-[10px]">EXPIRED</Badge>
                    )}
                  </div>
                  <div className="mt-2 font-mono text-xs text-muted-foreground break-all">
                    {k.keyId} <span className="text-muted-foreground/50">· secret …{k.secretPreview}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {k.permissions.map((p) => permBadge(p as Permission))}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" /> Last used: {relTime(k.lastUsedAt)}
                      {k.lastUsedIp ? ` · ${k.lastUsedIp}` : ""}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Plus className="h-3 w-3" /> Created: {relTime(k.createdAt)}
                    </span>
                    {k.expiresAt && (
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" /> Expires: {new Date(k.expiresAt).toLocaleDateString()}
                      </span>
                    )}
                    {k.ipWhitelist.length > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> {k.ipWhitelist.length} whitelisted IP{k.ipWhitelist.length > 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleM.mutate(k)}
                    disabled={toggleM.isPending}
                    data-testid={`button-toggle-${k.id}`}
                  >
                    {k.status === "active" ? (
                      <><PowerOff className="h-3.5 w-3.5 mr-1" /> Disable</>
                    ) : (
                      <><Power className="h-3.5 w-3.5 mr-1" /> Enable</>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-rose-400 border-rose-500/30 hover:bg-rose-500/10"
                    onClick={() => setConfirmDelete(k)}
                    data-testid={`button-delete-${k.id}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Quick reference card */}
      <Card className="p-5 border-border/50">
        <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-muted-foreground" /> Authentication headers
        </h3>
        <div className="bg-muted rounded-lg p-3 font-mono text-xs space-y-1 text-muted-foreground">
          <div><span className="text-sky-400">X-ZBX-APIKEY</span>: zbx_&lt;your-key-id&gt;</div>
          <div><span className="text-sky-400">X-ZBX-TIMESTAMP</span>: &lt;unix-millis&gt;</div>
          <div><span className="text-sky-400">X-ZBX-SIGN</span>: hex(HMAC-SHA256(secret, timestamp+METHOD+path+body))</div>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Base URL: <code className="bg-muted px-1 rounded">/api/v1/</code> · Clock sync: <code className="bg-muted px-1 rounded">GET /api/v1/system/time</code>
        </p>
      </Card>

      <CreateKeyDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(resp) => {
          qc.invalidateQueries({ queryKey: ["/account/api-keys"] });
          setCreateOpen(false);
          setShowSecret(resp);
        }}
      />

      <SecretRevealDialog data={showSecret} onClose={() => setShowSecret(null)} />

      <AlertDialog open={!!confirmDelete} onOpenChange={(v) => { if (!v) setConfirmDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this API key?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium text-foreground">{confirmDelete?.name}</span> ({confirmDelete?.keyId}) will be permanently removed.
              Any application using it will start getting 401 errors immediately. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-500 text-white hover:bg-rose-600"
              onClick={() => confirmDelete && deleteM.mutate(confirmDelete.id)}
              disabled={deleteM.isPending}
            >
              {deleteM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete key"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Create dialog
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_PERMS: Record<Permission, boolean> = {
  read: true,
  spot_trade: false,
  futures_trade: false,
  transfer: false,
  withdraw: false,
  ai_plan: false,
  invest: false,
  referral: false,
};

function CreateKeyDialog({
  open, onOpenChange, onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (resp: CreateResp) => void;
}) {
  const [name, setName] = useState("");
  const [perms, setPerms] = useState<Record<Permission, boolean>>(DEFAULT_PERMS);
  const [ipText, setIpText] = useState("");
  const [useExpiry, setUseExpiry] = useState(false);
  const [expiryDays, setExpiryDays] = useState("90");

  const reset = () => {
    setName("");
    setPerms(DEFAULT_PERMS);
    setIpText("");
    setUseExpiry(false);
    setExpiryDays("90");
  };

  const createM = useMutation({
    mutationFn: async () => {
      const permissions = (Object.keys(perms) as Permission[]).filter((p) => perms[p]);
      const ipWhitelist = ipText.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
      const expiresInDays = useExpiry ? Math.max(1, Math.min(365, Number(expiryDays) || 90)) : undefined;
      return post<CreateResp>("/account/api-keys", {
        name: name.trim(), permissions,
        ipWhitelist: ipWhitelist.length ? ipWhitelist : undefined,
        expiresInDays,
      });
    },
    onSuccess: (resp) => { onCreated(resp); reset(); },
    onError: (err) => {
      const msg = err instanceof ApiError
        ? (err.data as { hint?: string; error?: string })?.hint || (err.data as { error?: string })?.error || err.message
        : String(err);
      toast.error(msg || "Could not create key");
    },
  });

  const handleClose = (v: boolean) => { if (!v) reset(); onOpenChange(v); };
  const anyPerm = Object.values(perms).some(Boolean);
  const valid = name.trim().length > 0 && anyPerm;

  // Group perms for display
  const groups = ["core", "trading", "funds", "features"];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Plus className="h-4 w-4" /> Create API key</DialogTitle>
          <DialogDescription>
            The secret will be shown <strong>only once</strong> — save it before closing.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Label */}
          <div>
            <Label htmlFor="apikey-name">Label</Label>
            <Input
              id="apikey-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. trading-bot-1"
              maxLength={60}
              data-testid="input-api-key-name"
            />
            <p className="text-[11px] text-muted-foreground mt-1">A name to recognise this key. Not sent in API requests.</p>
          </div>

          {/* Permissions grouped */}
          <div>
            <Label className="mb-2 block">Permissions</Label>
            <div className="space-y-3">
              {groups.map((group) => {
                const groupPerms = PERM_ORDER.filter((p) => PERM_DESC[p].group === group);
                if (!groupPerms.length) return null;
                return (
                  <div key={group}>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-1.5">
                      {GROUP_LABELS[group]}
                    </p>
                    <div className="space-y-1.5">
                      {groupPerms.map((p) => {
                        const cfg = PERM_DESC[p];
                        const isRead = p === "read";
                        return (
                          <label
                            key={p}
                            className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition ${
                              perms[p]
                                ? `${cfg.tone.replace("text-", "border-").replace("/30", "/40")} bg-opacity-5`
                                : "border-border hover:bg-muted/40"
                            }`}
                          >
                            <Switch
                              checked={perms[p]}
                              disabled={isRead}
                              onCheckedChange={(v) => setPerms((s) => ({ ...s, [p]: v }))}
                              data-testid={`switch-perm-${p}`}
                            />
                            <div className="flex-1">
                              <div className="font-medium text-sm flex items-center gap-2">
                                <span className={cfg.tone.split(" ")[1]}>{cfg.icon}</span>
                                {cfg.title}
                                {cfg.dangerous && <AlertTriangle className="h-3.5 w-3.5 text-rose-400" />}
                                {isRead && <span className="text-[10px] text-muted-foreground font-normal">(always on)</span>}
                              </div>
                              <div className="text-xs text-muted-foreground mt-0.5">{cfg.desc}</div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* IP whitelist */}
          <div>
            <Label htmlFor="apikey-ips">IP whitelist <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Input
              id="apikey-ips"
              value={ipText}
              onChange={(e) => setIpText(e.target.value)}
              placeholder="1.2.3.4, 5.6.7.8"
              data-testid="input-api-key-ips"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Comma- or space-separated. Requests from other IPs will be rejected. Leave blank = any IP allowed.
            </p>
          </div>

          <Separator />

          {/* Expiry */}
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm">Auto-expire this key</Label>
              <p className="text-[11px] text-muted-foreground">Limits blast radius if the key ever leaks.</p>
            </div>
            <Switch checked={useExpiry} onCheckedChange={setUseExpiry} data-testid="switch-expiry" />
          </div>
          {useExpiry && (
            <div>
              <Label htmlFor="apikey-days">Expires in (days)</Label>
              <Input
                id="apikey-days"
                type="number"
                min={1}
                max={365}
                value={expiryDays}
                onChange={(e) => setExpiryDays(e.target.value)}
                data-testid="input-api-key-days"
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)} disabled={createM.isPending}>Cancel</Button>
          <Button
            onClick={() => createM.mutate()}
            disabled={!valid || createM.isPending}
            className="bg-gradient-to-r from-amber-500 to-orange-500 text-black hover:from-amber-400 hover:to-orange-400 font-semibold"
            data-testid="button-confirm-create"
          >
            {createM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create key"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Secret reveal dialog (one-time)
// ─────────────────────────────────────────────────────────────────────────────

function CopyableField({ label, value, testId }: { label: string; value: string; testId?: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy — select and copy manually.");
    }
  };
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-2 mt-1">
        <code className="flex-1 font-mono text-xs bg-muted rounded p-2 break-all" data-testid={testId}>{value}</code>
        <Button variant="outline" size="sm" onClick={onCopy} className="flex-shrink-0">
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
      </div>
    </div>
  );
}

function SecretRevealDialog({ data, onClose }: { data: CreateResp | null; onClose: () => void }) {
  const [acknowledged, setAcknowledged] = useState(false);
  const handleClose = (v: boolean) => {
    if (!v) { setAcknowledged(false); onClose(); }
  };
  return (
    <Dialog open={!!data} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-400">
            <Eye className="h-4 w-4" /> Save your secret now
          </DialogTitle>
          <DialogDescription>
            This is the <strong className="text-foreground">only</strong> time you'll see the secret.
            We never store it in plaintext, so we can't show it to you again.
          </DialogDescription>
        </DialogHeader>

        {data && (
          <div className="space-y-3">
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300 flex gap-2">
              <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <div>
                Treat the secret like a password. Anyone with the key ID + secret can sign requests on your behalf
                (limited to the permissions you granted).
              </div>
            </div>

            <CopyableField label="API Key (Key ID)" value={data.key.keyId} testId="text-new-api-key" />
            <CopyableField label="Secret Key"       value={data.secret}    testId="text-new-api-secret" />

            <div className="rounded-lg border border-border p-3 bg-muted/30">
              <p className="text-xs font-semibold text-muted-foreground mb-1">How to sign a request (Python example)</p>
              <pre className="text-[10px] text-muted-foreground overflow-x-auto whitespace-pre-wrap">{`import hmac, hashlib, time, requests

key_id = "${data.key.keyId}"
secret = "<your-secret>"
ts     = str(int(time.time() * 1000))
method = "GET"
path   = "/api/v1/account/balances"
body   = ""

sig = hmac.new(secret.encode(), (ts+method+path+body).encode(), hashlib.sha256).hexdigest()

resp = requests.get("https://zebvix.com" + path, headers={
  "X-ZBX-APIKEY": key_id,
  "X-ZBX-TIMESTAMP": ts,
  "X-ZBX-SIGN": sig,
})`}</pre>
            </div>

            <label className="flex items-center gap-2 text-sm cursor-pointer pt-2">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
                className="rounded"
                data-testid="checkbox-acknowledge-saved"
              />
              I have saved both the API key and secret in a safe place.
            </label>
          </div>
        )}

        <DialogFooter>
          <Button
            onClick={() => handleClose(false)}
            disabled={!acknowledged}
            data-testid="button-close-secret"
          >
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
