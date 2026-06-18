import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { get } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/premium/PageHeader";
import { PremiumStatCard } from "@/components/premium/PremiumStatCard";
import { SectionCard } from "@/components/premium/SectionCard";
import { StatusPill } from "@/components/premium/StatusPill";
import { EmptyState } from "@/components/premium/EmptyState";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Users, Coins as CoinsIcon, ArrowLeftRight, ShieldCheck, ArrowDownToLine,
  ArrowUpFromLine, Landmark, ListChecks, TrendingUp, Activity, Wallet,
  Bitcoin, Banknote, CheckCircle2, AlertCircle, ServerCog, Database,
  KeyRound, Inbox, ArrowUpRight, Sparkles, Gauge, RefreshCw,
  BarChart2, UserPlus, Clock,
} from "lucide-react";

type Stats = {
  users: number; coins: number; pairs: number;
  pendingKyc: number; pendingDeposits: number; pendingWithdrawals: number;
  pendingBanks: number; openOrders: number;
  pendingCryptoDeposits: number; pendingCryptoWithdrawals: number;
  openFuturesPositions: number; futures24hVolume: number;
};

type VolumePoint = { date: string; label: string; spotVolume: number; tradeCount: number };
type GrowthPoint = { date: string; label: string; signups: number };

type ActivityFeed = {
  trades: Array<{
    id: number; symbol: string; price: number; qty: number;
    side: string; created_at: string; user_email?: string;
  }>;
  orders: Array<{
    id: number; pair: string; side: string;
    type: string; price: number; qty: number; status: string;
    created_at: string; user_email?: string;
  }>;
};

type RecentUser = {
  id: number; uid?: string; email: string; name?: string | null;
  role: string; status: string; kycLevel?: number; createdAt?: string;
};

type RecentWithdrawal = {
  id: number; userId?: number; userEmail?: string;
  amount?: number | string; status: string;
  coin?: string; currency?: string; createdAt?: string;
};

function fmt(n: number, opts?: { compact?: boolean }): string {
  if (!Number.isFinite(n)) return "0";
  if (opts?.compact) {
    if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
    if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(1) + "K";
  }
  return n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function timeAgo(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso).getTime();
  if (!d) return "—";
  const diff = Date.now() - d;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
}

