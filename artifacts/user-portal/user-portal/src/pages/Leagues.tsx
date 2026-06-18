import { useEffect, useState } from "react";
import { Trophy, Crown, Medal, Award, Zap, Target, Users, Calendar, Sparkles, ArrowRight, DollarSign, Clock, Gift, UserCheck, RefreshCw, TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/premium/PageHeader";
import { SectionCard } from "@/components/premium/SectionCard";
import { PremiumStatCard } from "@/components/premium/PremiumStatCard";
import { StatusPill } from "@/components/premium/StatusPill";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { get } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type RewardTier = { rank: string; prize: string; extra?: string; tone?: string };

type Competition = {
  id: number;
  title: string;
  subtitle: string;
  description: string;
  status: string;
  startsAt: string | null;
  endsAt: string | null;
  prizePool: string;
  prizeUnit: string;
  topPrize: string;
  joinUrl: string;
  rewardTiers: RewardTier[];
  scoringRule: string;
};

type LeaderRow = {
  rank: number;
  userId: number;
  name: string;
  uid: string;
  volume: string;
  trades: number;
  prize: string;
};

type MyRank = { rank: number; volume: string; trades: number; prize: string };

const DEFAULT_TIERS: RewardTier[] = [
  { rank: "1",    prize: "500 USDT", extra: "+ Diamond Badge",   tone: "amber"   },
  { rank: "2",    prize: "200 USDT", extra: "+ Gold Badge",      tone: "zinc"    },
  { rank: "3",    prize: "100 USDT", extra: "+ Silver Badge",    tone: "orange"  },
  { rank: "4-10", prize: "20 USDT",  extra: "+ Bronze Badge",    tone: "orange"  },
  { rank: "11-25",prize: "4 USDT",   extra: "+ Participant NFT", tone: "emerald" },
];

function fmtDate(iso?: string | null): string {
  if (!iso) return "";
  try { return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" }); }
  catch { return ""; }
}

function durationDays(s?: string | null, e?: string | null): string {
  if (!s || !e) return "30 Days";
  try {
    const days = Math.max(1, Math.round((new Date(e).getTime() - new Date(s).getTime()) / 86_400_000));
    return `${days} Days`;
  } catch { return "30 Days"; }
}

function fmtVolume(v: string): string {
  const n = parseFloat(v);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M USDT`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K USDT`;
  return `${n.toFixed(2)} USDT`;
}

export default function LeaguesPage() {
  const { user } = useAuth();
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [selected, setSelected]         = useState<Competition | null>(null);
  const [leaderboard, setLeaderboard]   = useState<LeaderRow[]>([]);
  const [myRank, setMyRank]             = useState<MyRank | null>(null);
  const [loading, setLoading]           = useState(true);
  const [lbLoading, setLbLoading]       = useState(false);

  useEffect(() => {
    get<Competition[]>("/leagues")
      .then((data) => {
        if (!Array.isArray(data) || !data.length) return;
        setCompetitions(data);
        const live = data.find((c) => c.status === "active")
          ?? data.find((c) => c.status === "upcoming")
          ?? data[0];
        setSelected(live ?? null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selected) return;
    setLbLoading(true);
    get<{ competition: unknown; leaderboard: LeaderRow[] }>(`/leagues/${selected.id}/leaderboard`)
      .then((d) => setLeaderboard(d.leaderboard ?? []))
      .catch(() => setLeaderboard([]))
      .finally(() => setLbLoading(false));

    if (user) {
      get<MyRank>(`/leagues/${selected.id}/my-rank`)
        .then((d) => setMyRank(d))
        .catch(() => setMyRank(null));
    }
  }, [selected, user]);

  const comp = selected;
  const heroTitle       = comp?.title       ?? "Zebvix Trading Champions";
  const heroTagline     = comp?.subtitle    ?? "Season 1 · June 2026";
  const heroDescription = comp?.description ?? "A 30-day competition for India's top traders. The highest trading volume across Spot, Futures, and Convert wins a share of the ₹20,00,000 prize pool. Open to all KYC Level 2+ users.";
  const prizePool       = comp?.prizePool && Number(comp.prizePool) > 0
    ? `${Number(comp.prizePool).toLocaleString("en-IN")} ${comp.prizeUnit || "USDT"}`
    : "₹20,00,000";
  const duration  = durationDays(comp?.startsAt, comp?.endsAt);
  const dateRange = comp?.startsAt && comp?.endsAt
    ? `${fmtDate(comp.startsAt)} → ${fmtDate(comp.endsAt)}`
    : "Jun 1 → Jun 30";
  const tiers    = comp?.rewardTiers?.length ? comp.rewardTiers : DEFAULT_TIERS;
  const topPrize = comp?.topPrize && Number(comp.topPrize) > 0
    ? `${Number(comp.topPrize).toLocaleString()} ${comp.prizeUnit || "USDT"}`
    : tiers[0]?.prize ?? "500 USDT";
  const statusLabel = comp?.status === "active"   ? "Live now"
    : comp?.status === "upcoming" ? "Starting soon"
    : comp?.status === "finished" ? "Season ended"
    : "Live now";

  const displayLeaderboard = leaderboard.length > 0 ? leaderboard : [];

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <PageHeader
        eyebrow="Compete"
        title="Trading Leagues"
        description="Climb the leaderboard, beat the competition, win crypto rewards every month."
        actions={
          <StatusPill status={comp?.status === "active" ? "active" : "pending"} variant="gold">
            {statusLabel}
          </StatusPill>
        }
      />

      {/* Season tabs */}
      {competitions.length > 1 && (
        <div className="flex gap-2 mb-4 flex-wrap">
          {competitions.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelected(c)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                selected?.id === c.id
                  ? "bg-amber-500/20 border-amber-500/50 text-amber-400"
                  : "border-border text-muted-foreground hover:border-amber-500/30 hover:text-amber-400"
              }`}
            >
              {c.subtitle || c.title}
            </button>
          ))}
        </div>
      )}

      {/* Hero CTA */}
      <SectionCard className="p-6 sm:p-8 mb-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-transparent pointer-events-none" />
        <div className="relative grid grid-cols-1 md:grid-cols-[1fr_auto] gap-6 items-center">
          <div>
            <Badge className="mb-3 bg-amber-500/15 text-amber-400 border-amber-500/30">
              <Sparkles className="h-3 w-3 mr-1" /> {heroTagline}
            </Badge>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">{heroTitle}</h2>
            <p className="text-sm text-muted-foreground mt-2 max-w-xl leading-relaxed">{heroDescription}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {comp?.joinUrl ? (
                <Button asChild className="bg-gradient-to-r from-amber-500 to-orange-500 text-black hover:from-amber-400 hover:to-orange-400 font-semibold">
                  <a href={comp.joinUrl} target={/^https?:\/\//.test(comp.joinUrl) ? "_blank" : undefined} rel="noreferrer noopener">
                    <Trophy className="h-4 w-4 mr-1.5" /> {comp.status === "active" ? "Join Now" : "Join Waitlist"}
                  </a>
                </Button>
              ) : (
                <Button asChild className="bg-gradient-to-r from-amber-500 to-orange-500 text-black hover:from-amber-400 hover:to-orange-400 font-semibold">
                  <Link href="/trade">
                    <Trophy className="h-4 w-4 mr-1.5" /> Start Trading
                  </Link>
                </Button>
              )}
              <Button variant="outline" asChild>
                <Link href="/markets">Markets <ArrowRight className="h-4 w-4 ml-1.5" /></Link>
              </Button>
            </div>
          </div>
          <div className="hidden md:flex items-center justify-center">
            <div className="relative h-32 w-32 rounded-full bg-gradient-to-br from-amber-400 via-amber-500 to-orange-600 flex items-center justify-center shadow-2xl shadow-amber-500/30">
              <Trophy className="h-16 w-16 text-black" strokeWidth={2} />
              {comp?.status === "active" && (
                <span className="absolute -top-1 -right-1 inline-flex h-7 w-7 rounded-full bg-rose-500 text-white text-[10px] font-bold items-center justify-center ring-2 ring-card">
                  LIVE
                </span>
              )}
            </div>
          </div>
        </div>
      </SectionCard>

      {/* My Rank Banner (logged in users) */}
      {user && myRank && (
        <SectionCard className="p-4 mb-4 border-amber-500/30 bg-amber-500/5">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <Crown className="h-6 w-6 text-amber-400" />
              <div>
                <p className="text-xs text-muted-foreground">Your Current Rank</p>
                <p className="text-xl font-bold text-amber-400">#{myRank.rank}</p>
              </div>
              <div className="border-l border-border pl-3">
                <p className="text-xs text-muted-foreground">Volume</p>
                <p className="font-mono font-semibold">{fmtVolume(myRank.volume)}</p>
              </div>
              <div className="border-l border-border pl-3">
                <p className="text-xs text-muted-foreground">Trades</p>
                <p className="font-mono font-semibold">{myRank.trades}</p>
              </div>
              {myRank.prize && (
                <div className="border-l border-border pl-3">
                  <p className="text-xs text-muted-foreground">Est. Prize</p>
                  <p className="font-mono font-semibold text-amber-400">{myRank.prize}</p>
                </div>
              )}
            </div>
            <Button asChild size="sm" className="bg-amber-500 text-black hover:bg-amber-400 font-semibold">
              <Link href="/trade"><TrendingUp className="h-4 w-4 mr-1.5" /> Trade More</Link>
            </Button>
          </div>
        </SectionCard>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <PremiumStatCard title="Prize Pool"  value={prizePool}    icon={DollarSign} hint="USDT rewards"    accent />
        <PremiumStatCard title="Duration"    value={duration}     icon={Clock}      hint={dateRange} />
        <PremiumStatCard title="Top Prize"   value={topPrize}     icon={Gift}       hint="Rank #1 winner"  accent />
        <PremiumStatCard title="Traders"     value={leaderboard.length ? `${leaderboard.length}+` : "Open"} icon={UserCheck} hint="Active participants" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Leaderboard */}
        <SectionCard className="lg:col-span-2 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold flex items-center gap-2">
              <Crown className="h-5 w-5 text-amber-400" />
              {comp?.status === "active" ? "Live Leaderboard" : "Leaderboard"}
            </h3>
            {lbLoading
              ? <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
              : comp?.status === "active"
              ? <Badge variant="outline" className="text-[10px] uppercase text-emerald-400 border-emerald-500/30">Live</Badge>
              : <Badge variant="outline" className="text-[10px] uppercase">Preview</Badge>
            }
          </div>

          {displayLeaderboard.length > 0 ? (
            <div className="overflow-x-auto -mx-2">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="text-left py-2 px-2 font-medium w-12">#</th>
                    <th className="text-left py-2 px-2 font-medium">Trader</th>
                    <th className="text-right py-2 px-2 font-medium hidden sm:table-cell">Volume</th>
                    <th className="text-right py-2 px-2 font-medium hidden sm:table-cell">Trades</th>
                    <th className="text-right py-2 px-2 font-medium">Prize</th>
                  </tr>
                </thead>
                <tbody>
                  {displayLeaderboard.slice(0, 10).map((r) => (
                    <tr key={r.rank} className="border-t border-border hover:bg-muted/30 transition-colors">
                      <td className="py-2.5 px-2"><RankBadge rank={r.rank} /></td>
                      <td className="py-2.5 px-2 font-medium">{r.name}</td>
                      <td className="py-2.5 px-2 text-right font-mono text-muted-foreground hidden sm:table-cell">{fmtVolume(r.volume)}</td>
                      <td className="py-2.5 px-2 text-right font-mono text-muted-foreground hidden sm:table-cell">{r.trades}</td>
                      <td className="py-2.5 px-2 text-right font-mono text-amber-400 font-semibold">{r.prize || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-10 text-center text-muted-foreground">
              <Trophy className="h-10 w-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm">No trades yet — be the first to climb the board!</p>
              <Button asChild size="sm" className="mt-4 bg-amber-500 text-black hover:bg-amber-400">
                <Link href="/trade">Start Trading</Link>
              </Button>
            </div>
          )}

          {displayLeaderboard.length > 0 && (
            <p className="text-[11px] text-muted-foreground mt-3">
              ⓘ Ranked by trading volume. Leaderboard refreshes every 30 minutes. Trader names masked for privacy.
            </p>
          )}
        </SectionCard>

        {/* How it Works */}
        <SectionCard className="p-5 space-y-4">
          <h3 className="font-semibold flex items-center gap-2">
            <Target className="h-5 w-5 text-amber-400" /> How it Works
          </h3>
          <Step icon={Users}     title="Complete KYC"      desc="Verify your identity to become eligible for prizes." />
          <Step icon={Zap}       title="Trade Actively"    desc="Spot, Futures & Convert — all volumes count toward your rank." />
          <Step icon={Calendar}  title="Monthly Seasons"   desc="Each season runs for 30 days with a fresh leaderboard." />
          <Step icon={Award}     title="Claim Prizes"      desc="Top 100 traders receive USDT prizes directly to their wallet." />

          {/* Scoring info */}
          {comp && (
            <div className="pt-2 border-t border-border">
              <p className="text-xs text-muted-foreground">
                <span className="text-foreground font-medium">Scoring: </span>
                {comp.scoringRule === "roi"    ? "Return on Investment (ROI %)" :
                 comp.scoringRule === "volume" ? "Total Trading Volume (USDT)"  :
                 comp.scoringRule === "pnl"    ? "Net Realized P&L (USDT)"      :
                 "Trading Volume"}
              </p>
            </div>
          )}
        </SectionCard>
      </div>

      {/* Reward Tiers */}
      <SectionCard className="p-5 mt-4">
        <h3 className="font-semibold flex items-center gap-2 mb-4">
          <Trophy className="h-5 w-5 text-amber-400" /> Reward Tiers
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {tiers.map((t, i) => (
            <RewardTierCard key={i} rank={t.rank} prize={t.prize} extra={t.extra ?? ""} tone={t.tone ?? "amber"} />
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground mt-4">
          * Prizes distributed within 7 days of season end. Must be KYC Level 2+ to claim. TDS applicable per Section 194S.
        </p>
      </SectionCard>
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  const base = "inline-flex h-7 w-7 rounded-full font-bold text-xs items-center justify-center";
  if (rank === 1) return <span className={`${base} bg-amber-500/20 text-amber-400`}>🥇</span>;
  if (rank === 2) return <span className={`${base} bg-zinc-400/20 text-foreground/80`}>🥈</span>;
  if (rank === 3) return <span className={`${base} bg-orange-500/20 text-orange-400`}>🥉</span>;
  return <span className={`${base} bg-muted text-muted-foreground`}>{rank}</span>;
}

function Step({ icon: Icon, title, desc }: { icon: typeof Target; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="h-8 w-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
        <Icon className="h-4 w-4 text-amber-400" />
      </div>
      <div className="min-w-0">
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-xs text-muted-foreground leading-relaxed">{desc}</div>
      </div>
    </div>
  );
}

function RewardTierCard({ rank, prize, extra, tone }: { rank: string; prize: string; extra: string; tone: string }) {
  const bg = tone === "amber"   ? "from-amber-500/15 to-amber-500/5 border-amber-500/30"
           : tone === "zinc"    ? "from-zinc-400/15 to-zinc-400/5 border-zinc-400/30"
           : tone === "orange"  ? "from-orange-500/15 to-orange-500/5 border-orange-500/30"
           : "from-emerald-500/15 to-emerald-500/5 border-emerald-500/30";
  const rankLabel = rank === "1" ? "🥇 Rank 1"
    : rank.includes("-") ? `🏅 Rank ${rank}`
    : `🏅 Rank ${rank}`;
  return (
    <div className={`rounded-lg border bg-gradient-to-br ${bg} p-4`}>
      <div className="text-xs text-muted-foreground">{rankLabel}</div>
      <div className="text-lg font-bold font-mono mt-1">{prize}</div>
      {extra && (
        <div className="text-[11px] text-muted-foreground mt-1 inline-flex items-center gap-1">
          <Medal className="h-3 w-3" /> {extra}
        </div>
      )}
    </div>
  );
}
