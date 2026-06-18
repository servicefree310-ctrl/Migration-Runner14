import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, patch, post } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { PaginationBar, type PageSizeOption } from "@/components/premium/PaginationBar";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CoinSelect } from "@/components/ui/coin-select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/lib/auth";
import { useState, useEffect, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Search, ShieldCheck, ShieldAlert, Eye, Wallet, ShieldOff, LogOut,
  TrendingUp, TrendingDown, MailCheck, Mail, Phone, PhoneCall,
  Users as UsersIcon, BadgeCheck, Sparkles, Activity, Crown,
  CheckCircle2, XCircle, Filter, RefreshCw, Loader2, Copy, Lock, Unlock,
} from "lucide-react";
import { PageHeader } from "@/components/premium/PageHeader";
import { PremiumStatCard } from "@/components/premium/PremiumStatCard";
import { StatusPill } from "@/components/premium/StatusPill";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Coin = { id: number; symbol: string; name: string; type: string; status: string };

type User = {
  id: number; email: string; name: string; phone: string | null;
  role: string; status: string; kycLevel: number; vipTier: number;
  uid: string; referralCode: string; createdAt: string; twoFaEnabled: boolean;
  emailVerified?: boolean; phoneVerified?: boolean; lastLoginAt?: string | null;
};

type FuturesPos = {
  id: number; pairId: number; symbol: string | null; side: string; leverage: number;
  qty: string; entryPrice: string; markPrice: string; marginAmount: string;
  unrealizedPnl: string; liquidationPrice: string; status: string; openedAt: string;
};

type LoginLog = {
  id: number; ip: string | null; userAgent: string | null;
  success: string; reason: string | null; createdAt: string;
};

type Dossier = {
  user: User;
  security: {
    twoFaEnabled: boolean; activeSessions: number; lastSessionAt: string | null;
    emailVerified: boolean; phoneVerified: boolean; lastLoginAt: string | null;
  };
  stats: {
    orders: { total: number; filled: number; open: number };
    inrDepositCount: number; cryptoDepositCount: number; walletCount: number;
  };
  kyc: any[]; wallets: any[]; sessions: any[];
  inrDeposits: any[]; cryptoDeposits: any[]; inrWithdrawals: any[]; cryptoWithdrawals: any[];
  futuresPositions: FuturesPos[]; loginLogs: LoginLog[];
};

const ROLES = ["user", "support", "finance", "compliance", "marketing", "admin", "superadmin"];
const STATUSES = ["active", "suspended", "banned"];

