import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { get } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Users, Gift, Copy, Share2, TrendingUp, DollarSign,
  Check, Award, ChevronDown, ChevronUp,
} from "lucide-react";
import { PageHeader } from "@/components/premium/PageHeader";
import { PremiumStatCard } from "@/components/premium/PremiumStatCard";
import { SectionCard } from "@/components/premium/SectionCard";
import { EmptyState } from "@/components/premium/EmptyState";
import { StatusPill } from "@/components/premium/StatusPill";

interface LevelStat {
  level: number;
  referralCount: number;
  regBonus: number;
  aiBonus: number;
  tradingFeeBonus: number;
  earnBonus: number;
  total: number;
}

interface CommissionRate {
  level: number;
  regBonus: string;
  aiPercent: string;
  tradingFeePercent: string;
  earnPercent: string;
}

interface RecentReferral {
  id: number;
  level: number;
  bonusAmount: string | null;
  bonusCredited: boolean;
  sourceType: string;
  createdAt: string;
}

interface ReferralData {
  referralCode: string;
  referralLink: string;
  welcomeBonus: string;
  totalReferrals: number;
  totalBonusUsdt: number;
  levels: LevelStat[];
  commissionRates: CommissionRate[];
  recentReferrals: RecentReferral[];
}

const SOURCE_LABELS: Record<string, string> = {
  registration: "Signup Bonus",
  ai_trading:   "AI Trading",
  trading_fee:  "Trading Fee",
  earn_plan:    "Earn Plan",
};

