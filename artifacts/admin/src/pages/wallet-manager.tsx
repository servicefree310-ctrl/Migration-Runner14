import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post, del } from "@/lib/api";
import { SuccessModal, type GenericSuccess } from "@/components/SuccessModal";
import { PageHeader } from "@/components/premium/PageHeader";
import { SectionCard } from "@/components/premium/SectionCard";
import { PremiumStatCard } from "@/components/premium/PremiumStatCard";
import { StatusPill } from "@/components/premium/StatusPill";
import { EmptyState } from "@/components/premium/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Wallet, Search, Eye, Plus, Trash2, ArrowLeft, RefreshCw,
  Coins, DollarSign, Users, Network, Shield, Copy, CheckCircle2,
  Building2, ChevronRight,
} from "lucide-react";

interface UserWalletRow {
  id: number;
  email: string;
  username: string;
  status: string;
  balances: { asset: string; free: number; locked: number; usdValue: number }[];
  totalUsdValue: number;
}

interface MasterWallet {
  id: number;
  coin: string;
  network: string;
  label: string;
  depositAddress: string | null;
  isActive: boolean;
  notes: string | null;
}

interface UserDetail {
  user: { id: number; email: string; username: string; status: string };
  balances: { asset: string; free: number; locked: number; total: number; usdValue: number }[];
  totalUsdValue: number;
}

const NETWORKS = ["BEP20", "ERC20", "TRC20", "Polygon", "Arbitrum", "Avalanche", "Solana", "Bitcoin", "Other"];