function relTime(iso?: string | null): string {
  if (!iso) return "Never";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "—";
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

function initials(name: string, email: string): string {
  const src = (name || email || "?").trim();
  const parts = src.split(/[\s@.]+/).filter(Boolean);
  return (parts[0]?.[0] ?? "?").toUpperCase() + (parts[1]?.[0] ?? "").toUpperCase();
}

export default function UsersPage() {
  const { user: me } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [view, setView] = useState<number | null>(null);
  const [fundUser, setFundUser] = useState<User | null>(null);
  const [filterRole, setFilterRole] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterKyc, setFilterKyc] = useState<string>("all");
  const [filterVerify, setFilterVerify] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSizeOption>(20);
  const isAdmin = me?.role === "admin" || me?.role === "superadmin";

  const { data = [], isLoading, refetch, isFetching } = useQuery<User[]>({
    queryKey: ["/admin/users-search", search],
    queryFn: () => get<User[]>(`/admin/users-search?q=${encodeURIComponent(search)}&limit=200`),
  });

  const filtered = useMemo(() => {
    return data.filter((u) => {
      if (filterRole !== "all" && u.role !== filterRole) return false;
      if (filterStatus !== "all" && u.status !== filterStatus) return false;
      if (filterKyc !== "all" && String(u.kycLevel) !== filterKyc) return false;
      if (filterVerify === "email" && !u.emailVerified) return false;
      if (filterVerify === "phone" && !u.phoneVerified) return false;
      if (filterVerify === "both" && (!u.emailVerified || !u.phoneVerified)) return false;
      if (filterVerify === "none" && (u.emailVerified || u.phoneVerified)) return false;
      return true;
    });
  }, [data, filterRole, filterStatus, filterKyc, filterVerify]);

  // Reset to page 1 whenever filters or page size change
  useEffect(() => { setPage(1); }, [search, filterRole, filterStatus, filterKyc, filterVerify, pageSize]);

  const paged = useMemo(
    () => filtered.slice((page - 1) * pageSize, page * pageSize),
    [filtered, page, pageSize],
  );

  const stats = useMemo(() => {
    const total = data.length;
    const verifiedEmail = data.filter((u) => u.emailVerified).length;
    const verifiedPhone = data.filter((u) => u.phoneVerified).length;
    const kyc3 = data.filter((u) => u.kycLevel >= 3).length;
    const twoFa = data.filter((u) => u.twoFaEnabled).length;
    const restricted = data.filter((u) => u.status !== "active").length;
    const vip = data.filter((u) => u.vipTier > 0).length;
    return { total, verifiedEmail, verifiedPhone, kyc3, twoFa, restricted, vip };
  }, [data]);

  const update = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<User> }) => patch(`/admin/users/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/admin/users-search"] }),
  });

  const dossier = useQuery<Dossier>({
    queryKey: ["/admin/users", view, "full"],
    queryFn: () => get<Dossier>(`/admin/users/${view}/full`),
    enabled: view !== null,
  });

  const verify = useMutation({
    mutationFn: (vars: { id: number; channel: "email" | "phone"; value: boolean }) =>
      post(`/admin/users/${vars.id}/verify`, { channel: vars.channel, value: vars.value }),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["/admin/users", view, "full"] });
      qc.invalidateQueries({ queryKey: ["/admin/users-search"] });
      const ch = vars.channel === "email" ? "Email" : "Phone";
      toast({ title: `${ch} ${vars.value ? "verified" : "unverified"}`, description: `${ch} verification ${vars.value ? "granted" : "revoked"}.` });
    },
  });

  const disable2fa = useMutation({
    mutationFn: (id: number) => post<{ ok: boolean }>(`/admin/users/${id}/disable-2fa`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/admin/users", view, "full"] });
      qc.invalidateQueries({ queryKey: ["/admin/users-search"] });
      toast({ title: "2FA disabled", description: "User's two-factor authentication has been removed." });
    },
  });
  const freeze = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      post<{ ok: boolean; status: string; sessionsRevoked: number }>(`/admin/users/${id}/freeze`, { reason }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/admin/users", view, "full"] });
      qc.invalidateQueries({ queryKey: ["/admin/users-search"] });
      toast({ title: "Account frozen", description: `${data.sessionsRevoked} session(s) revoked. User is now locked out.` });
    },
  });
  const unfreeze = useMutation({
    mutationFn: (id: number) => post<{ ok: boolean; status: string }>(`/admin/users/${id}/unfreeze`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/admin/users", view, "full"] });
      qc.invalidateQueries({ queryKey: ["/admin/users-search"] });
      toast({ title: "Account unfrozen", description: "User can now log in and trade normally." });
    },
  });
  const forceLogout = useMutation({
    mutationFn: (id: number) => post<{ ok: boolean; revoked: number }>(`/admin/users/${id}/force-logout`, {}),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/admin/users", view, "full"] });
      toast({ title: "Sessions revoked", description: `${data.revoked} active session(s) terminated.` });
    },
  });

  const activeFilters =
    Number(filterRole !== "all") + Number(filterStatus !== "all") +
    Number(filterKyc !== "all") + Number(filterVerify !== "all");

  return (
    <TooltipProvider delayDuration={200}>
      <div>
        <PageHeader
          eyebrow="User Management"
          title="Users"
          description={`Search, verify, and manage ${stats.total.toLocaleString("en-IN")} platform accounts. View full dossiers, control verification, security, and balances.`}
          actions={
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              data-testid="button-refresh-users"
            >
              {isFetching ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
              Refresh
            </Button>
          }
        />

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
          <PremiumStatCard title="Total Users" value={stats.total} icon={UsersIcon} hero accent />
          <PremiumStatCard title="Email Verified" value={stats.verifiedEmail} icon={MailCheck}
            hint={stats.total ? `${Math.round(stats.verifiedEmail * 100 / stats.total)}% of base` : ""} />
          <PremiumStatCard title="Phone Verified" value={stats.verifiedPhone} icon={PhoneCall}
            hint={stats.total ? `${Math.round(stats.verifiedPhone * 100 / stats.total)}% of base` : ""} />
          <PremiumStatCard title="KYC L3+" value={stats.kyc3} icon={BadgeCheck} hint="Advanced verified" />
          <PremiumStatCard title="2FA Enabled" value={stats.twoFa} icon={ShieldCheck}
            hint={stats.total ? `${Math.round(stats.twoFa * 100 / stats.total)}% secured` : ""} />
          <PremiumStatCard title="VIP Members" value={stats.vip} icon={Crown} hint={`${stats.restricted} restricted`} />
        </div>

        <Card className="premium-card p-3 mb-4">
          <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center">
            <div className="relative flex-1 min-w-0">
              <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
              <Input
                placeholder="Search by email, UID, phone, name, referral code…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 bg-background/60"
                data-testid="input-search-users"
              />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="hidden md:flex items-center text-xs text-muted-foreground gap-1 mr-1">
                <Filter className="w-3.5 h-3.5" /> Filters {activeFilters > 0 && <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{activeFilters}</Badge>}
              </div>
              <Select value={filterRole} onValueChange={setFilterRole}>
                <SelectTrigger className="h-9 w-[120px]" data-testid="select-filter-role"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All roles</SelectItem>
                  {ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="h-9 w-[130px]" data-testid="select-filter-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All status</SelectItem>
                  {STATUSES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterKyc} onValueChange={setFilterKyc}>
                <SelectTrigger className="h-9 w-[110px]" data-testid="select-filter-kyc"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All KYC</SelectItem>
                  {[0, 1, 2, 3].map((l) => <SelectItem key={l} value={String(l)}>Level {l}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterVerify} onValueChange={setFilterVerify}>
                <SelectTrigger className="h-9 w-[150px]" data-testid="select-filter-verify"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any verification</SelectItem>
                  <SelectItem value="email">Email verified</SelectItem>
                  <SelectItem value="phone">Phone verified</SelectItem>
                  <SelectItem value="both">Both verified</SelectItem>
                  <SelectItem value="none">Unverified</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="text-xs text-muted-foreground tabular-nums shrink-0 lg:ml-2">
              {filtered.length} of {data.length}
            </div>
          </div>
        </Card>

        <Card className="premium-card overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-border/50">
                  <TableHead className="text-[11px] uppercase tracking-wider">Account</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider">Verification</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider">KYC / VIP</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider">Security</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider">Role</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider">Status</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider">Last Seen</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider">Joined</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-10">
                      <Loader2 className="w-4 h-4 inline mr-2 animate-spin" /> Loading users…
                    </TableCell>
                  </TableRow>
                )}
                {paged.map((u) => (
                  <TableRow
                    key={u.id}
                    className="cursor-pointer hover:bg-amber-500/5 border-border/40"
                    onClick={() => setView(u.id)}
                    data-testid={`row-user-${u.id}`}
                  >
                    <TableCell className="py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar className="w-9 h-9 shrink-0 border border-amber-500/20">
                          <AvatarFallback className="text-[11px] font-semibold bg-gradient-to-br from-amber-500/20 to-amber-700/10 text-amber-200">
                            {initials(u.name, u.email)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 font-medium truncate">
                            {u.email}
                            {u.role !== "user" && (
                              <Badge className="h-4 px-1 text-[9px] uppercase gold-bg-soft text-amber-300 border-0 shrink-0">{u.role}</Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-muted-foreground tabular-nums">
                            <span className="font-mono truncate max-w-[120px]">{u.uid}</span>
                            {u.name && <><span>·</span><span className="truncate">{u.name}</span></>}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <VerifyChip
                          verified={!!u.emailVerified}
                          icon={Mail}
                          label="Email"
                          testid={`pill-email-verified-${u.id}`}
                        />
                        <VerifyChip
                          verified={!!u.phoneVerified}
                          icon={Phone}
                          label={u.phone ? "Phone" : "No phone"}
                          muted={!u.phone}
                          testid={`pill-phone-verified-${u.id}`}
                        />
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className={`text-[10px] ${u.kycLevel >= 3 ? "gold-bg-soft text-amber-300 border-amber-500/30" : ""}`}>
                          KYC L{u.kycLevel}
                        </Badge>
                        {u.vipTier > 0 && (
                          <Badge className="text-[10px] gold-bg-soft text-amber-300 border-0">
                            <Crown className="w-2.5 h-2.5 mr-0.5" />V{u.vipTier}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {u.twoFaEnabled
                        ? <Tooltip><TooltipTrigger><span className="inline-flex items-center gap-1 text-xs text-emerald-400"><ShieldCheck className="w-3.5 h-3.5" />2FA</span></TooltipTrigger><TooltipContent>Two-factor authentication enabled</TooltipContent></Tooltip>
                        : <Tooltip><TooltipTrigger><span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><ShieldAlert className="w-3.5 h-3.5" />No 2FA</span></TooltipTrigger><TooltipContent>2FA is not enabled</TooltipContent></Tooltip>}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {isAdmin ? (
                        <Select
                          value={u.role}
                          onValueChange={(v) => update.mutate({ id: u.id, body: { role: v } })}
                          disabled={update.isPending && update.variables?.id === u.id}
                        >
                          <SelectTrigger className="h-7 w-28 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                        </Select>
                      ) : <Badge variant="outline" className="text-xs">{u.role}</Badge>}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {isAdmin ? (
                        <Select
                          value={u.status}
                          onValueChange={(v) => update.mutate({ id: u.id, body: { status: v } })}
                          disabled={update.isPending && update.variables?.id === u.id}
                        >
                          <SelectTrigger className="h-7 w-28 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>{STATUSES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                        </Select>
                      ) : <StatusPill status={u.status} />}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground tabular-nums">
                      {relTime(u.lastLoginAt)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground tabular-nums">
                      {new Date(u.createdAt).toLocaleDateString("en-IN")}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()} className="text-right">
                      <div className="inline-flex gap-0.5">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setView(u.id)} data-testid={`button-view-${u.id}`}>
                              <Eye className="w-3.5 h-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>View dossier</TooltipContent>
                        </Tooltip>
                        {isAdmin && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-amber-300" onClick={() => setFundUser(u)} data-testid={`button-fund-${u.id}`}>
                                <Wallet className="w-3.5 h-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Fund wallet</TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {!isLoading && filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-12">
                      <div className="text-sm text-muted-foreground">
                        <UsersIcon className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        No users match your filters
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <PaginationBar
            page={page}
            pageSize={pageSize}
            total={filtered.length}
            onPage={setPage}
            onPageSize={setPageSize}
            label="users"
          />
        </Card>

        <UserDossierSheet
          open={view !== null}
          onClose={() => setView(null)}
          dossier={dossier.data}
          loading={dossier.isLoading}
          isAdmin={isAdmin}
          onVerify={(channel, value) => view && verify.mutate({ id: view, channel, value })}
          verifyPending={verify.isPending}
          onDisable2fa={() => view && disable2fa.mutate(view)}
          onForceLogout={() => view && forceLogout.mutate(view)}
          onFreeze={(reason) => view && freeze.mutate({ id: view, reason })}
          onUnfreeze={() => view && unfreeze.mutate(view)}
          freezePending={freeze.isPending}
          unfreezePending={unfreeze.isPending}
          isSelf={me?.id === view}
          onFund={() => dossier.data && setFundUser(dossier.data.user)}
          disable2faPending={disable2fa.isPending}
          forceLogoutPending={forceLogout.isPending}

        />

        <FundDialog
          user={fundUser}
          onClose={() => setFundUser(null)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ["/admin/users", fundUser?.id, "full"] });
            qc.invalidateQueries({ queryKey: ["/admin/users-search"] });
          }}
        />
      </div>
    </TooltipProvider>
  );
}

function VerifyChip({
  verified, icon: Icon, label, muted, testid,
}: {
  verified: boolean; icon: any; label: string; muted?: boolean; testid?: string;
}) {
  if (muted) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground/70" data-testid={testid}>
        <Icon className="w-3 h-3" /> {label}
      </span>
    );
  }
  return verified ? (
    <span
      className="inline-flex items-center gap-1 text-[11px] text-emerald-400"
      data-testid={testid}
      data-verified="true"
      aria-label={`${label} verified`}
      title={`${label} verified`}
    >
      <Icon className="w-3 h-3" aria-hidden="true" />
      <span>{label}</span>
      <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
    </span>
  ) : (
    <span
      className="inline-flex items-center gap-1 text-[11px] text-amber-400/80"
      data-testid={testid}
      data-verified="false"
      aria-label={`${label} not verified`}
      title={`${label} not verified`}
    >
      <Icon className="w-3 h-3" aria-hidden="true" />
      <span>{label}</span>
      <XCircle className="w-3 h-3" aria-hidden="true" />
    </span>
  );
}

function UserDossierSheet({
  open, onClose, dossier, loading, isAdmin,
  onVerify, verifyPending,
  onDisable2fa, onForceLogout, onFund,
  disable2faPending, forceLogoutPending,
  onFreeze, onUnfreeze, freezePending, unfreezePending, isSelf,
}: {
  open: boolean; onClose: () => void; dossier: Dossier | undefined; loading: boolean;
  isAdmin: boolean;
  onVerify: (channel: "email" | "phone", value: boolean) => void;
  verifyPending: boolean;
  onDisable2fa: () => void; onForceLogout: () => void; onFund: () => void;
  disable2faPending: boolean; forceLogoutPending: boolean;
  onFreeze: (reason: string) => void; onUnfreeze: () => void;
  freezePending: boolean; unfreezePending: boolean; isSelf: boolean;
}) {
  const u = dossier?.user;
  const sec = dossier?.security;
  // AlertDialog state — replaces native window.confirm() prompts so destructive
  // actions get a properly-themed, screen-reader-accessible confirmation.
  const [confirm2fa, setConfirm2fa] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [confirmFreeze, setConfirmFreeze] = useState(false);
  const [freezeReason, setFreezeReason] = useState("");
  const isFrozen = u?.status === "suspended";

  const copy = (text: string) => {
    try { navigator.clipboard?.writeText(text); } catch {}
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-2xl p-0 overflow-y-auto" data-testid="sheet-user-dossier">
        <SheetTitle className="sr-only">User Dossier</SheetTitle>
        {loading && (
          <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
            <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Loading dossier…
          </div>
        )}
        {!loading && dossier && u && sec && (
          <div>
            <div className="border-b border-border/50 bg-gradient-to-br from-amber-500/[0.06] via-transparent to-transparent p-5">
              <div className="flex items-start gap-4">
                <Avatar className="w-14 h-14 border border-amber-500/30">
                  <AvatarFallback className="text-base font-semibold bg-gradient-to-br from-amber-500/30 to-amber-700/10 text-amber-200">
                    {initials(u.name, u.email)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-lg font-bold truncate" data-testid="text-dossier-email">{u.email}</h2>
                    {u.emailVerified && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
                    <button type="button" onClick={() => copy(u.uid)} className="font-mono inline-flex items-center gap-1 hover:text-amber-300" title="Copy UID">
                      {u.uid} <Copy className="w-3 h-3 opacity-60" />
                    </button>
                    {u.name && <><span>·</span><span>{u.name}</span></>}
                    {u.phone && <><span>·</span><span>{u.phone}</span></>}
                  </div>
                  <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                    <StatusPill status={u.status} />
                    <Badge variant="outline" className="text-[10px] uppercase">{u.role}</Badge>
                    <Badge variant="outline" className={`text-[10px] ${u.kycLevel >= 3 ? "gold-bg-soft text-amber-300 border-amber-500/30" : ""}`}>
                      KYC L{u.kycLevel}
                    </Badge>
                    {u.vipTier > 0 && (
                      <Badge className="text-[10px] gold-bg-soft text-amber-300 border-0">
                        <Crown className="w-2.5 h-2.5 mr-0.5" />VIP {u.vipTier}
                      </Badge>
                    )}
                    {sec.twoFaEnabled && (
                      <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-500/30">
                        <ShieldCheck className="w-2.5 h-2.5 mr-0.5" />2FA
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              {isAdmin && (
                <div className="flex flex-wrap gap-1.5 mt-4 pt-4 border-t border-border/40">
                  <Button
                    size="sm"
                    variant={sec.emailVerified ? "outline" : "default"}
                    className={sec.emailVerified ? "" : "bg-emerald-500/90 hover:bg-emerald-500 text-white"}
                    onClick={() => onVerify("email", !sec.emailVerified)}
                    disabled={verifyPending}
                    data-testid="button-toggle-email-verified"
                  >
                    {verifyPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <MailCheck className="w-3 h-3 mr-1" />}
                    {sec.emailVerified ? "Unverify Email" : "Mark Email Verified"}
                  </Button>
                  <Button
                    size="sm"
                    variant={sec.phoneVerified ? "outline" : "default"}
                    className={sec.phoneVerified ? "" : "bg-emerald-500/90 hover:bg-emerald-500 text-white"}
                    onClick={() => onVerify("phone", !sec.phoneVerified)}
                    disabled={verifyPending || !u.phone}
                    data-testid="button-toggle-phone-verified"
                  >
                    {verifyPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <PhoneCall className="w-3 h-3 mr-1" />}
                    {sec.phoneVerified ? "Unverify Phone" : "Mark Phone Verified"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={onFund} data-testid="button-open-fund">
                    <Wallet className="w-3 h-3 mr-1" /> Fund
                  </Button>
                  <Button
                    size="sm" variant="outline"
                    disabled={!sec.twoFaEnabled || disable2faPending}
                    onClick={() => setConfirm2fa(true)}
                    data-testid="button-disable-2fa"
                  >
                    <ShieldOff className="w-3 h-3 mr-1" />
                    {disable2faPending ? "Disabling…" : "Reset 2FA"}
                  </Button>
                  <Button
                    size="sm" variant="outline"
                    disabled={sec.activeSessions === 0 || forceLogoutPending}
                    onClick={() => setConfirmRevoke(true)}
                    data-testid="button-force-logout"
                  >
                    <LogOut className="w-3 h-3 mr-1" />
                    {forceLogoutPending ? "Revoking…" : "Force Logout"}
                  </Button>
                  {/* One-click freeze / unfreeze. Backend refuses to freeze
                      yourself (would lock you out of your own session), so we
                      grey out the button when viewing your own dossier. */}
                  {isFrozen ? (
                    <Button
                      size="sm" variant="outline"
                      className="border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/15"
                      disabled={unfreezePending}
                      onClick={() => onUnfreeze()}
                      data-testid="button-unfreeze-account"
                    >
                      <Unlock className="w-3 h-3 mr-1" />
                      {unfreezePending ? "Unfreezing…" : "Unfreeze Account"}
                    </Button>
                  ) : (
                    <Button
                      size="sm" variant="outline"
                      className="border-red-500/40 text-red-300 hover:bg-red-500/15"
                      disabled={freezePending || isSelf}
                      title={isSelf ? "Cannot freeze your own account" : undefined}
                      onClick={() => { setFreezeReason(""); setConfirmFreeze(true); }}
                      data-testid="button-freeze-account"
                    >
                      <Lock className="w-3 h-3 mr-1" />
                      {freezePending ? "Freezing…" : "Freeze Account"}
                    </Button>
                  )}
                </div>
              )}
            </div>

            <div className="p-5">
              <Tabs defaultValue="overview" className="w-full">
                <TabsList className="grid w-full grid-cols-5 h-9">
                  <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
                  <TabsTrigger value="kyc" className="text-xs">KYC</TabsTrigger>
                  <TabsTrigger value="wallets" className="text-xs">Wallets</TabsTrigger>
                  <TabsTrigger value="activity" className="text-xs">Activity</TabsTrigger>
                  <TabsTrigger value="trading" className="text-xs">Trading</TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="mt-4 space-y-3">
                  <Card className="p-3">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Verification Status</div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex items-center gap-2.5 p-2.5 rounded-lg bg-background/40 border border-border/40">
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${sec.emailVerified ? "bg-emerald-500/15" : "bg-amber-500/15"}`}>
                          <Mail className={`w-4 h-4 ${sec.emailVerified ? "text-emerald-400" : "text-amber-400"}`} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-medium">Email</div>
                          <div className={`text-[11px] ${sec.emailVerified ? "text-emerald-400" : "text-amber-400"}`}>
                            {sec.emailVerified ? "Verified" : "Not verified"}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2.5 p-2.5 rounded-lg bg-background/40 border border-border/40">
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${sec.phoneVerified ? "bg-emerald-500/15" : u.phone ? "bg-amber-500/15" : "bg-muted/30"}`}>
                          <Phone className={`w-4 h-4 ${sec.phoneVerified ? "text-emerald-400" : u.phone ? "text-amber-400" : "text-muted-foreground"}`} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-medium">Phone</div>
                          <div className={`text-[11px] ${sec.phoneVerified ? "text-emerald-400" : u.phone ? "text-amber-400" : "text-muted-foreground"}`}>
                            {!u.phone ? "No phone on file" : sec.phoneVerified ? "Verified" : "Not verified"}
                          </div>
                        </div>
                      </div>
                    </div>
                  </Card>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <MiniStat label="Active Sessions" value={sec.activeSessions} icon={Activity} />
                    <MiniStat label="Total Orders" value={dossier.stats.orders.total} icon={TrendingUp} />
                    <MiniStat label="Open Orders" value={dossier.stats.orders.open} icon={Sparkles} />
                    <MiniStat label="Wallets" value={dossier.stats.walletCount} icon={Wallet} />
                  </div>

                  <Card className="p-3">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Profile</div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                      <Field label="Email" value={u.email} />
                      <Field label="Phone" value={u.phone || "—"} />
                      <Field label="Name" value={u.name || "—"} />
                      <Field label="UID" mono value={u.uid} />
                      <Field label="Referral Code" mono value={u.referralCode} />
                      <Field label="Last Login" value={relTime(sec.lastLoginAt)} />
                      <Field label="Last Session" value={relTime(sec.lastSessionAt)} />
                      <Field label="Joined" value={new Date(u.createdAt).toLocaleString("en-IN")} />
                    </div>
                  </Card>
                </TabsContent>

                <TabsContent value="kyc" className="mt-4 space-y-2">
                  {dossier.kyc.length === 0 ? <Empty /> : (
                    <Card className="p-3 space-y-1.5">
                      {dossier.kyc.map((k: any) => (
                        <div key={k.id} className="border-b last:border-0 border-border/40 py-1.5 grid grid-cols-4 gap-2 text-xs items-center">
                          <Badge variant="outline" className="text-[10px] w-fit">L{k.level}</Badge>
                          <StatusPill status={k.status} />
                          <span className="font-mono truncate text-[11px]">{k.fullName || k.panNumber || k.aadhaarNumber || "—"}</span>
                          <span className="text-muted-foreground text-[11px] tabular-nums">{relTime(k.createdAt)}</span>
                        </div>
                      ))}
                    </Card>
                  )}
                </TabsContent>

                <TabsContent value="wallets" className="mt-4 space-y-2">
                  {dossier.wallets.length === 0 ? <Empty /> : (
                    <Card className="p-3 space-y-1">
                      {dossier.wallets.map((w: any) => (
                        <div key={w.id} className="border-b last:border-0 border-border/40 py-1.5 grid grid-cols-4 gap-2 text-xs items-center">
                          <Badge variant="outline" className="text-[10px] w-fit">{w.walletType}</Badge>
                          <span>Coin #{w.coinId}</span>
                          <span className="tabular-nums">{w.balance}</span>
                          <span className="text-muted-foreground tabular-nums">locked: {w.locked}</span>
                        </div>
                      ))}
                    </Card>
                  )}
                </TabsContent>

                <TabsContent value="activity" className="mt-4 space-y-3">
                  <Section title={`Recent Logins (${dossier.loginLogs?.length ?? 0})`}>
                    {!dossier.loginLogs || dossier.loginLogs.length === 0 ? <Empty /> : (
                      <div className="space-y-1">
                        {dossier.loginLogs.map((l) => (
                          <div key={l.id} className="border-b last:border-0 border-border/40 py-1.5 grid grid-cols-4 gap-2 text-[11px] items-center">
                            <span className={l.success === "true" ? "text-emerald-400" : "text-red-400"}>
                              {l.success === "true" ? "✓ Success" : `✕ ${l.reason || "Failed"}`}
                            </span>
                            <span className="font-mono truncate">{l.ip || "—"}</span>
                            <span className="truncate text-muted-foreground">{(l.userAgent || "").slice(0, 28) || "—"}</span>
                            <span className="text-muted-foreground tabular-nums text-right">{relTime(l.createdAt)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </Section>
                  <Section title={`Sessions (${dossier.sessions.length})`}>
                    {dossier.sessions.length === 0 ? <Empty /> : dossier.sessions.map((s: any) => (
                      <div key={s.id} className="border-b last:border-0 border-border/40 py-1.5 grid grid-cols-3 gap-2 text-[11px]">
                        <span className="font-mono">{s.ip || "—"}</span>
                        <span className="truncate text-muted-foreground">{(s.userAgent || "—").slice(0, 32)}</span>
                        <span className="text-muted-foreground tabular-nums text-right">{relTime(s.createdAt)}</span>
                      </div>
                    ))}
                  </Section>
                </TabsContent>

                <TabsContent value="trading" className="mt-4 space-y-3">
                  <Section title={`Open Futures (${dossier.futuresPositions?.length ?? 0})`}>
                    {!dossier.futuresPositions || dossier.futuresPositions.length === 0 ? <Empty /> : (
                      <div className="space-y-1">
                        {dossier.futuresPositions.map((p) => {
                          const pnl = Number(p.unrealizedPnl);
                          return (
                            <div key={p.id} className="border-b last:border-0 border-border/40 py-1.5 grid grid-cols-6 gap-2 text-[11px] items-center">
                              <span className="font-bold">{p.symbol ?? `#${p.pairId}`}</span>
                              <span>
                                {p.side === "long"
                                  ? <Badge className="bg-emerald-500/20 text-emerald-400 text-[9px]"><TrendingUp className="w-2.5 h-2.5 mr-0.5" />long</Badge>
                                  : <Badge className="bg-red-500/20 text-red-400 text-[9px]"><TrendingDown className="w-2.5 h-2.5 mr-0.5" />short</Badge>}
                              </span>
                              <span>{p.leverage}x</span>
                              <span className="tabular-nums">qty {Number(p.qty).toLocaleString("en-IN", { maximumFractionDigits: 4 })}</span>
                              <span className="tabular-nums text-muted-foreground">@ {Number(p.entryPrice).toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span>
                              <span className={`tabular-nums font-semibold text-right ${pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                                {pnl >= 0 ? "+" : ""}{pnl.toFixed(2)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </Section>
                  <div className="grid grid-cols-2 gap-3">
                    <Section title={`INR Deposits (${dossier.inrDeposits.length})`}>
                      {dossier.inrDeposits.length === 0 ? <Empty /> : dossier.inrDeposits.slice(0, 6).map((d: any) => (
                        <div key={d.id} className="border-b last:border-0 border-border/40 py-1 grid grid-cols-3 gap-2 text-[11px]">
                          <span className="tabular-nums">₹{d.amount}</span><StatusPill status={d.status} dot={false} /><span className="text-muted-foreground tabular-nums text-right">{relTime(d.createdAt)}</span>
                        </div>
                      ))}
                    </Section>
                    <Section title={`Crypto Deposits (${dossier.cryptoDeposits.length})`}>
                      {dossier.cryptoDeposits.length === 0 ? <Empty /> : dossier.cryptoDeposits.slice(0, 6).map((d: any) => (
                        <div key={d.id} className="border-b last:border-0 border-border/40 py-1 grid grid-cols-3 gap-2 text-[11px]">
                          <span className="tabular-nums">{d.amount}</span><StatusPill status={d.status} dot={false} /><span className="text-muted-foreground tabular-nums text-right">{relTime(d.createdAt)}</span>
                        </div>
                      ))}
                    </Section>
                    <Section title={`INR Withdrawals (${dossier.inrWithdrawals.length})`}>
                      {dossier.inrWithdrawals.length === 0 ? <Empty /> : dossier.inrWithdrawals.slice(0, 6).map((d: any) => (
                        <div key={d.id} className="border-b last:border-0 border-border/40 py-1 grid grid-cols-3 gap-2 text-[11px]">
                          <span className="tabular-nums">₹{d.amount}</span><StatusPill status={d.status} dot={false} /><span className="text-muted-foreground tabular-nums text-right">{relTime(d.createdAt)}</span>
                        </div>
                      ))}
                    </Section>
                    <Section title={`Crypto Withdrawals (${dossier.cryptoWithdrawals.length})`}>
                      {dossier.cryptoWithdrawals.length === 0 ? <Empty /> : dossier.cryptoWithdrawals.slice(0, 6).map((d: any) => (
                        <div key={d.id} className="border-b last:border-0 border-border/40 py-1 grid grid-cols-3 gap-2 text-[11px]">
                          <span className="tabular-nums">{d.amount}</span><StatusPill status={d.status} dot={false} /><span className="text-muted-foreground tabular-nums text-right">{relTime(d.createdAt)}</span>
                        </div>
                      ))}
                    </Section>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </div>
        )}
      </SheetContent>

      {/* Destructive action confirms — rendered outside SheetContent so they
          stack above the sheet (Radix portals each Dialog independently). */}
      <AlertDialog open={confirm2fa} onOpenChange={setConfirm2fa}>
        <AlertDialogContent data-testid="dialog-confirm-disable-2fa">
          <AlertDialogHeader>
            <AlertDialogTitle>Disable 2FA?</AlertDialogTitle>
            <AlertDialogDescription>
              This will turn off 2-factor authentication for{" "}
              <span className="font-mono text-amber-300">{u?.email}</span>. The
              user will be able to sign in with just a password until they
              re-enable it. Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-disable-2fa">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-500/90 hover:bg-red-500 text-white"
              onClick={() => onDisable2fa()}
              data-testid="button-confirm-disable-2fa"
            >
              Disable 2FA
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmFreeze} onOpenChange={setConfirmFreeze}>
        <AlertDialogContent data-testid="dialog-confirm-freeze">
          <AlertDialogHeader>
            <AlertDialogTitle>Freeze this account?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <div>
                  This will set <span className="font-mono text-amber-300">{u?.email}</span> to{" "}
                  <span className="font-semibold text-red-400">suspended</span> status, sign them
                  out of all <span className="font-semibold">{sec?.activeSessions ?? 0}</span> active
                  sessions, and block any further API access until you unfreeze. The user keeps
                  their balance and history. Action is logged in the audit trail.
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Reason (optional, audit log)</Label>
                  <Input
                    placeholder="e.g. KYC mismatch, fraud review, user request"
                    value={freezeReason}
                    onChange={(e) => setFreezeReason(e.target.value)}
                    maxLength={500}
                    data-testid="input-freeze-reason"
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-freeze" disabled={freezePending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-500/90 hover:bg-red-500 text-white"
              disabled={freezePending}
              onClick={(e) => {
                e.preventDefault();
                onFreeze(freezeReason.trim());
                setConfirmFreeze(false);
              }}
              data-testid="button-confirm-freeze"
            >
              {freezePending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Lock className="w-3 h-3 mr-1" />}
              Freeze account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmRevoke} onOpenChange={setConfirmRevoke}>
        <AlertDialogContent data-testid="dialog-confirm-force-logout">
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke all sessions?</AlertDialogTitle>
            <AlertDialogDescription>
              This will sign{" "}
              <span className="font-mono text-amber-300">{u?.email}</span> out
              of all <span className="font-semibold">{sec?.activeSessions ?? 0}</span>{" "}
              active session{sec?.activeSessions === 1 ? "" : "s"} on every
              device. Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-force-logout">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-500/90 hover:bg-red-500 text-white"
              onClick={() => onForceLogout()}
              data-testid="button-confirm-force-logout"
            >
              Force logout
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
}

function MiniStat({ label, value, icon: Icon }: { label: string; value: number; icon: any }) {
  return (
    <div className="rounded-lg border border-border/40 bg-background/40 p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        <Icon className="w-3 h-3" />{label}
      </div>
      <div className="text-lg font-bold tabular-nums mt-0.5">{value.toLocaleString("en-IN")}</div>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`truncate ${mono ? "font-mono text-[11px]" : ""}`}>{value}</div>
    </div>
  );
}

function FundDialog({ user, onClose, onSuccess }: { user: User | null; onClose: () => void; onSuccess: () => void }) {
  const [coinId, setCoinId] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [walletType, setWalletType] = useState<"spot" | "inr">("spot");
  const [note, setNote] = useState<string>("");
  const [error, setError] = useState<string>("");

  const { data: coins = [] } = useQuery<Coin[]>({
    queryKey: ["/admin/coins"],
    queryFn: () => get<Coin[]>("/admin/coins"),
    enabled: user !== null,
  });

  const fund = useMutation({
    mutationFn: () => post(`/admin/users/${user!.id}/fund`, {
      coinId: Number(coinId), amount: Number(amount), walletType, note: note || undefined,
    }),
    onSuccess: () => { onSuccess(); reset(); onClose(); },
    onError: (e: any) => setError(e?.message || "Failed to fund wallet"),
  });

  const reset = () => { setCoinId(""); setAmount(""); setWalletType("spot"); setNote(""); setError(""); };

  const selectedCoin = coins.find((c) => String(c.id) === coinId);
  useEffect(() => {
    if (selectedCoin) setWalletType(selectedCoin.symbol === "INR" ? "inr" : "spot");
  }, [selectedCoin?.id]);

  const valid = coinId && Number(amount) > 0;

  return (
    <Dialog open={user !== null} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Fund User Wallet</DialogTitle></DialogHeader>
        {user && (
          <div className="space-y-3 text-sm">
            <Card className="p-3 text-xs">
              <div><span className="text-muted-foreground">User:</span> <span className="font-medium">{user.email}</span></div>
              <div><span className="text-muted-foreground">UID:</span> <span className="font-mono">{user.uid}</span></div>
            </Card>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Coin</label>
              <CoinSelect
                coins={coins}
                value={coinId}
                onValueChange={setCoinId}
                placeholder="Select coin"
                activeOnly
                data-testid="select-fund-coin"
              />
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Wallet Type</label>
              <Select value={walletType} onValueChange={(v) => setWalletType(v as "spot" | "inr")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="spot">Spot</SelectItem>
                  <SelectItem value="inr">INR</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Amount</label>
              <Input type="number" step="0.00000001" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Note (optional)</label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason / reference" />
            </div>

            {error && <div className="text-xs text-destructive">{error}</div>}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onClose(); }}>Cancel</Button>
          <Button disabled={!valid || fund.isPending} onClick={() => { setError(""); fund.mutate(); }}>
            {fund.isPending ? "Crediting…" : "Credit Wallet"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="p-3">
      <div className="font-semibold text-[10px] uppercase tracking-wider text-muted-foreground mb-2">{title}</div>
      {children}
    </Card>
  );
}
function Empty() { return <div className="text-xs text-muted-foreground italic py-2">No records</div>; }
