import { useState, useEffect } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  User as UserIcon, Shield, Wallet as WalletIcon, Building2, Settings as SettingsIcon,
  Coins, Copy, Check, Pencil, Mail, Phone, Hash, BadgeCheck, Sparkles, ArrowRight,
  TrendingUp, Activity, ExternalLink, Save, X, Award, Gift, AlertCircle, Loader2,
  Crown, ArrowLeftRight, Percent,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { get, put, patch } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { SuccessModal, type GenericSuccess } from "@/components/SuccessModal";

type ProfileResp = {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  avatar?: string | null;
  twoFactor?: { enabled: boolean; type?: string };
  kyc?: { status?: string; level?: number } | null;
  // bicrypto-style passthrough
  metadata?: Record<string, unknown>;
};

type WalletItem = { type: string; currency: string; balance: number; inOrder: number; usdValue?: number };
type WalletResp = { items: WalletItem[]; totals: { usd: number; inr: number }; inrRate: number };
type ReferStats = { referralCode: string; referredCount: number; referredKycCount: number; estimatedEarnings: number; recent: Array<{ id: number; name: string; kycLevel: number; createdAt: string }> };

const KYC_BENEFITS = [
  { level: 0, label: "Unverified", color: "bg-zinc-500/20 text-foreground/80", desc: "Browse markets only" },
  { level: 1, label: "Basic", color: "bg-sky-500/20 text-sky-400", desc: "Deposit & trade up to ₹1L/day" },
  { level: 2, label: "Intermediate", color: "bg-amber-500/20 text-amber-400", desc: "Withdraw, advanced earn up to ₹10L/day" },
  { level: 3, label: "Advanced", color: "bg-emerald-500/20 text-emerald-400", desc: "Full limits + futures + margin" },
];

function fmtUsd(n: number) {
  if (!Number.isFinite(n) || n === 0) return "0.00 USDT";
  if (Math.abs(n) >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 0 }) + " USDT";
  return n.toFixed(2) + " USDT";
}