function fmtUsd(n: number) {
  return (n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " USDT";
}

export default function WalletManager() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"users" | "master">("users");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [addMasterOpen, setAddMasterOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<GenericSuccess | null>(null);
  const [masterForm, setMasterForm] = useState({
    coin: "", network: "BEP20", label: "", depositAddress: "", notes: "",
  });

  const usersQ = useQuery<{ users: UserWalletRow[] }>({
    queryKey: ["admin-wallet-users", search],
    queryFn: () => get<{ users: UserWalletRow[] }>(`/admin/wallet-manager${search ? `?search=${encodeURIComponent(search)}` : ""}`),
    staleTime: 30_000,
  });

  const masterQ = useQuery<MasterWallet[]>({
    queryKey: ["admin-master-wallets"],
    queryFn: () => get<MasterWallet[]>("/admin/master-wallets").catch(() => []),
  });

  const userDetailQ = useQuery<UserDetail>({
    queryKey: ["admin-wallet-user", selectedUserId],
    queryFn: () => get<UserDetail>(`/admin/wallet-manager/${selectedUserId}`),
    enabled: selectedUserId !== null,
  });

  const addMasterMutation = useMutation({
    mutationFn: (data: object) => post("/admin/master-wallets", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-master-wallets"] });
      setAddMasterOpen(false);
      const label = masterForm.label;
      const coin = masterForm.coin;
      const network = masterForm.network;
      setMasterForm({ coin: "", network: "BEP20", label: "", depositAddress: "", notes: "" });
      setSuccessData({
        kind: "generic", iconKind: "deposit", accentColor: "#10b981",
        title: "Master Wallet Added",
        subtitle: "New hot wallet registered successfully.",
        rows: [
          { label: "Coin", value: coin.toUpperCase() },
          { label: "Network", value: network },
          { label: "Label", value: label },
        ],
      });
    },
    onError: (e: any) => { toast.error(e?.message ?? "Failed to add wallet"); },
  });

  const deleteMasterMutation = useMutation({
    mutationFn: (id: number) => del(`/admin/master-wallets/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-master-wallets"] });
      setDeleteId(null);
      setSuccessData({
        kind: "generic", iconKind: "withdraw", accentColor: "#ef4444",
        title: "Master Wallet Removed",
        subtitle: "Hot wallet deleted from the system.",
        rows: [{ label: "Status", value: "Deleted", accent: "#ef4444" }],
      });
    },
    onError: () => { toast.error("Failed to delete wallet"); },
  });

  const users = usersQ.data?.users ?? [];
  const master = masterQ.data ?? [];

  const stats = useMemo(() => {
    const totalUsd = users.reduce((s, u) => s + (u.totalUsdValue || 0), 0);
    const activeUsers = users.filter(u => u.status === "active" || u.status === "verified").length;
    const assetsSet = new Set(users.flatMap(u => u.balances.map(b => b.asset)));
    return { totalUsd, activeUsers, assetTypes: assetsSet.size };
  }, [users]);

  const copyAddress = (addr: string) => {
    navigator.clipboard.writeText(addr).then(() => {
      setCopied(addr);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  const userDetail = userDetailQ.data;

  return (
    <div className="space-y-6 max-w-[1400px]">
      <PageHeader
        eyebrow="Treasury"
        title="Wallet Manager"
        description="User balance overview, per-asset breakdown, and master hot wallet configuration."
        actions={
          selectedUserId ? (
            <Button variant="outline" size="sm" onClick={() => setSelectedUserId(null)}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to list
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => qc.invalidateQueries({ queryKey: ["admin-wallet-users"] })}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          )
        }
      />

      {/* ─── Stats ─────────────────────────────────────────────────── */}
      {!selectedUserId && tab === "users" && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <PremiumStatCard
            hero
            title="Total User Value"
            value={stats.totalUsd.toLocaleString("en-US", { maximumFractionDigits: 0 }) + " USDT"}
            prefix=""
            icon={DollarSign}
            loading={usersQ.isLoading}
            hint="Combined portfolio across all users"
          />
          <PremiumStatCard
            title="Users Loaded"
            value={users.length}
            icon={Users}
            loading={usersQ.isLoading}
            hint="From current search/page"
          />
          <PremiumStatCard
            title="Active Users"
            value={stats.activeUsers}
            icon={Shield}
            loading={usersQ.isLoading}
            hint="Active / verified accounts"
          />
          <PremiumStatCard
            title="Asset Types"
            value={stats.assetTypes}
            icon={Coins}
            loading={usersQ.isLoading}
            hint="Unique assets in loaded set"
          />
        </div>
      )}

      {/* ─── User detail view ──────────────────────────────────────── */}
      {selectedUserId && (
        <div className="space-y-4">
          {userDetailQ.isLoading ? (
            <div className="h-64 rounded-xl bg-muted/30 animate-pulse" />
          ) : userDetail ? (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <PremiumStatCard
                  hero
                  title="Total Portfolio"
                  value={fmtUsd(userDetail.totalUsdValue)}
                  prefix=""
                  icon={Wallet}
                  hint={`User #${userDetail.user?.id}`}
                />
                <PremiumStatCard
                  title="Assets"
                  value={userDetail.balances?.filter(b => b.total > 0).length ?? 0}
                  icon={Coins}
                  hint="Non-zero holdings"
                />
                <PremiumStatCard
                  title="Account"
                  value={userDetail.user?.username ?? "—"}
                  icon={Users}
                  hint={userDetail.user?.email}
                />
                <PremiumStatCard
                  title="Status"
                  value={userDetail.user?.status ?? "—"}
                  icon={Shield}
                  hint="Account verification status"
                />
              </div>

              <SectionCard title="Asset Breakdown" icon={Coins} description="All holdings sorted by USD value" padded={false}>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/30 border-b border-border/60">
                      <tr className="text-xs uppercase tracking-wide text-muted-foreground text-left">
                        <th className="px-4 py-3 font-medium">Asset</th>
                        <th className="px-4 py-3 font-medium text-right">Free</th>
                        <th className="px-4 py-3 font-medium text-right">Locked</th>
                        <th className="px-4 py-3 font-medium text-right">Total</th>
                        <th className="px-4 py-3 font-medium text-right">USD Value</th>
                        <th className="px-4 py-3 font-medium text-right">Allocation</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(userDetail.balances ?? [])
                        .filter(b => (b.total || b.free + b.locked) > 0)
                        .sort((a, b) => b.usdValue - a.usdValue)
                        .map(b => {
                          const total = b.total ?? (b.free + b.locked);
                          const pct = userDetail.totalUsdValue > 0 ? (b.usdValue / userDetail.totalUsdValue) * 100 : 0;
                          return (
                            <tr key={b.asset} className="border-b border-border/40 hover:bg-muted/10 transition-colors">
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <div className="w-7 h-7 rounded-full bg-amber-500/20 flex items-center justify-center text-[10px] font-bold text-amber-400 shrink-0">
                                    {b.asset.slice(0, 3)}
                                  </div>
                                  <span className="font-mono font-bold">{b.asset}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3 font-mono tabular-nums text-right text-emerald-400">{b.free.toFixed(6)}</td>
                              <td className="px-4 py-3 font-mono tabular-nums text-right text-muted-foreground">{b.locked.toFixed(6)}</td>
                              <td className="px-4 py-3 font-mono tabular-nums text-right">{total.toFixed(6)}</td>
                              <td className="px-4 py-3 font-mono tabular-nums text-right text-amber-400 font-semibold">{fmtUsd(b.usdValue)}</td>
                              <td className="px-4 py-3">
                                <div className="flex items-center justify-end gap-2">
                                  <div className="w-20 h-1.5 bg-muted/40 rounded-full overflow-hidden">
                                    <div className="h-full bg-amber-500 rounded-full" style={{ width: `${Math.min(100, pct)}%` }} />
                                  </div>
                                  <span className="text-xs text-muted-foreground tabular-nums w-10 text-right">{pct.toFixed(1)}%</span>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </SectionCard>
            </>
          ) : (
            <EmptyState icon={Wallet} title="User not found" description="Could not load wallet details for this user." />
          )}
        </div>
      )}

      {/* ─── Main tabs ─────────────────────────────────────────────── */}
      {!selectedUserId && (
        <>
          <Tabs value={tab} onValueChange={v => setTab(v as any)}>
            <TabsList>
              <TabsTrigger value="users">
                <Users className="w-4 h-4 mr-1.5" />
                User Wallets
              </TabsTrigger>
              <TabsTrigger value="master">
                <Building2 className="w-4 h-4 mr-1.5" />
                Master Wallets {master.length > 0 && <Badge className="ml-1.5 h-4 min-w-4 px-1 text-[10px]">{master.length}</Badge>}
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* ─── User Wallets tab ──────────────────────────────────── */}
          {tab === "users" && (
            <SectionCard title="User Portfolios" icon={Wallet} padded={false} description="Search and inspect any user's wallet balances">
              <div className="p-4 border-b border-border/60">
                <form
                  onSubmit={e => { e.preventDefault(); setSearch(searchInput); }}
                  className="flex gap-2"
                >
                  <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <Input
                      value={searchInput}
                      onChange={e => setSearchInput(e.target.value)}
                      placeholder="Search email or username…"
                      className="pl-9"
                    />
                  </div>
                  <Button type="submit" size="sm" disabled={usersQ.isFetching}>
                    {usersQ.isFetching ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    Search
                  </Button>
                  {search && (
                    <Button type="button" variant="outline" size="sm" onClick={() => { setSearch(""); setSearchInput(""); }}>
                      Clear
                    </Button>
                  )}
                </form>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 border-b border-border/60">
                    <tr className="text-xs uppercase tracking-wide text-muted-foreground text-left">
                      <th className="px-4 py-3 font-medium">User</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium text-right">Assets</th>
                      <th className="px-4 py-3 font-medium text-right">Total USD</th>
                      <th className="px-4 py-3 font-medium text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usersQ.isLoading ? (
                      Array.from({ length: 6 }).map((_, i) => (
                        <tr key={i} className="border-b border-border/40">
                          {Array.from({ length: 5 }).map((_, j) => (
                            <td key={j} className="px-4 py-4">
                              <div className="h-4 bg-muted/30 rounded animate-pulse" />
                            </td>
                          ))}
                        </tr>
                      ))
                    ) : users.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-0">
                          <EmptyState
                            icon={Users}
                            title="No users found"
                            description={search ? `No results for "${search}"` : "No users loaded yet."}
                          />
                        </td>
                      </tr>
                    ) : (
                      users.map(u => (
                        <tr key={u.id} className="border-b border-border/40 hover:bg-muted/10 transition-colors group">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-full bg-amber-500/15 flex items-center justify-center text-xs font-bold text-amber-300 shrink-0">
                                {(u.username || u.email).slice(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <div className="font-medium text-foreground">{u.username}</div>
                                <div className="text-[11px] text-muted-foreground">{u.email}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <StatusPill status={u.status} />
                          </td>
                          <td className="px-4 py-3 text-right text-muted-foreground font-mono">
                            {u.balances.length}
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-bold text-amber-400">
                            {fmtUsd(u.totalUsdValue)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-2.5 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={() => setSelectedUserId(u.id)}
                            >
                              <Eye className="w-3.5 h-3.5 mr-1" />
                              View
                              <ChevronRight className="w-3 h-3 ml-0.5" />
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          )}

          {/* ─── Master Wallets tab ────────────────────────────────── */}
          {tab === "master" && (
            <SectionCard
              title="Master Hot Wallets"
              icon={Building2}
              description="Exchange treasury and deposit collection addresses"
              padded={false}
              actions={
                <Button size="sm" onClick={() => setAddMasterOpen(true)}>
                  <Plus className="w-4 h-4 mr-1.5" />
                  Add Wallet
                </Button>
              }
            >
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 border-b border-border/60">
                    <tr className="text-xs uppercase tracking-wide text-muted-foreground text-left">
                      <th className="px-4 py-3 font-medium">Wallet</th>
                      <th className="px-4 py-3 font-medium">Address</th>
                      <th className="px-4 py-3 font-medium">Notes</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {masterQ.isLoading ? (
                      Array.from({ length: 3 }).map((_, i) => (
                        <tr key={i} className="border-b border-border/40">
                          {Array.from({ length: 5 }).map((_, j) => (
                            <td key={j} className="px-4 py-4">
                              <div className="h-4 bg-muted/30 rounded animate-pulse" />
                            </td>
                          ))}
                        </tr>
                      ))
                    ) : master.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-0">
                          <EmptyState
                            icon={Building2}
                            title="No master wallets"
                            description="Add a hot wallet address to receive exchange deposits."
                            action={<Button size="sm" onClick={() => setAddMasterOpen(true)}><Plus className="w-4 h-4 mr-1.5" />Add Wallet</Button>}
                          />
                        </td>
                      </tr>
                    ) : (
                      master.map(w => (
                        <tr key={w.id} className="border-b border-border/40 hover:bg-muted/10 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
                                <Network className="w-4 h-4 text-blue-400" />
                              </div>
                              <div>
                                <div className="font-mono font-bold text-amber-400">{w.coin}</div>
                                <div className="text-[11px] text-muted-foreground">{w.network} · {w.label}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {w.depositAddress ? (
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs text-muted-foreground">
                                  {w.depositAddress.slice(0, 10)}…{w.depositAddress.slice(-8)}
                                </span>
                                <button
                                  onClick={() => copyAddress(w.depositAddress!)}
                                  className="text-muted-foreground hover:text-foreground transition-colors"
                                  title="Copy address"
                                >
                                  {copied === w.depositAddress
                                    ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                    : <Copy className="w-3.5 h-3.5" />}
                                </button>
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-xs">Not set</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{w.notes ?? "—"}</td>
                          <td className="px-4 py-3">
                            <StatusPill variant={w.isActive ? "success" : "info"} dot>
                              {w.isActive ? "Active" : "Inactive"}
                            </StatusPill>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-rose-400 border-rose-500/30 hover:bg-rose-500/10"
                              onClick={() => setDeleteId(w.id)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          )}
        </>
      )}

      {/* ─── Add master wallet dialog ──────────────────────────────── */}
      <Dialog open={addMasterOpen} onOpenChange={v => !v && setAddMasterOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Master Wallet</DialogTitle>
            <DialogDescription>Configure a hot wallet address for receiving exchange deposits.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Coin Symbol</Label>
                <Input
                  value={masterForm.coin}
                  onChange={e => setMasterForm(f => ({ ...f, coin: e.target.value.toUpperCase() }))}
                  placeholder="USDT"
                  className="mt-1 font-mono uppercase"
                  required
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Network</Label>
                <select
                  value={masterForm.network}
                  onChange={e => setMasterForm(f => ({ ...f, network: e.target.value }))}
                  className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {NETWORKS.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Label</Label>
              <Input
                value={masterForm.label}
                onChange={e => setMasterForm(f => ({ ...f, label: e.target.value }))}
                placeholder="Hot Wallet #1"
                className="mt-1"
                required
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Deposit Address</Label>
              <Input
                value={masterForm.depositAddress}
                onChange={e => setMasterForm(f => ({ ...f, depositAddress: e.target.value }))}
                placeholder="0x… or bc1…"
                className="mt-1 font-mono text-xs"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Notes (optional)</Label>
              <Input
                value={masterForm.notes}
                onChange={e => setMasterForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="e.g. Primary USDT collection"
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddMasterOpen(false)} disabled={addMasterMutation.isPending}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!masterForm.coin || !masterForm.label) { toast.error("Coin and label are required"); return; }
                addMasterMutation.mutate(masterForm);
              }}
              disabled={addMasterMutation.isPending}
            >
              {addMasterMutation.isPending ? "Adding…" : "Add Wallet"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Delete confirm dialog ─────────────────────────────────── */}
      <AlertDialog open={deleteId !== null} onOpenChange={v => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete master wallet?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the wallet configuration. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId !== null && deleteMasterMutation.mutate(deleteId)}
              disabled={deleteMasterMutation.isPending}
              className="bg-rose-500 hover:bg-rose-600 text-white"
            >
              {deleteMasterMutation.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <SuccessModal open={successData !== null} payload={successData} onClose={() => setSuccessData(null)} />
    </div>
  );
}
