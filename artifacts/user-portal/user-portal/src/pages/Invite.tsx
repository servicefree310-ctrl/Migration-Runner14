import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Gift, Copy, Check, Share2, Users, Trophy, TrendingUp, Send,
  MessageCircle, Twitter, Mail, Link2, QrCode, Sparkles, ChevronRight,
  Wallet, BadgeCheck, Award, Info, ArrowRight, ExternalLink,
} from "lucide-react";
import { get } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { useAuth } from "@/lib/auth";
import { useInrRate } from "@/lib/marketSocket";
import { toast } from "sonner";

type CommissionRow = {
  id: number;
  sourceType: string;
  sourceRefId: string | null;
  bonusAmount: string;
  bonusCredited: boolean;
  level: number;
  referredId: number;
  createdAt: string;
};

type ReferralTier = {
  name: string;
  minInvites: number;
  maxInvites: number | null;
  pct: number;
};

type ReferStats = {
  referralCode: string | null;
  referredCount: number;
  referredKycCount: number;
  estimatedEarnings: number;
  creditedEarnings: number;
  commissionPct: number;
  tiers: ReferralTier[];
  currentTierName: string;
  recent: Array<{ id: number; name: string; kycLevel: number; createdAt: string }>;
  commissions: CommissionRow[];
};