export default function Profile() {
  const { user: authUser } = useAuth();
  const qc = useQueryClient();

  const profileQ = useQuery<ProfileResp>({
    queryKey: ["/user/profile"],
    queryFn: () => get<ProfileResp>("/user/profile"),
  });

  const walletQ = useQuery<WalletResp>({
    queryKey: ["/finance/wallet?perPage=200"],
    queryFn: () => get("/finance/wallet?perPage=200"),
  });

  const referQ = useQuery<ReferStats>({
    queryKey: ["/refer/stats"],
    queryFn: () => get<ReferStats>("/refer/stats"),
    retry: false,
  });

  type FeesMy = {
    volume30dUsdt: number;
    totalFeesUsdt: number;
    currentTier: { level: number; name: string; minVolume: number; spotMaker: number; spotTaker: number; futuresMaker: number; futuresTaker: number; convertFee: number; withdrawDiscount: number };
    nextTier: FeesMy["currentTier"] | null;
  };
  const feesQ = useQuery<FeesMy>({
    queryKey: ["/fees/my"],
    queryFn: () => get<FeesMy>("/fees/my"),
    retry: false,
  });

  const securityQ = useQuery<{
    twoFaEnabled: boolean;
    activeSessions: number;
    loginEmailOtpEnabled?: boolean;
    loginPhoneOtpEnabled?: boolean;
    emailVerified?: boolean;
    phoneVerified?: boolean;
    hasPhone?: boolean;
  }>({
    queryKey: ["/security/me"],
    queryFn: () => get("/security/me"),
    retry: false,
  });

  const profile = profileQ.data;
  const memberSince = (profileQ.data as any)?.createdAt ?? (profileQ.data as any)?.metadata?.createdAt ?? null;

  // Total equity in INR: use the server's pre-computed totals (covers all coins: USDT, USDC, BTC, ETH, etc.)
  const totalEquityInr = walletQ.data?.totals?.inr ?? 0;
  const inrRate = walletQ.data?.inrRate ?? 84;

  const kycLevel = (authUser?.kycLevel ?? profile?.kyc?.level ?? 0) as number;
  const currentBenefit = KYC_BENEFITS.find((b) => b.level === kycLevel) ?? KYC_BENEFITS[0];
  const nextBenefit = KYC_BENEFITS.find((b) => b.level === kycLevel + 1);

  const fullName = [profile?.firstName, profile?.lastName].filter(Boolean).join(" ").trim() || authUser?.fullName || "Trader";
  const initial = (fullName || profile?.email || "U").charAt(0).toUpperCase();

  // Edit mode
  const [editing, setEditing] = useState(false);
  const [genericSuccess, setGenericSuccess] = useState<GenericSuccess | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  useEffect(() => {
    if (profile && !editing) {
      setFirstName(profile.firstName ?? "");
      setLastName(profile.lastName ?? "");
      setPhone(profile.phone ?? "");
    }
  }, [profile, editing]);

  const saveProfile = useMutation({
    mutationFn: () => put("/user/profile", { firstName, lastName, phone }),
    onSuccess: () => {
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["/user/profile"] });
      setGenericSuccess({ kind: "generic", iconKind: "paid", accentColor: "emerald", title: "Profile Updated!", subtitle: "Your profile information has been saved successfully.", rows: [{ label: "Name", value: [firstName, lastName].filter(Boolean).join(" ") || "—" }, { label: "Phone", value: phone || "—" }], primaryLabel: "Done" });
    },
    onError: (e: any) => toast.error(e?.data?.message || e.message || "Update failed"),
  });

  // Copy referral code
  const [copied, setCopied] = useState(false);
  const copyRef = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => toast.error("Copy failed — please copy manually"));
  };

  if (profileQ.isLoading) {
    return (
      <div className="container mx-auto max-w-5xl p-6 flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (profileQ.isError) {
    return (
      <div className="container mx-auto max-w-5xl p-6">
        <Card className="p-6 border-rose-500/30 bg-rose-500/5">
          <div className="flex items-center gap-3 text-rose-400">
            <AlertCircle className="h-5 w-5" />
            <span className="text-sm font-medium">Failed to load profile.</span>
            <Button size="sm" variant="outline" onClick={() => profileQ.refetch()}>Retry</Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-6xl p-4 sm:p-6 space-y-5">
      {/* ──────── Hero ──────── */}
      <Card className="overflow-hidden border-border/60 bg-gradient-to-br from-card via-card to-amber-500/5">
        <div className="p-5 sm:p-7 flex flex-col lg:flex-row lg:items-center gap-5 lg:gap-8">
          {/* Avatar */}
          <div className="relative flex-shrink-0 mx-auto lg:mx-0">
            <div className="h-24 w-24 sm:h-28 sm:w-28 rounded-full bg-gradient-to-br from-amber-400 via-amber-500 to-orange-600 flex items-center justify-center text-4xl font-extrabold text-black shadow-xl shadow-amber-500/30 ring-4 ring-card">
              {initial}
            </div>
            <span className="absolute -bottom-1 -right-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-semibold border border-emerald-500/30 ring-2 ring-card">
              <Activity className="h-2.5 w-2.5" /> Active
            </span>
          </div>

          {/* Identity */}
          <div className="flex-1 min-w-0 text-center lg:text-left">
            <div className="flex flex-wrap items-center justify-center lg:justify-start gap-2 mb-1">
              <h1 className="text-xl sm:text-2xl font-bold break-words leading-tight" data-testid="text-profile-name">{fullName}</h1>
              <Badge className={`${currentBenefit.color} border-transparent text-[10px] font-bold uppercase`} data-testid="badge-kyc-level">
                <BadgeCheck className="h-3 w-3 mr-0.5" /> KYC L{kycLevel} · {currentBenefit.label}
              </Badge>
              {(authUser?.role === "admin" || authUser?.role === "superadmin") && (
                <Badge className="bg-violet-500/20 text-violet-300 border-transparent text-[10px] font-bold uppercase">
                  <Shield className="h-3 w-3 mr-0.5" /> {authUser.role}
                </Badge>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-center lg:justify-start gap-3 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" /> {profile?.email}</span>
              {profile?.phone && <span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" /> {profile.phone}</span>}
              <span className="flex items-center gap-1.5"><Hash className="h-3.5 w-3.5" /> UID {profile?.id}</span>
              {memberSince && (
                <span className="flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5" /> Joined {new Date(String(memberSince)).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                </span>
              )}
            </div>
            {nextBenefit && (
              <p className="mt-2 text-xs text-muted-foreground">
                <span className="text-amber-400 font-medium">Next level:</span> {nextBenefit.label} — {nextBenefit.desc}
              </p>
            )}
          </div>

          {/* Quick actions */}
          <div className="flex-shrink-0 flex flex-wrap justify-center lg:flex-col gap-2 lg:items-stretch">
            {!editing ? (
              <Button onClick={() => setEditing(true)} variant="outline" data-testid="button-edit-profile">
                <Pencil className="h-4 w-4 mr-1.5" /> Edit Profile
              </Button>
            ) : (
              <Button onClick={() => setEditing(false)} variant="outline">
                <X className="h-4 w-4 mr-1.5" /> Cancel
              </Button>
            )}
            <Button asChild className="bg-gradient-to-r from-amber-500 to-orange-500 text-black hover:from-amber-400 hover:to-orange-400 font-semibold">
              <Link href="/kyc" data-testid="link-kyc"><Shield className="h-4 w-4 mr-1.5" /> Verify Identity</Link>
            </Button>
          </div>
        </div>

        {/* Edit form */}
        {editing && (
          <div className="border-t border-border/60 bg-muted/20 p-5 sm:p-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="firstName">First Name</Label>
              <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} data-testid="input-firstname" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lastName">Last Name</Label>
              <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} data-testid="input-lastname" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone</Label>
              <PhoneInput id="phone" value={phone} onChange={setPhone} data-testid="input-phone" />
            </div>
            <div className="sm:col-span-3 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
              <Button onClick={() => saveProfile.mutate()} disabled={saveProfile.isPending} data-testid="button-save-profile">
                {saveProfile.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
                Save Changes
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* ──────── Stats strip ──────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon={<WalletIcon className="h-4 w-4" />}
          label="Total Equity"
          value={totalEquityInr > 0 ? `₹${totalEquityInr.toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : walletQ.isLoading ? "…" : "₹0.00"}
          tone="amber"
          testId="stat-equity"
        />
        <StatCard
          icon={<Shield className="h-4 w-4" />}
          label="2FA Status"
          value={securityQ.data?.twoFaEnabled ? "Enabled" : "Off"}
          tone={securityQ.data?.twoFaEnabled ? "emerald" : "rose"}
          testId="stat-2fa"
        />
        <StatCard
          icon={<Activity className="h-4 w-4" />}
          label="Active Sessions"
          value={String(securityQ.data?.activeSessions ?? "—")}
          tone="sky"
          testId="stat-sessions"
        />
        <StatCard
          icon={<Award className="h-4 w-4" />}
          label="Referrals"
          value={String(referQ.data?.referredCount ?? 0)}
          sub={referQ.data ? `${referQ.data.referredKycCount} KYC` : undefined}
          tone="violet"
          testId="stat-referrals"
        />
      </div>

      {/* ──────── VIP Tier ──────── */}
      <VipTierCard fees={feesQ.data} loading={feesQ.isLoading} inrRate={inrRate} />

      {/* ──────── Login Preferences ──────── */}
      <LoginPrefsCard sec={securityQ.data} onSaved={() => securityQ.refetch()} />

      {/* ──────── Two-col layout: actions + referral ──────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Quick actions */}
        <div className="lg:col-span-2 space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider px-1">Account & Security</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <ActionCard href="/kyc" icon={<Shield className="h-5 w-5" />} title="KYC Verification" desc={`Currently L${kycLevel}. Complete L${(kycLevel + 1) > 3 ? 3 : kycLevel + 1} to unlock more.`} accent="emerald" testId="card-kyc" />
            <ActionCard href="/banks" icon={<Building2 className="h-5 w-5" />} title="Bank Accounts" desc="Add or manage bank accounts for INR withdrawals." accent="sky" testId="card-banks" />
            <ActionCard href="/settings" icon={<SettingsIcon className="h-5 w-5" />} title="Settings & 2FA" desc={securityQ.data?.twoFaEnabled ? "2FA enabled. Manage sessions, password & preferences." : "Enable 2FA, change password, manage sessions."} accent="amber" testId="card-settings" />
            <ActionCard href="/wallet" icon={<WalletIcon className="h-5 w-5" />} title="My Wallet" desc="Deposit, withdraw, transfer between SPOT, FUTURES, FIAT." accent="rose" testId="card-wallet" />
            <ActionCard href="/earn" icon={<Coins className="h-5 w-5" />} title="Earn" desc="Stake or earn passive yield on idle assets." accent="violet" testId="card-earn" />
            <ActionCard href="/orders" icon={<TrendingUp className="h-5 w-5" />} title="Orders & History" desc="View open orders, fills, and trade history." accent="cyan" testId="card-orders" />
          </div>
        </div>

        {/* Referral panel */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider px-1">Referrals</h2>
          <Card className="p-5 border-border/60 bg-gradient-to-br from-violet-500/10 via-card to-card">
            <div className="flex items-center gap-2 mb-3">
              <Gift className="h-4 w-4 text-violet-400" />
              <span className="font-semibold">Invite friends</span>
            </div>
            <p className="text-xs text-muted-foreground mb-3">Earn 20% commission on their trading fees for life. They get a 10% trading rebate.</p>
            {referQ.data?.referralCode && (
              <div className="space-y-2">
                <Label className="text-xs">Your code</Label>
                <div className="flex items-center gap-2">
                  <Input readOnly value={referQ.data.referralCode} className="font-mono text-sm" data-testid="input-referral-code" />
                  <Button size="icon" variant="outline" onClick={() => copyRef(referQ.data!.referralCode)} data-testid="button-copy-referral">
                    {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <Separator className="my-3" />
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="text-lg font-bold">{referQ.data.referredCount}</div>
                    <div className="text-[10px] text-muted-foreground uppercase">Invited</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-emerald-400">{referQ.data.referredKycCount}</div>
                    <div className="text-[10px] text-muted-foreground uppercase">KYC</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-amber-400">${referQ.data.estimatedEarnings.toFixed(0)}</div>
                    <div className="text-[10px] text-muted-foreground uppercase">Earned</div>
                  </div>
                </div>
              </div>
            )}
            {referQ.isError && (
              <p className="text-xs text-muted-foreground">Referral data unavailable.</p>
            )}
          </Card>

          {/* Recent referrals */}
          {referQ.data && referQ.data.recent && referQ.data.recent.length > 0 && (
            <Card className="p-5 border-border/60">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold uppercase text-muted-foreground">Recent invitees</span>
                <Badge variant="outline" className="text-[9px]">{referQ.data.recent.length}</Badge>
              </div>
              <div className="space-y-2">
                {referQ.data.recent.slice(0, 5).map((u) => (
                  <div key={u.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-xs flex-1 min-w-0 line-clamp-1">{u.name || `User #${u.id}`}</span>
                    <Badge variant="outline" className="text-[9px] shrink-0">L{u.kycLevel}</Badge>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* ──────── KYC level overview ──────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Verification Levels</h2>
          <Button asChild variant="ghost" size="sm">
            <Link href="/kyc">Manage <ArrowRight className="h-3.5 w-3.5 ml-1" /></Link>
          </Button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {KYC_BENEFITS.map((b) => {
            const achieved = kycLevel >= b.level;
            return (
              <Card key={b.level} className={`p-4 border-border/60 ${achieved ? "bg-gradient-to-br from-emerald-500/5 to-card" : ""}`} data-testid={`kyc-card-l${b.level}`}>
                <div className="flex items-start justify-between mb-2">
                  <Badge className={`${b.color} border-transparent text-[10px] font-bold uppercase`}>
                    L{b.level} · {b.label}
                  </Badge>
                  {achieved && <Check className="h-4 w-4 text-emerald-400" />}
                </div>
                <p className="text-xs text-muted-foreground">{b.desc}</p>
              </Card>
            );
          })}
        </div>
      </div>
      <SuccessModal open={genericSuccess !== null} payload={genericSuccess} onClose={() => setGenericSuccess(null)} />
    </div>
  );
}

// ──────── VIP card ────────

function VipTierCard({
  fees,
  loading,
  inrRate = 84,
}: {
  fees?: {
    volume30dUsdt: number;
    totalFeesUsdt: number;
    currentTier: { level: number; name: string; minVolume: number; spotMaker: number; spotTaker: number; futuresMaker: number; futuresTaker: number; convertFee: number; withdrawDiscount: number };
    nextTier: { level: number; name: string; minVolume: number; convertFee: number } | null;
  };
  loading: boolean;
  inrRate?: number;
}) {
  if (loading) {
    return (
      <Card className="p-5 border-border/60">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading VIP status…
        </div>
      </Card>
    );
  }
  if (!fees) return null;

  const t = fees.currentTier;
  const next = fees.nextTier;
  const vol = Number(fees.volume30dUsdt) || 0;
  const toNext = next ? Math.max(0, next.minVolume - vol) : 0;
  const pct = next && next.minVolume > t.minVolume
    ? Math.max(0, Math.min(100, ((vol - t.minVolume) / (next.minVolume - t.minVolume)) * 100))
    : 100;

  return (
    <Card className="overflow-hidden border-amber-500/20 bg-gradient-to-br from-amber-500/10 via-card to-card" data-testid="card-vip-tier">
      <div className="p-5 sm:p-6 grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Tier badge + headline */}
        <div className="lg:col-span-1 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Crown className="h-4 w-4 text-amber-400" />
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-400">VIP Status</span>
          </div>
          <div>
            <div className="text-xl sm:text-2xl lg:text-3xl font-extrabold tracking-tight" data-testid="vip-tier-name">{t.name}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Level {t.level} · ₹{(vol * inrRate).toLocaleString("en-IN", { maximumFractionDigits: 0 })} traded last 30d</div>
          </div>
          {next ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">Progress to <span className="text-amber-400 font-semibold">{next.name}</span></span>
                <span className="font-mono tabular-nums text-amber-300">{pct.toFixed(0)}%</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-muted/30 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-amber-500 to-orange-500 transition-[width]" style={{ width: `${pct}%` }} />
              </div>
              <div className="text-[11px] text-muted-foreground">
                ₹{(toNext * inrRate).toLocaleString("en-IN", { maximumFractionDigits: 0 })} more volume → save {((t.convertFee - next.convertFee)).toFixed(3)}% on every convert
              </div>
            </div>
          ) : (
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-300">
              Top tier unlocked — best fees across the board.
            </div>
          )}
        </div>

        {/* Fee row */}
        <div className="lg:col-span-2 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <FeeStat label="Spot Maker" value={`${t.spotMaker.toFixed(2)}%`} icon={<Percent className="h-3 w-3" />} />
          <FeeStat label="Spot Taker" value={`${t.spotTaker.toFixed(2)}%`} icon={<Percent className="h-3 w-3" />} />
          <FeeStat label="Futures Taker" value={`${t.futuresTaker.toFixed(3)}%`} icon={<TrendingUp className="h-3 w-3" />} />
          <FeeStat
            label="Convert"
            value={`${t.convertFee.toFixed(3)}%`}
            icon={<ArrowLeftRight className="h-3 w-3" />}
            highlight
            testId="vip-convert-fee"
          />
        </div>
      </div>
      <div className="border-t border-border/40 bg-muted/10 px-5 py-3 text-[11px] text-muted-foreground flex items-center justify-between gap-2">
        <span>30d volume excludes bot/maker liquidity. Tier resets monthly.</span>
        <Link href="/convert" className="text-amber-400 hover:underline inline-flex items-center gap-1">
          Try Quick Convert <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </Card>
  );
}

function FeeStat({
  label, value, icon, highlight, testId,
}: {
  label: string; value: string; icon: React.ReactNode; highlight?: boolean; testId?: string;
}) {
  return (
    <div
      className={`rounded-lg border p-3 ${highlight ? "border-amber-500/40 bg-amber-500/10" : "border-border/60 bg-muted/10"}`}
      data-testid={testId}
    >
      <div className={`flex items-center gap-1 text-[10px] uppercase tracking-wider ${highlight ? "text-amber-400" : "text-muted-foreground"}`}>
        {icon}<span>{label}</span>
      </div>
      <div className={`text-xl font-bold tabular-nums mt-1 ${highlight ? "text-amber-300" : "text-foreground"}`}>{value}</div>
    </div>
  );
}

// ──────── Bits ────────

function StatCard({
  icon, label, value, sub, tone, testId,
}: {
  icon: React.ReactNode; label: string; value: string; sub?: string;
  tone: "amber" | "emerald" | "rose" | "sky" | "violet";
  testId?: string;
}) {
  const tones = {
    amber: "from-amber-500/15 text-amber-400 border-amber-500/30",
    emerald: "from-emerald-500/15 text-emerald-400 border-emerald-500/30",
    rose: "from-rose-500/15 text-rose-400 border-rose-500/30",
    sky: "from-sky-500/15 text-sky-400 border-sky-500/30",
    violet: "from-violet-500/15 text-violet-400 border-violet-500/30",
  };
  return (
    <Card className={`p-4 border bg-gradient-to-br ${tones[tone]} to-card`} data-testid={testId}>
      <div className="flex items-center gap-2 text-xs font-medium opacity-80 mb-2">
        {icon}
        <span className="uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
    </Card>
  );
}

function ActionCard({
  href, icon, title, desc, accent, testId,
}: {
  href: string; icon: React.ReactNode; title: string; desc: string;
  accent: "amber" | "emerald" | "rose" | "sky" | "violet" | "cyan";
  testId?: string;
}) {
  const accents = {
    amber: "text-amber-400 bg-amber-500/15 group-hover:bg-amber-500/25",
    emerald: "text-emerald-400 bg-emerald-500/15 group-hover:bg-emerald-500/25",
    rose: "text-rose-400 bg-rose-500/15 group-hover:bg-rose-500/25",
    sky: "text-sky-400 bg-sky-500/15 group-hover:bg-sky-500/25",
    violet: "text-violet-400 bg-violet-500/15 group-hover:bg-violet-500/25",
    cyan: "text-cyan-400 bg-cyan-500/15 group-hover:bg-cyan-500/25",
  };
  return (
    <Link href={href}>
      <Card className="p-4 border-border/60 hover:border-primary/40 transition cursor-pointer group" data-testid={testId}>
        <div className="flex items-start gap-3">
          <div className={`h-10 w-10 rounded-lg flex items-center justify-center transition ${accents[accent]}`}>
            {icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm flex items-center gap-1.5">
              {title} <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-60 transition" />
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{desc}</p>
          </div>
        </div>
      </Card>
    </Link>
  );
}

function LoginPrefsCard({
  sec,
  onSaved,
}: {
  sec?: {
    twoFaEnabled: boolean;
    loginEmailOtpEnabled?: boolean;
    loginPhoneOtpEnabled?: boolean;
    emailVerified?: boolean;
    phoneVerified?: boolean;
    hasPhone?: boolean;
  };
  onSaved: () => void;
}) {
  const qc = useQueryClient();
  const [loginPrefSuccess, setLoginPrefSuccess] = useState<GenericSuccess | null>(null);
  const m = useMutation({
    mutationFn: (body: { loginEmailOtpEnabled?: boolean; loginPhoneOtpEnabled?: boolean }) =>
      patch("/security/login-prefs", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/security/me"] });
      onSaved();
      setLoginPrefSuccess({ kind: "generic", iconKind: "paid", accentColor: "emerald", title: "Preferences Saved!", subtitle: "Your login security preferences have been updated.", rows: [], primaryLabel: "Done" });
    },
    onError: (e: any) =>
      toast.error(e?.data?.error || e?.message || "Couldn't update"),
  });

  const emailOn = !!sec?.loginEmailOtpEnabled;
  const phoneOn = !!sec?.loginPhoneOtpEnabled;
  const phoneAllowed = !!sec?.hasPhone && !!sec?.phoneVerified;

  return (
    <Card className="p-5 border-border/60" data-testid="card-login-prefs">
      <div className="flex items-center gap-2 mb-1">
        <Shield className="h-4 w-4 text-amber-400" />
        <h3 className="font-semibold">Login preferences</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Add extra checks every time you sign in. The platform may also enforce some of these — those will always run, regardless of your choice here.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-lg border border-border/60 bg-muted/10 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">Email OTP at login</span>
            </div>
            <Switch
              checked={emailOn}
              disabled={m.isPending || !sec?.emailVerified}
              onCheckedChange={(v) => m.mutate({ loginEmailOtpEnabled: v })}
              data-testid="switch-login-email-otp"
            />
          </div>
          <p className="text-[11px] text-muted-foreground mt-1.5 leading-snug">
            {sec?.emailVerified
              ? "We'll email you a 6-digit code on every sign-in."
              : "Verify your email first to enable this."}
          </p>
        </div>

        <div className="rounded-lg border border-border/60 bg-muted/10 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">Phone OTP at login</span>
            </div>
            <Switch
              checked={phoneOn}
              disabled={m.isPending || !phoneAllowed}
              onCheckedChange={(v) => m.mutate({ loginPhoneOtpEnabled: v })}
              data-testid="switch-login-phone-otp"
            />
          </div>
          <p className="text-[11px] text-muted-foreground mt-1.5 leading-snug">
            {phoneAllowed
              ? "We'll SMS you a 6-digit code on every sign-in."
              : "Add and verify a phone number first to enable this."}
          </p>
        </div>
      </div>
      <div className="text-[11px] text-muted-foreground mt-3">
        2FA: <span className={sec?.twoFaEnabled ? "text-emerald-400 font-semibold" : ""}>{sec?.twoFaEnabled ? "Enabled" : "Off"}</span> — manage from Settings → Security.
      </div>
      <SuccessModal open={loginPrefSuccess !== null} payload={loginPrefSuccess} onClose={() => setLoginPrefSuccess(null)} />
    </Card>
  );
}
