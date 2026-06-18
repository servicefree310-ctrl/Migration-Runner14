import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, patch, post } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/premium/PageHeader";
import { PremiumStatCard } from "@/components/premium/PremiumStatCard";
import { StatusPill } from "@/components/premium/StatusPill";
import { EmptyState } from "@/components/premium/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  Search, KeyRound, Eye, EyeOff, Lock, ShieldCheck, Copy, AlertTriangle, Check,
  Wallet, Users, RefreshCw, Loader2, ExternalLink, Power, PowerOff, ShieldAlert,
} from "lucide-react";

type Addr = {
  id: number; userId: number; networkId: number; address: string; memo: string | null;
  status: string; derivationPath: string | null; derivationIndex: number | null;
  hasPrivateKey: boolean; createdAt: string; lastUsedAt: string | null;
  userEmail: string | null; userName: string | null; userPhone: string | null;
};
type Stats = {
  total: number; active: number; disabled: number; withPk: number; withoutPk: number;
  perNetwork: Record<number, { total: number; withPk: number }>;
};
type Net = { id: number; name: string; chain: string; explorerUrl?: string | null };
type VaultStatus = { passwordSet: boolean; mnemonicConfigured: boolean };

function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function UserAddressesPage() {
  const { user: me } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const isAdmin = me?.role === "admin" || me?.role === "superadmin";

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [networkFilter, setNetworkFilter] = useState<string>("all");

  const [pwdSetupOpen, setPwdSetupOpen] = useState(false);
  const [revealOpen, setRevealOpen] = useState<Addr | null>(null);
  const [revealedPk, setRevealedPk] = useState<string | null>(null);
  const [pwdInput, setPwdInput] = useState("");
  const [showPk, setShowPk] = useState(false);
  const [copyOk, setCopyOk] = useState(false);
  const [revealError, setRevealError] = useState("");
  const [setupCurrent, setSetupCurrent] = useState("");
  const [setupNew, setSetupNew] = useState("");
  const [setupConfirm, setSetupConfirm] = useState("");
  const [setupError, setSetupError] = useState("");

  const { data: vault } = useQuery<VaultStatus>({
    queryKey: ["/admin/vault/status"],
    queryFn: () => get<VaultStatus>("/admin/vault/status"),
    refetchInterval: 10000,
  });
  const { data: stats } = useQuery<Stats>({
    queryKey: ["/admin/user-addresses/stats"],
    queryFn: () => get<Stats>("/admin/user-addresses/stats"),
    refetchInterval: 8000,
  });
  const { data: nets = [] } = useQuery<Net[]>({
    queryKey: ["/admin/networks"], queryFn: () => get<Net[]>("/admin/networks"),
  });

  const qsParts: string[] = [];
  if (search) qsParts.push(`search=${encodeURIComponent(search)}`);
  if (statusFilter !== "all") qsParts.push(`status=${statusFilter}`);
  if (networkFilter !== "all") qsParts.push(`networkId=${networkFilter}`);
  const qsStr = qsParts.join("&");
  const { data: rows = [], refetch, isLoading, isFetching } = useQuery<Addr[]>({
    queryKey: ["/admin/user-addresses", search, statusFilter, networkFilter],
    queryFn: () => get<Addr[]>(`/admin/user-addresses${qsStr ? `?${qsStr}` : ""}`),
    refetchInterval: 8000,
  });

  const toggleStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => patch(`/admin/user-addresses/${id}`, { status }),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["/admin/user-addresses"] });
      qc.invalidateQueries({ queryKey: ["/admin/user-addresses/stats"] });
      toast({ title: v.status === "active" ? "Address enabled" : "Address disabled" });
    },
    onError: (e: Error) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  const setPassword = useMutation({
    mutationFn: (body: { password: string; currentPassword?: string }) => post("/admin/vault/set-password", body),
    onSuccess: () => {
      setPwdSetupOpen(false);
      setSetupCurrent(""); setSetupNew(""); setSetupConfirm(""); setSetupError("");
      qc.invalidateQueries({ queryKey: ["/admin/vault/status"] });
      toast({ title: "Vault password saved", description: "Private keys can now be decrypted." });
    },
    onError: (e: any) => {
      const msg = e?.message || "Failed to set password";
      setSetupError(msg);
      toast({ title: "Vault password failed", description: msg, variant: "destructive" });
    },
  });

  const reveal = useMutation({
    mutationFn: ({ id, password }: { id: number; password: string }) =>
      post<{ privateKey: string }>(`/admin/user-addresses/${id}/reveal`, { password }),
    onSuccess: (d) => { setRevealedPk(d.privateKey); setRevealError(""); toast({ title: "Private key decrypted" }); },
    onError: (e: any) => {
      const msg = e?.message || "Reveal failed";
      setRevealError(msg); setRevealedPk(null);
      toast({ title: "Decrypt failed", description: msg, variant: "destructive" });
    },
  });

  function openReveal(a: Addr) {
    setRevealOpen(a);
    setRevealedPk(null); setPwdInput(""); setShowPk(false); setCopyOk(false); setRevealError("");
  }
  function closeReveal() {
    setRevealOpen(null); setRevealedPk(null); setPwdInput(""); setShowPk(false); setCopyOk(false); setRevealError("");
  }

  function submitSetup() {
    setSetupError("");
    if (setupNew.length < 8) { setSetupError("Password must be at least 8 characters"); return; }
    if (setupNew !== setupConfirm) { setSetupError("Passwords do not match"); return; }
    setPassword.mutate(vault?.passwordSet ? { password: setupNew, currentPassword: setupCurrent } : { password: setupNew });
  }

  const netById = useMemo(() => new Map(nets.map((n) => [n.id, n])), [nets]);
  function explorerLink(a: Addr) {
    const n = netById.get(a.networkId);
    if (!n?.explorerUrl) return null;
    return `${n.explorerUrl.replace(/\/$/, "")}/address/${a.address}`;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Treasury"
        title="User Crypto Addresses"
        description="HD-derived addresses per user/network — private keys are vault-encrypted. The admin vault password is required to reveal them."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} data-testid="button-refresh-addresses">
              <RefreshCw className={cn("w-4 h-4 mr-1.5", isFetching && "animate-spin")} />Refresh
            </Button>
            {isAdmin && vault?.passwordSet && (
              <Button variant="outline" size="sm" onClick={() => setPwdSetupOpen(true)} data-testid="button-change-password">
                <ShieldCheck className="w-4 h-4 mr-1.5" />Change vault password
              </Button>
            )}
          </>
        }
      />

      {!vault?.passwordSet && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 flex items-start gap-3">
          <ShieldAlert className="h-5 w-5 text-amber-400 mt-0.5 shrink-0" />
          <div className="flex-1">
            <div className="font-semibold text-sm">Vault password not set</div>
            <div className="text-xs text-muted-foreground">Set the admin vault password to enable revealing user private keys. Without it, keys remain encrypted with the server secret.</div>
          </div>
          {isAdmin && (
            <Button onClick={() => setPwdSetupOpen(true)} data-testid="button-set-password">
              <Lock className="h-4 w-4 mr-1.5" />Set password
            </Button>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 md:gap-4">
        <PremiumStatCard title="Total Addresses" value={stats?.total ?? 0} icon={Wallet} hero hint="HD derived" />
        <PremiumStatCard title="Active" value={stats?.active ?? 0} icon={Power} hint="Receiving enabled" />
        <PremiumStatCard title="Disabled" value={stats?.disabled ?? 0} icon={PowerOff} hint="Receiving paused" />
        <PremiumStatCard title="Encrypted PK" value={stats?.withPk ?? 0} icon={KeyRound} hint="Auto-send capable" />
        <PremiumStatCard title="Legacy" value={stats?.withoutPk ?? 0} icon={Users} hint="No PK stored" />
      </div>

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <Tabs value={statusFilter} onValueChange={setStatusFilter}>
          <TabsList>
            <TabsTrigger value="all" data-testid="tab-all">All ({stats?.total ?? 0})</TabsTrigger>
            <TabsTrigger value="active" data-testid="tab-active">Active ({stats?.active ?? 0})</TabsTrigger>
            <TabsTrigger value="disabled" data-testid="tab-disabled">Disabled ({stats?.disabled ?? 0})</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
          <Select value={networkFilter} onValueChange={setNetworkFilter}>
            <SelectTrigger className="w-full sm:w-44" data-testid="select-network"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All networks</SelectItem>
              {nets.map((n) => <SelectItem key={n.id} value={String(n.id)}>{n.name}/{n.chain}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
            <Input
              placeholder="User ID, email, name, phone, address…" value={search}
              onChange={(e) => setSearch(e.target.value)} className="pl-8" data-testid="input-search-addresses"
            />
          </div>
        </div>
      </div>

      <div className="premium-card rounded-xl overflow-hidden border border-border/60">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-3 pl-5">User</th>
                <th className="text-left font-medium px-4 py-3">Network</th>
                <th className="text-left font-medium px-4 py-3">Address</th>
                <th className="text-left font-medium px-4 py-3">Path</th>
                <th className="text-left font-medium px-4 py-3">Status</th>
                <th className="text-left font-medium px-4 py-3">PK</th>
                <th className="text-left font-medium px-4 py-3">Created</th>
                {isAdmin && <th className="text-right font-medium px-4 py-3 pr-5">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {isLoading && Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}><td className="px-4 py-3" colSpan={isAdmin ? 8 : 7}><Skeleton className="h-9 w-full" /></td></tr>
              ))}
              {!isLoading && rows.length === 0 && (
                <tr><td colSpan={isAdmin ? 8 : 7} className="px-4 py-3">
                  <EmptyState icon={Wallet} title="No addresses"
                    description={search || statusFilter !== "all" || networkFilter !== "all"
                      ? "Try adjusting your filters."
                      : "Addresses are generated on first deposit request per user."} />
                </td></tr>
              )}
              {!isLoading && rows.map((a) => {
                const n = netById.get(a.networkId);
                const link = explorerLink(a);
                return (
                  <tr key={a.id} className="hover:bg-muted/20 transition-colors" data-testid={`row-addr-${a.id}`}>
                    <td className="px-4 py-3 pl-5">
                      <div className="text-sm font-medium">#{a.userId}</div>
                      <div className="text-xs text-muted-foreground truncate max-w-[180px]" title={a.userEmail || ""}>{a.userEmail || a.userPhone || "—"}</div>
                      {a.userName && <div className="text-[10px] text-muted-foreground truncate max-w-[180px]">{a.userName}</div>}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {n ? (<><span className="font-medium">{n.name}</span><span className="text-muted-foreground"> · {n.chain}</span></>) : `#${a.networkId}`}
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px]">
                      {link ? (
                        <a href={link} target="_blank" rel="noreferrer" className="hover:underline text-blue-400 inline-flex items-center gap-1">
                          {a.address}<ExternalLink className="w-3 h-3" />
                        </a>
                      ) : a.address}
                      {a.memo && <div className="text-[10px] text-muted-foreground">memo: {a.memo}</div>}
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-muted-foreground">{a.derivationPath || "—"}</td>
                    <td className="px-4 py-3"><StatusPill status={a.status} /></td>
                    <td className="px-4 py-3">
                      {a.hasPrivateKey
                        ? <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/15 text-blue-300 border border-blue-500/30 inline-flex items-center gap-1"><KeyRound className="h-3 w-3" />encrypted</span>
                        : <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-yellow-500/15 text-yellow-300 border border-yellow-500/30">legacy</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground" title={new Date(a.createdAt).toLocaleString("en-IN")}>{relTime(a.createdAt)}</td>
                    {isAdmin && (
                      <td className="px-4 py-3 pr-4 text-right whitespace-nowrap space-x-1">
                        {a.hasPrivateKey && (
                          <Button size="sm" variant="outline" onClick={() => openReveal(a)} disabled={!vault?.passwordSet} data-testid={`button-reveal-${a.id}`}>
                            <Eye className="h-3.5 w-3.5 mr-1" />Reveal
                          </Button>
                        )}
                        <Button size="sm" variant={a.status === "active" ? "ghost" : "default"}
                          onClick={() => toggleStatus.mutate({ id: a.id, status: a.status === "active" ? "disabled" : "active" })}
                          data-testid={`button-toggle-${a.id}`}>
                          {a.status === "active" ? <PowerOff className="h-3.5 w-3.5 text-destructive" /> : <><Power className="h-3.5 w-3.5 mr-1" />Enable</>}
                        </Button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="border-t border-border/60 px-4 py-2.5 flex items-center justify-between text-xs text-muted-foreground bg-muted/10">
          <div>{rows.length} of {stats?.total ?? rows.length} addresses</div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />{stats?.active ?? 0} active</span>
            <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-blue-400" />{stats?.withPk ?? 0} with PK</span>
            <span className={cn("inline-flex items-center gap-1", vault?.passwordSet ? "text-emerald-400" : "text-amber-400")}>
              <ShieldCheck className="w-3 h-3" />Vault {vault?.passwordSet ? "ready" : "needs setup"}
            </span>
          </div>
        </div>
      </div>

      {/* Set/Change vault password */}
      <Dialog open={pwdSetupOpen} onOpenChange={(o) => { if (!o) { setPwdSetupOpen(false); setSetupError(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Lock className="w-5 h-5 text-primary" />{vault?.passwordSet ? "Change vault password" : "Set vault password"}</DialogTitle>
            <DialogDescription>
              This password is required to decrypt user private keys. There is NO recovery — store it somewhere safe.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {vault?.passwordSet && (
              <div>
                <Label className="text-xs">Current password</Label>
                <Input type="password" value={setupCurrent} onChange={(e) => setSetupCurrent(e.target.value)} data-testid="input-current-pwd" />
              </div>
            )}
            <div>
              <Label className="text-xs">New password (min 8 chars)</Label>
              <Input type="password" value={setupNew} onChange={(e) => setSetupNew(e.target.value)} data-testid="input-new-pwd" />
            </div>
            <div>
              <Label className="text-xs">Confirm new password</Label>
              <Input type="password" value={setupConfirm} onChange={(e) => setSetupConfirm(e.target.value)} data-testid="input-confirm-pwd" />
            </div>
            {setupError && <div className="text-xs text-destructive flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" />{setupError}</div>}
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5 text-[11px] text-amber-200/90 flex gap-2">
              <ShieldAlert className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>Save this password somewhere secure — it is required to view user private keys and (future) authorize hot-wallet withdrawals. There is no recovery option.</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPwdSetupOpen(false)}>Cancel</Button>
            <Button onClick={submitSetup} disabled={setPassword.isPending} data-testid="button-save-pwd">
              {setPassword.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <ShieldCheck className="w-4 h-4 mr-1.5" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reveal private key */}
      <Dialog open={!!revealOpen} onOpenChange={(o) => { if (!o) closeReveal(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><KeyRound className="w-5 h-5 text-primary" />Reveal private key</DialogTitle>
            <DialogDescription>Sensitive operation — sirf trusted environment me dekhein. Audit log me record hota hai.</DialogDescription>
          </DialogHeader>
          {revealOpen && (
            <div className="space-y-3">
              <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-sm space-y-1">
                <div><span className="text-muted-foreground">User:</span> #{revealOpen.userId} {revealOpen.userEmail && <span className="text-xs text-muted-foreground">({revealOpen.userEmail})</span>}</div>
                <div className="font-mono text-[11px] break-all"><span className="text-muted-foreground font-sans">Address:</span> {revealOpen.address}</div>
                <div className="text-[11px] text-muted-foreground font-mono">Path: {revealOpen.derivationPath}</div>
              </div>
              {!revealedPk ? (
                <>
                  <div>
                    <Label className="text-xs">Vault password</Label>
                    <Input type="password" value={pwdInput} onChange={(e) => setPwdInput(e.target.value)} autoFocus
                      onKeyDown={(e) => { if (e.key === "Enter" && pwdInput) reveal.mutate({ id: revealOpen.id, password: pwdInput }); }}
                      data-testid="input-vault-pwd" />
                  </div>
                  {revealError && <div className="text-xs text-destructive flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" />{revealError}</div>}
                </>
              ) : (
                <>
                  <div>
                    <Label className="text-xs">Private key</Label>
                    <div className="flex gap-2 items-center mt-1">
                      <Input type={showPk ? "text" : "password"} value={revealedPk} readOnly className="font-mono text-xs" />
                      <Button size="icon" variant="outline" type="button" onClick={() => setShowPk(!showPk)} data-testid="button-toggle-show">
                        {showPk ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                      <Button size="icon" variant="outline" type="button" onClick={() => { navigator.clipboard.writeText(revealedPk); setCopyOk(true); setTimeout(() => setCopyOk(false), 1500); }} data-testid="button-copy-pk">
                        {copyOk ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                  <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2.5 text-[11px] text-destructive-foreground flex gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span>Sensitive — anyone with this key can spend funds at this address. Do not share or screenshot it.</span>
                  </div>
                </>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={closeReveal}>Close</Button>
            {revealOpen && !revealedPk && (
              <Button onClick={() => reveal.mutate({ id: revealOpen.id, password: pwdInput })} disabled={!pwdInput || reveal.isPending} data-testid="button-decrypt">
                {reveal.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <KeyRound className="w-4 h-4 mr-1.5" />}
                Decrypt
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
