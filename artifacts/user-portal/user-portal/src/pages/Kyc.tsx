import { useState, useMemo, useRef, useEffect, useId } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Shield, BadgeCheck, Lock, Clock, CheckCircle2, XCircle, AlertCircle,
  Loader2, Upload, FileText, User as UserIcon, Camera, MapPin, Calendar,
  Hash, ArrowRight, Info, IdCard, Mail, Phone, Crown, Gift, KeyRound,
  Copy, Check, Fingerprint, ShieldCheck, ShieldOff, TrendingUp, Eye, X,
  Smartphone, Star, Zap, Award, ChevronRight, ExternalLink,
} from "lucide-react";
import { get, post, ApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { SuccessModal, type GenericSuccess } from "@/components/SuccessModal";
import { PageHeader } from "@/components/premium/PageHeader";
import { SectionCard } from "@/components/premium/SectionCard";
import { StatusPill } from "@/components/premium/StatusPill";
import { Link } from "wouter";

type KycSetting = {
  level: number;
  name: string;
  description?: string;
  depositLimit: string | number;
  withdrawLimit: string | number;
  tradeLimit: string | number;
  features: string[] | string;
};

function parseFeatures(f: string[] | string | null | undefined): string[] {
  if (!f) return [];
  if (Array.isArray(f)) return f;
  try {
    const parsed = JSON.parse(f);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

type KycRecord = {
  id: number;
  level: number;
  status: "pending" | "approved" | "rejected";
  fullName: string | null;
  dob: string | null;
  panNumber: string | null;
  aadhaarNumber: string | null;
  address: string | null;
  rejectReason: string | null;
  createdAt: string;
  reviewedAt: string | null;
};

const LEVEL_META: Record<number, { name: string; tagline: string; color: string; icon: any; docs: string }> = {
  1: { name: "Basic",        tagline: "PAN + Personal Info",   color: "sky",     icon: IdCard,   docs: "PAN card number" },
  2: { name: "Intermediate", tagline: "Aadhaar + Documents",   color: "amber",   icon: FileText, docs: "PAN + Aadhaar docs" },
  3: { name: "Advanced",     tagline: "Selfie + Address proof", color: "emerald", icon: Camera,   docs: "Selfie + address" },
};

const FEATURE_LABELS: Record<string, { label: string; icon: string }> = {
  browse:        { label: "Browse markets",   icon: "👁" },
  deposit:       { label: "Deposit funds",    icon: "⬇" },
  trade:         { label: "Spot trading",     icon: "🔄" },
  withdraw:      { label: "Withdrawals",      icon: "⬆" },
  earn_simple:   { label: "Flexible Earn",   icon: "💰" },
  earn_advanced: { label: "Locked Earn",     icon: "🔒" },
  earn:          { label: "Earn / Staking",  icon: "🏦" },
  futures:       { label: "Futures trading", icon: "📈" },
  margin:        { label: "Margin trading",  icon: "⚡" },
  p2p:           { label: "P2P trading",     icon: "🤝" },
  card:          { label: "Crypto card",     icon: "💳" },
};

function fmtINR(n: number) {
  if (!Number.isFinite(n)) return "—";
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(1)} Cr`;
  if (n >= 100000)   return `₹${(n / 100000).toFixed(1)} L`;
  if (n >= 1000)     return `₹${(n / 1000).toFixed(0)}k`;
  return `₹${n}`;
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  try { return new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return "—"; }
}
function fmtDateTime(s: string | null | undefined): string {
  if (!s) return "—";
  try {
    const d = new Date(s);
    return d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return "—"; }
}
function maskPhone(p: string | null | undefined): string {
  if (!p) return "—";
  if (p.length < 6) return p;
  return p.slice(0, 3) + "•••••" + p.slice(-2);
}
function maskEmail(e: string | null | undefined): string {
  if (!e) return "—";
  const [u, d] = e.split("@");
  if (!u || !d) return e;
  if (u.length <= 2) return e;
  return u.slice(0, 2) + "•••" + "@" + d;
}

// ── Security Score Gauge ──────────────────────────────────────────────────
const SCORE_FACTORS = [
  { key: "email",   label: "Email verified",       pts: 15, icon: Mail },
  { key: "phone",   label: "Phone verified",        pts: 15, icon: Phone },
  { key: "twoFa",   label: "Two-factor auth (2FA)", pts: 20, icon: KeyRound },
  { key: "kycL1",   label: "KYC Level 1",           pts: 15, icon: IdCard },
  { key: "kycL2",   label: "KYC Level 2",           pts: 20, icon: FileText },
  { key: "kycL3",   label: "KYC Level 3",           pts: 15, icon: Camera },
];

function SecurityScoreGauge({ score }: { score: number }) {
  const radius = 52;
  const circ = 2 * Math.PI * radius;
  const dash = (score / 100) * circ;
  const color = score >= 80 ? "#10b981" : score >= 50 ? "#f59e0b" : "#ef4444";
  const label = score >= 80 ? "Excellent" : score >= 60 ? "Good" : score >= 40 ? "Fair" : "Weak";

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative h-32 w-32">
        <svg className="h-32 w-32 -rotate-90" viewBox="0 0 128 128">
          <circle cx="64" cy="64" r={radius} fill="none" stroke="currentColor" strokeWidth="10" className="text-muted/30" />
          <circle
            cx="64" cy="64" r={radius} fill="none"
            stroke={color} strokeWidth="10"
            strokeDasharray={`${dash} ${circ}`}
            strokeLinecap="round"
            style={{ transition: "stroke-dasharray 0.8s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
          <span className="text-2xl font-black tabular-nums" style={{ color }}>{score}</span>
          <span className="text-[10px] text-muted-foreground uppercase tracking-widest">/ 100</span>
        </div>
      </div>
      <div>
        <Badge className="text-xs font-semibold" style={{ background: `${color}22`, color, border: `1px solid ${color}44` }}>
          {label}
        </Badge>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────
export default function Kyc() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const settingsQ = useQuery<KycSetting[]>({
    queryKey: ["/kyc/settings"],
    queryFn: () => get<KycSetting[]>("/kyc/settings"),
  });

  const myKycQ = useQuery<KycRecord[]>({
    queryKey: ["/kyc/my"],
    queryFn: () => get<KycRecord[]>("/kyc/my"),
  });

  const [submitFor, setSubmitFor] = useState<number | null>(null);

  const currentLevel = user?.kycLevel ?? 0;

  const latestByLevel = useMemo(() => {
    const map = new Map<number, KycRecord>();
    for (const r of myKycQ.data ?? []) {
      if (!map.has(r.level)) map.set(r.level, r);
    }
    return map;
  }, [myKycQ.data]);

  const settings = settingsQ.data ?? [];
  const sorted = [...settings].sort((a, b) => a.level - b.level);
  const currentSettings = useMemo(() => sorted.find((s) => s.level === currentLevel), [sorted, currentLevel]);

  // Security score
  const scoreFactors = useMemo(() => {
    const achieved: Record<string, boolean> = {
      email: !!user?.emailVerified,
      phone: !!user?.phoneVerified,
      twoFa: !!user?.twoFaEnabled,
      kycL1: currentLevel >= 1,
      kycL2: currentLevel >= 2,
      kycL3: currentLevel >= 3,
    };
    return achieved;
  }, [user, currentLevel]);

  const securityScore = useMemo(() =>
    SCORE_FACTORS.reduce((sum, f) => sum + (scoreFactors[f.key] ? f.pts : 0), 0),
  [scoreFactors]);

  return (
    <div className="container mx-auto max-w-6xl p-4 sm:p-6 space-y-5">
      <PageHeader
        eyebrow="Identity & Compliance"
        title="KYC Verification"
        description="Verify your identity to unlock higher trading limits and premium features."
        actions={
          <div className="flex items-center gap-2">
            <StatusPill variant={currentLevel >= 3 ? "gold" : currentLevel >= 1 ? "success" : "warning"}>
              <BadgeCheck className="h-3 w-3 mr-0.5" /> L{currentLevel} / 3
            </StatusPill>
          </div>
        }
      />

      {/* ──────── Security Overview (Score + Checklist) ──────── */}
      <div className="grid lg:grid-cols-3 gap-4">
        {/* Score gauge */}
        <Card className="p-5 flex flex-col items-center gap-4 bg-gradient-to-br from-card to-muted/10 border-border/60">
          <div className="text-center">
            <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-0.5">Security Score</div>
            <div className="text-[11px] text-muted-foreground">Based on all security factors</div>
          </div>
          <SecurityScoreGauge score={securityScore} />
          <div className="w-full grid grid-cols-2 gap-2 text-[11px]">
            <div className="rounded-md border border-border/50 px-2 py-1.5 text-center">
              <div className="text-muted-foreground">Withdraw limit</div>
              <div className="font-bold text-sm">
                {currentSettings ? fmtINR(Number(currentSettings.withdrawLimit)) : "—"}
              </div>
            </div>
            <div className="rounded-md border border-border/50 px-2 py-1.5 text-center">
              <div className="text-muted-foreground">Trade limit</div>
              <div className="font-bold text-sm">
                {currentSettings ? fmtINR(Number(currentSettings.tradeLimit)) : "—"}
              </div>
            </div>
          </div>
        </Card>

        {/* Security checklist */}
        <Card className="p-5 lg:col-span-2 border-border/60">
          <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Security Checklist</div>
          <div className="space-y-2">
            {SCORE_FACTORS.map((f) => {
              const done = scoreFactors[f.key];
              const Icon = f.icon;
              const actionLink: Record<string, string> = {
                email: "/settings", phone: "/settings", twoFa: "/settings",
                kycL1: "/kyc", kycL2: "/kyc", kycL3: "/kyc",
              };
              const actionLabel: Record<string, string> = {
                email: "Verify email", phone: "Add & verify phone", twoFa: "Enable 2FA",
                kycL1: "Submit Level 1", kycL2: "Submit Level 2", kycL3: "Submit Level 3",
              };
              return (
                <div
                  key={f.key}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg border text-sm transition-colors ${
                    done
                      ? "border-emerald-500/20 bg-emerald-500/5"
                      : "border-border/50 bg-muted/10 hover:bg-muted/20"
                  }`}
                >
                  <div className={`h-6 w-6 rounded-full flex items-center justify-center shrink-0 ${
                    done ? "bg-emerald-500/20 text-emerald-400" : "bg-muted/60 text-muted-foreground"
                  }`}>
                    {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Icon className="h-3 w-3" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className={done ? "text-foreground" : "text-muted-foreground"}>{f.label}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-[10px] font-bold ${done ? "text-emerald-400" : "text-muted-foreground/60"}`}>
                      +{f.pts}
                    </span>
                    {!done && (
                      <Link href={actionLink[f.key]}>
                        <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px] text-amber-400 hover:text-amber-300">
                          {actionLabel[f.key]} <ChevronRight className="h-3 w-3 ml-0.5" />
                        </Button>
                      </Link>
                    )}
                    {done && <Badge className="text-[9px] bg-emerald-500/15 text-emerald-400 border-emerald-500/30">Done</Badge>}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* ──────── KYC Progress Stepper ──────── */}
      <Card className="p-5 border-border/60">
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Verification Progress</span>
          <span className="text-xs text-muted-foreground tabular-nums">{currentLevel} / 3 levels complete</span>
        </div>
        <div className="relative">
          <div className="absolute top-5 left-5 right-5 h-0.5 bg-muted/40" />
          <div
            className="absolute top-5 left-5 h-0.5 bg-gradient-to-r from-emerald-500 to-amber-500 transition-all duration-700"
            style={{ width: `${currentLevel === 0 ? 0 : currentLevel === 1 ? 33 : currentLevel === 2 ? 66 : 100}%`, maxWidth: "calc(100% - 2.5rem)" }}
          />
          <div className="relative flex justify-between">
            {[
              { lvl: 0, label: "Unverified", sub: "No limits" },
              { lvl: 1, label: "Basic",       sub: "L1 · PAN" },
              { lvl: 2, label: "Intermediate",sub: "L2 · Aadhaar" },
              { lvl: 3, label: "Advanced",    sub: "L3 · Selfie" },
            ].map(({ lvl, label, sub }) => {
              const done = currentLevel >= lvl && lvl > 0;
              const active = currentLevel === lvl;
              return (
                <div key={lvl} className="flex flex-col items-center gap-1.5 z-10">
                  <div className={`h-10 w-10 rounded-full flex items-center justify-center border-2 text-xs font-bold transition-all ${
                    done
                      ? "border-emerald-500 bg-emerald-500/20 text-emerald-400"
                      : active
                        ? "border-amber-500/60 bg-amber-500/10 text-amber-400"
                        : "border-border bg-card text-muted-foreground"
                  }`}>
                    {done ? <CheckCircle2 className="h-4 w-4" /> : lvl === 0 ? <ShieldOff className="h-4 w-4" /> : lvl}
                  </div>
                  <div className="text-center">
                    <div className="text-[11px] font-semibold">{label}</div>
                    <div className="text-[10px] text-muted-foreground">{sub}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      {/* ──────── Account Details ──────── */}
      <SectionCard
        title="Account Details"
        description="Your current account information and verification status."
        icon={UserIcon}
      >
        <div className="flex flex-col sm:flex-row gap-5">
          <div className="flex items-center gap-4 sm:w-72 shrink-0">
            <KycAvatar user={user} />
            <div className="min-w-0">
              <div className="font-semibold text-sm line-clamp-1">{user?.name || user?.fullName || "—"}</div>
              <div className="text-xs text-muted-foreground line-clamp-1">
                UID: <span className="font-mono">{(user as any)?.uid ?? user?.id ?? "—"}</span>
              </div>
              <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                <StatusPill status={user?.status || "active"} />
                {user?.role && user.role !== "user" && (
                  <StatusPill variant="gold">{user.role.toUpperCase()}</StatusPill>
                )}
              </div>
            </div>
          </div>

          <Separator orientation="vertical" className="hidden sm:block h-auto" />
          <Separator className="sm:hidden" />

          <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <DetailField icon={Mail} label="Email" value={maskEmail(user?.email)}
              trailing={user?.emailVerified ? <StatusPill variant="success">Verified</StatusPill> : <StatusPill variant="warning">Unverified</StatusPill>}
            />
            <DetailField icon={Phone} label="Phone" value={user?.phone ? maskPhone(user.phone) : "Not added"}
              trailing={user?.phoneVerified ? <StatusPill variant="success">Verified</StatusPill> : user?.phone ? <StatusPill variant="warning">Unverified</StatusPill> : null}
            />
            <DetailField icon={KeyRound} label="Two-Factor Auth" value={user?.twoFaEnabled ? "Enabled" : "Disabled"}
              trailing={user?.twoFaEnabled
                ? <StatusPill variant="success">Active</StatusPill>
                : <Link href="/settings"><Button size="sm" variant="ghost" className="h-6 px-2 text-[11px] text-amber-400 hover:text-amber-300">Enable</Button></Link>
              }
            />
            <DetailField icon={Fingerprint} label="KYC Level"
              value={`Level ${currentLevel}${currentLevel ? ` · ${LEVEL_META[currentLevel]?.name ?? ""}` : " · Unverified"}`}
              trailing={currentLevel >= 3 ? <StatusPill variant="gold">Full</StatusPill> : currentLevel >= 1 ? <StatusPill variant="success">L{currentLevel}</StatusPill> : <StatusPill variant="warning">L0</StatusPill>}
            />
            <DetailField icon={Calendar} label="Member Since" value={fmtDate(user?.createdAt)} />
            <DetailField icon={Clock} label="Last Login" value={fmtDateTime((user as any)?.lastLoginAt)} />
            <DetailField icon={Gift} label="Referral Code" value={(user as any)?.referralCode || "—"} mono
              trailing={(user as any)?.referralCode ? <CopyButton value={(user as any).referralCode} /> : null}
            />
            <DetailField icon={Crown} label="VIP Tier" value={user?.vipTier ? `VIP ${user.vipTier}` : "Standard"} />
          </div>
        </div>
      </SectionCard>

      {/* ──────── KYC Levels Grid ──────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {sorted.filter((s) => s.level >= 1).map((s) => {
          const meta = LEVEL_META[s.level];
          const latest = latestByLevel.get(s.level);
          const achieved = currentLevel >= s.level;
          const isPrevReq = s.level > 1 && currentLevel < s.level - 1;
          const Icon = meta.icon;
          const features = parseFeatures(s.features);

          let status: "achieved" | "pending" | "rejected" | "available" | "locked" = "available";
          if (achieved) status = "achieved";
          else if (latest?.status === "pending") status = "pending";
          else if (latest?.status === "rejected") status = "rejected";
          else if (isPrevReq) status = "locked";

          const tones: Record<string, { card: string; badge: string }> = {
            sky:     { card: "from-sky-500/8 border-sky-500/25",     badge: "text-sky-400 border-sky-500/30 bg-sky-500/10" },
            amber:   { card: "from-amber-500/8 border-amber-500/25", badge: "text-amber-400 border-amber-500/30 bg-amber-500/10" },
            emerald: { card: "from-emerald-500/8 border-emerald-500/25", badge: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" },
          };
          const tone = tones[meta.color];

          return (
            <Card key={s.level} className={`p-5 border bg-gradient-to-br ${tone.card} to-card flex flex-col gap-3`} data-testid={`level-card-${s.level}`}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={`h-10 w-10 rounded-xl bg-card/70 border border-border/40 flex items-center justify-center`}>
                    <Icon className={`h-5 w-5 ${tone.badge.split(" ")[0]}`} />
                  </div>
                  <div>
                    <h3 className="font-bold text-base">Level {s.level}</h3>
                    <p className="text-xs text-muted-foreground">{s.name || meta.name}</p>
                  </div>
                </div>
                <LevelStatusBadge status={status} />
              </div>

              <div className="text-xs text-muted-foreground leading-relaxed">
                {s.description || meta.tagline}
              </div>

              <Separator />

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-md border border-border/40 px-2 py-1.5">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Daily Withdraw</div>
                  <div className="font-bold tabular-nums mt-0.5">{fmtINR(Number(s.withdrawLimit))}</div>
                </div>
                <div className="rounded-md border border-border/40 px-2 py-1.5">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Daily Trade</div>
                  <div className="font-bold tabular-nums mt-0.5">{fmtINR(Number(s.tradeLimit))}</div>
                </div>
              </div>

              {features.length > 0 && (
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">Unlocks</div>
                  <div className="flex flex-wrap gap-1">
                    {features.map((f) => {
                      const fl = FEATURE_LABELS[f];
                      return (
                        <Badge key={f} variant="outline" className={`text-[9px] font-normal gap-0.5 ${tone.badge}`}>
                          {fl?.icon} {fl?.label ?? f}
                        </Badge>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="text-[10px] text-muted-foreground flex items-center gap-1.5">
                <FileText className="h-3 w-3 shrink-0" />
                <span>Required: {meta.docs}</span>
              </div>

              {latest?.status === "rejected" && latest.rejectReason && (
                <div className="text-xs text-rose-400 rounded-md bg-rose-500/10 border border-rose-500/30 p-2.5 flex items-start gap-2">
                  <XCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span><span className="font-semibold">Rejected:</span> {latest.rejectReason}</span>
                </div>
              )}

              <div className="mt-auto pt-1">
                {status === "achieved" && (
                  <Button variant="outline" disabled className="w-full gap-2 border-emerald-500/30 text-emerald-400">
                    <CheckCircle2 className="h-4 w-4" /> Verified
                  </Button>
                )}
                {status === "pending" && (
                  <Button variant="outline" disabled className="w-full gap-2 border-amber-500/30 text-amber-400">
                    <Clock className="h-4 w-4 animate-pulse" /> Under Review
                  </Button>
                )}
                {status === "locked" && (
                  <Button variant="outline" disabled className="w-full gap-2 text-muted-foreground">
                    <Lock className="h-4 w-4" /> Complete L{s.level - 1} first
                  </Button>
                )}
                {(status === "available" || status === "rejected") && (
                  <Button
                    onClick={() => setSubmitFor(s.level)}
                    className="w-full gap-2 bg-gradient-to-r from-amber-500 to-orange-500 text-black hover:from-amber-400 hover:to-orange-400 font-semibold"
                    data-testid={`button-submit-l${s.level}`}
                  >
                    {status === "rejected" ? "Re-submit" : "Verify now"} <ArrowRight className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {/* ──────── Features Matrix ──────── */}
      {sorted.filter((s) => s.level >= 1).length > 0 && (
        <SectionCard title="Features by Verification Level" icon={Zap}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="text-left py-2 pr-4 text-xs font-medium text-muted-foreground w-36">Feature</th>
                  <th className="text-center py-2 px-3 text-xs font-medium text-muted-foreground">
                    <Badge variant="secondary" className="text-[10px]">Unverified</Badge>
                  </th>
                  {sorted.filter((s) => s.level >= 1).map((s) => (
                    <th key={s.level} className="text-center py-2 px-3 text-xs font-medium text-muted-foreground">
                      <Badge className={`text-[10px] ${
                        s.level === 1 ? "bg-sky-500/15 text-sky-400 border-sky-500/30" :
                        s.level === 2 ? "bg-amber-500/15 text-amber-400 border-amber-500/30" :
                        "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                      } border`}>
                        L{s.level} · {s.name || LEVEL_META[s.level]?.name}
                      </Badge>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(FEATURE_LABELS).map(([key, fl]) => {
                  const unverifiedHas = false;
                  const levelHas = sorted.reduce((acc, s) => {
                    acc[s.level] = parseFeatures(s.features).includes(key);
                    return acc;
                  }, {} as Record<number, boolean>);
                  const anyLevel = Object.values(levelHas).some(Boolean);
                  if (!anyLevel) return null;
                  return (
                    <tr key={key} className="border-b border-border/30 last:border-0 hover:bg-muted/10 transition-colors">
                      <td className="py-2 pr-4 text-xs text-muted-foreground">
                        <span className="mr-1.5">{fl.icon}</span>{fl.label}
                      </td>
                      <td className="py-2 px-3 text-center">
                        {unverifiedHas ? <Check className="h-3.5 w-3.5 text-emerald-400 mx-auto" /> : <X className="h-3.5 w-3.5 text-muted-foreground/30 mx-auto" />}
                      </td>
                      {sorted.filter((s) => s.level >= 1).map((s) => (
                        <td key={s.level} className="py-2 px-3 text-center">
                          {levelHas[s.level]
                            ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 mx-auto" />
                            : <X className="h-3.5 w-3.5 text-muted-foreground/30 mx-auto" />}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {/* ──────── Submission History ──────── */}
      {(myKycQ.data?.length ?? 0) > 0 && (
        <SectionCard title="Submission History" icon={FileText}>
          <div className="space-y-2">
            {(myKycQ.data ?? []).map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-muted/30 border border-border/40 text-sm">
                <div className="flex items-center gap-3 min-w-0">
                  <Badge variant="outline" className="text-[10px] shrink-0">L{r.level}</Badge>
                  <div className="min-w-0">
                    <div className="font-medium line-clamp-1">{r.fullName || "—"}</div>
                    <div className="text-xs text-muted-foreground">
                      Submitted {new Date(r.createdAt).toLocaleString()}
                      {r.reviewedAt && ` · Reviewed ${new Date(r.reviewedAt).toLocaleDateString()}`}
                    </div>
                  </div>
                </div>
                <StatusPill status={r.status} />
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* ──────── Security Tips ──────── */}
      <div className="grid sm:grid-cols-3 gap-3">
        {[
          { icon: Shield,     title: "Data Protection",  body: "Your documents are encrypted at rest with AES-256 and transmitted over TLS. We never sell or share your KYC data." },
          { icon: Clock,      title: "Review Time",       body: "Submissions are reviewed within 24 hours. You'll receive an email and in-app notification on the outcome." },
          { icon: ShieldCheck,title: "Secure Submission", body: "Upload clear, well-lit originals — not screenshots. Name must match your bank account for withdrawals." },
        ].map(({ icon: Icon, title, body }) => (
          <div key={title} className="rounded-xl border border-border/50 bg-muted/10 p-4 flex gap-3">
            <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
              <Icon className="h-4 w-4 text-amber-400" />
            </div>
            <div>
              <div className="text-xs font-semibold mb-1">{title}</div>
              <div className="text-[11px] text-muted-foreground leading-relaxed">{body}</div>
            </div>
          </div>
        ))}
      </div>

      <KycSubmitDialog
        level={submitFor}
        prevRecords={latestByLevel}
        onOpenChange={(v) => { if (!v) setSubmitFor(null); }}
        onSuccess={() => {
          qc.invalidateQueries({ queryKey: ["/kyc/my"] });
          setSubmitFor(null);
        }}
      />
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────

function DetailField({
  icon: Icon, label, value, trailing, mono,
}: { icon: any; label: string; value: string; trailing?: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start gap-2 min-w-0">
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className={`text-sm line-clamp-1 ${mono ? "font-mono" : ""}`}>{value}</div>
      </div>
      {trailing && <div className="shrink-0">{trailing}</div>}
    </div>
  );
}

function KycAvatar({ user }: { user: ReturnType<typeof useAuth>["user"] }) {
  if (user?.avatarUrl) {
    return <img src={user.avatarUrl} alt={user.name || user.email} className="h-14 w-14 rounded-full object-cover border border-border/60" />;
  }
  const seed = (user?.name || user?.fullName || user?.email || "?").trim();
  const initials = seed.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";
  return (
    <div className="h-14 w-14 rounded-full bg-gradient-to-br from-amber-500/30 to-orange-500/20 border border-amber-500/30 flex items-center justify-center text-amber-300 font-bold text-lg">
      {initials}
    </div>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 1500);
    } catch { toast.error("Copy failed"); }
  };
  return (
    <Button type="button" size="sm" variant="ghost" onClick={onCopy} className="h-6 px-2 text-[11px]">
      {copied ? <Check className="h-3 w-3 mr-1 text-emerald-400" /> : <Copy className="h-3 w-3 mr-1" />}
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

function LevelStatusBadge({ status }: { status: "achieved" | "pending" | "rejected" | "available" | "locked" }) {
  const map: Record<string, { label: string; cls: string; Icon: any }> = {
    achieved:  { label: "Approved",  cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", Icon: CheckCircle2 },
    pending:   { label: "Pending",   cls: "bg-amber-500/15  text-amber-400  border-amber-500/30",   Icon: Clock },
    rejected:  { label: "Rejected",  cls: "bg-rose-500/15   text-rose-400   border-rose-500/30",    Icon: XCircle },
    available: { label: "Available", cls: "bg-sky-500/15    text-sky-400    border-sky-500/30",     Icon: ArrowRight },
    locked:    { label: "Locked",    cls: "bg-zinc-500/15   text-muted-foreground border-zinc-500/30", Icon: Lock },
  };
  const m = map[status];
  const Icon = m.Icon;
  return (
    <Badge className={`${m.cls} border text-[10px] font-bold uppercase shrink-0`}>
      <Icon className="h-2.5 w-2.5 mr-0.5" /> {m.label}
    </Badge>
  );
}

function ImagePreviewModal({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <div className="relative max-w-2xl w-full" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute -top-3 -right-3 bg-card border border-border rounded-full p-1 text-muted-foreground hover:text-foreground z-10">
          <X className="h-4 w-4" />
        </button>
        <img src={url} alt="Document preview" className="w-full rounded-xl object-contain max-h-[80vh]" />
      </div>
    </div>
  );
}

function FileUploadField({ label, testId, url, setUrl, hint }: {
  label: string; testId: string; url: string; setUrl: (u: string) => void; hint?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(false);

  const compressImage = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const objUrl = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(objUrl);
        const MAX_W = 1200, MAX_H = 900;
        const ratio = Math.min(MAX_W / img.width, MAX_H / img.height, 1);
        const w = Math.round(img.width * ratio);
        const h = Math.round(img.height * ratio);
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) { reject(new Error("Canvas unavailable")); return; }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.72));
      };
      img.onerror = () => { URL.revokeObjectURL(objUrl); reject(new Error("Image load failed")); };
      img.src = objUrl;
    });

  const onFile = async (file: File) => {
    if (file.size > 10 * 1024 * 1024) { toast.error("File too large — maximum 10 MB"); return; }
    if (!file.type.startsWith("image/")) { toast.error("Invalid type — JPG, PNG, WEBP only"); return; }
    setUploading(true);
    try {
      const dataUrl = await compressImage(file);
      setUrl(dataUrl);
      toast.success(`${label} uploaded`);
    } catch (e: any) {
      toast.error(e?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <Label className="flex items-center gap-1.5">
        <Upload className="h-3 w-3" /> {label}
        {hint && <span className="text-muted-foreground font-normal text-[10px]">— {hint}</span>}
      </Label>
      <input ref={inputRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
        data-testid={`${testId}-input`}
      />
      {url ? (
        <div className="mt-1.5 space-y-2">
          <div className="relative rounded-lg overflow-hidden border border-emerald-500/40 bg-muted/20 aspect-[4/2.2] max-h-32">
            <img src={url} alt={label} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/30 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
              <button type="button" onClick={() => setPreview(true)} className="bg-black/70 text-white rounded-full p-1.5 hover:bg-black"><Eye className="h-3.5 w-3.5" /></button>
              <button type="button" onClick={() => inputRef.current?.click()} className="bg-black/70 text-white rounded-full p-1.5 hover:bg-black"><Upload className="h-3.5 w-3.5" /></button>
              <button type="button" onClick={() => { setUrl(""); if (inputRef.current) inputRef.current.value = ""; }} className="bg-black/70 text-white rounded-full p-1.5 hover:bg-black"><X className="h-3.5 w-3.5" /></button>
            </div>
          </div>
          <p className="text-[11px] text-emerald-400 flex items-center gap-1" data-testid={`${testId}-status`}>
            <CheckCircle2 className="h-3 w-3" /> Uploaded — hover to replace
          </p>
        </div>
      ) : (
        <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading}
          data-testid={`${testId}-button`}
          className="mt-1.5 w-full border-2 border-dashed border-border/60 hover:border-amber-500/50 rounded-lg p-4 flex flex-col items-center justify-center gap-2 transition-colors text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {uploading
            ? <><Loader2 className="h-5 w-5 animate-spin text-amber-400" /><span className="text-xs">Processing…</span></>
            : <><Upload className="h-5 w-5" /><span className="text-xs font-medium">Click to upload image</span><span className="text-[10px] text-muted-foreground/60">JPG, PNG, WEBP · max 8 MB</span></>
          }
        </button>
      )}
      {preview && url && <ImagePreviewModal url={url} onClose={() => setPreview(false)} />}
    </div>
  );
}

// ── KYC Submit Dialog ─────────────────────────────────────────────────────
function KycSubmitDialog({ level, prevRecords, onOpenChange, onSuccess }: {
  level: number | null;
  prevRecords: Map<number, KycRecord>;
  onOpenChange: (v: boolean) => void;
  onSuccess: () => void;
}) {
  const lvl = level ?? 0;
  const uid = useId();
  const fieldId = (name: string) => `${uid}-${name}`;

  const prevApproved = useMemo(() => {
    for (let l = lvl - 1; l >= 1; l--) {
      const r = prevRecords.get(l);
      if (r?.status === "approved") return r;
    }
    return null;
  }, [prevRecords, lvl]);

  const [fullName, setFullName] = useState("");
  const [dob, setDob] = useState("");
  const [pan, setPan] = useState("");
  const [aadhaar, setAadhaar] = useState("");
  const [address, setAddress] = useState("");
  const [panDocUrl, setPanDocUrl] = useState("");
  const [aadhaarDocUrl, setAadhaarDocUrl] = useState("");
  const [aadhaarDocBackUrl, setAadhaarDocBackUrl] = useState("");
  const [selfieUrl, setSelfieUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [genericSuccess, setGenericSuccess] = useState<GenericSuccess | null>(null);

  useEffect(() => {
    if (level !== null && prevApproved) {
      if (prevApproved.fullName) setFullName(prevApproved.fullName);
      if (prevApproved.dob) setDob(prevApproved.dob);
      if (prevApproved.panNumber) setPan(prevApproved.panNumber);
      if (prevApproved.aadhaarNumber) setAadhaar(prevApproved.aadhaarNumber);
      if (prevApproved.address) setAddress(prevApproved.address);
    }
  }, [level, prevApproved]);

  const reset = () => {
    setFullName(""); setDob(""); setPan(""); setAadhaar(""); setAddress("");
    setPanDocUrl(""); setAadhaarDocUrl(""); setAadhaarDocBackUrl(""); setSelfieUrl("");
    setSubmitting(false); setTouched({});
  };

  const touch = (field: string) => setTouched((t) => ({ ...t, [field]: true }));

  const panOk = /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan.toUpperCase());
  const aadhaarOk = /^\d{12}$/.test(aadhaar.replace(/\s+/g, ""));

  const errors: Record<string, string> = {};
  if (!fullName.trim()) errors.fullName = "Full name is required";
  if (!dob) errors.dob = "Date of birth is required";
  if (!panOk) errors.pan = "Enter valid PAN — format: AAAAA1111A";
  if (lvl >= 2 && !aadhaarOk) errors.aadhaar = "Enter valid 12-digit Aadhaar number";
  if (lvl >= 2 && !panDocUrl) errors.panDoc = "Upload your PAN card image";
  if (lvl >= 2 && !aadhaarDocUrl) errors.aadhaarDoc = "Upload Aadhaar card front side";
  if (lvl >= 2 && !aadhaarDocBackUrl) errors.aadhaarDocBack = "Upload Aadhaar card back side";
  if (lvl >= 3 && !selfieUrl) errors.selfie = "Upload a selfie holding your PAN card";
  if (lvl >= 3 && !address.trim()) errors.address = "Full address is required";

  const firstError = Object.values(errors)[0] ?? null;
  const canSubmit = !firstError && !submitting;

  const submit = async () => {
    setTouched(Object.fromEntries(Object.keys(errors).map((k) => [k, true])));
    if (firstError || !level) return;
    setSubmitting(true);
    try {
      await post("/kyc/submit", {
        level,
        fullName: fullName.trim(),
        dob,
        panNumber: pan.toUpperCase(),
        aadhaarNumber: lvl >= 2 ? aadhaar.replace(/\s+/g, "") : undefined,
        panDocUrl: lvl >= 2 ? panDocUrl : undefined,
        aadhaarDocUrl: lvl >= 2 ? aadhaarDocUrl : undefined,
        aadhaarDocBackUrl: lvl >= 2 ? aadhaarDocBackUrl : undefined,
        selfieUrl: lvl >= 3 ? selfieUrl : undefined,
        address: lvl >= 3 ? address.trim() : undefined,
      });
      setGenericSuccess({
        kind: "generic", iconKind: "paid", accentColor: "emerald",
        title: "Submission Received!",
        subtitle: "We'll review your documents within 24 hours. You'll be notified of the outcome.",
        rows: [
          { label: "KYC Level", value: `Level ${level}` },
          { label: "Status", value: "Under Review" },
          { label: "ETA", value: "Within 24 hours" },
        ],
        primaryLabel: "Track Status",
      });
      reset();
      onSuccess();
    } catch (e: any) {
      const msg = e instanceof ApiError ? (e.data?.error || e.message) : e?.message;
      toast.error(msg || "Submission failed — please try again");
      setSubmitting(false);
    }
  };

  const fieldError = (key: string) => touched[key] && errors[key] ? (
    <p className="text-[11px] text-rose-400 flex items-center gap-1 mt-1">
      <AlertCircle className="h-3 w-3 shrink-0" /> {errors[key]}
    </p>
  ) : null;

  const levelColors: Record<number, string> = { 1: "sky", 2: "amber", 3: "emerald" };
  const levelColor = levelColors[lvl] ?? "amber";
  const meta = LEVEL_META[lvl];

  return (
    <>
      <Dialog open={level !== null} onOpenChange={(v) => { if (!v) { reset(); onOpenChange(v); } }}>
        <DialogContent className="sm:max-w-lg max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5 text-base">
              <div className={`h-8 w-8 rounded-lg bg-${levelColor}-500/20 flex items-center justify-center shrink-0`}>
                <Shield className={`h-4 w-4 text-${levelColor}-400`} />
              </div>
              <div>
                <div>Level {level} Verification</div>
                <div className="text-xs font-normal text-muted-foreground mt-0.5">{meta?.name} — {meta?.tagline}</div>
              </div>
            </DialogTitle>
            <DialogDescription className="text-xs leading-relaxed mt-1">
              {lvl === 1 && "Provide your name, date of birth, and PAN number exactly as printed on your PAN card."}
              {lvl === 2 && "Add your Aadhaar number and upload clear photos of your PAN and Aadhaar cards."}
              {lvl === 3 && "Final step — upload a selfie holding your PAN card, and enter your full residential address."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-1">
            {/* Personal Info (all levels) */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground uppercase tracking-widest font-bold">
                <UserIcon className="h-3 w-3" /> Personal Information
              </div>
              <div>
                <Label htmlFor={fieldId("fn")} className="text-xs">
                  Full Name <span className="text-rose-400">*</span>
                  <span className="text-muted-foreground font-normal ml-1">(as on PAN card)</span>
                </Label>
                <Input
                  id={fieldId("fn")}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  onBlur={() => touch("fullName")}
                  placeholder="e.g. RAHUL KUMAR SHARMA"
                  className={touched.fullName && errors.fullName ? "border-rose-500/60" : ""}
                  data-testid="input-kyc-name"
                  readOnly={!!prevApproved?.fullName && lvl > 1}
                />
                {fieldError("fullName")}
                {prevApproved?.fullName && lvl > 1 && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">Pre-filled from Level {prevApproved.level} approval</p>
                )}
              </div>
              <div>
                <Label htmlFor={fieldId("dob")} className="text-xs">Date of Birth <span className="text-rose-400">*</span></Label>
                <Input
                  id={fieldId("dob")} type="date" value={dob}
                  onChange={(e) => setDob(e.target.value)} onBlur={() => touch("dob")}
                  max={new Date(Date.now() - 18 * 365.25 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]}
                  className={touched.dob && errors.dob ? "border-rose-500/60" : ""}
                  data-testid="input-kyc-dob"
                  readOnly={!!prevApproved?.dob && lvl > 1}
                />
                {fieldError("dob")}
              </div>
              <div>
                <Label htmlFor={fieldId("pan")} className="text-xs">PAN Number <span className="text-rose-400">*</span></Label>
                <Input
                  id={fieldId("pan")} value={pan}
                  onChange={(e) => setPan(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10))}
                  onBlur={() => touch("pan")}
                  placeholder="AAAAA1111A" maxLength={10}
                  className={`font-mono uppercase tracking-widest ${touched.pan && errors.pan ? "border-rose-500/60" : panOk ? "border-emerald-500/50" : ""}`}
                  data-testid="input-kyc-pan"
                  readOnly={!!prevApproved?.panNumber && lvl > 1}
                />
                {fieldError("pan")}
                {panOk && !errors.pan && (
                  <p className="text-[11px] text-emerald-400 flex items-center gap-1 mt-1"><CheckCircle2 className="h-3 w-3" /> Valid PAN format</p>
                )}
              </div>
            </div>

            {/* Aadhaar + Docs (L2+) */}
            {lvl >= 2 && (
              <>
                <Separator />
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground uppercase tracking-widest font-bold">
                    <IdCard className="h-3 w-3" /> Aadhaar Verification
                  </div>
                  <div>
                    <Label htmlFor={fieldId("aad")} className="text-xs">Aadhaar Number <span className="text-rose-400">*</span></Label>
                    <Input
                      id={fieldId("aad")} value={aadhaar}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/\D/g, "").slice(0, 12);
                        setAadhaar(digits);
                        e.target.value = digits.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
                      }}
                      onBlur={() => touch("aadhaar")}
                      placeholder="1234 5678 9012"
                      className={`font-mono ${touched.aadhaar && errors.aadhaar ? "border-rose-500/60" : aadhaarOk ? "border-emerald-500/50" : ""}`}
                      data-testid="input-kyc-aadhaar"
                    />
                    {fieldError("aadhaar")}
                    {aadhaarOk && <p className="text-[11px] text-emerald-400 flex items-center gap-1 mt-1"><CheckCircle2 className="h-3 w-3" /> Valid Aadhaar format</p>}
                  </div>
                  <FileUploadField label="PAN Card Image" testId="upload-pan" url={panDocUrl}
                    setUrl={(u) => { setPanDocUrl(u); touch("panDoc"); }} hint="front side clearly visible" />
                  {fieldError("panDoc")}
                  <FileUploadField label="Aadhaar Card (Front)" testId="upload-aadhaar-front" url={aadhaarDocUrl}
                    setUrl={(u) => { setAadhaarDocUrl(u); touch("aadhaarDoc"); }} hint="front side clearly visible" />
                  {fieldError("aadhaarDoc")}
                  <FileUploadField label="Aadhaar Card (Back)" testId="upload-aadhaar-back" url={aadhaarDocBackUrl}
                    setUrl={(u) => { setAadhaarDocBackUrl(u); touch("aadhaarDocBack"); }} hint="back side clearly visible" />
                  {fieldError("aadhaarDocBack")}
                </div>
              </>
            )}

            {/* Selfie + Address (L3) */}
            {lvl >= 3 && (
              <>
                <Separator />
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground uppercase tracking-widest font-bold">
                    <Camera className="h-3 w-3" /> Selfie & Address
                  </div>
                  <FileUploadField label="Selfie holding PAN card" testId="upload-selfie" url={selfieUrl}
                    setUrl={(u) => { setSelfieUrl(u); touch("selfie"); }} hint="face + PAN visible in same frame" />
                  {fieldError("selfie")}
                  <div>
                    <Label htmlFor={fieldId("addr")} className="text-xs">Residential Address <span className="text-rose-400">*</span></Label>
                    <Textarea
                      id={fieldId("addr")} value={address}
                      onChange={(e) => setAddress(e.target.value)} onBlur={() => touch("address")}
                      placeholder="Door no., Street, Area, City, State — PIN code"
                      rows={3}
                      className={touched.address && errors.address ? "border-rose-500/60" : ""}
                      data-testid="input-kyc-address"
                    />
                    {fieldError("address")}
                  </div>
                </div>
              </>
            )}

            {Object.keys(touched).length > 0 && firstError && (
              <div className="rounded-lg bg-rose-500/10 border border-rose-500/30 p-3 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
                <p className="text-xs text-rose-300">{firstError}</p>
              </div>
            )}

            {/* Privacy notice */}
            <div className="rounded-lg bg-muted/20 border border-border/40 p-3 flex items-start gap-2">
              <Shield className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                Your documents are encrypted (AES-256) and used solely for identity verification. We comply with India's DPDP Act and RBI KYC norms.
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button variant="ghost" onClick={() => { reset(); onOpenChange(false); }} disabled={submitting}>Cancel</Button>
            <Button
              onClick={submit} disabled={!canSubmit}
              className="bg-gradient-to-r from-amber-500 to-orange-500 text-black hover:from-amber-400 hover:to-orange-400 font-semibold min-w-[140px]"
              data-testid="button-submit-kyc"
            >
              {submitting
                ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Submitting…</>
                : <><CheckCircle2 className="h-4 w-4 mr-1.5" /> Submit for review</>
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <SuccessModal open={genericSuccess !== null} payload={genericSuccess} onClose={() => setGenericSuccess(null)} />
    </>
  );
}