// Custom tooltip for recharts
function ChartTooltip({ active, payload, label, prefix = "" }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-xl text-xs">
      <p className="text-muted-foreground mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} className="font-semibold tabular-nums" style={{ color: p.color }}>
          {p.name}: {prefix}{typeof p.value === "number" ? fmt(p.value, { compact: true }) : p.value}
        </p>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();

  const { data, isLoading } = useQuery<Stats>({
    queryKey: ["/admin/stats"],
    queryFn: () => get<Stats>("/admin/stats"),
    refetchInterval: 15000,
  });

  const futuresEngine = useQuery({
    queryKey: ["/admin/futures-engine/status"],
    queryFn: () => get<any>("/admin/futures-engine/status").catch(() => null),
    refetchInterval: 30000,
  });

  const sweeper = useQuery({
    queryKey: ["/admin/sweeper/status"],
    queryFn: () => get<any>("/admin/sweeper/status").catch(() => null),
    refetchInterval: 30000,
  });

  const vault = useQuery({
    queryKey: ["/admin/vault/status"],
    queryFn: () => get<any>("/admin/vault/status").catch(() => null),
    refetchInterval: 60000,
  });

  const volumeHistory = useQuery<VolumePoint[]>({
    queryKey: ["/admin/stats/volume-history"],
    queryFn: () => get<VolumePoint[]>("/admin/stats/volume-history"),
    refetchInterval: 60000,
  });

  const userGrowth = useQuery<GrowthPoint[]>({
    queryKey: ["/admin/stats/user-growth"],
    queryFn: () => get<GrowthPoint[]>("/admin/stats/user-growth"),
    refetchInterval: 60000,
  });

  const activityFeed = useQuery<ActivityFeed>({
    queryKey: ["/admin/stats/activity"],
    queryFn: () => get<ActivityFeed>("/admin/stats/activity"),
    refetchInterval: 20000,
  });

  const recentUsers = useQuery<RecentUser[]>({
    queryKey: ["/admin/users", "recent"],
    queryFn: async () => {
      const r = await get<RecentUser[] | { rows?: RecentUser[] }>("/admin/users").catch(() => []);
      const arr = Array.isArray(r) ? r : (r as { rows?: RecentUser[] })?.rows ?? [];
      return arr.slice(0, 5);
    },
    refetchInterval: 30000,
  });

  const recentInrW = useQuery<RecentWithdrawal[]>({
    queryKey: ["/admin/inr-withdrawals", "recent"],
    queryFn: async () => {
      const r = await get<RecentWithdrawal[] | { rows?: RecentWithdrawal[] }>(
        "/admin/inr-withdrawals?status=pending"
      ).catch(() => []);
      const arr = Array.isArray(r) ? r : (r as { rows?: RecentWithdrawal[] })?.rows ?? [];
      return arr.slice(0, 5);
    },
    refetchInterval: 30000,
  });

  const s = data || {
    users: 0, coins: 0, pairs: 0, pendingKyc: 0, pendingDeposits: 0, pendingWithdrawals: 0,
    pendingBanks: 0, openOrders: 0, pendingCryptoDeposits: 0, pendingCryptoWithdrawals: 0,
    openFuturesPositions: 0, futures24hVolume: 0,
  };

  const totalPending =
    s.pendingKyc + s.pendingDeposits + s.pendingWithdrawals + s.pendingBanks +
    s.pendingCryptoDeposits + s.pendingCryptoWithdrawals;

  const sysHealthy =
    (futuresEngine.data?.running ?? true) &&
    (sweeper.data?.running ?? true) &&
    (vault.data?.passwordSet ?? false);

  const greet = (() => {
    const h = new Date().getHours();
    if (h < 5) return "Working late";
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    if (h < 21) return "Good evening";
    return "Good night";
  })();

  const today = new Date().toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  // Derived chart stats
  const volData = volumeHistory.data ?? [];
  const growthData = userGrowth.data ?? [];
  const totalVol7d = volData.reduce((s, p) => s + p.spotVolume, 0);
  const totalTrades7d = volData.reduce((s, p) => s + p.tradeCount, 0);
  const totalSignups30d = growthData.reduce((s, p) => s + p.signups, 0);

  // Latest 14 days for user growth chart
  const growthLast14 = growthData.slice(-14);

  // Combined activity events (trades + orders) sorted by time
  const activityItems = [
    ...(activityFeed.data?.trades ?? []).map((t) => ({
      id: `t-${t.id}`, type: "trade" as const,
      label: `${t.side?.toUpperCase()} ${t.symbol}`,
      sub: `${fmt(t.qty, { compact: true })} @ ${fmt(t.price, { compact: true })}`,
      user: t.user_email ?? "—",
      ts: t.created_at,
      positive: t.side === "buy",
    })),
    ...(activityFeed.data?.orders ?? []).map((o) => ({
      id: `o-${o.id}`, type: "order" as const,
      label: `${o.side?.toUpperCase()} ${o.pair ?? "—"}`,
      sub: `${o.type} · ${fmt(o.qty ?? 0, { compact: true })} · ${o.status}`,
      user: o.user_email ?? "—",
      ts: o.created_at,
      positive: o.side === "buy",
    })),
  ].sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime()).slice(0, 10);

  return (
    <div className="space-y-6 max-w-[1400px]">
      <PageHeader
        eyebrow="Console · Overview"
        title={`${greet}, ${user?.name || (user?.email || "Admin").split("@")[0]}`}
        description={today + " · Pending tasks and live platform numbers"}
        actions={
          <StatusPill
            variant={sysHealthy ? "success" : "warning"}
            dot
          >
            {sysHealthy ? "All systems operational" : "Attention required"}
          </StatusPill>
        }
      />

      {/* Hero KPI row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <PremiumStatCard
          title="Total Users"
          value={s.users}
          icon={Users}
          hero
          loading={isLoading}
          hint="Registered accounts"
        />
        <PremiumStatCard
          title="24h Futures Volume"
          value={fmt(s.futures24hVolume, { compact: true })}
          prefix="USDT "
          icon={TrendingUp}
          hero
          loading={isLoading}
          hint="USDT-margined"
        />
        <PremiumStatCard
          title="Open Positions"
          value={s.openFuturesPositions}
          icon={Activity}
          hero
          loading={isLoading}
          hint="Futures · live"
        />
        <PremiumStatCard
          title="Pending Approvals"
          value={totalPending}
          icon={Inbox}
          hero
          loading={isLoading}
          hint="Across all queues"
        />
      </div>

      {/* ── Charts row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 7-day Spot Volume */}
        <SectionCard
          title="7-Day Spot Volume"
          description={`${fmt(totalTrades7d, { compact: true })} trades · ${fmt(totalVol7d, { compact: true })} USDT total`}
          icon={BarChart2}
          actions={
            volumeHistory.isFetching
              ? <RefreshCw className="w-3 h-3 text-muted-foreground animate-spin" />
              : <span className="text-[10px] text-muted-foreground">auto-refresh 1min</span>
          }
        >
          {volumeHistory.isLoading ? (
            <div className="h-44 flex items-center justify-center text-muted-foreground text-sm">Loading chart…</div>
          ) : volData.length === 0 ? (
            <div className="h-44 flex items-center justify-center text-muted-foreground text-xs">
              No trade data in the last 7 days
            </div>
          ) : (
            <div className="h-44 -mx-1">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={volData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="volGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(222 16% 18%)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(220 9% 46%)" }} axisLine={false} tickLine={false} interval={0} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(220 9% 46%)" }} axisLine={false} tickLine={false} tickFormatter={(v) => fmt(v, { compact: true })} />
                  <Tooltip content={<ChartTooltip prefix="USDT " />} />
                  <Area
                    type="monotone"
                    dataKey="spotVolume"
                    name="Volume"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    fill="url(#volGrad)"
                    dot={false}
                    activeDot={{ r: 4, fill: "#f59e0b", strokeWidth: 0 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </SectionCard>

        {/* 14-day User Growth */}
        <SectionCard
          title="User Growth (14 Days)"
          description={`${fmt(totalSignups30d, { compact: true })} new users in 30 days`}
          icon={UserPlus}
          actions={
            userGrowth.isFetching
              ? <RefreshCw className="w-3 h-3 text-muted-foreground animate-spin" />
              : <span className="text-[10px] text-muted-foreground">auto-refresh 1min</span>
          }
        >
          {userGrowth.isLoading ? (
            <div className="h-44 flex items-center justify-center text-muted-foreground text-sm">Loading chart…</div>
          ) : growthLast14.length === 0 ? (
            <div className="h-44 flex items-center justify-center text-muted-foreground text-xs">
              No signup data yet
            </div>
          ) : (
            <div className="h-44 -mx-1">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={growthLast14} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(222 16% 18%)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(220 9% 46%)" }} axisLine={false} tickLine={false} interval={1} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(220 9% 46%)" }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="signups" name="Signups" fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={24} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </SectionCard>
      </div>

      {/* Pending approvals breakdown */}
      <SectionCard
        title="Pending Approvals"
        description="Quick access to queues that need attention"
        icon={Sparkles}
        actions={
          <span className="text-xs text-muted-foreground tabular-nums">
            {totalPending} item{totalPending === 1 ? "" : "s"}
          </span>
        }
      >
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <ApprovalCard href="/kyc" label="KYC Reviews" count={s.pendingKyc} icon={ShieldCheck} />
          <ApprovalCard href="/banks" label="Bank Verifications" count={s.pendingBanks} icon={Landmark} />
          <ApprovalCard href="/inr-deposits" label="INR Deposits" count={s.pendingDeposits} icon={ArrowDownToLine} />
          <ApprovalCard href="/inr-withdrawals" label="INR Withdrawals" count={s.pendingWithdrawals} icon={ArrowUpFromLine} />
          <ApprovalCard href="/crypto-deposits" label="Crypto Deposits" count={s.pendingCryptoDeposits} icon={Bitcoin} />
          <ApprovalCard href="/crypto-withdrawals" label="Crypto Withdrawals" count={s.pendingCryptoWithdrawals} icon={Banknote} />
        </div>
      </SectionCard>

      {/* System health */}
      <SectionCard
        title="System Health"
        description="Engines, treasury vault and matching status"
        icon={Gauge}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <HealthRow
            icon={ServerCog}
            label="Futures Engine"
            healthy={!!futuresEngine.data?.running}
            valueLabel={futuresEngine.data?.running ? "Running" : "Stopped"}
            href="/funding-rates"
            loading={futuresEngine.isLoading}
          />
          <HealthRow
            icon={Database}
            label="Deposit Sweeper"
            healthy={!!sweeper.data?.running}
            valueLabel={sweeper.data?.running ? "Running" : "Idle"}
            href="/user-addresses"
            loading={sweeper.isLoading}
          />
          <HealthRow
            icon={KeyRound}
            label="HD Vault"
            healthy={!!vault.data?.passwordSet && !!vault.data?.mnemonicConfigured}
            valueLabel={
              vault.data?.passwordSet
                ? vault.data?.mnemonicConfigured ? "Configured" : "Mnemonic missing"
                : "Password not set"
            }
            href="/user-addresses"
            loading={vault.isLoading}
          />
          <HealthRow
            icon={Activity}
            label="API Server"
            healthy={!isLoading && !!data}
            valueLabel={!isLoading && !!data ? "Healthy · live data" : "Reconnecting…"}
            href="/backend-status"
            loading={isLoading && !data}
          />
        </div>
      </SectionCard>

      {/* Platform stats */}
      <div>
        <div className="flex items-center justify-between mb-3 px-1">
          <h2 className="text-sm font-semibold text-foreground tracking-wide">Platform Overview</h2>
          <span className="text-[11px] text-muted-foreground">Live · auto-refresh 15s</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          <PremiumStatCard title="Listed Coins" value={s.coins} icon={CoinsIcon} loading={isLoading} />
          <PremiumStatCard title="Trading Pairs" value={s.pairs} icon={ArrowLeftRight} loading={isLoading} />
          <PremiumStatCard title="Open Spot Orders" value={s.openOrders} icon={ListChecks} loading={isLoading} />
          <PremiumStatCard title="Crypto Pending" value={s.pendingCryptoDeposits + s.pendingCryptoWithdrawals} icon={Wallet} loading={isLoading} />
        </div>
      </div>

      {/* Activity Feed + Recent Users + Withdrawals */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Live Activity Feed */}
        <SectionCard
          title="Live Activity"
          description="Recent trades & orders"
          icon={Clock}
          padded={false}
          actions={
            activityFeed.isFetching
              ? <RefreshCw className="w-3 h-3 text-muted-foreground animate-spin" />
              : <span className="text-[10px] text-muted-foreground">refresh 20s</span>
          }
        >
          {activityFeed.isLoading ? (
            <div className="p-6 text-center text-muted-foreground text-sm">Loading…</div>
          ) : activityItems.length === 0 ? (
            <EmptyState icon={Activity} title="No recent activity" description="Trades & orders will appear here." />
          ) : (
            <ul className="divide-y divide-border/60">
              {activityItems.map((item) => (
                <li key={item.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div
                    className={`w-7 h-7 rounded flex items-center justify-center shrink-0 text-[10px] font-bold ${
                      item.positive
                        ? "bg-emerald-500/10 border border-emerald-500/25 text-emerald-400"
                        : "bg-rose-500/10 border border-rose-500/25 text-rose-400"
                    }`}
                  >
                    {item.type === "trade" ? "T" : "O"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-semibold truncate">{item.label}</div>
                    <div className="text-[10px] text-muted-foreground truncate">{item.sub}</div>
                  </div>
                  <div className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                    {timeAgo(item.ts)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        {/* Recent Users */}
        <SectionCard
          title="Recent Users"
          description="Latest signups"
          icon={Users}
          actions={
            <Link href="/users">
              <a className="text-xs text-amber-300 hover:underline inline-flex items-center gap-0.5">
                View all <ArrowUpRight className="w-3 h-3" />
              </a>
            </Link>
          }
          padded={false}
        >
          {recentUsers.isLoading ? (
            <div className="p-6 text-center text-muted-foreground text-sm">Loading…</div>
          ) : !recentUsers.data || recentUsers.data.length === 0 ? (
            <EmptyState icon={Users} title="No users yet" description="New signups will appear here." />
          ) : (
            <ul className="divide-y divide-border/60">
              {recentUsers.data.map((u) => (
                <li key={u.id} className="flex items-center gap-3 px-4 md:px-5 py-3">
                  <div className="w-9 h-9 rounded-full gold-bg-soft border border-amber-500/25 flex items-center justify-center text-xs font-semibold text-amber-300 shrink-0">
                    {(u.name || u.email).slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{u.name || u.email}</div>
                    <div className="text-[11px] text-muted-foreground truncate font-mono">
                      {u.uid || u.email}
                    </div>
                  </div>
                  <div className="hidden sm:flex items-center gap-2">
                    <StatusPill status={u.status} />
                    <span className="text-[10px] text-muted-foreground tabular-nums w-14 text-right">
                      {timeAgo(u.createdAt)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        {/* Pending INR Withdrawals */}
        <SectionCard
          title="Pending Withdrawals"
          description="INR · waiting for processing"
          icon={ArrowUpFromLine}
          actions={
            <Link href="/inr-withdrawals">
              <a className="text-xs text-amber-300 hover:underline inline-flex items-center gap-0.5">
                View all <ArrowUpRight className="w-3 h-3" />
              </a>
            </Link>
          }
          padded={false}
        >
          {recentInrW.isLoading ? (
            <div className="p-6 text-center text-muted-foreground text-sm">Loading…</div>
          ) : !recentInrW.data || recentInrW.data.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="All caught up"
              description="No pending INR withdrawals right now."
            />
          ) : (
            <ul className="divide-y divide-border/60">
              {recentInrW.data.map((w) => (
                <li key={w.id} className="flex items-center gap-3 px-4 md:px-5 py-3">
                  <div className="w-9 h-9 rounded-full bg-amber-500/12 border border-amber-500/25 flex items-center justify-center shrink-0">
                    <ArrowUpFromLine className="w-4 h-4 text-amber-300" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {w.userEmail || `User #${w.userId ?? "?"}`}
                    </div>
                    <div className="text-[11px] text-muted-foreground tabular-nums">
                      ₹{fmt(Number(w.amount || 0))}
                    </div>
                  </div>
                  <div className="hidden sm:flex items-center gap-2">
                    <StatusPill status={w.status} />
                    <span className="text-[10px] text-muted-foreground tabular-nums w-14 text-right">
                      {timeAgo(w.createdAt)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

function ApprovalCard({
  href, label, count, icon: Icon,
}: {
  href: string; label: string; count: number;
  icon: typeof ShieldCheck;
}) {
  const hot = count > 0;
  return (
    <Link href={href}>
      <a
        className={`group relative rounded-lg p-3 border transition-all hover-elevate flex flex-col gap-1.5 ${
          hot
            ? "border-amber-500/30 bg-amber-500/[0.04]"
            : "border-border bg-[hsl(222_16%_11%)]"
        }`}
      >
        <div className="flex items-center justify-between">
          <Icon className={`w-4 h-4 ${hot ? "text-amber-300" : "text-muted-foreground"}`} />
          {hot && (
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.7)] animate-pulse" />
          )}
        </div>
        <div className="text-[11px] text-muted-foreground">{label}</div>
        <div
          className={`text-xl font-bold tabular-nums leading-none ${
            hot ? "gold-text" : "text-foreground"
          }`}
        >
          {count}
        </div>
      </a>
    </Link>
  );
}

function HealthRow({
  icon: Icon,
  label,
  healthy,
  valueLabel,
  href,
  loading,
}: {
  icon: typeof ServerCog;
  label: string;
  healthy: boolean;
  valueLabel: string;
  href: string;
  loading?: boolean;
}) {
  return (
    <Link href={href}>
      <a className="flex items-center gap-3 p-3 rounded-lg border border-border bg-[hsl(222_16%_11%)] hover-elevate transition-all">
        <div
          className={`w-9 h-9 rounded-md flex items-center justify-center shrink-0 ${
            healthy
              ? "bg-emerald-500/12 border border-emerald-500/30"
              : "bg-amber-500/12 border border-amber-500/30"
          }`}
        >
          <Icon className={`w-4 h-4 ${healthy ? "text-emerald-300" : "text-amber-300"}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[11px] text-muted-foreground">{label}</div>
          <div className="text-sm font-semibold truncate">
            {loading ? <span className="inline-block h-4 w-16 bg-muted/50 rounded animate-pulse" /> : valueLabel}
          </div>
        </div>
        <StatusPill variant={healthy ? "success" : "warning"} dot={false}>
          {healthy ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
        </StatusPill>
      </a>
    </Link>
  );
}