export default function Referrals() {
  const { user } = useAuth();
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const [showAll, setShowAll] = useState(false);

  const dataQ = useQuery<ReferralData>({
    queryKey: ["/referrals"],
    queryFn: () => get<ReferralData>("/referrals"),
    enabled: !!user,
  });

  const copyText = (text: string, kind: "code" | "link") => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(kind);
      setTimeout(() => setCopied(null), 2000);
      toast.success(kind === "code" ? "Referral code copied!" : "Referral link copied!");
    }).catch(() => toast.error("Copy failed — please copy manually"));
  };

  if (!user) {
    return (
      <div className="container mx-auto max-w-4xl p-4 sm:p-6">
        <EmptyState
          icon={Gift}
          title="Invite & Earn"
          description="Sign in to access your referral program and start earning commissions."
          action={<Button onClick={() => (window.location.href = "/login")}>Sign In</Button>}
        />
      </div>
    );
  }

  const data = dataQ.data;
  const shownLevels = showAll ? data?.levels ?? [] : (data?.levels ?? []).slice(0, 3);

  return (
    <div className="container mx-auto max-w-4xl p-4 sm:p-6 space-y-5">
      <PageHeader
        eyebrow="Grow Together"
        title="Referral Program"
        description="Earn up to 5 levels of commissions on every referral — for trading fees, AI bots, and more."
      />

      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <PremiumStatCard
          hero
          title="Total Referrals"
          value={data?.totalReferrals ?? 0}
          icon={Users}
          loading={dataQ.isLoading}
          hint="All levels combined"
        />
        <PremiumStatCard
          title="Total Earned"
          value={data ? `${data.totalBonusUsdt.toFixed(4)} USDT` : "—"}
          icon={DollarSign}
          loading={dataQ.isLoading}
          hint="USDT lifetime earnings"
        />
        <PremiumStatCard
          title="Commission Levels"
          value="5 Levels"
          icon={Award}
          loading={dataQ.isLoading}
          hint="Multi-tier rewards"
        />
      </div>

      {/* Welcome bonus banner */}
      {data && (
        <div className="flex items-center gap-3 p-4 rounded-xl border border-amber-500/30 bg-amber-500/5">
          <Gift className="h-8 w-8 text-amber-400 shrink-0" />
          <div>
            <div className="font-semibold text-amber-400">Welcome Bonus: {data.welcomeBonus} USDT</div>
            <div className="text-sm text-muted-foreground">Each friend who joins gets a bonus — and so do you!</div>
          </div>
        </div>
      )}

      {/* Referral code + link */}
      {data && (
        <SectionCard title="Your Referral Details" icon={Share2}>
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Referral Code</div>
              <div className="flex gap-2">
                <div className="flex-1 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 font-mono font-bold tracking-widest text-lg text-amber-400">
                  {data.referralCode}
                </div>
                <Button
                  size="icon"
                  variant="outline"
                  className="shrink-0"
                  onClick={() => copyText(data.referralCode, "code")}
                >
                  {copied === "code" ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Referral Link</div>
              <div className="flex gap-2">
                <Input readOnly value={data.referralLink} className="text-xs font-mono" />
                <Button
                  size="icon"
                  variant="outline"
                  className="shrink-0"
                  onClick={() => copyText(data.referralLink, "link")}
                >
                  {copied === "link" ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>
        </SectionCard>
      )}

      {/* Level breakdown */}
      {data && data.levels.some(l => l.referralCount > 0 || l.total > 0) && (
        <SectionCard title="Level Breakdown" icon={TrendingUp} padded={false}>
          <div className="divide-y divide-border/40">
            {shownLevels.map(l => (
              <div key={l.level} className="flex items-center justify-between px-4 py-3 text-sm">
                <div className="flex items-center gap-2">
                  <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/30 text-xs px-2">L{l.level}</Badge>
                  <span className="text-muted-foreground">{l.referralCount} referrals</span>
                </div>
                <span className="text-emerald-400 font-medium tabular-nums">+${l.total.toFixed(4)}</span>
              </div>
            ))}
          </div>
          {(data.levels?.length ?? 0) > 3 && (
            <div className="px-4 pb-3">
              <button
                onClick={() => setShowAll(!showAll)}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 pt-1"
              >
                {showAll
                  ? <><ChevronUp className="w-3 h-3" /> Show less</>
                  : <><ChevronDown className="w-3 h-3" /> Show all levels</>
                }
              </button>
            </div>
          )}
        </SectionCard>
      )}

      {/* Commission rates table */}
      {data && (
        <SectionCard title="Commission Structure" icon={Award} padded={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/40">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Level</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Signup</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">AI Bot</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Trading</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Earn</th>
                </tr>
              </thead>
              <tbody>
                {data.commissionRates.map(r => (
                  <tr key={r.level} className="border-b border-border/40 last:border-0">
                    <td className="px-4 py-3">
                      <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/30 text-xs">L{r.level}</Badge>
                    </td>
                    <td className="text-right px-4 py-3 text-emerald-400 tabular-nums">{r.regBonus}</td>
                    <td className="text-right px-4 py-3 text-blue-400 tabular-nums">{r.aiPercent}</td>
                    <td className="text-right px-4 py-3 text-purple-400 tabular-nums">{r.tradingFeePercent}</td>
                    <td className="text-right px-4 py-3 text-orange-400 tabular-nums">{r.earnPercent}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {/* Recent referrals */}
      {data && data.recentReferrals.length > 0 && (
        <SectionCard title="Recent Earnings" icon={DollarSign} padded={false}>
          <div className="divide-y divide-border/40">
            {data.recentReferrals.map(r => (
              <div key={r.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <div>
                  <div className="font-medium">{SOURCE_LABELS[r.sourceType] ?? r.sourceType}</div>
                  <div className="text-xs text-muted-foreground">
                    Level {r.level} · {new Date(r.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <div className="text-right flex items-center gap-2">
                  <div className="text-emerald-400 font-medium tabular-nums">
                    +${parseFloat(r.bonusAmount ?? "0").toFixed(4)}
                  </div>
                  <StatusPill variant={r.bonusCredited ? "success" : "neutral"}>
                    {r.bonusCredited ? "Credited" : "Pending"}
                  </StatusPill>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {!data && !dataQ.isLoading && (
        <SectionCard title="Referrals" icon={Users}>
          <EmptyState icon={Users} title="Could not load referral data" description="Please try again in a moment." />
        </SectionCard>
      )}
    </div>
  );
}