function timeAgo(iso: string): string {
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60) return "just now";
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  if (sec < 2592000) return `${Math.floor(sec / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function Invite() {
  const { user } = useAuth();
  const inrRate = useInrRate();
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);

  const referQ = useQuery<ReferStats>({
    queryKey: ["/refer/stats"],
    queryFn: () => get<ReferStats>("/refer/stats"),
    enabled: !!user,
  });

  const code = referQ.data?.referralCode ?? user?.referralCode ?? "—";
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const inviteUrl = useMemo(() => `${origin}/user/signup?ref=${encodeURIComponent(code)}`, [origin, code]);
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=8&color=0a0a0a&bgcolor=ffffff&data=${encodeURIComponent(inviteUrl)}`;

  const shareTitle = "Join me on Zebvix Exchange";
  const shareText = `Trade Bitcoin, Ethereum & 100+ coins on Zebvix Exchange. Use my referral code ${code} to get bonus rewards on signup!`;

  const totalInvites   = referQ.data?.referredCount ?? 0;
  const kycInvites     = referQ.data?.referredKycCount ?? 0;
  const earningsUsdt   = referQ.data?.estimatedEarnings ?? 0;
  const creditedUsdt   = referQ.data?.creditedEarnings ?? 0;
  const commissionPct  = referQ.data?.commissionPct ?? 30;
  const liveTiers      = referQ.data?.tiers ?? [
    { name: "Bronze", minInvites: 0,  maxInvites: 9,    pct: 30 },
    { name: "Silver", minInvites: 10, maxInvites: 49,   pct: 32 },
    { name: "Gold",   minInvites: 50, maxInvites: null, pct: 35 },
  ];
  const currentTierName = referQ.data?.currentTierName ?? liveTiers[0].name;
  const conversionRate = totalInvites > 0 ? Math.round((kycInvites / totalInvites) * 100) : 0;
  const earningsInr    = inrRate > 0 ? earningsUsdt * inrRate : null;

  function copy(text: string, kind: "code" | "link") {
    navigator.clipboard.writeText(text).then(() => {
      if (kind === "code") { setCopiedCode(true); setTimeout(() => setCopiedCode(false), 2000); }
      else { setCopiedLink(true); setTimeout(() => setCopiedLink(false), 2000); }
      toast.success(kind === "code" ? "Code copied" : "Invite link copied");
    }).catch(() => toast.error("Copy failed"));
  }

  function shareNative() {
    if (typeof navigator !== "undefined" && (navigator as any).share) {
      (navigator as any).share({ title: shareTitle, text: shareText, url: inviteUrl }).catch(() => {});
    } else {
      copy(inviteUrl, "link");
    }
  }

  const shareLinks = {
    whatsapp: `https://wa.me/?text=${encodeURIComponent(`${shareText}\n\n${inviteUrl}`)}`,
    telegram: `https://t.me/share/url?url=${encodeURIComponent(inviteUrl)}&text=${encodeURIComponent(shareText)}`,
    twitter: `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(inviteUrl)}`,
    email: `mailto:?subject=${encodeURIComponent(shareTitle)}&body=${encodeURIComponent(`${shareText}\n\n${inviteUrl}`)}`,
  };

  return (
    <div className="min-h-screen pb-12">
      <div className="max-w-6xl mx-auto px-4 md:px-6 pt-6">
        {/* ──────── Hero Banner (full-bleed image) ──────── */}
        <Card className="relative overflow-hidden border-amber-500/30 rounded-2xl" data-testid="hero-banner">
          {/* Background image */}
          <div className="relative w-full aspect-[16/9] md:aspect-[21/7] min-h-[260px] md:min-h-[320px]">
            <img
              src={`${import.meta.env.BASE_URL}invite-banner.png`}
              alt="Zebvix Affiliate Program — earn lifetime commission on every friend's trade"
              className="absolute inset-0 w-full h-full object-cover object-center"
              data-testid="img-banner"
            />
            {/* Left-side gradient overlay so text always reads */}
            <div className="absolute inset-0 bg-gradient-to-r from-black via-black/75 to-black/10" />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />

            {/* Headline overlay */}
            <div className="absolute inset-0 flex items-center">
              <div className="px-5 md:px-10 max-w-2xl">
                <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/40 mb-3 backdrop-blur-sm" data-testid="badge-program">
                  <Sparkles className="h-3 w-3 mr-1" /> Affiliate Program
                </Badge>
                <h1 className="text-2xl md:text-4xl font-bold leading-tight tracking-tight text-white drop-shadow-2xl">
                  Earn <span className="bg-gradient-to-r from-amber-300 via-amber-400 to-orange-400 bg-clip-text text-transparent">{commissionPct}% commission</span><br />
                  on every friend's trade
                </h1>
                <p className="mt-3 text-sm md:text-base text-zinc-200/90 max-w-lg drop-shadow-md">
                  Invite friends to Zebvix Exchange and earn <b className="text-amber-300">lifetime</b> commission on the trading fees they pay. Paid out instantly to your wallet.
                </p>
                <div className="flex flex-wrap gap-2 mt-4 text-xs">
                  <Badge variant="outline" className="bg-black/40 backdrop-blur-sm border-emerald-400/40 text-emerald-300"><Check className="h-3 w-3 mr-1" /> Lifetime payouts</Badge>
                  <Badge variant="outline" className="bg-black/40 backdrop-blur-sm border-sky-400/40 text-sky-300"><Check className="h-3 w-3 mr-1" /> Instant settlement</Badge>
                  <Badge variant="outline" className="bg-black/40 backdrop-blur-sm border-amber-400/40 text-amber-300"><Check className="h-3 w-3 mr-1" /> No invite cap</Badge>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* ──────── Code / Link / Share card (full-width, below banner) ──────── */}
        <Card className="bg-card border-amber-500/30 p-5 md:p-6 mt-4 -translate-y-2 md:-translate-y-6 shadow-2xl shadow-amber-500/5 relative z-10">
          <div className="grid lg:grid-cols-2 gap-5">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">Your referral code</div>
              <div className="flex items-stretch gap-2">
                <div className="flex-1 flex items-center justify-center px-3 py-4 rounded-lg bg-gradient-to-r from-amber-500/15 to-orange-500/15 border border-amber-500/30 font-mono text-2xl md:text-3xl font-bold tracking-[0.3em]" data-testid="text-referral-code">
                  {code}
                </div>
                <Button
                  size="lg"
                  className="bg-gradient-to-r from-amber-500 to-orange-500 text-black hover:from-amber-400 hover:to-orange-400 font-semibold px-5"
                  onClick={() => copy(code, "code")}
                  data-testid="button-copy-code"
                >
                  {copiedCode ? <Check className="h-5 w-5" /> : <Copy className="h-5 w-5" />}
                </Button>
              </div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground mt-4 mb-1.5">Invite link</div>
              <div className="flex items-stretch gap-2">
                <Input readOnly value={inviteUrl} className="font-mono text-xs bg-card border-border h-11" data-testid="input-invite-link" />
                <Button variant="outline" size="icon" className="h-11 w-11" onClick={() => copy(inviteUrl, "link")} data-testid="button-copy-link">
                  {copiedLink ? <Check className="h-4 w-4 text-emerald-400" /> : <Link2 className="h-4 w-4" />}
                </Button>
                <Button variant="outline" size="icon" className="h-11 w-11" onClick={() => setQrOpen(true)} data-testid="button-show-qr" title="Show QR code">
                  <QrCode className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Share row */}
            <div className="lg:border-l lg:border-border lg:pl-5">
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Share with friends</div>
              <div className="grid grid-cols-5 gap-2">
                <ShareBtn href={shareLinks.whatsapp} label="WhatsApp" color="emerald" testId="share-whatsapp">
                  <MessageCircle className="h-5 w-5" />
                </ShareBtn>
                <ShareBtn href={shareLinks.telegram} label="Telegram" color="sky" testId="share-telegram">
                  <Send className="h-5 w-5" />
                </ShareBtn>
                <ShareBtn href={shareLinks.twitter} label="X / Twitter" color="zinc" testId="share-twitter">
                  <Twitter className="h-5 w-5" />
                </ShareBtn>
                <ShareBtn href={shareLinks.email} label="Email" color="rose" testId="share-email">
                  <Mail className="h-5 w-5" />
                </ShareBtn>
                <button
                  onClick={shareNative}
                  className="flex flex-col items-center justify-center gap-1 px-2 py-3 rounded-lg border border-border hover:bg-amber-500/10 hover:border-amber-500/30 text-amber-400 transition-colors"
                  data-testid="share-more"
                >
                  <Share2 className="h-5 w-5" />
                  <span className="text-[9px] font-medium">More</span>
                </button>
              </div>
              <div className="mt-3 text-[11px] text-muted-foreground flex items-center gap-1.5">
                <Info className="h-3 w-3 text-amber-400" />
                Friends who sign up with your link earn you commission for life.
              </div>
            </div>
          </div>
        </Card>

        {/* ──────── Stats Strip ──────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
          <StatCard
            icon={<Users className="h-5 w-5" />}
            label="Total invites"
            value={String(totalInvites)}
            sub={`${kycInvites} KYC verified`}
            color="sky"
            testId="stat-invites"
          />
          <StatCard
            icon={<BadgeCheck className="h-5 w-5" />}
            label="Conversion"
            value={`${conversionRate}%`}
            sub="Sign-up → KYC"
            color="emerald"
            testId="stat-conversion"
          />
          <StatCard
            icon={<TrendingUp className="h-5 w-5" />}
            label="Total earned"
            value={`${earningsUsdt.toFixed(4)} USDT`}
            sub={earningsInr != null ? `≈ ₹${earningsInr.toFixed(2)}` : "Lifetime commission"}
            color="amber"
            testId="stat-earned"
          />
          <StatCard
            icon={<Trophy className="h-5 w-5" />}
            label="Tier"
            value={currentTierName}
            sub={`${commissionPct}% commission`}
            color="violet"
            testId="stat-tier"
          />
        </div>

        {/* ──────── How it works ──────── */}
        <div className="mt-8">
          <div className="flex items-end justify-between mb-3">
            <h2 className="text-lg md:text-xl font-bold">How it works</h2>
            <span className="text-xs text-muted-foreground">3 simple steps</span>
          </div>
          <div className="grid md:grid-cols-3 gap-3">
            <StepCard
              n={1}
              icon={<Share2 className="h-5 w-5" />}
              title="Share your code"
              desc="Send your unique referral code or link to friends via WhatsApp, Telegram, X, or any channel you prefer."
              accent="amber"
            />
            <StepCard
              n={2}
              icon={<BadgeCheck className="h-5 w-5" />}
              title="They sign up & verify"
              desc="Your friend creates an account using your code and completes their KYC verification — that activates rewards."
              accent="sky"
            />
            <StepCard
              n={3}
              icon={<Wallet className="h-5 w-5" />}
              title="You earn forever"
              desc={`Every time they trade Spot or Futures, you earn ${commissionPct}% of the trading fee — credited instantly to your spot wallet.`}
              accent="emerald"
            />
          </div>
        </div>

        {/* ──────── Two col: tier breakdown + invitee list ──────── */}
        <div className="grid lg:grid-cols-3 gap-4 mt-8">
          <Card className="lg:col-span-1 p-5 border-border">
            <div className="flex items-center gap-2 mb-3">
              <Award className="h-4 w-4 text-amber-400" />
              <h3 className="font-bold">Commission tiers</h3>
            </div>
            <div className="space-y-2.5">
              {liveTiers.map((tier, i) => {
                const isActive = currentTierName === tier.name;
                const isLast = i === liveTiers.length - 1;
                const range = tier.maxInvites == null
                  ? `${tier.minInvites}+ invites`
                  : `${tier.minInvites}–${tier.maxInvites} invites`;
                return (
                  <TierRow
                    key={tier.name}
                    name={tier.name}
                    range={range}
                    pct={`${tier.pct}%`}
                    active={isActive}
                    color={isLast ? "amber" : "zinc"}
                    highlight={isLast}
                  />
                );
              })}
            </div>
            <Separator className="my-4" />
            <div className="space-y-2 text-xs text-muted-foreground">
              <div className="flex items-start gap-2">
                <Info className="h-3.5 w-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
                <span>Commissions are paid from <b>trading fees only</b>, not from your friend's principal. They lose nothing — you both win.</span>
              </div>
              <div className="flex items-start gap-2">
                <Info className="h-3.5 w-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
                <span>Tier is auto-upgraded as soon as you cross the invite threshold (KYC-verified invitees count).</span>
              </div>
            </div>
          </Card>

          {/* Invitee list */}
          <Card className="lg:col-span-2 p-5 border-border">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-sky-400" />
                <h3 className="font-bold">Your invitees</h3>
              </div>
              <span className="text-xs text-muted-foreground" data-testid="text-invitees-count">
                {totalInvites} total
              </span>
            </div>
            {referQ.isLoading ? (
              <div className="text-xs text-muted-foreground py-6 text-center">Loading…</div>
            ) : (referQ.data?.recent ?? []).length === 0 ? (
              <div className="py-10 text-center" data-testid="empty-invitees">
                <div className="mx-auto w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mb-3">
                  <Gift className="h-6 w-6 text-amber-400" />
                </div>
                <div className="font-semibold">No invites yet</div>
                <div className="text-xs text-muted-foreground mt-1">Share your code above to start earning lifetime commissions.</div>
                <Button
                  size="sm"
                  className="mt-4 bg-gradient-to-r from-amber-500 to-orange-500 text-black hover:from-amber-400 hover:to-orange-400 font-semibold"
                  onClick={shareNative}
                  data-testid="button-share-empty"
                >
                  <Share2 className="h-3.5 w-3.5 mr-1.5" /> Share invite link
                </Button>
              </div>
            ) : (
              <div className="overflow-hidden rounded-lg border border-border/60">
                <table className="w-full text-sm">
                  <thead className="bg-card/60">
                    <tr className="text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 py-2 font-medium">Friend</th>
                      <th className="px-3 py-2 font-medium">KYC</th>
                      <th className="px-3 py-2 font-medium">Joined</th>
                      <th className="px-3 py-2 font-medium text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(referQ.data?.recent ?? []).map((u) => (
                      <tr key={u.id} className="border-t border-border/60 hover:bg-card/40" data-testid={`row-invitee-${u.id}`}>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="h-7 w-7 rounded-full bg-gradient-to-br from-amber-500 to-orange-500 text-black text-xs font-bold flex items-center justify-center">
                              {(u.name || "U").charAt(0).toUpperCase()}
                            </div>
                            <span className="font-medium">{u.name || "Anonymous"}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <Badge variant="outline" className={`text-[10px] ${u.kycLevel >= 1 ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-300" : "border-border text-muted-foreground"}`}>
                            L{u.kycLevel}
                          </Badge>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground">{timeAgo(u.createdAt)}</td>
                        <td className="px-3 py-2.5 text-right">
                          {u.kycLevel >= 1 ? (
                            <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border-emerald-500/30 text-[10px]">Earning</Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-600 dark:text-amber-300">Pending KYC</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        {/* ──────── Commission History ──────── */}
        <div className="mt-6">
          <div className="flex items-end justify-between mb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-amber-400" />
              <h2 className="text-lg font-bold">Commission history</h2>
            </div>
            <span className="text-xs text-muted-foreground">
              {(referQ.data?.commissions ?? []).length} events
            </span>
          </div>
          <Card className="border-border overflow-hidden">
            {referQ.isLoading ? (
              <div className="text-xs text-muted-foreground py-8 text-center">Loading…</div>
            ) : (referQ.data?.commissions ?? []).length === 0 ? (
              <div className="py-10 text-center">
                <div className="mx-auto w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mb-3">
                  <TrendingUp className="h-6 w-6 text-amber-400" />
                </div>
                <div className="font-semibold">No commissions yet</div>
                <div className="text-xs text-muted-foreground mt-1">
                  Commissions appear here once your invitees trade, use AI plans, or earn interest.
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-card/60">
                    <tr className="text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 py-2.5 font-medium">Source</th>
                      <th className="px-3 py-2.5 font-medium">Ref</th>
                      <th className="px-3 py-2.5 font-medium">Level</th>
                      <th className="px-3 py-2.5 font-medium text-right">Amount (USDT)</th>
                      <th className="px-3 py-2.5 font-medium text-right">Status</th>
                      <th className="px-3 py-2.5 font-medium text-right">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(referQ.data?.commissions ?? []).map((c) => {
                      const sourceLabel: Record<string, { label: string; color: string }> = {
                        trading_fee: { label: "Spot Trade", color: "bg-sky-500/15 text-sky-600 dark:text-sky-300 border-sky-500/30" },
                        futures_fee: { label: "Futures",    color: "bg-violet-500/15 text-violet-600 dark:text-violet-300 border-violet-500/30" },
                        ai_trading:  { label: "AI Trade",   color: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border-emerald-500/30" },
                        earn_plan:   { label: "Earn",       color: "bg-amber-500/15 text-amber-600 dark:text-amber-300 border-amber-500/30" },
                      };
                      const src = sourceLabel[c.sourceType] ?? { label: c.sourceType, color: "bg-muted text-muted-foreground border-border" };
                      return (
                        <tr key={c.id} className="border-t border-border/60 hover:bg-card/40">
                          <td className="px-3 py-2.5">
                            <Badge variant="outline" className={`text-[10px] ${src.color}`}>
                              {src.label}
                            </Badge>
                          </td>
                          <td className="px-3 py-2.5 font-mono text-[11px] text-muted-foreground">
                            {c.sourceRefId
                              ? <span title={c.sourceRefId}>{c.sourceRefId}</span>
                              : <span className="italic">—</span>}
                          </td>
                          <td className="px-3 py-2.5">
                            <span className="text-xs font-semibold text-amber-400">L{c.level}</span>
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono font-semibold text-emerald-400">
                            +{parseFloat(c.bonusAmount).toFixed(6)}
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            {c.bonusCredited ? (
                              <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border-emerald-500/30 text-[10px]">
                                Credited
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-600 dark:text-amber-300">
                                Pending
                              </Badge>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-right text-xs text-muted-foreground">
                            {timeAgo(c.createdAt)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        {/* ──────── FAQ ──────── */}
        <div className="mt-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg md:text-xl font-bold">Frequently asked</h2>
            <a
              href="https://help.zebvix.com/affiliate"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-amber-400 hover:underline flex items-center gap-1"
            >
              Full guide <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <Card className="p-2 border-border">
            <Accordion type="single" collapsible className="w-full">
              <FaqItem
                value="q1"
                q="When do I get paid?"
                a={`Commissions are credited to your spot wallet in real time, the moment your invitee's trade is executed. There's no minimum payout threshold — you keep what you earn instantly.`}
              />
              <FaqItem
                value="q2"
                q="How long do I earn from each invitee?"
                a="Forever. There's no expiry — every trade your invitee places, no matter how many years from now, generates commission for you."
              />
              <FaqItem
                value="q3"
                q="Does my friend lose anything?"
                a="No. The commission comes out of the platform's trading fee, not from your friend's principal or PnL. They trade as normal, you earn on the side."
              />
              <FaqItem
                value="q4"
                q="What if my invitee doesn't complete KYC?"
                a="They count as a 'pending' invite but don't generate commission yet. As soon as they verify KYC Level 1, they activate and start earning rewards for both of you."
              />
              <FaqItem
                value="q5"
                q="Is there a limit on how many people I can invite?"
                a="No cap. Invite 5 friends or 5,000 — your earning potential scales linearly. Top affiliates earn lakhs per month from just a few hundred active invitees."
              />
              <FaqItem
                value="q6"
                q="Can I lose my tier?"
                a="No. Once you reach Silver or Gold based on KYC-verified invites, your tier is locked in. We only count upward — never downgrade."
              />
            </Accordion>
          </Card>
        </div>

        {/* CTA strip */}
        <Card className="mt-8 p-5 md:p-6 border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-orange-500/5 to-transparent">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="font-bold text-lg">Ready to start earning?</div>
              <div className="text-xs text-muted-foreground mt-0.5">Share your code in 30 seconds — earn for life.</div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setQrOpen(true)}
                data-testid="button-cta-qr"
              >
                <QrCode className="h-4 w-4 mr-1.5" /> Show QR
              </Button>
              <Button
                className="bg-gradient-to-r from-amber-500 to-orange-500 text-black hover:from-amber-400 hover:to-orange-400 font-semibold"
                onClick={shareNative}
                data-testid="button-cta-share"
              >
                <Share2 className="h-4 w-4 mr-1.5" /> Share now <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {/* ──────── QR Dialog ──────── */}
      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5 text-amber-400" /> Scan to join
            </DialogTitle>
            <DialogDescription>
              Have your friend scan this QR code with their phone camera to sign up with your code.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center py-3">
            <div className="rounded-2xl bg-white p-3 shadow-lg">
              {/* eslint-disable-next-line jsx-a11y/img-redundant-alt */}
              <img
                src={qrUrl}
                alt={`QR code for invite link ${inviteUrl}`}
                className="w-64 h-64"
                data-testid="img-qr"
              />
            </div>
            <div className="mt-4 text-center w-full">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Code</div>
              <div className="font-mono text-xl font-bold tracking-widest text-amber-400">{code}</div>
            </div>
            <Button
              variant="outline"
              className="mt-3 w-full"
              onClick={() => copy(inviteUrl, "link")}
              data-testid="button-qr-copy-link"
            >
              {copiedLink ? <><Check className="h-4 w-4 mr-1.5 text-emerald-400" /> Copied</> : <><Copy className="h-4 w-4 mr-1.5" /> Copy invite link</>}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─────────────────────────── helpers ──────────────────────────────────────

function ShareBtn({
  href, label, color, testId, children,
}: {
  href: string; label: string; color: "emerald" | "sky" | "zinc" | "rose"; testId: string; children: React.ReactNode;
}) {
  const colorMap: Record<string, string> = {
    emerald: "hover:bg-emerald-500/10 hover:border-emerald-500/30 text-emerald-400",
    sky: "hover:bg-sky-500/10 hover:border-sky-500/30 text-sky-400",
    zinc: "hover:bg-muted hover:border-border text-foreground",
    rose: "hover:bg-rose-500/10 hover:border-rose-500/30 text-rose-400",
  };
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`flex flex-col items-center gap-1 px-2 py-2 rounded-lg border border-border transition-colors ${colorMap[color]}`}
      data-testid={`button-${testId}`}
    >
      {children}
      <span className="text-[9px] font-medium">{label}</span>
    </a>
  );
}

function StatCard({
  icon, label, value, sub, color, testId,
}: {
  icon: React.ReactNode; label: string; value: string; sub?: string; color: "amber" | "sky" | "emerald" | "violet"; testId: string;
}) {
  const colors: Record<string, string> = {
    amber: "from-amber-500/15 to-amber-500/5 border-amber-500/20 text-amber-400",
    sky: "from-sky-500/15 to-sky-500/5 border-sky-500/20 text-sky-400",
    emerald: "from-emerald-500/15 to-emerald-500/5 border-emerald-500/20 text-emerald-400",
    violet: "from-violet-500/15 to-violet-500/5 border-violet-500/20 text-violet-400",
  };
  return (
    <Card className={`p-4 bg-gradient-to-br ${colors[color]}`} data-testid={`card-${testId}`}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        <span className="uppercase tracking-wide">{label}</span>
      </div>
      <div className="mt-1.5 text-2xl font-bold" data-testid={`text-${testId}`}>{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </Card>
  );
}

function StepCard({
  n, icon, title, desc, accent,
}: {
  n: number; icon: React.ReactNode; title: string; desc: string; accent: "amber" | "sky" | "emerald";
}) {
  const accents: Record<string, string> = {
    amber: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    sky: "bg-sky-500/15 text-sky-400 border-sky-500/30",
    emerald: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  };
  return (
    <Card className="p-5 border-border relative overflow-hidden">
      <div className="absolute top-3 right-4 text-4xl font-black text-foreground/8 select-none">{n}</div>
      <div className={`relative w-10 h-10 rounded-xl border flex items-center justify-center ${accents[accent]}`}>
        {icon}
      </div>
      <div className="relative mt-3 font-bold">{title}</div>
      <div className="relative text-xs text-muted-foreground mt-1 leading-relaxed">{desc}</div>
    </Card>
  );
}

function TierRow({
  name, range, pct, active, color, highlight,
}: {
  name: string; range: string; pct: string; active: boolean; color: "amber" | "zinc"; highlight?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between p-2.5 rounded-lg border ${active ? "border-amber-500/40 bg-amber-500/5" : "border-border/60"}`}>
      <div className="flex items-center gap-2.5">
        <div className={`h-7 w-7 rounded-md flex items-center justify-center ${highlight ? "bg-gradient-to-br from-amber-500 to-orange-500 text-black" : color === "amber" ? "bg-amber-500/15 text-amber-400" : "bg-muted text-foreground/70"}`}>
          <Award className="h-3.5 w-3.5" />
        </div>
        <div>
          <div className="text-sm font-semibold flex items-center gap-1.5">
            {name}
            {active && <Badge className="bg-amber-500 text-black text-[9px] h-4 px-1.5">CURRENT</Badge>}
          </div>
          <div className="text-[10px] text-muted-foreground">{range}</div>
        </div>
      </div>
      <div className={`text-sm font-bold ${highlight ? "text-amber-400" : "text-foreground"}`}>{pct}</div>
    </div>
  );
}

function FaqItem({ value, q, a }: { value: string; q: string; a: string }) {
  return (
    <AccordionItem value={value} className="border-border/60">
      <AccordionTrigger className="px-3 text-sm font-semibold text-left hover:text-amber-400">{q}</AccordionTrigger>
      <AccordionContent className="px-3 text-xs text-muted-foreground leading-relaxed">{a}</AccordionContent>
    </AccordionItem>
  );
}
